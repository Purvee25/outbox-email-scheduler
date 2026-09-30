# syntax=docker/dockerfile:1
# ── Builder ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Copy workspace manifests first so npm ci benefits from layer caching
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY backend/package.json ./backend/

RUN npm ci --workspace=packages/shared --workspace=backend

# Copy source
COPY packages/shared ./packages/shared
COPY backend ./backend

# ── API image ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS api
WORKDIR /app
COPY --from=builder /app ./

EXPOSE 4000
CMD ["node", "--import", "tsx/esm", "backend/src/server.ts"]

# ── Worker image ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS worker
WORKDIR /app
COPY --from=builder /app ./

CMD ["node", "--import", "tsx/esm", "backend/src/worker.ts"]
