import "server-only";
import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";
import { normalizeConvertibleAudioSourceUrl } from "@/lib/media-audio";
import type { ConvertedVideoAsset } from "@/lib/media-conversion";

type MediaVideoCacheRow = {
  content_type: string;
  extension: string;
  id: string;
  video_blob: Buffer | Uint8Array;
};

export function buildMediaVideoCacheId(sourceUrl: string) {
  return createHash("sha256")
    .update(normalizeConvertibleAudioSourceUrl(sourceUrl))
    .digest("hex");
}

export async function getStoredVideoAsset(sourceUrl: string) {
  const trimmedSourceUrl = normalizeConvertibleAudioSourceUrl(sourceUrl);
  if (!trimmedSourceUrl) {
    return null;
  }

  try {
    const cacheId = buildMediaVideoCacheId(trimmedSourceUrl);
    const db = await getDb();
    const rows = (await db.query(
      `
        SELECT id, content_type, extension, video_blob
        FROM media_video_cache
        WHERE id = ?
        LIMIT 1
      `,
      [cacheId],
    )) as MediaVideoCacheRow[];
    const row = rows[0];

    if (!row) {
      return null;
    }

    const buffer = Buffer.isBuffer(row.video_blob)
      ? row.video_blob
      : Buffer.from(row.video_blob);
    const now = new Date().toISOString();

    void db
      .execute(
        `
          UPDATE media_video_cache
          SET last_accessed_at = ?
          WHERE id = ?
        `,
        [now, row.id],
      )
      .catch(() => undefined);

    return {
      buffer,
      contentType: row.content_type,
      extension: row.extension,
    } satisfies ConvertedVideoAsset;
  } catch (error) {
    console.warn("[media-video-cache] Failed to read persistent video cache", {
      message: error instanceof Error ? error.message : String(error),
      sourceUrl: trimmedSourceUrl,
    });
    return null;
  }
}

export async function storeConvertedVideoAsset(
  sourceUrl: string,
  provider: string,
  asset: ConvertedVideoAsset,
) {
  const trimmedSourceUrl = normalizeConvertibleAudioSourceUrl(sourceUrl);
  if (!trimmedSourceUrl || !asset.buffer.byteLength) {
    return;
  }

  try {
    const cacheId = buildMediaVideoCacheId(trimmedSourceUrl);
    const now = new Date().toISOString();
    const db = await getDb();

    await db.execute(
      `
        INSERT INTO media_video_cache (
          id,
          source_url,
          provider,
          content_type,
          extension,
          video_blob,
          byte_length,
          created_at,
          updated_at,
          last_accessed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          source_url = VALUES(source_url),
          provider = VALUES(provider),
          content_type = VALUES(content_type),
          extension = VALUES(extension),
          video_blob = VALUES(video_blob),
          byte_length = VALUES(byte_length),
          updated_at = VALUES(updated_at),
          last_accessed_at = VALUES(last_accessed_at)
      `,
      [
        cacheId,
        trimmedSourceUrl,
        provider,
        asset.contentType,
        asset.extension,
        asset.buffer,
        asset.buffer.byteLength,
        now,
        now,
        now,
      ],
    );
  } catch (error) {
    console.warn("[media-video-cache] Failed to store persistent video cache", {
      message: error instanceof Error ? error.message : String(error),
      provider,
      sourceUrl: trimmedSourceUrl,
    });
  }
}
