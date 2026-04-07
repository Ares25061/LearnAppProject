import "server-only";

import { execFile, spawn, type ChildProcess } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { getConvertibleAudioProvider } from "@/lib/media-audio";

const execFileAsync = promisify(execFile);
const AUDIO_PROBE_TIMEOUT_MS = 45_000;
const THUMBNAIL_PROBE_TIMEOUT_MS = 20_000;
const THUMBNAIL_SUCCESS_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const THUMBNAIL_FAILURE_CACHE_TTL_MS = 1000 * 30;
const require = createRequire(import.meta.url);
const ffmpegStatic = require("ffmpeg-static") as string | null;
const RUTUBE_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
const RUTUBE_REQUEST_HEADERS = {
  Accept: "application/json",
  Origin: "https://rutube.ru",
  Referer: "https://rutube.ru/",
  "User-Agent": RUTUBE_USER_AGENT,
} satisfies Record<string, string>;
const thumbnailCache = new Map<
  string,
  { expiresAt: number; thumbnailUrl: string | null }
>();

type ResolvedAudioSource = {
  cookies?: string;
  headers?: Record<string, string>;
  url: string;
};

type YtDlpResolvedAudioMetadata = {
  cookies?: string;
  http_headers?: Record<string, string>;
  requested_downloads?: Array<{
    cookies?: string;
    http_headers?: Record<string, string>;
    url?: string;
  }>;
  url?: string;
};

type YtDlpThumbnailInfo = {
  height?: number;
  url?: string;
  width?: number;
};

type YtDlpMetadata = {
  thumbnail?: string;
  thumbnails?: YtDlpThumbnailInfo[];
};

type RutubePlayOptions = {
  referer?: string;
  video_balancer?: {
    default?: string;
    m3u8?: string;
  };
};
const THUMBNAIL_HTML_HEADERS = {
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ru,en;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
} as const;

