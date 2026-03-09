import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import Redis from 'ioredis';
import { Worker } from 'bullmq';
import { MockEngine } from '@motionapp/engine-sdk';
import { createStoragePaths, ensureJobDir, readJsonFile, withFileLock, writeJsonAtomic } from '@motionapp/storage';
import { JobRecord, JobStatus, JobStep } from '@motionapp/shared';
import { extractAudio, extractThumbnail, normalizeImage, normalizeToMp4 } from '@motionapp/ffmpeg-utils';

const redisHost = process.env.REDIS_HOST ?? 'localhost';
const redisPort = Number(process.env.REDIS_PORT ?? 6379);
const storageRoot = process.env.STORAGE_ROOT ?? 'storage';
const queueName = 'motion-jobs';
const jobsFile = path.join(storageRoot, 'jobs.json');

const engine = new MockEngine();

const loadJobs = async (): Promise<JobRecord[]> => {
  try {
    return await readJsonFile<JobRecord[]>(jobsFile);
  } catch {
    return [];
  }
};

const saveJobs = async (jobs: JobRecord[]): Promise<void> => {
  await mkdir(path.dirname(jobsFile), { recursive: true });
  await writeJsonAtomic(jobsFile, jobs);
};

const logEvent = (level: 'info' | 'error', event: string, ctx: Record<string, unknown>) => {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      at: new Date().toISOString(),
      level,
      event,
      ...ctx
    })
  );
};

const withJobState = (
  job: JobRecord,
  status: JobStatus,
  currentStep: JobStep,
  progress: number,
  message: string,
  errorMessage?: string,
  fields?: Partial<JobRecord>
): JobRecord => ({
  ...job,
  ...fields,
  status,
  currentStep,
  progress,
  errorMessage,
  updatedAt: new Date().toISOString(),
  logs: [...job.logs, { at: new Date().toISOString(), message }]
});

const updateJob = async (id: string, updater: (job: JobRecord) => JobRecord): Promise<JobRecord> =>
  withFileLock(jobsFile, async () => {
    const jobs = await loadJobs();
    const idx = jobs.findIndex((j) => j.id === id);
    if (idx < 0) throw new Error(`Job ${id} not found`);

    jobs[idx] = updater(jobs[idx]);
    await saveJobs(jobs);
    return jobs[idx];
  });

const worker = new Worker(
  queueName,
  async (bullJob) => {
    const id = String(bullJob.data.id);
    const storagePaths = createStoragePaths(storageRoot);
    const jobDir = await ensureJobDir(storagePaths, id);
    const tempDir = path.join(jobDir, 'temp');
    const poseDir = path.join(jobDir, 'pose');
    const generatedFramesDir = path.join(jobDir, 'generated-frames');

    await mkdir(tempDir, { recursive: true });
    logEvent('info', 'job_received', { jobId: id, queueName });

    try {
      const preprocessing = await updateJob(id, (job) =>
        withJobState(job, JobStatus.PREPROCESSING, JobStatus.PREPROCESSING, 10, 'preprocessing started')
      );

      const normalizedPath = path.join(tempDir, 'driving.normalized.mp4');
      const thumbnailPath = path.join(tempDir, 'driving.thumbnail.jpg');
      const normalizedSourcePhotoPath = path.join(tempDir, 'source.normalized.jpg');
      const audioPath = path.join(tempDir, 'driving.audio.aac');

      await normalizeToMp4(preprocessing.drivingVideoPath, normalizedPath);
      await extractThumbnail(normalizedPath, thumbnailPath);
      await normalizeImage(preprocessing.sourcePhotoPath, normalizedSourcePhotoPath);
      await copyFile(normalizedSourcePhotoPath, path.join(jobDir, 'source.normalized.jpg'));

      let preservedAudioPath: string | undefined;
      try {
        await extractAudio(normalizedPath, audioPath);
        preservedAudioPath = audioPath;
      } catch {
        preservedAudioPath = undefined;
      }

      await updateJob(id, (job) =>
        withJobState(job, JobStatus.POSE_EXTRACTION, JobStatus.POSE_EXTRACTION, 35, 'pose extraction started', undefined, {
          normalizedVideoPath: normalizedPath,
          normalizedSourcePhotoPath,
          previewThumbnailPath: thumbnailPath
        })
      );

      logEvent('info', 'pose_extraction_mock_start', { jobId: id, poseDir });

      const generatedVideoPath = path.join(tempDir, 'generated.mock.mp4');
      const outputVideoPath = path.join(storagePaths.outputsDir, `${id}.mp4`);

      await updateJob(id, (job) =>
        withJobState(job, JobStatus.GENERATION, JobStatus.GENERATION, 60, 'generation started')
      );

      await engine.generate({
        sourcePhotoPath: normalizedSourcePhotoPath,
        normalizedDrivingVideoPath: normalizedPath,
        generatedVideoPath,
        outputVideoPath,
        poseOutputDir: poseDir,
        framesOutputDir: generatedFramesDir,
        audioPath: preservedAudioPath
      });

      await updateJob(id, (job) =>
        withJobState(job, JobStatus.POSTPROCESSING, JobStatus.POSTPROCESSING, 90, 'postprocessing started')
      );

      await updateJob(id, (job) =>
        withJobState(job, JobStatus.COMPLETED, JobStatus.COMPLETED, 100, 'job completed successfully', undefined, {
          outputVideoPath,
          previewThumbnailPath: thumbnailPath
        })
      );

      logEvent('info', 'job_completed', { jobId: id, outputVideoPath });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown worker error';
      await updateJob(id, (job) =>
        withJobState(job, JobStatus.FAILED, JobStatus.FAILED, job.progress, `job failed: ${message}`, message)
      );
      logEvent('error', 'job_failed', { jobId: id, error: message });
      throw error;
    }
  },
  {
    connection: new Redis({ host: redisHost, port: redisPort, maxRetriesPerRequest: null })
  }
);

worker.on('ready', () => {
  logEvent('info', 'worker_ready', { queueName, redisHost, redisPort });
});
