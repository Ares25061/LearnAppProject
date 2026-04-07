export type ExerciseTypeId =
  | "matching-pairs"
  | "group-assignment"
  | "timeline"
  | "simple-order"
  | "free-text-input"
  | "matching-images"
  | "multiple-choice"
  | "cloze-text"
  | "media-notices"
  | "millionaire-game"
  | "group-puzzle"
  | "crossword"
  | "word-grid"
  | "where-is-what"
  | "guess-the-word"
  | "horse-race"
  | "pairing-game"
  | "guess"
  | "matching-matrix"
  | "fill-table"
  | "quiz-text-input";

export type MatchingContentKind =
  | "text"
  | "spoken-text"
  | "image"
  | "audio"
  | "video";

export interface MatchingTextContent {
  kind: "text";
  text: string;
  size: number;
}

export interface MatchingSpokenTextContent {
  kind: "spoken-text";
  text: string;
  size: number;
}

export interface MatchingImageContent {
  kind: "image";
  url: string;
  alt: string;
  fileName?: string;
  size: number;
}

export interface MatchingAudioContent {
  kind: "audio";
  url: string;
  label: string;
  volume: number;
  fileName?: string;
  size: number;
}

export interface MatchingVideoContent {
  kind: "video";
  url: string;
  label: string;
  startSeconds: number;
  volume: number;
  fileName?: string;
  size: number;
}

export type MatchingContent =
  | MatchingTextContent
  | MatchingSpokenTextContent
  | MatchingImageContent
  | MatchingAudioContent
  | MatchingVideoContent;

export type MatchingPairSide = string | MatchingContent;

export type MatchingPairAlignment = "horizontal" | "vertical";
export type MatchingConnectorStyle =
  | "tape"
  | "band"
  | "dots"
  | "clip"
  | "circle";

export type MatchingExtraSide = "left" | "right";

export interface MatchingPairItem {
  left: MatchingPairSide;
  right: MatchingPairSide;
}

export interface MatchingExtraItem {
  content: MatchingPairSide;
  side: MatchingExtraSide;
}

export interface MatchingPairsData {
  pairs: MatchingPairItem[];
  extras?: MatchingExtraItem[];
  pairAlignment?: MatchingPairAlignment;
  connectorStyle?: MatchingConnectorStyle;
  showImmediateFeedback?: boolean;
  autoRemoveCorrectPairs?: boolean;
  colorByGroup?: boolean;
}

export type ClassificationGroupBackground =
  | string
  | MatchingTextContent
  | MatchingImageContent;

export interface ClassificationGroup {
  background: ClassificationGroupBackground;
  items: MatchingPairSide[];
}

export type ClassificationCardDisplayMode = "sequential" | "all-at-once";
export type ClassificationCardOrder = "random" | "rounds";

export interface GroupAssignmentData {
  groups: ClassificationGroup[];
  cardDisplayMode?: ClassificationCardDisplayMode;
  cardOrder?: ClassificationCardOrder;
  useGroupColors?: boolean;
}

export interface TimelineData {
  events: Array<{ label: string; date: string }>;
}

export interface SimpleOrderData {
  items: string[];
}

export interface FreeTextInputData {
  prompt: string;
  answers: string[];
  caseSensitive: boolean;
}

export interface MatchingImagesData {
  pairs: Array<{ imageUrl: string; answer: string }>;
}

export interface MultipleChoiceData {
  questions: Array<{
    prompt: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  }>;
}

export interface ClozeTextData {
  text: string;
}

export interface MediaNoticesData {
  mediaKind: "audio" | "video";
  mediaUrl: string;
  notices: Array<{
    timestamp: string;
    title: string;
    question: string;
    answer: string;
  }>;
}

export interface MillionaireGameData {
  questions: Array<{
    prompt: string;
    options: string[];
    correctIndex: number;
  }>;
}

export interface GroupPuzzleData {
  imageUrl: string;
  revealText: string;
  groups: Array<{ name: string }>;
  items: Array<{ label: string; groupIndex: number }>;
}

export interface CrosswordData {
  entries: Array<{ answer: string; clue: string }>;
}

export interface WordGridData {
  words: string[];
  gridSize: number;
}

export interface WhereIsWhatData {
  imageUrl: string;
  hotspots: Array<{ label: string; x: number; y: number }>;
}

export interface GuessTheWordData {
  word: string;
  clue: string;
}

export interface HorseRaceData {
  trackLength: number;
  opponents: number;
  questions: Array<{
    prompt: string;
    options: string[];
    correctIndex: number;
  }>;
}

export interface PairingGameData {
  pairs: Array<{ front: string; back: string }>;
}

export interface GuessData {
  prompt: string;
  answer: number;
  tolerance: number;
  unit: string;
  hints: string[];
}

export interface MatchingMatrixData {
  rows: string[];
  columns: string[];
  correctCells: Array<{ row: number; column: number }>;
}

export interface FillTableData {
  columns: string[];
  rows: Array<{
    label: string;
    cells: string[];
    blanks: number[];
  }>;
}

export interface QuizTextInputData {
  questions: Array<{ prompt: string; answers: string[] }>;
}

export interface ExerciseDataMap {
  "matching-pairs": MatchingPairsData;
  "group-assignment": GroupAssignmentData;
  timeline: TimelineData;
  "simple-order": SimpleOrderData;
  "free-text-input": FreeTextInputData;
  "matching-images": MatchingImagesData;
  "multiple-choice": MultipleChoiceData;
  "cloze-text": ClozeTextData;
  "media-notices": MediaNoticesData;
  "millionaire-game": MillionaireGameData;
  "group-puzzle": GroupPuzzleData;
  crossword: CrosswordData;
  "word-grid": WordGridData;
  "where-is-what": WhereIsWhatData;
  "guess-the-word": GuessTheWordData;
  "horse-race": HorseRaceData;
  "pairing-game": PairingGameData;
  guess: GuessData;
  "matching-matrix": MatchingMatrixData;
  "fill-table": FillTableData;
  "quiz-text-input": QuizTextInputData;
}

export interface ExerciseDraft<T extends ExerciseTypeId = ExerciseTypeId> {
  type: T;
  title: string;
  description: string;
  instructions: string;
  successMessage: string;
  themeColor: string;
  data: ExerciseDataMap[T];
}

export type AnyExerciseDraft = {
  [K in ExerciseTypeId]: ExerciseDraft<K>;
}[ExerciseTypeId];

export interface ExerciseDefinition<T extends ExerciseTypeId = ExerciseTypeId> {
  id: T;
  title: string;
  shortDescription: string;
  category: string;
  tags: string[];
  defaultDraft: ExerciseDraft<T>;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
}

export interface StoredExercise {
  id: string;
  slug: string;
  ownerId: string | null;
  title: string;
  type: ExerciseTypeId;
  draft: AnyExerciseDraft;
  createdAt: string;
  updatedAt: string;
}
