export type ConvertibleAudioProvider = "rutube" | "vk";

function parseMediaSourceUrl(sourceUrl: string) {
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

export function getConvertibleAudioProvider(
  sourceUrl: string,
): ConvertibleAudioProvider | null {
  const parsed = parseMediaSourceUrl(sourceUrl);
  if (!parsed) {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "rutube.ru") {
    return "rutube";
  }

  if (
    host === "vk.com" ||
    host === "m.vk.com" ||
    host === "vkvideo.ru" ||
    host === "m.vkvideo.ru"
  ) {
    return "vk";
  }

  return null;
}

export function buildConvertedAudioPath(sourceUrl: string) {
  return `/api/media/audio?source=${encodeURIComponent(sourceUrl)}`;
}
