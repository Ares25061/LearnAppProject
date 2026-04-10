import type {
  MatchingAudioContent,
  MatchingContent,
  MatchingContentKind,
  MatchingConnectorStyle,
  MatchingExtraItem,
  MatchingExtraSide,
  MatchingImageContent,
  MatchingPairsData,
  MatchingPairAlignment,
  MatchingPairItem,
  MatchingPairSide,
  MatchingSpokenTextContent,
  MatchingTextContent,
  MatchingVideoContent,
} from "@/lib/types";

export const MATCHING_IMAGE_HEIGHT_MIN = 50;
export const MATCHING_IMAGE_HEIGHT_MAX = 500;
export const MATCHING_TEXT_SIZE_DEFAULT = 232;
export const MATCHING_SPOKEN_TEXT_SIZE_DEFAULT = 232;
export const MATCHING_IMAGE_HEIGHT_DEFAULT = 204;
export const MATCHING_AUDIO_SIZE_MIN = 50;
export const MATCHING_AUDIO_SIZE_MAX = 500;
export const MATCHING_AUDIO_SIZE_DEFAULT = 110;
export const MATCHING_VIDEO_SIZE_MIN = 50;
export const MATCHING_VIDEO_SIZE_MAX = 500;
export const MATCHING_VIDEO_SIZE_DEFAULT = 220;
export const MATCHING_VIDEO_START_DEFAULT = 0;
export const MATCHING_AUDIO_VOLUME_DEFAULT = 10;

export function normalizeMatchingSize(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(
    MATCHING_IMAGE_HEIGHT_MAX,
    Math.max(MATCHING_IMAGE_HEIGHT_MIN, Math.round(value)),
  );
}
export const matchingContentOptions: Array<{
  id: MatchingContentKind;
  label: string;
  shortLabel: string;
  hint: string;
}> = [
  {
    id: "text",
    label: "\u0422\u0435\u043a\u0441\u0442",
    shortLabel: "TXT",
    hint: "\u041e\u0431\u044b\u0447\u043d\u0430\u044f \u0442\u0435\u043a\u0441\u0442\u043e\u0432\u0430\u044f \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0430.",
  },
  {
    id: "spoken-text",
    label: "\u0422\u0435\u043a\u0441\u0442 \u0432 \u0440\u0435\u0447\u044c",
    shortLabel: "TTS",
    hint: "\u0422\u0435\u043a\u0441\u0442 \u0441 \u043a\u043d\u043e\u043f\u043a\u043e\u0439 \u043e\u0437\u0432\u0443\u0447\u0438\u0432\u0430\u043d\u0438\u044f \u0438 \u043f\u0440\u0435\u0432\u044c\u044e.",
  },
  {
    id: "image",
    label: "\u041a\u0430\u0440\u0442\u0438\u043d\u043a\u0430",
    shortLabel: "IMG",
    hint: "\u0418\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435 \u043f\u043e URL \u0438\u043b\u0438 \u0438\u0437 \u0444\u0430\u0439\u043b\u0430, \u043f\u043e\u0434\u043f\u0438\u0441\u044c \u0438 \u0440\u0430\u0437\u043c\u0435\u0440.",
  },
  {
    id: "audio",
    label: "\u0410\u0443\u0434\u0438\u043e",
    shortLabel: "AUD",
    hint: "\u0421\u0441\u044b\u043b\u043a\u0430 \u0438\u043b\u0438 \u0444\u0430\u0439\u043b mp3/mp4, \u043f\u043e\u0434\u043f\u0438\u0441\u044c, \u0433\u0440\u043e\u043c\u043a\u043e\u0441\u0442\u044c \u0438 \u0440\u0430\u0437\u043c\u0435\u0440.",
  },
  {
    id: "video",
    label: "\u0412\u0438\u0434\u0435\u043e",
    shortLabel: "VID",
    hint: "\u0412\u0438\u0434\u0435\u043e\u0444\u0430\u0439\u043b \u0438\u043b\u0438 \u0441\u0441\u044b\u043b\u043a\u0430 \u043f\u043e URL, \u043f\u043e\u0434\u043f\u0438\u0441\u044c, \u0441\u0442\u0430\u0440\u0442 \u0438 \u0440\u0430\u0437\u043c\u0435\u0440.",
  },
];

