FROM node:20-alpine
WORKDIR /workspace

RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install
RUN pnpm --filter @motionapp/web build

RUN addgroup -S webgroup && adduser -S webuser -G webgroup && chown -R webuser:webgroup /workspace
USER webuser

WORKDIR /workspace/apps/web
CMD ["pnpm", "start"]
