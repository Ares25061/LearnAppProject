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
  const previewHostRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState(initialDraft);
  const [currentId, setCurrentId] = useState(existingId);
  const [currentSlug, setCurrentSlug] = useState(existingSlug);
  const [dataText, setDataText] = useState(
    JSON.stringify(initialDraft.data, null, 2),
  );
  const [dataError, setDataError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const deferredDraft = useDeferredValue(draft);
  const definition = exerciseDefinitionMap[draft.type];
  const isMatchingPairs = draft.type === "matching-pairs";
  const matchingPairsData = isMatchingPairs
    ? (draft.data as MatchingPairsData)
    : null;
  type ExportVariant = "scorm1" | "scorm2";

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

  const persistDraft = (
    endpoint: string,
    action: "save" | "export",
    variant: ExportVariant = "scorm1",
  ) => {
    const resolvedDraft = resolveCurrentDraft();
    if (!resolvedDraft) {
      return;
    }

    const payload = {
      id: currentId,
      draft: resolvedDraft,
      variant: action === "export" ? variant : undefined,
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
        anchor.download = `${safeFilename(resolvedDraft.title)}${
          variant === "scorm2" ? "-autonomous-scorm" : ""
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

        setNotice(
          variant === "scorm2"
            ? "Архив «Автономный SCORM» скачан."
            : "SCORM-архив скачан.",
        );
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

  const handleExport = (variant: ExportVariant) => {
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

  const draftActionsBlock = (
    <div className="editor-block">
      <div className="editor-block__head">
        <div>
          <strong>Действия с черновиком</strong>
        </div>
      </div>

      <div className="inline-actions">
        <button
          className="primary-button"
          disabled={isPending}
          type="button"
          onClick={() => handleExport("scorm1")}
        >
          Скачать SCORM
        </button>
        <button
          className="primary-button"
          disabled={isPending}
          type="button"
          onClick={() => handleExport("scorm2")}
        >
          Скачать Автономный SCORM
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
      <p className="editor-hint">
        "Автономный SCORM" создаёт полностью автономный пакет: локальный iframe,
        локальный player и скачанные внутрь архива медиафайлы.
      </p>

    </div>
  );

  const matchingPreviewDraft = isMatchingPairs
    ? ({
        ...deferredDraft,
        title: "Пары терминов",
        description: "Соедините элементы из левого и правого столбцов.",
        instructions:
          "Перетаскивайте карточки по полю. Когда правильные элементы окажутся рядом, они склеятся и будут двигаться уже вместе. Карточку можно таскать за любую ее неинтерактивную область, а разъединение находится между скрепленными элементами.",
        successMessage: "Все пары собраны верно.",
      } as AnyExerciseDraft)
    : deferredDraft;

  const previewBlock = (
    <div
      className={`editor-block ${isPreviewFullscreen ? "editor-block--preview-fullscreen" : ""}`}
      ref={previewHostRef}
    >
      <div className="editor-block__head">
        <div>
          <strong>Предварительный просмотр</strong>
        </div>
      </div>
      <ExercisePlayer
        boardOnly={isMatchingPairs && isPreviewFullscreen}
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
        draft={matchingPreviewDraft}
        fullscreen={isPreviewFullscreen}
        key={JSON.stringify(matchingPreviewDraft)}
      />
    </div>
  );

  return (
    <div className={`editor-shell ${isMatchingPairs ? "editor-shell--single" : ""}`}>
      <aside className="editor-sidebar">
        {!isMatchingPairs ? (
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

      {!isMatchingPairs ? (
        <section className="editor-preview">
          {previewBlock}
        </section>
      ) : null}
    </div>
  );
}
