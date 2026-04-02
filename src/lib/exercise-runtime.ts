import { normalizeText } from "@/lib/utils";

export interface ClozeToken {
  type: "text" | "blank";
  value: string;
  index?: number;
}

export interface GridPoint {
  row: number;
  column: number;
}

export interface WordSearchPlacement {
  word: string;
  cells: GridPoint[];
}

export interface WordSearchLayout {
  grid: string[][];
  placements: WordSearchPlacement[];
  size: number;
}

export interface CrosswordPlacement {
  answer: string;
  clue: string;
  row: number;
  column: number;
  direction: "across" | "down";
  number: number;
}

export interface CrosswordLayout {
  grid: Array<Array<string | null>>;
  placements: CrosswordPlacement[];
  width: number;
  height: number;
  totalLetters: number;
}

function normalizePuzzleWord(value: string) {
  return normalizeText(value, true)
    .replace(/\s+/g, "")
    .toLocaleUpperCase("ru-RU");
}

export function parseClozeText(text: string) {
  const tokens: ClozeToken[] = [];
  const expression = /\[\[(.+?)\]\]/g;
  let startIndex = 0;
  let blankIndex = 0;

  while (true) {
    const match = expression.exec(text);

    if (!match) {
      break;
    }

    if (match.index > startIndex) {
      tokens.push({
        type: "text",
        value: text.slice(startIndex, match.index),
      });
    }

    tokens.push({
      type: "blank",
      value: match[1],
      index: blankIndex,
    });

    blankIndex += 1;
    startIndex = expression.lastIndex;
  }

  if (startIndex < text.length) {
    tokens.push({
      type: "text",
      value: text.slice(startIndex),
    });
  }

  return tokens;
}

export function timestampToSeconds(value: string) {
  const parts = value.split(":").map((part) => Number.parseInt(part, 10));

  if (parts.some((part) => Number.isNaN(part))) {
    return 0;
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return parts[0] ?? 0;
}

export function lineCells(start: GridPoint, end: GridPoint) {
  const rowDistance = end.row - start.row;
  const columnDistance = end.column - start.column;
  const rowStep = Math.sign(rowDistance);
  const columnStep = Math.sign(columnDistance);
  const rowAbs = Math.abs(rowDistance);
  const columnAbs = Math.abs(columnDistance);

  const isStraight =
    rowAbs === 0 || columnAbs === 0 || rowAbs === columnAbs;

  if (!isStraight) {
    return null;
  }

  const length = Math.max(rowAbs, columnAbs);

  return Array.from({ length: length + 1 }, (_, index) => ({
    row: start.row + rowStep * index,
    column: start.column + columnStep * index,
  }));
}

export function buildWordSearch(words: string[], requestedSize: number): WordSearchLayout {
  const normalizedWords = words
    .map((word) => normalizePuzzleWord(word))
    .filter((word) => word.length > 1);

  const longest = normalizedWords.reduce(
    (max, word) => Math.max(max, word.length),
    0,
  );
  const size = Math.max(requestedSize || 10, longest + 2, 8);
  const grid = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ""),
  );
  const placements: WordSearchPlacement[] = [];
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
    [0, -1],
    [-1, 0],
    [-1, -1],
    [-1, 1],
  ];

  function canPlace(word: string, row: number, column: number, rowStep: number, columnStep: number) {
    for (let index = 0; index < word.length; index += 1) {
      const nextRow = row + rowStep * index;
      const nextColumn = column + columnStep * index;

      if (
        nextRow < 0 ||
        nextColumn < 0 ||
        nextRow >= size ||
        nextColumn >= size
      ) {
        return false;
      }

      const existing = grid[nextRow][nextColumn];
      if (existing && existing !== word[index]) {
        return false;
      }
    }

    return true;
  }

  function place(word: string, row: number, column: number, rowStep: number, columnStep: number) {
    const cells: GridPoint[] = [];

    for (let index = 0; index < word.length; index += 1) {
      const nextRow = row + rowStep * index;
      const nextColumn = column + columnStep * index;
      grid[nextRow][nextColumn] = word[index];
      cells.push({ row: nextRow, column: nextColumn });
    }

    placements.push({ word, cells });
  }

  for (const word of normalizedWords) {
    let placed = false;

    for (let attempt = 0; attempt < 250 && !placed; attempt += 1) {
      const direction = directions[Math.floor(Math.random() * directions.length)];
      const row = Math.floor(Math.random() * size);
      const column = Math.floor(Math.random() * size);

      if (canPlace(word, row, column, direction[0], direction[1])) {
        place(word, row, column, direction[0], direction[1]);
        placed = true;
      }
    }
  }

  const alphabet = Array.from(
    new Set(normalizedWords.join("").split("")),
  ).join("") || "АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ";

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (!grid[row][column]) {
        grid[row][column] =
          alphabet[Math.floor(Math.random() * alphabet.length)];
      }
    }
  }

  return {
    grid,
    placements,
    size,
  };
}

