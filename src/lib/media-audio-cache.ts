import "server-only";
import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";
import { normalizeConvertibleAudioSourceUrl } from "@/lib/media-audio";
import type { ConvertedAudioAsset } from "@/lib/media-conversion";

type MediaAudioCacheRow = {
  audio_blob: Buffer | Uint8Array;
  content_type: string;
  extension: string;
  id: string;
};

export function buildMediaAudioCacheId(sourceUrl: string) {
  return createHash("sha256")
    .update(normalizeConvertibleAudioSourceUrl(sourceUrl))
    .digest("hex");
}

export async function getStoredAudioAsset(sourceUrl: string) {
  const trimmedSourceUrl = normalizeConvertibleAudioSourceUrl(sourceUrl);
  if (!trimmedSourceUrl) {
    return null;
  }

  try {
    const cacheId = buildMediaAudioCacheId(trimmedSourceUrl);
    const db = await getDb();
    const rows = (await db.query(
      `
        SELECT id, content_type, extension, audio_blob
        FROM media_audio_cache
        WHERE id = ?
        LIMIT 1
      `,
      [cacheId],
    )) as MediaAudioCacheRow[];
    const row = rows[0];

    if (!row) {
      return null;
    }

    const buffer = Buffer.isBuffer(row.audio_blob)
      ? row.audio_blob
      : Buffer.from(row.audio_blob);
    const now = new Date().toISOString();

    void db
      .execute(
        `
          UPDATE media_audio_cache
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
    } satisfies ConvertedAudioAsset;
  } catch (error) {
    console.warn("[media-audio-cache] Failed to read persistent audio cache", {
      message: error instanceof Error ? error.message : String(error),
      sourceUrl: trimmedSourceUrl,
    });
    return null;
  }
}

export async function storeConvertedAudioAsset(
  sourceUrl: string,
  provider: string,
  asset: ConvertedAudioAsset,
) {
  const trimmedSourceUrl = normalizeConvertibleAudioSourceUrl(sourceUrl);
  if (!trimmedSourceUrl || !asset.buffer.byteLength) {
    return;
  }

  try {
    const cacheId = buildMediaAudioCacheId(trimmedSourceUrl);
    const now = new Date().toISOString();
    const db = await getDb();

    await db.execute(
      `
        INSERT INTO media_audio_cache (
          id,
          source_url,
          provider,
          content_type,
          extension,
          audio_blob,
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
          audio_blob = VALUES(audio_blob),
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
    console.warn("[media-audio-cache] Failed to store persistent audio cache", {
      message: error instanceof Error ? error.message : String(error),
      provider,
      sourceUrl: trimmedSourceUrl,
    });
  }
}
