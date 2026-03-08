import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Res,
  UploadedFiles,
  UseInterceptors
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { Response } from 'express';
import { saveBufferFile, createStoragePaths, ensureStorageDirs } from '@motionapp/storage';
import path from 'node:path';
import { JobsService } from './jobs.service';

const inputSchema = z.object({
  source: z.custom<Express.Multer.File>((file) => !!file, 'source photo is required'),
  driving: z.custom<Express.Multer.File>((file) => !!file, 'driving video is required')
});

@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    @Inject('STORAGE_ROOT') private readonly storageRoot: string
  ) {}

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'source', maxCount: 1 },
      { name: 'driving', maxCount: 1 }
    ])
  )
  async create(@UploadedFiles() files: { source?: Express.Multer.File[]; driving?: Express.Multer.File[] }) {
    const source = files.source?.[0];
    const driving = files.driving?.[0];

    const parsed = inputSchema.safeParse({ source, driving });
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const storagePaths = createStoragePaths(this.storageRoot);
    await ensureStorageDirs(storagePaths);

    const sourcePath = path.join(storagePaths.uploadsDir, `${Date.now()}-${source.originalname}`);
    const drivingPath = path.join(storagePaths.uploadsDir, `${Date.now()}-${driving.originalname}`);

    await saveBufferFile(sourcePath, source.buffer);
    await saveBufferFile(drivingPath, driving.buffer);

    const job = await this.jobsService.createJob(sourcePath, drivingPath);
    return { id: job.id, status: job.status };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.jobsService.getJob(id);
  }

  @Get(':id/result')
  async getResult(@Param('id') id: string, @Res() res: Response) {
    const videoPath = await this.jobsService.getResultPath(id);
    return res.sendFile(videoPath);
  }
}
