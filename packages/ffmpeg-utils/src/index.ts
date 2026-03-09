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

export const normalizeImage = async (inputPath: string, outputPath: string): Promise<void> => {
  await runFfmpeg([
    '-i',
    inputPath,
    '-vf',
    "scale='min(1024,iw)':'min(1024,ih)':force_original_aspect_ratio=decrease",
    '-frames:v',
    '1',
    outputPath
  ]);
};

export const extractThumbnail = async (inputPath: string, outputPath: string): Promise<void> => {
  await runFfmpeg(['-i', inputPath, '-vf', 'thumbnail,scale=640:-1', '-frames:v', '1', outputPath]);
};

export const extractAudio = async (inputPath: string, audioPath: string): Promise<void> => {
  await runFfmpeg(['-i', inputPath, '-vn', '-acodec', 'aac', audioPath]);
};

export const createFinalOutputVideo = async (
  generatedVideoPath: string,
  outputPath: string,
  audioPath?: string
): Promise<void> => {
  if (audioPath) {
    await runFfmpeg([
      '-i',
      generatedVideoPath,
      '-i',
      audioPath,
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-shortest',
      outputPath
    ]);
    return;
  }

  await runFfmpeg(['-i', generatedVideoPath, '-c:v', 'copy', '-an', outputPath]);
};
