"use client";

import Link from "next/link";
import {
  useEffect,
  useDeferredValue,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
} from "react";
import { useRouter } from "next/navigation";
import { ClassificationEditor } from "@/components/classification-editor";
import { ExercisePlayer } from "@/components/exercise-player";
import { MatchingPairsEditor } from "@/components/matching-pairs-editor";
import {
  createDefaultDraft,
  exerciseDefinitionMap,
  parseDraft,
} from "@/lib/exercise-definitions";
import {
  collectDraftAssetSources,
  createDraftEmbeddedAssetUrl,
  DRAFT_JSON_FORMAT,
  DRAFT_JSON_VERSION,
  replaceDraftAssetUrls,
  type DraftJsonEmbeddedAsset,
} from "@/lib/draft-json";
import type {
  AnyExerciseDraft,
  GroupAssignmentData,
  MatchingPairsData,
  PublicUser,
} from "@/lib/types";
import { safeFilename } from "@/lib/utils";

type EditorNoticeScope = "mesh" | "draft";
type EditorNotice = {
  message: string;
  scope: EditorNoticeScope;
};

type ExportVariant = "scorm1" | "scorm3";
type ExportTaskState = {
  downloadedBytes: number;
  fileName: string;
  phase: "preparing" | "downloading";
  totalBytes: number | null;
  variant: ExportVariant;
};

function getExportArchiveFilename(title: string, variant: ExportVariant) {
  return `${safeFilename(title)}${
    variant === "scorm3" ? "-autonomous-scorm" : ""
  }.zip`;
}

function parseContentDispositionFilename(value: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const utf8Match = trimmed.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]).trim();
    } catch {
      return utf8Match[1].trim();
    }
  }

  const quotedMatch = trimmed.match(/filename\s*=\s*"([^"]+)"/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1].trim();
  }

  const plainMatch = trimmed.match(/filename\s*=\s*([^;]+)/i);
  return plainMatch?.[1]?.trim() || null;
}

function formatByteSize(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 Б";
  }

  const units = ["Б", "КБ", "МБ", "ГБ"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const digits = size >= 100 || unitIndex === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

function stripTransientObjectUrls<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripTransientObjectUrls(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, currentValue]) => [
        key,
        key === "url" &&
        typeof currentValue === "string" &&
        currentValue.trim().startsWith("blob:")
          ? ""
          : stripTransientObjectUrls(currentValue),
      ]),
    ) as T;
  }

  return value;
}

type DraftJsonImportSource = {
  assets?: unknown;
  draft?: unknown;
};

function getBrowserOrigin() {
  if (typeof window === "undefined") {
    return null;
  }

  const { origin, protocol } = window.location;
  if ((protocol !== "http:" && protocol !== "https:") || !origin || origin === "null") {
    return null;
  }

  return origin;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Не удалось подготовить файл для JSON-экспорта."));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("Не удалось подготовить файл для JSON-экспорта."));
    };

    reader.readAsDataURL(blob);
  });
}

async function downloadDraftEmbeddedAsset(sourceUrl: string, fileName: string) {
  const response = await fetch(sourceUrl);

  if (!response.ok) {
    throw new Error(`Не удалось прочитать файл «${fileName}» для JSON-экспорта.`);
  }

  const blob = await response.blob();
  const contentType =
    blob.type ||
    response.headers.get("Content-Type")?.split(";")[0]?.trim() ||
    "application/octet-stream";

  return {
    contentType,
    dataUrl: await blobToDataUrl(blob),
    fileName,
  };
}

function parseDraftJsonEmbeddedAssets(input: unknown) {
  if (!Array.isArray(input)) {
    return [] as DraftJsonEmbeddedAsset[];
  }

  return input.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const raw = item as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const sourceUrl = typeof raw.sourceUrl === "string" ? raw.sourceUrl.trim() : "";
    const fileName = typeof raw.fileName === "string" ? raw.fileName.trim() : "";
    const dataUrl = typeof raw.dataUrl === "string" ? raw.dataUrl.trim() : "";

    if (!id || !sourceUrl || !fileName || !dataUrl) {
      return [];
    }

    return [
      {
        contentType:
          typeof raw.contentType === "string" && raw.contentType.trim()
            ? raw.contentType.trim()
            : undefined,
        dataUrl,
        fileName,
        id,
        sourceUrl,
      } satisfies DraftJsonEmbeddedAsset,
    ];
  });
}

