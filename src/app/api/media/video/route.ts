import { randomUUID } from "node:crypto";
import {
  buildMediaVideoCacheId,
  getStoredVideoAsset,
} from "@/lib/media-video-cache";
import {
  convertVideoSourceToPlayableAsset,
  type ConvertedVideoAsset,
} from "@/lib/media-conversion";
import {
  getConvertibleAudioProvider,
  normalizeConvertibleAudioSourceUrl,
} from "@/lib/media-audio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIDEO_CACHE_TTL_MS = 30 * 60 * 1000;
const VIDEO_CACHE_MAX_ENTRIES = 4;

type CachedVideoEntry = {
  asset: ConvertedVideoAsset;
  expiresAt: number;
};

type VideoErrorPayload = {
  authConfigured?: boolean;
  code: string;
  error: string;
  hint?: string;
};

type ParsedByteRange =
  | {
      end: number;
      start: number;
    }
  | {
      unsatisfiable: true;
    };

const videoCache = new Map<string, CachedVideoEntry>();
const pendingConversions = new Map<string, Promise<ConvertedVideoAsset>>();

function logVideoRequest(
  level: "info" | "warn" | "error",
  requestId: string,
  message: string,
  details?: Record<string, unknown>,
) {
  const prefix = `[media/video:${requestId}] ${message}`;
  if (details) {
    console[level](prefix, details);
    return;
  }

  console[level](prefix);
}

function getSourceHost(sourceUrl: string) {
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return null;
  }
}

function pruneExpiredVideoEntries(now = Date.now()) {
  for (const [cacheKey, entry] of videoCache.entries()) {
    if (entry.expiresAt <= now) {
      videoCache.delete(cacheKey);
    }
  }
}

function getCachedVideoBuffer(sourceUrl: string) {
  pruneExpiredVideoEntries();
  const entry = videoCache.get(sourceUrl);
  if (!entry) {
    return null;
  }

  videoCache.delete(sourceUrl);
  videoCache.set(sourceUrl, entry);
  return entry.asset;
}

function setCachedVideoBuffer(sourceUrl: string, asset: ConvertedVideoAsset) {
  pruneExpiredVideoEntries();
  videoCache.set(sourceUrl, {
    asset,
    expiresAt: Date.now() + VIDEO_CACHE_TTL_MS,
  });

  while (videoCache.size > VIDEO_CACHE_MAX_ENTRIES) {
    const oldestKey = videoCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    videoCache.delete(oldestKey);
  }
}

function hasConfiguredYouTubeAuth() {
  return Boolean(
    process.env.YTDLP_YOUTUBE_COOKIES_FILE?.trim() ||
      process.env.YTDLP_YOUTUBE_COOKIES_B64?.trim() ||
      process.env.YTDLP_YOUTUBE_COOKIES?.trim() ||
      (process.env.YTDLP_YOUTUBE_PO_TOKEN?.trim() &&
        process.env.YTDLP_YOUTUBE_VISITOR_DATA?.trim()),
  );
}

function getVideoFailurePayload(
  provider: string | null,
  error: unknown,
): VideoErrorPayload {
  const rawMessage =
    error instanceof Error
      ? error.message
      : "Не удалось подготовить видео.";

  if (
    provider === "youtube" &&
    /sign in to confirm you.?re not a bot|cookies-from-browser|cookies for the authentication/i.test(
      rawMessage,
    )
  ) {
    const authConfigured = hasConfiguredYouTubeAuth();
    return {
      authConfigured,
      code: "youtube_bot_check",
      error:
        "Не удалось подготовить видео для YouTube: сервис запросил дополнительную проверку.",
      hint: authConfigured
        ? "На сервере уже заданы YouTube auth-параметры, но YouTube их не принял. Обновите cookies.txt или проверьте YTDLP_YOUTUBE_COOKIES_B64."
        : "На сервере не найдены YTDLP_YOUTUBE_COOKIES_B64 / YTDLP_YOUTUBE_COOKIES / YTDLP_YOUTUBE_COOKIES_FILE или пара YTDLP_YOUTUBE_PO_TOKEN + YTDLP_YOUTUBE_VISITOR_DATA.",
    };
  }

  if (provider === "youtube") {
    return {
      code: "youtube_video_prepare_failed",
      error: "Не удалось подготовить видео для YouTube.",
    };
  }

  return {
    code: "video_prepare_failed",
    error: "Не удалось подготовить видео для воспроизведения.",
  };
}

function parseByteRangeHeader(
  rangeHeader: string | null,
  size: number,
): ParsedByteRange | null {
  if (!rangeHeader || size <= 0) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) {
    return null;
  }

  const startToken = match[1] ?? "";
  const endToken = match[2] ?? "";

  if (!startToken && !endToken) {
    return { unsatisfiable: true };
  }

  if (!startToken) {
    const suffixLength = Number.parseInt(endToken, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return { unsatisfiable: true };
    }

    return {
      start: Math.max(size - suffixLength, 0),
      end: size - 1,
    };
  }

  const start = Number.parseInt(startToken, 10);
  if (!Number.isFinite(start) || start < 0 || start >= size) {
    return { unsatisfiable: true };
  }

  if (!endToken) {
    return {
      start,
      end: size - 1,
    };
  }

  const parsedEnd = Number.parseInt(endToken, 10);
  if (!Number.isFinite(parsedEnd) || parsedEnd < start) {
    return { unsatisfiable: true };
  }

  return {
    start,
    end: Math.min(parsedEnd, size - 1),
  };
}

