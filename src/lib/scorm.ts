import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import {
  getStoredAudioAsset,
  storeConvertedAudioAsset,
} from "@/lib/media-audio-cache";
import {
  convertAudioSourceToPlayableAsset,
  convertVideoSourceToPlayableAsset,
  resolveMediaThumbnailUrl,
  verifyConvertibleAudioSource,
} from "@/lib/media-conversion";
import { getConvertibleAudioProvider } from "@/lib/media-audio";
import { normalizeMatchingSide } from "@/lib/matching-pairs";
import type {
  AnyExerciseDraft,
  ClassificationGroupBackground,
  MatchingAudioContent,
  MatchingContent,
  MatchingImageContent,
  MatchingPairSide,
  MatchingVideoContent,
} from "@/lib/types";
import { escapeXml } from "@/lib/utils";

type ScormArchiveVariant = "scorm1" | "scorm3";
type OfflineAssetKind = "image" | "audio" | "video";
type ArchiveFile = {
  archivePath: string;
  data: Buffer;
};

type TemplateAssets = {
  adlcp: Buffer;
  imscp: Buffer;
  imsmd: Buffer;
  wrapper: Buffer;
  offlinePlayerJs: Buffer;
  offlinePlayerCss: Buffer;
};

const MIME_EXTENSION_MAP: Record<string, string> = {
  "application/json": "json",
  "audio/aac": "aac",
  "audio/flac": "flac",
  "audio/m4a": "m4a",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "image/x-icon": "ico",
  "video/mp4": "mp4",
  "video/ogg": "ogv",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

const DEFAULT_EXTENSION_BY_KIND: Record<OfflineAssetKind, string> = {
  image: "png",
  audio: "mp3",
  video: "mp4",
};

let assetPromise: Promise<TemplateAssets> | null = null;

export class ScormArchiveError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ScormArchiveError";
    this.status = status;
  }
}

async function readTemplateAsset(filePath: string, message: string) {
  try {
    return await fs.readFile(filePath);
  } catch {
    throw new ScormArchiveError(message, 500);
  }
}

async function getAssets() {
  if (!assetPromise) {
    const appRoot = /* turbopackIgnore: true */ process.cwd();
    const templateDirectory = path.join(appRoot, "scorm-template");

    assetPromise = Promise.all([
      readTemplateAsset(
        path.join(templateDirectory, "adlcp_rootv1p2.xsd"),
        "Не найден файл шаблона adlcp_rootv1p2.xsd.",
      ),
      readTemplateAsset(
        path.join(templateDirectory, "imscp_rootv1p1p2.xsd"),
        "Не найден файл шаблона imscp_rootv1p1p2.xsd.",
      ),
      readTemplateAsset(
        path.join(templateDirectory, "imsmd_rootv1p2p1.xsd"),
        "Не найден файл шаблона imsmd_rootv1p2p1.xsd.",
      ),
      readTemplateAsset(
        path.join(templateDirectory, "SCORM_API_wrapper.js"),
        "Не найден файл шаблона SCORM_API_wrapper.js.",
      ),
      readTemplateAsset(
        path.join(templateDirectory, "scorm-player.js"),
        "Не найден офлайн-плеер «Автономный SCORM». Запустите `npm run build:scorm-player` и повторите экспорт.",
      ),
      readTemplateAsset(
        path.join(templateDirectory, "scorm-player.css"),
        "Не найдены стили офлайн-плеера «Автономный SCORM». Запустите `npm run build:scorm-player` и повторите экспорт.",
      ),
    ]).then(([adlcp, imscp, imsmd, wrapper, offlinePlayerJs, offlinePlayerCss]) => ({
      adlcp,
      imscp,
      imsmd,
      wrapper,
      offlinePlayerJs,
      offlinePlayerCss,
    }));
  }

  return assetPromise;
}

function appendFullscreenParam(url: string) {
  return url.includes("?") ? `${url}&fullscreen=1` : `${url}?fullscreen=1`;
}

function getWrapperFrameSourceDirective(frameSource: string) {
  const allowedOrigins = new Set<string>(["'self'"]);

  try {
    const parsed = new URL(frameSource);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      allowedOrigins.add(parsed.origin);
    }
  } catch {
    // Keep the strict self-only fallback for malformed sources.
  }

  return Array.from(allowedOrigins).join(" ");
}

