"use client";
/* eslint-disable @next/next/no-img-element, react-hooks/set-state-in-effect, react-hooks/purity */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildCrossword,
  buildWordSearch,
  lineCells,
  parseClozeText,
  timestampToSeconds,
  type GridPoint,
} from "@/lib/exercise-runtime";
import {
  clamp,
  moveItem,
  normalizeText,
  percentage,
  shuffleArray,
} from "@/lib/utils";
import type {
  AnyExerciseDraft,
  ExerciseTypeId,
  MatchingMatrixData,
} from "@/lib/types";

type ReportResult = (score: number, solved: boolean, detail?: string) => void;

type ActivityProps<T extends ExerciseTypeId> = {
  draft: Extract<AnyExerciseDraft, { type: T }>;
  revisionKey: string;
  onReport: ReportResult;
};

function ActionRow({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="player-actions">{children}</div>;
}

function PlayerButton(
  props: Readonly<React.ButtonHTMLAttributes<HTMLButtonElement>>,
) {
  return <button className="player-button" type="button" {...props} />;
}

function cellsKey(cells: GridPoint[]) {
  return cells.map((cell) => `${cell.row}:${cell.column}`).join("|");
}

function scoreExactText(
  input: string,
  answers: string[],
  caseSensitive = false,
) {
  const normalizedInput = normalizeText(input, caseSensitive);
  return answers.some(
    (answer) => normalizeText(answer, caseSensitive) === normalizedInput,
  );
}

function reportMatrixScore(data: MatchingMatrixData, selected: Set<string>) {
  const target = new Set(
    data.correctCells.map((cell) => `${cell.row}:${cell.column}`),
  );
  let good = 0;
  let bad = 0;

  for (const cell of selected) {
    if (target.has(cell)) {
      good += 1;
    } else {
      bad += 1;
    }
  }

  const missed = Array.from(target).filter((cell) => !selected.has(cell)).length;
  return percentage(good, good + bad + missed);
}

const MATCHING_CARD_WIDTH = 248;
const MATCHING_CARD_HEIGHT = 78;
const MATCHING_CARD_GAP = 18;

interface MatchingDragCard {
  id: string;
  label: string;
  side: "left" | "right";
  pairIndex: number;
  groupId: string;
  x: number;
  y: number;
}

function createMatchingCards(
  pairs: Array<{ left: string; right: string }>,
): MatchingDragCard[] {
  const shuffledRight = shuffleArray(
    pairs.map((pair, index) => ({
      pairIndex: index,
      label: pair.right,
    })),
  );

  return [
    ...pairs.map((pair, index) => ({
      id: `left-${index}`,
      label: pair.left,
      side: "left" as const,
      pairIndex: index,
      groupId: `group-left-${index}`,
      x: 24,
      y: 24 + index * 96,
    })),
    ...shuffledRight.map((pair, index) => ({
      id: `right-${pair.pairIndex}`,
      label: pair.label,
      side: "right" as const,
      pairIndex: pair.pairIndex,
      groupId: `group-right-${pair.pairIndex}`,
      x: 392,
      y: 24 + index * 96,
    })),
  ];
}

function MatchingPairsActivity({
  draft,
  onReport,
}: ActivityProps<"matching-pairs">) {
  const [cards, setCards] = useState(() => createMatchingCards(draft.data.pairs));
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    groupId: string;
    positions: Record<string, { x: number; y: number }>;
    startX: number;
    startY: number;
  } | null>(null);

  useEffect(() => {
    setCards(createMatchingCards(draft.data.pairs));
    setDraggingGroupId(null);
    dragRef.current = null;
  }, [draft.data.pairs]);

  const snapIfMatched = (nextCards: MatchingDragCard[], movedGroupId: string) => {
    const movedCards = nextCards.filter((card) => card.groupId === movedGroupId);
    const candidates = nextCards.filter((card) => card.groupId !== movedGroupId);
    const match = movedCards
      .flatMap((movedCard) =>
        candidates
          .map((candidate) => {
            const movedGroup = nextCards.filter(
              (card) => card.groupId === movedCard.groupId,
            );
            const candidateGroup = nextCards.filter(
              (card) => card.groupId === candidate.groupId,
            );
            const combined = [...movedGroup, ...candidateGroup];
            const leftCount = combined.filter((card) => card.side === "left").length;
            const rightCount = combined.filter((card) => card.side === "right").length;
            const movedCenterX = movedCard.x + MATCHING_CARD_WIDTH / 2;
            const movedCenterY = movedCard.y + MATCHING_CARD_HEIGHT / 2;
            const candidateCenterX = candidate.x + MATCHING_CARD_WIDTH / 2;
            const candidateCenterY = candidate.y + MATCHING_CARD_HEIGHT / 2;
            const distance = Math.hypot(
              movedCenterX - candidateCenterX,
              movedCenterY - candidateCenterY,
            );

            return {
              movedCard,
              candidate,
              distance,
              canMerge:
                candidate.side !== movedCard.side &&
                leftCount <= 1 &&
                rightCount <= 1,
            };
          }),
      )
      .filter((entry) => entry.canMerge && entry.distance < 170)
      .sort((left, right) => left.distance - right.distance)[0];

    if (!match) {
      return nextCards;
    }

    const leftCard =
      match.movedCard.side === "left" ? match.movedCard : match.candidate;
    const rightCard =
      match.movedCard.side === "right" ? match.movedCard : match.candidate;
    const groupId = `paired-${leftCard.id}-${rightCard.id}`;
    const leftX =
      leftCard.groupId === movedGroupId
        ? leftCard.x
        : rightCard.x - MATCHING_CARD_WIDTH - MATCHING_CARD_GAP;
    const topY = leftCard.groupId === movedGroupId ? leftCard.y : rightCard.y;

    return nextCards.map((card) => {
      if (card.id === leftCard.id) {
        return {
          ...card,
          groupId,
          x: leftX,
          y: topY,
        };
      }

      if (card.id === rightCard.id) {
        return {
          ...card,
          groupId,
          x: leftX + MATCHING_CARD_WIDTH + MATCHING_CARD_GAP,
          y: topY,
        };
      }

      return card;
    });
  };

  const ungroupCards = (groupId: string) => {
    setCards((current) =>
      current.map((card) =>
        card.groupId === groupId
          ? {
              ...card,
              groupId: `${card.side}-${card.pairIndex}-${card.id}`,
            }
          : card,
      ),
    );
  };

  const handleCheck = () => {
    const correct = draft.data.pairs.filter(
      (_, index) => {
        const leftCard = cards.find((card) => card.id === `left-${index}`);
        const rightCard = cards.find((card) => card.id === `right-${index}`);
        return leftCard?.groupId === rightCard?.groupId;
      },
    ).length;
    const score = percentage(correct, draft.data.pairs.length);
    onReport(score, correct === draft.data.pairs.length);
  };

  return (
    <div className="stack">
      <p className="editor-hint">
        Перетаскивайте карточки по полю. Когда правильные элементы окажутся рядом,
        они склеятся и будут двигаться уже вместе. Склеивать можно любые карточки
        разных колонок, а двойной клик разъединяет пару.
      </p>
      <div
        className="matching-drag-board"
        style={{
          minHeight: `${Math.max(draft.data.pairs.length * 96 + 60, 280)}px`,
        }}
      >
        {cards.map((card) => (
          <button
            className={`matching-drag-card ${
              card.side === "right" ? "matching-drag-card--right" : ""
            } ${draggingGroupId === card.groupId ? "matching-drag-card--dragging" : ""} ${
              card.groupId.startsWith("paired-")
                ? "matching-drag-card--paired"
                : ""
            }`}
            key={card.id}
            style={{
              left: `${card.x}px`,
              top: `${card.y}px`,
              width: `${MATCHING_CARD_WIDTH}px`,
              height: `${MATCHING_CARD_HEIGHT}px`,
            }}
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              const groupCards = cards.filter(
                (groupCard) => groupCard.groupId === card.groupId,
              );
              dragRef.current = {
                pointerId: event.pointerId,
                groupId: card.groupId,
                positions: Object.fromEntries(
                  groupCards.map((groupCard) => [
                    groupCard.id,
                    { x: groupCard.x, y: groupCard.y },
                  ]),
                ),
                startX: event.clientX,
                startY: event.clientY,
              };
              setDraggingGroupId(card.groupId);
            }}
            onPointerMove={(event) => {
              const currentDrag = dragRef.current;
              if (
                !currentDrag ||
                currentDrag.pointerId !== event.pointerId ||
                currentDrag.groupId !== card.groupId
              ) {
                return;
              }

              const deltaX = event.clientX - currentDrag.startX;
              const deltaY = event.clientY - currentDrag.startY;

              setCards((current) =>
                current.map((currentCard) => {
                  const initialPosition = currentDrag.positions[currentCard.id];
                  if (!initialPosition) {
                    return currentCard;
                  }

                  return {
                    ...currentCard,
                    x: Math.max(12, initialPosition.x + deltaX),
                    y: Math.max(12, initialPosition.y + deltaY),
                  };
                }),
              );
            }}
            onPointerUp={(event) => {
              const currentDrag = dragRef.current;
              if (
                !currentDrag ||
                currentDrag.pointerId !== event.pointerId ||
                currentDrag.groupId !== card.groupId
              ) {
                return;
              }

              event.currentTarget.releasePointerCapture(event.pointerId);
              setCards((current) =>
                snapIfMatched(current, currentDrag.groupId),
              );
              dragRef.current = null;
              setDraggingGroupId(null);
            }}
            onPointerCancel={() => {
              dragRef.current = null;
              setDraggingGroupId(null);
            }}
            onDoubleClick={() => {
              if (card.groupId.startsWith("paired-")) {
                ungroupCards(card.groupId);
              }
            }}
          >
            <span className="matching-drag-card__side">
              {card.side === "left" ? "A" : "B"}
            </span>
            <span>{card.label}</span>
          </button>
        ))}
      </div>
      <ActionRow>
        <PlayerButton onClick={handleCheck}>Проверить</PlayerButton>
        <button
          className="ghost-button"
          type="button"
          onClick={() => {
            setCards(createMatchingCards(draft.data.pairs));
            setDraggingGroupId(null);
            dragRef.current = null;
          }}
        >
          Сбросить карточки
        </button>
      </ActionRow>
    </div>
  );
}

