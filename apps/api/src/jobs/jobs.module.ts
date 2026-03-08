import { Module } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import path from 'node:path';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { JsonJobRepository } from './job.repository';
import { env } from '../config/env';

@Module({
  controllers: [JobsController],
  providers: [
    {
      provide: JsonJobRepository,
      useFactory: async () => {
        const repo = new JsonJobRepository(path.join(env.storageRoot, 'jobs.json'));
        await repo.initialize();
        return repo;
      }
    },
    {
      provide: Queue,
      useFactory: () => {
        const connection = new Redis({ host: env.redisHost, port: env.redisPort, maxRetriesPerRequest: null });
        return new Queue('motion-jobs', { connection });
      }
    },
    { provide: 'STORAGE_ROOT', useValue: env.storageRoot },
    {
      provide: JobsService,
      useFactory: (repository: JsonJobRepository, queue: Queue, storageRoot: string) =>
        new JobsService(repository, queue, storageRoot),
      inject: [JsonJobRepository, Queue, 'STORAGE_ROOT']
    }
  ]
})
export class JobsModule {}
