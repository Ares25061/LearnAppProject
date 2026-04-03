"use client";
/* eslint-disable @next/next/no-img-element, react-hooks/set-state-in-effect, react-hooks/purity */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  buildCrossword,
  buildWordSearch,
  lineCells,
  parseClozeText,
  timestampToSeconds,
  type GridPoint,
} from "@/lib/exercise-runtime";
import {
  MATCHING_IMAGE_HEIGHT_DEFAULT,
  MATCHING_TEXT_SIZE_DEFAULT,
  getMatchingContentAriaLabel,
  getMatchingContentSummary,
  MATCHING_IMAGE_HEIGHT_MAX,
  MATCHING_IMAGE_HEIGHT_MIN,
  normalizeMatchingPairsData,
  normalizeMatchingSide,
} from "@/lib/matching-pairs";
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
  MatchingAudioContent,
  MatchingContent,
  MatchingImageContent,
  MatchingMatrixData,
  MatchingVideoContent,
} from "@/lib/types";

type ReportResult = (score: number, solved: boolean, detail?: string) => void;

type ActivityProps<T extends ExerciseTypeId> = {
  draft: Extract<AnyExerciseDraft, { type: T }>;
  revisionKey: string;
  onReport: ReportResult;
  boardOnly?: boolean;
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
  const { className, ...rest } = props;
  return (
    <button
      className={className ? `player-button ${className}` : "player-button"}
      type="button"
      {...rest}
    />
  );
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

const MATCHING_CARD_WIDTH = 272;
const MATCHING_DEFAULT_CARD_HEIGHT = 144;
const MATCHING_CARD_GAP = 18;
const MATCHING_CARD_STEP = 18;
const MATCHING_CARD_MIN_WIDTH = 156;
const MATCHING_BOARD_DEFAULT_WIDTH = 920;
const MATCHING_BOARD_DEFAULT_HEIGHT = 560;
const MATCHING_BOARD_PADDING = 20;
const MATCHING_BOARD_PADDING_COMPACT = 16;
const MATCHING_BOARD_BOTTOM_SPACE = 96;
const MATCHING_BOARD_BOTTOM_SPACE_COMPACT = 88;
const MATCHING_IMAGE_CARD_BASE_HEIGHT = 72;
const MATCHING_IMAGE_CAPTION_HEIGHT = 38;
const MATCHING_AUDIO_CARD_BASE_HEIGHT = 128;
const MATCHING_VIDEO_CARD_BASE_HEIGHT = 118;

type MatchingGroupStatus = "neutral" | "correct" | "incorrect";
type MatchingBoardSize = {
  width: number;
  height: number;
};
type MatchingBoardMetrics = {
  width: number;
  height: number;
  padding: number;
  minInset: number;
  columnGap: number;
  columnWidth: number;
  availableHeight: number;
  bottomLimit: number;
  leftColumnX: number;
  rightColumnX: number;
};

interface MatchingDragCard {
  id: string;
  content: MatchingContent;
  label: string;
  role: "pair" | "extra";
  side: "left" | "right";
  pairIndex: number | null;
  groupId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

type MatchingPlayableContent = MatchingAudioContent | MatchingVideoContent;
type MatchingYouTubePlayer = {
  destroy: () => void;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  getPlayerState?: () => number;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume?: (volume: number) => void;
};
type MatchingYouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      height?: string;
      width?: string;
      videoId: string;
      playerVars?: Record<string, number | string>;
      events?: {
        onReady?: (event: { target: MatchingYouTubePlayer }) => void;
        onStateChange?: (event: {
          data: number;
          target: MatchingYouTubePlayer;
        }) => void;
      };
    },
  ) => MatchingYouTubePlayer;
};
type MatchingEmbeddedVideoProvider = "youtube" | "rutube" | "vk";
type MatchingEmbeddedVideoMeta = {
  embedUrl: string;
  provider: MatchingEmbeddedVideoProvider;
  startSeconds: number;
  thumbnailUrl?: string;
  videoId?: string;
};