export function buildCrossword(
  entries: Array<{ answer: string; clue: string }>,
): CrosswordLayout {
  const filtered = entries
    .map((entry) => ({
      answer: normalizePuzzleWord(entry.answer),
      clue: entry.clue.trim(),
    }))
    .filter((entry) => entry.answer.length > 1 && entry.clue.length > 0);

  if (filtered.length === 0) {
    return {
      grid: [[null]],
      placements: [],
      width: 1,
      height: 1,
      totalLetters: 0,
    };
  }

  const size = Math.max(
    19,
    filtered.reduce((max, entry) => Math.max(max, entry.answer.length + 6), 0),
  );
  const grid = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null as string | null),
  );
  const placements: Array<Omit<CrosswordPlacement, "number">> = [];

  function canPlace(
    answer: string,
    row: number,
    column: number,
    direction: "across" | "down",
  ) {
    for (let index = 0; index < answer.length; index += 1) {
      const nextRow = direction === "across" ? row : row + index;
      const nextColumn = direction === "across" ? column + index : column;

      if (
        nextRow < 0 ||
        nextColumn < 0 ||
        nextRow >= size ||
        nextColumn >= size
      ) {
        return false;
      }

      const existing = grid[nextRow][nextColumn];
      if (existing && existing !== answer[index]) {
        return false;
      }
    }

    return true;
  }

  function place(
    answer: string,
    clue: string,
    row: number,
    column: number,
    direction: "across" | "down",
  ) {
    for (let index = 0; index < answer.length; index += 1) {
      const nextRow = direction === "across" ? row : row + index;
      const nextColumn = direction === "across" ? column + index : column;
      grid[nextRow][nextColumn] = answer[index];
    }

    placements.push({ answer, clue, row, column, direction });
  }

  const first = filtered[0];
  place(
    first.answer,
    first.clue,
    Math.floor(size / 2),
    Math.floor((size - first.answer.length) / 2),
    "across",
  );

  for (const entry of filtered.slice(1)) {
    let chosen:
      | { row: number; column: number; direction: "across" | "down" }
      | null = null;

    for (const placement of placements) {
      for (
        let placedIndex = 0;
        placedIndex < placement.answer.length && !chosen;
        placedIndex += 1
      ) {
        for (
          let wordIndex = 0;
          wordIndex < entry.answer.length && !chosen;
          wordIndex += 1
        ) {
          if (placement.answer[placedIndex] !== entry.answer[wordIndex]) {
            continue;
          }

          const direction =
            placement.direction === "across" ? "down" : "across";
          const row =
            direction === "across"
              ? placement.row + placedIndex
              : placement.row - wordIndex;
          const column =
            direction === "across"
              ? placement.column - wordIndex
              : placement.column + placedIndex;

          if (canPlace(entry.answer, row, column, direction)) {
            chosen = { row, column, direction };
          }
        }
      }
    }

    if (!chosen) {
      for (let row = 1; row < size - 1 && !chosen; row += 1) {
        for (let column = 1; column < size - 1 && !chosen; column += 1) {
          if (canPlace(entry.answer, row, column, "across")) {
            chosen = { row, column, direction: "across" };
          } else if (canPlace(entry.answer, row, column, "down")) {
            chosen = { row, column, direction: "down" };
          }
        }
      }
    }

    if (chosen) {
      place(entry.answer, entry.clue, chosen.row, chosen.column, chosen.direction);
    }
  }

  const usedRows = placements.flatMap((placement) =>
    Array.from({ length: placement.answer.length }, (_, index) =>
      placement.direction === "across" ? placement.row : placement.row + index,
    ),
  );
  const usedColumns = placements.flatMap((placement) =>
    Array.from({ length: placement.answer.length }, (_, index) =>
      placement.direction === "across"
        ? placement.column + index
        : placement.column,
    ),
  );

  const minRow = Math.max(0, Math.min(...usedRows) - 1);
  const maxRow = Math.min(size - 1, Math.max(...usedRows) + 1);
  const minColumn = Math.max(0, Math.min(...usedColumns) - 1);
  const maxColumn = Math.min(size - 1, Math.max(...usedColumns) + 1);

  const trimmedGrid = grid
    .slice(minRow, maxRow + 1)
    .map((row) => row.slice(minColumn, maxColumn + 1));

  const numberedPlacements = placements
    .map((placement) => ({
      ...placement,
      row: placement.row - minRow,
      column: placement.column - minColumn,
      number: 0,
    }))
    .sort((left, right) =>
      left.row === right.row ? left.column - right.column : left.row - right.row,
    );

  const numbering = new Map<string, number>();
  let counter = 1;

  for (const placement of numberedPlacements) {
    const key = `${placement.row}:${placement.column}`;
    if (!numbering.has(key)) {
      numbering.set(key, counter);
      counter += 1;
    }
    placement.number = numbering.get(key)!;
  }

  return {
    grid: trimmedGrid,
    placements: numberedPlacements,
    width: trimmedGrid[0]?.length ?? 0,
    height: trimmedGrid.length,
    totalLetters: numberedPlacements.reduce(
      (total, placement) => total + placement.answer.length,
      0,
    ),
  };
}
