"use client";

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
  MATCHING_AUDIO_VOLUME_DEFAULT,
  createMatchingContent,
  createMatchingExtra,
  createMatchingPair,
  matchingContentOptions,
  normalizeMatchingPairsData,
} from "@/lib/matching-pairs";
import type {
  MatchingContent,
  MatchingConnectorStyle,
  MatchingExtraItem,
  MatchingExtraSide,
  MatchingPairsData,
} from "@/lib/types";
import { moveItem } from "@/lib/utils";

const BULK_SEPARATORS = ["\t", ";", "|", "=>"];
const matchingConnectorStyleOptions: Array<{
  id: MatchingConnectorStyle;
  label: string;
}> = [
  { id: "tape", label: "Скотч" },
  { id: "band", label: "Лента" },
  { id: "dots", label: "Пунктир" },
  { id: "clip", label: "Скоба" },
  { id: "circle", label: "Кружок" },
];

function MatchingTypeIcon({
  kind,
}: Readonly<{
  kind: MatchingContent["kind"];
}>) {
  switch (kind) {
    case "spoken-text":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path
            d="M4 13.5V10a2 2 0 0 1 2-2h1.2A2.8 2.8 0 0 1 10 10.8v5.4A2.8 2.8 0 0 1 7.2 19H6a2 2 0 0 1-2-2v-3.5Zm10 0V10a2 2 0 0 1 2-2h1.2a2.8 2.8 0 0 1 2.8 2.8v5.4a2.8 2.8 0 0 1-2.8 2.8H16a2 2 0 0 1-2-2v-3.5ZM9 9.5a3 3 0 0 1 6 0"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
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

function ActionIcon({
  kind,
}: Readonly<{
  kind: "up" | "down" | "duplicate" | "delete";
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

function MatchingEditorPortal({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(children, document.body);
}

function parseBulkLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  for (const separator of BULK_SEPARATORS) {
    const separatorIndex = trimmed.indexOf(separator);
    if (separatorIndex > 0) {
      const left = trimmed.slice(0, separatorIndex).trim();
      const right = trimmed.slice(separatorIndex + separator.length).trim();
      if (left && right) {
        return { left, right };
      }
    }
  }

  const dashed = trimmed.match(/^(.*?)\s[-–—]\s(.*)$/);
  if (dashed?.[1]?.trim() && dashed[2]?.trim()) {
    return {
      left: dashed[1].trim(),
      right: dashed[2].trim(),
    };
  }

  return null;
}

function parseBulkPairs(source: string) {
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return {
      error: "Добавьте хотя бы одну строку с парой.",
      pairs: [],
    };
  }

  const pairs = lines.map((line, index) => {
    const parsed = parseBulkLine(line);
    if (!parsed) {
      return {
        error: `Строка ${index + 1} не распознана. Используйте табуляцию, ;, |, => или «лево - право».`,
        pair: null,
      };
    }

    return {
      error: null,
      pair: {
        left: {
          ...createMatchingContent("text"),
          text: parsed.left,
        },
        right: {
          ...createMatchingContent("text"),
          text: parsed.right,
        },
      },
    };
  });

  const failed = pairs.find((item) => item.error);
  if (failed?.error) {
    return {
      error: failed.error,
      pairs: [],
    };
  }

  return {
    error: null,
    pairs: pairs
      .map((item) => item.pair)
      .filter((pair): pair is NonNullable<typeof pair> => Boolean(pair)),
  };
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

function getMatchingMediaUi(kind: "image" | "audio" | "video") {
  switch (kind) {
    case "image":
      return {
        accept: "image/*",
        dialogLabel: "Настроить изображение",
        urlLabel: "Ссылка на изображение",
        detailLabel: "Подпись / alt",
        detailPlaceholder: "Короткое описание изображения",
        description: "Добавьте картинку ссылкой или файлом. Файл можно сразу перетащить в это окно.",
        dropTitle: "Перетащите изображение сюда",
        dropReplaceText: "Нажмите, чтобы заменить изображение, или перетащите новый файл",
        formatsHint: "PNG, JPG, WEBP, GIF и другие изображения",
        note: "",
      };
    case "audio":
      return {
        accept: "audio/*,video/mp4,.mp3,.mp4,.m4a,.wav,.ogg",
        dialogLabel: "Настроить аудио",
        urlLabel: "Ссылка на аудио или видео",
        detailLabel: "Подпись карточки",
        detailPlaceholder: "Что увидит ученик",
        description:
          "Добавьте звук ссылкой или файлом. Поддерживаются прямые ссылки и ссылки на видеосервисы, а для YouTube, VK Видео и Rutube звук при необходимости подготавливается сервером.",
        dropTitle: "Перетащите аудиофайл сюда",
        dropReplaceText: "Нажмите, чтобы заменить аудио, или перетащите другой файл",
        formatsHint: "MP3, M4A, WAV, OGG или MP4 со звуком",
        note: "Подходят прямые ссылки, MP4 со звуком и ссылки на поддерживаемые видеосервисы. Для YouTube, VK Видео и Rutube подготовка звука на сервере может занять около 20 секунд.",
      };
    case "video":
    default:
      return {
        accept: "video/*,.mp4,.webm,.ogv,.ogg",
        dialogLabel: "Настроить видео",
        urlLabel: "Ссылка на видео",
        detailLabel: "Подпись карточки",
        detailPlaceholder: "Что увидит ученик",
        description: "Добавьте видео ссылкой или файлом. Поддерживаются прямые ссылки и популярные видеосервисы.",
        dropTitle: "Перетащите видеофайл сюда",
        dropReplaceText: "Нажмите, чтобы заменить видео, или перетащите другой файл",
        formatsHint: "MP4, WEBM, OGV, а также ссылки на поддерживаемые видеосервисы",
        note: "Поддерживаются прямые ссылки и ссылки на поддерживаемые видеосервисы.",
      };
  }
}

function getMatchingMediaSourceHint(url: string) {
  const trimmed = url.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("data:")) {
    return "Встроенный файл";
  }

  try {
    const parsed = new URL(trimmed);
    const lastSegment = parsed.pathname.split("/").filter(Boolean).at(-1);
    return decodeURIComponent(lastSegment || parsed.hostname);
  } catch {
    return trimmed;
  }
}

function getMatchingMediaSummary(content: MatchingContent) {
  if (content.kind === "image") {
    const title =
      content.alt.trim() ||
      content.fileName?.trim() ||
      getMatchingMediaSourceHint(content.url) ||
      "Изображение";
    return {
      title,
      meta: content.url.trim() ? "Изображение прикреплено" : "Нажмите, чтобы добавить изображение",
      hasMedia: Boolean(content.url.trim()),
    };
  }

  if (content.kind === "audio") {
    const title =
      content.label.trim() ||
      content.fileName?.trim() ||
      getMatchingMediaSourceHint(content.url) ||
      "Аудио";
    return {
      title,
      meta: content.url.trim() ? "Аудио прикреплено" : "Нажмите, чтобы добавить аудио",
      hasMedia: Boolean(content.url.trim()),
    };
  }

  if (content.kind === "video") {
    const title =
      content.label.trim() ||
      content.fileName?.trim() ||
      getMatchingMediaSourceHint(content.url) ||
      "Видео";
    return {
      title,
      meta: content.url.trim() ? "Видео прикреплено" : "Нажмите, чтобы добавить видео",
      hasMedia: Boolean(content.url.trim()),
    };
  }

  return {
    title: "",
    meta: "",
    hasMedia: false,
  };
}

function MatchingSideFieldsCompact({
  content,
  label,
  onChange,
  onNotice,
}: Readonly<{
  content: MatchingContent;
  label: string;
  onChange: (next: MatchingContent) => void;
  onNotice?: (message: string) => void;
}>) {
  const [isMediaDialogOpen, setIsMediaDialogOpen] = useState(false);
  const [isMediaDropActive, setIsMediaDropActive] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const activeOption =
    matchingContentOptions.find((option) => option.id === content.kind) ??
    matchingContentOptions[0];
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
  const isMediaContent = mediaContent !== null;
  const isMediaDialogVisible = isMediaContent && isMediaDialogOpen;
  const hasEmbeddedFile = Boolean(mediaContent?.url.trim().startsWith("data:"));
  const selectedFileLabel = mediaContent?.fileName?.trim() ?? "";
  const isFileVideo = videoContent !== null && hasEmbeddedFile;
  const mediaUi = mediaContent ? getMatchingMediaUi(mediaContent.kind) : null;
  const mediaUrlValue = hasEmbeddedFile ? "" : mediaContent?.url ?? "";

  const setField = (
    field: "text" | "url" | "alt" | "label",
    value: string,
  ) => {
    if (field === "url" && mediaContent) {
      onChange({
        ...mediaContent,
        url: value,
        fileName: value.trim().startsWith("data:")
          ? mediaContent.fileName ?? ""
          : "",
      } as MatchingContent);
      return;
    }

    onChange({
      ...content,
      [field]: value,
    } as MatchingContent);
  };

  const setNumberField = (
    field: "size" | "startSeconds" | "volume",
    value: number,
  ) => {
    onChange({
      ...content,
      [field]: value,
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

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const baseLabel = getBaseFileLabel(file.name);

      if (kind === "image" && content.kind === "image") {
        onChange({
          ...content,
          url: dataUrl,
          alt: content.alt.trim() ? content.alt : baseLabel,
          fileName: file.name,
        });
        onNotice?.("Изображение встроено в карточку.");
        return;
      }

      if (kind === "audio" && content.kind === "audio") {
        onChange({
          ...content,
          url: dataUrl,
          label: content.label.trim() ? content.label : baseLabel,
          fileName: file.name,
        });
        onNotice?.("Аудиофайл встроен в карточку.");
        return;
      }

      if (kind === "video" && content.kind === "video") {
        onChange({
          ...content,
          url: dataUrl,
          label: content.label.trim() ? content.label : baseLabel,
          fileName: file.name,
        });
        onNotice?.("Видеофайл встроен в карточку.");
      }
    } catch (error) {
      onNotice?.(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить файл в карточку.",
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
        onChange(createMatchingContent(nextKind));
      }
      return;
    }

    setIsMediaDropActive(false);

    if (content.kind !== nextKind) {
      onChange(createMatchingContent(nextKind));
    }

    setIsMediaDialogOpen(true);
  };

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

  const mediaDialogLabel = mediaUi?.dialogLabel ?? activeOption.label;
  const dropZoneTitle = selectedFileLabel || mediaUi?.dropTitle || "";
  const dropZoneText = selectedFileLabel
    ? mediaUi?.dropReplaceText || ""
    : "Нажмите, чтобы выбрать файл в проводнике, или просто перетащите его сюда";
  const mediaSummary = mediaContent ? getMatchingMediaSummary(mediaContent) : null;

  return (
    <div className="matching-editor-side matching-editor-side--compact">
      <div className="matching-editor-side__surface">
        <div className="matching-editor-side__content">
          {isTextContent ? (
            <textarea
              aria-label={label}
              className="editor-textarea matching-editor-side__textarea"
              placeholder="Введите содержимое карточки"
              rows={2}
              value={content.text}
              onChange={(event) => setField("text", event.target.value)}
            />
          ) : mediaSummary ? (
            <button
              className={`matching-editor-media-summary ${
                mediaSummary.hasMedia ? "matching-editor-media-summary--filled" : ""
              }`}
              type="button"
              onClick={() => setIsMediaDialogOpen(true)}
            >
              {imageContent && imageContent.url.trim() ? (
                <span className="matching-editor-media-summary__preview matching-editor-media-summary__preview--image">
                  <img alt={mediaSummary.title} src={imageContent.url} />
                </span>
              ) : (
                <span className="matching-editor-media-summary__preview">
                  <MatchingTypeIcon kind={content.kind} />
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
        {matchingContentOptions.map((option) => (
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
            <MatchingTypeIcon kind={option.id} />
            <span className="sr-only">{option.label}</span>
          </button>
        ))}
        </div>
      </div>

      {isMediaDialogVisible ? (
        <MatchingEditorPortal>
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
                    <MatchingTypeIcon kind={content.kind} />
                  </span>
                  <div>
                    <strong>{activeOption.label}</strong>
                    <p className="editor-hint">
                      {selectedFileLabel
                        ? "Файл уже прикреплен. Можно заменить его новым или вставить ссылку."
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
                    <MatchingTypeIcon kind={content.kind} />
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
                        hasEmbeddedFile
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
                    <label className="matching-editor-field">
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

                  {isFileVideo && videoContent ? (
                    <label className="matching-editor-field">
                      <span className="field-label">Громкость, %</span>
                      <input
                        className="editor-input"
                        max={100}
                        min={0}
                        step={5}
                        type="number"
                        value={videoContent.volume}
                        onChange={(event) =>
                          setNumberField(
                            "volume",
                            Number.isFinite(event.target.valueAsNumber)
                              ? Math.min(
                                  100,
                                  Math.max(0, Math.round(event.target.valueAsNumber)),
                                )
                              : MATCHING_AUDIO_VOLUME_DEFAULT,
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
        </MatchingEditorPortal>
      ) : null}
    </div>
  );
}

function SideSelect({
  value,
  onChange,
}: Readonly<{
  value: MatchingExtraSide;
  onChange: (next: MatchingExtraSide) => void;
}>) {
  return (
    <label className="matching-editor-field">
      <span className="field-label">Колонка</span>
      <select
        className="editor-select"
        value={value}
        onChange={(event) => onChange(event.target.value as MatchingExtraSide)}
      >
        <option value="left">Слева</option>
        <option value="right">Справа</option>
      </select>
    </label>
  );
}

export function MatchingPairsEditor({
  themeColor = "#0b7a75",
  value,
  onChange,
  onThemeColorChange,
  onNotice,
}: Readonly<{
  themeColor?: string;
  value: MatchingPairsData;
  onChange: (next: MatchingPairsData) => void;
  onThemeColorChange?: (next: string) => void;
  onNotice?: (message: string) => void;
}>) {
  const [bulkInput, setBulkInput] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const normalized = normalizeMatchingPairsData(value);

  const updateData = (
    updater: (current: typeof normalized) => MatchingPairsData,
  ) => {
    onChange(updater(normalized));
  };

  const updatePairs = (
    updater: (current: typeof normalized.pairs) => typeof normalized.pairs,
  ) => {
    updateData((current) => ({
      ...current,
      pairs: updater(current.pairs),
    }));
  };

  const updateExtras = (
    updater: (current: MatchingExtraItem[]) => MatchingExtraItem[],
  ) => {
    updateData((current) => ({
      ...current,
      extras: updater(current.extras),
    }));
  };

  const handleBulkImport = (mode: "replace" | "append") => {
    const parsed = parseBulkPairs(bulkInput);
    if (parsed.error) {
      setBulkError(parsed.error);
      return;
    }

    updateData((current) => ({
      ...current,
      pairs:
        mode === "append"
          ? [...current.pairs, ...parsed.pairs]
          : parsed.pairs.length > 0
            ? parsed.pairs
            : [createMatchingPair()],
    }));

    setBulkError(null);
    if (mode === "replace") {
      setBulkInput("");
    }
    onNotice?.(
      mode === "append"
        ? "Пары добавлены из быстрого импорта."
        : "Пары заменены из быстрого импорта.",
    );
  };

  useEffect(() => {
    if (!isSettingsDialogOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSettingsDialogOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSettingsDialogOpen]);

  return (
    <div className="matching-editor-root">
      <div className="editor-block">
        <div className="editor-block__head matching-editor-header">
          <div className="matching-editor-header__lead">
            <button
              aria-label="Открыть параметры игры и быстрый импорт"
              className="ghost-button matching-editor-settings-trigger"
              title="Параметры игры и быстрый импорт"
              type="button"
              onClick={() => setIsSettingsDialogOpen(true)}
            >
              <SettingsIcon />
              <span className="matching-editor-settings-trigger__text">
                Настройки
              </span>
              <span className="sr-only">Параметры игры и быстрый импорт</span>
            </button>
            <div>
              <strong>Редактор пар</strong>
              <p className="editor-hint">
                Для каждой пары заполните левую и правую карточку. Тип содержимого
                выбирается иконкой.
              </p>
            </div>
          </div>
        </div>



        <div className="matching-editor-list">
          {normalized.pairs.map((pair, index) => (
            <article className="matching-editor-row matching-editor-row--pair" key={`pair-${index}`}>
              <div className="matching-editor-row__index" aria-label={`Пара ${index + 1}`}>
                {index + 1}
              </div>
              <MatchingSideFieldsCompact
                content={pair.left}
                label="Слева"
                onNotice={onNotice}
                onChange={(nextContent) =>
                  updatePairs((current) =>
                    current.map((currentPair, pairIndex) =>
                      pairIndex === index
                        ? {
                            ...currentPair,
                            left: nextContent,
                          }
                        : currentPair,
                    ),
                  )
                }
              />
              <MatchingSideFieldsCompact
                content={pair.right}
                label="Справа"
                onNotice={onNotice}
                onChange={(nextContent) =>
                  updatePairs((current) =>
                    current.map((currentPair, pairIndex) =>
                      pairIndex === index
                        ? {
                            ...currentPair,
                            right: nextContent,
                          }
                        : currentPair,
                    ),
                  )
                }
              />
              <div className="inline-actions matching-editor-row__actions">
                <button
                  aria-label="Поднять выше"
                  className="ghost-button matching-action-button"
                  disabled={index === 0}
                  title="Поднять выше"
                  type="button"
                  onClick={() =>
                    updatePairs((current) => moveItem(current, index, index - 1))
                  }
                >
                  <ActionIcon kind="up" />
                  <span className="sr-only">Поднять выше</span>
                </button>
                <button
                  aria-label="Опустить ниже"
                  className="ghost-button matching-action-button"
                  disabled={index === normalized.pairs.length - 1}
                  title="Опустить ниже"
                  type="button"
                  onClick={() =>
                    updatePairs((current) => moveItem(current, index, index + 1))
                  }
                >
                  <ActionIcon kind="down" />
                  <span className="sr-only">Опустить ниже</span>
                </button>
                <button
                  aria-label="Дублировать"
                  className="ghost-button matching-action-button"
                  title="Дублировать"
                  type="button"
                  onClick={() =>
                    updatePairs((current) => {
                      const next = [...current];
                      next.splice(index + 1, 0, structuredClone(current[index]));
                      return next;
                    })
                  }
                >
                  <ActionIcon kind="duplicate" />
                  <span className="sr-only">Дублировать</span>
                </button>
                <button
                  aria-label="Удалить"
                  className="ghost-button matching-action-button"
                  title="Удалить"
                  type="button"
                  onClick={() =>
                    updatePairs((current) => {
                      if (current.length === 1) {
                        return [createMatchingPair()];
                      }
                      return current.filter((_, pairIndex) => pairIndex !== index);
                    })
                  }
                >
                  <ActionIcon kind="delete" />
                  <span className="sr-only">Удалить</span>
                </button>
              </div>
            </article>
          ))}
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() =>
            updatePairs((current) => [...current, createMatchingPair()])
          }
        >
          Добавить следующую пару
        </button>
      </div>

      <div className="editor-block">
        <div className="editor-block__head">
          <div>
            <strong>Элементы без пары</strong>
            <p className="editor-hint">
              Дополнительные карточки можно показывать без правильного
              соответствия. Они усложняют выбор, но не дают новых правильных пар.
            </p>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={() =>
              updateExtras((current) => [...current, createMatchingExtra("right")])
            }
          >
            Добавить элемент без пары
          </button>
        </div>

        {normalized.extras.length === 0 ? (
          <p className="editor-hint">
            Пока таких элементов нет. При необходимости можно добавить отвлекающие
            карточки слева или справа.
          </p>
        ) : (
          <div className="matching-editor-list">
            {normalized.extras.map((item, index) => (
              <article className="matching-editor-row" key={`extra-${index}`}>
                <div className="matching-editor-row__head">
                  <strong>{`Элемент ${index + 1}`}</strong>
                  <div className="inline-actions">
                    <button
                      aria-label="Поднять выше"
                      className="ghost-button matching-action-button"
                      disabled={index === 0}
                      title="Поднять выше"
                      type="button"
                      onClick={() =>
                        updateExtras((current) => moveItem(current, index, index - 1))
                      }
                    >
                      <ActionIcon kind="up" />
                      Вверх
                    </button>
                    <button
                      aria-label="Опустить ниже"
                      className="ghost-button matching-action-button"
                      disabled={index === normalized.extras.length - 1}
                      title="Опустить ниже"
                      type="button"
                      onClick={() =>
                        updateExtras((current) => moveItem(current, index, index + 1))
                      }
                    >
                      <ActionIcon kind="down" />
                      Вниз
                    </button>
                    <button
                      aria-label="Дублировать"
                      className="ghost-button matching-action-button"
                      title="Дублировать"
                      type="button"
                      onClick={() =>
                        updateExtras((current) => {
                          const next = [...current];
                          next.splice(index + 1, 0, structuredClone(current[index]));
                          return next;
                        })
                      }
                    >
                      <ActionIcon kind="duplicate" />
                      Дублировать
                    </button>
                    <button
                      aria-label="Удалить"
                      className="ghost-button matching-action-button"
                      title="Удалить"
                      type="button"
                      onClick={() =>
                        updateExtras((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      <ActionIcon kind="delete" />
                      Удалить
                    </button>
                  </div>
                </div>

                <div className="matching-editor-grid matching-editor-grid--single">
                  <div className="matching-editor-extra">
                    <SideSelect
                      value={item.side}
                      onChange={(nextSide) =>
                        updateExtras((current) =>
                          current.map((currentItem, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...currentItem,
                                  side: nextSide,
                                }
                              : currentItem,
                          ),
                        )
                      }
                    />
                    <MatchingSideFieldsCompact
                      content={item.content as MatchingContent}
                      label="Карточка без пары"
                      onNotice={onNotice}
                      onChange={(nextContent) =>
                        updateExtras((current) =>
                          current.map((currentItem, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...currentItem,
                                  content: nextContent,
                                }
                              : currentItem,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {isSettingsDialogOpen ? (
        <MatchingEditorPortal>
          <div
            aria-label="Параметры игры и быстрый импорт"
            aria-modal="true"
            className="matching-editor-modal matching-editor-modal--settings"
            role="dialog"
          >
            <button
              aria-label="Закрыть окно"
              className="matching-editor-modal__backdrop"
              type="button"
              onClick={() => setIsSettingsDialogOpen(false)}
            />
            <div
              className="matching-editor-modal__dialog matching-editor-modal__dialog--settings"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="matching-editor-modal__head">
                <div>
                  <strong>Настройки упражнения</strong>
                  <p className="editor-hint">
                    Здесь собраны параметры игры и быстрый импорт пар.
                  </p>
                </div>
                <button
                  aria-label="Закрыть окно"
                  className="ghost-button matching-editor-modal__close"
                  title="Закрыть"
                  type="button"
                  onClick={() => setIsSettingsDialogOpen(false)}
                >
                  <CloseIcon />
                </button>
              </div>

              <div className="matching-editor-modal__body matching-editor-settings-modal__body">
              <section className="matching-editor-settings-section">
                <div className="matching-editor-settings-section__head">
                  <strong>Параметры игры</strong>
                  <p className="editor-hint">
                    Цвет поля, выравнивание скрепления и поведение проверки.
                  </p>
                </div>

                <div className="matching-settings-grid matching-settings-grid--split">
                  <div className="matching-settings-column">
                    <label className="matching-setting-card">
                      <span className="field-label">
                        Основной цвет фона и акцентов в игровом поле.
                      </span>
                      <div className="matching-setting-color">
                        <input
                          className="editor-input editor-input--color"
                          id="themeColor"
                          type="color"
                          value={themeColor}
                          onChange={(event) => onThemeColorChange?.(event.target.value)}
                        />
                      </div>
                    </label>

                    <div className="matching-setting-card">
                      <span className="field-label">Выравнивание при скреплении</span>
                      <div className="matching-setting-options">
                        <button
                          className={`matching-setting-chip ${
                            normalized.pairAlignment === "horizontal"
                              ? "matching-setting-chip--active"
                              : ""
                          }`}
                          type="button"
                          onClick={() =>
                            updateData((current) => ({
                              ...current,
                              pairAlignment: "horizontal",
                            }))
                          }
                        >
                          Бок о бок
                        </button>
                        <button
                          className={`matching-setting-chip ${
                            normalized.pairAlignment === "vertical"
                              ? "matching-setting-chip--active"
                              : ""
                          }`}
                          type="button"
                          onClick={() =>
                            updateData((current) => ({
                              ...current,
                              pairAlignment: "vertical",
                            }))
                          }
                        >
                          Сверху вниз
                        </button>
                      </div>
                    </div>

                    <div className="matching-setting-card">
                      <span className="field-label">Вид соединения</span>
                      <div className="matching-setting-options">
                        {matchingConnectorStyleOptions.map((option) => (
                          <button
                            className={`matching-setting-chip ${
                              normalized.connectorStyle === option.id
                                ? "matching-setting-chip--active"
                                : ""
                            }`}
                            key={option.id}
                            type="button"
                            onClick={() =>
                              updateData((current) => ({
                                ...current,
                                connectorStyle: option.id,
                              }))
                            }
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="matching-settings-column">
                    <label className="matching-setting-card matching-setting-card--toggle">
                      <input
                        checked={normalized.autoRemoveCorrectPairs}
                        type="checkbox"
                        onChange={(event) =>
                          updateData((current) => ({
                            ...current,
                            autoRemoveCorrectPairs: event.target.checked,
                          }))
                        }
                      />
                      <div>
                        <strong>Удалять правильно составленные пары</strong>
                        <p className="editor-hint">
                          Верно составленные пары автоматически исчезают с поля сразу после
                          соединения.
                        </p>
                      </div>
                    </label>

                    <label className="matching-setting-card matching-setting-card--toggle">
                      <input
                        checked={normalized.showImmediateFeedback}
                        type="checkbox"
                        onChange={(event) =>
                          updateData((current) => ({
                            ...current,
                            showImmediateFeedback: event.target.checked,
                          }))
                        }
                      />
                      <div>
                        <strong>Показывать результат сразу</strong>
                        <p className="editor-hint">
                          Правильные связки будут зелеными, ошибочные красными еще до
                          нажатия на кнопку проверки.
                        </p>
                      </div>
                    </label>

                    <label className="matching-setting-card matching-setting-card--toggle">
                      <input
                        checked={normalized.colorByGroup}
                        type="checkbox"
                        onChange={(event) =>
                          updateData((current) => ({
                            ...current,
                            colorByGroup: event.target.checked,
                          }))
                        }
                      />
                      <div>
                        <strong>Раскраска карточек по сторонам</strong>
                        <p className="editor-hint">
                          Левая и правая карточки отличаются цветом без дополнительных меток.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              </section>

              <section className="matching-editor-settings-section">
                <div className="matching-editor-settings-section__head">
                  <strong>Быстрый импорт</strong>
                  <p className="editor-hint">
                    Вставьте пары построчно в формате `лево	tab	право`, `лево ; право`,
                    `лево | право` или `лево - право`.
                  </p>
                </div>

                <textarea
                  className="editor-code editor-code--compact"
                  rows={8}
                  spellCheck={false}
                  value={bulkInput}
                  onChange={(event) => setBulkInput(event.target.value)}
                  placeholder={"HTML\tСтруктура страницы\nCSS\tОформление страницы"}
                />
                {bulkError ? <p className="error-text">{bulkError}</p> : null}
                <div className="inline-actions">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => handleBulkImport("append")}
                  >
                    Добавить к списку
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => handleBulkImport("replace")}
                  >
                    Заменить пары
                  </button>
                </div>
              </section>
              </div>
            </div>
          </div>
        </MatchingEditorPortal>
      ) : null}
    </div>
  );
}
