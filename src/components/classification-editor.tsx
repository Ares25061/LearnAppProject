"use client";
/* eslint-disable @next/next/no-img-element */

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  CLASSIFICATION_MAX_GROUPS,
  CLASSIFICATION_MAX_ITEMS_PER_GROUP,
  createClassificationGroup,
  createClassificationItem,
  getClassificationGroupTitle,
  normalizeGroupAssignmentData,
} from "@/lib/classification";
import {
  MATCHING_AUDIO_VOLUME_DEFAULT,
  createMatchingContent,
  matchingContentOptions,
  normalizeMatchingSide,
} from "@/lib/matching-pairs";
import type {
  ClassificationGroupBackground,
  GroupAssignmentData,
  MatchingContent,
  MatchingContentKind,
  MatchingPairSide,
} from "@/lib/types";
import { moveItem } from "@/lib/utils";

const STORED_MEDIA_ROUTE_PREFIX = "/api/media/stored/";

const displayOptions = [
  { id: "sequential", label: "По одной" },
  { id: "all-at-once", label: "Все сразу" },
] as const;

const orderOptions = [
  { id: "random", label: "Случайно" },
  { id: "rounds", label: "По кругу" },
] as const;

type PendingMediaUpload = {
  fileName: string;
  kind: "image" | "audio" | "video";
  previewUrl: string;
  requestId: number;
};

function ClassificationTypeIcon({
  kind,
}: Readonly<{
  kind: MatchingContent["kind"];
}>) {
  switch (kind) {
    case "spoken-text":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path
            d="M12 3.25A7.75 7.75 0 0 0 4.25 11v4.25A3.75 3.75 0 0 0 8 19h.5A2.5 2.5 0 0 0 11 16.5v-3A2.5 2.5 0 0 0 8.5 11H6.75a5.25 5.25 0 0 1 10.5 0H15.5A2.5 2.5 0 0 0 13 13.5v3A2.5 2.5 0 0 0 15.5 19H16a3.75 3.75 0 0 0 3.75-3.75V11A7.75 7.75 0 0 0 12 3.25Z"
            fill="currentColor"
          />
        </svg>
      );
    case "image":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path
            d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11Zm3 9 3.2-3.2a1 1 0 0 1 1.4 0l2.4 2.4 1.7-1.7a1 1 0 0 1 1.4 0L19 15.2M9 9.25a1.25 1.25 0 1 0 0-.01Z"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      );
    case "audio":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path
            d="M5 14h3l4 4V6L8 10H5v4Zm11.5-4.5a4.5 4.5 0 0 1 0 5m2.5-7.5a7.5 7.5 0 0 1 0 10"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      );
    case "video":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path
            d="M4 7.5A2.5 2.5 0 0 1 6.5 5h7A2.5 2.5 0 0 1 16 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 4 16.5v-9Zm12 3.2 4-2.2v7l-4-2.2"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      );
    case "text":
    default:
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path
            d="M5 6h14M9 6v12m-3 0h6m2-8h5m-5 4h4"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      );
  }
}

function ClassificationActionIcon({
  kind,
}: Readonly<{
  kind: "up" | "down" | "duplicate" | "delete" | "add";
}>) {
  switch (kind) {
    case "up":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path
            d="M12 5v14m0-14-5 5m5-5 5 5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      );
    case "down":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path
            d="M12 19V5m0 14-5-5m5 5 5-5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      );
    case "duplicate":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path
            d="M9 9V6.5A2.5 2.5 0 0 1 11.5 4h6A2.5 2.5 0 0 1 20 6.5v6A2.5 2.5 0 0 1 17.5 15H15M6.5 9h6A2.5 2.5 0 0 1 15 11.5v6A2.5 2.5 0 0 1 12.5 20h-6A2.5 2.5 0 0 1 4 17.5v-6A2.5 2.5 0 0 1 6.5 9Z"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      );
    case "add":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path
            d="M12 5v14M5 12h14"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      );
    case "delete":
    default:
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path
            d="M5 7h14m-9 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-1 3h8l-.7 11.2A2 2 0 0 1 13.3 20h-2.6a2 2 0 0 1-1.99-1.8L8 7Z"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      );
  }
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="m6 6 12 12M18 6 6 18"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M12 8.75a3.25 3.25 0 1 1 0 6.5 3.25 3.25 0 0 1 0-6.5Zm7 3.25.95-.55a1 1 0 0 0 .37-1.37l-1.1-1.9a1 1 0 0 0-1.31-.42l-.97.43a7.95 7.95 0 0 0-1.64-.95l-.14-1.05A1 1 0 0 0 14.17 5h-2.2a1 1 0 0 0-.99.85l-.15 1.05c-.58.2-1.13.52-1.63.94l-.97-.42a1 1 0 0 0-1.31.42l-1.1 1.9a1 1 0 0 0 .36 1.37L7.13 12c-.03.32-.03.68 0 1l-.94.55a1 1 0 0 0-.36 1.37l1.1 1.9a1 1 0 0 0 1.31.42l.97-.42c.5.42 1.05.73 1.63.94l.15 1.05a1 1 0 0 0 .99.85h2.2a1 1 0 0 0 .99-.85l.14-1.05c.59-.21 1.15-.53 1.64-.95l.97.43a1 1 0 0 0 1.31-.42l1.1-1.9a1 1 0 0 0-.37-1.37l-.95-.55a7.78 7.78 0 0 0 0-1Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function ClassificationIconButton({
  children,
  disabled = false,
  label,
  onClick,
  tone = "default",
}: Readonly<{
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  tone?: "default" | "primary" | "danger";
}>) {
  return (
    <button
      aria-label={label}
      className={`ghost-button matching-action-button classification-editor-icon-button ${
        tone === "primary"
          ? "classification-editor-icon-button--primary"
          : tone === "danger"
            ? "classification-editor-icon-button--danger"
            : ""
      }`}
      disabled={disabled}
      title={label}
      type="button"
      onClick={onClick}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}

function ClassificationEditorPortal({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(children, document.body);
}

function getBaseFileLabel(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").trim();
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Не удалось прочитать файл."));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("Не удалось прочитать файл."));
    };

    reader.readAsDataURL(file);
  });
}

function isStoredMediaUrl(url: string) {
  const trimmed = url.trim();
  return (
    trimmed.startsWith(STORED_MEDIA_ROUTE_PREFIX) ||
    (typeof window !== "undefined" &&
      trimmed.startsWith(`${window.location.origin}${STORED_MEDIA_ROUTE_PREFIX}`))
  );
}

async function uploadStoredMediaFile(file: File) {
  const formData = new FormData();
  formData.set("file", file);

  const response = await fetch("/api/media/stored", {
    method: "POST",
    body: formData,
  });

  const result = (await response.json().catch(() => null)) as
    | { error?: string; url?: string }
    | null;

  if (!response.ok || !result?.url) {
    throw new Error(result?.error ?? "Не удалось загрузить файл на сервер.");
  }

  return result.url;
}

function createPendingMediaPreviewUrl(file: File) {
  return URL.createObjectURL(file);
}