declare global {
  interface Window {
    YT?: MatchingYouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let matchingYouTubeApiPromise: Promise<MatchingYouTubeApi> | null = null;

function getMatchingImageHeight(input: MatchingContent | MatchingImageContent) {
  const content =
    input.kind === "image" ? input : normalizeMatchingSide(input);

  if (content.kind !== "image") {
    return MATCHING_IMAGE_HEIGHT_DEFAULT;
  }

  return clamp(
    Math.round(content.size),
    MATCHING_IMAGE_HEIGHT_MIN,
    MATCHING_IMAGE_HEIGHT_MAX,
  );
}

function getMatchingTextSize(content: MatchingContent) {
  const normalized = normalizeMatchingSide(content);

  if (normalized.kind === "text" || normalized.kind === "spoken-text") {
    return clamp(
      Math.round(normalized.size),
      MATCHING_IMAGE_HEIGHT_MIN,
      MATCHING_IMAGE_HEIGHT_MAX,
    );
  }

  return MATCHING_TEXT_SIZE_DEFAULT;
}

function getMatchingAudioSize(input: MatchingAudioContent) {
  return clamp(
    Math.round(input.size),
    MATCHING_IMAGE_HEIGHT_MIN,
    MATCHING_IMAGE_HEIGHT_MAX,
  );
}

function getMatchingVideoSize(input: MatchingVideoContent) {
  return clamp(
    Math.round(input.size),
    MATCHING_IMAGE_HEIGHT_MIN,
    MATCHING_IMAGE_HEIGHT_MAX,
  );
}

function getMatchingVideoStartSeconds(content: MatchingVideoContent) {
  return Math.max(0, Math.round(content.startSeconds));
}

function getMatchingVideoVolume(content: MatchingVideoContent) {
  return clamp(Math.round(content.volume), 0, 100);
}

function getMatchingBoardMetrics(
  boardSize: Partial<MatchingBoardSize> = {},
): MatchingBoardMetrics {
  const width =
    boardSize.width && boardSize.width > 0
      ? Math.max(320, Math.round(boardSize.width))
      : MATCHING_BOARD_DEFAULT_WIDTH;
  const height =
    boardSize.height && boardSize.height > 0
      ? Math.max(400, Math.round(boardSize.height))
      : MATCHING_BOARD_DEFAULT_HEIGHT;
  const padding = width < 640 ? MATCHING_BOARD_PADDING_COMPACT : MATCHING_BOARD_PADDING;
  const bottomSpace =
    height < 500 ? MATCHING_BOARD_BOTTOM_SPACE_COMPACT : MATCHING_BOARD_BOTTOM_SPACE;
  const minInset = Math.max(12, padding - 4);
  const columnGap = clamp(Math.round(width * 0.03), 16, 28);
  const innerWidth = Math.max(280, width - padding * 2);
  const columnWidth = Math.max(132, Math.floor((innerWidth - columnGap) / 2));
  const availableHeight = Math.max(240, height - padding - bottomSpace - minInset);

  return {
    width,
    height,
    padding,
    minInset,
    columnGap,
    columnWidth,
    availableHeight,
    bottomLimit: height - bottomSpace - minInset,
    leftColumnX: padding,
    rightColumnX: padding + columnWidth + columnGap,
  };
}

function estimateMatchingTextHeight(
  text: string,
  width: number,
  minHeight: number,
) {
  const compact = text.trim().replace(/\s+/g, " ");
  const charsPerLine = Math.max(10, Math.floor(Math.max(width - 44, 112) / 8.4));
  const lineCount = Math.max(1, Math.ceil(Math.max(compact.length, 1) / charsPerLine));
  return clamp(minHeight + (lineCount - 1) * 24, minHeight, 340);
}

function getMatchingCardHeight(
  content: MatchingContent,
  width = MATCHING_CARD_WIDTH,
) {
  const normalized = normalizeMatchingSide(content);
  const widthScale = clamp(width / MATCHING_CARD_WIDTH, 0.58, 1);

  if (normalized.kind === "video") {
    return (
      MATCHING_VIDEO_CARD_BASE_HEIGHT +
      Math.round(clamp(getMatchingVideoSize(normalized), 120, 220) * widthScale)
    );
  }

  if (normalized.kind === "audio") {
    return (
      MATCHING_AUDIO_CARD_BASE_HEIGHT +
      Math.round(clamp(getMatchingAudioSize(normalized), 72, 156) * widthScale)
    );
  }

  if (normalized.kind === "text" || normalized.kind === "spoken-text") {
    return estimateMatchingTextHeight(normalized.text, width, 112);
  }

  if (normalized.kind !== "image") {
    return MATCHING_DEFAULT_CARD_HEIGHT;
  }

  return (
    MATCHING_IMAGE_CARD_BASE_HEIGHT +
    Math.round(clamp(getMatchingImageHeight(normalized), 110, 220) * widthScale) +
    (normalized.alt.trim() ? MATCHING_IMAGE_CAPTION_HEIGHT : 0)
  );
}

function getMatchingCardBaseWidth(content: MatchingContent, columnWidth: number) {
  const normalized = normalizeMatchingSide(content);
  const maxWidth = Math.max(MATCHING_CARD_MIN_WIDTH, Math.floor(columnWidth));

  if (normalized.kind === "video") {
    return clamp(Math.round(maxWidth * 0.96), 208, maxWidth);
  }

  if (normalized.kind === "audio") {
    return clamp(Math.round(maxWidth * 0.9), 196, maxWidth);
  }

  if (normalized.kind === "image") {
    return clamp(
      Math.round(176 + clamp(getMatchingImageHeight(normalized), 110, 220) * 0.52),
      172,
      maxWidth,
    );
  }

  const preferredWidth = Math.round(164 + Math.min(normalized.text.length, 120) * 1.6);
  const minWidth = normalized.kind === "spoken-text" ? 188 : 168;
  return clamp(preferredWidth, minWidth, maxWidth);
}

function getMatchingCardMinimumHeight(content: MatchingContent) {
  const normalized = normalizeMatchingSide(content);

  if (normalized.kind === "video") {
    return 124;
  }

  if (normalized.kind === "audio") {
    return 114;
  }

  if (normalized.kind === "image") {
    return 108;
  }

  if (normalized.kind === "spoken-text") {
    return 102;
  }

  return 84;
}

function getMatchingCardSize(
  content: MatchingContent,
  columnWidth: number,
  scale: number,
) {
  const maxWidth = Math.max(MATCHING_CARD_MIN_WIDTH, Math.floor(columnWidth));
  const baseWidth = getMatchingCardBaseWidth(content, columnWidth);
  const baseHeight = getMatchingCardHeight(content, baseWidth);
  const minimumWidth = Math.min(
    maxWidth,
    Math.max(132, Math.round(MATCHING_CARD_MIN_WIDTH * Math.max(scale, 0.82))),
  );
  const minimumHeight = Math.max(
    76,
    Math.round(getMatchingCardMinimumHeight(content) * Math.max(scale, 0.74)),
  );

  return {
    width: clamp(Math.round(baseWidth * scale), minimumWidth, maxWidth),
    height: Math.max(minimumHeight, Math.round(baseHeight * scale)),
  };
}

function getMatchingStackScale(
  cards: ReadonlyArray<Pick<MatchingDragCard, "content">>,
  columnWidth: number,
  availableHeight: number,
) {
  if (cards.length === 0) {
    return 1;
  }

  const naturalHeights = cards.reduce(
    (total, card) =>
      total + getMatchingCardHeight(card.content, getMatchingCardBaseWidth(card.content, columnWidth)),
    0,
  );
  const totalHeight = naturalHeights + MATCHING_CARD_STEP * (cards.length - 1);

  return clamp(availableHeight / Math.max(totalHeight, 1), 0.42, 1);
}

function positionMatchingColumn(
  cards: MatchingDragCard[],
  columnX: number,
  metrics: MatchingBoardMetrics,
  scale: number,
) {
  const gap = Math.max(10, Math.round(MATCHING_CARD_STEP * scale));
  const sizedCards = cards.map((card) => ({
    ...card,
    ...getMatchingCardSize(card.content, metrics.columnWidth, scale),
  }));
  const totalHeight =
    sizedCards.reduce((sum, card) => sum + card.height, 0) +
    gap * Math.max(0, sizedCards.length - 1);
  let currentY =
    metrics.minInset + Math.max(0, Math.floor((metrics.availableHeight - totalHeight) / 2));

  return sizedCards.map((card) => {
    const positionedCard = {
      ...card,
      x: Math.round(columnX + (metrics.columnWidth - card.width) / 2),
      y: currentY,
    };
    currentY += card.height + gap;
    return positionedCard;
  });
}

function parseHexColor(value: string) {
  const normalized = value.trim();
  const shortMatch = normalized.match(/^#([\da-f]{3})$/i);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split("").map((char) => char + char);
    return {
      red: Number.parseInt(r, 16),
      green: Number.parseInt(g, 16),
      blue: Number.parseInt(b, 16),
    };
  }

  const fullMatch = normalized.match(/^#([\da-f]{6})$/i);
  if (!fullMatch) {
    return null;
  }

  return {
    red: Number.parseInt(fullMatch[1].slice(0, 2), 16),
    green: Number.parseInt(fullMatch[1].slice(2, 4), 16),
    blue: Number.parseInt(fullMatch[1].slice(4, 6), 16),
  };
}

function getExerciseThemeStyle(themeColor: string): CSSProperties {
  const rgb = parseHexColor(themeColor);
  if (!rgb) {
    return {};
  }

  const deepen = (channel: number) => Math.max(0, Math.round(channel * 0.72));

  return {
    "--accent": `rgb(${rgb.red} ${rgb.green} ${rgb.blue})`,
    "--accent-deep": `rgb(${deepen(rgb.red)} ${deepen(rgb.green)} ${deepen(rgb.blue)})`,
    "--accent-soft": `rgb(${rgb.red} ${rgb.green} ${rgb.blue} / 0.14)`,
    "--board-surface": `rgb(${rgb.red} ${rgb.green} ${rgb.blue} / 0.16)`,
    "--board-surface-strong": `rgb(${rgb.red} ${rgb.green} ${rgb.blue} / 0.28)`,
    "--board-grid": `rgb(${deepen(rgb.red)} ${deepen(rgb.green)} ${deepen(rgb.blue)} / 0.12)`,
    "--board-border": `rgb(${deepen(rgb.red)} ${deepen(rgb.green)} ${deepen(rgb.blue)} / 0.34)`,
  } as CSSProperties;
}

function collectMatchingGroups(cards: MatchingDragCard[]) {
  const groups = new Map<string, MatchingDragCard[]>();

  cards.forEach((card) => {
    const group = groups.get(card.groupId);
    if (group) {
      group.push(card);
      return;
    }
    groups.set(card.groupId, [card]);
  });

  return groups;
}

function getMatchingGroupStatus(cards: MatchingDragCard[]): MatchingGroupStatus {
  if (cards.length !== 2) {
    return "neutral";
  }

  const [first, second] = cards;
  if (
    first.role === "pair" &&
    second.role === "pair" &&
    first.pairIndex !== null &&
    first.pairIndex === second.pairIndex
  ) {
    return "correct";
  }

  return "incorrect";
}

function buildMatchingGroupStatuses(cards: MatchingDragCard[]) {
  return new Map(
    Array.from(collectMatchingGroups(cards), ([groupId, groupCards]) => [
      groupId,
      getMatchingGroupStatus(groupCards),
    ]),
  );
}

function countVisibleCorrectPairs(cards: MatchingDragCard[]) {
  return Array.from(buildMatchingGroupStatuses(cards).values()).filter(
    (status) => status === "correct",
  ).length;
}

function getEvaluatedPairGroups(cards: MatchingDragCard[]) {
  return Array.from(collectMatchingGroups(cards).values()).filter(
    (group) => group.length === 2,
  ).length;
}

function stripSolvedMatchingGroups(cards: MatchingDragCard[]) {
  const solvedPairIndexes = new Set<number>();
  const groups = collectMatchingGroups(cards);
  const removableGroupIds = new Set<string>();

  groups.forEach((groupCards, groupId) => {
    if (getMatchingGroupStatus(groupCards) !== "correct") {
      return;
    }

    const pairCard = groupCards.find((card) => card.role === "pair");
    if (pairCard && pairCard.pairIndex !== null) {
      solvedPairIndexes.add(pairCard.pairIndex);
      removableGroupIds.add(groupId);
    }
  });

  return {
    cards: cards.filter((card) => !removableGroupIds.has(card.groupId)),
    solvedPairIndexes,
  };
}

function hashMatchingSeed(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash || 1;
}

function deterministicShuffle<T>(items: T[], seedSource: string) {
  const next = [...items];
  let seed = hashMatchingSeed(seedSource);

  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}

function createMatchingCards(
  data: Extract<AnyExerciseDraft, { type: "matching-pairs" }>["data"],
  boardSize: Partial<MatchingBoardSize> = {},
): MatchingDragCard[] {
  const normalized = normalizeMatchingPairsData(data);
  const { extras, pairs } = normalized;
  const metrics = getMatchingBoardMetrics(boardSize);
  const leftCards = [
    ...pairs.map((pair, index) => ({
      id: `left-${index}`,
      content: pair.left,
      label: getMatchingContentSummary(pair.left),
      role: "pair" as const,
      side: "left" as const,
      pairIndex: index,
      groupId: `group-left-${index}`,
    })),
    ...extras
      .filter((item) => item.side === "left")
      .map((item, index) => ({
        id: `extra-left-${index}`,
        content: item.content,
        label: getMatchingContentSummary(item.content),
        role: "extra" as const,
        side: "left" as const,
        pairIndex: null,
        groupId: `group-extra-left-${index}`,
      })),
  ];
  const rightCards = deterministicShuffle(
    [
      pairs.map((pair, index) => ({
        pairIndex: index,
        content: pair.right,
        label: getMatchingContentSummary(pair.right),
        role: "pair" as const,
        side: "right" as const,
        id: `right-${index}`,
        groupId: `group-right-${index}`,
      })),
      ...extras
        .filter((item) => item.side === "right")
        .map((item, index) => ({
          id: `extra-right-${index}`,
          content: item.content,
          label: getMatchingContentSummary(item.content),
          role: "extra" as const,
          side: "right" as const,
          pairIndex: null,
          groupId: `group-extra-right-${index}`,
        })),
    ].flat(),
    JSON.stringify(normalized),
  );
  const scale = Math.min(
    1,
    getMatchingStackScale(leftCards, metrics.columnWidth, metrics.availableHeight),
    getMatchingStackScale(rightCards, metrics.columnWidth, metrics.availableHeight),
  );
  const positionedLeftCards = positionMatchingColumn(
    leftCards,
    metrics.leftColumnX,
    metrics,
    scale,
  );
  const positionedRightCards = positionMatchingColumn(
    rightCards,
    metrics.rightColumnX,
    metrics,
    scale,
  );

  return [...positionedLeftCards, ...positionedRightCards];
}

function speakMatchingText(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

function getMatchingMediaType(
  kind: Extract<MatchingContent["kind"], "audio" | "video">,
  url: string,
) {
  const dataUrlMatch = url.trim().match(/^data:([^;,]+)[;,]/i);
  const dataMimeType = dataUrlMatch?.[1]?.toLowerCase() ?? "";

  if (dataMimeType) {
    if (
      kind === "audio" &&
      (dataMimeType.startsWith("audio/") || dataMimeType === "video/mp4")
    ) {
      return dataMimeType;
    }

    if (kind === "video" && dataMimeType.startsWith("video/")) {
      return dataMimeType;
    }

    return undefined;
  }

  const normalized = url.split("?")[0]?.split("#")[0]?.toLowerCase() ?? "";

  if (kind === "audio") {
    if (normalized.endsWith(".mp3")) {
      return "audio/mpeg";
    }
    if (normalized.endsWith(".mp4")) {
      return "audio/mp4";
    }
    if (normalized.endsWith(".m4a")) {
      return "audio/mp4";
    }
    if (normalized.endsWith(".wav")) {
      return "audio/wav";
    }
    if (normalized.endsWith(".ogg")) {
      return "audio/ogg";
    }
  }

  if (kind === "video") {
    if (normalized.endsWith(".mp4")) {
      return "video/mp4";
    }
    if (normalized.endsWith(".webm")) {
      return "video/webm";
    }
    if (normalized.endsWith(".ogg") || normalized.endsWith(".ogv")) {
      return "video/ogg";
    }
  }

  return undefined;
}

function parseMatchingUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;

  try {
    return new URL(normalized);
  } catch {
    return null;
  }
}

function parseMatchingTimeValue(value: string | null) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return 0;
  }

  if (trimmed.includes(":")) {
    return Math.max(0, timestampToSeconds(trimmed));
  }

  const hmsMatch = trimmed.match(
    /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/i,
  );
  if (hmsMatch) {
    const [, hoursValue, minutesValue, secondsValue] = hmsMatch;
    const hours = Number.parseInt(hoursValue ?? "0", 10);
    const minutes = Number.parseInt(minutesValue ?? "0", 10);
    const seconds = Number.parseInt(secondsValue ?? "0", 10);

    if ([hours, minutes, seconds].some((item) => Number.isNaN(item))) {
      return 0;
    }

    const total = hours * 3600 + minutes * 60 + seconds;
    if (total > 0) {
      return total;
    }
  }

  const numeric = Number.parseInt(trimmed, 10);
  return Number.isNaN(numeric) ? 0 : Math.max(0, numeric);
}

function getMatchingServiceStartSeconds(parsed: URL) {
  return (
    parseMatchingTimeValue(parsed.searchParams.get("t")) ||
    parseMatchingTimeValue(parsed.searchParams.get("start")) ||
    parseMatchingTimeValue(parsed.hash.replace(/^#(?:t=)?/, ""))
  );
}

function getMatchingYouTubeMeta(url: string): MatchingEmbeddedVideoMeta | null {
  const parsed = parseMatchingUrl(url);
  if (!parsed) {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "");
  let videoId = "";

  if (host === "youtu.be") {
    videoId = parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
  } else if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    videoId = parsed.searchParams.get("v") ?? "";

    if (!videoId) {
      const [, firstSegment, secondSegment] = parsed.pathname.split("/");
      if (
        firstSegment === "embed" ||
        firstSegment === "shorts" ||
        firstSegment === "live"
      ) {
        videoId = secondSegment ?? "";
      }
    }
  }

  if (!videoId) {
    return null;
  }

  const startSeconds = getMatchingServiceStartSeconds(parsed);

  return {
    embedUrl: buildMatchingYouTubeEmbedUrl(videoId, startSeconds),
    provider: "youtube",
    videoId,
    startSeconds,
    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
  };
}

function buildMatchingYouTubeEmbedUrl(videoId: string, startSeconds = 0) {
  const params = new URLSearchParams({
    autoplay: "1",
    controls: "1",
    playsinline: "1",
    modestbranding: "1",
    rel: "0",
  });

  if (startSeconds > 0) {
    params.set("start", `${startSeconds}`);
  }

  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

function getMatchingRutubeMeta(url: string): MatchingEmbeddedVideoMeta | null {
  const parsed = parseMatchingUrl(url);
  if (!parsed) {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (host !== "rutube.ru") {
    return null;
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  let videoId = "";

  if (segments[0] === "play" && segments[1] === "embed") {
    videoId = segments[2] ?? "";
  } else if (segments[0] === "video" && segments[1] === "private") {
    videoId = segments[2] ?? "";
  } else if (segments[0] === "video") {
    videoId = segments[1] ?? "";
  }

  if (!videoId) {
    return null;
  }

  const startSeconds = getMatchingServiceStartSeconds(parsed);
  const embedUrl = new URL(`https://rutube.ru/play/embed/${videoId}`);

  parsed.searchParams.forEach((value, key) => {
    embedUrl.searchParams.set(key, value);
  });
  embedUrl.searchParams.set("autoplay", "1");

  if (startSeconds > 0) {
    embedUrl.searchParams.set("t", `${startSeconds}`);
  }

  return {
    embedUrl: embedUrl.toString(),
    provider: "rutube",
    startSeconds,
  };
}

function getMatchingVkVideoMeta(url: string): MatchingEmbeddedVideoMeta | null {
  const parsed = parseMatchingUrl(url);
  if (!parsed) {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const isVkHost =
    host === "vk.com" ||
    host === "m.vk.com" ||
    host === "vkvideo.ru" ||
    host === "m.vkvideo.ru";

  if (!isVkHost) {
    return null;
  }

  let ownerId = parsed.searchParams.get("oid") ?? "";
  let videoId = parsed.searchParams.get("id") ?? "";

  if (!ownerId || !videoId) {
    const pathMatch = parsed.pathname.match(/\/video(-?\d+)_(\d+)/);
    if (pathMatch) {
      ownerId = pathMatch[1] ?? "";
      videoId = pathMatch[2] ?? "";
    }
  }

  if (!ownerId || !videoId) {
    return null;
  }

  const startSeconds = getMatchingServiceStartSeconds(parsed);
  const embedUrl = new URL("https://vkvideo.ru/video_ext.php");

  embedUrl.searchParams.set("oid", ownerId);
  embedUrl.searchParams.set("id", videoId);

  for (const key of ["hash", "hd", "list", "referrer", "player"]) {
    const value = parsed.searchParams.get(key);
    if (value) {
      embedUrl.searchParams.set(key, value);
    }
  }

  embedUrl.searchParams.set(
    "autoplay",
    parsed.searchParams.get("autoplay") ?? "1",
  );

  if (startSeconds > 0) {
    embedUrl.searchParams.set("t", `${startSeconds}`);
  }

  return {
    embedUrl: embedUrl.toString(),
    provider: "vk",
    startSeconds,
  };
}

function getMatchingEmbeddedVideoMeta(url: string) {
  return (
    getMatchingYouTubeMeta(url) ??
    getMatchingRutubeMeta(url) ??
    getMatchingVkVideoMeta(url)
  );
}

function getMatchingEmbeddedVideoLabel(
  provider: MatchingEmbeddedVideoProvider,
) {
  switch (provider) {
    case "rutube":
      return "Rutube";
    case "vk":
      return "VK Видео";
    case "youtube":
    default:
      return "видеосервис";
  }
}

function getMatchingMediaSourceLabel(url: string) {
  const dataUrlMatch = url.trim().match(/^data:([^;,]+)[;,]/i);
  if (dataUrlMatch?.[1]) {
    return `встроенный файл (${dataUrlMatch[1]})`;
  }

  const embeddedVideoMeta = getMatchingEmbeddedVideoMeta(url);
  if (embeddedVideoMeta) {
    return getMatchingEmbeddedVideoLabel(embeddedVideoMeta.provider);
  }

  const parsed = parseMatchingUrl(url);
  if (!parsed) {
    return url.trim();
  }

  return parsed.hostname.replace(/^www\./, "");
}

function formatMatchingMediaTime(value: number) {
  const safeValue = Math.max(0, Math.floor(value));
  const minutes = Math.floor(safeValue / 60);
  const seconds = `${safeValue % 60}`.padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function getMatchingAudioVolume(content: MatchingAudioContent) {
  return clamp(Math.round(content.volume), 0, 100);
}

function loadMatchingYouTubeApi() {
  if (typeof window === "undefined") {
    return Promise.reject(
      new Error("API встроенного плеера недоступен на сервере."),
    );
  }

  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (matchingYouTubeApiPromise) {
    return matchingYouTubeApiPromise;
  }

  matchingYouTubeApiPromise = new Promise<MatchingYouTubeApi>(
    (resolve, reject) => {
      const previousReadyHandler = window.onYouTubeIframeAPIReady;

      window.onYouTubeIframeAPIReady = () => {
        previousReadyHandler?.();
        if (window.YT?.Player) {
          resolve(window.YT);
        } else {
          reject(new Error("API встроенного плеера загрузился без Player."));
        }
      };

      const existingScript = document.getElementById("matching-youtube-api");
      if (existingScript) {
        return;
      }

      const script = document.createElement("script");
      script.id = "matching-youtube-api";
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () =>
        reject(new Error("Не удалось загрузить API встроенного плеера."));
      document.head.append(script);
    },
  );

  return matchingYouTubeApiPromise;
}

function isMatchingAudioPlayable(url: string) {
  return Boolean(
    getMatchingMediaType("audio", url) ||
      getMatchingMediaType("video", url) ||
      getMatchingYouTubeMeta(url),
  );
}

function isMatchingInteractiveTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest("[data-card-interactive='true']"))
  );
}

function MatchingCardContent({
  cardHeight,
  content,
  onOpenMedia,
}: Readonly<{
  cardHeight: number;
  content: MatchingContent;
  onOpenMedia: (next: MatchingPlayableContent) => void;
}>) {
  const normalized = normalizeMatchingSide(content);
  const contentClassName = `matching-card-content matching-card-content--${normalized.kind}`;

  switch (normalized.kind) {
    case "spoken-text": {
      const spokenTextSize = Math.max(cardHeight - 108, 0);
      return (
        <div
          className={contentClassName}
          style={{
            minHeight: `${spokenTextSize}px`,
          }}
        >
          <p className="matching-card-copy">{normalized.text || "Текст не задан"}</p>
          <button
            className="ghost-button matching-card-action"
            data-card-interactive="true"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (normalized.text.trim()) {
                speakMatchingText(normalized.text);
              }
            }}
          >
            Озвучить
          </button>
        </div>
      );
    }
    case "image": {
      const imageHeight = Math.max(60, cardHeight - (normalized.alt ? 72 : 36));
      return (
        <div className={contentClassName}>
          <div
            className="matching-card-media-frame matching-card-media-frame--visual"
            style={{
              height: `${imageHeight}px`,
              minHeight: `${imageHeight}px`,
            }}
          >
            {normalized.url ? (
              <img
                alt={normalized.alt || "Изображение карточки"}
                className="matching-card-image"
                src={normalized.url}
              />
            ) : (
              <div className="matching-card-placeholder">URL изображения не задан</div>
            )}
          </div>
          {normalized.alt ? (
            <span className="matching-card-caption">{normalized.alt}</span>
          ) : null}
        </div>
      );
    }
    case "audio": {
      const canPlayAudio = isMatchingAudioPlayable(normalized.url);
      const audioSize = Math.max(44, cardHeight - 88);
      return (
        <div className={contentClassName}>
          <span className="tag">AUD</span>
          <strong>{normalized.label || "Аудио"}</strong>
          <div
            className="matching-card-media-frame matching-card-media-frame--audio"
            style={{
              height: `${audioSize}px`,
              minHeight: `${audioSize}px`,
            }}
          >
            {normalized.url && canPlayAudio ? (
              <button
                className="ghost-button matching-media-launch"
                data-card-interactive="true"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenMedia(normalized);
                }}
              >
                <span className="matching-media-launch__icon">▶</span>
                <span>Проиграть звук</span>
              </button>
            ) : normalized.url ? (
              <div className="matching-card-placeholder">
                Для аудио используйте mp3/mp4 или ссылку на поддерживаемый видеосервис
              </div>
            ) : (
              <div className="matching-card-placeholder">URL аудио не задан</div>
            )}
          </div>
          {normalized.url ? (
            <span className="matching-card-url">
              {getMatchingMediaSourceLabel(normalized.url)}
            </span>
          ) : null}
        </div>
      );
    }
    case "video": {
      const embeddedVideoMeta = getMatchingEmbeddedVideoMeta(normalized.url);
      const startSeconds =
<<<<<<< Updated upstream
        getMatchingVideoStartSeconds(normalized) ||
        embeddedVideoMeta?.startSeconds ||
        0;
      const videoSize = getMatchingVideoSize(normalized);
=======
        getMatchingVideoStartSeconds(normalized) || youTubeMeta?.startSeconds || 0;
      const videoSize = Math.max(58, cardHeight - 74);
>>>>>>> Stashed changes

      return (
        <div className={contentClassName}>
          <span className="tag">VID</span>
          <strong>{normalized.label || "Видео"}</strong>
          {normalized.url ? (
            <button
              className="matching-media-preview"
              data-card-interactive="true"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenMedia(normalized);
              }}
            >
              <div
                className="matching-media-preview__frame"
                style={{
                  height: `${videoSize}px`,
                  minHeight: `${videoSize}px`,
                }}
              >
                {embeddedVideoMeta?.thumbnailUrl ? (
                  <img
                    alt={normalized.label || "Превью видео"}
                    className="matching-card-thumbnail"
                    src={embeddedVideoMeta.thumbnailUrl}
                  />
                ) : getMatchingMediaType("video", normalized.url) ? (
                  <video
                    aria-hidden="true"
                    className="matching-card-thumbnail"
                    muted
                    playsInline
                    preload="metadata"
                    src={normalized.url}
                    tabIndex={-1}
                  />
                ) : (
                  <div className="matching-card-thumbnail matching-card-thumbnail--placeholder">
                    Видео
                  </div>
                )}
              </div>
              <span className="matching-media-preview__label">
                Открыть видео
              </span>
            </button>
          ) : (
            <div className="matching-card-placeholder">URL видео не задан</div>
          )}
          {normalized.url ? (
            <span className="matching-card-url">
              {getMatchingMediaSourceLabel(normalized.url)}
              {startSeconds > 0 ? ` · с ${startSeconds} с` : ""}
            </span>
          ) : null}
        </div>
      );
    }
    case "text":
    default: {
      const textSize = Math.max(cardHeight - 68, 0);
      return (
        <div
          className={contentClassName}
          style={{
            minHeight: `${textSize}px`,
          }}
        >
          <p className="matching-card-copy">{normalized.text || "Текст не задан"}</p>
        </div>
      );
    }
  }
}

