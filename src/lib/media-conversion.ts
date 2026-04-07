import "server-only";

import { execFile, spawn, type ChildProcess } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { getConvertibleAudioProvider } from "@/lib/media-audio";

const execFileAsync = promisify(execFile);
const AUDIO_PROBE_TIMEOUT_MS = 45_000;
const AUDIO_DOWNLOAD_TIMEOUT_MS = 120_000;
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
const RUTUBE_STREAM_HEADERS = {
  Origin: "https://rutube.ru",
  Referer: "https://rutube.ru/",
  "User-Agent": RUTUBE_USER_AGENT,
} satisfies Record<string, string>;
const VK_REQUEST_HEADERS = {
  Origin: "https://vkvideo.ru",
  Referer: "https://vkvideo.ru/",
} satisfies Record<string, string>;
const ytDlpDownloadState = {
  promise: null as Promise<string> | null,
};
const thumbnailCache = new Map<
  string,
  { expiresAt: number; thumbnailUrl: string | null }
>();

type ResolvedAudioSource = {
  cookies?: string;
  directAsset?: {
    contentType: string;
    extension: string;
  };
  debug?: {
    container?: string;
    formatId?: string;
    host?: string;
    mode?: "direct" | "hls" | "transcode";
    protocol?: string;
    provider?: string;
  };
  headers?: Record<string, string>;
  sourcePageUrl?: string;
  url: string;
};

export type ConvertedAudioAsset = {
  buffer: Buffer;
  contentType: string;
  extension: string;
};

type YtDlpResolvedAudioMetadata = {
  cookies?: string;
  formats?: YtDlpResolvedAudioFormat[];
  http_headers?: Record<string, string>;
  requested_downloads?: Array<{
    cookies?: string;
    http_headers?: Record<string, string>;
    url?: string;
  }>;
  url?: string;
};

