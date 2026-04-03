import "../app/globals.css";
import { createRoot } from "react-dom/client";
import { ExercisePlayer } from "../components/exercise-player";
import type { AnyExerciseDraft } from "../lib/types";

declare global {
  interface Window {
    __SCORM_EXERCISE_DRAFT__?: AnyExerciseDraft;
  }
}

const container = document.getElementById("app");
const draft = window.__SCORM_EXERCISE_DRAFT__;

if (!container) {
  throw new Error("SCORM2 player container is missing.");
}

if (!draft) {
  throw new Error("SCORM2 exercise draft is missing.");
}

createRoot(container).render(<ExercisePlayer draft={draft} fullscreen />);
