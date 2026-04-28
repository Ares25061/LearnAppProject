"use client";

import {
  convertMatchingContentKind,
  createNumberLineItem,
  normalizeNumberLineData,
} from "@/lib/number-line";
import {
  matchingContentOptions,
  normalizeMatchingSide,
} from "@/lib/matching-pairs";
import type {
  MatchingContent,
  MatchingContentKind,
  NumberLineData,
  NumberLineItem,
} from "@/lib/types";
import { moveItem } from "@/lib/utils";

type NumberLineEditorProps = Readonly<{
  themeColor: string;
  value: NumberLineData;
  onChange: (nextValue: NumberLineData) => void;
  onThemeColorChange: (nextColor: string) => void;
}>;

function cloneItem(item: NumberLineItem): NumberLineItem {
  return structuredClone(item);
}

function NumberLineTypeIcon({
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

function NumberLineContentEditor({
  value,
  onChange,
}: Readonly<{
  value: NumberLineItem["content"];
  onChange: (nextContent: MatchingContent) => void;
}>) {
  const content = normalizeMatchingSide(value);

  const handleKindChange = (nextKind: MatchingContentKind) => {
    onChange(convertMatchingContentKind(content, nextKind));
  };

  return (
    <div className="matching-editor-side number-line-editor-card-content">
      <div className="matching-editor-side__head">
        <div>
          <strong>Карточка</strong>
          <p className="editor-hint">
            Текст переносится между обычной и озвученной карточкой.
          </p>
        </div>
      </div>

      <div className="matching-editor-types" role="group" aria-label="Тип карточки">
        {matchingContentOptions.map((option) => (
          <button
            aria-label={option.label}
            aria-pressed={content.kind === option.id}
            className={`matching-editor-type ${
              content.kind === option.id ? "matching-editor-type--active" : ""
            }`}
            key={option.id}
            title={option.label}
            type="button"
            onClick={() => handleKindChange(option.id)}
          >
            <NumberLineTypeIcon kind={option.id} />
            <span className="sr-only">{option.label}</span>
          </button>
        ))}
      </div>

      {content.kind === "text" || content.kind === "spoken-text" ? (
        <label className="matching-editor-field">
          <span className="field-label">
            {content.kind === "spoken-text" ? "Текст для озвучивания" : "Текст карточки"}
          </span>
          <textarea
            className="editor-textarea"
            rows={4}
            value={content.text}
            onChange={(event) =>
              onChange({
                ...content,
                text: event.target.value,
              })
            }
          />
        </label>
      ) : null}

      {content.kind === "image" ? (
        <div className="matching-editor-grid matching-editor-grid--single">
          <label className="matching-editor-field">
            <span className="field-label">URL изображения</span>
            <input
              className="editor-input"
              value={content.url}
              onChange={(event) =>
                onChange({
                  ...content,
                  url: event.target.value,
                })
              }
            />
          </label>
          <label className="matching-editor-field">
            <span className="field-label">Подпись</span>
            <input
              className="editor-input"
              value={content.alt}
              onChange={(event) =>
                onChange({
                  ...content,
                  alt: event.target.value,
                })
              }
            />
          </label>
        </div>
      ) : null}

      {content.kind === "audio" ? (
        <div className="matching-editor-grid matching-editor-grid--single">
          <label className="matching-editor-field">
            <span className="field-label">URL аудио</span>
            <input
              className="editor-input"
              value={content.url}
              onChange={(event) =>
                onChange({
                  ...content,
                  url: event.target.value,
                })
              }
            />
          </label>
          <label className="matching-editor-field">
            <span className="field-label">Подпись</span>
            <input
              className="editor-input"
              value={content.label}
              onChange={(event) =>
                onChange({
                  ...content,
                  label: event.target.value,
                })
              }
            />
          </label>
          <label className="matching-editor-field">
            <span className="field-label">Громкость</span>
            <input
              className="editor-input"
              max={100}
              min={0}
              type="range"
              value={content.volume}
              onChange={(event) =>
                onChange({
                  ...content,
                  volume: Number(event.target.value),
                })
              }
            />
          </label>
        </div>
      ) : null}

      {content.kind === "video" ? (
        <div className="matching-editor-grid matching-editor-grid--single">
          <label className="matching-editor-field">
            <span className="field-label">URL видео</span>
            <input
              className="editor-input"
              value={content.url}
              onChange={(event) =>
                onChange({
                  ...content,
                  url: event.target.value,
                })
              }
            />
          </label>
          <label className="matching-editor-field">
            <span className="field-label">Подпись</span>
            <input
              className="editor-input"
              value={content.label}
              onChange={(event) =>
                onChange({
                  ...content,
                  label: event.target.value,
                })
              }
            />
          </label>
          <div className="matching-editor-grid">
            <label className="matching-editor-field">
              <span className="field-label">Старт, сек.</span>
              <input
                className="editor-input"
                min={0}
                type="number"
                value={content.startSeconds}
                onChange={(event) =>
                  onChange({
                    ...content,
                    startSeconds: Math.max(0, Number(event.target.value) || 0),
                  })
                }
              />
            </label>
            <label className="matching-editor-field">
              <span className="field-label">Громкость</span>
              <input
                className="editor-input"
                max={100}
                min={0}
                type="range"
                value={content.volume}
                onChange={(event) =>
                  onChange({
                    ...content,
                    volume: Number(event.target.value),
                  })
                }
              />
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function NumberLineEditor({
  themeColor,
  value,
  onChange,
  onThemeColorChange,
}: NumberLineEditorProps) {
  const data = normalizeNumberLineData(value);

  const setItems = (items: NumberLineItem[]) => {
    onChange({
      ...data,
      items,
    });
  };

  const updateItem = (index: number, nextItem: NumberLineItem) => {
    setItems(
      data.items.map((item, itemIndex) =>
        itemIndex === index ? nextItem : item,
      ),
    );
  };

  const handleMinChange = (nextMin: number) => {
    onChange({
      ...data,
      min: Number.isFinite(nextMin) ? nextMin : data.min,
      max: Math.max(data.max, Number.isFinite(nextMin) ? nextMin + 1 : data.max),
    });
  };

  const handleMaxChange = (nextMax: number) => {
    onChange({
      ...data,
      max: Number.isFinite(nextMax) ? Math.max(nextMax, data.min + 1) : data.max,
    });
  };

  return (
    <div className="matching-editor-root number-line-editor">
      <div className="editor-block">
        <div className="editor-block__head">
          <div>
            <strong>Настройки ленты</strong>
            <p className="editor-hint">
              Значение карточки может быть числом или диапазоном, например 1914-1918.
            </p>
          </div>
        </div>

        <div className="matching-settings-grid">
          <label className="matching-editor-field">
            <span className="field-label">Минимум</span>
            <input
              className="editor-input"
              type="number"
              value={data.min}
              onChange={(event) => handleMinChange(Number(event.target.value))}
            />
          </label>
          <label className="matching-editor-field">
            <span className="field-label">Максимум</span>
            <input
              className="editor-input"
              type="number"
              value={data.max}
              onChange={(event) => handleMaxChange(Number(event.target.value))}
            />
          </label>
          <label className="matching-editor-field">
            <span className="field-label">Цвет</span>
            <input
              className="editor-input editor-input--color"
              type="color"
              value={themeColor}
              onChange={(event) => onThemeColorChange(event.target.value)}
            />
          </label>
          <label className="matching-setting-card number-line-editor-toggle">
            <input
              checked={data.showHints}
              type="checkbox"
              onChange={(event) =>
                onChange({
                  ...data,
                  showHints: event.target.checked,
                })
              }
            />
            <span>
              <strong>Показывать подсказки на оси</strong>
              <small>На превью будут видны точки и диапазоны правильных значений.</small>
            </span>
          </label>
        </div>
      </div>

      <div className="editor-block">
        <div className="editor-block__head">
          <div>
            <strong>Карточки</strong>
            <p className="editor-hint">
              До 20 карточек с текстом, озвученным текстом, изображением, аудио или видео.
            </p>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={() => setItems([...data.items, createNumberLineItem(data.items.length)])}
          >
            Добавить карточку
          </button>
        </div>

        <div className="matching-editor-list number-line-editor-list">
          {data.items.map((item, index) => (
            <article className="matching-editor-row number-line-editor-row" key={index}>
              <div className="matching-editor-row__head">
                <div>
                  <span className="matching-editor-row__index">{index + 1}</span>
                  <strong>Позиция на ленте</strong>
                </div>
                <div className="inline-actions">
                  <button
                    className="ghost-button"
                    disabled={index === 0}
                    type="button"
                    onClick={() => setItems(moveItem(data.items, index, index - 1))}
                  >
                    Вверх
                  </button>
                  <button
                    className="ghost-button"
                    disabled={index === data.items.length - 1}
                    type="button"
                    onClick={() => setItems(moveItem(data.items, index, index + 1))}
                  >
                    Вниз
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => {
                      const next = [...data.items];
                      next.splice(index + 1, 0, cloneItem(item));
                      setItems(next);
                    }}
                  >
                    Дублировать
                  </button>
                  <button
                    className="ghost-button"
                    disabled={data.items.length <= 1}
                    type="button"
                    onClick={() =>
                      setItems(data.items.filter((_, itemIndex) => itemIndex !== index))
                    }
                  >
                    Удалить
                  </button>
                </div>
              </div>

              <div className="number-line-editor-row__body">
                <NumberLineContentEditor
                  value={item.content}
                  onChange={(nextContent) =>
                    updateItem(index, {
                      ...item,
                      content: nextContent,
                    })
                  }
                />

                <label className="matching-editor-field number-line-editor-value">
                  <span className="field-label">Правильное значение</span>
                  <input
                    className="editor-input"
                    inputMode="decimal"
                    placeholder="1564 или 1914-1918"
                    value={item.value}
                    onChange={(event) =>
                      updateItem(index, {
                        ...item,
                        value: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
