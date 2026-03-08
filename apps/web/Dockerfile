FROM node:20-alpine
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install
WORKDIR /workspace/apps/web
CMD ["pnpm", "dev"]