async function getVideoBufferForSource(
  requestId: string,
  provider: string,
  sourceUrl: string,
  sourceHost: string | null,
) {
  const cacheKey = normalizeConvertibleAudioSourceUrl(sourceUrl);
  const cachedAsset = getCachedVideoBuffer(cacheKey);
  if (cachedAsset) {
    logVideoRequest("info", requestId, "Serving video from in-memory cache", {
      contentType: cachedAsset.contentType,
      extension: cachedAsset.extension,
      provider,
      size: cachedAsset.buffer.byteLength,
      sourceHost,
    });
    return cachedAsset;
  }

  const pendingConversion = pendingConversions.get(cacheKey);
  if (pendingConversion) {
    logVideoRequest("info", requestId, "Joining pending video conversion", {
      provider,
      sourceHost,
    });
    return pendingConversion;
  }

  const conversionPromise = (async () => {
    const storedAsset = await getStoredVideoAsset(sourceUrl);
    if (storedAsset) {
      setCachedVideoBuffer(cacheKey, storedAsset);
      logVideoRequest("info", requestId, "Serving video from persistent cache", {
        contentType: storedAsset.contentType,
        extension: storedAsset.extension,
        provider,
        size: storedAsset.buffer.byteLength,
        sourceHost,
      });
      return storedAsset;
    }

    const asset = await convertVideoSourceToPlayableAsset(sourceUrl);
    setCachedVideoBuffer(cacheKey, asset);
    return asset;
  })();

  pendingConversions.set(cacheKey, conversionPromise);

  try {
    return await conversionPromise;
  } finally {
    pendingConversions.delete(cacheKey);
  }
}

export async function GET(request: Request) {
  const requestId = randomUUID().slice(0, 8);
  const startedAt = Date.now();
  const requestUrl = new URL(request.url);
  const sourceUrl = requestUrl.searchParams.get("source")?.trim() ?? "";
  const provider = getConvertibleAudioProvider(sourceUrl);
  const sourceHost = getSourceHost(sourceUrl);

  if (!provider || !sourceUrl) {
    logVideoRequest("warn", requestId, "Rejected invalid video request", {
      provider,
      sourceHost,
      sourceUrl,
    });

    return Response.json(
      {
        code: "invalid_video_source",
        error:
          "Нужна корректная ссылка на YouTube, VK Видео или Rutube для подготовки видео.",
      } satisfies VideoErrorPayload,
      { status: 400 },
    );
  }

  try {
    logVideoRequest("info", requestId, "Started video request", {
      provider,
      sourceHost,
      sourceUrl,
    });

    const videoAsset = await getVideoBufferForSource(
      requestId,
      provider,
      sourceUrl,
      sourceHost,
    );
    logVideoRequest("info", requestId, "Prepared video asset", {
      contentType: videoAsset.contentType,
      extension: videoAsset.extension,
      provider,
      size: videoAsset.buffer.byteLength,
      sourceHost,
      tookMs: Date.now() - startedAt,
    });

    const responseBody = Buffer.from(videoAsset.buffer);
    const baseHeaders = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="${provider}-video.${videoAsset.extension}"`,
      "Content-Type": videoAsset.contentType,
      ETag: `"${buildMediaVideoCacheId(sourceUrl)}-${videoAsset.buffer.byteLength}"`,
    };
    const parsedRange = parseByteRangeHeader(
      request.headers.get("range"),
      responseBody.byteLength,
    );

    if (parsedRange && "unsatisfiable" in parsedRange) {
      return new Response(null, {
        status: 416,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes */${responseBody.byteLength}`,
        },
      });
    }

    if (parsedRange) {
      const partialBody = responseBody.subarray(parsedRange.start, parsedRange.end + 1);
      return new Response(partialBody, {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Length": String(partialBody.byteLength),
          "Content-Range": `bytes ${parsedRange.start}-${parsedRange.end}/${responseBody.byteLength}`,
        },
      });
    }

    return new Response(responseBody, {
      headers: {
        ...baseHeaders,
        "Content-Length": String(responseBody.byteLength),
      },
    });
  } catch (error) {
    const payload = getVideoFailurePayload(provider, error);

    logVideoRequest("error", requestId, "Video request failed", {
      errorCode: payload.code,
      message: payload.error,
      provider,
      rawMessage: error instanceof Error ? error.message : String(error),
      sourceHost,
      sourceUrl,
      stack: error instanceof Error ? error.stack ?? null : null,
      tookMs: Date.now() - startedAt,
    });

    return Response.json(payload, { status: 502 });
  }
}