function MatchingYouTubeAudioPlayer({
  startSeconds,
  videoId,
  volume,
}: Readonly<{
  startSeconds: number;
  videoId: string;
  volume: number;
}>) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<MatchingYouTubePlayer | null>(null);
  const intervalRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(startSeconds);

  useEffect(() => {
    let cancelled = false;

    const syncPlayerState = () => {
      const player = playerRef.current;
      if (!player) {
        return;
      }

      const nextDuration =
        typeof player.getDuration === "function"
          ? Math.max(player.getDuration() || 0, 0)
          : 0;
      const nextPosition =
        typeof player.getCurrentTime === "function"
          ? Math.max(player.getCurrentTime() || 0, 0)
          : 0;
      const state =
        typeof player.getPlayerState === "function" ? player.getPlayerState() : -1;

      setDuration(nextDuration);
      setPosition(nextPosition);
      setPlaying(state === 1 || state === 3);
    };

    void loadMatchingYouTubeApi()
      .then((yt) => {
        if (cancelled || !hostRef.current) {
          return;
        }

        playerRef.current = new yt.Player(hostRef.current, {
          height: "1",
          width: "1",
          videoId,
          playerVars: {
            autoplay: 1,
            controls: 0,
            playsinline: 1,
            rel: 0,
            start: startSeconds,
          },
          events: {
            onReady: ({ target }) => {
              if (cancelled) {
                return;
              }

              if (startSeconds > 0) {
                target.seekTo(startSeconds, true);
              }
              target.setVolume?.(volume);
              target.playVideo();
              setReady(true);
              syncPlayerState();
            },
            onStateChange: () => {
              if (cancelled) {
                return;
              }
              syncPlayerState();
            },
          },
        });

        intervalRef.current = window.setInterval(syncPlayerState, 400);
      })
      .catch(() => {
        setReady(false);
      });

    return () => {
      cancelled = true;
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
        playerRef.current?.destroy();
        playerRef.current = null;
      };
  }, [startSeconds, videoId, volume]);

  const handleToggle = () => {
    const player = playerRef.current;
    if (!player) {
      return;
    }

    if (playing) {
      player.pauseVideo();
      setPlaying(false);
      return;
    }

    player.playVideo();
    setPlaying(true);
  };

  return (
    <div className="matching-youtube-audio">
      <div className="matching-youtube-audio__host" aria-hidden="true">
        <div ref={hostRef} />
      </div>
      <div className="matching-youtube-audio__controls">
        <button
          className="player-button"
          disabled={!ready}
          type="button"
          onClick={handleToggle}
        >
          {ready ? (playing ? "Пауза" : "Слушать") : "Загрузка..."}
        </button>
        <input
          className="matching-youtube-audio__range"
          disabled={!ready || duration <= 0}
          max={Math.max(duration, startSeconds, 1)}
          min={0}
          step={1}
          type="range"
          value={Math.min(position, Math.max(duration, startSeconds, 1))}
          onChange={(event) => {
            const next = Number.parseFloat(event.target.value);
            setPosition(next);
            playerRef.current?.seekTo(next, true);
          }}
        />
        <span className="matching-youtube-audio__time">
          {formatMatchingMediaTime(position)} / {formatMatchingMediaTime(duration)}
        </span>
      </div>
    </div>
  );
}

