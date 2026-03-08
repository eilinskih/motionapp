import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import Redis from 'ioredis';
import { Worker } from 'bullmq';
import { MockEngine } from '@motionapp/engine-sdk';
import { createStoragePaths, ensureJobDir } from '@motionapp/storage';
import { JobRecord, JobStatus } from '@motionapp/shared';
import { extractAudio, normalizeToMp4 } from '@motionapp/ffmpeg-utils';

const redisHost = process.env.REDIS_HOST ?? 'localhost';
const redisPort = Number(process.env.REDIS_PORT ?? 6379);
const storageRoot = process.env.STORAGE_ROOT ?? 'storage';
const queueName = 'motion-jobs';
const jobsFile = path.join(storageRoot, 'jobs.json');

const engine = new MockEngine();

const loadJobs = async (): Promise<JobRecord[]> => {
  try {
    const raw = await readFile(jobsFile, 'utf8');
    return JSON.parse(raw) as JobRecord[];
  } catch {
    return [];
  }
};

const saveJobs = async (jobs: JobRecord[]): Promise<void> => {
  await mkdir(path.dirname(jobsFile), { recursive: true });
  await writeFile(jobsFile, JSON.stringify(jobs, null, 2), 'utf8');
};

const updateJob = async (id: string, updater: (job: JobRecord) => JobRecord): Promise<JobRecord> => {
  const jobs = await loadJobs();
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx < 0) throw new Error(`Job ${id} not found`);

  jobs[idx] = updater(jobs[idx]);
  await saveJobs(jobs);
  return jobs[idx];
};

const logStep = (job: JobRecord, status: JobStatus, message: string, errorMessage?: string): JobRecord => ({
  ...job,
  status,
  errorMessage,
  updatedAt: new Date().toISOString(),
  logs: [...job.logs, { at: new Date().toISOString(), message }]
});

const worker = new Worker(
  queueName,
  async (bullJob) => {
    const id = String(bullJob.data.id);
    const storagePaths = createStoragePaths(storageRoot);
    const jobDir = await ensureJobDir(storagePaths, id);

    try {
      const preprocessing = await updateJob(id, (job) => logStep(job, JobStatus.PREPROCESSING, 'preprocessing started'));

      const normalizedPath = path.join(jobDir, 'normalized.mp4');
      await normalizeToMp4(preprocessing.drivingVideoPath, normalizedPath);
      await extractAudio(normalizedPath, path.join(jobDir, 'audio.aac'));

      await updateJob(id, (job) => ({ ...logStep(job, JobStatus.POSE_EXTRACTION, 'pose extraction finished'), normalizedVideoPath: normalizedPath }));

      await updateJob(id, (job) => logStep(job, JobStatus.GENERATION, 'generation started'));
      const outputVideoPath = path.join(storagePaths.outputsDir, `${id}.mp4`);
      await engine.generate({
        sourcePhotoPath: preprocessing.sourcePhotoPath,
        normalizedDrivingVideoPath: normalizedPath,
        outputVideoPath
      });

      await updateJob(id, (job) => logStep(job, JobStatus.POSTPROCESSING, 'postprocessing started'));

      await updateJob(id, (job) => ({
        ...logStep(job, JobStatus.COMPLETED, 'job completed successfully'),
        outputVideoPath
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown worker error';
      await updateJob(id, (job) => logStep(job, JobStatus.FAILED, `job failed: ${message}`, message));
      throw error;
    }
  },
  {
    connection: new Redis({ host: redisHost, port: redisPort, maxRetriesPerRequest: null })
  }
);

worker.on('ready', () => {
  // eslint-disable-next-line no-console
  console.log('Worker ready');
});
