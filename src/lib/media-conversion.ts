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
const THUMBNAIL_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
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
    throw new Error("Ссылка не относится к поддерживаемым сервисам VK Видео или Rutube.");
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

    const parsed = JSON.parse(stdout) as {
      cookies?: string;
      http_headers?: Record<string, string>;
      requested_downloads?: Array<{
        cookies?: string;
        http_headers?: Record<string, string>;
        url?: string;
      }>;
      url?: string;
    };

    const selected = parsed.requested_downloads?.[0] ?? parsed;
    const resolvedUrl = selected.url?.trim() || parsed.url?.trim() || "";

    if (!resolvedUrl) {
      throw new Error("yt-dlp не вернул прямую ссылку на аудиопоток.");
    }

    return {
      cookies: selected.cookies ?? parsed.cookies,
      headers: selected.http_headers ?? parsed.http_headers,
      url: resolvedUrl,
    } satisfies ResolvedAudioSource;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Не удалось подготовить аудиопоток через yt-dlp (${ytDlpBin}): ${error.message}`,
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
    throw new Error("Не удалось определить идентификатор видео Rutube.");
  }

  const response = await fetch(
    `https://rutube.ru/api/play/options/${videoId}/`,
    {
      headers: RUTUBE_REQUEST_HEADERS,
      signal: AbortSignal.timeout(AUDIO_PROBE_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    throw new Error(`Rutube вернул статус ${response.status} при запросе потока.`);
  }

  const parsed = (await response.json()) as RutubePlayOptions;
  const resolvedUrl =
    parsed.video_balancer?.m3u8?.trim() ||
    parsed.video_balancer?.default?.trim() ||
    "";

  if (!resolvedUrl) {
    throw new Error("Rutube не вернул ссылку на HLS-поток.");
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

async function resolveVkThumbnailUrl(sourceUrl: string) {
  const ytDlpBin = resolveYtDlpBin();
  const { stdout } = await execFileAsync(
    ytDlpBin,
    [
      "--ignore-config",
      "--no-playlist",
      "--no-warnings",
      "--dump-single-json",
      sourceUrl,
    ],
    {
      timeout: AUDIO_PROBE_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  const parsed = JSON.parse(stdout) as YtDlpMetadata;
  return parsed.thumbnail?.trim() || pickBestThumbnail(parsed.thumbnails);
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
    expiresAt: Date.now() + THUMBNAIL_CACHE_TTL_MS,
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
        : "Не удалось запустить конвертацию аудио.",
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
        `ffmpeg завершился с кодом ${code ?? "unknown"}.`,
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
              `ffmpeg завершился с кодом ${code ?? "unknown"}.`,
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
