import { randomUUID } from "node:crypto";
import {
  convertAudioSourceToPlayableAsset,
  type ConvertedAudioAsset,
  verifyConvertibleAudioSource,
} from "@/lib/media-conversion";
import { getConvertibleAudioProvider } from "@/lib/media-audio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUDIO_CACHE_TTL_MS = 30 * 60 * 1000;
const AUDIO_CACHE_MAX_ENTRIES = 6;

type CachedAudioEntry = {
  asset: ConvertedAudioAsset;
  expiresAt: number;
};

type AudioErrorPayload = {
  code: string;
  error: string;
  fallback?: "youtube_embed";
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

function getAudioFailurePayload(
  provider: string | null,
  error: unknown,
): AudioErrorPayload {
  const rawMessage =
    error instanceof Error ? error.message : "Не удалось подготовить аудио.";

  if (
    provider === "youtube" &&
    /sign in to confirm you.?re not a bot|cookies-from-browser|cookies for the authentication/i.test(
      rawMessage,
    )
  ) {
    return {
      code: "youtube_bot_check",
      error:
        "YouTube временно не дал подготовить отдельный аудиопоток. Открываем встроенный плеер YouTube.",
      fallback: "youtube_embed",
    };
  }

  if (provider === "youtube") {
    return {
      code: "youtube_audio_prepare_failed",
      error:
        "Не удалось подготовить отдельный аудиопоток YouTube. Открываем встроенный плеер YouTube.",
      fallback: "youtube_embed",
    };
  }

  return {
    code: "audio_prepare_failed",
    error: "Не удалось подготовить аудио для воспроизведения.",
  };
}

async function getAudioBufferForSource(
  requestId: string,
  provider: string,
  sourceUrl: string,
  sourceHost: string | null,
) {
  const cachedAsset = getCachedAudioBuffer(sourceUrl);
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

  const pendingConversion = pendingConversions.get(sourceUrl);
  if (pendingConversion) {
    logAudioRequest("info", requestId, "Joining pending audio conversion", {
      provider,
      sourceHost,
    });
    return pendingConversion;
  }

  const conversionPromise = (async () => {
    const resolvedSource = await verifyConvertibleAudioSource(sourceUrl);
    logAudioRequest("info", requestId, "Resolved audio source", {
      directAsset: resolvedSource.directAsset?.extension ?? null,
      headers: Object.keys(resolvedSource.headers ?? {}),
      mode: resolvedSource.debug?.mode ?? null,
      provider,
      resolvedContainer: resolvedSource.debug?.container ?? null,
      resolvedFormatId: resolvedSource.debug?.formatId ?? null,
      resolvedHost: resolvedSource.debug?.host ?? null,
      resolvedProtocol: resolvedSource.debug?.protocol ?? null,
      sourceHost,
    });

    const asset = await convertAudioSourceToPlayableAsset(resolvedSource);
    setCachedAudioBuffer(sourceUrl, asset);
    return asset;
  })();

  pendingConversions.set(sourceUrl, conversionPromise);

  try {
    return await conversionPromise;
  } finally {
    pendingConversions.delete(sourceUrl);
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
          "Нужна корректная ссылка на YouTube, VK Видео или Rutube для подготовки аудио.",
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

    const responseBody = new Uint8Array(audioAsset.buffer);

    return new Response(responseBody, {
      headers: {
        "Content-Type": audioAsset.contentType,
        "Cache-Control": "private, max-age=1800",
        "Content-Disposition": `inline; filename="${provider}-audio.${audioAsset.extension}"`,
        "Content-Length": String(audioAsset.buffer.byteLength),
      },
    });
  } catch (error) {
    const payload = getAudioFailurePayload(provider, error);

    logAudioRequest("error", requestId, "Audio request failed", {
      errorCode: payload.code,
      fallback: payload.fallback ?? null,
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
