import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { JobRecord, JobStatus } from '@motionapp/shared';
import { readJsonFile, withFileLock, writeJsonAtomic } from '@motionapp/storage';

export interface JobRepository {
  create(job: JobRecord): Promise<JobRecord>;
  findById(id: string): Promise<JobRecord | null>;
  update(id: string, updater: (job: JobRecord) => JobRecord): Promise<JobRecord | null>;
}

export class JsonJobRepository implements JobRepository {
  private readonly memory = new Map<string, JobRecord>();
  private readonly updateQueues = new Map<string, Promise<void>>();

  constructor(private readonly filePath: string) {}

  async initialize(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await this.refreshFromDisk();
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        await this.persist();
        return;
      }
      throw error;
    }
  }

  async create(job: JobRecord): Promise<JobRecord> {
    await this.refreshFromDisk();
    this.memory.set(job.id, job);
    await this.persist();
    return job;
  }

  async findById(id: string): Promise<JobRecord | null> {
    await this.refreshFromDisk();
    return this.memory.get(id) ?? null;
  }

  async update(id: string, updater: (job: JobRecord) => JobRecord): Promise<JobRecord | null> {
    return this.withJobLock(id, async () => {
      await this.refreshFromDisk();

      const current = this.memory.get(id);
      if (!current) return null;

      const updated = updater({ ...current });
      this.memory.set(id, updated);
      await this.persist();
      return updated;
    });
  }

  private async refreshFromDisk(): Promise<void> {
    const jobs = await withFileLock(this.filePath, async () => readJsonFile<JobRecord[]>(this.filePath));
    this.memory.clear();
    for (const job of jobs) {
      this.memory.set(job.id, job);
    }
  }

  private async withJobLock<T>(id: string, task: () => Promise<T>): Promise<T> {
    // In-process per-job mutex: serialize update() calls for the same id to avoid lost updates.
    const previous = this.updateQueues.get(id) ?? Promise.resolve();

    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    const queued = previous.then(() => current);
    this.updateQueues.set(id, queued);

    await previous;
    try {
      return await task();
    } finally {
      release();
      if (this.updateQueues.get(id) === queued) {
        this.updateQueues.delete(id);
      }
    }
  }

  private async persist(): Promise<void> {
    const values = [...this.memory.values()];
    await withFileLock(this.filePath, async () => {
      await writeJsonAtomic(path.resolve(this.filePath), values);
    });
  }
}

export const appendLog = (job: JobRecord, message: string): JobRecord => ({
  ...job,
  logs: [...job.logs, { at: new Date().toISOString(), message }],
  updatedAt: new Date().toISOString()
});

export const withStatus = (job: JobRecord, status: JobStatus): JobRecord => ({
  ...appendLog(job, `status -> ${status}`),
  status
});
