ARG BGUTIL_POT_PROVIDER_VERSION=1.3.1

FROM node:20-bookworm-slim AS base
ARG BGUTIL_POT_PROVIDER_VERSION
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-venv \
    libcairo2 \
    libpango-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    ca-certificates \
  && python3 -m venv /opt/media-tools \
  && /opt/media-tools/bin/pip install --no-cache-dir --upgrade pip yt-dlp bgutil-ytdlp-pot-provider==${BGUTIL_POT_PROVIDER_VERSION} yt-dlp-getpot-wpc \
  && rm -rf /var/lib/apt/lists/*
ENV PATH="/opt/media-tools/bin:${PATH}"

FROM node:20-bookworm-slim AS bgutil
ARG BGUTIL_POT_PROVIDER_VERSION
WORKDIR /opt/bgutil-provider
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    python3 \
    make \
    g++ \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg62-turbo-dev \
    libgif-dev \
    librsvg2-dev \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch ${BGUTIL_POT_PROVIDER_VERSION} https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git .
WORKDIR /opt/bgutil-provider/server
RUN npm ci && npx tsc

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
ENV YTDLP_YOUTUBE_BGUTIL_ENABLED=1
ENV YTDLP_YOUTUBE_WPC_ENABLED=1
ENV YTDLP_YOUTUBE_WPC_BROWSER_PATH=/usr/bin/chromium

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/scorm-template ./scorm-template
COPY --from=builder /app/scripts/start-runtime.sh ./scripts/start-runtime.sh
COPY --from=bgutil /opt/bgutil-provider/server /opt/bgutil-provider/server
RUN chmod +x ./scripts/start-runtime.sh

EXPOSE 3000

CMD ["./scripts/start-runtime.sh"]
