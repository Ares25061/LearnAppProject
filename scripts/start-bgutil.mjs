import { spawn } from "node:child_process";

const FILTERED_PREFIXES = ["poToken:"];

function shouldSuppressLine(line) {
  const normalized = line.trimStart();
  return FILTERED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function pipeStream(stream, writer) {
  let buffer = "";

  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;

    while (true) {
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) {
        break;
      }

      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);

      if (!shouldSuppressLine(line)) {
        writer.write(`${line}\n`);
      }
    }
  });

  stream.on("end", () => {
    if (buffer && !shouldSuppressLine(buffer)) {
      writer.write(buffer);
    }
  });
}

const child = spawn(
  process.execPath,
  ["/opt/bgutil-provider/server/build/main.js", ...process.argv.slice(2)],
  {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  },
);

pipeStream(child.stdout, process.stdout);
pipeStream(child.stderr, process.stderr);

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("error", (error) => {
  console.error(`[bgutil] ${error.message}`);
  process.exitCode = 1;
});

child.on("close", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