async function buildDraftJsonExportPayload(draft: AnyExerciseDraft) {
  const assetSources = collectDraftAssetSources(draft, getBrowserOrigin());
  const embeddedAssets: DraftJsonEmbeddedAsset[] = [];
  const assetUrlLookup = new Map<string, string>();

  for (const [index, assetSource] of assetSources.entries()) {
    const assetId = `asset-${index + 1}`;
    const embeddedAsset = await downloadDraftEmbeddedAsset(
      assetSource.sourceUrl,
      assetSource.fileName,
    );

    embeddedAssets.push({
      ...embeddedAsset,
      id: assetId,
      sourceUrl: assetSource.sourceUrl,
    });
    assetUrlLookup.set(
      assetSource.sourceUrl,
      createDraftEmbeddedAssetUrl(assetId),
    );
  }

  return {
    assets: embeddedAssets,
    draft: replaceDraftAssetUrls(structuredClone(draft), assetUrlLookup),
    exportedAt: new Date().toISOString(),
    format: DRAFT_JSON_FORMAT,
    version: DRAFT_JSON_VERSION,
  };
}

function restoreDraftJsonAssets(
  draft: AnyExerciseDraft,
  assets: DraftJsonEmbeddedAsset[],
) {
  if (assets.length === 0) {
    return draft;
  }

  const assetUrlLookup = new Map<string, string>();

  for (const asset of assets) {
    assetUrlLookup.set(createDraftEmbeddedAssetUrl(asset.id), asset.dataUrl);
    assetUrlLookup.set(asset.sourceUrl, asset.dataUrl);
  }

  return replaceDraftAssetUrls(draft, assetUrlLookup);
}

function isDataUrl(value: string) {
  return value.trim().startsWith("data:");
}

function dataUrlToFile(
  dataUrl: string,
  fileName: string,
  contentType?: string,
) {
  const trimmed = dataUrl.trim();
  const match = trimmed.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);

  if (!match) {
    throw new Error(`Не удалось подготовить файл «${fileName}».`);
  }

  const [, detectedContentType, isBase64, payload] = match;
  const resolvedContentType =
    contentType || detectedContentType || "application/octet-stream";
  let bytes: Uint8Array;

  if (isBase64) {
    const normalizedPayload = payload.replace(/\s+/g, "");
    const decoded = atob(normalizedPayload);
    bytes = new Uint8Array(decoded.length);

    for (let index = 0; index < decoded.length; index += 1) {
      bytes[index] = decoded.charCodeAt(index);
    }
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(payload));
  }

  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);

  return new File([buffer], fileName || "media.bin", {
    type: resolvedContentType,
  });
}

async function uploadDraftDataUrlAsset(input: {
  contentType?: string;
  dataUrl: string;
  fileName: string;
}) {
  const formData = new FormData();
  formData.set(
    "file",
    dataUrlToFile(input.dataUrl, input.fileName, input.contentType),
  );

  const uploadResponse = await fetch("/api/media/stored", {
    method: "POST",
    body: formData,
  });
  const uploadResult = (await uploadResponse.json().catch(() => null)) as
    | { error?: string; url?: string }
    | null;

  if (!uploadResponse.ok || !uploadResult?.url) {
    throw new Error(
      uploadResult?.error ??
        `Не удалось сохранить файл «${input.fileName}» на сервере.`,
    );
  }

  return uploadResult.url;
}

