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
  throw new Error("Autonomous SCORM player container is missing.");
}

if (!draft) {
  throw new Error("Autonomous SCORM exercise draft is missing.");
}

createRoot(container).render(
  <main className="play-page play-page--board">
    <ExercisePlayer boardOnly draft={draft} fullscreen />
  </main>,
);