export function createMatchingContent(
  kind: MatchingContentKind = "text",
): MatchingContent {
  switch (kind) {
    case "spoken-text":
      return {
        kind,
        text: "",
        size: MATCHING_SPOKEN_TEXT_SIZE_DEFAULT,
      } satisfies MatchingSpokenTextContent;
    case "image":
      return {
        kind,
        url: "",
        alt: "",
        fileName: "",
        size: MATCHING_IMAGE_HEIGHT_DEFAULT,
      } satisfies MatchingImageContent;
    case "audio":
      return {
        kind,
        url: "",
        label: "",
        volume: MATCHING_AUDIO_VOLUME_DEFAULT,
        fileName: "",
        size: MATCHING_AUDIO_SIZE_DEFAULT,
      } satisfies MatchingAudioContent;
    case "video":
      return {
        kind,
        url: "",
        label: "",
        startSeconds: MATCHING_VIDEO_START_DEFAULT,
        volume: MATCHING_AUDIO_VOLUME_DEFAULT,
        fileName: "",
        size: MATCHING_VIDEO_SIZE_DEFAULT,
      } satisfies MatchingVideoContent;
    case "text":
    default:
      return {
        kind: "text",
        text: "",
        size: MATCHING_TEXT_SIZE_DEFAULT,
      } satisfies MatchingTextContent;
  }
}

export function createMatchingPair() {
  return {
    left: createMatchingContent("text"),
    right: createMatchingContent("text"),
  } satisfies MatchingPairItem;
}

export function createMatchingExtra(
  side: MatchingExtraSide = "right",
): MatchingExtraItem {
  return {
    content: createMatchingContent("text"),
    side,
  };
}

export function normalizeMatchingSide(input: MatchingPairSide): MatchingContent {
  if (typeof input === "string") {
    return {
      kind: "text",
      text: input,
      size: MATCHING_TEXT_SIZE_DEFAULT,
    };
  }

  if (!input || typeof input !== "object" || !("kind" in input)) {
    return createMatchingContent("text");
  }

  switch (input.kind) {
    case "text":
      return {
        kind: "text",
        text: typeof input.text === "string" ? input.text : "",
        size: normalizeMatchingSize(
          input.size,
          MATCHING_TEXT_SIZE_DEFAULT,
        ),
      };
    case "spoken-text":
      return {
        kind: "spoken-text",
        text: typeof input.text === "string" ? input.text : "",
        size: normalizeMatchingSize(
          input.size,
          MATCHING_SPOKEN_TEXT_SIZE_DEFAULT,
        ),
      };
    case "image":
      return {
        kind: "image",
        url: typeof input.url === "string" ? input.url : "",
        alt: typeof input.alt === "string" ? input.alt : "",
        fileName: typeof input.fileName === "string" ? input.fileName : "",
        size: normalizeMatchingSize(
          typeof input.size === "number"
            ? input.size
            : (input as { imageHeight?: unknown }).imageHeight,
          MATCHING_IMAGE_HEIGHT_DEFAULT,
        ),
      };
    case "audio":
      return {
        kind: "audio",
        url: typeof input.url === "string" ? input.url : "",
        label: typeof input.label === "string" ? input.label : "",
        fileName: typeof input.fileName === "string" ? input.fileName : "",
        volume:
          typeof input.volume === "number" && Number.isFinite(input.volume)
            ? Math.min(100, Math.max(0, Math.round(input.volume)))
            : MATCHING_AUDIO_VOLUME_DEFAULT,
        size: normalizeMatchingSize(
          input.size,
          MATCHING_AUDIO_SIZE_DEFAULT,
        ),
      };
    case "video":
      return {
        kind: "video",
        url: typeof input.url === "string" ? input.url : "",
        label: typeof input.label === "string" ? input.label : "",
        fileName: typeof input.fileName === "string" ? input.fileName : "",
        startSeconds:
          typeof input.startSeconds === "number" && Number.isFinite(input.startSeconds)
            ? Math.max(MATCHING_VIDEO_START_DEFAULT, Math.round(input.startSeconds))
            : MATCHING_VIDEO_START_DEFAULT,
        volume:
          typeof input.volume === "number" && Number.isFinite(input.volume)
            ? Math.min(100, Math.max(0, Math.round(input.volume)))
            : MATCHING_AUDIO_VOLUME_DEFAULT,
        size: normalizeMatchingSize(
          input.size,
          MATCHING_VIDEO_SIZE_DEFAULT,
        ),
      };
    default:
      return createMatchingContent("text");
  }
}