async function persistDraftEmbeddedVideoAssets(draft: AnyExerciseDraft) {
  const uploadLookup = new Map<string, Promise<string>>();

  const visit = async (value: unknown): Promise<unknown> => {
    if (Array.isArray(value)) {
      return Promise.all(value.map((item) => visit(item)));
    }

    if (!value || typeof value !== "object") {
      return value;
    }

    const record = value as Record<string, unknown>;
    const rawKind = typeof record.kind === "string" ? record.kind : "";
    const rawUrl = typeof record.url === "string" ? record.url.trim() : "";
    const rawFileName =
      typeof record.fileName === "string" && record.fileName.trim()
        ? record.fileName.trim()
        : "video.mp4";
    const rawContentType =
      typeof record.contentType === "string" ? record.contentType.trim() : undefined;

    if (rawKind === "video" && rawUrl && isDataUrl(rawUrl)) {
      if (!uploadLookup.has(rawUrl)) {
        uploadLookup.set(
          rawUrl,
          uploadDraftDataUrlAsset({
            contentType: rawContentType,
            dataUrl: rawUrl,
            fileName: rawFileName,
          }),
        );
      }

      return {
        ...record,
        url: await uploadLookup.get(rawUrl),
      };
    }

    const entries = await Promise.all(
      Object.entries(record).map(async ([key, currentValue]) => [
        key,
        await visit(currentValue),
      ]),
    );

    return Object.fromEntries(entries);
  };

  return (await visit(structuredClone(draft))) as AnyExerciseDraft;
}

