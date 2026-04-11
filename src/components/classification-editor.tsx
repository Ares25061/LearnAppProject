"use client";
/* eslint-disable @next/next/no-img-element */

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
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
