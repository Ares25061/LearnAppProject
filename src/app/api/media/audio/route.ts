import { randomUUID } from "node:crypto";
import {
  buildMediaAudioCacheId,
  getStoredAudioAsset,
  storeConvertedAudioAsset,
} from "@/lib/media-audio-cache";
import {
  convertAudioSourceToPlayableAsset,
  type ConvertedAudioAsset,
  verifyConvertibleAudioSource,
} from "@/lib/media-conversion";
import {
  getConvertibleAudioProvider,
  normalizeConvertibleAudioSourceUrl,
} from "@/lib/media-audio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUDIO_CACHE_TTL_MS = 30 * 60 * 1000;
const AUDIO_CACHE_MAX_ENTRIES = 6;

type CachedAudioEntry = {
  asset: ConvertedAudioAsset;
  expiresAt: number;
};

type AudioErrorPayload = {
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

const audioCache = new Map<string, CachedAudioEntry>();
const pendingConversions = new Map<string, Promise<ConvertedAudioAsset>>();

function logAudioRequest(
  level: "info" | "warn" | "error",
  requestId: string,
  message: string,
  details?: Record<string, unknown>,
) {
  const prefix = `[media/audio:${requestId}] ${message}`;
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

function pruneExpiredAudioEntries(now = Date.now()) {
  for (const [cacheKey, entry] of audioCache.entries()) {
    if (entry.expiresAt <= now) {
      audioCache.delete(cacheKey);
    }
  }
}

function getCachedAudioBuffer(sourceUrl: string) {
  pruneExpiredAudioEntries();
  const entry = audioCache.get(sourceUrl);
  if (!entry) {
    return null;
  }

  audioCache.delete(sourceUrl);
  audioCache.set(sourceUrl, entry);
  return entry.asset;
}

function setCachedAudioBuffer(sourceUrl: string, asset: ConvertedAudioAsset) {
  pruneExpiredAudioEntries();
  audioCache.set(sourceUrl, {
    asset,
    expiresAt: Date.now() + AUDIO_CACHE_TTL_MS,
  });

  while (audioCache.size > AUDIO_CACHE_MAX_ENTRIES) {
    const oldestKey = audioCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    audioCache.delete(oldestKey);
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

function getAudioFailurePayload(
  provider: string | null,
  error: unknown,
): AudioErrorPayload {
  const rawMessage =
    error instanceof Error
      ? error.message
      : "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u0438\u0442\u044c \u0430\u0443\u0434\u0438\u043e.";

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
        "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u0438\u0442\u044c mp3 \u0434\u043b\u044f YouTube: \u0441\u0435\u0440\u0432\u0438\u0441 \u0437\u0430\u043f\u0440\u043e\u0441\u0438\u043b \u0434\u043e\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c\u043d\u0443\u044e \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0443.",
      hint: authConfigured
        ? "\u041d\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435 \u0443\u0436\u0435 \u0437\u0430\u0434\u0430\u043d\u044b YouTube auth-\u043f\u0430\u0440\u0430\u043c\u0435\u0442\u0440\u044b, \u043d\u043e YouTube \u0438\u0445 \u043d\u0435 \u043f\u0440\u0438\u043d\u044f\u043b. \u041e\u0431\u043d\u043e\u0432\u0438\u0442\u0435 cookies.txt \u0438\u043b\u0438 \u043f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 YTDLP_YOUTUBE_COOKIES_B64."
        : "\u041d\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u044b YTDLP_YOUTUBE_COOKIES_B64 / YTDLP_YOUTUBE_COOKIES / YTDLP_YOUTUBE_COOKIES_FILE \u0438\u043b\u0438 \u043f\u0430\u0440\u0430 YTDLP_YOUTUBE_PO_TOKEN + YTDLP_YOUTUBE_VISITOR_DATA.",
    };
  }

  if (provider === "youtube") {
    return {
      code: "youtube_audio_prepare_failed",
      error:
        "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u0438\u0442\u044c mp3 \u0434\u043b\u044f YouTube.",
    };
  }

  return {
    code: "audio_prepare_failed",
    error:
      "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u0438\u0442\u044c \u0430\u0443\u0434\u0438\u043e \u0434\u043b\u044f \u0432\u043e\u0441\u043f\u0440\u043e\u0438\u0437\u0432\u0435\u0434\u0435\u043d\u0438\u044f.",
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

async function getAudioBufferForSource(
  requestId: string,
  provider: string,
  sourceUrl: string,
  sourceHost: string | null,
) {
  const cacheKey = normalizeConvertibleAudioSourceUrl(sourceUrl);
  const cachedAsset = getCachedAudioBuffer(cacheKey);
  if (cachedAsset) {
    logAudioRequest("info", requestId, "Serving audio from in-memory cache", {
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
    logAudioRequest("info", requestId, "Joining pending audio conversion", {
      provider,
      sourceHost,
    });
    return pendingConversion;
  }

  const conversionPromise = (async () => {
    const storedAsset = await getStoredAudioAsset(sourceUrl);
    if (storedAsset) {
      setCachedAudioBuffer(cacheKey, storedAsset);
      logAudioRequest("info", requestId, "Serving audio from persistent cache", {
        contentType: storedAsset.contentType,
        extension: storedAsset.extension,
        provider,
        size: storedAsset.buffer.byteLength,
        sourceHost,
      });
      return storedAsset;
    }

    const resolvedSource = await verifyConvertibleAudioSource(sourceUrl);
    logAudioRequest("info", requestId, "Resolved audio source", {
      directAsset: resolvedSource.directAsset?.extension ?? null,
      headers: Object.keys(resolvedSource.headers ?? {}),
      mode: resolvedSource.debug?.mode ?? null,
      probeStrategy: resolvedSource.debug?.probeStrategy ?? null,
      provider,
      resolvedContainer: resolvedSource.debug?.container ?? null,
      resolvedExtractorArgs: resolvedSource.debug?.ytDlpExtractorArgs ?? null,
      resolvedFormatId: resolvedSource.debug?.formatId ?? null,
      resolvedHost: resolvedSource.debug?.host ?? null,
      resolvedProtocol: resolvedSource.debug?.protocol ?? null,
      sourceHost,
    });

    const asset = await convertAudioSourceToPlayableAsset(resolvedSource);
    try {
      await storeConvertedAudioAsset(sourceUrl, provider, asset);
    } catch (error) {
      logAudioRequest("warn", requestId, "Failed to store prepared audio in persistent cache", {
        message: error instanceof Error ? error.message : String(error),
        provider,
        sourceHost,
      });
    }
    setCachedAudioBuffer(cacheKey, asset);
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
    logAudioRequest("warn", requestId, "Rejected invalid audio request", {
      provider,
      sourceHost,
      sourceUrl,
    });

    return Response.json(
      {
        code: "invalid_audio_source",
        error:
          "\u041d\u0443\u0436\u043d\u0430 \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u0430\u044f \u0441\u0441\u044b\u043b\u043a\u0430 \u043d\u0430 YouTube, VK \u0412\u0438\u0434\u0435\u043e \u0438\u043b\u0438 Rutube \u0434\u043b\u044f \u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u043a\u0438 \u0430\u0443\u0434\u0438\u043e.",
      } satisfies AudioErrorPayload,
      { status: 400 },
    );
  }

  try {
    logAudioRequest("info", requestId, "Started audio request", {
      provider,
      sourceHost,
      sourceUrl,
    });

    const audioAsset = await getAudioBufferForSource(
      requestId,
      provider,
      sourceUrl,
      sourceHost,
    );
    logAudioRequest("info", requestId, "Prepared audio asset", {
      contentType: audioAsset.contentType,
      extension: audioAsset.extension,
      provider,
      size: audioAsset.buffer.byteLength,
      sourceHost,
      tookMs: Date.now() - startedAt,
    });

    const responseBody = Buffer.from(audioAsset.buffer);
    const baseHeaders = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="${provider}-audio.${audioAsset.extension}"`,
      "Content-Type": audioAsset.contentType,
      ETag: `"${buildMediaAudioCacheId(sourceUrl)}-${audioAsset.buffer.byteLength}"`,
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
    const payload = getAudioFailurePayload(provider, error);

    logAudioRequest("error", requestId, "Audio request failed", {
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
