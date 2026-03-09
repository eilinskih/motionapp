import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { JobRecord, JobStatus } from '@motionapp/shared';
import { readJsonFile, withFileLock, writeJsonAtomic } from '@motionapp/storage';

export interface JobRepository {
  create(job: JobRecord): Promise<JobRecord>;
  findById(id: string): Promise<JobRecord | null>;
  update(id: string, updater: (job: JobRecord) => JobRecord): Promise<JobRecord | null>;
  delete(id: string): Promise<void>;
}

export class JsonJobRepository implements JobRepository {
  private readonly memory = new Map<string, JobRecord>();
  private mutationChain: Promise<void> = Promise.resolve();

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
    return this.withRepoLock(async () => {
      await this.refreshFromDisk();
      this.memory.set(job.id, job);
      await this.persist();
      return job;
    });
  }

  async findById(id: string): Promise<JobRecord | null> {
    await this.refreshFromDisk();
    return this.memory.get(id) ?? null;
  }

  async update(id: string, updater: (job: JobRecord) => JobRecord): Promise<JobRecord | null> {
    return this.withRepoLock(async () => {
      await this.refreshFromDisk();
      const current = this.memory.get(id);
      if (!current) return null;

      const updated = updater({ ...current });
      this.memory.set(id, updated);
      await this.persist();
      return updated;
    });
  }

  async delete(id: string): Promise<void> {
    await this.withRepoLock(async () => {
      await this.refreshFromDisk();
      this.memory.delete(id);
      await this.persist();
    });
  }

  private async withRepoLock<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.mutationChain;
    let release!: () => void;
    this.mutationChain = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await task();
    } finally {
      release();
    }
  }

  private async refreshFromDisk(): Promise<void> {
    const jobs = await withFileLock(this.filePath, async () => readJsonFile<JobRecord[]>(this.filePath));
    this.memory.clear();
    for (const job of jobs) {
      this.memory.set(job.id, job);
    }
  }

  private async persist(): Promise<void> {
    const values = [...this.memory.values()];
    await withFileLock(this.filePath, async () => {
      await writeJsonAtomic(path.resolve(this.filePath), values);
    });
  }
}

export const appendLog = (job: JobRecord, message: string): JobRecord => {
  const now = new Date().toISOString();
  return {
    ...job,
    logs: [...job.logs, { at: now, message }],
    updatedAt: now
  };
};

export const withStatus = (job: JobRecord, status: JobStatus): JobRecord => ({
  ...appendLog(job, `status -> ${status}`),
  status,
  currentStep: status
});