function revokePendingMediaPreviewUrl(url: string) {
  if (url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

function getPendingMediaStatus(kind: "image" | "audio" | "video") {
  switch (kind) {
    case "image":
      return "Изображение обрабатывается...";
    case "audio":
      return "Аудио обрабатывается...";
    case "video":
    default:
      return "Видео загружается...";
  }
}

function getClassificationMediaSourceHint(url: string) {
  const trimmed = url.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("data:")) {
    return "Встроенный файл";
  }

  if (isStoredMediaUrl(trimmed)) {
    return "Загруженный файл";
  }

  return trimmed;
}

function getClassificationMediaUi(kind: "image" | "audio" | "video") {
  if (kind === "image") {
    return {
      accept: "image/*",
      description: "Выберите изображение файлом или вставьте ссылку.",
      detailLabel: "Подпись",
      detailPlaceholder: "Краткая подпись к изображению",
      dialogLabel: "Изображение",
      dropReplaceText:
        "Нажмите, чтобы заменить изображение, или перетащите новый файл сюда",
      dropTitle: "Перетащите изображение сюда",
      formatsHint: "PNG, JPG, WebP, GIF и другие форматы изображений",
      note: "",
      urlLabel: "Ссылка на изображение",
    };
  }

  if (kind === "audio") {
    return {
      accept: "audio/*,video/mp4,.mp3,.mp4,.m4a,.wav,.ogg",
      description: "Выберите аудио файлом или вставьте ссылку на источник.",
      detailLabel: "Название",
      detailPlaceholder: "Как подписать аудио",
      dialogLabel: "Аудио",
      dropReplaceText:
        "Нажмите, чтобы заменить аудио, или перетащите новый файл сюда",
      dropTitle: "Перетащите аудио сюда",
      formatsHint: "MP3, MP4, M4A, WAV, OGG",
      note: "Громкость задаётся для карточки и сохранится в упражнении.",
      urlLabel: "Ссылка на аудио",
    };
  }

  return {
    accept: "video/*,.mp4,.webm,.ogv,.ogg",
    description: "Выберите видеофайл или вставьте ссылку на видео.",
    detailLabel: "Название",
    detailPlaceholder: "Как подписать видео",
    dialogLabel: "Видео",
    dropReplaceText:
      "Нажмите, чтобы заменить видео, или перетащите новый файл сюда",
    dropTitle: "Перетащите видео сюда",
    formatsHint: "MP4, WebM, OGV",
    note: "Для видео можно задать стартовую секунду воспроизведения.",
    urlLabel: "Ссылка на видео",
  };
}

function getClassificationMediaSummary(content: MatchingContent) {
  if (content.kind === "image") {
    const title =
      content.alt.trim() ||
      content.fileName?.trim() ||
      getClassificationMediaSourceHint(content.url) ||
      "Изображение";
    return {
      hasMedia: Boolean(content.url.trim()),
      meta: content.url.trim()
        ? "Изображение прикреплено"
        : "Нажмите, чтобы добавить изображение",
      title,
    };
  }

  if (content.kind === "audio") {
    const title =
      content.label.trim() ||
      content.fileName?.trim() ||
      getClassificationMediaSourceHint(content.url) ||
      "Аудио";
    return {
      hasMedia: Boolean(content.url.trim()),
      meta: content.url.trim()
        ? "Аудио прикреплено"
        : "Нажмите, чтобы добавить аудио",
      title,
    };
  }

  if (content.kind === "video") {
    const title =
      content.label.trim() ||
      content.fileName?.trim() ||
      getClassificationMediaSourceHint(content.url) ||
      "Видео";
    return {
      hasMedia: Boolean(content.url.trim()),
      meta: content.url.trim()
        ? "Видео прикреплено"
        : "Нажмите, чтобы добавить видео",
      title,
    };
  }

  return {
    hasMedia: false,
    meta: "",
    title: "",
  };
}

function isAcceptedMediaFile(
  kind: "image" | "audio" | "video",
  file: File,
) {
  const mimeType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();

  if (kind === "image") {
    return mimeType.startsWith("image/");
  }

  if (kind === "audio") {
    return (
      mimeType.startsWith("audio/") ||
      mimeType === "video/mp4" ||
      fileName.endsWith(".mp3") ||
      fileName.endsWith(".mp4") ||
      fileName.endsWith(".m4a") ||
      fileName.endsWith(".wav") ||
      fileName.endsWith(".ogg")
    );
  }

  return (
    mimeType.startsWith("video/") ||
    fileName.endsWith(".mp4") ||
    fileName.endsWith(".webm") ||
    fileName.endsWith(".ogv") ||
    fileName.endsWith(".ogg")
  );
}

function convertContentKind(
  current: MatchingContent,
  nextKind: MatchingContentKind,
) {
  const next = createMatchingContent(nextKind);
  const currentText =
    current.kind === "text" || current.kind === "spoken-text"
      ? current.text
      : current.kind === "image"
        ? current.alt
        : current.label;

  if (next.kind === "text" || next.kind === "spoken-text") {
    next.text = currentText;
    return next;
  }

  if (next.kind === "image") {
    if (current.kind === "image") {
      return { ...current };
    }

    next.alt = currentText;
    return next;
  }

  if (next.kind === "audio") {
    if (current.kind === "audio") {
      return { ...current };
    }

    if (current.kind === "video") {
      return {
        ...next,
        url: current.url,
        label: current.label,
        volume: current.volume,
      };
    }

    next.label = currentText;
    return next;
  }

  if (current.kind === "video") {
    return { ...current };
  }

  if (current.kind === "audio") {
    return {
      ...next,
      url: current.url,
      label: current.label,
      volume: current.volume,
    };
  }

  next.label = currentText;
  return next;
}

function applyMediaLabel(
  content: MatchingContent,
  value: string,
): MatchingContent {
  if (content.kind === "image") {
    return { ...content, alt: value };
  }

  if (content.kind === "audio" || content.kind === "video") {
    return { ...content, label: value };
  }

  return content;
}

type ContentEditorProps = {
  label: string;
  value: MatchingPairSide;
  allowedKinds: readonly MatchingContentKind[];
  onChange: (next: MatchingPairSide) => void;
  onNotice?: (message: string) => void;
};

function ContentEditor({
  label,
  value,
  allowedKinds,
  onChange,
  onNotice,
}: Readonly<ContentEditorProps>) {
  const content = normalizeMatchingSide(value);
  const [pendingMediaUpload, setPendingMediaUpload] =
    useState<PendingMediaUpload | null>(null);
  const latestContentRef = useRef(content);
  const nextUploadRequestIdRef = useRef(0);
  const previewUrlRef = useRef<string>("");

  useEffect(() => {
    latestContentRef.current = content;
  }, [content]);

  useEffect(() => {
    const nextPreviewUrl = pendingMediaUpload?.previewUrl ?? "";
    if (
      previewUrlRef.current &&
      previewUrlRef.current !== nextPreviewUrl
    ) {
      revokePendingMediaPreviewUrl(previewUrlRef.current);
    }

    previewUrlRef.current = nextPreviewUrl;
  }, [pendingMediaUpload?.previewUrl]);

  useEffect(
    () => () => {
      if (previewUrlRef.current) {
        revokePendingMediaPreviewUrl(previewUrlRef.current);
      }
    },
    [],
  );

  const options = matchingContentOptions.filter((option) =>
    allowedKinds.includes(option.id),
  );
  const activePendingMediaUpload =
    pendingMediaUpload && pendingMediaUpload.kind === content.kind
      ? pendingMediaUpload
      : null;
  const effectiveMediaUrl =
    activePendingMediaUpload?.previewUrl ||
    (content.kind === "image" || content.kind === "audio" || content.kind === "video"
      ? content.url
      : "");
  const mediaUrlValue =
    (content.kind === "image" || content.kind === "audio" || content.kind === "video") &&
    (Boolean(activePendingMediaUpload) || isStoredMediaUrl(content.url))
      ? ""
      : content.kind === "image" || content.kind === "audio" || content.kind === "video"
        ? content.url
        : "";

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (
      (content.kind !== "image" && content.kind !== "audio" && content.kind !== "video") ||
      !isAcceptedMediaFile(content.kind, file)
    ) {
      onNotice?.("Файл не подходит для выбранного типа карточки.");
      return;
    }

    const requestId = nextUploadRequestIdRef.current + 1;
    nextUploadRequestIdRef.current = requestId;
    const previewUrl = createPendingMediaPreviewUrl(file);
    const baseLabel = getBaseFileLabel(file.name);
    const latestContent = latestContentRef.current;
    const previousUrl =
      latestContent.kind === "image" ||
      latestContent.kind === "audio" ||
      latestContent.kind === "video"
        ? latestContent.url
        : "";
    const previousFileName =
      latestContent.kind === "image" ||
      latestContent.kind === "audio" ||
      latestContent.kind === "video"
        ? latestContent.fileName ?? ""
        : "";

    try {
      setPendingMediaUpload({
        fileName: file.name,
        kind: content.kind,
        previewUrl,
        requestId,
      });

      if (content.kind === "image" && latestContent.kind === "image") {
        onChange({
          ...latestContent,
          url: previewUrl,
          alt: latestContent.alt.trim() ? latestContent.alt : baseLabel,
          fileName: file.name,
        });
      } else if (content.kind === "audio" && latestContent.kind === "audio") {
        onChange({
          ...latestContent,
          url: previewUrl,
          label: latestContent.label.trim() ? latestContent.label : baseLabel,
          fileName: file.name,
        });
      } else if (content.kind === "video" && latestContent.kind === "video") {
        onChange({
          ...latestContent,
          url: previewUrl,
          label: latestContent.label,
          fileName: file.name,
        });
      }

      const storedUrl =
        content.kind === "video"
          ? await uploadStoredMediaFile(file)
          : await readFileAsDataUrl(file);

      if (nextUploadRequestIdRef.current !== requestId) {
        return;
      }

      const currentContent = latestContentRef.current;

      if (content.kind === "image" && currentContent.kind === "image") {
        onChange({
          ...currentContent,
          url: storedUrl,
          alt: currentContent.alt.trim() ? currentContent.alt : baseLabel,
          fileName: file.name,
        });
      } else if (content.kind === "audio" && currentContent.kind === "audio") {
        onChange({
          ...currentContent,
          url: storedUrl,
          label: currentContent.label.trim() ? currentContent.label : baseLabel,
          fileName: file.name,
        });
      } else if (content.kind === "video" && currentContent.kind === "video") {
        onChange({
          ...currentContent,
          url: storedUrl,
          label: currentContent.label,
          fileName: file.name,
        });
      }

      setPendingMediaUpload((current) =>
        current?.requestId === requestId ? null : current,
      );

      onNotice?.(
        content.kind === "video"
          ? "Видеофайл загружен и прикреплен к карточке."
          : "Файл встроен в карточку.",
      );
    } catch (error) {
      if (nextUploadRequestIdRef.current === requestId) {
        const currentContent = latestContentRef.current;
        if (content.kind === "image" && currentContent.kind === "image") {
          onChange({
            ...currentContent,
            fileName: previousFileName,
            url: previousUrl,
          });
        } else if (content.kind === "audio" && currentContent.kind === "audio") {
          onChange({
            ...currentContent,
            fileName: previousFileName,
            url: previousUrl,
          });
        } else if (content.kind === "video" && currentContent.kind === "video") {
          onChange({
            ...currentContent,
            fileName: previousFileName,
            url: previousUrl,
          });
        }
      }

      setPendingMediaUpload((current) =>
        current?.requestId === requestId ? null : current,
      );
      onNotice?.(
        error instanceof Error ? error.message : "Не удалось обработать файл.",
      );
    }
  };

  return (
    <div className="matching-editor-side classification-editor-card">
      <label className="matching-editor-field">
        <span className="field-label">{label}</span>
      </label>
      <div className="matching-setting-options classification-editor-kind-row">
        {options.map((option) => (
          <button
            className={`matching-setting-chip ${
              content.kind === option.id ? "matching-setting-chip--active" : ""
            }`}
            key={option.id}
            type="button"
            onClick={() => onChange(convertContentKind(content, option.id))}
          >
            {option.label}
          </button>
        ))}
      </div>

      {(content.kind === "text" || content.kind === "spoken-text") ? (
        <label className="matching-editor-field">
          <span className="field-label">
            {content.kind === "spoken-text" ? "Текст для озвучивания" : "Текст"}
          </span>
          <textarea
            className="editor-textarea"
            rows={3}
            value={content.text}
            onChange={(event) => onChange({ ...content, text: event.target.value })}
          />
        </label>
      ) : (
        <>
          {content.kind === "image" && effectiveMediaUrl ? (
            <div className="classification-editor-preview">
              <img alt={content.alt || "Превью"} src={effectiveMediaUrl} />
            </div>
          ) : null}

          <label className="matching-editor-field">
            <span className="field-label">
              {content.kind === "image"
                ? "Ссылка на изображение"
                : content.kind === "audio"
                  ? "Ссылка на аудио"
                  : "Ссылка на видео"}
            </span>
            <input
              className="editor-input"
              placeholder={
                activePendingMediaUpload
                  ? "Файл загружается, ссылку можно вставить после завершения загрузки"
                  : isStoredMediaUrl(content.url)
                  ? "Вставьте ссылку, если хотите заменить загруженный файл"
                  : undefined
              }
              value={mediaUrlValue}
              onChange={(event) =>
                onChange({
                  ...content,
                  url: event.target.value,
                  fileName:
                    event.target.value.trim().startsWith("data:") ||
                    isStoredMediaUrl(event.target.value)
                      ? content.fileName ?? ""
                      : "",
                })
              }
            />
          </label>

          <label className="matching-editor-field">
            <span className="field-label">
              {content.kind === "image" ? "Подпись" : "Название"}
            </span>
            <input
              className="editor-input"
              value={content.kind === "image" ? content.alt : content.label}
              onChange={(event) => onChange(applyMediaLabel(content, event.target.value))}
            />
          </label>

          <label className="matching-editor-field">
            <span className="field-label">
              {activePendingMediaUpload
                ? `Файл: ${getPendingMediaStatus(activePendingMediaUpload.kind)}`
                : "Файл"}
            </span>
            <input
              accept={
                content.kind === "image"
                  ? "image/*"
                  : content.kind === "audio"
                    ? "audio/*,video/mp4,.mp3,.mp4,.m4a,.wav,.ogg"
                    : "video/*,.mp4,.webm,.ogv,.ogg"
              }
              className="editor-input"
              type="file"
              onChange={(event) => void handleFileChange(event)}
            />
          </label>

          {content.kind === "video" ? (
            <label className="matching-editor-field matching-editor-field--full">
              <span className="field-label">Старт, сек</span>
              <input
                className="editor-input"
                min={0}
                step={1}
                type="number"
                value={content.startSeconds}
                onChange={(event) =>
                  onChange({
                    ...content,
                    startSeconds: Math.max(
                      0,
                      Number.parseInt(event.target.value || "0", 10) || 0,
                    ),
                  })
                }
              />
            </label>
          ) : null}

          {content.kind === "audio" ? (
            <label className="matching-editor-field">
              <span className="field-label">Громкость: {content.volume}%</span>
              <input
                max={100}
                min={0}
                step={1}
                type="range"
                value={content.volume}
                onChange={(event) =>
                  onChange({
                    ...content,
                    volume: Math.max(
                      0,
                      Math.min(
                        100,
                        Number.parseInt(
                          event.target.value || `${MATCHING_AUDIO_VOLUME_DEFAULT}`,
                          10,
                        ) || MATCHING_AUDIO_VOLUME_DEFAULT,
                      ),
                    ),
                  })
                }
              />
            </label>
          ) : null}
        </>
      )}
    </div>
  );
}