function isExecutableFile(filePath: string | null | undefined) {
  if (!filePath) {
    return false;
  }

  try {
    accessSync(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function getBundledYtDlpPath(): string {
  const fileName = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    ".media-tools",
    "bin",
    fileName,
  );
}

function getBundledFfmpegPath(): string {
  const fileName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "node_modules",
    "ffmpeg-static",
    fileName,
  );
}

function resolveYtDlpBin(): string {
  const envPath = process.env.YT_DLP_BIN?.trim();
  if (typeof envPath === "string" && isExecutableFile(envPath)) {
    return envPath;
  }

  const bundledPath = getBundledYtDlpPath();
  if (isExecutableFile(bundledPath)) {
    return bundledPath;
  }

  return "yt-dlp";
}

function resolveFfmpegBin(): string {
  const envPath = process.env.FFMPEG_BIN?.trim();
  if (typeof envPath === "string" && isExecutableFile(envPath)) {
    return envPath;
  }

  const bundledPath = getBundledFfmpegPath();
  if (isExecutableFile(bundledPath)) {
    return bundledPath;
  }

  if (typeof ffmpegStatic === "string" && isExecutableFile(ffmpegStatic)) {
    return ffmpegStatic;
  }

  return "ffmpeg";
}

function appendLogChunk(buffer: string, chunk: Buffer | string) {
  const next = `${buffer}${chunk.toString()}`;
  return next.length > 2_000 ? next.slice(-2_000) : next;
}

function stopProcess(process: ChildProcess | null) {
  if (!process || process.killed) {
    return;
  }

  try {
    process.kill("SIGKILL");
  } catch {
    try {
      process.kill();
    } catch {
      // no-op
    }
  }
}


export async function verifyConvertibleAudioSource(sourceUrl: string) {
  const provider = getConvertibleAudioProvider(sourceUrl);

  if (!provider) {
    throw new Error("РЎСЃС‹Р»РєР° РЅРµ РѕС‚РЅРѕСЃРёС‚СЃСЏ Рє РїРѕРґРґРµСЂР¶РёРІР°РµРјС‹Рј СЃРµСЂРІРёСЃР°Рј VK Р’РёРґРµРѕ РёР»Рё Rutube.");
  }

  if (provider === "rutube") {
    return resolveRutubeAudioSource(sourceUrl);
  }

  const ytDlpBin = resolveYtDlpBin();

  try {
    const { stdout } = await execFileAsync(
      ytDlpBin,
      [
        "--ignore-config",
        "--no-playlist",
        "--no-warnings",
        "-f",
        "bestaudio/best",
        "--dump-single-json",
        sourceUrl,
      ],
      {
        timeout: AUDIO_PROBE_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    const parsed = JSON.parse(stdout) as YtDlpResolvedAudioMetadata;

    const selected = parsed.requested_downloads?.[0] ?? parsed;
    const resolvedUrl = selected.url?.trim() || parsed.url?.trim() || "";

    if (!resolvedUrl) {
      throw new Error("yt-dlp РЅРµ РІРµСЂРЅСѓР» РїСЂСЏРјСѓСЋ СЃСЃС‹Р»РєСѓ РЅР° Р°СѓРґРёРѕРїРѕС‚РѕРє.");
    }

    return {
      cookies: selected.cookies ?? parsed.cookies,
      headers: selected.http_headers ?? parsed.http_headers,
      url: resolvedUrl,
    } satisfies ResolvedAudioSource;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕРґРіРѕС‚РѕРІРёС‚СЊ Р°СѓРґРёРѕРїРѕС‚РѕРє С‡РµСЂРµР· yt-dlp (${ytDlpBin}): ${error.message}`,
      );
    }

    throw error;
  }
}

function parseThumbnailSourceUrl(sourceUrl: string) {
  const trimmed = sourceUrl.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;

  try {
    return new URL(normalized);
  } catch {
    return null;
  }
}

function isVkThumbnailHost(hostname: string) {
  const host = hostname.replace(/^www\./, "").toLowerCase();
  return host === "vk.com" || host === "m.vk.com" || host === "vkvideo.ru" || host === "m.vkvideo.ru";
}

function extractVkVideoKey(parsed: URL) {
  let ownerId = parsed.searchParams.get("oid") ?? "";
  let videoId = parsed.searchParams.get("id") ?? "";

  if (!ownerId || !videoId) {
    const pathMatch = parsed.pathname.match(/\/video(-?\d+)_(\d+)/);
    if (pathMatch) {
      ownerId = pathMatch[1] ?? ownerId;
      videoId = pathMatch[2] ?? videoId;
    }
  }

  if (!ownerId || !videoId) {
    const zMatch = (parsed.searchParams.get("z") ?? "").match(/video(-?\d+)_(\d+)/);
    if (zMatch) {
      ownerId = zMatch[1] ?? ownerId;
      videoId = zMatch[2] ?? videoId;
    }
  }

  if (!ownerId || !videoId) {
    return null;
  }

  return { ownerId, videoId };
}

function buildVkThumbnailProbeCandidates(sourceUrl: string) {
  const trimmed = sourceUrl.trim();
  const parsed = parseThumbnailSourceUrl(trimmed);

  if (!parsed || !isVkThumbnailHost(parsed.hostname)) {
    return trimmed ? [trimmed] : [];
  }

  const candidates = new Set<string>([parsed.href, trimmed]);
  const videoKey = extractVkVideoKey(parsed);

  if (!videoKey) {
    return Array.from(candidates);
  }

  const canonicalSuffix = `video${videoKey.ownerId}_${videoKey.videoId}`;
  candidates.add(`https://vkvideo.ru/${canonicalSuffix}`);
  candidates.add(`https://vk.com/${canonicalSuffix}`);

  const embedUrl = new URL("https://vkvideo.ru/video_ext.php");
  embedUrl.searchParams.set("oid", videoKey.ownerId);
  embedUrl.searchParams.set("id", videoKey.videoId);

  for (const key of ["hash", "hd", "list", "referrer", "player"]) {
    const value = parsed.searchParams.get(key);
    if (value) {
      embedUrl.searchParams.set(key, value);
    }
  }

  candidates.add(embedUrl.toString());
  return Array.from(candidates);
}

function getRutubeVideoId(sourceUrl: string) {
  const parsed = parseThumbnailSourceUrl(sourceUrl);
  if (!parsed) {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (host !== "rutube.ru") {
    return null;
  }

  const segments = parsed.pathname.split("/").filter(Boolean);

  if (segments[0] === "play" && segments[1] === "embed") {
    return segments[2] ?? null;
  }

  if (segments[0] === "video" && segments[1] === "private") {
    return segments[2] ?? null;
  }

  if (segments[0] === "video") {
    return segments[1] ?? null;
  }

  return null;
}

async function resolveRutubeAudioSource(sourceUrl: string) {
  const videoId = getRutubeVideoId(sourceUrl);
  if (!videoId) {
    throw new Error("РќРµ СѓРґР°Р»РѕСЃСЊ РѕРїСЂРµРґРµР»РёС‚СЊ РёРґРµРЅС‚РёС„РёРєР°С‚РѕСЂ РІРёРґРµРѕ Rutube.");
  }

  const response = await fetch(
    `https://rutube.ru/api/play/options/${videoId}/`,
    {
      headers: RUTUBE_REQUEST_HEADERS,
      signal: AbortSignal.timeout(AUDIO_PROBE_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    throw new Error(`Rutube РІРµСЂРЅСѓР» СЃС‚Р°С‚СѓСЃ ${response.status} РїСЂРё Р·Р°РїСЂРѕСЃРµ РїРѕС‚РѕРєР°.`);
  }

  const parsed = (await response.json()) as RutubePlayOptions;
  const resolvedUrl =
    parsed.video_balancer?.m3u8?.trim() ||
    parsed.video_balancer?.default?.trim() ||
    "";

  if (!resolvedUrl) {
    throw new Error("Rutube РЅРµ РІРµСЂРЅСѓР» СЃСЃС‹Р»РєСѓ РЅР° HLS-РїРѕС‚РѕРє.");
  }

  return {
    headers: {
      Origin: "https://rutube.ru",
      Referer: parsed.referer?.trim() || "https://rutube.ru/",
      "User-Agent": RUTUBE_USER_AGENT,
    },
    url: resolvedUrl,
  } satisfies ResolvedAudioSource;
}

function pickBestThumbnail(thumbnails: YtDlpThumbnailInfo[] | undefined) {
  return (
    thumbnails
      ?.filter(
        (thumbnail): thumbnail is YtDlpThumbnailInfo & { url: string } =>
          typeof thumbnail.url === "string" && thumbnail.url.trim().length > 0,
      )
      .sort((left, right) => {
        const leftArea = (left.width ?? 0) * (left.height ?? 0);
        const rightArea = (right.width ?? 0) * (right.height ?? 0);
        return rightArea - leftArea;
      })[0]
      ?.url?.trim() ?? null
  );
}

async function resolveRutubeThumbnailUrl(sourceUrl: string) {
  const videoId = getRutubeVideoId(sourceUrl);
  if (!videoId) {
    return null;
  }

  const response = await fetch(
    `https://rutube.ru/api/play/options/${videoId}/`,
    {
      headers: RUTUBE_REQUEST_HEADERS,
      signal: AbortSignal.timeout(THUMBNAIL_PROBE_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    poster_url?: string;
    thumbnail_url?: string;
  };

  return payload.thumbnail_url?.trim() || payload.poster_url?.trim() || null;
}

function normalizeThumbnailCandidateUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed
    .replace(/\\u002F/gi, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003A/gi, ":")
    .replace(/\\u003F/gi, "?")
    .replace(/\\u003D/gi, "=")
    .replace(/\\u0025/gi, "%")
    .replace(/\\\//g, "/")
    .replace(/&amp;/gi, "&")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#47;/gi, "/");
  const withProtocol = normalized.startsWith("//")
    ? `https:${normalized}`
    : normalized;

  try {
    return new URL(withProtocol).href;
  } catch {
    return null;
  }
}

function extractThumbnailFromHtml(html: string) {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["'][^>]*>/i,
    /"thumbnailUrl"\s*:\s*"([^"]+)"/i,
    /"thumbnail_url"\s*:\s*"([^"]+)"/i,
    /"poster"\s*:\s*"([^"]+)"/i,
    /"image"\s*:\s*"([^"]+)"/i,
  ] as const;

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const thumbnailUrl = normalizeThumbnailCandidateUrl(match?.[1]);
    if (thumbnailUrl) {
      return thumbnailUrl;
    }
  }

  return null;
}