function buildWrapperIndexHtml(title: string, frameSource: string) {
  const safeTitle = title || "Название не указано";
  const frameSourceDirective = getWrapperFrameSourceDirective(frameSource);
  const contentSecurityPolicy = [
    "default-src 'self' data: blob:",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'none'",
    `frame-src ${frameSourceDirective}`,
    `child-src ${frameSourceDirective}`,
    "font-src 'self' data:",
  ].join("; ");

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta
    http-equiv="Content-Security-Policy"
    content="${contentSecurityPolicy}"
  />
  <title>${escapeXml(safeTitle)}</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      overflow: hidden;
      font-family: Arial, sans-serif;
      background: #ffffff;
    }

    iframe {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
    }
  </style>
  <script src="SCORM_API_wrapper.js"></script>
  <script>
    var scorm = pipwerks.SCORM;

    function init() {
      scorm.init();
    }

    function end() {
      scorm.quit();
    }

    window.onload = function () {
      init();
    };

    window.onunload = function () {
      end();
    };

    var onmessage = function (e) {
      var a = e.data && e.data.split ? e.data.split("|") : [""];
      if (a[0] === "AppChecked" && parseInt(a[a.length - 1], 10) <= 2) {
        var value = parseInt(a[a.length - 2], 10);
        if (value > 0 && value <= 100 && a[a.length - 2].indexOf(";") === -1) {
          scorm.status("set", "completed");
          scorm.set("cmi.core.score.raw", value + "");
          scorm.set("cmi.core.score.min", "0");
          scorm.set("cmi.core.score.max", "100");
          scorm.set("cmi.core.score.scaled", "1");
          scorm.set("cmi.success_status", "passed");
          scorm.save();
        }
      }
      if (a[0] === "AppSolved" && parseInt(a[a.length - 1], 10) <= 2) {
        scorm.status("set", "completed");
        scorm.set("cmi.core.score.raw", a[2]);
        scorm.set("cmi.core.score.min", "0");
        scorm.set("cmi.core.score.max", "100");
        scorm.set("cmi.core.score.scaled", "1");
        scorm.set("cmi.success_status", "passed");
        scorm.save();
      }
    };

    if (typeof window.addEventListener !== "undefined") {
      window.addEventListener("message", onmessage, false);
    } else if (typeof window.attachEvent !== "undefined") {
      window.attachEvent("onmessage", onmessage);
    }
  </script>
</head>
<body>
  <iframe
    id="frame"
    src="${escapeXml(frameSource)}"
    title="${escapeXml(safeTitle)}"
    allowfullscreen
  ></iframe>
</body>
</html>`;
}

function escapeJsonForInlineScript(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function buildOfflinePlayerHtml(
  title: string,
  draft: AnyExerciseDraft,
  mediaThumbnails: Record<string, string>,
) {
  const safeTitle = title || "Название не указано";
  const contentSecurityPolicy = [
    "default-src 'self' data: blob: https: http:",
    "img-src 'self' data: blob: https: http:",
    "media-src 'self' data: blob: https: http:",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self' data: blob: https: http:",
    "frame-src 'self' https: http:",
    "child-src 'self' https: http:",
    "font-src 'self' data: https: http:",
  ].join("; ");

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta
    http-equiv="Content-Security-Policy"
    content="${contentSecurityPolicy}"
  />
  <title>${escapeXml(safeTitle)}</title>
  <link rel="stylesheet" href="./scorm-player.css" />
</head>
<body>
  <div id="app"></div>
  <script>
    window.__SCORM_OFFLINE_RUNTIME__ = true;
    window.__SCORM_EXERCISE_DRAFT__ = ${escapeJsonForInlineScript(draft)};
    window.__SCORM_MEDIA_THUMBNAILS__ = ${escapeJsonForInlineScript(mediaThumbnails)};
  </script>
  <script src="./scorm-player.js"></script>
</body>
</html>`;
}