function BackgroundEditor({
  value,
  onChange,
  onNotice,
}: Readonly<{
  value: ClassificationGroupBackground;
  onChange: (next: ClassificationGroupBackground) => void;
  onNotice?: (message: string) => void;
}>) {
  return (
    <ContentEditor
      allowedKinds={["text", "image"]}
      label="Задний фон"
      value={value}
      onChange={(next) => onChange(next as ClassificationGroupBackground)}
      onNotice={onNotice}
    />
  );
}

const classificationDisplayOptionsCompact = [
  { id: "sequential", label: "По одной" },
  { id: "all-at-once", label: "Все сразу" },
] as const;

const classificationOrderOptionsCompact = [
  { id: "random", label: "Случайно" },
  { id: "rounds", label: "По кругу" },
] as const;

function getPendingMediaStatusCompact(kind: "image" | "audio" | "video") {
  switch (kind) {
    case "image":
      return "Изображение обрабатывается...";
    case "audio":
      return "Аудио обрабатывается...";
    case "video":
    default:
      return "Видео загружается...";
  }
}

function getClassificationMediaSourceHintCompact(url: string) {
  const trimmed = url.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("data:")) {
    return "Встроенный файл";
  }

  if (isStoredMediaUrl(trimmed)) {
    return "Загруженный файл";
  }

  return trimmed;
}

function getClassificationMediaUiCompact(kind: "image" | "audio" | "video") {
  if (kind === "image") {
    return {
      accept: "image/*",
      description: "Выберите изображение файлом или вставьте ссылку.",
      detailLabel: "Подпись",
      detailPlaceholder: "Краткая подпись к изображению",
      dialogLabel: "Изображение",
      dropReplaceText:
        "Нажмите, чтобы заменить изображение, или перетащите новый файл сюда",
      dropTitle: "Перетащите изображение сюда",
      formatsHint: "PNG, JPG, WebP, GIF и другие форматы изображений",
      note: "",
      urlLabel: "Ссылка на изображение",
    };
  }

  if (kind === "audio") {
    return {
      accept: "audio/*,video/mp4,.mp3,.mp4,.m4a,.wav,.ogg",
      description: "Выберите аудио файлом или вставьте ссылку на источник.",
      detailLabel: "Название",
      detailPlaceholder: "Как подписать аудио",
      dialogLabel: "Аудио",
      dropReplaceText:
        "Нажмите, чтобы заменить аудио, или перетащите новый файл сюда",
      dropTitle: "Перетащите аудио сюда",
      formatsHint: "MP3, MP4, M4A, WAV, OGG",
      note: "Громкость сохраняется вместе с карточкой.",
      urlLabel: "Ссылка на аудио",
    };
  }

  return {
    accept: "video/*,.mp4,.webm,.ogv,.ogg",
    description: "Выберите видеофайл или вставьте ссылку на видео.",
    detailLabel: "Название",
    detailPlaceholder: "Как подписать видео",
    dialogLabel: "Видео",
    dropReplaceText:
      "Нажмите, чтобы заменить видео, или перетащите новый файл сюда",
    dropTitle: "Перетащите видео сюда",
    formatsHint: "MP4, WebM, OGV",
    note: "Для видео можно задать стартовую секунду воспроизведения.",
    urlLabel: "Ссылка на видео",
  };
}

