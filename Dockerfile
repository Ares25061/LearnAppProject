FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-venv \
    ca-certificates \
  && python3 -m venv /opt/media-tools \
  && /opt/media-tools/bin/pip install --no-cache-dir --upgrade pip yt-dlp \
  && rm -rf /var/lib/apt/lists/*
ENV PATH="/opt/media-tools/bin:${PATH}"

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/scorm-template ./scorm-template

EXPOSE 3000

CMD ["node", "server.js"]