function GroupAssignmentActivity({
  draft,
  revisionKey,
  onReport,
}: ActivityProps<"group-assignment">) {
  const [answers, setAnswers] = useState<number[]>([]);

  useEffect(() => {
    setAnswers(Array.from({ length: draft.data.items.length }, () => -1));
  }, [revisionKey, draft.data.items.length]);

  const handleCheck = () => {
    const correct = draft.data.items.filter(
      (item, index) => answers[index] === item.groupIndex,
    ).length;
    const score = percentage(correct, draft.data.items.length);
    onReport(score, correct === draft.data.items.length);
  };

  return (
    <div className="activity-grid">
      {draft.data.items.map((item, index) => (
        <div className="prompt-card" key={`${item.label}-${index}`}>
          <strong>{item.label}</strong>
          <select
            className="editor-select"
            value={answers[index] ?? -1}
            onChange={(event) => {
              const next = [...answers];
              next[index] = Number.parseInt(event.target.value, 10);
              setAnswers(next);
            }}
          >
            <option value={-1}>Выберите группу</option>
            {draft.data.groups.map((group, groupIndex) => (
              <option key={`${group.name}-${groupIndex}`} value={groupIndex}>
                {group.name}
              </option>
            ))}
          </select>
        </div>
      ))}
      <ActionRow>
        <PlayerButton onClick={handleCheck}>Проверить</PlayerButton>
      </ActionRow>
    </div>
  );
}

