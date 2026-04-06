import { createWriteStream } from "node:fs";
import { chmod, mkdir } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import https from "node:https";

const rootDir = process.cwd();
const binDir = path.join(rootDir, ".media-tools", "bin");
const isWindows = process.platform === "win32";
const fileName = isWindows ? "yt-dlp.exe" : "yt-dlp";
const targetPath = path.join(binDir, fileName);
const downloadUrl = isWindows
  ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
  : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";

function downloadFile(url, destination, redirectCount = 0) {
  if (redirectCount > 5) {
    return Promise.reject(new Error("Слишком много редиректов при скачивании yt-dlp."));
  }

  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        const location = response.headers.location;
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          location
        ) {
          response.resume();
          resolve(downloadFile(location, destination, redirectCount + 1));
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          reject(
            new Error(`Не удалось скачать yt-dlp. HTTP ${response.statusCode ?? "unknown"}.`),
          );
          return;
        }

        pipeline(response, createWriteStream(destination)).then(resolve).catch(reject);
      })
      .on("error", reject);
  });
}

await mkdir(binDir, { recursive: true });
await downloadFile(downloadUrl, targetPath);

if (!isWindows) {
  await chmod(targetPath, 0o755);
}

console.log(`yt-dlp сохранен в ${targetPath}`);
