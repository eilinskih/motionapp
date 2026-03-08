import { spawn } from 'node:child_process';

const runFfmpeg = (args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-y', ...args]);
    let stderr = '';

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg failed (${code}): ${stderr}`));
      }
    });

    proc.on('error', reject);
  });

export const normalizeToMp4 = async (inputPath: string, outputPath: string): Promise<void> => {
  await runFfmpeg([
    '-i',
    inputPath,
    '-vf',
    "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease",
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    outputPath
  ]);
};

export const extractAudio = async (inputPath: string, audioPath: string): Promise<void> => {
  await runFfmpeg(['-i', inputPath, '-vn', '-acodec', 'aac', audioPath]);
};

export const createFinalOutputVideo = async (
  normalizedVideoPath: string,
  outputPath: string
): Promise<void> => {
  await runFfmpeg(['-i', normalizedVideoPath, '-c:v', 'copy', '-c:a', 'copy', outputPath]);
};