async function resolveVkThumbnailFromHtml(sourceUrl: string) {
  const candidates = buildVkThumbnailProbeCandidates(sourceUrl);

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        headers: THUMBNAIL_HTML_HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(THUMBNAIL_PROBE_TIMEOUT_MS),
      });

      if (!response.ok) {
        continue;
      }

      const html = await response.text();
      const thumbnailUrl = extractThumbnailFromHtml(html);
      if (thumbnailUrl) {
        return thumbnailUrl;
      }
    } catch {
      // Try the next candidate before giving up on HTML probing.
    }
  }

  return null;
}

async function resolveVkThumbnailUrl(sourceUrl: string) {
  const ytDlpBin = resolveYtDlpBin();
  const candidates = buildVkThumbnailProbeCandidates(sourceUrl);

  for (const candidate of candidates) {
    try {
      const { stdout } = await execFileAsync(
        ytDlpBin,
        [
          "--ignore-config",
          "--no-playlist",
          "--no-warnings",
          "--dump-single-json",
          candidate,
        ],
        {
          timeout: AUDIO_PROBE_TIMEOUT_MS,
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024,
        },
      );

      const parsed = JSON.parse(stdout) as YtDlpMetadata;
      const thumbnailUrl =
        normalizeThumbnailCandidateUrl(parsed.thumbnail) ||
        normalizeThumbnailCandidateUrl(pickBestThumbnail(parsed.thumbnails));

      if (thumbnailUrl) {
        return thumbnailUrl;
      }
    } catch {
      // Fall through to the next candidate and then to HTML probing.
    }
  }

  return resolveVkThumbnailFromHtml(sourceUrl);
}

