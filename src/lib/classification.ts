import {
  createMatchingContent,
  getMatchingContentSummary,
  normalizeMatchingSide,
} from "@/lib/matching-pairs";
import type {
  ClassificationCardDisplayMode,
  ClassificationCardOrder,
  ClassificationGroup,
  ClassificationGroupBackground,
  GroupAssignmentData,
  MatchingContent,
  MatchingImageContent,
  MatchingPairSide,
  MatchingTextContent,
} from "@/lib/types";

export const CLASSIFICATION_MIN_GROUPS = 1;
export const CLASSIFICATION_MAX_GROUPS = 12;
export const CLASSIFICATION_MAX_ITEMS_PER_GROUP = 10;

type LegacyGroupAssignmentData = {
  groups?: Array<{ name?: unknown }>;
  items?: Array<{ label?: unknown; groupIndex?: unknown }>;
};

function getTextFromMatchingContent(content: MatchingContent) {
  switch (content.kind) {
    case "text":
    case "spoken-text":
      return content.text;
    case "image":
      return content.alt || content.url;
    case "audio":
    case "video":
      return content.label || content.url;
    default:
      return "";
  }
}

function hasMatchingContentValue(content: MatchingContent) {
  switch (content.kind) {
    case "text":
    case "spoken-text":
      return Boolean(content.text.trim());
    case "image":
      return Boolean(content.url.trim() || content.alt.trim());
    case "audio":
    case "video":
      return Boolean(content.url.trim() || content.label.trim());
    default:
      return false;
  }
}

export function createClassificationBackground(
  text = "",
): ClassificationGroupBackground {
  return {
    kind: "text",
    text,
    size: 232,
  };
}

export function createClassificationItem(): MatchingPairSide {
  return createMatchingContent("text");
}

export function createClassificationGroup(
  backgroundText = "",
): ClassificationGroup {
  return {
    background: createClassificationBackground(backgroundText),
    items: [createClassificationItem()],
  };
}

export function createClassificationData(): GroupAssignmentData {
  return {
    groups: [
      {
        background: createClassificationBackground("Фрукты"),
        items: [
          {
            kind: "text",
            text: "Яблоко",
            size: 232,
          },
          {
            kind: "text",
            text: "Груша",
            size: 232,
          },
        ],
      },
      {
        background: createClassificationBackground("Овощи"),
        items: [
          {
            kind: "text",
            text: "Морковь",
            size: 232,
          },
          {
            kind: "text",
            text: "Огурец",
            size: 232,
          },
        ],
      },
    ],
    cardDisplayMode: "sequential",
    cardOrder: "random",
    useGroupColors: true,
  };
}

export function normalizeClassificationBackground(
  input: ClassificationGroupBackground,
): MatchingTextContent | MatchingImageContent {
  const normalized = normalizeMatchingSide(input);

  if (normalized.kind === "image") {
    return normalized;
  }

  return {
    kind: "text",
    text: getTextFromMatchingContent(normalized),
    size: normalized.kind === "text" ? normalized.size : 232,
  };
}

function normalizeClassificationGroup(
  input: unknown,
  fallbackIndex: number,
): ClassificationGroup {
  if (!input || typeof input !== "object") {
    return createClassificationGroup(`Группа ${fallbackIndex + 1}`);
  }

  const raw = input as Partial<ClassificationGroup> & { name?: unknown };
  const sourceBackground =
    raw.background ??
    (typeof raw.name === "string" ? createClassificationBackground(raw.name) : null);
  const sourceItems = Array.isArray(raw.items) ? raw.items : [];
  const items = sourceItems
    .slice(0, CLASSIFICATION_MAX_ITEMS_PER_GROUP)
    .map((item) => normalizeMatchingSide(item));

  return {
    background: normalizeClassificationBackground(
      sourceBackground ?? createClassificationBackground(`Группа ${fallbackIndex + 1}`),
    ),
    items: items.length > 0 ? items : [createClassificationItem()],
  };
}

function normalizeLegacyGroupAssignmentData(
  data: LegacyGroupAssignmentData,
): GroupAssignmentData | null {
  if (!Array.isArray(data.groups) || !Array.isArray(data.items)) {
    return null;
  }

  const looksLegacy = data.groups.every(
    (group) =>
      !group ||
      typeof group !== "object" ||
      (!("background" in group) && !("items" in group)),
  );

  if (!looksLegacy) {
    return null;
  }

  const groups = data.groups
    .slice(0, CLASSIFICATION_MAX_GROUPS)
    .map((group, index) =>
      createClassificationGroup(
        typeof group?.name === "string" && group.name.trim()
          ? group.name.trim()
          : `Группа ${index + 1}`,
      ),
    );

  if (groups.length === 0) {
    return null;
  }

  for (const item of data.items) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const groupIndex =
      typeof item.groupIndex === "number" && Number.isInteger(item.groupIndex)
        ? item.groupIndex
        : -1;
    const label =
      typeof item.label === "string" && item.label.trim() ? item.label.trim() : "";

    if (!label || groupIndex < 0 || groupIndex >= groups.length) {
      continue;
    }

    if (groups[groupIndex].items.length >= CLASSIFICATION_MAX_ITEMS_PER_GROUP) {
      continue;
    }

    if (
      groups[groupIndex].items.length === 1 &&
      !hasMatchingContentValue(normalizeMatchingSide(groups[groupIndex].items[0]))
    ) {
      groups[groupIndex].items = [];
    }

    groups[groupIndex].items.push({
      kind: "text",
      text: label,
      size: 232,
    });
  }

  return {
    groups: groups.map((group) => ({
      ...group,
      items: group.items.length > 0 ? group.items : [createClassificationItem()],
    })),
    cardDisplayMode: "sequential",
    cardOrder: "random",
    useGroupColors: true,
  };
}

export function normalizeGroupAssignmentData(
  data: GroupAssignmentData,
): GroupAssignmentData {
  const legacy = normalizeLegacyGroupAssignmentData(data as LegacyGroupAssignmentData);
  if (legacy) {
    return legacy;
  }

  const groupsSource = Array.isArray(data.groups) ? data.groups : [];
  const groups = groupsSource
    .slice(0, CLASSIFICATION_MAX_GROUPS)
    .map((group, index) => normalizeClassificationGroup(group, index));

  const normalizedGroups =
    groups.length >= CLASSIFICATION_MIN_GROUPS
      ? groups
      : createClassificationData().groups;

  const cardDisplayMode: ClassificationCardDisplayMode =
    data.cardDisplayMode === "all-at-once" ? "all-at-once" : "sequential";
  const cardOrder: ClassificationCardOrder =
    data.cardOrder === "rounds" ? "rounds" : "random";

  return {
    groups: normalizedGroups,
    cardDisplayMode,
    cardOrder,
    useGroupColors:
      typeof data.useGroupColors === "boolean" ? data.useGroupColors : true,
  };
}

export function getClassificationGroupTitle(
  group: ClassificationGroup,
  index: number,
) {
  const background = normalizeClassificationBackground(group.background);
  const label = getMatchingContentSummary(background).trim();
  return label || `Группа ${index + 1}`;
}