type YtDlpResolvedAudioFormat = {
  acodec?: string;
  abr?: number;
  audio_ext?: string;
  cookies?: string;
  ext?: string;
  format_id?: string;
  height?: number;
  http_headers?: Record<string, string>;
  protocol?: string;
  source_preference?: number;
  tbr?: number;
  url?: string;
  vcodec?: string;
  width?: number;
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

function getDownloadedYtDlpPath() {
  const fileName = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  return path.join(tmpdir(), "learnapp-media-tools", fileName);
}

function getYtDlpDownloadUrl() {
  if (process.env.YT_DLP_DOWNLOAD_URL?.trim()) {
    return process.env.YT_DLP_DOWNLOAD_URL.trim();
  }

  return process.platform === "win32"
    ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
    : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";
}

async function ensureYtDlpBin() {
  const resolvedPath = resolveYtDlpBin();
  if (resolvedPath !== "yt-dlp") {
    return resolvedPath;
  }

  try {
    await execFileAsync("yt-dlp", ["--version"], {
      timeout: 10_000,
      windowsHide: true,
    });
    return "yt-dlp";
  } catch {
    // Fall through to an on-demand download for environments like Railway.
  }

  const downloadedPath = getDownloadedYtDlpPath();
  if (isExecutableFile(downloadedPath)) {
    return downloadedPath;
  }

  if (!ytDlpDownloadState.promise) {
    ytDlpDownloadState.promise = (async () => {
      const downloadUrl = getYtDlpDownloadUrl();
      console.info("[media/yt-dlp] Downloading yt-dlp binary", {
        downloadUrl,
        targetPath: downloadedPath,
      });

      const response = await fetch(downloadUrl, {
        redirect: "follow",
        signal: AbortSignal.timeout(AUDIO_DOWNLOAD_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(
          `Не удалось скачать yt-dlp. HTTP ${response.status} ${response.statusText}.`,
        );
      }

      const binary = Buffer.from(await response.arrayBuffer());
      await mkdir(path.dirname(downloadedPath), { recursive: true });
      await writeFile(downloadedPath, binary);

      if (process.platform !== "win32") {
        await chmod(downloadedPath, 0o755);
      }

      console.info("[media/yt-dlp] yt-dlp binary is ready", {
        targetPath: downloadedPath,
        size: binary.byteLength,
      });

      return downloadedPath;
    })().finally(() => {
      ytDlpDownloadState.promise = null;
    });
  }

  return ytDlpDownloadState.promise;
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


export async function verifyConvertibleAudioSource(
  sourceUrl: string,
): Promise<ResolvedAudioSource> {
  const provider = getConvertibleAudioProvider(sourceUrl);

  if (!provider) {
    throw new Error("РЎСЃС‹Р»РєР° РЅРµ РѕС‚РЅРѕСЃРёС‚СЃСЏ Рє РїРѕРґРґРµСЂР¶РёРІР°РµРјС‹Рј СЃРµСЂРІРёСЃР°Рј VK Р’РёРґРµРѕ РёР»Рё Rutube.");
  }

  if (provider === "rutube") {
    return resolveRutubeAudioSource(sourceUrl);
  }

  if (provider === "vk") {
    return resolveVkAudioSource(sourceUrl);
  }

  const ytDlpBin = await ensureYtDlpBin();

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

function getRutubeFormatHostPriority(sourceUrl: string) {
  try {
    const hostname = new URL(sourceUrl).hostname.replace(/^www\./, "").toLowerCase();
    if (hostname.endsWith(".rutube.ru")) {
      return 0;
    }

    if (hostname.endsWith(".rtbcdn.ru")) {
      return 1;
    }
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }

  return 2;
}

function getYtDlpNumericValue(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : Number.MAX_SAFE_INTEGER;
}

function getYtDlpBitrateDistance(
  primary: number | undefined,
  fallback: number | undefined,
  target = 128,
) {
  const bitrate = typeof primary === "number" && Number.isFinite(primary)
    ? primary
    : typeof fallback === "number" && Number.isFinite(fallback)
      ? fallback
      : Number.MAX_SAFE_INTEGER;

  if (!Number.isFinite(bitrate)) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Math.abs(bitrate - target);
}

function pickRutubeYtDlpFormat(
  formats: YtDlpResolvedAudioFormat[] | undefined,
) {
  return formats
    ?.filter(
      (format): format is YtDlpResolvedAudioFormat & { url: string } =>
        typeof format.url === "string" &&
        format.url.trim().length > 0 &&
        typeof format.acodec === "string" &&
        format.acodec.trim().length > 0 &&
        format.acodec !== "none",
    )
    .sort((left, right) => {
      const cookiePriority =
        Number(Boolean(right.cookies?.trim())) -
        Number(Boolean(left.cookies?.trim()));
      if (cookiePriority !== 0) {
        return cookiePriority;
      }

      const hostPriority =
        getRutubeFormatHostPriority(left.url) -
        getRutubeFormatHostPriority(right.url);
      if (hostPriority !== 0) {
        return hostPriority;
      }

      const bitratePriority =
        getYtDlpNumericValue(left.tbr) - getYtDlpNumericValue(right.tbr);
      if (bitratePriority !== 0) {
        return bitratePriority;
      }

      const leftArea = getYtDlpNumericValue(left.width) * getYtDlpNumericValue(left.height);
      const rightArea =
        getYtDlpNumericValue(right.width) * getYtDlpNumericValue(right.height);
      return leftArea - rightArea;
    })[0];
}

function pickVkYtDlpFormat(
  formats: YtDlpResolvedAudioFormat[] | undefined,
) {
  return formats
    ?.filter(
      (format): format is YtDlpResolvedAudioFormat & { url: string } =>
        typeof format.url === "string" &&
        format.url.trim().length > 0 &&
        typeof format.acodec === "string" &&
        format.acodec.trim().length > 0 &&
        format.acodec !== "none",
    )
    .sort((left, right) => {
      const leftAudioOnly = left.vcodec === "none" ? 0 : 1;
      const rightAudioOnly = right.vcodec === "none" ? 0 : 1;
      if (leftAudioOnly !== rightAudioOnly) {
        return leftAudioOnly - rightAudioOnly;
      }

      const leftDirect = left.protocol === "https" ? 0 : 1;
      const rightDirect = right.protocol === "https" ? 0 : 1;
      if (leftDirect !== rightDirect) {
        return leftDirect - rightDirect;
      }

      const leftContainer =
        left.ext === "m4a" || left.audio_ext === "m4a"
          ? 0
          : left.ext === "webm" || left.audio_ext === "webm"
            ? 1
            : 2;
      const rightContainer =
        right.ext === "m4a" || right.audio_ext === "m4a"
          ? 0
          : right.ext === "webm" || right.audio_ext === "webm"
            ? 1
            : 2;
      if (leftContainer !== rightContainer) {
        return leftContainer - rightContainer;
      }

      const leftBitrateDistance = getYtDlpBitrateDistance(left.abr, left.tbr);
      const rightBitrateDistance = getYtDlpBitrateDistance(right.abr, right.tbr);
      if (leftBitrateDistance !== rightBitrateDistance) {
        return leftBitrateDistance - rightBitrateDistance;
      }

      const leftSourcePreference =
        typeof left.source_preference === "number" ? -left.source_preference : 0;
      const rightSourcePreference =
        typeof right.source_preference === "number" ? -right.source_preference : 0;
      if (leftSourcePreference !== rightSourcePreference) {
        return leftSourcePreference - rightSourcePreference;
      }

      return getYtDlpNumericValue(left.tbr) - getYtDlpNumericValue(right.tbr);
    })[0];
}

async function resolveRutubeAudioSourceWithYtDlp(
  sourceUrl: string,
): Promise<ResolvedAudioSource | null> {
  const ytDlpBin = await ensureYtDlpBin();

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
        maxBuffer: 16 * 1024 * 1024,
      },
    );

    const parsed = JSON.parse(stdout) as YtDlpResolvedAudioMetadata;
    const selectedFormat = pickRutubeYtDlpFormat(parsed.formats);

    if (selectedFormat?.url?.trim()) {
      return {
        cookies: selectedFormat.cookies ?? parsed.cookies,
        debug: {
          container: selectedFormat.audio_ext ?? selectedFormat.ext,
          formatId: selectedFormat.format_id,
          host: (() => {
            try {
              return new URL(selectedFormat.url.trim()).hostname;
            } catch {
              return undefined;
            }
          })(),
          mode: isHlsSourceUrl(selectedFormat.url) ? "hls" : "transcode",
          protocol: selectedFormat.protocol,
          provider: "rutube",
        },
        headers: {
          ...RUTUBE_STREAM_HEADERS,
          ...(selectedFormat.http_headers ?? parsed.http_headers ?? {}),
        },
        sourcePageUrl: sourceUrl,
        url: selectedFormat.url.trim(),
      } satisfies ResolvedAudioSource;
    }

    const selectedDownload = parsed.requested_downloads?.[0];
    const fallbackUrl = selectedDownload?.url?.trim() || parsed.url?.trim() || "";
    if (!fallbackUrl) {
      return null;
    }

    return {
      cookies: selectedDownload?.cookies ?? parsed.cookies,
      debug: {
        host: (() => {
          try {
            return new URL(fallbackUrl).hostname;
          } catch {
            return undefined;
          }
        })(),
        mode: isHlsSourceUrl(fallbackUrl) ? "hls" : "transcode",
        provider: "rutube",
      },
      headers: {
        ...RUTUBE_STREAM_HEADERS,
        ...(selectedDownload?.http_headers ?? parsed.http_headers ?? {}),
      },
      sourcePageUrl: sourceUrl,
      url: fallbackUrl,
    } satisfies ResolvedAudioSource;
  } catch {
    return null;
  }
}

async function resolveVkAudioSource(
  sourceUrl: string,
): Promise<ResolvedAudioSource> {
  const ytDlpBin = await ensureYtDlpBin();

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
        maxBuffer: 16 * 1024 * 1024,
      },
    );

    const parsed = JSON.parse(stdout) as YtDlpResolvedAudioMetadata;
    const selectedFormat = pickVkYtDlpFormat(parsed.formats);
    const selected = selectedFormat ?? parsed.requested_downloads?.[0] ?? parsed;
    const resolvedUrl = selected.url?.trim() || parsed.url?.trim() || "";

    if (!resolvedUrl) {
      throw new Error("yt-dlp не вернул рабочую ссылку на аудиопоток VK.");
    }

    const directAsset =
      selectedFormat?.protocol === "https" &&
      (selectedFormat.ext === "m4a" || selectedFormat.audio_ext === "m4a")
        ? {
            contentType: "audio/mp4",
            extension: "m4a",
          }
        : selectedFormat?.protocol === "https" &&
            (selectedFormat.ext === "webm" || selectedFormat.audio_ext === "webm")
          ? {
              contentType: "audio/webm",
              extension: "webm",
            }
          : undefined;

    return {
      cookies: selected.cookies ?? parsed.cookies,
      directAsset,
      debug: {
        container:
          selectedFormat?.audio_ext ??
          selectedFormat?.ext ??
          directAsset?.extension,
        formatId: selectedFormat?.format_id,
        host: (() => {
          try {
            return new URL(resolvedUrl).hostname;
          } catch {
            return undefined;
          }
        })(),
        mode: directAsset ? "direct" : isHlsSourceUrl(resolvedUrl) ? "hls" : "transcode",
        protocol: selectedFormat?.protocol,
        provider: "vk",
      },
      headers: {
        ...VK_REQUEST_HEADERS,
        ...(selected.http_headers ?? parsed.http_headers ?? {}),
        Referer: sourceUrl,
      },
      sourcePageUrl: sourceUrl,
      url: resolvedUrl,
    } satisfies ResolvedAudioSource;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Не удалось подготовить аудиопоток VK через yt-dlp (${ytDlpBin}): ${error.message}`,
      );
    }

    throw error;
  }
}

async function resolveRutubeAudioSource(
  sourceUrl: string,
): Promise<ResolvedAudioSource> {
  const videoId = getRutubeVideoId(sourceUrl);
  if (!videoId) {
    throw new Error("РќРµ СѓРґР°Р»РѕСЃСЊ РѕРїСЂРµРґРµР»РёС‚СЊ РёРґРµРЅС‚РёС„РёРєР°С‚РѕСЂ РІРёРґРµРѕ Rutube.");
  }

  const ytDlpResolvedSource = await resolveRutubeAudioSourceWithYtDlp(sourceUrl);
  if (ytDlpResolvedSource) {
    return ytDlpResolvedSource;
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
    debug: {
      host: (() => {
        try {
          return new URL(resolvedUrl).hostname;
        } catch {
          return undefined;
        }
      })(),
      mode: "hls",
      provider: "rutube",
    },
    headers: {
      ...RUTUBE_STREAM_HEADERS,
      Referer: parsed.referer?.trim() || RUTUBE_STREAM_HEADERS.Referer,
    },
    sourcePageUrl: sourceUrl,
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
  const ytDlpBin = await ensureYtDlpBin();
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

function buildResolvedSourceHeaders(resolvedSource: ResolvedAudioSource) {
  const headers = new Headers();

  Object.entries(resolvedSource.headers ?? {}).forEach(([key, value]) => {
    if (value) {
      headers.set(key, value);
    }
  });

  if (resolvedSource.cookies?.trim()) {
    headers.set("Cookie", resolvedSource.cookies.trim());
  }

  return headers;
}

function isHlsSourceUrl(sourceUrl: string) {
  return /\.m3u8(?:[?#].*)?$/i.test(sourceUrl);
}

function buildFfmpegInputArgs(resolvedSource: ResolvedAudioSource) {
  const ffmpegHeaders = buildFfmpegHeaderString(resolvedSource);
  const isHlsSource = isHlsSourceUrl(resolvedSource.url);

  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    ...(isHlsSource
      ? [
          "-reconnect",
          "1",
          "-reconnect_streamed",
          "1",
          "-reconnect_on_network_error",
          "1",
          "-reconnect_delay_max",
          "5",
          "-http_persistent",
          "0",
          "-protocol_whitelist",
          "file,http,https,tcp,tls,crypto",
        ]
      : []),
    ...(ffmpegHeaders ? ["-headers", ffmpegHeaders] : []),
    "-i",
    resolvedSource.url,
  ];
}

function buildFfmpegExitErrorMessage(
  ffmpegErrors: string,
  code: number | null,
  signal?: NodeJS.Signals | null,
) {
  const normalizedErrors = ffmpegErrors.trim();
  if (normalizedErrors) {
    return normalizedErrors;
  }

  if (signal) {
    return `ffmpeg завершился по сигналу ${signal}.`;
  }

  return `ffmpeg завершился с кодом ${code ?? "unknown"}.`;
}

export function createConvertedAudioStream(resolvedSource: ResolvedAudioSource) {
  const output = new PassThrough();
  const ffmpegBin = resolveFfmpegBin();
  let ffmpeg: ChildProcess | null = null;
  let closed = false;
  let ffmpegErrors = "";

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
        ...buildFfmpegInputArgs(resolvedSource),
        "-map",
        "0:a:0",
        "-vn",
        "-sn",
        "-dn",
        "-acodec",
        "libmp3lame",
        "-b:a",
        "128k",
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

  ffmpeg.on("close", (code, signal) => {
    if (closed) {
      return;
    }

    if (code === 0) {
      closed = true;
      output.end();
      return;
    }

    return finishWithError(
      buildFfmpegExitErrorMessage(ffmpegErrors, code, signal),
    );

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

async function convertAudioSourceToM4aBuffer(
  resolvedSource: ResolvedAudioSource,
) {
  const ffmpegBin = resolveFfmpegBin();
  const tempDir = await mkdtemp(path.join(tmpdir(), "learnapp-audio-"));
  const outputPath = path.join(tempDir, `${randomUUID()}.m4a`);

  try {
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn(
        ffmpegBin,
        [
          ...buildFfmpegInputArgs(resolvedSource),
          "-map",
          "0:a:0",
          "-vn",
          "-sn",
          "-dn",
          "-c:a",
          "copy",
          "-movflags",
          "+faststart",
          "-f",
          "mp4",
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

      ffmpeg.on("close", (code, signal) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(buildFfmpegExitErrorMessage(ffmpegErrors, code, signal)));
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

async function downloadAudioSourceBuffer(resolvedSource: ResolvedAudioSource) {
  const response = await fetch(resolvedSource.url, {
    headers: buildResolvedSourceHeaders(resolvedSource),
    signal: AbortSignal.timeout(AUDIO_DOWNLOAD_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `Не удалось скачать аудиоисточник (${response.status} ${response.statusText}).`,
    );
  }

  const contentType = response.headers.get("content-type")?.trim() || null;
  const arrayBuffer = await response.arrayBuffer();

  return {
    buffer: Buffer.from(arrayBuffer),
    contentType,
  };
}

function getDownloadedAssetContentType(extension: string) {
  switch (extension) {
    case "m4a":
      return "audio/mp4";
    case "mp3":
      return "audio/mpeg";
    case "webm":
      return "video/webm";
    case "mp4":
    default:
      return "video/mp4";
  }
}

function canUseRutubeYtDlpDownloadFallback(resolvedSource: ResolvedAudioSource) {
  return (
    resolvedSource.debug?.provider === "rutube" &&
    typeof resolvedSource.debug?.formatId === "string" &&
    resolvedSource.debug.formatId.trim().length > 0 &&
    typeof resolvedSource.sourcePageUrl === "string" &&
    resolvedSource.sourcePageUrl.trim().length > 0
  );
}

async function downloadAudioSourceWithYtDlp(
  resolvedSource: ResolvedAudioSource,
): Promise<ConvertedAudioAsset> {
  const ytDlpBin = await ensureYtDlpBin();
  const formatId = resolvedSource.debug?.formatId?.trim();
  const sourcePageUrl = resolvedSource.sourcePageUrl?.trim();

  if (!formatId || !sourcePageUrl) {
    throw new Error("Недостаточно данных для резервного скачивания через yt-dlp.");
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), "learnapp-audio-"));
  const outputTemplate = path.join(tempDir, "asset.%(ext)s");

  try {
    const { stdout } = await execFileAsync(
      ytDlpBin,
      [
        "--ignore-config",
        "--no-playlist",
        "--no-warnings",
        "--no-progress",
        "--force-overwrites",
        "--no-part",
        "-f",
        formatId,
        "-o",
        outputTemplate,
        "--print",
        "after_move:filepath",
        sourcePageUrl,
      ],
      {
        timeout: AUDIO_DOWNLOAD_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
      },
    );

    const outputFilePath =
      stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .at(-1) ??
      (() => {
        throw new Error("yt-dlp не сообщил путь к скачанному файлу.");
      })();

    const fallbackFilePath = path.isAbsolute(outputFilePath)
      ? outputFilePath
      : path.join(tempDir, outputFilePath);
    const filePath = isExecutableFile(fallbackFilePath)
      ? fallbackFilePath
      : path.join(
          tempDir,
          (await readdir(tempDir)).find((name) => name.startsWith("asset.")) ?? "",
        );

    const extension = path.extname(filePath).replace(/^\./, "").toLowerCase() || "mp4";
    const buffer = await readFile(filePath);
    return {
      buffer,
      contentType: getDownloadedAssetContentType(extension),
      extension,
    };
  } finally {
    await rm(tempDir, {
      force: true,
      recursive: true,
    }).catch(() => undefined);
  }
}

export async function convertAudioSourceToMp3Buffer(
  resolvedSource: ResolvedAudioSource,
) {
  const ffmpegBin = resolveFfmpegBin();
  const tempDir = await mkdtemp(path.join(tmpdir(), "learnapp-audio-"));
  const outputPath = path.join(tempDir, `${randomUUID()}.mp3`);

  try {
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn(
        ffmpegBin,
        [
          ...buildFfmpegInputArgs(resolvedSource),
          "-map",
          "0:a:0",
          "-vn",
          "-sn",
          "-dn",
          "-acodec",
          "libmp3lame",
          "-b:a",
          "128k",
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

      ffmpeg.on("close", (code, signal) => {
        if (code === 0) {
          resolve();
          return;
        }

        return reject(
          new Error(buildFfmpegExitErrorMessage(ffmpegErrors, code, signal)),
        );

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

export async function convertAudioSourceToPlayableAsset(
  resolvedSource: ResolvedAudioSource,
): Promise<ConvertedAudioAsset> {
  if (resolvedSource.directAsset) {
    const downloadedAsset = await downloadAudioSourceBuffer(resolvedSource);
    return {
      buffer: downloadedAsset.buffer,
      contentType:
        downloadedAsset.contentType || resolvedSource.directAsset.contentType,
      extension: resolvedSource.directAsset.extension,
    };
  }

  if (isHlsSourceUrl(resolvedSource.url)) {
    try {
      const buffer = await convertAudioSourceToM4aBuffer(resolvedSource);
      return {
        buffer,
        contentType: "audio/mp4",
        extension: "m4a",
      };
    } catch (error) {
      if (canUseRutubeYtDlpDownloadFallback(resolvedSource)) {
        console.warn("[media/audio] ffmpeg remux failed, falling back to yt-dlp download", {
          error: error instanceof Error ? error.message : String(error),
          formatId: resolvedSource.debug?.formatId,
          provider: resolvedSource.debug?.provider,
          sourcePageUrl: resolvedSource.sourcePageUrl,
        });

        return downloadAudioSourceWithYtDlp(resolvedSource);
      }

      // Fall back to mp3 transcoding when the source cannot be remuxed cleanly.
    }
  }

  try {
    const buffer = await convertAudioSourceToMp3Buffer(resolvedSource);
    return {
      buffer,
      contentType: "audio/mpeg",
      extension: "mp3",
    };
  } catch (error) {
    if (canUseRutubeYtDlpDownloadFallback(resolvedSource)) {
      console.warn("[media/audio] ffmpeg transcode failed, falling back to yt-dlp download", {
        error: error instanceof Error ? error.message : String(error),
        formatId: resolvedSource.debug?.formatId,
        provider: resolvedSource.debug?.provider,
        sourcePageUrl: resolvedSource.sourcePageUrl,
      });

      return downloadAudioSourceWithYtDlp(resolvedSource);
    }

    throw error;
  }
}