function MatchingMediaDialog({
  media,
  onClose,
}: Readonly<{
  media: MatchingPlayableContent | null;
  onClose: () => void;
}>) {
  useEffect(() => {
    if (!media) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [media, onClose]);

  if (!media) {
    return null;
  }

  const audioServiceMeta =
    media.kind === "audio" ? getMatchingYouTubeMeta(media.url) : null;
  const embeddedVideoMeta =
    media.kind === "video" ? getMatchingEmbeddedVideoMeta(media.url) : null;
  const canPlayAudio = media.kind === "audio" ? isMatchingAudioPlayable(media.url) : false;
  const audioVolume =
    media.kind === "audio" ? getMatchingAudioVolume(media) : 100;
  const videoVolume =
    media.kind === "video" ? getMatchingVideoVolume(media) : 100;
  const startSeconds =
    media.kind === "video"
      ? getMatchingVideoStartSeconds(media) || embeddedVideoMeta?.startSeconds || 0
      : audioServiceMeta?.startSeconds || 0;
  const title = media.label || (media.kind === "audio" ? "Аудио" : "Видео");

  return (
    <div
      className="matching-media-modal"
      data-card-interactive="true"
      role="presentation"
      onClick={onClose}
    >
      <div
        className={`matching-media-modal__dialog ${
          media.kind === "audio" ? "matching-media-modal__dialog--audio" : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="matching-media-modal__head">
          <div className="stack">
            <span className="tag">{media.kind === "audio" ? "AUD" : "VID"}</span>
            <strong>{title}</strong>
            <span className="matching-card-url">
              {getMatchingMediaSourceLabel(media.url)}
              {startSeconds > 0 ? ` · старт ${startSeconds} c` : ""}
            </span>
          </div>
          <button
            className="ghost-button"
            data-card-interactive="true"
            type="button"
            onClick={onClose}
          >
            Закрыть
          </button>
        </div>

        <div className="matching-media-modal__body">
          {media.kind === "audio" && !canPlayAudio ? (
            <div className="matching-card-placeholder">
              Источник не удалось открыть как аудио.
            </div>
          ) : media.kind === "audio" && audioServiceMeta?.videoId ? (
            <MatchingYouTubeAudioPlayer
              startSeconds={startSeconds}
              videoId={audioServiceMeta.videoId}
              volume={audioVolume}
            />
          ) : embeddedVideoMeta ? (
            <>
              <div className="matching-media-modal__frame-wrap">
                <iframe
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="matching-media-modal__frame"
                  referrerPolicy="strict-origin-when-cross-origin"
                  src={embeddedVideoMeta.embedUrl}
                  title={title}
                />
              </div>
              {media.kind === "audio" ? (
                <p className="editor-hint">
                  Источник открыт встроенным плеером видеосервиса, потому что
                  сама ссылка ведет на страницу с видео.
                </p>
              ) : null}
            </>
          ) : media.kind === "audio" ? (
            <audio
              autoPlay
              className="matching-media-modal__audio"
              controls
              key={`${media.kind}:${media.url}`}
              preload="auto"
              src={media.url}
              onLoadedMetadata={(event) => {
                event.currentTarget.volume = audioVolume / 100;
              }}
            >
              Ваш браузер не поддерживает воспроизведение аудио.
            </audio>
          ) : (
            <video
              autoPlay
              className="matching-media-modal__video"
              controls
              key={`${media.kind}:${media.url}:${startSeconds}`}
              playsInline
              preload="auto"
              onLoadedMetadata={(event) => {
                const element = event.currentTarget;
                element.volume = videoVolume / 100;
                if (startSeconds > 0) {
                  const maxStart = Number.isFinite(element.duration)
                    ? Math.max(element.duration - 0.1, 0)
                    : startSeconds;
                  element.currentTime = Math.min(startSeconds, maxStart);
                }
                void element.play().catch(() => {});
              }}
            >
              <source
                src={media.url}
                type={getMatchingMediaType("video", media.url)}
              />
              Ваш браузер не поддерживает воспроизведение видео.
            </video>
          )}
        </div>
      </div>
    </div>
  );
}

function MatchingPairsActivity({
  draft,
  onReport,
  boardOnly = false,
}: ActivityProps<"matching-pairs">) {
  const normalized = normalizeMatchingPairsData(draft.data);
  const totalPairs = normalized.pairs.length;
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [boardSize, setBoardSize] = useState<MatchingBoardSize>({
    width: MATCHING_BOARD_DEFAULT_WIDTH,
    height: MATCHING_BOARD_DEFAULT_HEIGHT,
  });
  const [cards, setCards] = useState(() =>
    createMatchingCards(draft.data, {
      width: MATCHING_BOARD_DEFAULT_WIDTH,
      height: MATCHING_BOARD_DEFAULT_HEIGHT,
    }),
  );
  const [solvedPairs, setSolvedPairs] = useState<Set<number>>(new Set());
  const [hasChecked, setHasChecked] = useState(false);
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const [activeMedia, setActiveMedia] = useState<MatchingPlayableContent | null>(
    null,
  );
  const dragRef = useRef<{
    pointerId: number;
    groupId: string;
    positions: Record<string, { x: number; y: number }>;
    startX: number;
    startY: number;
  } | null>(null);
  const boardMetrics = useMemo(
    () => getMatchingBoardMetrics(boardSize),
    [boardSize.height, boardSize.width],
  );

  useEffect(() => {
    const node = boardRef.current;
    if (!node) {
      return;
    }

    const updateBoardSize = () => {
      const nextSize = {
        width: node.clientWidth || MATCHING_BOARD_DEFAULT_WIDTH,
        height: node.clientHeight || MATCHING_BOARD_DEFAULT_HEIGHT,
      };

      setBoardSize((current) =>
        current.width === nextSize.width && current.height === nextSize.height
          ? current
          : nextSize,
      );
    };

    updateBoardSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateBoardSize);
      return () => window.removeEventListener("resize", updateBoardSize);
    }

    const observer = new ResizeObserver(() => updateBoardSize());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setCards(createMatchingCards(draft.data, boardSize));
    setSolvedPairs(new Set());
    setHasChecked(false);
    setDraggingGroupId(null);
    setActiveMedia(null);
    dragRef.current = null;
  }, [boardSize.height, boardSize.width, draft.data]);

  useEffect(() => {
    if (!normalized.autoRemoveCorrectPairs) {
      return;
    }

    const outcome = stripSolvedMatchingGroups(cards);
    if (outcome.solvedPairIndexes.size === 0) {
      return;
    }

    setSolvedPairs((current) => {
      const next = new Set(current);
      outcome.solvedPairIndexes.forEach((pairIndex) => next.add(pairIndex));
      return next;
    });
    setCards(outcome.cards);
  }, [cards, normalized.autoRemoveCorrectPairs]);

  useEffect(() => {
    if (solvedPairs.size === totalPairs && totalPairs > 0) {
      onReport(100, true);
    }
  }, [onReport, solvedPairs, totalPairs]);

  const getCardBounds = (card: Pick<MatchingDragCard, "height" | "width">) => ({
    minX: boardMetrics.minInset,
    maxX: Math.max(
      boardMetrics.minInset,
      boardMetrics.width - card.width - boardMetrics.minInset,
    ),
    minY: boardMetrics.minInset,
    maxY: Math.max(
      boardMetrics.minInset,
      boardMetrics.bottomLimit - card.height,
    ),
  });

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
            const movedCenterX = movedCard.x + movedCard.width / 2;
            const movedCenterY = movedCard.y + movedCard.height / 2;
            const candidateCenterX = candidate.x + candidate.width / 2;
            const candidateCenterY = candidate.y + candidate.height / 2;
            const distance = Math.hypot(
              movedCenterX - candidateCenterX,
              movedCenterY - candidateCenterY,
            );
            const mergeDistance = Math.max(
              150,
              Math.min(
                boardMetrics.columnWidth,
                (movedCard.width + candidate.width) / 2 + 44,
              ),
            );

            return {
              movedCard,
              candidate,
              movedGroup,
              candidateGroup,
              distance,
              mergeDistance,
              canMerge:
                candidate.side !== movedCard.side &&
                movedGroup.length === 1 &&
                candidateGroup.length === 1 &&
                leftCount <= 1 &&
                rightCount <= 1,
            };
          }),
      )
      .filter((entry) => entry.canMerge && entry.distance < entry.mergeDistance)
      .sort((left, right) => left.distance - right.distance)[0];

    if (!match) {
      return nextCards;
    }

    const leftCard =
      match.movedCard.side === "left" ? match.movedCard : match.candidate;
    const rightCard =
      match.movedCard.side === "right" ? match.movedCard : match.candidate;
    const groupId = `paired-${leftCard.id}-${rightCard.id}`;
    const pairGap = Math.max(12, Math.round(MATCHING_CARD_GAP * 0.9));
    const leftMoved = leftCard.groupId === movedGroupId;
    const leftX =
      normalized.pairAlignment === "horizontal"
        ? leftMoved
          ? leftCard.x
          : rightCard.x - leftCard.width - pairGap
        : leftMoved
          ? leftCard.x
          : rightCard.x;
    const topY =
      normalized.pairAlignment === "horizontal"
        ? leftMoved
          ? leftCard.y
          : rightCard.y
        : leftMoved
          ? leftCard.y
          : rightCard.y - leftCard.height - pairGap;
    const maxLeftX =
      normalized.pairAlignment === "horizontal"
        ? Math.max(
            boardMetrics.minInset,
            boardMetrics.width -
              leftCard.width -
              pairGap -
              rightCard.width -
              boardMetrics.minInset,
          )
        : Math.max(
            boardMetrics.minInset,
            boardMetrics.width -
              Math.max(leftCard.width, rightCard.width) -
              boardMetrics.minInset,
          );
    const maxLeftY =
      normalized.pairAlignment === "horizontal"
        ? Math.max(
            boardMetrics.minInset,
            boardMetrics.bottomLimit -
              Math.max(leftCard.height, rightCard.height),
          )
        : Math.max(
            boardMetrics.minInset,
            boardMetrics.bottomLimit -
              leftCard.height -
              pairGap -
              rightCard.height,
          );
    const clampedX = clamp(leftX, boardMetrics.minInset, maxLeftX);
    const clampedY = clamp(topY, boardMetrics.minInset, maxLeftY);

    return nextCards.map((card) => {
      if (card.id === leftCard.id) {
        return {
          ...card,
          groupId,
          x: clampedX,
          y: clampedY,
        };
      }

      if (card.id === rightCard.id) {
        return {
          ...card,
          groupId,
          x:
            normalized.pairAlignment === "horizontal"
              ? clampedX + leftCard.width + pairGap
              : clampedX,
          y:
            normalized.pairAlignment === "horizontal"
              ? clampedY
              : clampedY + leftCard.height + pairGap,
        };
      }

      return card;
    });
  };

  const ungroupCards = (groupId: string) => {
    setHasChecked(false);
    setCards((current) =>
      current.map((card) =>
        card.groupId === groupId
          ? {
              ...card,
              groupId: `group-${card.id}`,
            }
          : card,
      ),
    );
  };

  const groupStatuses = useMemo(() => buildMatchingGroupStatuses(cards), [cards]);
  const groupConnectors = useMemo(
    () =>
      Array.from(collectMatchingGroups(cards).entries())
        .filter(([, groupCards]) => groupCards.length === 2)
        .map(([groupId, groupCards]) => {
          const [first, second] = groupCards;
          return {
            groupId,
            status: getMatchingGroupStatus(groupCards),
            x: (first.x + first.width / 2 + second.x + second.width / 2) / 2,
            y:
              (first.y +
                first.height / 2 +
                second.y +
                second.height / 2) /
              2,
          };
        }),
    [cards],
  );
  const showGroupFeedback = normalized.showImmediateFeedback || hasChecked;

  const beginDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    card: MatchingDragCard,
  ) => {
    if (isMatchingInteractiveTarget(event.target)) {
      return;
    }

    event.preventDefault();
    setHasChecked(false);
    event.currentTarget.setPointerCapture(event.pointerId);
    const groupCards = cards.filter((groupCard) => groupCard.groupId === card.groupId);
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
  };

  const handleCheck = () => {
    const correct = solvedPairs.size + countVisibleCorrectPairs(cards);
    const score = percentage(correct, totalPairs);
    setHasChecked(true);
    onReport(score, correct === totalPairs);
  };

  const boardCorrect = solvedPairs.size + countVisibleCorrectPairs(cards);
  const boardScore = percentage(boardCorrect, totalPairs);
  const boardSolved = boardCorrect === totalPairs && totalPairs > 0;
  const showBoardStatus = hasChecked || boardSolved;
  const boardStatusDetail = boardSolved
    ? draft.successMessage
    : `\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442: ${boardScore}%`;

  return (
    <div className="stack matching-pairs-stack">
      <div
        className={`matching-activity-surface ${
          boardOnly ? "matching-activity-surface--board-only" : ""
        }`}
      >
        <div
          className="matching-drag-board"
          ref={boardRef}
        >
        {cards.map((card) => {
          const normalizedCardContent = normalizeMatchingSide(card.content);
          return (
            <div
              className={`matching-drag-card ${
                card.side === "right" ? "matching-drag-card--right" : ""
              } ${draggingGroupId === card.groupId ? "matching-drag-card--dragging" : ""} ${
                normalized.colorByGroup && card.side === "left"
                  ? "matching-drag-card--group-left"
                  : ""
              } ${
                normalized.colorByGroup && card.side === "right"
                  ? "matching-drag-card--group-right"
                  : ""
              } ${
                groupStatuses.get(card.groupId) === "correct" && showGroupFeedback
                  ? "matching-drag-card--paired"
                  : ""
              } ${
                groupStatuses.get(card.groupId) === "correct" && showGroupFeedback
                  ? "matching-drag-card--correct"
                  : ""
              } ${
                groupStatuses.get(card.groupId) === "incorrect" && showGroupFeedback
                  ? "matching-drag-card--incorrect"
                  : ""
              }`}
              key={card.id}
              role="group"
              aria-label={getMatchingContentAriaLabel(normalizedCardContent)}
              style={{
                left: `${card.x}px`,
                top: `${card.y}px`,
                width: `${card.width}px`,
                height: `${card.height}px`,
              }}
              onPointerDown={(event) => beginDrag(event, card)}
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

                    const bounds = getCardBounds(currentCard);
                    return {
                      ...currentCard,
                      x: clamp(initialPosition.x + deltaX, bounds.minX, bounds.maxX),
                      y: clamp(initialPosition.y + deltaY, bounds.minY, bounds.maxY),
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
                setCards((current) => snapIfMatched(current, currentDrag.groupId));
                dragRef.current = null;
                setDraggingGroupId(null);
              }}
              onPointerCancel={() => {
                dragRef.current = null;
                setDraggingGroupId(null);
              }}
            >
              <div className="matching-drag-card__toolbar">
                <span
                  className={`matching-drag-card__side matching-drag-card__side--${
                    card.side === "left" ? "left" : "right"
                  }`}
                >
                  {card.side === "left" ? "A" : "B"}
                </span>
              </div>
              <MatchingCardContent
                cardHeight={card.height}
                content={normalizedCardContent}
                onOpenMedia={setActiveMedia}
              />
            </div>
          );
        })}
        {groupConnectors.map((connector) => (
          <button
            className={`matching-drag-connector ${
              connector.status === "correct" && showGroupFeedback
                ? "matching-drag-connector--correct"
                : ""
            } ${
              connector.status === "incorrect" && showGroupFeedback
                ? "matching-drag-connector--incorrect"
                : ""
            }`}
            data-card-interactive="true"
            key={connector.groupId}
            style={{
              left: `${connector.x}px`,
              top: `${connector.y}px`,
            }}
            type="button"
            onClick={() => ungroupCards(connector.groupId)}
          >
            ×
          </button>
        ))}
        <div className="matching-drag-board__controls" data-card-interactive="true">
          <PlayerButton
            aria-label={"\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C"}
            className="matching-drag-board__button matching-drag-board__button--check"
            onClick={handleCheck}
          >
            {"\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C"}
          </PlayerButton>
          <button
            aria-label={"\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0438"}
            className="ghost-button matching-drag-board__button matching-drag-board__button--reset"
            type="button"
            onClick={() => {
              setCards(createMatchingCards(draft.data, boardSize));
              setSolvedPairs(new Set());
              setHasChecked(false);
              setDraggingGroupId(null);
              setActiveMedia(null);
              dragRef.current = null;
            }}
          >
            РЎР±СЂРѕСЃРёС‚СЊ РєР°СЂС‚РѕС‡РєРё
          </button>
          {showBoardStatus ? (
            <div
              className={`matching-drag-board__status ${
                boardSolved ? "matching-drag-board__status--success" : ""
              }`}
            >
              <strong>{`${boardScore}%`}</strong>
              <span>{boardStatusDetail}</span>
            </div>
          ) : null}
        </div>
      </div>
      {!boardOnly &&
      (normalized.showImmediateFeedback || normalized.autoRemoveCorrectPairs) &&
      (getEvaluatedPairGroups(cards) > 0 || solvedPairs.size > 0) ? (
        <p className="editor-hint">
          Сейчас собрано верных пар: {solvedPairs.size + countVisibleCorrectPairs(cards)}
          {" / "}
          {totalPairs}
        </p>
      ) : null}
      <ActionRow>
        <PlayerButton onClick={handleCheck}>Проверить</PlayerButton>
        <button
          className="ghost-button"
          type="button"
          onClick={() => {
            setCards(createMatchingCards(draft.data, boardSize));
            setSolvedPairs(new Set());
            setHasChecked(false);
            setDraggingGroupId(null);
            setActiveMedia(null);
            dragRef.current = null;
          }}
        >
          Сбросить
        </button>
      </ActionRow>
      </div>
      <MatchingMediaDialog media={activeMedia} onClose={() => setActiveMedia(null)} />
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
  boardOnly = false,
) {
  switch (draft.type) {
    case "matching-pairs":
      return (
        <MatchingPairsActivity
          boardOnly={boardOnly}
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
  compactHead = false,
  instructionOverride,
  bodyOverlay,
  boardOnly = false,
}: Readonly<{
  draft: AnyExerciseDraft;
  fullscreen?: boolean;
  compactHead?: boolean;
  instructionOverride?: string;
  bodyOverlay?: ReactNode;
  boardOnly?: boolean;
}>) {
  const [status, setStatus] = useState<{
    score: number;
    solved: boolean;
    detail: string;
  } | null>(null);
  const revisionKey = `${draft.type}:${JSON.stringify(draft.data)}`;
  const themeStyle = useMemo(
    () => getExerciseThemeStyle(draft.themeColor),
    [draft.themeColor],
  );
  const instructionsText = instructionOverride ?? draft.instructions;
  const showInstructions = compactHead ? Boolean(instructionOverride) : Boolean(instructionsText);

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
      } ${boardOnly ? "exercise-player--board-only" : ""}`}
      style={themeStyle}
    >
      {!boardOnly ? <div className="exercise-player__head">
        {!compactHead ? <span className="eyebrow">Тип: {draft.type}</span> : null}
        <h1>{draft.title}</h1>
        <p>{draft.description}</p>
        {showInstructions ? (
          <div className="player-instructions">{instructionsText}</div>
        ) : null}
      </div> : null}
      <div className="exercise-player__body">
        {bodyOverlay ? (
          <div className="exercise-player__overlay">{bodyOverlay}</div>
        ) : null}
        {renderActivity(draft, revisionKey, reportResult, boardOnly)}
      </div>
      {status && !boardOnly && draft.type !== "matching-pairs" ? (
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
