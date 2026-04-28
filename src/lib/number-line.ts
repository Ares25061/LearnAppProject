import {
  createMatchingContent,
  getMatchingContentSummary,
  normalizeMatchingSide,
} from "@/lib/matching-pairs";
import type {
  NumberLineData,
  NumberLineItem,
} from "@/lib/types";
import { clamp } from "@/lib/utils";

export { convertMatchingContentKind } from "@/lib/matching-pairs";

export const NUMBER_LINE_MIN_ITEMS = 1;
export const NUMBER_LINE_MAX_ITEMS = 20;
export const NUMBER_LINE_DEFAULT_MIN = 1000;
export const NUMBER_LINE_DEFAULT_MAX = 2000;

export type NumberLineTarget = {
  end: number;
  start: number;
};

export function createNumberLineItem(index = 0): NumberLineItem {
  const content = createMatchingContent("text");

  if (content.kind === "text") {
    content.text = `Карточка ${index + 1}`;
  }

  return {
    content,
    value: "",
  };
}

function normalizeNumber(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return value;
}

export function normalizeNumberLineData(data: NumberLineData): NumberLineData {
  const min = normalizeNumber(data.min, NUMBER_LINE_DEFAULT_MIN);
  const max = normalizeNumber(data.max, NUMBER_LINE_DEFAULT_MAX);
  const normalizedMin = Math.min(min, max);
  const normalizedMax =
    min === max ? normalizedMin + 1 : Math.max(min, max);
  const sourceItems = Array.isArray(data.items) ? data.items : [];
  const items = sourceItems
    .slice(0, NUMBER_LINE_MAX_ITEMS)
    .map((item, index) => ({
      content: normalizeMatchingSide(item.content),
      value:
        typeof item.value === "string" && item.value.trim()
          ? item.value.trim()
          : `${Math.round(normalizedMin + ((index + 1) / (sourceItems.length + 1 || 2)) * (normalizedMax - normalizedMin))}`,
    }));

  return {
    min: normalizedMin,
    max: normalizedMax,
    items:
      items.length >= NUMBER_LINE_MIN_ITEMS
        ? items
        : [createNumberLineItem(0)],
    showHints: typeof data.showHints === "boolean" ? data.showHints : true,
  };
}

export function parseNumberLineTarget(value: string): NumberLineTarget | null {
  const normalized = value.trim().replace(/,/g, ".").replace(/[–—]/g, "-");

  if (!normalized) {
    return null;
  }

  const rangeMatch = normalized.match(
    /^\s*(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*$/,
  );
  const singleMatch = normalized.match(/^\s*(-?\d+(?:\.\d+)?)\s*$/);

  if (rangeMatch) {
    const first = Number.parseFloat(rangeMatch[1] ?? "");
    const second = Number.parseFloat(rangeMatch[2] ?? "");

    if (Number.isFinite(first) && Number.isFinite(second)) {
      return {
        start: Math.min(first, second),
        end: Math.max(first, second),
      };
    }
  }

  if (singleMatch) {
    const target = Number.parseFloat(singleMatch[1] ?? "");

    if (Number.isFinite(target)) {
      return {
        start: target,
        end: target,
      };
    }
  }

  return null;
}

export function clampNumberLineValue(
  value: number,
  min: number,
  max: number,
) {
  return clamp(value, min, max);
}

export function getNumberLinePercent(value: number, min: number, max: number) {
  const span = max - min;

  if (!Number.isFinite(span) || span <= 0) {
    return 0;
  }

  return clamp(((value - min) / span) * 100, 0, 100);
}

export function formatNumberLineValue(value: number) {
  if (!Number.isFinite(value)) {
    return "";
  }

  if (Number.isInteger(value)) {
    return `${value}`;
  }

  return value.toFixed(2).replace(/\.?0+$/, "");
}

export function getNumberLineStep(min: number, max: number) {
  const span = Math.abs(max - min);

  if (span <= 10) {
    return 0.1;
  }

  if (span <= 100) {
    return 1;
  }

  return Math.max(1, Math.round(span / 200));
}

export function getNumberLineItemTitle(item: NumberLineItem, index: number) {
  return getMatchingContentSummary(item.content).trim() || `Карточка ${index + 1}`;
}