function TimelineActivity({
  draft,
  revisionKey,
  onReport,
}: ActivityProps<"timeline">) {
  const [order, setOrder] = useState(draft.data.events);

  useEffect(() => {
    setOrder(shuffleArray(draft.data.events));
  }, [revisionKey, draft.data.events]);

  const correctOrder = [...draft.data.events].sort((left, right) =>
    left.date.localeCompare(right.date),
  );

  const handleCheck = () => {
    const correct = order.filter(
      (event, index) => event.label === correctOrder[index]?.label,
    ).length;
    const score = percentage(correct, order.length);
    onReport(score, correct === order.length);
  };

  return (
    <div className="stack">
      {order.map((event, index) => (
        <div className="sortable-row" key={`${event.label}-${event.date}`}>
          <div>
            <strong>{event.label}</strong>
            <p>{event.date}</p>
          </div>
          <div className="move-controls">
            <PlayerButton
              disabled={index === 0}
              onClick={() => setOrder(moveItem(order, index, index - 1))}
            >
              Вверх
            </PlayerButton>
            <PlayerButton
              disabled={index === order.length - 1}
              onClick={() => setOrder(moveItem(order, index, index + 1))}
            >
              Вниз
            </PlayerButton>
          </div>
        </div>
      ))}
      <ActionRow>
        <PlayerButton onClick={handleCheck}>Проверить</PlayerButton>
      </ActionRow>
    </div>
  );
}

function SimpleOrderActivity({
  draft,
  revisionKey,
  onReport,
}: ActivityProps<"simple-order">) {
  const [items, setItems] = useState(draft.data.items);

  useEffect(() => {
    setItems(shuffleArray(draft.data.items));
  }, [revisionKey, draft.data.items]);

  const handleCheck = () => {
    const correct = items.filter(
      (item, index) => item === draft.data.items[index],
    ).length;
    const score = percentage(correct, items.length);
    onReport(score, correct === items.length);
  };

  return (
    <div className="stack">
      {items.map((item, index) => (
        <div className="sortable-row" key={`${item}-${index}`}>
          <strong>{item}</strong>
          <div className="move-controls">
            <PlayerButton
              disabled={index === 0}
              onClick={() => setItems(moveItem(items, index, index - 1))}
            >
              Вверх
            </PlayerButton>
            <PlayerButton
              disabled={index === items.length - 1}
              onClick={() => setItems(moveItem(items, index, index + 1))}
            >
              Вниз
            </PlayerButton>
          </div>
        </div>
      ))}
      <ActionRow>
        <PlayerButton onClick={handleCheck}>Проверить</PlayerButton>
      </ActionRow>
    </div>
  );
}

function FreeTextInputActivity({
  draft,
  onReport,
}: ActivityProps<"free-text-input">) {
  const [value, setValue] = useState("");

  const handleCheck = () => {
    const solved = scoreExactText(
      value,
      draft.data.answers,
      draft.data.caseSensitive,
    );
    onReport(solved ? 100 : 0, solved);
  };

  return (
    <div className="stack">
      <div className="prompt-card">
        <strong>{draft.data.prompt}</strong>
        <input
          className="editor-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Введите ответ"
        />
      </div>
      <ActionRow>
        <PlayerButton onClick={handleCheck}>Проверить</PlayerButton>
      </ActionRow>
    </div>
  );
}