export async function resolveMediaThumbnailUrl(sourceUrl: string) {
  const trimmed = sourceUrl.trim();
  if (!trimmed) {
    return null;
  }

  const cached = thumbnailCache.get(trimmed);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.thumbnailUrl;
  }

  let thumbnailUrl: string | null = null;

  try {
    const provider = getConvertibleAudioProvider(trimmed);
    if (provider === "rutube") {
      thumbnailUrl = await resolveRutubeThumbnailUrl(trimmed);
    } else if (provider === "vk") {
      thumbnailUrl = await resolveVkThumbnailUrl(trimmed);
    }
  } catch {
    thumbnailUrl = null;
  }

  thumbnailCache.set(trimmed, {
    expiresAt:
      Date.now() +
      (thumbnailUrl
        ? THUMBNAIL_SUCCESS_CACHE_TTL_MS
        : THUMBNAIL_FAILURE_CACHE_TTL_MS),
    thumbnailUrl,
  });

  return thumbnailUrl;
}

function buildFfmpegHeaderString(resolvedSource: ResolvedAudioSource) {
  const headers = new Map<string, string>();

  Object.entries(resolvedSource.headers ?? {}).forEach(([key, value]) => {
    if (value) {
      headers.set(key, value);
    }
  });

  if (resolvedSource.cookies?.trim()) {
    headers.set("Cookie", resolvedSource.cookies.trim());
  }

  if (headers.size === 0) {
    return null;
  }

  return `${Array.from(headers.entries())
    .map(([key, value]) => `${key}: ${value}`)
    .join("\r\n")}\r\n`;
}

