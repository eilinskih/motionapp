import { createFinalOutputVideo } from '@motionapp/ffmpeg-utils';

export interface GenerationInput {
  sourcePhotoPath: string;
  normalizedDrivingVideoPath: string;
  outputVideoPath: string;
}

export interface MotionGenerationEngine {
  generate(input: GenerationInput): Promise<void>;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class MockEngine implements MotionGenerationEngine {
  async generate(input: GenerationInput): Promise<void> {
    await sleep(1200);
    await createFinalOutputVideo(input.normalizedDrivingVideoPath, input.outputVideoPath);
  }
}
