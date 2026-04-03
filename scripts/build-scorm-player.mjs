import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const templateDirectory = path.join(projectRoot, "scorm-template");
const playerEntry = path.join(projectRoot, "src", "scorm-offline", "player-entry.tsx");
const playerBundle = path.join(templateDirectory, "scorm-player.js");
const playerStyles = path.join(templateDirectory, "scorm-player.css");

const blockedUrlSnippets = [
  "https://www.youtube.com/iframe_api",
  "https://img.youtube.com/vi/",
  "https://www.youtube-nocookie.com/embed/",
  "https://react.dev/",
  "https://github.com/facebook/react/",
];
const allowedUrlPrefixes = ["http://www.w3.org/", "https://www.w3.org/"];

async function sanitizeOutput(filePath) {
  let source = await fs.readFile(filePath, "utf8");

  for (const snippet of blockedUrlSnippets) {
    source = source.replaceAll(snippet, "");
  }

  const remainingUrls = Array.from(
    source.matchAll(/https?:\/\/[^"'`\s)]+/g),
    (match) => match[0],
  ).filter(
    (url) => !allowedUrlPrefixes.some((prefix) => url.startsWith(prefix)),
  );

  if (remainingUrls.length > 0) {
    throw new Error(
      `SCORM2 bundle still contains external URLs: ${remainingUrls.join(", ")}`,
    );
  }

  await fs.writeFile(filePath, source);
}

await build({
  absWorkingDir: projectRoot,
  alias: {
    "@": path.join(projectRoot, "src"),
  },
  bundle: true,
  define: {
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

await sanitizeOutput(playerBundle);
await sanitizeOutput(playerStyles);
