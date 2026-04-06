import { resolveMediaThumbnailUrl } from "@/lib/media-conversion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildThumbnailPlaceholderSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img" aria-label="Превью видео недоступно">
    <defs>
      <linearGradient id="bg" x1="0%" x2="100%" y1="0%" y2="100%">
        <stop offset="0%" stop-color="#eef4f7" />
        <stop offset="100%" stop-color="#d7e5ec" />
      </linearGradient>
    </defs>
    <rect width="640" height="360" fill="url(#bg)" rx="24" ry="24" />
    <circle cx="320" cy="180" r="56" fill="rgba(17, 43, 51, 0.16)" />
    <path d="M300 146L300 214L352 180Z" fill="#133b47" />
    <text x="320" y="286" fill="#355260" font-family="Arial, sans-serif" font-size="24" font-weight="700" text-anchor="middle">
      Превью недоступно
    </text>
  </svg>`;
}

function createPlaceholderResponse(status = 200) {
  return new Response(buildThumbnailPlaceholderSvg(), {
    status,
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Content-Type": "image/svg+xml; charset=utf-8",
    },
  });
}

export async function GET(request: Request) {
  const source = new URL(request.url).searchParams.get("source")?.trim() ?? "";

  if (!source) {
    return createPlaceholderResponse(400);
  }

  try {
    const thumbnailUrl = await resolveMediaThumbnailUrl(source);
    if (!thumbnailUrl) {
      return createPlaceholderResponse();
    }

    const response = await fetch(thumbnailUrl, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      return createPlaceholderResponse();
    }

    const imageData = await response.arrayBuffer();

    return new Response(imageData, {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "Content-Type": response.headers.get("content-type") ?? "image/jpeg",
      },
    });
  } catch {
    return createPlaceholderResponse();
  }
}
