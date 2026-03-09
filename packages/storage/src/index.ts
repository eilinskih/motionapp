import { mkdir, writeFile, copyFile, open, rm, readFile, rename, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export interface StoragePaths {
  root: string;
  uploadsDir: string;
  jobsDir: string;
  outputsDir: string;
}

export const createStoragePaths = (root: string): StoragePaths => ({
  root,
  uploadsDir: path.join(root, 'uploads'),
  jobsDir: path.join(root, 'jobs'),
  outputsDir: path.join(root, 'outputs')
});

export const ensureStorageDirs = async (paths: StoragePaths): Promise<void> => {
  await Promise.all([
    mkdir(paths.root, { recursive: true }),
    mkdir(paths.uploadsDir, { recursive: true }),
    mkdir(paths.jobsDir, { recursive: true }),
    mkdir(paths.outputsDir, { recursive: true })
  ]);
};

export const getJobDir = (paths: StoragePaths, jobId: string): string => path.join(paths.jobsDir, jobId);

export const ensureJobDir = async (paths: StoragePaths, jobId: string): Promise<string> => {
  const dir = getJobDir(paths, jobId);
  await mkdir(dir, { recursive: true });
  return dir;
};

export const saveBufferFile = async (fullPath: string, buffer: Buffer): Promise<void> => {
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);
};

export const safeCopy = async (src: string, dst: string): Promise<void> => {
  await mkdir(path.dirname(dst), { recursive: true });
  await copyFile(src, dst);
};

export const fileExists = (fullPath: string): boolean => existsSync(fullPath);

const sleep = async (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const isPidAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

export const withFileLock = async <T>(
  lockBasePath: string,
  task: () => Promise<T>,
  options?: { timeoutMs?: number; retryDelayMs?: number; staleThresholdMs?: number }
): Promise<T> => {
  const lockPath = `${lockBasePath}.lock`;
  const timeoutMs = options?.timeoutMs ?? 5000;
  const retryDelayMs = options?.retryDelayMs ?? 50;
  const staleThresholdMs = options?.staleThresholdMs ?? 30000;
  const start = Date.now();

  while (true) {
    try {
      const handle = await open(lockPath, 'wx');
      const payload = JSON.stringify({ pid: process.pid, createdAt: Date.now() });
      await handle.writeFile(payload, 'utf8');
      await handle.close();
      break;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'EEXIST') {
        throw error;
      }

      try {
        const lockStat = await stat(lockPath);
        const age = Date.now() - lockStat.mtimeMs;
        let stale = age > staleThresholdMs;

        if (!stale) {
          try {
            const lockData = JSON.parse(await readFile(lockPath, 'utf8')) as { pid?: number };
            if (typeof lockData.pid === 'number' && !isPidAlive(lockData.pid)) {
              stale = true;
            }
          } catch {
            // keep stale=false unless age threshold hit
          }
        }

        if (stale) {
          await unlink(lockPath).catch(() => undefined);
          continue;
        }
      } catch {
        // if lock disappears between checks just retry
      }

      if (Date.now() - start >= timeoutMs) {
        throw new Error(`Timed out waiting for file lock: ${lockPath}`);
      }
      await sleep(retryDelayMs);
    }
  }

  try {
    return await task();
  } finally {
    await rm(lockPath, { force: true });
  }
};

export const readJsonFile = async <T>(filePath: string): Promise<T> => {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
};

export const writeJsonAtomic = async (filePath: string, value: unknown): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, JSON.stringify(value, null, 2), 'utf8');
  await rename(tempPath, filePath);
};