function MatchingImagesActivity({
  draft,
  onReport,
}: ActivityProps<"matching-images">) {
  const [answers, setAnswers] = useState<string[]>([]);
  const options = useMemo(
    () => shuffleArray(draft.data.pairs.map((pair) => pair.answer)),
    [draft.data.pairs],
  );

  useEffect(() => {
    setAnswers(Array.from({ length: draft.data.pairs.length }, () => ""));
  }, [draft.data.pairs.length]);

  const handleCheck = () => {
    const correct = draft.data.pairs.filter(
      (pair, index) => answers[index] === pair.answer,
    ).length;
    const score = percentage(correct, draft.data.pairs.length);
    onReport(score, correct === draft.data.pairs.length);
  };

  return (
    <div className="activity-grid">
      {draft.data.pairs.map((pair, index) => (
        <div className="image-match-card" key={`${pair.answer}-${index}`}>
          <img alt={pair.answer} src={pair.imageUrl} />
          <select
            className="editor-select"
            value={answers[index] ?? ""}
            onChange={(event) => {
              const next = [...answers];
              next[index] = event.target.value;
              setAnswers(next);
            }}
          >
            <option value="">Выберите подпись</option>
            {options.map((option, optionIndex) => (
              <option key={`${option}-${optionIndex}`} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      ))}
      <ActionRow>
        <PlayerButton onClick={handleCheck}>Проверить</PlayerButton>
      </ActionRow>
    </div>
  );
}

function MultipleChoiceActivity({
  draft,
  revisionKey,
  onReport,
}: ActivityProps<"multiple-choice">) {
  const [answers, setAnswers] = useState<number[]>([]);

  useEffect(() => {
    setAnswers(Array.from({ length: draft.data.questions.length }, () => -1));
  }, [revisionKey, draft.data.questions.length]);

  const handleCheck = () => {
    const correct = draft.data.questions.filter(
      (question, index) => answers[index] === question.correctIndex,
    ).length;
    const score = percentage(correct, draft.data.questions.length);
    onReport(score, correct === draft.data.questions.length);
  };

  return (
    <div className="stack">
      {draft.data.questions.map((question, questionIndex) => (
        <fieldset className="question-card" key={`${question.prompt}-${questionIndex}`}>
          <legend>{question.prompt}</legend>
          {question.options.map((option, optionIndex) => (
            <label className="choice-option" key={`${option}-${optionIndex}`}>
              <input
                checked={answers[questionIndex] === optionIndex}
                name={`question-${questionIndex}`}
                type="radio"
                onChange={() => {
                  const next = [...answers];
                  next[questionIndex] = optionIndex;
                  setAnswers(next);
                }}
              />
              <span>{option}</span>
            </label>
          ))}
        </fieldset>
      ))}
      <ActionRow>
        <PlayerButton onClick={handleCheck}>Проверить</PlayerButton>
      </ActionRow>
    </div>
  );
}

function ClozeTextActivity({
  draft,
  revisionKey,
  onReport,
}: ActivityProps<"cloze-text">) {
  const tokens = useMemo(() => parseClozeText(draft.data.text), [draft.data.text]);
  const blanks = tokens.filter((token) => token.type === "blank");
  const [answers, setAnswers] = useState<string[]>([]);

  useEffect(() => {
    setAnswers(Array.from({ length: blanks.length }, () => ""));
  }, [revisionKey, blanks.length]);

  const handleCheck = () => {
    const correct = blanks.filter((blank) =>
      scoreExactText(answers[blank.index ?? 0] ?? "", [blank.value]),
    ).length;
    const score = percentage(correct, blanks.length);
    onReport(score, correct === blanks.length);
  };

  return (
    <div className="stack">
      <div className="cloze-card">
        {tokens.map((token, index) =>
          token.type === "text" ? (
            <span key={`text-${index}`}>{token.value}</span>
          ) : (
            <input
              key={`blank-${token.index}`}
              className="cloze-input"
              placeholder={`Ответ ${index + 1}`}
              value={answers[token.index ?? 0] ?? ""}
              onChange={(event) => {
                const next = [...answers];
                next[token.index ?? 0] = event.target.value;
                setAnswers(next);
              }}
            />
          ),
        )}
      </div>
      <ActionRow>
        <PlayerButton onClick={handleCheck}>Проверить</PlayerButton>
      </ActionRow>
    </div>
  );
}

function MediaNoticesActivity({
  draft,
  revisionKey,
  onReport,
}: ActivityProps<"media-notices">) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);

  useEffect(() => {
    setAnswers(Array.from({ length: draft.data.notices.length }, () => ""));
  }, [revisionKey, draft.data.notices.length]);

  const handleCheck = () => {
    const correct = draft.data.notices.filter((notice, index) =>
      scoreExactText(answers[index] ?? "", [notice.answer]),
    ).length;
    const score = percentage(correct, draft.data.notices.length);
    onReport(score, correct === draft.data.notices.length);
  };

  const jumpToTime = (timestamp: string) => {
    if (mediaRef.current) {
      mediaRef.current.currentTime = timestampToSeconds(timestamp);
      mediaRef.current.play().catch(() => undefined);
    }
  };

  return (
    <div className="stack">
      <div className="media-card">
        {draft.data.mediaKind === "video" ? (
          <video
            controls
            ref={(node) => {
              mediaRef.current = node;
            }}
            src={draft.data.mediaUrl}
          />
        ) : (
          <audio
            controls
            ref={(node) => {
              mediaRef.current = node;
            }}
            src={draft.data.mediaUrl}
          />
        )}
      </div>
      {draft.data.notices.map((notice, index) => (
        <div className="question-card" key={`${notice.timestamp}-${index}`}>
          <div className="notice-head">
            <strong>{notice.title}</strong>
            <PlayerButton onClick={() => jumpToTime(notice.timestamp)}>
              {notice.timestamp}
            </PlayerButton>
          </div>
          <p>{notice.question}</p>
          <input
            className="editor-input"
            value={answers[index] ?? ""}
            onChange={(event) => {
              const next = [...answers];
              next[index] = event.target.value;
              setAnswers(next);
            }}
            placeholder="Ваш ответ"
          />
        </div>
      ))}
      <ActionRow>
        <PlayerButton onClick={handleCheck}>Проверить</PlayerButton>
      </ActionRow>
    </div>
  );
}

function MillionaireGameActivity({
  draft,
  revisionKey,
  onReport,
}: ActivityProps<"millionaire-game">) {
  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    setStep(0);
    setFinished(false);
    setNote("");
  }, [revisionKey]);

  const currentQuestion = draft.data.questions[step];

  const handleAnswer = (index: number) => {
    if (finished) {
      return;
    }

    if (index === currentQuestion.correctIndex) {
      if (step === draft.data.questions.length - 1) {
        setFinished(true);
        setNote("Все уровни пройдены.");
        onReport(100, true);
        return;
      }

      setStep(step + 1);
      setNote("Верно. Переходим дальше.");
      return;
    }

    const score = percentage(step, draft.data.questions.length);
    setFinished(true);
    setNote("Неверный ответ. Игра завершена.");
    onReport(score, false, "Неверный ответ.");
  };

  return (
    <div className="stack">
      <div className="millionaire-layout">
        <ol className="ladder">
          {draft.data.questions
            .map((_, index) => index + 1)
            .reverse()
            .map((level) => {
              const active = level - 1 === step && !finished;
              const cleared = level - 1 < step;
              return (
                <li
                  className={`ladder-item ${active ? "active" : ""} ${
                    cleared ? "cleared" : ""
                  }`}
                  key={level}
                >
                  {level} уровень
                </li>
              );
            })}
        </ol>
        <div className="question-card">
          <h3>{currentQuestion.prompt}</h3>
          <div className="choice-grid">
            {currentQuestion.options.map((option, index) => (
              <PlayerButton
                key={`${option}-${index}`}
                onClick={() => handleAnswer(index)}
              >
                {option}
              </PlayerButton>
            ))}
          </div>
          {note ? <p>{note}</p> : null}
        </div>
      </div>
    </div>
  );
}

