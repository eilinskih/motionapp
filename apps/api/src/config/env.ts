export interface AppEnv {
  port: number;
  redisHost: string;
  redisPort: number;
  storageRoot: string;
  webOrigin: string;
}

const parsePort = (value: string | undefined, fallback: number, name: string): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid ${name}: ${value}. Expected an integer between 1 and 65535.`);
  }
  return parsed;
};

export const env: AppEnv = {
  port: parsePort(process.env.API_PORT, 4000, 'API_PORT'),
  redisHost: process.env.REDIS_HOST ?? 'localhost',
  redisPort: parsePort(process.env.REDIS_PORT, 6379, 'REDIS_PORT'),
  storageRoot: process.env.STORAGE_ROOT ?? 'storage',
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000'
};
