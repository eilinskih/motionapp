FROM node:20-alpine
WORKDIR /workspace

RUN corepack enable && apk add --no-cache ffmpeg
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install

RUN addgroup -S workergroup && adduser -S worker -G workergroup && chown -R worker:workergroup /workspace
USER worker

WORKDIR /workspace/apps/worker
CMD ["pnpm", "dev"]
