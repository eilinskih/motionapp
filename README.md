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
- `packages/engine-sdk` - adapter-based `MotionGenerationEngine` (`mock`, `local-process`, `remote-http`)

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

### Engine selection (`apps/worker`)
Worker orchestration remains in Node.js, while inference can be switched by env var:

- `ENGINE=mock` (default)
- `ENGINE=local-process`
- `ENGINE=remote-http`

Optional local process command hooks (used when `ENGINE=local-process`):
- `LOCAL_PROCESS_POSE_COMMAND`
- `LOCAL_PROCESS_FRAME_COMMAND`
- `LOCAL_PROCESS_COMPOSE_COMMAND`

Each command is executed via `child_process` semantics (`spawn` with shell), and receives paths through environment variables (`SOURCE_PHOTO_PATH`, `NORMALIZED_DRIVING_VIDEO_PATH`, `POSE_OUTPUT_DIR`, `FRAMES_OUTPUT_DIR`, `GENERATED_VIDEO_PATH`, `OUTPUT_VIDEO_PATH`, `AUDIO_PATH`).

### Web (`apps/web`)
- `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:4000`)

## Build / checks
```bash
pnpm build
pnpm typecheck
```

## Future-ready extension points
- Replace JSON repository with Postgres by implementing `JobRepository` interface in API.
- Add object storage and CDN by extending `packages/storage`.


## External inference backends (Python / remote GPU)
`packages/engine-sdk` defines an adapter contract with three explicit stages:
1. `extractPose`
2. `generateFrames`
3. `composeVideo`

To plug in a real backend later without changing API contracts:
- **Python local backend**: set `ENGINE=local-process` and point command env vars to python entrypoints/scripts.
  - Example: `LOCAL_PROCESS_POSE_COMMAND="python ./scripts/pose.py"`
- **Remote GPU service**: set `ENGINE=remote-http` and implement `RemoteHttpEngine`/adapter to call your HTTP endpoints for the same three stages.

Because worker/job APIs stay unchanged, the web and API layers do not need changes when swapping engines.
