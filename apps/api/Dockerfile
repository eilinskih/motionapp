FROM node:20-alpine
WORKDIR /workspace

RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/storage/package.json ./packages/storage/package.json
COPY packages/ffmpeg-utils/package.json ./packages/ffmpeg-utils/package.json
COPY packages/engine-sdk/package.json ./packages/engine-sdk/package.json
RUN pnpm install --frozen-lockfile

COPY apps ./apps
COPY packages ./packages

RUN addgroup -S appgroup && adduser -S appuser -G appgroup && chown -R appuser:appgroup /workspace
USER appuser

WORKDIR /workspace/apps/api
CMD ["pnpm", "dev"]
