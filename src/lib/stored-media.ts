import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const STORED_MEDIA_DIRECTORY = path.join(process.cwd(), ".data", "stored-media");
const STORED_MEDIA_ROUTE_PREFIX = "/api/media/stored/";

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  m4a: "audio/mp4",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  ogg: "audio/ogg",
  ogv: "video/ogg",
  png: "image/png",
  wav: "audio/wav",
  webm: "video/webm",
  webp: "image/webp",
};

type StoredMediaAsset = {
  asset: string;
  buffer: Buffer;
  contentType: string;
  extension: string;
  fileName: string;
  url: string;
};

type StoredMediaAssetInfo = Omit<StoredMediaAsset, "buffer"> & {
  filePath: string;
  size: number;
};

function sanitizeStoredMediaAsset(asset: string) {
  const normalized = asset.trim();
  return /^[a-z0-9_-]+\.[a-z0-9]+$/i.test(normalized) ? normalized : null;
}

function inferExtension(fileName: string, contentType = "") {
  const normalizedName = fileName.trim().toLowerCase();
  const directExtension = path.extname(normalizedName).replace(/^\./, "");

  if (directExtension) {
    return directExtension;
  }

  const normalizedType = contentType.trim().toLowerCase();
  return (
    Object.entries(CONTENT_TYPE_BY_EXTENSION).find(
      ([, knownContentType]) => knownContentType === normalizedType,
    )?.[0] ?? "bin"
  );
}

function inferContentType(asset: string) {
  const extension = path.extname(asset).replace(/^\./, "").toLowerCase();
  return CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream";
}

function getStoredMediaPath(asset: string) {
  return path.join(STORED_MEDIA_DIRECTORY, asset);
}

async function ensureStoredMediaDirectory() {
  await mkdir(STORED_MEDIA_DIRECTORY, { recursive: true });
}

export function buildStoredMediaUrl(asset: string) {
  const normalized = sanitizeStoredMediaAsset(asset);
  if (!normalized) {
    throw new Error("Некорректный идентификатор сохранённого файла.");
  }

  return `${STORED_MEDIA_ROUTE_PREFIX}${encodeURIComponent(normalized)}`;
}

export function isStoredMediaUrl(url: string) {
  return parseStoredMediaAssetFromUrl(url) !== null;
}

export function parseStoredMediaAssetFromUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  const parsePathname = (pathname: string) => {
    if (!pathname.startsWith(STORED_MEDIA_ROUTE_PREFIX)) {
      return null;
    }

    const asset = decodeURIComponent(pathname.slice(STORED_MEDIA_ROUTE_PREFIX.length));
    return sanitizeStoredMediaAsset(asset);
  };

  if (trimmed.startsWith("/")) {
    return parsePathname(trimmed);
  }

  try {
    return parsePathname(new URL(trimmed).pathname);
  } catch {
    return null;
  }
}

export async function storeUploadedMediaFile(input: {
  buffer: Buffer;
  contentType?: string;
  fileName: string;
}) {
  await ensureStoredMediaDirectory();

  const extension = inferExtension(input.fileName, input.contentType);
  const asset = `${randomUUID().replace(/-/g, "")}.${extension}`;
  await writeFile(getStoredMediaPath(asset), input.buffer);

  return {
    asset,
    url: buildStoredMediaUrl(asset),
  };
}

export async function readStoredMediaAsset(asset: string): Promise<StoredMediaAsset | null> {
  const storedAssetInfo = await getStoredMediaAssetInfo(asset);
  if (!storedAssetInfo) {
    return null;
  }

  const buffer = await readFile(storedAssetInfo.filePath);
  return {
    asset: storedAssetInfo.asset,
    buffer,
    contentType: storedAssetInfo.contentType,
    extension: storedAssetInfo.extension,
    fileName: storedAssetInfo.fileName,
    url: storedAssetInfo.url,
  };
}

export async function getStoredMediaAssetInfo(
  asset: string,
): Promise<StoredMediaAssetInfo | null> {
  const normalized = sanitizeStoredMediaAsset(asset);
  if (!normalized) {
    return null;
  }

  try {
    const filePath = getStoredMediaPath(normalized);
    const fileStats = await stat(filePath);
    const extension = path.extname(normalized).replace(/^\./, "").toLowerCase();
    return {
      asset: normalized,
      contentType: inferContentType(normalized),
      extension,
      fileName: normalized,
      filePath,
      size: fileStats.size,
      url: buildStoredMediaUrl(normalized),
    };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}

export async function readStoredMediaAssetFromUrl(url: string) {
  const asset = parseStoredMediaAssetFromUrl(url);
  if (!asset) {
    return null;
  }

  return readStoredMediaAsset(asset);
}
