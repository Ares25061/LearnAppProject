import type { AnyExerciseDraft } from "@/lib/types";

const STORED_MEDIA_ROUTE_PREFIX = "/api/media/stored/";
const EMBEDDED_DRAFT_ASSET_PREFIX = "learningapps-asset://";

export const DRAFT_JSON_FORMAT = "learningapps-studio/draft";
export const DRAFT_JSON_VERSION = 2;

export type DraftJsonEmbeddedAsset = {
  contentType?: string;
  dataUrl: string;
  fileName: string;
  id: string;
  sourceUrl: string;
};

export type DraftJsonExportPayload = {
  assets: DraftJsonEmbeddedAsset[];
  draft: AnyExerciseDraft;
  exportedAt: string;
  format: typeof DRAFT_JSON_FORMAT;
  version: typeof DRAFT_JSON_VERSION;
};

function inferDraftAssetFileName(url: string) {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith("blob:")) {
    return "media.bin";
  }

  try {
    const pathname = trimmed.startsWith("/")
      ? trimmed
      : new URL(trimmed).pathname;
    const lastSegment = pathname.split("/").filter(Boolean).at(-1);
    return lastSegment ? decodeURIComponent(lastSegment) : "media.bin";
  } catch {
    return "media.bin";
  }
}

export function isStoredDraftMediaUrl(
  value: string,
  origin: string | null = null,
) {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed.startsWith(STORED_MEDIA_ROUTE_PREFIX)) {
    return true;
  }

  return Boolean(origin && trimmed.startsWith(`${origin}${STORED_MEDIA_ROUTE_PREFIX}`));
}

export function isEmbeddableDraftMediaUrl(
  value: string,
  origin: string | null = null,
) {
  const trimmed = value.trim();
  return trimmed.startsWith("blob:") || isStoredDraftMediaUrl(trimmed, origin);
}

export function createDraftEmbeddedAssetUrl(id: string) {
  return `${EMBEDDED_DRAFT_ASSET_PREFIX}${id}`;
}

export function parseDraftEmbeddedAssetUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith(EMBEDDED_DRAFT_ASSET_PREFIX)) {
    return null;
  }

  const assetId = trimmed.slice(EMBEDDED_DRAFT_ASSET_PREFIX.length).trim();
  return assetId || null;
}

export function collectDraftAssetSources(
  draft: AnyExerciseDraft,
  origin: string | null = null,
) {
  const collected = new Map<
    string,
    {
      fileName: string;
      sourceUrl: string;
    }
  >();

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (!value || typeof value !== "object") {
      return;
    }

    const record = value as Record<string, unknown>;
    const rawUrl = typeof record.url === "string" ? record.url.trim() : "";

    if (rawUrl && isEmbeddableDraftMediaUrl(rawUrl, origin) && !collected.has(rawUrl)) {
      const rawFileName =
        typeof record.fileName === "string" ? record.fileName.trim() : "";

      collected.set(rawUrl, {
        fileName: rawFileName || inferDraftAssetFileName(rawUrl),
        sourceUrl: rawUrl,
      });
    }

    Object.values(record).forEach(visit);
  };

  visit(draft);
  return Array.from(collected.values());
}

export function replaceDraftAssetUrls<T>(
  value: T,
  lookup: ReadonlyMap<string, string>,
): T {
  if (typeof value === "string") {
    const nextValue = lookup.get(value) ?? lookup.get(value.trim());
    return (nextValue ?? value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceDraftAssetUrls(item, lookup)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, currentValue]) => [
        key,
        replaceDraftAssetUrls(currentValue, lookup),
      ]),
    ) as T;
  }

  return value;
}
