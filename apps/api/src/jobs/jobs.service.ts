import { Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { JobRecord, JobStatus } from '@motionapp/shared';
import { createStoragePaths, ensureJobDir } from '@motionapp/storage';
import path from 'node:path';
import { JsonJobRepository } from './job.repository';

@Injectable()
export class JobsService {
  private readonly queueName = 'motion-jobs';

  constructor(
    private readonly repository: JsonJobRepository,
    private readonly queue: Queue,
    private readonly storageRoot: string
  ) {}

  async createJob(sourcePhotoPath: string, drivingVideoPath: string): Promise<JobRecord> {
    const id = uuidv4();
    const now = new Date().toISOString();
    const storagePaths = createStoragePaths(this.storageRoot);
    await ensureJobDir(storagePaths, id);

    const job: JobRecord = {
      id,
      status: JobStatus.QUEUED,
      currentStep: JobStatus.QUEUED,
      progress: 0,
      sourcePhotoPath,
      drivingVideoPath,
      logs: [{ at: now, message: 'Job created' }],
      createdAt: now,
      updatedAt: now
    };

    await this.repository.create(job);
    await this.queue.add('process-motion', { id });

    return job;
  }

  async getJob(id: string): Promise<JobRecord> {
    const job = await this.repository.findById(id);
    if (!job) throw new NotFoundException('job not found');
    return job;
  }

  async getResultPath(id: string): Promise<string> {
    const job = await this.getJob(id);
    if (!job.outputVideoPath) throw new NotFoundException('result not ready');
    return path.resolve(job.outputVideoPath);
  }

  async getThumbnailPath(id: string): Promise<string> {
    const job = await this.getJob(id);
    if (!job.previewThumbnailPath) throw new NotFoundException('thumbnail not ready');
    return path.resolve(job.previewThumbnailPath);
  }
}
