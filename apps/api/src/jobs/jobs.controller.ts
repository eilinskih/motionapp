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
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { saveBufferFile, createStoragePaths, ensureStorageDirs } from '@motionapp/storage';
import { JobsService } from './jobs.service';

const allowedSourceMime = ['image/jpeg', 'image/png', 'image/webp'];
const allowedDrivingMime = ['video/mp4', 'video/quicktime', 'video/webm'];
const maxSourceBytes = 10 * 1024 * 1024;
const maxDrivingBytes = 50 * 1024 * 1024;

const inputSchema = z.object({
  source: z.custom<Express.Multer.File>(
    (file): file is Express.Multer.File => !!file && allowedSourceMime.includes(file.mimetype),
    'source photo is required and must be jpeg/png/webp'
  ),
  driving: z.custom<Express.Multer.File>(
    (file): file is Express.Multer.File => !!file && allowedDrivingMime.includes(file.mimetype),
    'driving video is required and must be mp4/mov/webm'
  )
});

const sanitizeExtension = (originalName: string, fallback: string): string => {
  const ext = path.extname(path.basename(originalName)).toLowerCase();
  if (!ext || /[^a-z0-9.]/i.test(ext)) return fallback;
  return ext;
};

@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    @Inject('STORAGE_ROOT') private readonly storageRoot: string
  ) {}

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'source', maxCount: 1 },
        { name: 'driving', maxCount: 1 }
      ],
      {
        limits: {
          files: 2,
          fields: 2,
          fileSize: maxDrivingBytes
        },
        fileFilter: (_req, file, callback) => {
          if (file.fieldname === 'source') {
            if (!allowedSourceMime.includes(file.mimetype)) {
              callback(new BadRequestException('Invalid source mimetype'), false);
              return;
            }
          } else if (file.fieldname === 'driving') {
            if (!allowedDrivingMime.includes(file.mimetype)) {
              callback(new BadRequestException('Invalid driving mimetype'), false);
              return;
            }
          } else {
            callback(new BadRequestException(`Unexpected upload field: ${file.fieldname}`), false);
            return;
          }
          callback(null, true);
        }
      }
    )
  )
  async create(@UploadedFiles() files: { source?: Express.Multer.File[]; driving?: Express.Multer.File[] }) {
    const parsed = inputSchema.safeParse({ source: files.source?.[0], driving: files.driving?.[0] });
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const { source, driving } = parsed.data;
    if (source.size > maxSourceBytes) {
      throw new BadRequestException('source photo exceeds 10MB limit');
    }

    const storagePaths = createStoragePaths(this.storageRoot);
    await ensureStorageDirs(storagePaths);

    const sourcePath = path.join(storagePaths.uploadsDir, `source-${Date.now()}-${randomUUID()}${sanitizeExtension(source.originalname, '.jpg')}`);
    const drivingPath = path.join(storagePaths.uploadsDir, `driving-${Date.now()}-${randomUUID()}${sanitizeExtension(driving.originalname, '.mp4')}`);

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