function buildManifest(title: string, fileHrefs: string[]) {
  const safeTitle = escapeXml(title || "Название не указано");
  const uniqueFiles = Array.from(new Set(fileHrefs));
  const fileEntries = uniqueFiles
    .map((fileHref) => `      <file href="${escapeXml(fileHref)}" />`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="learningappsStudioSCORM12" version="1.0" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:imsmd="http://www.imsglobal.org/xsd/imsmd_rootv1p2p1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2" xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="LearningAppsStudio">
    <organization identifier="LearningAppsStudio" structure="hierarchical">
      <title>LearningApps Studio</title>
      <item identifier="LearningAppsStudioItem" isvisible="true" identifierref="LAFiles0">
        <title>${safeTitle}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="LAFiles0" type="webcontent" adlcp:scormtype="sco" href="index.html">
${fileEntries}
    </resource>
  </resources>
</manifest>`;
}

function stripContentTypeParameters(value: string | null) {
  return value?.split(";")[0].trim().toLowerCase() ?? "";
}

function normalizeExtension(extension: string | null | undefined) {
  if (!extension) {
    return null;
  }

  const normalized = extension.replace(/^\./, "").trim().toLowerCase();
  return /^[a-z0-9]{1,8}$/i.test(normalized) ? normalized : null;
}

function getExtensionFromMimeType(contentType: string | null) {
  const normalizedType = stripContentTypeParameters(contentType);
  return normalizeExtension(MIME_EXTENSION_MAP[normalizedType]);
}

function getExtensionFromRemoteUrl(url: string) {
  try {
    const pathname = new URL(url).pathname;
    return normalizeExtension(path.extname(pathname));
  } catch {
    return null;
  }
}

function isYouTubeHost(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    host === "youtu.be" ||
    host === "youtube.com" ||
    host === "www.youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtube-nocookie.com" ||
    host === "www.youtube-nocookie.com"
  );
}

function isRutubeHost(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    host === "rutube.ru" ||
    host === "www.rutube.ru" ||
    host === "m.rutube.ru"
  );
}

function isVkVideoHost(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    host === "vk.com" ||
    host === "www.vk.com" ||
    host === "m.vk.com" ||
    host === "vkvideo.ru" ||
    host === "www.vkvideo.ru" ||
    host === "m.vkvideo.ru"
  );
}

function isExternalVideoServiceHost(hostname: string) {
  return (
    isYouTubeHost(hostname) ||
    isRutubeHost(hostname) ||
    isVkVideoHost(hostname)
  );
}

function decodeDataUrl(source: string) {
  const trimmed = source.trim();
  const commaIndex = trimmed.indexOf(",");

  if (!trimmed.toLowerCase().startsWith("data:") || commaIndex === -1) {
    throw new ScormArchiveError("Некорректный data URL в ресурсах упражнения.");
  }

  const meta = trimmed.slice(5, commaIndex);
  const payload = trimmed.slice(commaIndex + 1);
  const isBase64 = /;base64/i.test(meta);
  const contentType = stripContentTypeParameters(meta.split(";")[0] || "application/octet-stream");

  try {
    return {
      buffer: isBase64
        ? Buffer.from(payload, "base64")
        : Buffer.from(decodeURIComponent(payload), "utf8"),
      contentType,
    };
  } catch (error) {
    throw new ScormArchiveError(
      error instanceof Error
        ? `Не удалось распаковать встроенный ресурс: ${error.message}`
        : "Не удалось распаковать встроенный ресурс.",
    );
  }
}

async function downloadRemoteAsset(url: string) {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new ScormArchiveError(
      `Автономный SCORM поддерживает только абсолютные URL или загруженные файлы. Не удалось обработать: ${url}`,
    );
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new ScormArchiveError(
      `Автономный SCORM не может скачать ресурс с протоколом ${parsedUrl.protocol}: ${url}`,
    );
  }

  let response: Response;

  try {
    response = await fetch(url, {
      redirect: "follow",
    });
  } catch (error) {
    throw new ScormArchiveError(
      error instanceof Error
        ? `Не удалось скачать ресурс ${url}: ${error.message}`
        : `Не удалось скачать ресурс ${url}.`,
      502,
    );
  }

  if (!response.ok) {
    throw new ScormArchiveError(
      `Не удалось скачать ресурс ${url}: HTTP ${response.status}.`,
      502,
    );
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: stripContentTypeParameters(response.headers.get("content-type")),
    url,
  };
}

function isExternalOrEmbeddedResource(url: string) {
  const trimmed = url.trim();

  return (
    trimmed.toLowerCase().startsWith("http://") ||
    trimmed.toLowerCase().startsWith("https://") ||
    trimmed.toLowerCase().startsWith("data:") ||
    trimmed.toLowerCase().startsWith("blob:")
  );
}

function isAllowedContentType(kind: OfflineAssetKind, contentType: string) {
  const normalized = stripContentTypeParameters(contentType);

  if (
    !normalized ||
    normalized === "application/octet-stream" ||
    normalized === "binary/octet-stream"
  ) {
    return true;
  }

  switch (kind) {
    case "image":
      return normalized.startsWith("image/");
    case "audio":
      return (
        normalized.startsWith("audio/") ||
        normalized === "video/mp4" ||
        normalized === "video/webm"
      );
    case "video":
      return normalized.startsWith("video/");
    default:
      return false;
  }
}

function assertContentTypeMatchesKind(
  kind: OfflineAssetKind,
  contentType: string,
  source: string,
) {
  if (!isAllowedContentType(kind, contentType)) {
    throw new ScormArchiveError(
      `Ресурс ${source} вернул тип ${contentType}, который не подходит для ${kind} в «Автономном SCORM».`,
      400,
    );
  }
}

function getMatchingContentUrl(content: MatchingContent) {
  switch (content.kind) {
    case "image":
    case "audio":
    case "video":
      return content.url;
    default:
      return null;
  }
}

function pushMatchingSideResourceUrl(urls: string[], side: MatchingPairSide) {
  const resourceUrl = getMatchingContentUrl(normalizeMatchingSide(side));
  if (resourceUrl) {
    urls.push(resourceUrl);
  }
}

function pushClassificationBackgroundResourceUrl(
  urls: string[],
  background: ClassificationGroupBackground,
) {
  const resourceUrl = getMatchingContentUrl(normalizeMatchingSide(background));
  if (resourceUrl) {
    urls.push(resourceUrl);
  }
}

function collectDraftResourceUrls(draft: AnyExerciseDraft) {
  const urls: string[] = [];

  switch (draft.type) {
    case "matching-pairs":
      for (const pair of draft.data.pairs) {
        pushMatchingSideResourceUrl(urls, pair.left);
        pushMatchingSideResourceUrl(urls, pair.right);
      }

      for (const extra of draft.data.extras ?? []) {
        pushMatchingSideResourceUrl(urls, extra.content);
      }
      break;
    case "group-assignment":
      for (const group of draft.data.groups) {
        pushClassificationBackgroundResourceUrl(urls, group.background);

        for (const item of group.items) {
          pushMatchingSideResourceUrl(urls, item);
        }
      }
      break;
    case "matching-images":
      for (const pair of draft.data.pairs) {
        urls.push(pair.imageUrl);
      }
      break;
    case "media-notices":
      urls.push(draft.data.mediaUrl);
      break;
    case "group-puzzle":
      urls.push(draft.data.imageUrl);
      break;
    case "where-is-what":
      urls.push(draft.data.imageUrl);
      break;
    default:
      break;
  }

  return urls;
}

function assertOfflineDraftResources(draft: AnyExerciseDraft) {
  const invalidResources = collectDraftResourceUrls(draft).filter((url) => {
    const trimmed = url.trim().toLowerCase();
    return trimmed.startsWith("data:") || trimmed.startsWith("blob:");
  });

  if (invalidResources.length > 0) {
    throw new ScormArchiveError(
      `Автономный SCORM всё ещё содержит неупакованные встроенные ресурсы: ${invalidResources.join(", ")}`,
      500,
    );
  }
}

async function localizeDraftForOfflineExport(input: AnyExerciseDraft) {
  const draft = structuredClone(input);
  const files: ArchiveFile[] = [];
  const localizedUrlMap = new Map<string, Promise<string>>();
  const localizedThumbnailMap = new Map<string, Promise<string | null>>();
  const mediaThumbnails = new Map<string, string>();
  let assetCounter = 0;

  const persistArchiveAsset = (
    kind: OfflineAssetKind,
    resource: {
      buffer: Buffer;
      contentType: string;
      url?: string;
    },
    source: string,
    preferredExtension?: string | null,
  ) => {
    const remoteUrl =
      "url" in resource && typeof resource.url === "string" ? resource.url : source;
    const normalizedContentType = resource.contentType || "application/octet-stream";
    assertContentTypeMatchesKind(kind, normalizedContentType, remoteUrl);
    const extension =
      normalizeExtension(preferredExtension) ??
      getExtensionFromMimeType(normalizedContentType) ??
      getExtensionFromRemoteUrl(remoteUrl) ??
      DEFAULT_EXTENSION_BY_KIND[kind];
    const assetNumber = assetCounter + 1;
    assetCounter += 1;
    const fileName = `${kind}-${String(assetNumber).padStart(3, "0")}.${extension}`;
    const archivePath = `player/assets/${fileName}`;

    files.push({
      archivePath,
      data: resource.buffer,
    });

    return `./assets/${fileName}`;
  };

  const localizeResourceUrl = async (url: string, kind: OfflineAssetKind) => {
    const source = url.trim();
    const normalizedSource = source.toLowerCase();

    if (!source) {
      return source;
    }

    if (normalizedSource.startsWith("blob:")) {
      throw new ScormArchiveError(
        `Автономный SCORM не может упаковать временный blob URL ${source}. Загрузите файл в редакторе заново перед экспортом.`,
      );
    }

    if (!isExternalOrEmbeddedResource(source)) {
      throw new ScormArchiveError(
        `Автономный SCORM не может упаковать относительный ресурс ${source}. Используйте абсолютную ссылку или загрузите файл в редакторе.`,
      );
    }

    const existingPromise = localizedUrlMap.get(source);
    if (existingPromise) {
      return existingPromise;
    }

    const nextPromise = (async () => {
      if (kind === "audio" && getConvertibleAudioProvider(source)) {
        const provider = getConvertibleAudioProvider(source);

        if (provider) {
          const storedAsset = await getStoredAudioAsset(source);
          if (storedAsset) {
            return persistArchiveAsset(
              "audio",
              {
                buffer: storedAsset.buffer,
                contentType: storedAsset.contentType,
                url: source,
              },
              source,
              storedAsset.extension,
            );
          }
        }

        try {
          const resolvedSource = await verifyConvertibleAudioSource(source);
          const convertedAsset = await convertAudioSourceToPlayableAsset(resolvedSource);

          if (provider) {
            await storeConvertedAudioAsset(source, provider, convertedAsset).catch(
              () => undefined,
            );
          }

          return persistArchiveAsset(
            "audio",
            {
              buffer: convertedAsset.buffer,
              contentType: convertedAsset.contentType,
              url: source,
            },
            source,
            convertedAsset.extension,
          );
        } catch (error) {
          throw new ScormArchiveError(
            error instanceof Error
              ? `Не удалось подготовить аудио для автономного SCORM: ${error.message}`
              : "Не удалось подготовить аудио для автономного SCORM.",
            502,
          );
        }
      }

      if (normalizedSource.startsWith("data:")) {
        return persistArchiveAsset(kind, decodeDataUrl(source), source);
      }

      if (kind === "video") {
        try {
          const parsedUrl = new URL(source);
          if (isExternalVideoServiceHost(parsedUrl.hostname)) {
            return source;
          }
        } catch {
          throw new ScormArchiveError(
            `Автономный SCORM поддерживает только абсолютные URL или загруженные файлы. Не удалось обработать: ${source}`,
          );
        }
      }

      return persistArchiveAsset(kind, await downloadRemoteAsset(source), source);
    })();

    localizedUrlMap.set(source, nextPromise);
    return nextPromise;
  };

  const localizeVideoThumbnail = async (url: string) => {
    const source = url.trim();
    if (!source) {
      return null;
    }

    const existingPromise = localizedThumbnailMap.get(source);
    if (existingPromise) {
      return existingPromise;
    }

    const nextPromise = (async () => {
      let parsedUrl: URL;

      try {
        parsedUrl = new URL(source);
      } catch {
        return null;
      }

      if (!isExternalVideoServiceHost(parsedUrl.hostname)) {
        return null;
      }

      try {
        const thumbnailUrl = await resolveMediaThumbnailUrl(source);
        if (!thumbnailUrl) {
          return null;
        }

        const thumbnailResource = thumbnailUrl.toLowerCase().startsWith("data:")
          ? decodeDataUrl(thumbnailUrl)
          : await downloadRemoteAsset(thumbnailUrl);
        return persistArchiveAsset("image", thumbnailResource, thumbnailUrl);
      } catch {
        return null;
      }
    })();

    localizedThumbnailMap.set(source, nextPromise);
    return nextPromise;
  };

  const localizeMatchingSide = async (side: MatchingPairSide): Promise<MatchingPairSide> => {
    if (typeof side === "string") {
      return side;
    }

    switch (side.kind) {
      case "image":
        return {
          ...side,
          url: await localizeResourceUrl(side.url, "image"),
        } satisfies MatchingImageContent;
      case "audio":
        return {
          ...side,
          url: await localizeResourceUrl(side.url, "audio"),
        } satisfies MatchingAudioContent;
      case "video":
        {
          const localizedUrl = await localizeResourceUrl(side.url, "video");
          const thumbnailUrl = await localizeVideoThumbnail(localizedUrl);
          if (thumbnailUrl) {
            mediaThumbnails.set(localizedUrl, thumbnailUrl);
          }

          return {
            ...side,
            url: localizedUrl,
          } satisfies MatchingVideoContent;
        }
      default:
        return side;
    }
  };

  const localizeClassificationBackground = async (
    background: ClassificationGroupBackground,
  ): Promise<ClassificationGroupBackground> => {
    if (typeof background === "string" || background.kind !== "image") {
      return background;
    }

    return {
      ...background,
      url: await localizeResourceUrl(background.url, "image"),
    } satisfies MatchingImageContent;
  };

  switch (draft.type) {
    case "matching-pairs":
      draft.data.pairs = await Promise.all(
        draft.data.pairs.map(async (pair) => ({
          ...pair,
          left: await localizeMatchingSide(pair.left),
          right: await localizeMatchingSide(pair.right),
        })),
      );
      draft.data.extras = await Promise.all(
        (draft.data.extras ?? []).map(async (extra) => ({
          ...extra,
          content: await localizeMatchingSide(extra.content),
        })),
      );
      break;
    case "group-assignment":
      draft.data.groups = await Promise.all(
        draft.data.groups.map(async (group) => ({
          ...group,
          background: await localizeClassificationBackground(group.background),
          items: await Promise.all(group.items.map((item) => localizeMatchingSide(item))),
        })),
      );
      break;
    case "matching-images":
      draft.data.pairs = await Promise.all(
        draft.data.pairs.map(async (pair) => ({
          ...pair,
          imageUrl: await localizeResourceUrl(pair.imageUrl, "image"),
        })),
      );
      break;
    case "media-notices":
      {
        const source = draft.data.mediaUrl.trim();
        const localizedMediaUrl = await localizeResourceUrl(
          draft.data.mediaUrl,
          draft.data.mediaKind === "audio" ? "audio" : "video",
        );
        draft.data.mediaUrl = localizedMediaUrl;

        if (draft.data.mediaKind === "video") {
          const thumbnailUrl = await localizeVideoThumbnail(source);
          if (thumbnailUrl) {
            mediaThumbnails.set(localizedMediaUrl, thumbnailUrl);
          }
        }
      }
      break;
    case "group-puzzle":
      draft.data.imageUrl = await localizeResourceUrl(draft.data.imageUrl, "image");
      break;
    case "where-is-what":
      draft.data.imageUrl = await localizeResourceUrl(draft.data.imageUrl, "image");
      break;
    default:
      break;
  }

  assertOfflineDraftResources(draft);

  return {
    draft,
    files,
    mediaThumbnails: Object.fromEntries(mediaThumbnails),
  };
}

async function buildOnlineArchive(input: { title: string; playUrl: string }) {
  const zip = new JSZip();
  const assets = await getAssets();

  zip.file("index.html", buildWrapperIndexHtml(input.title, appendFullscreenParam(input.playUrl)));
  zip.file(
    "imsmanifest.xml",
    buildManifest(input.title, [
      "index.html",
      "SCORM_API_wrapper.js",
      "adlcp_rootv1p2.xsd",
      "imscp_rootv1p1p2.xsd",
      "imsmd_rootv1p2p1.xsd",
    ]),
  );
  zip.file("SCORM_API_wrapper.js", assets.wrapper);
  zip.file("adlcp_rootv1p2.xsd", assets.adlcp);
  zip.file("imscp_rootv1p1p2.xsd", assets.imscp);
  zip.file("imsmd_rootv1p2p1.xsd", assets.imsmd);

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: {
      level: 9,
    },
  });
}

async function buildOfflineArchive(input: {
  draft: AnyExerciseDraft;
  title: string;
}) {
  const zip = new JSZip();
  const assets = await getAssets();
  const localized = await localizeDraftForOfflineExport(input.draft);
  const manifestFiles = [
    "index.html",
    "SCORM_API_wrapper.js",
    "adlcp_rootv1p2.xsd",
    "imscp_rootv1p1p2.xsd",
    "imsmd_rootv1p2p1.xsd",
    "player/index.html",
    "player/scorm-player.js",
    "player/scorm-player.css",
    ...localized.files.map((file) => file.archivePath),
  ];

  zip.file("index.html", buildWrapperIndexHtml(input.title, "player/index.html"));
  zip.file("imsmanifest.xml", buildManifest(input.title, manifestFiles));
  zip.file("SCORM_API_wrapper.js", assets.wrapper);
  zip.file("adlcp_rootv1p2.xsd", assets.adlcp);
  zip.file("imscp_rootv1p1p2.xsd", assets.imscp);
  zip.file("imsmd_rootv1p2p1.xsd", assets.imsmd);
  zip.file(
    "player/index.html",
    buildOfflinePlayerHtml(input.title, localized.draft, localized.mediaThumbnails),
  );
  zip.file("player/scorm-player.js", assets.offlinePlayerJs);
  zip.file("player/scorm-player.css", assets.offlinePlayerCss);

  for (const file of localized.files) {
    zip.file(file.archivePath, file.data);
  }

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: {
      level: 9,
    },
  });
}

async function prepareHostlessDraftForArchive(input: AnyExerciseDraft) {
  const draft = structuredClone(input);
  const files: ArchiveFile[] = [];
  const convertedAudioUrlMap = new Map<string, Promise<string>>();
  const convertedVideoUrlMap = new Map<string, Promise<string>>();
  const localizedThumbnailMap = new Map<string, Promise<string | null>>();
  const mediaThumbnails = new Map<string, string>();
  let assetCounter = 0;

  const persistArchiveAsset = (
    kind: OfflineAssetKind,
    resource: {
      buffer: Buffer;
      contentType: string;
      url?: string;
    },
    source: string,
    preferredExtension?: string | null,
  ) => {
    const remoteUrl =
      "url" in resource && typeof resource.url === "string" ? resource.url : source;
    const normalizedContentType = resource.contentType || "application/octet-stream";
    assertContentTypeMatchesKind(kind, normalizedContentType, remoteUrl);
    const extension =
      normalizeExtension(preferredExtension) ??
      getExtensionFromMimeType(normalizedContentType) ??
      getExtensionFromRemoteUrl(remoteUrl) ??
      DEFAULT_EXTENSION_BY_KIND[kind];
    const assetNumber = assetCounter + 1;
    assetCounter += 1;
    const fileName = `${kind}-${String(assetNumber).padStart(3, "0")}.${extension}`;
    const archivePath = `player/assets/${fileName}`;

    files.push({
      archivePath,
      data: resource.buffer,
    });

    return `./assets/${fileName}`;
  };

  const localizeConvertibleAudioUrl = async (url: string) => {
    const source = url.trim();
    if (!source) {
      return source;
    }

    const existingPromise = convertedAudioUrlMap.get(source);
    if (existingPromise) {
      return existingPromise;
    }

    const nextPromise = (async () => {
      const provider = getConvertibleAudioProvider(source);
      if (!provider) {
        return source;
      }

      const storedAsset = await getStoredAudioAsset(source);
      if (storedAsset) {
        return persistArchiveAsset(
          "audio",
          {
            buffer: storedAsset.buffer,
            contentType: storedAsset.contentType,
            url: source,
          },
          source,
          storedAsset.extension,
        );
      }

      try {
        const resolvedSource = await verifyConvertibleAudioSource(source);
        const convertedAsset = await convertAudioSourceToPlayableAsset(resolvedSource);

        await storeConvertedAudioAsset(source, provider, convertedAsset).catch(
          () => undefined,
        );

        return persistArchiveAsset(
          "audio",
          {
            buffer: convertedAsset.buffer,
            contentType: convertedAsset.contentType,
            url: source,
          },
          source,
          convertedAsset.extension,
        );
      } catch (error) {
        throw new ScormArchiveError(
          error instanceof Error
              ? `Не удалось подготовить аудио для автономного архива: ${error.message}`
              : "Не удалось подготовить аудио для автономного архива.",
          502,
        );
      }
    })();

    convertedAudioUrlMap.set(source, nextPromise);
    return nextPromise;
  };

  const localizeVideoThumbnail = async (url: string) => {
    const source = url.trim();
    if (!source) {
      return null;
    }

    const existingPromise = localizedThumbnailMap.get(source);
    if (existingPromise) {
      return existingPromise;
    }

    const nextPromise = (async () => {
      let parsedUrl: URL;

      try {
        parsedUrl = new URL(source);
      } catch {
        return null;
      }

      if (!isExternalVideoServiceHost(parsedUrl.hostname)) {
        return null;
      }

      try {
        const thumbnailUrl = await resolveMediaThumbnailUrl(source);
        if (!thumbnailUrl) {
          return null;
        }

        const thumbnailResource = thumbnailUrl.toLowerCase().startsWith("data:")
          ? decodeDataUrl(thumbnailUrl)
          : await downloadRemoteAsset(thumbnailUrl);
        return persistArchiveAsset("image", thumbnailResource, thumbnailUrl);
      } catch {
        return null;
      }
    })();

    localizedThumbnailMap.set(source, nextPromise);
    return nextPromise;
  };

  const localizeHostlessVideoUrl = async (url: string) => {
    const source = url.trim();
    if (!source) {
      return source;
    }

    const existingPromise = convertedVideoUrlMap.get(source);
    if (existingPromise) {
      return existingPromise;
    }

    const nextPromise = (async () => {
      let parsedUrl: URL;

      try {
        parsedUrl = new URL(source);
      } catch {
        return source;
      }

      if (source.toLowerCase().startsWith("data:")) {
        return persistArchiveAsset("video", decodeDataUrl(source), source);
      }

      try {
        if (isExternalVideoServiceHost(parsedUrl.hostname)) {
          const convertedAsset = await convertVideoSourceToPlayableAsset(source);
          return persistArchiveAsset(
            "video",
            {
              buffer: convertedAsset.buffer,
              contentType: convertedAsset.contentType,
              url: source,
            },
            source,
            convertedAsset.extension,
          );
        }

        return persistArchiveAsset("video", await downloadRemoteAsset(source), source);
      } catch (error) {
        throw new ScormArchiveError(
          error instanceof Error
            ? `Не удалось подготовить видео для автономного архива: ${error.message}`
            : "Не удалось подготовить видео для автономного архива.",
          502,
        );
      }
    })();

    convertedVideoUrlMap.set(source, nextPromise);
    return nextPromise;
  };

  const prepareMatchingSide = async (side: MatchingPairSide): Promise<MatchingPairSide> => {
    if (typeof side === "string") {
      return side;
    }

    switch (side.kind) {
      case "audio":
        return {
          ...side,
          url: await localizeConvertibleAudioUrl(side.url),
        } satisfies MatchingAudioContent;
      case "video":
        {
          const source = side.url.trim();
          const localizedUrl = await localizeHostlessVideoUrl(source);
          const thumbnailUrl = await localizeVideoThumbnail(source);
          if (thumbnailUrl) {
            mediaThumbnails.set(localizedUrl, thumbnailUrl);
          }

          return {
            ...side,
            url: localizedUrl,
          } satisfies MatchingVideoContent;
        }
      default:
        return side;
    }
  };

  switch (draft.type) {
    case "matching-pairs":
      draft.data.pairs = await Promise.all(
        draft.data.pairs.map(async (pair) => ({
          ...pair,
          left: await prepareMatchingSide(pair.left),
          right: await prepareMatchingSide(pair.right),
        })),
      );
      draft.data.extras = await Promise.all(
        (draft.data.extras ?? []).map(async (extra) => ({
          ...extra,
          content: await prepareMatchingSide(extra.content),
        })),
      );
      break;
    case "group-assignment":
      draft.data.groups = await Promise.all(
        draft.data.groups.map(async (group) => ({
          ...group,
          items: await Promise.all(group.items.map((item) => prepareMatchingSide(item))),
        })),
      );
      break;
    case "media-notices":
      if (draft.data.mediaKind === "audio") {
        draft.data.mediaUrl = await localizeConvertibleAudioUrl(draft.data.mediaUrl);
      } else {
        const source = draft.data.mediaUrl.trim();
        const localizedMediaUrl = await localizeHostlessVideoUrl(draft.data.mediaUrl);
        draft.data.mediaUrl = localizedMediaUrl;

        const thumbnailUrl = await localizeVideoThumbnail(source);
        if (thumbnailUrl) {
          mediaThumbnails.set(localizedMediaUrl, thumbnailUrl);
        }
      }
      break;
    default:
      break;
  }

  return {
    draft,
    files,
    mediaThumbnails: Object.fromEntries(mediaThumbnails),
  };
}

async function buildHostlessArchive(input: {
  draft: AnyExerciseDraft;
  title: string;
}) {
  const zip = new JSZip();
  const assets = await getAssets();
  const prepared = await prepareHostlessDraftForArchive(input.draft);
  const manifestFiles = [
    "index.html",
    "SCORM_API_wrapper.js",
    "adlcp_rootv1p2.xsd",
    "imscp_rootv1p1p2.xsd",
    "imsmd_rootv1p2p1.xsd",
    "player/index.html",
    "player/scorm-player.js",
    "player/scorm-player.css",
    ...prepared.files.map((file) => file.archivePath),
  ];

  zip.file("index.html", buildWrapperIndexHtml(input.title, "player/index.html"));
  zip.file("imsmanifest.xml", buildManifest(input.title, manifestFiles));
  zip.file("SCORM_API_wrapper.js", assets.wrapper);
  zip.file("adlcp_rootv1p2.xsd", assets.adlcp);
  zip.file("imscp_rootv1p1p2.xsd", assets.imscp);
  zip.file("imsmd_rootv1p2p1.xsd", assets.imsmd);
  zip.file(
    "player/index.html",
    buildOfflinePlayerHtml(input.title, prepared.draft, prepared.mediaThumbnails),
  );
  zip.file("player/scorm-player.js", assets.offlinePlayerJs);
  zip.file("player/scorm-player.css", assets.offlinePlayerCss);

  for (const file of prepared.files) {
    zip.file(file.archivePath, file.data);
  }

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: {
      level: 9,
    },
  });
}

export async function generateScormArchive(input: {
  draft: AnyExerciseDraft;
  title: string;
  playUrl?: string | null;
  variant?: ScormArchiveVariant;
}) {
  const variant = input.variant ?? "scorm1";

  if (variant === "scorm3") {
    return buildHostlessArchive({
      draft: input.draft,
      title: input.title,
    });
  }

  if (!input.playUrl) {
    throw new ScormArchiveError("Для стандартного SCORM-экспорта нужен play URL.", 500);
  }

  return buildOnlineArchive({
    title: input.title,
    playUrl: input.playUrl,
  });
}
