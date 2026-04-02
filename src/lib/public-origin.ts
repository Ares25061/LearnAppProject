import "server-only";

const DEFAULT_PUBLIC_APP_ORIGIN =
  "https://learnappproject-production.up.railway.app";

function normalizeOrigin(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.origin;
  } catch {
    return null;
  }
}

function isRestrictedHost(origin: string) {
  try {
    const parsed = new URL(origin);
    return (
      parsed.hostname === "0.0.0.0" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "localhost"
    );
  } catch {
    return true;
  }
}

function pickPublicOrigin(candidates: Array<string | null | undefined>) {
  for (const candidate of candidates) {
    const normalized = normalizeOrigin(candidate);

    if (normalized && !isRestrictedHost(normalized)) {
      return normalized;
    }
  }

  return DEFAULT_PUBLIC_APP_ORIGIN;
}

export function getPublicAppOrigin(request?: Request) {
  const configuredOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL);

  if (configuredOrigin) {
    return configuredOrigin;
  }

  const forwardedHost = request?.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const forwardedProto = request?.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const forwardedOrigin = forwardedHost
    ? `${forwardedProto || "https"}://${forwardedHost}`
    : null;

  return pickPublicOrigin([
    forwardedOrigin,
    request?.headers.get("origin"),
    request ? new URL(request.url).origin : null,
  ]);
}

export { DEFAULT_PUBLIC_APP_ORIGIN };
