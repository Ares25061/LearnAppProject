export type ConvertibleAudioProvider = "youtube" | "rutube" | "vk";

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

  if (
    host === "youtu.be" ||
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    return "youtube";
  }

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

function getYouTubeVideoId(parsed: URL) {
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtu.be") {
    const pathnameSegments = parsed.pathname.split("/").filter(Boolean);
    return pathnameSegments[0] ?? "";
  }

  const pathnameSegments = parsed.pathname.split("/").filter(Boolean);
  const leadingSegment = pathnameSegments[0] ?? "";

  if (leadingSegment === "watch") {
    return parsed.searchParams.get("v")?.trim() ?? "";
  }

  if (
    leadingSegment === "embed" ||
    leadingSegment === "shorts" ||
    leadingSegment === "live" ||
    leadingSegment === "v"
  ) {
    return pathnameSegments[1] ?? "";
  }

  return parsed.searchParams.get("v")?.trim() ?? "";
}

export function normalizeConvertibleAudioSourceUrl(sourceUrl: string) {
  const parsed = parseMediaSourceUrl(sourceUrl);
  if (!parsed) {
    return sourceUrl.trim();
  }

  const provider = getConvertibleAudioProvider(parsed.toString());
  if (provider === "youtube") {
    const videoId = getYouTubeVideoId(parsed);
    if (videoId) {
      const normalized = new URL("https://www.youtube.com/watch");
      normalized.searchParams.set("v", videoId);
      return normalized.toString();
    }
  }

  parsed.hash = "";
  return parsed.toString();
}

export function buildConvertedAudioPath(sourceUrl: string) {
  return `/api/media/audio?source=${encodeURIComponent(
    normalizeConvertibleAudioSourceUrl(sourceUrl),
  )}`;
}