function GroupPuzzleActivity({
  draft,
  revisionKey,
  onReport,
}: ActivityProps<"group-puzzle">) {
  const [answers, setAnswers] = useState<number[]>([]);

  useEffect(() => {
    setAnswers(Array.from({ length: draft.data.items.length }, () => -1));
  }, [revisionKey, draft.data.items.length]);

  const correctCount = draft.data.items.filter(
    (item, index) => answers[index] === item.groupIndex,
  ).length;
  const progress = percentage(correctCount, draft.data.items.length);

  const handleCheck = () => {
    onReport(progress, correctCount === draft.data.items.length);
  };

  return (
    <div className="stack">
      <div className="puzzle-preview">
        <img alt={draft.title} src={draft.data.imageUrl} />
        <div
          className="puzzle-mask"
          style={{ opacity: `${1 - progress / 100}` }}
        />
        <div className="puzzle-caption">
          {progress === 100 ? draft.data.revealText : `Открыто: ${progress}%`}
        </div>
      </div>
      <div className="activity-grid">
        {draft.data.items.map((item, index) => (
          <div className="prompt-card" key={`${item.label}-${index}`}>
            <strong>{item.label}</strong>
            <select
              className="editor-select"
              value={answers[index] ?? -1}
              onChange={(event) => {
                const next = [...answers];
                next[index] = Number.parseInt(event.target.value, 10);
                setAnswers(next);
              }}
            >
              <option value={-1}>Выберите группу</option>
              {draft.data.groups.map((group, groupIndex) => (
                <option key={`${group.name}-${groupIndex}`} value={groupIndex}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <ActionRow>
        <PlayerButton onClick={handleCheck}>Проверить</PlayerButton>
      </ActionRow>
    </div>
  );
}

function CrosswordActivity({
  draft,
  revisionKey,
  onReport,
}: ActivityProps<"crossword">) {
  const layout = useMemo(
    () => buildCrossword(draft.data.entries),
    [draft.data.entries],
  );
  const [values, setValues] = useState<string[][]>([]);

  useEffect(() => {
    setValues(layout.grid.map((row) => row.map(() => "")));
  }, [revisionKey, layout.grid]);

  const totalFilled = layout.grid.flat().filter(Boolean).length;

  const handleCheck = () => {
    let correct = 0;

    layout.grid.forEach((row, rowIndex) => {
      row.forEach((cell, columnIndex) => {
        if (
          cell &&
          normalizeText(values[rowIndex]?.[columnIndex] ?? "", true)
            .toLocaleUpperCase("ru-RU") === cell
        ) {
          correct += 1;
        }
      });
    });

    const score = percentage(correct, totalFilled);
    onReport(score, correct === totalFilled);
  };

  return (
    <div className="stack">
      <div className="crossword-grid">
        {layout.grid.map((row, rowIndex) =>
          row.map((cell, columnIndex) => {
            if (!cell) {
              return (
                <div
                  className="crossword-cell crossword-cell--empty"
                  key={`${rowIndex}-${columnIndex}`}
                />
              );
            }

            const clueNumber = layout.placements.find(
              (placement) =>
                placement.row === rowIndex && placement.column === columnIndex,
            )?.number;

            return (
              <label
                className="crossword-cell"
                key={`${rowIndex}-${columnIndex}`}
              >
                {clueNumber ? <span>{clueNumber}</span> : null}
                <input
                  maxLength={1}
                  value={values[rowIndex]?.[columnIndex] ?? ""}
                  onChange={(event) => {
                    const next = values.map((line) => [...line]);
                    next[rowIndex][columnIndex] = event.target.value
                      .slice(-1)
                      .toLocaleUpperCase("ru-RU");
                    setValues(next);
                  }}
                />
              </label>
            );
          }),
        )}
      </div>
      <div className="clue-list">
        {layout.placements.map((placement) => (
          <div
            className="prompt-card"
            key={`${placement.number}-${placement.answer}`}
          >
            <strong>
              {placement.number}.{" "}
              {placement.direction === "across"
                ? "По горизонтали"
                : "По вертикали"}
            </strong>
            <p>{placement.clue}</p>
          </div>
        ))}
      </div>
      <ActionRow>
        <PlayerButton onClick={handleCheck}>Проверить</PlayerButton>
      </ActionRow>
    </div>
  );
}

function WordGridActivity({
  draft,
  revisionKey,
  onReport,
}: ActivityProps<"word-grid">) {
  const layout = useMemo(
    () => buildWordSearch(draft.data.words, draft.data.gridSize),
    [draft.data.gridSize, draft.data.words],
  );
  const [start, setStart] = useState<GridPoint | null>(null);
  const [found, setFound] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("Выберите первую букву слова.");

  useEffect(() => {
    setStart(null);
    setFound(new Set());
    setNote("Выберите первую букву слова.");
  }, [revisionKey]);

  const placementMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const placement of layout.placements) {
      map.set(cellsKey(placement.cells), placement.word);
      map.set(cellsKey([...placement.cells].reverse()), placement.word);
    }
    return map;
  }, [layout.placements]);

  const handleCellClick = (row: number, column: number) => {
    if (!start) {
      setStart({ row, column });
      setNote("Теперь выберите последнюю букву слова.");
      return;
    }

    const cells = lineCells(start, { row, column });
    setStart(null);

    if (!cells) {
      setNote(
        "Выбранная линия не подходит. Нужна прямая или диагональная линия.",
      );
      return;
    }

    const key = cellsKey(cells);
    const word = placementMap.get(key);

    if (!word) {
      setNote("Такого слова в сетке нет. Попробуйте снова.");
      return;
    }

    const next = new Set(found);
    next.add(word);
    setFound(next);
    const score = percentage(next.size, layout.placements.length);
    const solved = next.size === layout.placements.length;
    setNote(solved ? "Все слова найдены." : `Найдено слов: ${next.size}`);
    onReport(score, solved);
  };

  return (
    <div className="stack">
      <div className="word-grid-board">
        {layout.grid.map((row, rowIndex) =>
          row.map((cell, columnIndex) => (
            <button
              className="word-grid-cell"
              key={`${rowIndex}-${columnIndex}`}
              type="button"
              onClick={() => handleCellClick(rowIndex, columnIndex)}
            >
              {cell}
            </button>
          )),
        )}
      </div>
      <p>{note}</p>
      <div className="tag-list">
        {layout.placements.map((placement) => (
          <span
            className={`tag ${found.has(placement.word) ? "tag--active" : ""}`}
            key={placement.word}
          >
            {placement.word}
          </span>
        ))}
      </div>
    </div>
  );
}

function WhereIsWhatActivity({
  draft,
  revisionKey,
  onReport,
}: ActivityProps<"where-is-what">) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [solved, setSolved] = useState<Set<number>>(new Set());
  const [note, setNote] = useState(
    "Выберите метку и кликните по изображению.",
  );

  useEffect(() => {
    setActiveIndex(0);
    setSolved(new Set());
    setNote("Выберите метку и кликните по изображению.");
  }, [revisionKey]);

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    const hotspot = draft.data.hotspots[activeIndex];
    const distance = Math.hypot(x - hotspot.x, y - hotspot.y);

    if (distance <= 12) {
      const next = new Set(solved);
      next.add(activeIndex);
      setSolved(next);
      const remaining = draft.data.hotspots.findIndex(
        (_, index) => !next.has(index),
      );
      if (remaining >= 0) {
        setActiveIndex(remaining);
      }
      const score = percentage(next.size, draft.data.hotspots.length);
      const done = next.size === draft.data.hotspots.length;
      setNote(done ? "Все точки отмечены верно." : "Верная точка. Продолжайте.");
      onReport(score, done);
    } else {
      setNote("Пока не попали в нужную точку. Попробуйте еще раз.");
    }
  };

  return (
    <div className="stack">
      <div className="tag-list">
        {draft.data.hotspots.map((hotspot, index) => (
          <button
            className={`tag ${activeIndex === index ? "tag--active" : ""} ${
              solved.has(index) ? "tag--done" : ""
            }`}
            key={`${hotspot.label}-${index}`}
            type="button"
            onClick={() => setActiveIndex(index)}
          >
            {hotspot.label}
          </button>
        ))}
      </div>
      <button className="hotspot-board" type="button" onClick={handleClick}>
        <img alt={draft.title} src={draft.data.imageUrl} />
        {Array.from(solved).map((index) => {
          const hotspot = draft.data.hotspots[index];
          return (
            <span
              className="hotspot-marker"
              key={`${hotspot.label}-${index}`}
              style={{ left: `${hotspot.x}%`, top: `${hotspot.y}%` }}
            />
          );
        })}
      </button>
      <p>{note}</p>
    </div>
  );
}

function GuessTheWordActivity({
  draft,
  onReport,
}: ActivityProps<"guess-the-word">) {
  const [value, setValue] = useState("");

  const handleCheck = () => {
    const solved = scoreExactText(value, [draft.data.word], false);
    onReport(solved ? 100 : 0, solved);
  };

  return (
    <div className="stack">
      <div className="prompt-card">
        <strong>Подсказка</strong>
        <p>{draft.data.clue}</p>
        <p className="ghost-word">
          {draft.data.word.split("").map(() => "_").join(" ")}
        </p>
        <input
          className="editor-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Введите слово"
        />
      </div>
      <ActionRow>
        <PlayerButton onClick={handleCheck}>Проверить</PlayerButton>
      </ActionRow>
    </div>
  );
}

function HorseRaceActivity({
  draft,
  revisionKey,
  onReport,
}: ActivityProps<"horse-race">) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [positions, setPositions] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    setQuestionIndex(0);
    setFinished(false);
    setNote("");
    setPositions(Array.from({ length: draft.data.opponents + 1 }, () => 0));
  }, [revisionKey, draft.data.opponents]);

  const handleAnswer = (index: number) => {
    if (finished) {
      return;
    }

    const question = draft.data.questions[questionIndex];
    const next = [...positions];
    next[0] += index === question.correctIndex ? 2 : 0;

    for (let horse = 1; horse < next.length; horse += 1) {
      next[horse] += 1 + Math.floor(Math.random() * 2);
    }

    setPositions(next);

    const someoneFinished = next.some(
      (position) => position >= draft.data.trackLength,
    );
    const playerBest = next[0] >= Math.max(...next);
    const nextQuestionIndex = questionIndex + 1;

    if (someoneFinished || nextQuestionIndex >= draft.data.questions.length) {
      setFinished(true);
      const score = percentage(next[0], draft.data.trackLength);
      onReport(score, playerBest);
      setNote(playerBest ? "Ваш конь пришел первым." : "Соперники были быстрее.");
      return;
    }

    setQuestionIndex(nextQuestionIndex);
    setNote(
      index === question.correctIndex
        ? "Верно, ваш конь ускорился."
        : "Ответ мимо. Соперники ушли вперед.",
    );
  };

  const currentQuestion =
    draft.data.questions[
      Math.min(questionIndex, draft.data.questions.length - 1)
    ];

  return (
    <div className="stack">
      <div className="race-track">
        {positions.map((position, index) => (
          <div className="race-lane" key={`horse-${index}`}>
            <strong>{index === 0 ? "Вы" : `Соперник ${index}`}</strong>
            <div className="race-line">
              <span
                className="race-horse"
                style={{
                  left: `${
                    (Math.min(position, draft.data.trackLength) /
                      draft.data.trackLength) *
                    100
                  }%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="question-card">
        <h3>{currentQuestion.prompt}</h3>
        <div className="choice-grid">
          {currentQuestion.options.map((option, index) => (
            <PlayerButton
              key={`${option}-${index}`}
              onClick={() => handleAnswer(index)}
            >
              {option}
            </PlayerButton>
          ))}
        </div>
        {note ? <p>{note}</p> : null}
      </div>
    </div>
  );
}

function PairingGameActivity({
  draft,
  revisionKey,
  onReport,
}: ActivityProps<"pairing-game">) {
  const [deck, setDeck] = useState<
    Array<{ id: string; value: string; pairKey: string }>
  >([]);
  const [open, setOpen] = useState<number[]>([]);
  const [matched, setMatched] = useState<Set<string>>(new Set());

  useEffect(() => {
    const nextDeck = shuffleArray(
      draft.data.pairs.flatMap((pair, index) => [
        {
          id: `${index}-front`,
          value: pair.front,
          pairKey: `${index}`,
        },
        {
          id: `${index}-back`,
          value: pair.back,
          pairKey: `${index}`,
        },
      ]),
    );
    setDeck(nextDeck);
    setOpen([]);
    setMatched(new Set());
  }, [revisionKey, draft.data.pairs]);

  useEffect(() => {
    if (open.length !== 2) {
      return;
    }

    const [firstIndex, secondIndex] = open;
    if (deck[firstIndex]?.pairKey === deck[secondIndex]?.pairKey) {
      const next = new Set(matched);
      next.add(deck[firstIndex].pairKey);
      setMatched(next);
      setOpen([]);
      const score = percentage(next.size, draft.data.pairs.length);
      onReport(score, next.size === draft.data.pairs.length);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setOpen([]);
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [deck, draft.data.pairs.length, matched, onReport, open]);

  return (
    <div className="memory-grid">
      {deck.map((card, index) => {
        const isOpen = open.includes(index) || matched.has(card.pairKey);
        return (
          <button
            className={`memory-card ${isOpen ? "memory-card--open" : ""}`}
            disabled={isOpen || open.length === 2}
            key={card.id}
            type="button"
            onClick={() => setOpen([...open, index])}
          >
            <span>{isOpen ? card.value : "?"}</span>
          </button>
        );
      })}
    </div>
  );
}

function GuessActivity({
  draft,
  onReport,
}: ActivityProps<"guess">) {
  const [value, setValue] = useState("");

  const handleCheck = () => {
    const numeric = Number.parseFloat(value);
    if (Number.isNaN(numeric)) {
      onReport(0, false, "Введите число.");
      return;
    }

    const difference = Math.abs(numeric - draft.data.answer);
    const solved = difference <= draft.data.tolerance;
    const base = Math.max(Math.abs(draft.data.answer), 1);
    const score = solved
      ? 100
      : clamp(100 - Math.round((difference / base) * 100), 0, 99);
    onReport(score, solved);
  };

  return (
    <div className="stack">
      <div className="prompt-card">
        <strong>{draft.data.prompt}</strong>
        <input
          className="editor-input"
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={`Введите число ${draft.data.unit}`.trim()}
        />
        <div className="tag-list">
          {draft.data.hints.map((hint, index) => (
            <span className="tag" key={`${hint}-${index}`}>
              {hint}
            </span>
          ))}
        </div>
      </div>
      <ActionRow>
        <PlayerButton onClick={handleCheck}>Проверить</PlayerButton>
      </ActionRow>
    </div>
  );
}

function MatchingMatrixActivity({
  draft,
  revisionKey,
  onReport,
}: ActivityProps<"matching-matrix">) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelected(new Set());
  }, [revisionKey]);

  const toggle = (row: number, column: number) => {
    const key = `${row}:${column}`;
    const next = new Set(selected);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setSelected(next);
  };

  const handleCheck = () => {
    const score = reportMatrixScore(draft.data, selected);
    const solved = score === 100;
    onReport(score, solved);
  };

  return (
    <div className="stack">
      <div className="matrix-table">
        <div className="matrix-row matrix-row--head">
          <span />
          {draft.data.columns.map((column) => (
            <strong key={column}>{column}</strong>
          ))}
        </div>
        {draft.data.rows.map((row, rowIndex) => (
          <div className="matrix-row" key={`${row}-${rowIndex}`}>
            <strong>{row}</strong>
            {draft.data.columns.map((column, columnIndex) => {
              const key = `${rowIndex}:${columnIndex}`;
              return (
                <label className="matrix-cell" key={`${column}-${columnIndex}`}>
                  <input
                    checked={selected.has(key)}
                    type="checkbox"
                    onChange={() => toggle(rowIndex, columnIndex)}
                  />
                </label>
              );
            })}
          </div>
        ))}
      </div>
      <ActionRow>
        <PlayerButton onClick={handleCheck}>Проверить</PlayerButton>
      </ActionRow>
    </div>
  );
}

function FillTableActivity({
  draft,
  revisionKey,
  onReport,
}: ActivityProps<"fill-table">) {
  const [answers, setAnswers] = useState<string[][]>([]);

  useEffect(() => {
    setAnswers(
      draft.data.rows.map((row) =>
        row.cells.map((cell, columnIndex) =>
          row.blanks.includes(columnIndex) ? "" : cell,
        ),
      ),
    );
  }, [revisionKey, draft.data.rows]);

  const blankCount = draft.data.rows.reduce(
    (total, row) => total + row.blanks.length,
    0,
  );

  const handleCheck = () => {
    let correct = 0;

    draft.data.rows.forEach((row, rowIndex) => {
      row.blanks.forEach((columnIndex) => {
        if (
          scoreExactText(answers[rowIndex]?.[columnIndex] ?? "", [
            row.cells[columnIndex],
          ])
        ) {
          correct += 1;
        }
      });
    });

    const score = percentage(correct, blankCount);
    onReport(score, correct === blankCount);
  };

  return (
    <div className="stack">
      <div className="fill-table">
        <div className="fill-row fill-row--head">
          <strong>Строка</strong>
          {draft.data.columns.map((column) => (
            <strong key={column}>{column}</strong>
          ))}
        </div>
        {draft.data.rows.map((row, rowIndex) => (
          <div className="fill-row" key={`${row.label}-${rowIndex}`}>
            <strong>{row.label}</strong>
            {row.cells.map((cell, columnIndex) =>
              row.blanks.includes(columnIndex) ? (
                <input
                  className="editor-input"
                  key={`${rowIndex}-${columnIndex}`}
                  value={answers[rowIndex]?.[columnIndex] ?? ""}
                  onChange={(event) => {
                    const next = answers.map((line) => [...line]);
                    next[rowIndex][columnIndex] = event.target.value;
                    setAnswers(next);
                  }}
                />
              ) : (
                <span className="fill-value" key={`${rowIndex}-${columnIndex}`}>
                  {cell}
                </span>
              ),
            )}
          </div>
        ))}
      </div>
      <ActionRow>
        <PlayerButton onClick={handleCheck}>Проверить</PlayerButton>
      </ActionRow>
    </div>
  );
}

function QuizTextInputActivity({
  draft,
  revisionKey,
  onReport,
}: ActivityProps<"quiz-text-input">) {
  const [answers, setAnswers] = useState<string[]>([]);

  useEffect(() => {
    setAnswers(Array.from({ length: draft.data.questions.length }, () => ""));
  }, [revisionKey, draft.data.questions.length]);

  const handleCheck = () => {
    const correct = draft.data.questions.filter((question, index) =>
      scoreExactText(answers[index] ?? "", question.answers),
    ).length;
    const score = percentage(correct, draft.data.questions.length);
    onReport(score, correct === draft.data.questions.length);
  };

  return (
    <div className="stack">
      {draft.data.questions.map((question, index) => (
        <div className="question-card" key={`${question.prompt}-${index}`}>
          <strong>{question.prompt}</strong>
          <input
            className="editor-input"
            value={answers[index] ?? ""}
            onChange={(event) => {
              const next = [...answers];
              next[index] = event.target.value;
              setAnswers(next);
            }}
            placeholder="Введите ответ"
          />
        </div>
      ))}
      <ActionRow>
        <PlayerButton onClick={handleCheck}>Проверить</PlayerButton>
      </ActionRow>
    </div>
  );
}

function renderActivity(
  draft: AnyExerciseDraft,
  revisionKey: string,
  onReport: ReportResult,
) {
  switch (draft.type) {
    case "matching-pairs":
      return (
        <MatchingPairsActivity
          draft={draft}
          onReport={onReport}
          revisionKey={revisionKey}
        />
      );
    case "group-assignment":
      return (
        <GroupAssignmentActivity
          draft={draft}
          onReport={onReport}
          revisionKey={revisionKey}
        />
      );
    case "timeline":
      return (
        <TimelineActivity
          draft={draft}
          onReport={onReport}
          revisionKey={revisionKey}
        />
      );
    case "simple-order":
      return (
        <SimpleOrderActivity
          draft={draft}
          onReport={onReport}
          revisionKey={revisionKey}
        />
      );
    case "free-text-input":
      return (
        <FreeTextInputActivity
          draft={draft}
          onReport={onReport}
          revisionKey={revisionKey}
        />
      );
    case "matching-images":
      return (
        <MatchingImagesActivity
          draft={draft}
          onReport={onReport}
          revisionKey={revisionKey}
        />
      );
    case "multiple-choice":
      return (
        <MultipleChoiceActivity
          draft={draft}
          onReport={onReport}
          revisionKey={revisionKey}
        />
      );
    case "cloze-text":
      return (
        <ClozeTextActivity
          draft={draft}
          onReport={onReport}
          revisionKey={revisionKey}
        />
      );
    case "media-notices":
      return (
        <MediaNoticesActivity
          draft={draft}
          onReport={onReport}
          revisionKey={revisionKey}
        />
      );
    case "millionaire-game":
      return (
        <MillionaireGameActivity
          draft={draft}
          onReport={onReport}
          revisionKey={revisionKey}
        />
      );
    case "group-puzzle":
      return (
        <GroupPuzzleActivity
          draft={draft}
          onReport={onReport}
          revisionKey={revisionKey}
        />
      );
    case "crossword":
      return (
        <CrosswordActivity
          draft={draft}
          onReport={onReport}
          revisionKey={revisionKey}
        />
      );
    case "word-grid":
      return (
        <WordGridActivity
          draft={draft}
          onReport={onReport}
          revisionKey={revisionKey}
        />
      );
    case "where-is-what":
      return (
        <WhereIsWhatActivity
          draft={draft}
          onReport={onReport}
          revisionKey={revisionKey}
        />
      );
    case "guess-the-word":
      return (
        <GuessTheWordActivity
          draft={draft}
          onReport={onReport}
          revisionKey={revisionKey}
        />
      );
    case "horse-race":
      return (
        <HorseRaceActivity
          draft={draft}
          onReport={onReport}
          revisionKey={revisionKey}
        />
      );
    case "pairing-game":
      return (
        <PairingGameActivity
          draft={draft}
          onReport={onReport}
          revisionKey={revisionKey}
        />
      );
    case "guess":
      return (
        <GuessActivity draft={draft} onReport={onReport} revisionKey={revisionKey} />
      );
    case "matching-matrix":
      return (
        <MatchingMatrixActivity
          draft={draft}
          onReport={onReport}
          revisionKey={revisionKey}
        />
      );
    case "fill-table":
      return (
        <FillTableActivity
          draft={draft}
          onReport={onReport}
          revisionKey={revisionKey}
        />
      );
    case "quiz-text-input":
      return (
        <QuizTextInputActivity
          draft={draft}
          onReport={onReport}
          revisionKey={revisionKey}
        />
      );
    default:
      return null;
  }
}

export function ExercisePlayer({
  draft,
  fullscreen = false,
}: Readonly<{
  draft: AnyExerciseDraft;
  fullscreen?: boolean;
}>) {
  const [status, setStatus] = useState<{
    score: number;
    solved: boolean;
    detail: string;
  } | null>(null);
  const revisionKey = `${draft.type}:${JSON.stringify(draft.data)}`;

  useEffect(() => {
    setStatus(null);
  }, [revisionKey]);

  const reportResult = (score: number, solved: boolean, detail?: string) => {
    const safeScore = clamp(Math.round(score), 0, 100);
    setStatus({
      score: safeScore,
      solved,
      detail:
        detail ?? (solved ? draft.successMessage : `Результат: ${safeScore}%`),
    });

    if (typeof window !== "undefined" && window.parent) {
      window.parent.postMessage(
        solved
          ? `AppSolved|${draft.type}|${safeScore}|1`
          : `AppChecked|${safeScore}|1`,
        "*",
      );
    }
  };

  return (
    <section
      className={`exercise-player ${
        fullscreen ? "exercise-player--fullscreen" : ""
      }`}
    >
      <div className="exercise-player__head">
        <span className="eyebrow">Тип: {draft.type}</span>
        <h1>{draft.title}</h1>
        <p>{draft.description}</p>
        <div className="player-instructions">{draft.instructions}</div>
      </div>
      <div className="exercise-player__body">
        {renderActivity(draft, revisionKey, reportResult)}
      </div>
      {status ? (
        <div
          className={`player-status ${
            status.solved ? "player-status--success" : ""
          }`}
        >
          <strong>{status.score}%</strong>
          <span>{status.detail}</span>
        </div>
      ) : null}
    </section>
  );
}
