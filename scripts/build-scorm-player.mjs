import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const templateDirectory = path.join(projectRoot, "scorm-template");
const playerEntry = path.join(projectRoot, "src", "scorm-offline", "player-entry.tsx");
const playerBundle = path.join(templateDirectory, "scorm-player.js");

await build({
  absWorkingDir: projectRoot,
  alias: {
    "@": path.join(projectRoot, "src"),
  },
  bundle: true,
  define: {
    __SCORM_OFFLINE_BUNDLE__: "true",
    "process.env.NODE_ENV": '"production"',
  },
  entryPoints: [playerEntry],
  format: "iife",
  jsx: "automatic",
  legalComments: "none",
  loader: {
    ".css": "css",
  },
  minify: true,
  outfile: playerBundle,
  platform: "browser",
  sourcemap: false,
  target: ["es2020"],
});
