# Motion Control Video MVP Monorepo

Production-structured MVP for a motion-control generation workflow.

## Stack
- pnpm workspace monorepo
- Next.js web app (`apps/web`)
- NestJS API (`apps/api`)
- Worker process (`apps/worker`)
- BullMQ + Redis
- Local filesystem storage for artifacts
- TypeScript across all apps/packages

## Monorepo layout
- `apps/web` - upload form, polling status page, result video page
- `apps/api` - upload + job query/result endpoints
- `apps/worker` - BullMQ consumer that executes pipeline steps
- `packages/shared` - shared types (`JobStatus`, `JobRecord`)
- `packages/storage` - filesystem path + file helpers
- `packages/ffmpeg-utils` - ffmpeg wrappers (normalize/extract/finalize)
- `packages/engine-sdk` - `MotionGenerationEngine` + `MockEngine`

## Workflow
1. User uploads source photo + driving video.
2. API validates input with zod, saves files locally, creates a job, enqueues BullMQ task.
3. Worker runs steps:
   - preprocessing
   - pose_extraction
   - generation
   - postprocessing
4. Worker updates job state + logs in JSON repository (`storage/jobs.json`).
5. Web app polls `GET /jobs/:id` and displays result from `GET /jobs/:id/result` when complete.

## Local development
### Prerequisites
- Node.js 20+
- pnpm 9+
- Docker + Docker Compose
- ffmpeg (required for worker if running outside Docker)

### Install
```bash
pnpm install
```

### Run everything with Docker Compose
```bash
docker compose up --build
```

Services:
- Web: http://localhost:3000
- API: http://localhost:4000
- Redis: localhost:6379

### Run directly (without Docker)
```bash
# terminal 0 (start Redis first)
docker compose up redis

# terminal 1
pnpm --filter @motionapp/api dev

# terminal 2
pnpm --filter @motionapp/worker dev

# terminal 3
pnpm --filter @motionapp/web dev
```

## Environment variables
### API (`apps/api`)
- `API_PORT` (default `4000`)
- `REDIS_HOST` (default `localhost`)
- `REDIS_PORT` (default `6379`)
- `STORAGE_ROOT` (default `storage`)
- `WEB_ORIGIN` (default `http://localhost:3000`)

### Worker (`apps/worker`)
- `REDIS_HOST` (default `localhost`)
- `REDIS_PORT` (default `6379`)
- `STORAGE_ROOT` (default `storage`)

### Web (`apps/web`)
- `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:4000`)

## Build / checks
```bash
pnpm build
pnpm typecheck
```

## Future-ready extension points
- Replace JSON repository with Postgres by implementing `JobRepository` interface in API.
- Replace `MockEngine` with local Python bridge or remote GPU service via `MotionGenerationEngine`.
- Add object storage and CDN by extending `packages/storage`.
