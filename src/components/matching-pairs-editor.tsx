"use client";

import { useMemo, useState } from "react";
import {
  MATCHING_AUDIO_VOLUME_DEFAULT,
  MATCHING_IMAGE_HEIGHT_DEFAULT,
  MATCHING_IMAGE_HEIGHT_MAX,
  MATCHING_IMAGE_HEIGHT_MIN,
  createMatchingContent,
  createMatchingExtra,
  createMatchingPair,
  getMatchingContentSummary,
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
          kind: "text" as const,
          text: parsed.left,
        },
        right: {
          kind: "text" as const,
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

function MatchingSideFields({
  content,
  label,
  onChange,
}: Readonly<{
  content: MatchingContent;
  label: string;
  onChange: (next: MatchingContent) => void;
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
    field: "imageHeight" | "startSeconds" | "volume",
    value: number,
  ) => {
    onChange({
      ...content,
      [field]: value,
    } as MatchingContent);
  };

  return (
    <div className="matching-editor-side">
      <div className="matching-editor-side__head">
        <div>
          <strong>{label}</strong>
          <p className="editor-hint">{activeOption?.hint}</p>
        </div>
        <span className="tag">{getMatchingContentSummary(content)}</span>
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
            <span className="field-label">Подпись / alt</span>
            <input
              className="editor-input"
              placeholder="Краткое описание изображения"
              value={content.alt}
              onChange={(event) => setField("alt", event.target.value)}
            />
          </label>
          <label className="matching-editor-field">
            <span className="field-label">Высота изображения в карточке, px</span>
            <input
              className="editor-input"
              max={MATCHING_IMAGE_HEIGHT_MAX}
              min={MATCHING_IMAGE_HEIGHT_MIN}
              step={10}
              type="number"
              value={content.imageHeight}
              onChange={(event) =>
                setNumberField(
                  "imageHeight",
                  Number.isFinite(event.target.valueAsNumber)
                    ? Math.min(
                        MATCHING_IMAGE_HEIGHT_MAX,
                        Math.max(
                          MATCHING_IMAGE_HEIGHT_MIN,
                          Math.round(event.target.valueAsNumber),
                        ),
                      )
                    : MATCHING_IMAGE_HEIGHT_DEFAULT,
                )
              }
            />
            <p className="editor-hint">
              Меняется только высота image-карточки, остальные карточки остаются
              стандартными.
            </p>
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
            <strong>Параметры игры</strong>
            <p className="editor-hint">
              Здесь задается поведение соединения, мгновенная проверка и вид
              карточек в упражнении.
            </p>
          </div>
        </div>

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
      </div>

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

      <div className="editor-block">
        <div className="editor-block__head">
          <div>
            <strong>Быстрый импорт</strong>
            <p className="editor-hint">
              Вставьте пары построчно в формате `лево	tab	право`,
              `лево ; право`, `лево | право` или `лево - право`.
            </p>
          </div>
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
      </div>
    </>
  );
}
