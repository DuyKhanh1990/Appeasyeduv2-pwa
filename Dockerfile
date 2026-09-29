# -------- Stage 1: Build --------
FROM node:20-alpine AS builder

WORKDIR /app

# Expo Web and React Native dependencies may compile native helpers.
RUN apk add --no-cache python3 make g++
RUN npm install --global pnpm@10.26.1

# Copy workspace manifests first for better Docker layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/edu-mobile/package.json artifacts/edu-mobile/package.json
COPY artifacts/edu-web/package.json artifacts/edu-web/package.json
COPY lib/shell-quote/package.json lib/shell-quote/package.json
COPY scripts/package.json scripts/package.json

# Install the complete workspace because edu-web exports from edu-mobile.
RUN pnpm install --frozen-lockfile --registry=https://registry.npmjs.org

COPY . .

ENV NODE_ENV=production
ENV BASE_PATH=/
ENV PORT=3000

RUN pnpm --filter @workspace/edu-web run build


# -------- Stage 2: Production --------
FROM node:20-alpine AS runner

WORKDIR /app

ARG APP_VERSION=dev
ENV NODE_ENV=production
ENV PORT=3000
ENV APP_VERSION=$APP_VERSION

COPY --from=builder /app/artifacts/edu-web/dist/public ./dist/public
COPY server.mjs ./server.mjs

# Run as non-root, matching Kubernetes security best practices.
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs
USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/healthz || exit 1

CMD ["node", "server.mjs"]
