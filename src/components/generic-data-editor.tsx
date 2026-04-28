"use client";

import { moveItem } from "@/lib/utils";
import type { AnyExerciseDraft } from "@/lib/types";

type GenericDataValue = AnyExerciseDraft["data"];

type GenericDataEditorProps = Readonly<{
  value: GenericDataValue;
  onChange: (nextValue: GenericDataValue) => void;
}>;

type GenericValueEditorProps = Readonly<{
  fieldKey: string;
  path: string;
  value: unknown;
  onChange: (nextValue: unknown) => void;
}>;

const FIELD_LABELS: Record<string, string> = {
  answer: "Ответ",
  answers: "Ответы",
  blanks: "Пустые ячейки",
  cells: "Ячейки",
  clue: "Подсказка",
  columns: "Колонки",
  correctCells: "Правильные ячейки",
  correctIndex: "Правильный вариант",
  date: "Дата",
  entries: "Слова",
  events: "События",
  explanation: "Пояснение",
  gridSize: "Размер сетки",
  groupIndex: "Номер группы",
  groups: "Группы",
  hints: "Подсказки",
  hotspots: "Метки",
  imageUrl: "URL изображения",
  items: "Элементы",
  label: "Подпись",
  mediaKind: "Тип медиа",
  mediaUrl: "URL медиа",
  notices: "Заметки",
  opponents: "Соперники",
  options: "Варианты",
  pairs: "Пары",
  prompt: "Вопрос",
  question: "Вопрос",
  questions: "Вопросы",
  revealText: "Текст результата",
  rows: "Строки",
  text: "Текст",
  timestamp: "Таймкод",
  title: "Заголовок",
  tolerance: "Погрешность",
  trackLength: "Длина трека",
  unit: "Единица",
  word: "Слово",
  words: "Слова",
  x: "X",
  y: "Y",
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getFieldLabel(fieldKey: string) {
  if (!fieldKey) {
    return "Данные";
  }

  return FIELD_LABELS[fieldKey] ?? fieldKey;
}

function cloneUnknown<T>(value: T): T {
  return structuredClone(value);
}

function createArrayItemTemplate(items: unknown[]) {
  if (items.length > 0) {
    return cloneUnknown(items[items.length - 1]);
  }

  return "";
}

function shouldUseTextarea(fieldKey: string, value: string) {
  return (
    value.length > 80 ||
    ["clue", "description", "explanation", "prompt", "question", "revealText", "text"].includes(fieldKey)
  );
}

function GenericPrimitiveEditor({
  fieldKey,
  path,
  value,
  onChange,
}: GenericValueEditorProps) {
  const label = getFieldLabel(fieldKey);

  if (typeof value === "boolean") {
    return (
      <label className="matching-setting-card generic-data-editor__boolean">
        <input
          checked={value}
          type="checkbox"
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>
          <strong>{label}</strong>
        </span>
      </label>
    );
  }

  if (typeof value === "number") {
    return (
      <label className="matching-editor-field" htmlFor={path}>
        <span className="field-label">{label}</span>
        <input
          className="editor-input"
          id={path}
          type="number"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </label>
    );
  }

  if (typeof value === "string") {
    return (
      <label className="matching-editor-field" htmlFor={path}>
        <span className="field-label">{label}</span>
        {shouldUseTextarea(fieldKey, value) ? (
          <textarea
            className="editor-textarea"
            id={path}
            rows={4}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : (
          <input
            className="editor-input"
            id={path}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </label>
    );
  }

  return (
    <label className="matching-editor-field" htmlFor={path}>
      <span className="field-label">{label}</span>
      <input
        className="editor-input"
        id={path}
        value={value == null ? "" : String(value)}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function GenericArrayEditor({
  fieldKey,
  path,
  value,
  onChange,
}: GenericValueEditorProps & { value: unknown[] }) {
  const label = getFieldLabel(fieldKey);

  const updateItem = (index: number, nextItem: unknown) => {
    onChange(value.map((item, itemIndex) => (itemIndex === index ? nextItem : item)));
  };

  return (
    <details className="generic-data-editor__section" open>
      <summary className="editor-details__summary">
        {label}
        <span className="tag">{value.length}</span>
      </summary>

      <div className="generic-data-editor__list">
        {value.map((item, index) => (
          <article className="matching-editor-row generic-data-editor__row" key={`${path}-${index}`}>
            <div className="matching-editor-row__head">
              <div>
                <span className="matching-editor-row__index">{index + 1}</span>
                <strong>{`${label}: ${index + 1}`}</strong>
              </div>
              <div className="inline-actions">
                <button
                  className="ghost-button"
                  disabled={index === 0}
                  type="button"
                  onClick={() => onChange(moveItem(value, index, index - 1))}
                >
                  Вверх
                </button>
                <button
                  className="ghost-button"
                  disabled={index === value.length - 1}
                  type="button"
                  onClick={() => onChange(moveItem(value, index, index + 1))}
                >
                  Вниз
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => {
                    const next = [...value];
                    next.splice(index + 1, 0, cloneUnknown(item));
                    onChange(next);
                  }}
                >
                  Дублировать
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
                >
                  Удалить
                </button>
              </div>
            </div>
            <GenericValueEditor
              fieldKey={fieldKey}
              path={`${path}-${index}`}
              value={item}
              onChange={(nextItem) => updateItem(index, nextItem)}
            />
          </article>
        ))}
      </div>

      <button
        className="primary-button"
        type="button"
        onClick={() => onChange([...value, createArrayItemTemplate(value)])}
      >
        Добавить
      </button>
    </details>
  );
}

function GenericObjectEditor({
  fieldKey,
  path,
  value,
  onChange,
}: GenericValueEditorProps & { value: Record<string, unknown> }) {
  const entries = Object.entries(value);

  return (
    <div className="generic-data-editor__object">
      {fieldKey ? <strong>{getFieldLabel(fieldKey)}</strong> : null}
      <div className="generic-data-editor__grid">
        {entries.map(([key, currentValue]) => (
          <GenericValueEditor
            fieldKey={key}
            key={key}
            path={`${path}-${key}`}
            value={currentValue}
            onChange={(nextValue) =>
              onChange({
                ...value,
                [key]: nextValue,
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

function GenericValueEditor({
  fieldKey,
  path,
  value,
  onChange,
}: GenericValueEditorProps) {
  if (Array.isArray(value)) {
    return (
      <GenericArrayEditor
        fieldKey={fieldKey}
        path={path}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (isPlainRecord(value)) {
    return (
      <GenericObjectEditor
        fieldKey={fieldKey}
        path={path}
        value={value}
        onChange={onChange}
      />
    );
  }

  return (
    <GenericPrimitiveEditor
      fieldKey={fieldKey}
      path={path}
      value={value}
      onChange={onChange}
    />
  );
}

export function GenericDataEditor({ value, onChange }: GenericDataEditorProps) {
  return (
    <div className="editor-block generic-data-editor">
      <div className="editor-block__head">
        <div>
          <strong>Содержимое упражнения</strong>
          <p className="editor-hint">
            Поля обновляют превью сразу. Сложную структуру можно поправить в JSON ниже.
          </p>
        </div>
      </div>

      <GenericValueEditor
        fieldKey=""
        path="generic-data"
        value={value}
        onChange={(nextValue) => onChange(nextValue as GenericDataValue)}
      />
    </div>
  );
}
