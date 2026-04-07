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

async function getAudioBufferForSource(sourceUrl: string) {
  const cachedAsset = getCachedAudioBuffer(sourceUrl);
  if (cachedAsset) {
    return cachedAsset;
  }

  const pendingConversion = pendingConversions.get(sourceUrl);
  if (pendingConversion) {
    return pendingConversion;
  }

  const conversionPromise = (async () => {
    const resolvedSource = await verifyConvertibleAudioSource(sourceUrl);
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
  const requestUrl = new URL(request.url);
  const sourceUrl = requestUrl.searchParams.get("source")?.trim() ?? "";
  const provider = getConvertibleAudioProvider(sourceUrl);

  if (!provider || !sourceUrl) {
    return Response.json(
      {
        error:
          "Нужна корректная ссылка на VK Видео или Rutube для конвертации в mp3.",
      },
      { status: 400 },
    );
  }

  try {
    const audioAsset = await getAudioBufferForSource(sourceUrl);
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

    return Response.json({ error: message }, { status: 502 });
  }
}
