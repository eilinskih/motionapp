FROM node:20-alpine
WORKDIR /workspace
RUN corepack enable && apk add --no-cache ffmpeg
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install
WORKDIR /workspace/apps/worker
CMD ["pnpm", "dev"]
