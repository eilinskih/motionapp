import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createFinalOutputVideo, createMockGeneratedVideo } from '@motionapp/ffmpeg-utils';

export interface GenerationInput {
  sourcePhotoPath: string;
  normalizedDrivingVideoPath: string;
  generatedVideoPath: string;
  outputVideoPath: string;
  poseOutputDir: string;
  framesOutputDir: string;
  audioPath?: string;
}

export interface MotionGenerationEngine {
  generate(input: GenerationInput): Promise<void>;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class MockEngine implements MotionGenerationEngine {
  async generate(input: GenerationInput): Promise<void> {
    await mkdir(input.poseOutputDir, { recursive: true });
    await mkdir(input.framesOutputDir, { recursive: true });

    for (let i = 0; i < 5; i += 1) {
      await writeFile(
        path.join(input.poseOutputDir, `pose-${i.toString().padStart(4, '0')}.json`),
        JSON.stringify({ frame: i, keypoints: [{ x: 0.5, y: 0.5, confidence: 0.9 }] }, null, 2),
        'utf8'
      );
    }

    for (let i = 0; i < 5; i += 1) {
      await writeFile(
        path.join(input.framesOutputDir, `frame-${i.toString().padStart(4, '0')}.json`),
        JSON.stringify({ frame: i, source: input.sourcePhotoPath, driving: input.normalizedDrivingVideoPath }, null, 2),
        'utf8'
      );
      await sleep(200);
    }

    // Mock generation result: apply a deterministic visual transform so output differs from raw driving video.
    await createMockGeneratedVideo(input.normalizedDrivingVideoPath, input.generatedVideoPath);

    // Final composition preserves extracted audio when available.
    await createFinalOutputVideo(input.generatedVideoPath, input.outputVideoPath, input.audioPath);
  }
}
