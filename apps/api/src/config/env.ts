export interface AppEnv {
  port: number;
  redisHost: string;
  redisPort: number;
  storageRoot: string;
  webOrigin: string;
}

export const env: AppEnv = {
  port: Number(process.env.API_PORT ?? 4000),
  redisHost: process.env.REDIS_HOST ?? 'localhost',
  redisPort: Number(process.env.REDIS_PORT ?? 6379),
  storageRoot: process.env.STORAGE_ROOT ?? 'storage',
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000'
};