export function StudioEditor({
  initialDraft,
  user,
  mode,
  existingId = null,
  existingSlug = null,
}: Readonly<{
  initialDraft: AnyExerciseDraft;
  user: PublicUser | null;
  mode: "create" | "edit";
  existingId?: string | null;
  existingSlug?: string | null;
}>) {
  const router = useRouter();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const previewHostRef = useRef<HTMLDivElement | null>(null);
  const meshExportRef = useRef<HTMLDivElement | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const [draft, setDraft] = useState(initialDraft);
  const [currentId, setCurrentId] = useState(existingId);
  const [currentSlug, setCurrentSlug] = useState(existingSlug);
  const [dataText, setDataText] = useState(
    JSON.stringify(initialDraft.data, null, 2),
  );
  const [dataError, setDataError] = useState<string | null>(null);
  const [notice, setNotice] = useState<EditorNotice | null>(null);
  const [exportTask, setExportTask] = useState<ExportTaskState | null>(null);
  const [isDraftMediaPreparing, setIsDraftMediaPreparing] = useState(false);
  const [isJsonTransferBusy, setIsJsonTransferBusy] = useState(false);
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);
  const [isMeshExportOpen, setIsMeshExportOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const deferredDraft = useDeferredValue(draft);
  const definition = exerciseDefinitionMap[draft.type];
  const isMatchingPairs = draft.type === "matching-pairs";
  const isClassification = draft.type === "group-assignment";
  const isCustomVisualEditor = isMatchingPairs || isClassification;
  const isEditorBusy =
    isPending ||
    Boolean(exportTask) ||
    isJsonTransferBusy ||
    isDraftMediaPreparing;
  const matchingPairsData = isMatchingPairs
    ? (draft.data as MatchingPairsData)
    : null;
  const classificationData = isClassification
    ? (draft.data as GroupAssignmentData)
    : null;
  const showNotice = (
    message: string | null,
    scope: EditorNoticeScope = "draft",
  ) => {
    setNotice(message ? { message, scope } : null);
  };

  const cancelExportDownload = () => {
    exportAbortRef.current?.abort();
  };

  const downloadExportArchive = async (
    endpoint: string,
    payload: {
      id: string | null;
      draft: AnyExerciseDraft;
      action: "export";
      variant: ExportVariant;
    },
  ) => {
    const fallbackFileName = getExportArchiveFilename(payload.draft.title, payload.variant);
    const controller = new AbortController();
    exportAbortRef.current = controller;
    setExportTask({
      downloadedBytes: 0,
      fileName: fallbackFileName,
      phase: "preparing",
      totalBytes: null,
      variant: payload.variant,
    });

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        showNotice(
          result?.error ?? "Операция завершилась с ошибкой.",
          "mesh",
        );
        return;
      }

      const fileName =
        parseContentDispositionFilename(response.headers.get("Content-Disposition")) ||
        fallbackFileName;
      const totalBytesHeader = response.headers.get("Content-Length");
      const totalBytes = totalBytesHeader ? Number.parseInt(totalBytesHeader, 10) : Number.NaN;
      const normalizedTotalBytes =
        Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : null;

      setExportTask((current) =>
        current
          ? {
              ...current,
              fileName,
              phase: "downloading",
              totalBytes: normalizedTotalBytes,
            }
          : current,
      );

      let blob: Blob;
      if (!response.body) {
        blob = await response.blob();
        setExportTask((current) =>
          current
            ? {
                ...current,
                downloadedBytes: blob.size,
                totalBytes: blob.size,
              }
            : current,
        );
      } else {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let downloadedBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          if (!value) {
            continue;
          }

          chunks.push(value);
          downloadedBytes += value.byteLength;
          setExportTask((current) =>
            current
              ? {
                  ...current,
                  downloadedBytes,
                }
              : current,
          );
        }

        blob = new Blob(
          chunks.map((chunk) => chunk.slice().buffer as ArrayBuffer),
          { type: "application/zip" },
        );
      }

      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(downloadUrl);

      const appId = response.headers.get("x-app-id");
      const appSlug = response.headers.get("x-app-slug");

      if (appId) {
        setCurrentId(appId);
      }

      if (appSlug) {
        setCurrentSlug(appSlug);
      }

      showNotice(
        payload.variant === "scorm3"
          ? "Автономный архив для МЭШ скачан."
          : "Архив для МЭШ скачан.",
        "mesh",
      );

      if (mode === "create" && user && appId) {
        router.replace(`/edit/${appId}`);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        showNotice("Скачивание архива отменено.", "mesh");
        return;
      }

      showNotice(
        error instanceof Error ? error.message : "Операция не завершилась.",
        "mesh",
      );
    } finally {
      if (exportAbortRef.current === controller) {
        exportAbortRef.current = null;
      }
      setExportTask(null);
    }
  };

  useEffect(() => {
    return () => {
      exportAbortRef.current?.abort();
    };
  }, []);

  const setDraftData = (
    nextData: AnyExerciseDraft["data"],
    nextNotice: string | null = null,
  ) => {
    setDraft((current) => ({
      ...current,
      data: nextData,
    }) as AnyExerciseDraft);
    setDataText(
      JSON.stringify(
        isCustomVisualEditor ? stripTransientObjectUrls(nextData) : nextData,
        null,
        2,
      ),
    );
    setDataError(null);
    showNotice(nextNotice, "draft");
  };

  const resolveCurrentDraft = (options?: { stripTransientUrls?: boolean }) => {
    if (isCustomVisualEditor) {
      const shouldStripTransientUrls = options?.stripTransientUrls !== false;
      return {
        ...draft,
        data: shouldStripTransientUrls
          ? stripTransientObjectUrls(draft.data)
          : draft.data,
      } as AnyExerciseDraft;
    }

    const parsed = applyDataText();
    if (!parsed) {
      return null;
    }

    return {
      ...draft,
      data: parsed,
    } as AnyExerciseDraft;
  };

  const applyDataText = () => {
    try {
      const parsed = JSON.parse(dataText) as AnyExerciseDraft["data"];
      setDraftData(parsed, "Превью обновлено.");
      return parsed;
    } catch (error) {
      setDataError(
        error instanceof Error ? error.message : "Не удалось разобрать JSON.",
      );
      return null;
    }
  };

  const handleReset = () => {
    const next = createDefaultDraft(draft.type);
    setDraft(next as AnyExerciseDraft);
    setDataText(JSON.stringify(next.data, null, 2));
    setDataError(null);
    showNotice("Шаблон сброшен к начальному состоянию.");
  };

  const persistDraft = (
    endpoint: string,
    action: "save" | "publish" | "export",
    variant: ExportVariant = "scorm1",
  ) => {
    const resolvedDraft = resolveCurrentDraft();
    if (!resolvedDraft) {
      return;
    }

    if (action === "export") {
      void (async () => {
        setIsDraftMediaPreparing(true);

        try {
          const preparedDraft = await persistDraftEmbeddedVideoAssets(resolvedDraft);
          await downloadExportArchive(endpoint, {
            id: currentId,
            draft: preparedDraft,
            action: "export",
            variant,
          });
        } catch (error) {
          showNotice(
            error instanceof Error ? error.message : "Операция не завершилась.",
            "mesh",
          );
        } finally {
          setIsDraftMediaPreparing(false);
        }
      })();
      return;
    }

    startTransition(async () => {
      setIsDraftMediaPreparing(true);

      try {
        const preparedDraft = await persistDraftEmbeddedVideoAssets(resolvedDraft);
        const payload = {
          action,
          draft: preparedDraft,
          id: currentId,
        };
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const result = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          showNotice(
            result?.error ?? "Операция завершилась с ошибкой.",
            "draft",
          );
          return;
        }

        if (action === "save" || action === "publish") {
          const result = (await response.json()) as {
            app: { id: string; slug: string };
          };
          setCurrentId(result.app.id);
          setCurrentSlug(result.app.slug);
          showNotice(
            action === "publish"
              ? "Упражнение опубликовано."
              : "Упражнение сохранено.",
          );
          if (action === "publish") {
            router.push(`/play/${result.app.slug}`);
            return;
          }
          if (mode === "create") {
            router.replace(`/edit/${result.app.id}`);
          }
          return;
        }

        const blob = await response.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = downloadUrl;
        anchor.download = `${safeFilename(resolvedDraft.title)}${
          variant === "scorm3" ? "-autonomous-scorm" : ""
        }.zip`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(downloadUrl);

        const appId = response.headers.get("x-app-id");
        const appSlug = response.headers.get("x-app-slug");

        if (appId) {
          setCurrentId(appId);
        }

        if (appSlug) {
          setCurrentSlug(appSlug);
        }

        showNotice(
          variant === "scorm3"
            ? "Автономный архив для МЭШ скачан."
            : "Архив для МЭШ скачан.",
          "mesh",
        );
        if (mode === "create" && user && appId) {
          router.replace(`/edit/${appId}`);
        }
      } catch (error) {
        showNotice(
          error instanceof Error ? error.message : "Операция не завершилась.",
          "draft",
        );
      } finally {
        setIsDraftMediaPreparing(false);
      }
    });
  };

  const handleJsonExport = async () => {
    const resolvedDraft = resolveCurrentDraft({ stripTransientUrls: false });
    if (!resolvedDraft) {
      return;
    }

    setIsJsonTransferBusy(true);

    try {
      const exportPayload = await buildDraftJsonExportPayload(resolvedDraft);
      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
        type: "application/json",
      });
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = `${safeFilename(resolvedDraft.title)}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(downloadUrl);
      showNotice(
        exportPayload.assets.length > 0
          ? "JSON-экспорт скачан вместе с вложенными файлами."
          : "JSON-экспорт скачан.",
      );
    } catch (error) {
      showNotice(
        error instanceof Error ? error.message : "Не удалось скачать JSON.",
      );
    } finally {
      setIsJsonTransferBusy(false);
    }
  };

  const handleJsonImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setIsJsonTransferBusy(true);

    try {
      const source = JSON.parse(await file.text()) as
        | DraftJsonImportSource
        | AnyExerciseDraft;
      const importedAssets =
        source && typeof source === "object" && "assets" in source
          ? parseDraftJsonEmbeddedAssets(source.assets)
          : [];
      const importedDraft = parseDraft(
        source && typeof source === "object" && "draft" in source
          ? source.draft
          : source,
      );

      if (!importedDraft) {
        showNotice("Файл не похож на экспорт упражнения.");
        return;
      }

      const restoredDraft = restoreDraftJsonAssets(
        importedDraft,
        importedAssets,
      );

      setDraft(restoredDraft);
      setDataText(JSON.stringify(restoredDraft.data, null, 2));
      setDataError(null);
      showNotice(
        importedAssets.length > 0
          ? "Черновик импортирован вместе со своими файлами."
          : "Черновик импортирован из JSON.",
      );
    } catch (error) {
      showNotice(
        error instanceof Error ? error.message : "Не удалось импортировать JSON.",
      );
    } finally {
      setIsJsonTransferBusy(false);
    }
  };

  const handleSave = () => {
    if (!user) {
      showNotice(
        "Для сохранения и дальнейшего редактирования войдите в аккаунт.",
      );
      return;
    }

    persistDraft("/api/apps", "save");
  };

  const handlePublish = () => {
    persistDraft("/api/apps", "publish");
  };

  const handleExport = (variant: ExportVariant) => {
    setIsMeshExportOpen(false);
    persistDraft("/api/export", "export", variant);
  };

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const getPreviewFullscreenTarget = () =>
      isMatchingPairs
        ? (previewHostRef.current?.querySelector(".exercise-player__body") as HTMLElement | null)
        : previewHostRef.current;

    const syncFullscreenState = () => {
      setIsPreviewFullscreen(document.fullscreenElement === getPreviewFullscreenTarget());
    };

    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
    };
  }, [isMatchingPairs]);

  useEffect(() => {
    if (!isMeshExportOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (
        meshExportRef.current &&
        event.target instanceof Node &&
        !meshExportRef.current.contains(event.target)
      ) {
        setIsMeshExportOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMeshExportOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMeshExportOpen]);

  const togglePreviewFullscreen = async () => {
    if (typeof document === "undefined") {
      return;
    }

    const target = isMatchingPairs
      ? (previewHostRef.current?.querySelector(".exercise-player__body") as HTMLElement | null)
      : previewHostRef.current;

    if (document.fullscreenElement === target) {
      await document.exitFullscreen();
      return;
    }

    await target?.requestFullscreen();
  };

  const exportProgressPercent =
    exportTask && exportTask.totalBytes && exportTask.totalBytes > 0
      ? Math.min(100, Math.round((exportTask.downloadedBytes / exportTask.totalBytes) * 100))
      : null;
  const exportProgressSummary = exportTask
    ? exportTask.totalBytes && exportTask.totalBytes > 0
      ? `${formatByteSize(exportTask.downloadedBytes)} из ${formatByteSize(exportTask.totalBytes)}`
      : exportTask.phase === "preparing"
        ? "Сервер собирает архив"
        : formatByteSize(exportTask.downloadedBytes)
    : "";
  const exportTaskBlock = exportTask ? (
    <div className="mesh-export-progress" data-card-interactive="true" role="status" aria-live="polite">
      <div className="mesh-export-progress__dialog">
        <div className="stack">
          <strong>
            {exportTask.phase === "preparing"
              ? "Подготавливаем архив"
              : "Скачиваем архив"}
          </strong>
          <span className="editor-hint">{exportTask.fileName}</span>
        </div>
        <div
          className={`mesh-export-progress__bar ${
            exportProgressPercent === null ? "mesh-export-progress__bar--indeterminate" : ""
          }`}
          aria-hidden="true"
        >
          <span
            className="mesh-export-progress__fill"
            style={
              exportProgressPercent === null
                ? undefined
                : { width: `${Math.max(exportProgressPercent, 4)}%` }
            }
          />
        </div>
        <div className="mesh-export-progress__meta">
          <span>
            {exportTask.phase === "preparing"
              ? "Создаём SCORM-архив и собираем вложенные файлы."
              : exportProgressPercent !== null
                ? `${exportProgressPercent}%`
                : "Скачиваем ответ сервера."}
          </span>
          <span>{exportProgressSummary}</span>
        </div>
        <button className="ghost-button" type="button" onClick={cancelExportDownload}>
          Отменить скачивание
        </button>
      </div>
    </div>
  ) : null;

  const meshExportBlock = (
    <div className="editor-block">
      <div className="editor-block__head">
        <div>
          <strong>Скачать для МЭШ</strong>
        </div>
      </div>

      <div className="mesh-export" ref={meshExportRef}>
        <button
          className="primary-button"
          disabled={isEditorBusy}
          type="button"
          onClick={() => setIsMeshExportOpen((current) => !current)}
        >
          Скачать для МЭШ
        </button>

        {isMeshExportOpen ? (
          <div className="mesh-export__menu">
            <button
              className="ghost-button mesh-export__option"
              disabled={isEditorBusy}
              type="button"
              onClick={() => handleExport("scorm1")}
            >
              <span className="mesh-export__option-title">Обычная версия</span>
              <span className="mesh-export__option-text">
                Стандартный архив для публикации в МЭШ.
              </span>
            </button>
            <button
              className="ghost-button mesh-export__option"
              disabled={isEditorBusy}
              type="button"
              onClick={() => handleExport("scorm3")}
            >
              <span className="mesh-export__option-title">Автономный</span>
              <span className="mesh-export__option-text">
                Этот архив не зависит от хостинга проекта, все медиа хранятся в архиве.
              </span>
            </button>
          </div>
        ) : null}
      </div>

      <p className="editor-hint">
        Выберите обычный или автономный вариант архива перед скачиванием.
      </p>
      {notice?.scope === "mesh" ? (
        <p className="editor-hint">{notice.message}</p>
      ) : null}
    </div>
  );

  const draftActionsBlock = (
    <details className="editor-block editor-details">
      <summary className="editor-details__summary">Другие действия</summary>

      <div className="inline-actions">
        <button
          className="primary-button"
          disabled={isEditorBusy}
          type="button"
          onClick={handlePublish}
        >
          Опубликовать
        </button>
        <button
          className="ghost-button"
          disabled={isEditorBusy}
          type="button"
          onClick={handleSave}
        >
          Сохранить
        </button>
        <button
          className="ghost-button"
          disabled={isEditorBusy}
          type="button"
          onClick={handleJsonExport}
        >
          Скачать JSON
        </button>
        <button
          className="ghost-button"
          disabled={isEditorBusy}
          type="button"
          onClick={() => importInputRef.current?.click()}
        >
          Импорт JSON
        </button>
        <button className="ghost-button" type="button" onClick={handleReset}>
          Сбросить пример
        </button>
        {!isMatchingPairs ? (
          <button className="ghost-button" type="button" onClick={applyDataText}>
            Обновить превью
          </button>
        ) : null}
      </div>

      <input
        ref={importInputRef}
        accept=".json,application/json"
        hidden
        type="file"
        onChange={(event) => void handleJsonImport(event)}
      />

      {currentSlug ? (
        <p className="editor-hint">
          Публичная ссылка:{" "}
          <Link href={`/play/${currentSlug}`}>{`/play/${currentSlug}`}</Link>
        </p>
      ) : null}
      {notice?.scope === "draft" ? (
        <p className="editor-hint">{notice.message}</p>
      ) : null}
    </details>
  );

  const matchingPreviewDraft = isMatchingPairs
    ? ({
        ...deferredDraft,
        title: "Пары терминов",
        description: "Соедините элементы из левого и правого столбцов.",
        instructions:
          "Перетаскивайте карточки по полю. Когда правильные элементы окажутся рядом, они соединятся и будут двигаться уже вместе. Карточку можно таскать за любую ее неинтерактивную область, а разъединение находится между соединенными элементами.",
        successMessage: "Все пары собраны верно.",
      } as AnyExerciseDraft)
    : deferredDraft;
  const previewDraft = isMatchingPairs ? matchingPreviewDraft : deferredDraft;
  const showPreviewHead = !(isPreviewFullscreen && isCustomVisualEditor);

  const previewBlock = (
    <div
      className={`editor-block ${isPreviewFullscreen ? "editor-block--preview-fullscreen" : ""}`}
      ref={previewHostRef}
    >
      {showPreviewHead ? (
        <div className="editor-block__head">
          <div>
            <strong>Предварительный просмотр</strong>
          </div>
        </div>
      ) : null}
      <ExercisePlayer
        boardOnly={isCustomVisualEditor && isPreviewFullscreen}
        bodyOverlay={
          <button
            aria-label={isPreviewFullscreen ? "Свернуть" : "На весь экран"}
            className="preview-fullscreen-button"
            title={isPreviewFullscreen ? "Свернуть" : "На весь экран"}
            type="button"
            onClick={() => void togglePreviewFullscreen()}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              {isPreviewFullscreen ? (
                <path
                  d="M9 4H4v5m11-5h5v5M4 15v5h5m10-5v5h-5"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
              ) : (
                <path
                  d="M9 4H4v5m0-5 6 6m5-6h5v5m0-5-6 6M4 15v5h5m-5 0 6-6m9 6h-5m5 0-6-6"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
              )}
            </svg>
          </button>
        }
        compactHead={isMatchingPairs}
        draft={previewDraft}
        fullscreen={isPreviewFullscreen}
        key={JSON.stringify(previewDraft)}
      />
    </div>
  );

  return (
    <div className={`editor-shell ${isCustomVisualEditor ? "editor-shell--single" : ""}`}>
      <aside className="editor-sidebar">
        {!isCustomVisualEditor ? (
          <div className="editor-block editor-block--hero">
            <span className="eyebrow">Редактор упражнения</span>
            <h2>{definition.title}</h2>
            <p>{definition.shortDescription}</p>
            <div className="editor-status-list">
              <span className="tag">
                {mode === "create" ? "Новый черновик" : "Редактирование"}
              </span>
              <span className="tag">
                {isMatchingPairs ? "Упрощенный поток" : "Стандартный режим"}
              </span>
            </div>
          </div>
        ) : null}

        <details className="editor-block editor-details" open>
          <summary className="editor-details__summary">Основная информация</summary>

          <label className="matching-editor-field" htmlFor="title">
            <span className="field-label">Название</span>
            <input
              className="editor-input"
              id="title"
              value={draft.title}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  title: event.target.value,
                }) as AnyExerciseDraft)
              }
            />
          </label>

          <label className="matching-editor-field" htmlFor="description">
            <span className="field-label">Описание</span>
            <textarea
              className="editor-textarea"
              id="description"
              rows={3}
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }) as AnyExerciseDraft)
              }
            />
          </label>

          {!isMatchingPairs ? (
            <>
              <label className="matching-editor-field" htmlFor="instructions">
                <span className="field-label">Инструкция</span>
                <textarea
                  className="editor-textarea"
                  id="instructions"
                  rows={3}
                  value={draft.instructions}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      instructions: event.target.value,
                    }) as AnyExerciseDraft)
                  }
                />
              </label>

              <label className="matching-editor-field" htmlFor="successMessage">
                <span className="field-label">Сообщение об успехе</span>
                <input
                  className="editor-input"
                  id="successMessage"
                  value={draft.successMessage}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      successMessage: event.target.value,
                    }) as AnyExerciseDraft)
                  }
                />
              </label>
            </>
          ) : null}
        </details>

        {isMatchingPairs && matchingPairsData ? (
          <MatchingPairsEditor
            themeColor={draft.themeColor}
            value={matchingPairsData}
            onChange={(nextData) => setDraftData(nextData)}
            onThemeColorChange={(nextColor) =>
              setDraft((current) => ({
                ...current,
                themeColor: nextColor,
              }) as AnyExerciseDraft)
            }
            onNotice={(message) => showNotice(message, "draft")}
          />
        ) : null}

        {isClassification && classificationData ? (
          <ClassificationEditor
            themeColor={draft.themeColor}
            value={classificationData}
            onChange={(nextData) => setDraftData(nextData)}
            onThemeColorChange={(nextColor) =>
              setDraft((current) => ({
                ...current,
                themeColor: nextColor,
              }) as AnyExerciseDraft)
            }
            onNotice={(message) => showNotice(message, "draft")}
          />
        ) : null}

        {isCustomVisualEditor ? previewBlock : null}

        {!isCustomVisualEditor ? (
          <details className="editor-block editor-details" open>
            <summary className="editor-details__summary">JSON упражнения</summary>
            <p className="editor-hint">
              Используйте этот блок, если нужно вручную поправить структуру данных.
            </p>
            <textarea
              className="editor-code"
              rows={22}
              spellCheck={false}
              value={dataText}
              onChange={(event) => setDataText(event.target.value)}
            />
            {dataError ? <p className="error-text">JSON: {dataError}</p> : null}
          </details>
        ) : null}

        {meshExportBlock}
        {draftActionsBlock}
      </aside>

      {!isCustomVisualEditor ? (
        <section className="editor-preview">
          {previewBlock}
        </section>
      ) : null}
      {exportTaskBlock}
    </div>
  );
}
