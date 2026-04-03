"use client";

import { useEffect, useState, type ChangeEvent } from "react";
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
  MatchingExtraItem,
  MatchingExtraSide,
  MatchingPairsData,
} from "@/lib/types";
import { moveItem } from "@/lib/utils";

const BULK_SEPARATORS = ["\t", ";", "|", "=>"];

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
            d="M6 9a3 3 0 1 1 6 0v3a3 3 0 1 1-6 0V9Zm3 9v2m-4-2a4 4 0 0 0 8 0m3-6h2m1-3 2 3-2 3"
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

function MediaSettingsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M4 7h10m-7 5h13M4 17h10m4-12v4m-7 1v4m4 1v4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
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

function MatchingSideFields({
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
  const setField = (
    field: "text" | "url" | "alt" | "label",
    value: string,
  ) => {
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

  const handleMediaFile = async (
    kind: "image" | "audio" | "video",
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

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
        });
        onNotice?.("Изображение встроено в карточку.");
        return;
      }

      if (kind === "audio" && content.kind === "audio") {
        onChange({
          ...content,
          url: dataUrl,
          label: content.label.trim() ? content.label : baseLabel,
        });
        onNotice?.("Аудиофайл встроен в карточку.");
        return;
      }

      if (kind === "video" && content.kind === "video") {
        onChange({
          ...content,
          url: dataUrl,
          label: content.label.trim() ? content.label : baseLabel,
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

  return (
    <div className="matching-editor-side">
      <div className="matching-editor-side__head">
        <strong>{label}</strong>
      </div>

      <div className="matching-editor-types">
        {matchingContentOptions.map((option) => (
          <button
            className={`matching-editor-type ${
              option.id === content.kind ? "matching-editor-type--active" : ""
            }`}
            key={option.id}
            title={option.label}
            type="button"
            onClick={() => onChange(createMatchingContent(option.id))}
          >
            <MatchingTypeIcon kind={option.id} />
            <span className="sr-only">{option.label}</span>
          </button>
        ))}
      </div>

      {content.kind === "text" || content.kind === "spoken-text" ? (
        <>
          <label className="matching-editor-field">
            <span className="field-label">
              {content.kind === "spoken-text" ? "Текст" : "Текст"}
            </span>
            <textarea
              className="editor-textarea"
              rows={3}
              value={content.text}
              onChange={(event) => setField("text", event.target.value)}
            />
          </label>
        </>
      ) : null}

      {content.kind === "image" ? (
        <>
          <label className="matching-editor-field">
            <span className="field-label">URL изображения</span>
            <input
              className="editor-input"
              placeholder="https://..."
              value={content.url}
              onChange={(event) => setField("url", event.target.value)}
            />
          </label>
          <label className="matching-editor-field">
            <span className="field-label">Файл изображения</span>
            <input
              accept="image/*"
              className="editor-input"
              type="file"
              onChange={(event) => void handleMediaFile("image", event)}
            />
            <p className="editor-hint">
              Можно вставить ссылку или выбрать файл из проводника. Файл будет
              встроен в упражнение и попадет в JSON-экспорт.
            </p>
          </label>
          <label className="matching-editor-field">
            <span className="field-label">Подпись / alt</span>
            <input
              className="editor-input"
              placeholder="Краткое описание изображения"
              value={content.alt}
              onChange={(event) => setField("alt", event.target.value)}
            />
          </label>
        </>
      ) : null}

      {content.kind === "audio" || content.kind === "video" ? (
        <>
          <label className="matching-editor-field">
            <span className="field-label">
              {content.kind === "audio" ? "URL аудио / видео для звука" : "URL видео"}
            </span>
            <input
              className="editor-input"
              placeholder="https://..."
              value={content.url}
              onChange={(event) => setField("url", event.target.value)}
            />
            {content.kind === "video" ? (
              <p className="editor-hint">
                Поддерживаются прямые видеофайлы, Rutube и VK Видео.
              </p>
            ) : null}
          </label>
          <label className="matching-editor-field">
            <span className="field-label">
              {content.kind === "audio" ? "Файл аудио" : "Файл видео"}
            </span>
            <input
              accept={
                content.kind === "audio"
                  ? "audio/*,video/mp4,.mp3,.mp4,.m4a,.wav,.ogg"
                  : "video/*,.mp4,.webm,.ogv,.ogg"
              }
              className="editor-input"
              type="file"
              onChange={(event) =>
                void handleMediaFile(content.kind, event)
              }
            />
            <p className="editor-hint">
              Файл из проводника будет встроен в упражнение и попадет в
              JSON-экспорт.
            </p>
          </label>
          {content.kind === "audio" ? (
            <p className="editor-hint">
              Можно использовать прямую ссылку на `.mp3`, `.mp4` или ссылку на
              поддерживаемый видеосервис. В аудиокарточке будет открываться
              именно аудиоплеер, без показа видео.
            </p>
          ) : null}
          <label className="matching-editor-field">
            <span className="field-label">Подпись карточки</span>
            <input
              className="editor-input"
              placeholder="Что увидит ученик на карточке"
              value={content.label}
              onChange={(event) => setField("label", event.target.value)}
            />
          </label>
          {content.kind === "video" ? (
            <label className="matching-editor-field">
              <span className="field-label">Громкость, %</span>
              <input
                className="editor-input"
                max={100}
                min={0}
                step={5}
                type="number"
                value={content.volume}
                onChange={(event) =>
                  setNumberField(
                    "volume",
                    Number.isFinite(event.target.valueAsNumber)
                      ? Math.min(100, Math.max(0, Math.round(event.target.valueAsNumber)))
                      : MATCHING_AUDIO_VOLUME_DEFAULT,
                  )
                }
              />
              <p className="editor-hint">
                Работает для видеофайлов. Для встроенных видеосервисов
                громкость остается на стороне их плеера.
              </p>
            </label>
          ) : null}
<<<<<<< Updated upstream
          {content.kind === "video" ? (
            <label className="matching-editor-field">
              <span className="field-label">Начинать с секунды</span>
              <input
                className="editor-input"
                min={0}
                step={1}
                type="number"
                value={content.startSeconds}
                onChange={(event) =>
                  setNumberField(
                    "startSeconds",
                    Number.isFinite(event.target.valueAsNumber)
                      ? Math.max(0, Math.round(event.target.valueAsNumber))
                      : 0,
                  )
                }
              />
              <p className="editor-hint">
                Для видеофайлов и поддерживаемых видеосервисов. `0` означает
                старт с самого начала.
              </p>
            </label>
          ) : null}
=======
>>>>>>> Stashed changes
        </>
      ) : null}
    </div>
  );
}

void MatchingSideFields;

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
  const activeOption =
    matchingContentOptions.find((option) => option.id === content.kind) ??
    matchingContentOptions[0];
  const isMediaContent =
    content.kind === "image" ||
    content.kind === "audio" ||
    content.kind === "video";

  const setField = (
    field: "text" | "url" | "alt" | "label",
    value: string,
  ) => {
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

  const handleMediaFile = async (
    kind: "image" | "audio" | "video",
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

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
        });
        onNotice?.("Изображение встроено в карточку.");
        return;
      }

      if (kind === "audio" && content.kind === "audio") {
        onChange({
          ...content,
          url: dataUrl,
          label: content.label.trim() ? content.label : baseLabel,
        });
        onNotice?.("Аудиофайл встроен в карточку.");
        return;
      }

      if (kind === "video" && content.kind === "video") {
        onChange({
          ...content,
          url: dataUrl,
          label: content.label.trim() ? content.label : baseLabel,
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

  useEffect(() => {
    if (!isMediaDialogOpen) {
      return;
    }

    if (!isMediaContent) {
      setIsMediaDialogOpen(false);
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
  }, [isMediaContent, isMediaDialogOpen]);

  const mediaButtonLabel =
    content.kind === "image"
      ? "Настроить изображение"
      : content.kind === "audio"
        ? "Настроить аудио"
        : "Настроить видео";

  return (
    <div className="matching-editor-side">
      <div className="matching-editor-side__head">
        <strong>{label}</strong>
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
            onClick={() => onChange(createMatchingContent(option.id))}
          >
            <MatchingTypeIcon kind={option.id} />
            <span className="sr-only">{option.label}</span>
          </button>
        ))}
      </div>

      {content.kind === "text" || content.kind === "spoken-text" ? (
        <textarea
          aria-label={label}
          className="editor-textarea"
          placeholder="Введите содержимое карточки"
          rows={3}
          value={content.text}
          onChange={(event) => setField("text", event.target.value)}
        />
      ) : null}

      {isMediaContent ? (
        <button
          className="ghost-button matching-editor-media-button matching-editor-media-button--block"
          title={mediaButtonLabel}
          type="button"
          onClick={() => setIsMediaDialogOpen(true)}
        >
          <MediaSettingsIcon />
          Медиа
        </button>
      ) : null}

      {isMediaContent && isMediaDialogOpen ? (
        <div
          aria-label={mediaButtonLabel}
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
                <p className="editor-hint">{activeOption.label}</p>
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
              {content.kind === "image" ? (
                <>
                  <label className="matching-editor-field">
                    <span className="field-label">URL изображения</span>
                    <input
                      className="editor-input"
                      placeholder="https://..."
                      value={content.url}
                      onChange={(event) => setField("url", event.target.value)}
                    />
                  </label>
                  <label className="matching-editor-field">
                    <span className="field-label">Файл изображения</span>
                    <input
                      accept="image/*"
                      className="editor-input"
                      type="file"
                      onChange={(event) => void handleMediaFile("image", event)}
                    />
                  </label>
                  <label className="matching-editor-field">
                    <span className="field-label">Подпись / alt</span>
                    <input
                      className="editor-input"
                      placeholder="Короткое описание"
                      value={content.alt}
                      onChange={(event) => setField("alt", event.target.value)}
                    />
                  </label>
                </>
              ) : null}

              {content.kind === "audio" || content.kind === "video" ? (
                <>
                  <label className="matching-editor-field">
                    <span className="field-label">
                      {content.kind === "audio"
                        ? "URL аудио / видео для звука"
                        : "URL видео"}
                    </span>
                    <input
                      className="editor-input"
                      placeholder="https://..."
                      value={content.url}
                      onChange={(event) => setField("url", event.target.value)}
                    />
                  </label>
                  <label className="matching-editor-field">
                    <span className="field-label">
                      {content.kind === "audio" ? "Файл аудио" : "Файл видео"}
                    </span>
                    <input
                      accept={
                        content.kind === "audio"
                          ? "audio/*,video/mp4,.mp3,.mp4,.m4a,.wav,.ogg"
                          : "video/*,.mp4,.webm,.ogv,.ogg"
                      }
                      className="editor-input"
                      type="file"
                      onChange={(event) =>
                        void handleMediaFile(content.kind, event)
                      }
                    />
                  </label>
                  <label className="matching-editor-field">
                    <span className="field-label">Подпись карточки</span>
                    <input
                      className="editor-input"
                      placeholder="Что увидит ученик"
                      value={content.label}
                      onChange={(event) => setField("label", event.target.value)}
                    />
                  </label>
                </>
              ) : null}

              {content.kind === "video" ? (
                <>
                  <label className="matching-editor-field">
                    <span className="field-label">Громкость, %</span>
                    <input
                      className="editor-input"
                      max={100}
                      min={0}
                      step={5}
                      type="number"
                      value={content.volume}
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
                  </label>встроенно
                </>
              ) : null}

              {content.kind === "audio" ? (
                <p className="editor-hint">
                  Можно использовать прямую ссылку или YouTube, если нужен
                  только звук.
                </p>
              ) : null}
            </div>
          </div>
        </div>
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

  return (
    <div className="matching-editor-root">
      <div className="editor-block">
        <div className="editor-block__head">
          <div>
            <strong>Редактор пар</strong>
            <p className="editor-hint">
              Для каждой пары заполните левую и правую карточку. Тип содержимого
              выбирается иконкой.
            </p>
          </div>
        </div>



        <div className="matching-editor-list">
          {normalized.pairs.map((pair, index) => (
            <article className="matching-editor-row" key={`pair-${index}`}>
              <div className="matching-editor-row__head">
                <strong>{`Пара ${index + 1}`}</strong>
                <div className="inline-actions">
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
                    Вверх
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
                    Вниз
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
                    Дублировать
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
                    Удалить
                  </button>
                </div>
              </div>

              <div className="matching-editor-grid">
                <MatchingSideFieldsCompact
                  content={pair.left}
                  label="Левая карточка"
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
                  label="Правая карточка"
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

      <details className="editor-block editor-details">
        <summary className="editor-details__summary">Параметры игры</summary>
        <p className="editor-hint">
          Здесь задается поведение соединения, мгновенная проверка и вид
          карточек в упражнении.
        </p>

        <div className="matching-settings-grid">
          <label className="matching-setting-card">
            <span className="field-label">Основной цвет фона и акцентов в игровом поле.</span>
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
              <strong>Раскраска карточек по группам</strong>
              <p className="editor-hint">
                Левая и правая колонка получают разные цвета: синий и оранжевый.
              </p>
            </div>
          </label>
        </div>
      </details>

      <details className="editor-block editor-details">
        <summary className="editor-details__summary">Быстрый импорт</summary>
        <p className="editor-hint">
          Вставьте пары построчно в формате `лево	tab	право`, `лево ; право`,
          `лево | право` или `лево - право`.
        </p>

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
      </details>
    </div>
  );
}