function getClassificationMediaSummaryCompact(content: MatchingContent) {
  if (content.kind === "image") {
    const title =
      content.alt.trim() ||
      content.fileName?.trim() ||
      getClassificationMediaSourceHintCompact(content.url) ||
      "Изображение";

    return {
      hasMedia: Boolean(content.url.trim()),
      meta: content.url.trim()
        ? "Изображение прикреплено"
        : "Нажмите, чтобы добавить изображение",
      title,
    };
  }

  if (content.kind === "audio") {
    const title =
      content.label.trim() ||
      content.fileName?.trim() ||
      getClassificationMediaSourceHintCompact(content.url) ||
      "Аудио";

    return {
      hasMedia: Boolean(content.url.trim()),
      meta: content.url.trim()
        ? "Аудио прикреплено"
        : "Нажмите, чтобы добавить аудио",
      title,
    };
  }

  if (content.kind === "video") {
    const title =
      content.label.trim() ||
      content.fileName?.trim() ||
      getClassificationMediaSourceHintCompact(content.url) ||
      "Видео";

    return {
      hasMedia: Boolean(content.url.trim()),
      meta: content.url.trim()
        ? "Видео прикреплено"
        : "Нажмите, чтобы добавить видео",
      title,
    };
  }

  return {
    hasMedia: false,
    meta: "",
    title: "",
  };
}

