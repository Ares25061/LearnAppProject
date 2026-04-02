"use client";

import Link from "next/link";
import {
  useDeferredValue,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
} from "react";
import { useRouter } from "next/navigation";
import { ExercisePlayer } from "@/components/exercise-player";
import { MatchingPairsEditor } from "@/components/matching-pairs-editor";
import {
  createDefaultDraft,
  exerciseDefinitionMap,
  parseDraft,
} from "@/lib/exercise-definitions";
import type {
  AnyExerciseDraft,
  MatchingPairsData,
  PublicUser,
} from "@/lib/types";
import { safeFilename } from "@/lib/utils";

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
  const [draft, setDraft] = useState(initialDraft);
  const [currentId, setCurrentId] = useState(existingId);
  const [currentSlug, setCurrentSlug] = useState(existingSlug);
  const [dataText, setDataText] = useState(
    JSON.stringify(initialDraft.data, null, 2),
  );
  const [dataError, setDataError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const deferredDraft = useDeferredValue(draft);
  const definition = exerciseDefinitionMap[draft.type];
  const isMatchingPairs = draft.type === "matching-pairs";
  const matchingPairsData = isMatchingPairs
    ? (draft.data as MatchingPairsData)
    : null;

  const setDraftData = (
    nextData: AnyExerciseDraft["data"],
    nextNotice: string | null = null,
  ) => {
    setDraft((current) => ({
      ...current,
      data: nextData,
    }) as AnyExerciseDraft);
    setDataText(JSON.stringify(nextData, null, 2));
    setDataError(null);
    setNotice(nextNotice);
  };

  const resolveCurrentDraft = () => {
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
    setNotice("Шаблон сброшен к начальному примеру.");
  };

  const persistDraft = (endpoint: string, action: "save" | "export") => {
    const resolvedDraft = resolveCurrentDraft();
    if (!resolvedDraft) {
      return;
    }

    const payload = {
      id: currentId,
      draft: resolvedDraft,
    };

    startTransition(async () => {
      try {
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
          setNotice(result?.error ?? "Операция завершилась с ошибкой.");
          return;
        }

        if (action === "save") {
          const result = (await response.json()) as {
            app: { id: string; slug: string };
          };
          setCurrentId(result.app.id);
          setCurrentSlug(result.app.slug);
          setNotice("Упражнение сохранено.");
          if (mode === "create") {
            router.replace(`/edit/${result.app.id}`);
          }
          return;
        }

        const blob = await response.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = downloadUrl;
        anchor.download = `${safeFilename(draft.title)}.zip`;
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

        setNotice("SCORM-архив скачан.");
        if (mode === "create" && user && appId) {
          router.replace(`/edit/${appId}`);
        }
      } catch (error) {
        setNotice(
          error instanceof Error ? error.message : "Операция не завершилась.",
        );
      }
    });
  };

  const handleJsonExport = () => {
    const resolvedDraft = resolveCurrentDraft();
    if (!resolvedDraft) {
      return;
    }

    const exportPayload = {
      format: "learningapps-studio/draft",
      version: 1,
      exportedAt: new Date().toISOString(),
      draft: resolvedDraft,
    };

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
    setNotice("JSON-экспорт скачан.");
  };

  const handleJsonImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const source = JSON.parse(await file.text()) as
        | { draft?: unknown }
        | AnyExerciseDraft;
      const importedDraft = parseDraft(
        source && typeof source === "object" && "draft" in source
          ? source.draft
          : source,
      );

      if (!importedDraft) {
        setNotice("Файл не похож на экспорт упражнения.");
        return;
      }

      setDraft(importedDraft);
      setDataText(JSON.stringify(importedDraft.data, null, 2));
      setDataError(null);
      setNotice("Черновик импортирован из JSON.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Не удалось импортировать JSON.",
      );
    }
  };

  const handleSave = () => {
    if (!user) {
      setNotice(
        "Для сохранения и дальнейшего редактирования войдите в аккаунт.",
      );
      return;
    }

    persistDraft("/api/apps", "save");
  };

  const handleExport = () => {
    persistDraft("/api/export", "export");
  };

  const draftActionsBlock = (
    <div className="editor-block">
      <div className="editor-block__head">
        <div>
          <strong>Действия с черновиком</strong>
          <p className="editor-hint">
            Сохранение, экспорт и импорт собраны в одном месте без лишних настроек.
          </p>
        </div>
      </div>

      <div className="inline-actions">
        <button
          className="primary-button"
          disabled={isPending}
          type="button"
          onClick={handleExport}
        >
          Скачать SCORM
        </button>
        <button
          className="ghost-button"
          disabled={isPending}
          type="button"
          onClick={handleSave}
        >
          Сохранить
        </button>
        <button
          className="ghost-button"
          disabled={isPending}
          type="button"
          onClick={handleJsonExport}
        >
          Скачать JSON
        </button>
        <button
          className="ghost-button"
          disabled={isPending}
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
      {notice ? <p className="editor-hint">{notice}</p> : null}
    </div>
  );

  const previewBlock = (
    <div className="editor-block">
      <div className="editor-block__head">
        <div>
          <strong>Живое превью</strong>
          <p className="editor-hint">
            Сразу видно, как упражнение будет выглядеть для пользователя.
          </p>
        </div>
        <span className="eyebrow">{isPending ? "Сохранение..." : "Готово"}</span>
      </div>
      <ExercisePlayer key={JSON.stringify(deferredDraft)} draft={deferredDraft} />
    </div>
  );

  return (
    <div className={`editor-shell ${isMatchingPairs ? "editor-shell--single" : ""}`}>
      <aside className="editor-sidebar">
        <div className="editor-block editor-block--hero">
          <span className="eyebrow">Редактор упражнения</span>
          <h2>{definition.title}</h2>
          <p>{definition.shortDescription}</p>
          <div className="editor-status-list">
            <span className="tag">{mode === "create" ? "Новый черновик" : "Редактирование"}</span>
            <span className="tag">{isMatchingPairs ? "Упрощенный поток" : "Стандартный режим"}</span>
          </div>
        </div>

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
        </details>

        {isMatchingPairs && matchingPairsData ? (
          <MatchingPairsEditor
            value={matchingPairsData}
            onChange={(nextData) => setDraftData(nextData)}
            onNotice={setNotice}
          />
        ) : null}

        {isMatchingPairs ? previewBlock : null}

        {!isMatchingPairs ? (
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

        {draftActionsBlock}
      </aside>

      <section className="editor-preview">
        {!isMatchingPairs && matchingPairsData ? (
          <MatchingPairsEditor
            value={matchingPairsData}
            onChange={(nextData) => setDraftData(nextData)}
            onNotice={setNotice}
          />
        ) : null}

        {!isMatchingPairs ? previewBlock : null}
      </section>
    </div>
  );
}