export function createConvertedAudioStream(resolvedSource: ResolvedAudioSource) {
  const output = new PassThrough();
  const ffmpegBin = resolveFfmpegBin();
  let ffmpeg: ChildProcess | null = null;
  let closed = false;
  let ffmpegErrors = "";
  const ffmpegHeaders = buildFfmpegHeaderString(resolvedSource);

  const finishWithError = (message: string) => {
    if (closed) {
      return;
    }

    closed = true;
    stopProcess(ffmpeg);
    output.destroy(new Error(message));
  };

  try {
    ffmpeg = spawn(
      ffmpegBin,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        ...(ffmpegHeaders ? ["-headers", ffmpegHeaders] : []),
        "-i",
        resolvedSource.url,
        "-vn",
        "-acodec",
        "libmp3lame",
        "-b:a",
        "192k",
        "-f",
        "mp3",
        "pipe:1",
      ],
      {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );
  } catch (error) {
    finishWithError(
      error instanceof Error
        ? error.message
        : "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РїСѓСЃС‚РёС‚СЊ РєРѕРЅРІРµСЂС‚Р°С†РёСЋ Р°СѓРґРёРѕ.",
    );

    return {
      stream: output,
      cleanup: () => undefined,
    };
  }

  ffmpeg.stderr?.on("data", (chunk) => {
    ffmpegErrors = appendLogChunk(ffmpegErrors, chunk);
  });

  ffmpeg.on("error", (error) => {
    finishWithError(`ffmpeg: ${error.message}`);
  });

  ffmpeg.stdout?.pipe(output);

  ffmpeg.on("close", (code) => {
    if (closed) {
      return;
    }

    if (code === 0) {
      closed = true;
      output.end();
      return;
    }

    finishWithError(
      ffmpegErrors.trim() ||
        `ffmpeg Р·Р°РІРµСЂС€РёР»СЃСЏ СЃ РєРѕРґРѕРј ${code ?? "unknown"}.`,
    );
  });

  return {
    stream: output,
    cleanup: () => {
      if (closed) {
        return;
      }

      closed = true;
      stopProcess(ffmpeg);
      output.destroy();
    },
  };
}

export async function convertAudioSourceToMp3Buffer(
  resolvedSource: ResolvedAudioSource,
) {
  const ffmpegBin = resolveFfmpegBin();
  const ffmpegHeaders = buildFfmpegHeaderString(resolvedSource);
  const tempDir = await mkdtemp(path.join(tmpdir(), "learnapp-audio-"));
  const outputPath = path.join(tempDir, `${randomUUID()}.mp3`);

  try {
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn(
        ffmpegBin,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          ...(ffmpegHeaders ? ["-headers", ffmpegHeaders] : []),
          "-i",
          resolvedSource.url,
          "-vn",
          "-acodec",
          "libmp3lame",
          "-b:a",
          "192k",
          "-f",
          "mp3",
          outputPath,
        ],
        {
          windowsHide: true,
        },
      );

      let ffmpegErrors = "";

      ffmpeg.stderr?.on("data", (chunk) => {
        ffmpegErrors = appendLogChunk(ffmpegErrors, chunk);
      });

      ffmpeg.on("error", (error) => {
        reject(new Error(`ffmpeg: ${error.message}`));
      });

      ffmpeg.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(
          new Error(
            ffmpegErrors.trim() ||
              `ffmpeg Р·Р°РІРµСЂС€РёР»СЃСЏ СЃ РєРѕРґРѕРј ${code ?? "unknown"}.`,
          ),
        );
      });
    });

    return await readFile(outputPath);
  } finally {
    await rm(tempDir, {
      force: true,
      recursive: true,
    }).catch(() => undefined);
  }
}