function CompactClassificationContentEditor({
  label,
  value,
  allowedKinds,
  onChange,
  onNotice,
}: Readonly<ContentEditorProps>) {
  const content = normalizeMatchingSide(value);
  const [isMediaDialogOpen, setIsMediaDialogOpen] = useState(false);
  const [isMediaDropActive, setIsMediaDropActive] = useState(false);
  const [pendingMediaUpload, setPendingMediaUpload] =
    useState<PendingMediaUpload | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const latestContentRef = useRef(content);
  const nextUploadRequestIdRef = useRef(0);
  const previewUrlRef = useRef<string>("");
  const options = matchingContentOptions.filter((option) =>
    allowedKinds.includes(option.id),
  );
  const activeOption =
    options.find((option) => option.id === content.kind) ?? options[0];
  const isTextContent =
    content.kind === "text" || content.kind === "spoken-text";
  const mediaContent =
    content.kind === "image" || content.kind === "audio" || content.kind === "video"
      ? content
      : null;
  const imageContent = content.kind === "image" ? content : null;
  const labeledMediaContent =
    content.kind === "audio" || content.kind === "video" ? content : null;
  const videoContent = content.kind === "video" ? content : null;
  const isMediaDialogVisible = Boolean(mediaContent) && isMediaDialogOpen;
  const activePendingMediaUpload =
    mediaContent && pendingMediaUpload?.kind === mediaContent.kind
      ? pendingMediaUpload
      : null;
  const effectiveMediaUrl =
    activePendingMediaUpload?.previewUrl || mediaContent?.url || "";
  const hasEmbeddedFile = Boolean(effectiveMediaUrl.trim().startsWith("data:"));
  const hasStoredFile = Boolean(
    mediaContent && isStoredMediaUrl(mediaContent.url),
  );
  const hasUploadedFile =
    hasEmbeddedFile || hasStoredFile || Boolean(activePendingMediaUpload);
  const selectedFileLabel =
    activePendingMediaUpload?.fileName ||
    mediaContent?.fileName?.trim() ||
    "";
  const mediaUi = mediaContent
    ? getClassificationMediaUiCompact(mediaContent.kind)
    : null;
  const mediaUrlValue = hasUploadedFile ? "" : mediaContent?.url ?? "";

  useEffect(() => {
    latestContentRef.current = content;
  }, [content]);

  useEffect(() => {
    const nextPreviewUrl = pendingMediaUpload?.previewUrl ?? "";
    if (
      previewUrlRef.current &&
      previewUrlRef.current !== nextPreviewUrl
    ) {
      revokePendingMediaPreviewUrl(previewUrlRef.current);
    }

    previewUrlRef.current = nextPreviewUrl;
  }, [pendingMediaUpload?.previewUrl]);

  useEffect(
    () => () => {
      if (previewUrlRef.current) {
        revokePendingMediaPreviewUrl(previewUrlRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isMediaDialogVisible) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMediaDialogOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMediaDialogVisible]);

  const setField = (
    field: "text" | "url" | "alt" | "label",
    fieldValue: string,
  ) => {
    if (field === "url" && mediaContent) {
      onChange({
        ...mediaContent,
        url: fieldValue,
        fileName:
          fieldValue.trim().startsWith("data:") || isStoredMediaUrl(fieldValue)
            ? mediaContent.fileName ?? ""
            : "",
      });
      return;
    }

    onChange({
      ...content,
      [field]: fieldValue,
    } as MatchingContent);
  };

  const setNumberField = (
    field: "startSeconds" | "volume",
    fieldValue: number,
  ) => {
    onChange({
      ...content,
      [field]: fieldValue,
    } as MatchingContent);
  };

  const applyMediaFile = async (
    kind: "image" | "audio" | "video",
    file: File,
  ) => {
    if (!isAcceptedMediaFile(kind, file)) {
      onNotice?.("Файл не подходит для выбранного типа карточки.");
      return;
    }

    const requestId = nextUploadRequestIdRef.current + 1;
    nextUploadRequestIdRef.current = requestId;
    const baseLabel = getBaseFileLabel(file.name);
    const previewUrl = createPendingMediaPreviewUrl(file);
    const latestContent = latestContentRef.current;
    const previousUrl = latestContent.kind === kind ? latestContent.url : "";
    const previousFileName =
      latestContent.kind === kind ? latestContent.fileName ?? "" : "";

    try {
      setPendingMediaUpload({
        fileName: file.name,
        kind,
        previewUrl,
        requestId,
      });

      if (kind === "image" && latestContent.kind === "image") {
        onChange({
          ...latestContent,
          url: previewUrl,
          alt: latestContent.alt.trim() ? latestContent.alt : baseLabel,
          fileName: file.name,
        });
      } else if (kind === "audio" && latestContent.kind === "audio") {
        onChange({
          ...latestContent,
          url: previewUrl,
          label: latestContent.label.trim() ? latestContent.label : baseLabel,
          fileName: file.name,
        });
      } else if (kind === "video" && latestContent.kind === "video") {
        onChange({
          ...latestContent,
          url: previewUrl,
          label: latestContent.label.trim() ? latestContent.label : baseLabel,
          fileName: file.name,
        });
      }

      const storedUrl =
        kind === "video"
          ? await uploadStoredMediaFile(file)
          : await readFileAsDataUrl(file);

      if (nextUploadRequestIdRef.current !== requestId) {
        return;
      }

      const currentContent = latestContentRef.current;

      if (kind === "image" && currentContent.kind === "image") {
        onChange({
          ...currentContent,
          url: storedUrl,
          alt: currentContent.alt.trim() ? currentContent.alt : baseLabel,
          fileName: file.name,
        });
        setPendingMediaUpload((current) =>
          current?.requestId === requestId ? null : current,
        );
        onNotice?.("Изображение встроено в карточку.");
        return;
      }

      if (kind === "audio" && currentContent.kind === "audio") {
        onChange({
          ...currentContent,
          url: storedUrl,
          label: currentContent.label.trim() ? currentContent.label : baseLabel,
          fileName: file.name,
        });
        setPendingMediaUpload((current) =>
          current?.requestId === requestId ? null : current,
        );
        onNotice?.("Аудиофайл встроен в карточку.");
        return;
      }

      if (kind === "video" && currentContent.kind === "video") {
        onChange({
          ...currentContent,
          url: storedUrl,
          label: currentContent.label.trim() ? currentContent.label : baseLabel,
          fileName: file.name,
        });
        setPendingMediaUpload((current) =>
          current?.requestId === requestId ? null : current,
        );
        onNotice?.("Видеофайл загружен и прикреплён к карточке.");
        return;
      }

      setPendingMediaUpload((current) =>
        current?.requestId === requestId ? null : current,
      );
    } catch (error) {
      if (nextUploadRequestIdRef.current === requestId) {
        const currentContent = latestContentRef.current;
        if (kind === "image" && currentContent.kind === "image") {
          onChange({
            ...currentContent,
            fileName: previousFileName,
            url: previousUrl,
          });
        } else if (kind === "audio" && currentContent.kind === "audio") {
          onChange({
            ...currentContent,
            fileName: previousFileName,
            url: previousUrl,
          });
        } else if (kind === "video" && currentContent.kind === "video") {
          onChange({
            ...currentContent,
            fileName: previousFileName,
            url: previousUrl,
          });
        }
      }

      setPendingMediaUpload((current) =>
        current?.requestId === requestId ? null : current,
      );
      onNotice?.(
        error instanceof Error ? error.message : "Не удалось обработать файл.",
      );
    }
  };

  const handleMediaInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !mediaContent) {
      return;
    }

    void applyMediaFile(mediaContent.kind, file);
  };

  const openMediaFilePicker = () => {
    mediaInputRef.current?.click();
  };

  const handleDropZoneDragOver = (event: DragEvent<HTMLButtonElement>) => {
    if (!mediaContent) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsMediaDropActive(true);
  };

  const handleDropZoneDragLeave = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsMediaDropActive(false);
  };

  const handleDropZoneDrop = (event: DragEvent<HTMLButtonElement>) => {
    if (!mediaContent) {
      return;
    }

    event.preventDefault();
    setIsMediaDropActive(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) {
      return;
    }

    void applyMediaFile(mediaContent.kind, file);
  };

  const handleTypeSelect = (nextKind: MatchingContent["kind"]) => {
    const nextIsMedia =
      nextKind === "image" || nextKind === "audio" || nextKind === "video";

    if (!nextIsMedia) {
      setIsMediaDialogOpen(false);
      setIsMediaDropActive(false);

      if (content.kind !== nextKind) {
        onChange(convertContentKind(content, nextKind));
      }
      return;
    }

    setIsMediaDropActive(false);

    if (content.kind !== nextKind) {
      onChange(createMatchingContent(nextKind));
    }

    setIsMediaDialogOpen(true);
  };

  const mediaDialogLabel = mediaUi?.dialogLabel ?? activeOption?.label ?? label;
  const dropZoneTitle = selectedFileLabel || mediaUi?.dropTitle || "";
  const dropZoneText = selectedFileLabel
    ? mediaUi?.dropReplaceText || ""
    : "Нажмите, чтобы выбрать файл в проводнике, или просто перетащите его сюда";
  const mediaSummaryBase = mediaContent
    ? getClassificationMediaSummaryCompact({
        ...mediaContent,
        fileName:
          activePendingMediaUpload?.fileName || mediaContent.fileName,
        url: effectiveMediaUrl,
      })
    : null;
  const mediaSummary = mediaSummaryBase
    ? activePendingMediaUpload
      ? {
          ...mediaSummaryBase,
          hasMedia: true,
          meta: getPendingMediaStatusCompact(activePendingMediaUpload.kind),
        }
      : mediaSummaryBase
    : null;

  return (
    <div className="matching-editor-side matching-editor-side--compact classification-editor-side">
      <div className="matching-editor-side__surface classification-editor-side__surface">
        <div className="matching-editor-side__content">
          {isTextContent ? (
            <textarea
              aria-label={label}
              className="editor-textarea matching-editor-side__textarea"
              placeholder={
                content.kind === "spoken-text"
                  ? "Текст для озвучивания"
                  : "Текст карточки"
              }
              rows={2}
              value={content.text}
              onChange={(event) => setField("text", event.target.value)}
            />
          ) : mediaSummary ? (
            <button
              className={`matching-editor-media-summary classification-editor-media-summary ${
                mediaSummary.hasMedia ? "matching-editor-media-summary--filled" : ""
              }`}
              type="button"
              onClick={() => setIsMediaDialogOpen(true)}
            >
              {imageContent && effectiveMediaUrl.trim() ? (
                <span className="matching-editor-media-summary__preview matching-editor-media-summary__preview--image">
                  <img alt={mediaSummary.title} src={effectiveMediaUrl} />
                </span>
              ) : (
                <span className="matching-editor-media-summary__preview">
                  <ClassificationTypeIcon kind={content.kind} />
                </span>
              )}
              <span className="matching-editor-media-summary__body">
                <span
                  className="matching-editor-media-summary__title"
                  title={mediaSummary.title}
                >
                  {mediaSummary.title}
                </span>
                <span className="matching-editor-media-summary__meta">
                  {mediaSummary.meta}
                </span>
              </span>
            </button>
          ) : null}
        </div>

        <div className="matching-editor-types">
          {options.map((option) => (
            <button
              aria-label={option.label}
              aria-pressed={option.id === content.kind}
              className={`matching-editor-type ${
                option.id === content.kind ? "matching-editor-type--active" : ""
              }`}
              key={option.id}
              title={option.label}
              type="button"
              onClick={() => handleTypeSelect(option.id)}
            >
              <ClassificationTypeIcon kind={option.id} />
              <span className="sr-only">{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      {isMediaDialogVisible ? (
        <ClassificationEditorPortal>
          <div
            aria-label={mediaDialogLabel}
            aria-modal="true"
            className="matching-editor-modal"
            role="dialog"
          >
            <button
              aria-label="Закрыть окно"
              className="matching-editor-modal__backdrop"
              type="button"
              onClick={() => setIsMediaDialogOpen(false)}
            />
            <div
              className="matching-editor-modal__dialog"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="matching-editor-modal__head">
                <div>
                  <strong>{label}</strong>
                  <p className="editor-hint">{mediaUi?.description}</p>
                </div>
                <button
                  aria-label="Закрыть окно"
                  className="ghost-button matching-editor-modal__close"
                  title="Закрыть"
                  type="button"
                  onClick={() => setIsMediaDialogOpen(false)}
                >
                  <CloseIcon />
                </button>
              </div>

              <div className="matching-editor-modal__body">
                <div className="matching-editor-modal__kind">
                  <span className="matching-editor-modal__kind-icon">
                    <ClassificationTypeIcon kind={content.kind} />
                  </span>
                  <div>
                    <strong>{activeOption?.label ?? label}</strong>
                    <p className="editor-hint">
                      {selectedFileLabel
                        ? "Файл уже прикреплён. Можно заменить его новым или вставить ссылку."
                        : "Выберите источник контента: файл или ссылка."}
                    </p>
                  </div>
                </div>

                <input
                  accept={mediaUi?.accept}
                  className="matching-editor-file-input"
                  ref={mediaInputRef}
                  type="file"
                  onChange={handleMediaInputChange}
                />

                <button
                  className={`matching-editor-dropzone ${
                    isMediaDropActive ? "matching-editor-dropzone--active" : ""
                  }`}
                  type="button"
                  onClick={openMediaFilePicker}
                  onDragEnter={handleDropZoneDragOver}
                  onDragLeave={handleDropZoneDragLeave}
                  onDragOver={handleDropZoneDragOver}
                  onDrop={handleDropZoneDrop}
                >
                  <span className="matching-editor-dropzone__icon">
                    <ClassificationTypeIcon kind={content.kind} />
                  </span>
                  <strong className="matching-editor-dropzone__title">
                    {dropZoneTitle}
                  </strong>
                  <span className="matching-editor-dropzone__text">
                    {dropZoneText}
                  </span>
                  <span className="matching-editor-dropzone__meta">
                    {mediaUi?.formatsHint}
                  </span>
                </button>

                <div className="matching-editor-modal__grid">
                  <label className="matching-editor-field matching-editor-field--full">
                    <span className="field-label">{mediaUi?.urlLabel}</span>
                    <input
                      className="editor-input"
                      placeholder={
                        hasUploadedFile
                          ? "Вставьте ссылку, если хотите заменить встроенный файл"
                          : "https://..."
                      }
                      value={mediaUrlValue}
                      onChange={(event) => setField("url", event.target.value)}
                    />
                  </label>

                  {content.kind === "image" ? (
                    <label className="matching-editor-field matching-editor-field--full">
                      <span className="field-label">{mediaUi?.detailLabel}</span>
                      <input
                        className="editor-input"
                        placeholder={mediaUi?.detailPlaceholder}
                        value={content.alt}
                        onChange={(event) => setField("alt", event.target.value)}
                      />
                    </label>
                  ) : null}

                  {labeledMediaContent ? (
                    <label className="matching-editor-field matching-editor-field--full">
                      <span className="field-label">{mediaUi?.detailLabel}</span>
                      <input
                        className="editor-input"
                        placeholder={mediaUi?.detailPlaceholder}
                        value={labeledMediaContent.label}
                        onChange={(event) => setField("label", event.target.value)}
                      />
                    </label>
                  ) : null}

                  {videoContent ? (
                    <label className="matching-editor-field matching-editor-field--full">
                      <span className="field-label">Начинать с секунды</span>
                      <input
                        className="editor-input"
                        min={0}
                        step={1}
                        type="number"
                        value={videoContent.startSeconds}
                        onChange={(event) =>
                          setNumberField(
                            "startSeconds",
                            Number.isFinite(event.target.valueAsNumber)
                              ? Math.max(0, Math.round(event.target.valueAsNumber))
                              : 0,
                          )
                        }
                      />
                    </label>
                  ) : null}

                  {content.kind === "audio" ? (
                    <label className="matching-editor-field matching-editor-field--full">
                      <span className="field-label">Громкость: {content.volume}%</span>
                      <input
                        max={100}
                        min={0}
                        step={1}
                        type="range"
                        value={content.volume}
                        onChange={(event) =>
                          setNumberField(
                            "volume",
                            Math.max(
                              0,
                              Math.min(
                                100,
                                Number.parseInt(
                                  event.target.value || `${MATCHING_AUDIO_VOLUME_DEFAULT}`,
                                  10,
                                ) || MATCHING_AUDIO_VOLUME_DEFAULT,
                              ),
                            ),
                          )
                        }
                      />
                    </label>
                  ) : null}
                </div>

                {mediaUi?.note ? (
                  <p className="editor-hint matching-editor-modal__note">
                    {mediaUi.note}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </ClassificationEditorPortal>
      ) : null}
    </div>
  );
}

function CompactBackgroundEditor({
  value,
  onChange,
  onNotice,
}: Readonly<{
  value: ClassificationGroupBackground;
  onChange: (next: ClassificationGroupBackground) => void;
  onNotice?: (message: string) => void;
}>) {
  return (
    <CompactClassificationContentEditor
      allowedKinds={["text", "image"]}
      label="Фон группы"
      value={value}
      onChange={(next) => onChange(next as ClassificationGroupBackground)}
      onNotice={onNotice}
    />
  );
}

function CompactClassificationEditor({
  themeColor = "#41644a",
  value,
  onChange,
  onThemeColorChange,
  onNotice,
}: Readonly<{
  themeColor?: string;
  value: GroupAssignmentData;
  onChange: (next: GroupAssignmentData) => void;
  onThemeColorChange?: (next: string) => void;
  onNotice?: (message: string) => void;
}>) {
  const normalized = normalizeGroupAssignmentData(value);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSettingsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSettingsOpen]);

  const updateData = (
    updater: (current: typeof normalized) => GroupAssignmentData,
  ) => {
    onChange(updater(normalized));
  };

  const updateGroups = (
    updater: (current: typeof normalized.groups) => typeof normalized.groups,
  ) => {
    updateData((current) => ({
      ...current,
      groups: updater(current.groups),
    }));
  };

  const updateGroup = (
    groupIndex: number,
    updater: (current: typeof normalized.groups[number]) => typeof normalized.groups[number],
  ) => {
    updateGroups((current) =>
      current.map((group, currentGroupIndex) =>
        currentGroupIndex === groupIndex ? updater(group) : group,
      ),
    );
  };

  const addGroup = () => {
    updateGroups((current) => {
      if (current.length >= CLASSIFICATION_MAX_GROUPS) {
        onNotice?.("Достигнут максимум групп для этого шаблона.");
        return current;
      }

      return [
        ...current,
        createClassificationGroup(`Группа ${current.length + 1}`),
      ];
    });
  };

  const duplicateGroup = (groupIndex: number) => {
    updateGroups((current) => {
      if (current.length >= CLASSIFICATION_MAX_GROUPS) {
        onNotice?.("Достигнут максимум групп для этого шаблона.");
        return current;
      }

      const next = [...current];
      next.splice(groupIndex + 1, 0, structuredClone(current[groupIndex]));
      return next;
    });
  };

  const removeGroup = (groupIndex: number) => {
    updateGroups((current) =>
      current.length === 1
        ? [createClassificationGroup(`Группа ${groupIndex + 1}`)]
        : current.filter((_, currentIndex) => currentIndex !== groupIndex),
    );
  };

  const addItem = (groupIndex: number) => {
    updateGroup(groupIndex, (group) => {
      if (group.items.length >= CLASSIFICATION_MAX_ITEMS_PER_GROUP) {
        onNotice?.("В одной группе можно хранить не больше 10 карточек.");
        return group;
      }

      return {
        ...group,
        items: [...group.items, createClassificationItem()],
      };
    });
  };

  const duplicateItem = (groupIndex: number, itemIndex: number) => {
    updateGroup(groupIndex, (group) => {
      if (group.items.length >= CLASSIFICATION_MAX_ITEMS_PER_GROUP) {
        onNotice?.("В одной группе можно хранить не больше 10 карточек.");
        return group;
      }

      const nextItems = [...group.items];
      nextItems.splice(itemIndex + 1, 0, structuredClone(group.items[itemIndex]));

      return {
        ...group,
        items: nextItems,
      };
    });
  };

  const removeItem = (groupIndex: number, itemIndex: number) => {
    updateGroup(groupIndex, (group) => ({
      ...group,
      items:
        group.items.length === 1
          ? [createClassificationItem()]
          : group.items.filter((_, currentItemIndex) => currentItemIndex !== itemIndex),
    }));
  };

  return (
    <div className="matching-editor-root classification-editor-root classification-editor-root--compact">
      <div className="editor-block classification-editor-toolbar">
        <div className="classification-editor-toolbar__bar">
          <div className="classification-editor-toolbar__lead">
            <button
              aria-label="Открыть настройки классификации"
              className="ghost-button matching-editor-settings-trigger classification-editor-settings-trigger"
              title="Настройки"
              type="button"
              onClick={() => setIsSettingsOpen(true)}
            >
              <SettingsIcon />
              <span className="sr-only">Настройки классификации</span>
            </button>

            <div className="classification-editor-toolbar__copy">
              <strong>Классификация</strong>
              <span className="editor-hint">
                {`${normalized.groups.length} групп`}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="classification-editor-list">
        {normalized.groups.map((group, groupIndex) => {
          const groupTitle = getClassificationGroupTitle(group, groupIndex);

          return (
            <article
              className="editor-block classification-editor-group classification-editor-group--compact"
              key={`compact-group-${groupIndex}`}
            >
              <div className="classification-editor-group__body">
                <div className="classification-editor-group__head">
                  <div className="classification-editor-group__title">
                    <div className="matching-editor-row__index classification-editor-row__index">
                      <strong>{groupIndex + 1}</strong>
                    </div>
                    <div className="classification-editor-row__title">
                      <strong>{`Группа ${groupIndex + 1}`}</strong>
                      <div className="classification-editor-row__meta">
                        <span
                          className="classification-editor-row__summary"
                          title={groupTitle}
                        >
                          {groupTitle}
                        </span>
                        <span className="classification-editor-row__count">
                          {`${group.items.length}/${CLASSIFICATION_MAX_ITEMS_PER_GROUP}`}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="matching-editor-row__actions classification-editor-row__actions">
                    <ClassificationIconButton
                      disabled={groupIndex === 0}
                      label="Переместить группу вверх"
                      onClick={() =>
                        updateGroups((current) =>
                          moveItem(current, groupIndex, groupIndex - 1),
                        )
                      }
                    >
                      <ClassificationActionIcon kind="up" />
                    </ClassificationIconButton>
                    <ClassificationIconButton
                      disabled={groupIndex === normalized.groups.length - 1}
                      label="Переместить группу вниз"
                      onClick={() =>
                        updateGroups((current) =>
                          moveItem(current, groupIndex, groupIndex + 1),
                        )
                      }
                    >
                      <ClassificationActionIcon kind="down" />
                    </ClassificationIconButton>
                    <ClassificationIconButton
                      label="Дублировать группу"
                      onClick={() => duplicateGroup(groupIndex)}
                    >
                      <ClassificationActionIcon kind="duplicate" />
                    </ClassificationIconButton>
                    <ClassificationIconButton
                      disabled={normalized.groups.length === 1}
                      label="Удалить группу"
                      tone="danger"
                      onClick={() => removeGroup(groupIndex)}
                    >
                      <ClassificationActionIcon kind="delete" />
                    </ClassificationIconButton>
                  </div>
                </div>

                <div className="classification-editor-group__background">
                  <CompactBackgroundEditor
                    value={group.background}
                    onChange={(nextBackground) =>
                      updateGroup(groupIndex, (currentGroup) => ({
                        ...currentGroup,
                        background: nextBackground,
                      }))
                    }
                    onNotice={onNotice}
                  />
                </div>

                <div className="classification-editor-items">
                  {group.items.map((item, itemIndex) => (
                    <div
                      className="classification-editor-row classification-editor-row--item"
                      key={`compact-group-${groupIndex}-item-${itemIndex}`}
                    >
                      <div className="matching-editor-row__index classification-editor-row__index classification-editor-row__index--item">
                        <strong>{itemIndex + 1}</strong>
                      </div>

                      <CompactClassificationContentEditor
                        allowedKinds={[
                          "text",
                          "spoken-text",
                          "image",
                          "audio",
                          "video",
                        ]}
                        label={`Карточка ${itemIndex + 1}`}
                        value={item}
                        onChange={(nextItem) =>
                          updateGroup(groupIndex, (currentGroup) => ({
                            ...currentGroup,
                            items: currentGroup.items.map(
                              (currentItem, currentItemIndex) =>
                                currentItemIndex === itemIndex
                                  ? nextItem
                                  : currentItem,
                            ),
                          }))
                        }
                        onNotice={onNotice}
                      />

                      <div className="matching-editor-row__actions classification-editor-row__actions">
                        <ClassificationIconButton
                          disabled={itemIndex === 0}
                          label="Переместить карточку вверх"
                          onClick={() =>
                            updateGroup(groupIndex, (currentGroup) => ({
                              ...currentGroup,
                              items: moveItem(
                                currentGroup.items,
                                itemIndex,
                                itemIndex - 1,
                              ),
                            }))
                          }
                        >
                          <ClassificationActionIcon kind="up" />
                        </ClassificationIconButton>
                        <ClassificationIconButton
                          disabled={itemIndex === group.items.length - 1}
                          label="Переместить карточку вниз"
                          onClick={() =>
                            updateGroup(groupIndex, (currentGroup) => ({
                              ...currentGroup,
                              items: moveItem(
                                currentGroup.items,
                                itemIndex,
                                itemIndex + 1,
                              ),
                            }))
                          }
                        >
                          <ClassificationActionIcon kind="down" />
                        </ClassificationIconButton>
                        <ClassificationIconButton
                          label="Дублировать карточку"
                          onClick={() => duplicateItem(groupIndex, itemIndex)}
                        >
                          <ClassificationActionIcon kind="duplicate" />
                        </ClassificationIconButton>
                        <ClassificationIconButton
                          label="Удалить карточку"
                          tone="danger"
                          onClick={() => removeItem(groupIndex, itemIndex)}
                        >
                          <ClassificationActionIcon kind="delete" />
                        </ClassificationIconButton>
                      </div>
                    </div>
                  ))}

                  <button
                    className="ghost-button classification-editor-add-button"
                    disabled={group.items.length >= CLASSIFICATION_MAX_ITEMS_PER_GROUP}
                    type="button"
                    onClick={() => addItem(groupIndex)}
                  >
                    <ClassificationActionIcon kind="add" />
                    <span>Добавить карточку</span>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {normalized.groups.length < CLASSIFICATION_MAX_GROUPS ? (
        <button
          className="ghost-button classification-editor-add-button classification-editor-add-button--group"
          type="button"
          onClick={addGroup}
        >
          <ClassificationActionIcon kind="add" />
          <span>Добавить группу</span>
        </button>
      ) : null}

      {isSettingsOpen ? (
        <ClassificationEditorPortal>
          <div
            aria-label="Настройки классификации"
            aria-modal="true"
            className="matching-editor-modal matching-editor-modal--settings"
            role="dialog"
          >
            <button
              aria-label="Закрыть окно"
              className="matching-editor-modal__backdrop"
              type="button"
              onClick={() => setIsSettingsOpen(false)}
            />
            <div
              className="matching-editor-modal__dialog matching-editor-modal__dialog--settings"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="matching-editor-modal__head">
                <div>
                  <strong>Настройки классификации</strong>
                  <p className="editor-hint">
                    Основные параметры шаблона собраны в одном окне.
                  </p>
                </div>
                <button
                  aria-label="Закрыть окно"
                  className="ghost-button matching-editor-modal__close"
                  title="Закрыть"
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                >
                  <CloseIcon />
                </button>
              </div>

              <div className="matching-editor-modal__body matching-editor-settings-modal__body">
                <div className="matching-settings-grid classification-editor-settings classification-editor-settings--modal">
                  <label className="matching-setting-card">
                    <span className="field-label">Цвет акцентов</span>
                    <div className="matching-setting-color">
                      <input
                        className="editor-input editor-input--color"
                        type="color"
                        value={themeColor}
                        onChange={(event) =>
                          onThemeColorChange?.(event.target.value)
                        }
                      />
                    </div>
                  </label>

                  <div className="matching-setting-card">
                    <span className="field-label">Показ карточек</span>
                    <div className="matching-setting-options">
                      {classificationDisplayOptionsCompact.map((option) => (
                        <button
                          className={`matching-setting-chip ${
                            normalized.cardDisplayMode === option.id
                              ? "matching-setting-chip--active"
                              : ""
                          }`}
                          key={option.id}
                          type="button"
                          onClick={() =>
                            updateData((current) => ({
                              ...current,
                              cardDisplayMode: option.id,
                            }))
                          }
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="matching-setting-card">
                    <span className="field-label">Порядок карточек</span>
                    <div className="matching-setting-options">
                      {classificationOrderOptionsCompact.map((option) => (
                        <button
                          className={`matching-setting-chip ${
                            normalized.cardOrder === option.id
                              ? "matching-setting-chip--active"
                              : ""
                          }`}
                          key={option.id}
                          type="button"
                          onClick={() =>
                            updateData((current) => ({
                              ...current,
                              cardOrder: option.id,
                            }))
                          }
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="matching-setting-card classification-editor-toggle">
                    <span className="field-label">Групповые цвета</span>
                    <label className="toggle">
                      <input
                        checked={normalized.useGroupColors}
                        type="checkbox"
                        onChange={(event) =>
                          updateData((current) => ({
                            ...current,
                            useGroupColors: event.target.checked,
                          }))
                        }
                      />
                      <span>Подкрашивать группы поверх фона</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ClassificationEditorPortal>
      ) : null}
    </div>
  );
}

export function ClassificationEditor({
  themeColor = "#41644a",
  value,
  onChange,
  onThemeColorChange,
  onNotice,
}: Readonly<{
  themeColor?: string;
  value: GroupAssignmentData;
  onChange: (next: GroupAssignmentData) => void;
  onThemeColorChange?: (next: string) => void;
  onNotice?: (message: string) => void;
}>) {
  return (
    <CompactClassificationEditor
      themeColor={themeColor}
      value={value}
      onChange={onChange}
      onThemeColorChange={onThemeColorChange}
      onNotice={onNotice}
    />
  );

  const normalized = normalizeGroupAssignmentData(value);

  const updateData = (
    updater: (current: typeof normalized) => GroupAssignmentData,
  ) => {
    onChange(updater(normalized));
  };

  const updateGroups = (
    updater: (current: typeof normalized.groups) => typeof normalized.groups,
  ) => {
    updateData((current) => ({
      ...current,
      groups: updater(current.groups),
    }));
  };

  return (
    <div className="matching-editor-root classification-editor-root">
      <div className="editor-block">
        <div className="editor-block__head">
          <div>
            <strong>Редактор классификации</strong>
            <p className="editor-hint">
              У каждой группы свой фон, а у карточек свои типы контента.
            </p>
          </div>
        </div>

        <div className="matching-settings-grid classification-editor-settings">
          <label className="matching-setting-card">
            <span className="field-label">Цвет акцентов</span>
            <div className="matching-setting-color">
              <input
                className="editor-input editor-input--color"
                type="color"
                value={themeColor}
                onChange={(event) => onThemeColorChange?.(event.target.value)}
              />
            </div>
          </label>

          <div className="matching-setting-card">
            <span className="field-label">Показ карточек</span>
            <div className="matching-setting-options">
              {displayOptions.map((option) => (
                <button
                  className={`matching-setting-chip ${
                    normalized.cardDisplayMode === option.id
                      ? "matching-setting-chip--active"
                      : ""
                  }`}
                  key={option.id}
                  type="button"
                  onClick={() =>
                    updateData((current) => ({
                      ...current,
                      cardDisplayMode: option.id,
                    }))
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="matching-setting-card">
            <span className="field-label">Порядок карточек</span>
            <div className="matching-setting-options">
              {orderOptions.map((option) => (
                <button
                  className={`matching-setting-chip ${
                    normalized.cardOrder === option.id
                      ? "matching-setting-chip--active"
                      : ""
                  }`}
                  key={option.id}
                  type="button"
                  onClick={() =>
                    updateData((current) => ({
                      ...current,
                      cardOrder: option.id,
                    }))
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="matching-setting-card classification-editor-toggle">
            <span className="field-label">Групповые цвета</span>
            <label className="toggle">
              <input
                checked={normalized.useGroupColors}
                type="checkbox"
                onChange={(event) =>
                  updateData((current) => ({
                    ...current,
                    useGroupColors: event.target.checked,
                  }))
                }
              />
              <span>Подкрашивать группы поверх фона</span>
            </label>
          </div>
        </div>
      </div>

      <div className="classification-editor-list">
        {normalized.groups.map((group, groupIndex) => (
          <article className="editor-block classification-editor-group" key={`group-${groupIndex}`}>
            <div className="classification-editor-group__head">
              <div>
                <strong>{`Группа ${groupIndex + 1}`}</strong>
                <p className="editor-hint">
                  {getClassificationGroupTitle(group, groupIndex)}
                </p>
              </div>
              <div className="inline-actions">
                <button
                  className="ghost-button"
                  disabled={groupIndex === 0}
                  type="button"
                  onClick={() =>
                    updateGroups((current) => moveItem(current, groupIndex, groupIndex - 1))
                  }
                >
                  Вверх
                </button>
                <button
                  className="ghost-button"
                  disabled={groupIndex === normalized.groups.length - 1}
                  type="button"
                  onClick={() =>
                    updateGroups((current) => moveItem(current, groupIndex, groupIndex + 1))
                  }
                >
                  Вниз
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() =>
                    updateGroups((current) => {
                      if (current.length >= CLASSIFICATION_MAX_GROUPS) {
                        onNotice?.("Достигнут максимум групп для этого шаблона.");
                        return current;
                      }

                      const next = [...current];
                      next.splice(groupIndex + 1, 0, structuredClone(current[groupIndex]));
                      return next;
                    })
                  }
                >
                  Дубль
                </button>
                <button
                  className="ghost-button"
                  disabled={normalized.groups.length === 1}
                  type="button"
                  onClick={() =>
                    updateGroups((current) =>
                      current.length === 1
                        ? [createClassificationGroup(`Группа ${groupIndex + 1}`)]
                        : current.filter((_, currentIndex) => currentIndex !== groupIndex),
                    )
                  }
                >
                  Удалить
                </button>
              </div>
            </div>

            <BackgroundEditor
              value={group.background}
              onChange={(nextBackground) =>
                updateGroups((current) =>
                  current.map((currentGroup, currentIndex) =>
                    currentIndex === groupIndex
                      ? {
                          ...currentGroup,
                          background: nextBackground,
                        }
                      : currentGroup,
                  ),
                )
              }
              onNotice={onNotice}
            />

            <div className="classification-editor-items">
              <div className="classification-editor-items__head">
                <strong>Карточки группы</strong>
                <span className="editor-hint">
                  {`${group.items.length} из ${CLASSIFICATION_MAX_ITEMS_PER_GROUP}`}
                </span>
              </div>

              {group.items.map((item, itemIndex) => (
                <div className="classification-editor-item" key={`group-${groupIndex}-item-${itemIndex}`}>
                  <div className="classification-editor-item__head">
                    <strong>{`Элемент ${itemIndex + 1}`}</strong>
                    <div className="inline-actions">
                      <button
                        className="ghost-button"
                        disabled={itemIndex === 0}
                        type="button"
                        onClick={() =>
                          updateGroups((current) =>
                            current.map((currentGroup, currentIndex) =>
                              currentIndex === groupIndex
                                ? {
                                    ...currentGroup,
                                    items: moveItem(
                                      currentGroup.items,
                                      itemIndex,
                                      itemIndex - 1,
                                    ),
                                  }
                                : currentGroup,
                            ),
                          )
                        }
                      >
                        Вверх
                      </button>
                      <button
                        className="ghost-button"
                        disabled={itemIndex === group.items.length - 1}
                        type="button"
                        onClick={() =>
                          updateGroups((current) =>
                            current.map((currentGroup, currentIndex) =>
                              currentIndex === groupIndex
                                ? {
                                    ...currentGroup,
                                    items: moveItem(
                                      currentGroup.items,
                                      itemIndex,
                                      itemIndex + 1,
                                    ),
                                  }
                                : currentGroup,
                            ),
                          )
                        }
                      >
                        Вниз
                      </button>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() =>
                          updateGroups((current) =>
                            current.map((currentGroup, currentIndex) => {
                              if (currentIndex !== groupIndex) {
                                return currentGroup;
                              }

                              if (
                                currentGroup.items.length >=
                                CLASSIFICATION_MAX_ITEMS_PER_GROUP
                              ) {
                                onNotice?.("В одной группе можно хранить не больше 10 карточек.");
                                return currentGroup;
                              }

                              const nextItems = [...currentGroup.items];
                              nextItems.splice(
                                itemIndex + 1,
                                0,
                                structuredClone(currentGroup.items[itemIndex]),
                              );
                              return {
                                ...currentGroup,
                                items: nextItems,
                              };
                            }),
                          )
                        }
                      >
                        Дубль
                      </button>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() =>
                          updateGroups((current) =>
                            current.map((currentGroup, currentIndex) =>
                              currentIndex === groupIndex
                                ? {
                                    ...currentGroup,
                                    items:
                                      currentGroup.items.length === 1
                                        ? [createClassificationItem()]
                                        : currentGroup.items.filter(
                                            (_, currentItemIndex) =>
                                              currentItemIndex !== itemIndex,
                                          ),
                                  }
                                : currentGroup,
                            ),
                          )
                        }
                      >
                        Удалить
                      </button>
                    </div>
                  </div>

                  <ContentEditor
                    allowedKinds={["text", "spoken-text", "image", "audio", "video"]}
                    label="Содержимое"
                    value={item}
                    onChange={(nextItem) =>
                      updateGroups((current) =>
                        current.map((currentGroup, currentIndex) =>
                          currentIndex === groupIndex
                            ? {
                                ...currentGroup,
                                items: currentGroup.items.map((currentItem, currentItemIndex) =>
                                  currentItemIndex === itemIndex ? nextItem : currentItem,
                                ),
                              }
                            : currentGroup,
                        ),
                      )
                    }
                    onNotice={onNotice}
                  />
                </div>
              ))}

              <button
                className="primary-button"
                type="button"
                onClick={() =>
                  updateGroups((current) =>
                    current.map((currentGroup, currentIndex) => {
                      if (currentIndex !== groupIndex) {
                        return currentGroup;
                      }

                      if (currentGroup.items.length >= CLASSIFICATION_MAX_ITEMS_PER_GROUP) {
                        onNotice?.("В одной группе можно хранить не больше 10 карточек.");
                        return currentGroup;
                      }

                      return {
                        ...currentGroup,
                        items: [...currentGroup.items, createClassificationItem()],
                      };
                    }),
                  )
                }
              >
                Добавить следующий элемент
              </button>
            </div>
          </article>
        ))}
      </div>

      {normalized.groups.length < CLASSIFICATION_MAX_GROUPS ? (
        <button
          className="primary-button"
          type="button"
          onClick={() =>
            updateGroups((current) => [
              ...current,
              createClassificationGroup(`Группа ${current.length + 1}`),
            ])
          }
        >
          Добавить группу
        </button>
      ) : null}
    </div>
  );
}
