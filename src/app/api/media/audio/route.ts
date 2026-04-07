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
        error:
          "Нужна корректная ссылка на VK Видео или Rutube для конвертации в mp3.",
      },
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
    const message =
      error instanceof Error
        ? error.message
        : "Не удалось открыть источник для конвертации.";

    logAudioRequest("error", requestId, "Audio request failed", {
      message,
      provider,
      sourceHost,
      sourceUrl,
      stack: error instanceof Error ? error.stack ?? null : null,
      tookMs: Date.now() - startedAt,
    });

    return Response.json({ error: message }, { status: 502 });
  }
}