export function normalizeMatchingPairsData(data: MatchingPairsData) {
  const sourcePairs = Array.isArray(data.pairs) ? data.pairs : [];
  const pairs = sourcePairs.map((pair) => ({
    left: normalizeMatchingSide(pair.left),
    right: normalizeMatchingSide(pair.right),
  }));
  const sourceExtras = Array.isArray(data.extras) ? data.extras : [];
  const extras = sourceExtras.map((item) => ({
    content: normalizeMatchingSide(
      item && typeof item === "object" && "content" in item
        ? item.content
        : createMatchingContent("text"),
    ),
    side:
      item && typeof item === "object" && item.side === "left" ? "left" : "right",
  })) satisfies MatchingExtraItem[];

  const pairAlignment: MatchingPairAlignment =
    data.pairAlignment === "vertical" ? "vertical" : "horizontal";
  const connectorStyle: MatchingConnectorStyle =
    data.connectorStyle === "band" ||
    data.connectorStyle === "dots" ||
    data.connectorStyle === "clip" ||
    data.connectorStyle === "circle"
      ? data.connectorStyle
      : "tape";

  return {
    pairs: pairs.length > 0 ? pairs : [createMatchingPair()],
    extras,
    pairAlignment,
    connectorStyle,
    showImmediateFeedback: Boolean(data.showImmediateFeedback),
    autoRemoveCorrectPairs: Boolean(data.autoRemoveCorrectPairs),
    colorByGroup: Boolean(data.colorByGroup),
  };
}

export function getMatchingContentSummary(input: MatchingPairSide) {
  const content = normalizeMatchingSide(input);

  switch (content.kind) {
    case "text":
      return content.text.trim() || "\u0422\u0435\u043A\u0441\u0442 \u043D\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D";
    case "spoken-text":
      return content.text.trim() || "\u0422\u0435\u043A\u0441\u0442 \u0434\u043B\u044F \u043E\u0437\u0432\u0443\u0447\u0438\u0432\u0430\u043D\u0438\u044F \u043D\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D";
    case "image":
      return content.alt.trim() || content.url.trim() || "\u041A\u0430\u0440\u0442\u0438\u043D\u043A\u0430 \u043D\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u0430";
    case "audio":
      return content.label.trim() || content.url.trim() || "\u0410\u0443\u0434\u0438\u043E \u043D\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043E";
    case "video":
      return content.label.trim() || content.url.trim() || "\u0412\u0438\u0434\u0435\u043E \u043D\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043E";
    default:
      return "\u041F\u0443\u0441\u0442\u0430\u044F \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0430";
  }
}

export function getMatchingContentAriaLabel(input: MatchingPairSide) {
  const content = normalizeMatchingSide(input);

  switch (content.kind) {
    case "text":
      return content.text || "\u0422\u0435\u043A\u0441\u0442\u043E\u0432\u0430\u044F \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0430";
    case "spoken-text":
      return content.text || "\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0441 \u043E\u0437\u0432\u0443\u0447\u0438\u0432\u0430\u0435\u043C\u044B\u043C \u0442\u0435\u043A\u0441\u0442\u043E\u043C";
    case "image":
      return content.alt || content.url || "\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0441 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435\u043C";
    case "audio":
      return content.label || content.url || "\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0441 \u0430\u0443\u0434\u0438\u043E";
    case "video":
      return content.label || content.url || "\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0441 \u0432\u0438\u0434\u0435\u043E";
    default:
      return "\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u043F\u0430\u0440\u044B";
  }
}
