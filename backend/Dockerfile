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
ENV NODE_ENV=production
COPY --from=builder /app ./
USER node

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "--import", "tsx/esm", "backend/src/server.ts"]

# ── Worker image ──────────────────────────────────────────────────────────────
# No HTTP port: liveness is the process itself (compose restarts it if it exits).
FROM node:22-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./
USER node

CMD ["node", "--import", "tsx/esm", "backend/src/worker.ts"]
