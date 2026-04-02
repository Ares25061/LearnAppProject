"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  MATCHING_AUDIO_SIZE_DEFAULT,
  MATCHING_AUDIO_VOLUME_DEFAULT,
  MATCHING_IMAGE_HEIGHT_DEFAULT,
  MATCHING_IMAGE_HEIGHT_MAX,
  MATCHING_IMAGE_HEIGHT_MIN,
  MATCHING_SPOKEN_TEXT_SIZE_DEFAULT,
  MATCHING_TEXT_SIZE_DEFAULT,
  MATCHING_VIDEO_SIZE_DEFAULT,
  createMatchingContent,
  createMatchingExtra,
  createMatchingPair,
  getMatchingContentSummary,
  matchingContentOptions,
  normalizeMatchingSize,
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
const MATCHING_TAG_SUMMARY_LIMIT = 65;

function truncateMatchingTagText(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= MATCHING_TAG_SUMMARY_LIMIT) {
    return trimmed;
  }

  return `${trimmed.slice(0, MATCHING_TAG_SUMMARY_LIMIT - 3).trimEnd()}...`;
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

function getMediaSizeDescription() {
  return `Минимум ${MATCHING_IMAGE_HEIGHT_MIN}px, максимум ${MATCHING_IMAGE_HEIGHT_MAX}px.`;
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

function MatchingSizeField({
  hint,
  label,
  value,
  defaultValue,
  onCommit,
}: Readonly<{
  hint?: string;
  label: string;
  value: number;
  defaultValue: number;
  onCommit: (next: number) => void;
}>) {
  const [inputValue, setInputValue] = useState(`${value}`);

  useEffect(() => {
    setInputValue(`${value}`);
  }, [value]);

  const commitValue = () => {
    const next = normalizeMatchingSize(
      inputValue.trim() ? Number.parseInt(inputValue, 10) : Number.NaN,
      defaultValue,
    );
    onCommit(next);
    setInputValue(`${next}`);
  };

  return (
    <label className="matching-editor-field">
      <span className="field-label">{label}</span>
      <input
        className="editor-input"
        inputMode="numeric"
        max={MATCHING_IMAGE_HEIGHT_MAX}
        min={MATCHING_IMAGE_HEIGHT_MIN}
        step={10}
        type="number"
        value={inputValue}
        onBlur={commitValue}
        onChange={(event) => setInputValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitValue();
          }
        }}
      />
      <p className="editor-hint">{getMediaSizeDescription()}</p>
      {hint ? <p className="editor-hint">{hint}</p> : null}
    </label>
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
  const activeOption = useMemo(
    () => matchingContentOptions.find((option) => option.id === content.kind),
    [content.kind],
  );

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
        <div>
          <strong>{label}</strong>
          <p className="editor-hint">{activeOption?.hint}</p>
        </div>
        <span className="tag">
          {truncateMatchingTagText(getMatchingContentSummary(content))}
        </span>
      </div>

      <div className="matching-editor-types">
        {matchingContentOptions.map((option) => (
          <button
            className={`matching-editor-type ${
              option.id === content.kind ? "matching-editor-type--active" : ""
            }`}
            key={option.id}
            type="button"
            onClick={() => onChange(createMatchingContent(option.id))}
          >
            <span>{option.shortLabel}</span>
            <span>{option.label}</span>
          </button>
        ))}
      </div>

      {content.kind === "text" || content.kind === "spoken-text" ? (
        <>
          <label className="matching-editor-field">
            <span className="field-label">
              {content.kind === "spoken-text" ? "Текст для озвучивания" : "Текст"}
            </span>
            <textarea
              className="editor-textarea"
              rows={4}
              value={content.text}
              onChange={(event) => setField("text", event.target.value)}
            />
          </label>
          <MatchingSizeField
            defaultValue={
              content.kind === "spoken-text"
                ? MATCHING_SPOKEN_TEXT_SIZE_DEFAULT
                : MATCHING_TEXT_SIZE_DEFAULT
            }
            hint={
              content.kind === "spoken-text"
                ? "Меняется общая высота карточки с озвученным текстом."
                : "Меняется общая высота текстовой карточки."
            }
            label={
              content.kind === "spoken-text"
                ? "Размер карточки озвученного текста, px"
                : "Размер текстовой карточки, px"
            }
            value={content.size}
            onCommit={(next) => setNumberField("size", next)}
          />
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
          <MatchingSizeField
            defaultValue={MATCHING_IMAGE_HEIGHT_DEFAULT}
            hint="Меняется высота изображения внутри карточки."
            label="Размер изображения в карточке, px"
            value={content.size}
            onCommit={(next) => setNumberField("size", next)}
          />
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
              Можно использовать прямую ссылку на `.mp3`, `.mp4` или YouTube.
              В audio-карточке будет открываться именно аудиоплеер, без показа
              видео.
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
          {content.kind === "audio" ? (
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
            </label>
          ) : null}
          <MatchingSizeField
            defaultValue={
              content.kind === "audio"
                ? MATCHING_AUDIO_SIZE_DEFAULT
                : MATCHING_VIDEO_SIZE_DEFAULT
            }
            hint={
              content.kind === "audio"
                ? "Меняется высота блока проигрывания внутри аудио-карточки."
                : "Меняется высота превью видео в карточке."
            }
            label={
              content.kind === "audio"
                ? "Размер аудио-блока, px"
                : "Размер превью видео, px"
            }
            value={content.size}
            onCommit={(next) => setNumberField("size", next)}
          />
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
                Работает для видеофайлов. Для YouTube громкость остается на стороне
                встроенного плеера.
              </p>
            </label>
          ) : null}
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
                Для YouTube и обычного видео. `0` означает старт с самого начала.
              </p>
            </label>
          ) : null}
        </>
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
  value,
  onChange,
  onNotice,
}: Readonly<{
  value: MatchingPairsData;
  onChange: (next: MatchingPairsData) => void;
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
    <>
      <div className="editor-block">
        <div className="editor-block__head">
          <div>
            <strong>Редактор пар</strong>
            <p className="editor-hint">
              Каждая строка задает одну пару. У каждой стороны можно выбрать
              текст, картинку, аудио, видео или озвученный текст.
            </p>
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

        <div className="matching-editor-list">
          {normalized.pairs.map((pair, index) => (
            <article className="matching-editor-row" key={`pair-${index}`}>
              <div className="matching-editor-row__head">
                <strong>{`Пара ${index + 1}`}</strong>
                <div className="inline-actions">
                  <button
                    className="ghost-button"
                    disabled={index === 0}
                    type="button"
                    onClick={() =>
                      updatePairs((current) => moveItem(current, index, index - 1))
                    }
                  >
                    Вверх
                  </button>
                  <button
                    className="ghost-button"
                    disabled={index === normalized.pairs.length - 1}
                    type="button"
                    onClick={() =>
                      updatePairs((current) => moveItem(current, index, index + 1))
                    }
                  >
                    Вниз
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() =>
                      updatePairs((current) => {
                        const next = [...current];
                        next.splice(index + 1, 0, structuredClone(current[index]));
                        return next;
                      })
                    }
                  >
                    Дублировать
                  </button>
                  <button
                    className="ghost-button"
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
                    Удалить
                  </button>
                </div>
              </div>

              <div className="matching-editor-grid">
                <MatchingSideFields
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
                <MatchingSideFields
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
                      className="ghost-button"
                      disabled={index === 0}
                      type="button"
                      onClick={() =>
                        updateExtras((current) => moveItem(current, index, index - 1))
                      }
                    >
                      Вверх
                    </button>
                    <button
                      className="ghost-button"
                      disabled={index === normalized.extras.length - 1}
                      type="button"
                      onClick={() =>
                        updateExtras((current) => moveItem(current, index, index + 1))
                      }
                    >
                      Вниз
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() =>
                        updateExtras((current) => {
                          const next = [...current];
                          next.splice(index + 1, 0, structuredClone(current[index]));
                          return next;
                        })
                      }
                    >
                      Дублировать
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() =>
                        updateExtras((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
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
                    <MatchingSideFields
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
    </>
  );
}
