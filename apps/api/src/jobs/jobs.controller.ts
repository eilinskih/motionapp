import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UploadedFiles,
  UseInterceptors
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { Response, Request } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import { createStoragePaths, ensureStorageDirs, saveBufferFile } from '@motionapp/storage';
import { JobsService } from './jobs.service';

const allowedSourceMime = ['image/jpeg', 'image/png', 'image/webp'];
const allowedDrivingMime = ['video/mp4', 'video/quicktime', 'video/webm'];
const maxSourceBytes = 10 * 1024 * 1024;
const maxDrivingBytes = 50 * 1024 * 1024;
const maxCombinedBytes = maxSourceBytes + maxDrivingBytes + 2 * 1024 * 1024;
const tempUploadDir = path.resolve(process.env.STORAGE_ROOT ?? 'storage', 'tmp-uploads');

const inputSchema = z.object({
  source: z.custom<Express.Multer.File>((file): file is Express.Multer.File => !!file, 'source photo is required'),
  driving: z.custom<Express.Multer.File>((file): file is Express.Multer.File => !!file, 'driving video is required')
});

const sanitizeExtension = (originalName: string, fallback: string): string => {
  const ext = path.extname(path.basename(originalName)).toLowerCase();
  if (!ext || /[^a-z0-9.]/i.test(ext)) return fallback;
  return ext;
};

const detectKind = (buffer: Buffer): 'jpeg' | 'png' | 'webp' | 'mp4' | 'mov' | 'webm' | 'unknown' => {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii');
    if (brand === 'qt  ') return 'mov';
    return 'mp4';
  }
  if (buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return 'webm';
  return 'unknown';
};

const isSourceKind = (kind: string): boolean => ['jpeg', 'png', 'webp'].includes(kind);
const isDrivingKind = (kind: string): boolean => ['mp4', 'mov', 'webm'].includes(kind);


const readMagicBytes = async (filePath: string, length = 64): Promise<Buffer> => {
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
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
        storage: multer.diskStorage({
          destination: async (_req, _file, cb) => {
            await mkdir(tempUploadDir, { recursive: true });
            cb(null, tempUploadDir);
          },
          filename: (_req, file, cb) => {
            cb(null, `${Date.now()}-${randomUUID()}${sanitizeExtension(file.originalname, '')}`);
          }
        }),
        limits: {
          files: 2,
          fields: 2,
          fileSize: maxDrivingBytes
        },
        fileFilter: (req, file, callback) => {
          const contentLength = Number(req.headers['content-length'] ?? 0);
          if (Number.isFinite(contentLength) && contentLength > maxCombinedBytes) {
            callback(new BadRequestException('Payload exceeds upload limit'), false);
            return;
          }

          if (file.fieldname === 'source' && !allowedSourceMime.includes(file.mimetype)) {
            callback(new BadRequestException('Invalid source mimetype'), false);
            return;
          }
          if (file.fieldname === 'driving' && !allowedDrivingMime.includes(file.mimetype)) {
            callback(new BadRequestException('Invalid driving mimetype'), false);
            return;
          }
          if (!['source', 'driving'].includes(file.fieldname)) {
            callback(new BadRequestException(`Unexpected upload field: ${file.fieldname}`), false);
            return;
          }

          callback(null, true);
        }
      }
    )
  )
  async create(
    @Req() _req: Request,
    @UploadedFiles() files: { source?: Express.Multer.File[]; driving?: Express.Multer.File[] }
  ) {
    const parsed = inputSchema.safeParse({ source: files.source?.[0], driving: files.driving?.[0] });
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const { source, driving } = parsed.data;
    if (source.size > maxSourceBytes) {
      throw new BadRequestException('source photo exceeds 10MB limit');
    }

    const sourceHeader = await readMagicBytes(source.path);
    const drivingHeader = await readMagicBytes(driving.path);
    if (!isSourceKind(detectKind(sourceHeader))) {
      throw new BadRequestException('Invalid source file type');
    }
    if (!isDrivingKind(detectKind(drivingHeader))) {
      throw new BadRequestException('Invalid driving file type');
    }

    const storagePaths = createStoragePaths(this.storageRoot);
    await ensureStorageDirs(storagePaths);

    const sourcePath = path.join(storagePaths.uploadsDir, `source-${Date.now()}-${randomUUID()}${sanitizeExtension(source.originalname, '.jpg')}`);
    const drivingPath = path.join(storagePaths.uploadsDir, `driving-${Date.now()}-${randomUUID()}${sanitizeExtension(driving.originalname, '.mp4')}`);

    let createdJobId: string | null = null;
    try {
      await saveBufferFile(sourcePath, await readFile(source.path));
      await saveBufferFile(drivingPath, await readFile(driving.path));

      const job = await this.jobsService.createJob(sourcePath, drivingPath);
      createdJobId = job.id;

      return {
        id: job.id,
        status: job.status,
        currentStep: job.currentStep,
        progress: job.progress,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt
      };
    } catch (error) {
      if (createdJobId) {
        await this.jobsService.deleteJob(createdJobId);
      }
      await rm(sourcePath, { force: true });
      await rm(drivingPath, { force: true });
      await rm(source.path, { force: true });
      await rm(driving.path, { force: true });
      throw error;
    } finally {
      await rm(source.path, { force: true });
      await rm(driving.path, { force: true });
    }
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const job = await this.jobsService.getJob(id);
    return {
      id: job.id,
      status: job.status,
      currentStep: job.currentStep,
      progress: job.progress,
      errorMessage: job.errorMessage,
      logs: job.logs,
      hasThumbnail: Boolean(job.previewThumbnailPath),
      hasResult: Boolean(job.outputVideoPath),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    };
  }

  @Get(':id/thumbnail')
  async getThumbnail(@Param('id') id: string, @Res() res: Response) {
    const thumbnailPath = await this.jobsService.getThumbnailPath(id);
    return res.sendFile(thumbnailPath);
  }

  @Get(':id/result')
  async getResult(@Param('id') id: string, @Res() res: Response) {
    const videoPath = await this.jobsService.getResultPath(id);
    return res.sendFile(videoPath);
  }
}
