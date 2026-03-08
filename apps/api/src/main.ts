import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: env.webOrigin });
  await app.listen(env.port);
  // eslint-disable-next-line no-console
  console.log(`API listening on :${env.port}`);
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Application bootstrap failed', error);
  process.exit(1);
});
