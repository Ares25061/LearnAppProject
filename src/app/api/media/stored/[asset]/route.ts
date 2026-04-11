import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { getStoredMediaAssetInfo } from "@/lib/stored-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ParsedByteRange =
  | {
      end: number;
      start: number;
    }
  | {
      unsatisfiable: true;
    };

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

export async function GET(
  request: Request,
  context: { params: Promise<{ asset: string }> },
) {
  const { asset } = await context.params;
  const storedAsset = await getStoredMediaAssetInfo(asset);

  if (!storedAsset) {
    return new Response("Файл не найден.", { status: 404 });
  }

  const parsedRange = parseByteRangeHeader(
    request.headers.get("range"),
    storedAsset.size,
  );
  const baseHeaders = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=31536000, immutable",
    "Content-Disposition": `inline; filename="${storedAsset.asset}"`,
    "Content-Type": storedAsset.contentType,
  };

  if (parsedRange && "unsatisfiable" in parsedRange) {
    return new Response(null, {
      status: 416,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes */${storedAsset.size}`,
      },
    });
  }

  if (parsedRange) {
    const partialBody = Readable.toWeb(
      createReadStream(storedAsset.filePath, {
        end: parsedRange.end,
        start: parsedRange.start,
      }),
    ) as ReadableStream<Uint8Array>;
    return new Response(partialBody, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Length": String(parsedRange.end - parsedRange.start + 1),
        "Content-Range": `bytes ${parsedRange.start}-${parsedRange.end}/${storedAsset.size}`,
      },
    });
  }

  const responseBody = Readable.toWeb(
    createReadStream(storedAsset.filePath),
  ) as ReadableStream<Uint8Array>;

  return new Response(responseBody, {
    headers: {
      ...baseHeaders,
      "Content-Length": String(storedAsset.size),
    },
  });
}
