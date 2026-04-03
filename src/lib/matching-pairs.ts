import type {
  MatchingAudioContent,
  MatchingContent,
  MatchingContentKind,
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
export const MATCHING_AUDIO_VOLUME_DEFAULT = 100;

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
    label: "Текст",
    shortLabel: "TXT",
    hint: "Обычная текстовая карточка.",
  },
  {
    id: "spoken-text",
    label: "Озвученный текст",
    shortLabel: "TTS",
    hint: "Текст с кнопкой озвучивания в превью.",
  },
  {
    id: "image",
    label: "Картинка",
    shortLabel: "IMG",
    hint: "Изображение по URL или из файла, плюс подпись и размер.",
  },
  {
    id: "audio",
    label: "Аудио",
    shortLabel: "AUD",
    hint: "Ссылка или файл mp3/mp4, подпись, громкость и размер.",
  },
  {
    id: "video",
    label: "Видео",
    shortLabel: "VID",
    hint: "Видеофайл или ссылка по URL, подпись, старт и размер.",
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
        size: MATCHING_IMAGE_HEIGHT_DEFAULT,
      } satisfies MatchingImageContent;
    case "audio":
      return {
        kind,
        url: "",
        label: "",
        volume: MATCHING_AUDIO_VOLUME_DEFAULT,
        size: MATCHING_AUDIO_SIZE_DEFAULT,
      } satisfies MatchingAudioContent;
    case "video":
      return {
        kind,
        url: "",
        label: "",
        startSeconds: MATCHING_VIDEO_START_DEFAULT,
        volume: MATCHING_AUDIO_VOLUME_DEFAULT,
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

  return {
    pairs: pairs.length > 0 ? pairs : [createMatchingPair()],
    extras,
    pairAlignment,
    showImmediateFeedback: Boolean(data.showImmediateFeedback),
    autoRemoveCorrectPairs: Boolean(data.autoRemoveCorrectPairs),
    colorByGroup: Boolean(data.colorByGroup),
  };
}

export function getMatchingContentSummary(input: MatchingPairSide) {
  const content = normalizeMatchingSide(input);

  switch (content.kind) {
    case "text":
      return content.text.trim() || "Текст не заполнен";
    case "spoken-text":
      return content.text.trim() || "Текст для озвучивания не заполнен";
    case "image":
      return content.alt.trim() || content.url.trim() || "Картинка не заполнена";
    case "audio":
      return content.label.trim() || content.url.trim() || "Аудио не заполнено";
    case "video":
      return content.label.trim() || content.url.trim() || "Видео не заполнено";
    default:
      return "Пустая карточка";
  }
}

export function getMatchingContentAriaLabel(input: MatchingPairSide) {
  const content = normalizeMatchingSide(input);

  switch (content.kind) {
    case "text":
      return content.text || "Текстовая карточка";
    case "spoken-text":
      return content.text || "Карточка с озвученным текстом";
    case "image":
      return content.alt || content.url || "Карточка с изображением";
    case "audio":
      return content.label || content.url || "Карточка с аудио";
    case "video":
      return content.label || content.url || "Карточка с видео";
    default:
      return "Карточка пары";
  }
}
