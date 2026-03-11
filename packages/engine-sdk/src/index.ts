import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createFinalOutputVideo, createMotionDrivenVideo } from '@motionapp/ffmpeg-utils';

export interface GenerationInput {
  sourcePhotoPath: string;
  normalizedDrivingVideoPath: string;
  generatedVideoPath: string;
  outputVideoPath: string;
  poseOutputDir: string;
  framesOutputDir: string;
  audioPath?: string;
}

export interface PoseExtractionInput {
  sourcePhotoPath: string;
  normalizedDrivingVideoPath: string;
  poseOutputDir: string;
}

export interface FrameGenerationInput {
  sourcePhotoPath: string;
  normalizedDrivingVideoPath: string;
  poseOutputDir: string;
  framesOutputDir: string;
  generatedVideoPath: string;
}

export interface VideoCompositionInput {
  generatedVideoPath: string;
  outputVideoPath: string;
  audioPath?: string;
}

export interface InferenceAdapter {
  extractPose(input: PoseExtractionInput): Promise<void>;
  generateFrames(input: FrameGenerationInput): Promise<void>;
  composeVideo(input: VideoCompositionInput): Promise<void>;
}

export interface MotionGenerationEngine {
  generate(input: GenerationInput): Promise<void>;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class AdapterBackedEngine implements MotionGenerationEngine {
  constructor(private readonly adapter: InferenceAdapter) {}

  async generate(input: GenerationInput): Promise<void> {
    await this.adapter.extractPose({
      sourcePhotoPath: input.sourcePhotoPath,
      normalizedDrivingVideoPath: input.normalizedDrivingVideoPath,
      poseOutputDir: input.poseOutputDir
    });

    await this.adapter.generateFrames({
      sourcePhotoPath: input.sourcePhotoPath,
      normalizedDrivingVideoPath: input.normalizedDrivingVideoPath,
      poseOutputDir: input.poseOutputDir,
      framesOutputDir: input.framesOutputDir,
      generatedVideoPath: input.generatedVideoPath
    });

    await this.adapter.composeVideo({
      generatedVideoPath: input.generatedVideoPath,
      outputVideoPath: input.outputVideoPath,
      audioPath: input.audioPath
    });
  }
}

export class MockInferenceAdapter implements InferenceAdapter {
  async extractPose(input: PoseExtractionInput): Promise<void> {
    await mkdir(input.poseOutputDir, { recursive: true });

    for (let i = 0; i < 5; i += 1) {
      await writeFile(
        path.join(input.poseOutputDir, `pose-${i.toString().padStart(4, '0')}.json`),
        JSON.stringify({ frame: i, keypoints: [{ x: 0.5, y: 0.5, confidence: 0.9 }] }, null, 2),
        'utf8'
      );
    }
  }

  async generateFrames(input: FrameGenerationInput): Promise<void> {
    await mkdir(input.framesOutputDir, { recursive: true });

    for (let i = 0; i < 5; i += 1) {
      await writeFile(
        path.join(input.framesOutputDir, `frame-${i.toString().padStart(4, '0')}.json`),
        JSON.stringify({ frame: i, source: input.sourcePhotoPath, driving: input.normalizedDrivingVideoPath }, null, 2),
        'utf8'
      );
      await sleep(200);
    }

    await createMotionDrivenVideo(input.sourcePhotoPath, input.normalizedDrivingVideoPath, input.generatedVideoPath);
  }

  async composeVideo(input: VideoCompositionInput): Promise<void> {
    await createFinalOutputVideo(input.generatedVideoPath, input.outputVideoPath, input.audioPath);
  }
}

export class LocalProcessInferenceAdapter implements InferenceAdapter {
  constructor(
    private readonly commands: {
      poseExtraction?: string;
      frameGeneration?: string;
      videoComposition?: string;
    } = {}
  ) {}

  private async runOrNoop(command: string | undefined, stage: string, args: Record<string, string | undefined>): Promise<void> {
    if (!command) {
      return;
    }

    const env = Object.fromEntries(
      Object.entries(args).filter(([, value]) => typeof value === 'string') as Array<[string, string]>
    );

    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, {
        shell: true,
        stdio: 'inherit',
        env: {
          ...process.env,
          ...env,
          ENGINE_STAGE: stage
        }
      });

      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`${stage} command failed with exit code ${code ?? 'unknown'}`));
      });
    });
  }

  async extractPose(input: PoseExtractionInput): Promise<void> {
    await mkdir(input.poseOutputDir, { recursive: true });
    await this.runOrNoop(this.commands.poseExtraction, 'pose-extraction', {
      SOURCE_PHOTO_PATH: input.sourcePhotoPath,
      NORMALIZED_DRIVING_VIDEO_PATH: input.normalizedDrivingVideoPath,
      POSE_OUTPUT_DIR: input.poseOutputDir
    });
  }

  async generateFrames(input: FrameGenerationInput): Promise<void> {
    await mkdir(input.framesOutputDir, { recursive: true });
    await this.runOrNoop(this.commands.frameGeneration, 'frame-generation', {
      SOURCE_PHOTO_PATH: input.sourcePhotoPath,
      NORMALIZED_DRIVING_VIDEO_PATH: input.normalizedDrivingVideoPath,
      POSE_OUTPUT_DIR: input.poseOutputDir,
      FRAMES_OUTPUT_DIR: input.framesOutputDir,
      GENERATED_VIDEO_PATH: input.generatedVideoPath
    });

    if (!this.commands.frameGeneration) {
      // Stub fallback until an external backend is configured.
      await createMotionDrivenVideo(input.sourcePhotoPath, input.normalizedDrivingVideoPath, input.generatedVideoPath);
    }
  }

  async composeVideo(input: VideoCompositionInput): Promise<void> {
    await this.runOrNoop(this.commands.videoComposition, 'video-composition', {
      GENERATED_VIDEO_PATH: input.generatedVideoPath,
      OUTPUT_VIDEO_PATH: input.outputVideoPath,
      AUDIO_PATH: input.audioPath
    });

    if (!this.commands.videoComposition) {
      // Stub fallback keeps current behavior when no composition command is provided.
      await createFinalOutputVideo(input.generatedVideoPath, input.outputVideoPath, input.audioPath);
    }
  }
}

export class MockEngine extends AdapterBackedEngine {
  constructor() {
    super(new MockInferenceAdapter());
  }
}

export class LocalProcessEngine extends AdapterBackedEngine {
  constructor(commands: { poseExtraction?: string; frameGeneration?: string; videoComposition?: string } = {}) {
    super(new LocalProcessInferenceAdapter(commands));
  }
}

export class RemoteHttpEngine extends AdapterBackedEngine {
  constructor() {
    // Placeholder: remote-http currently shares mock adapter behavior until a backend is implemented.
    super(new MockInferenceAdapter());
  }
}

export type EngineMode = 'mock' | 'local-process' | 'remote-http';

export const createEngineFromEnv = (env: NodeJS.ProcessEnv = process.env): MotionGenerationEngine => {
  const mode = (env.ENGINE ?? 'mock') as EngineMode;

  if (mode === 'local-process') {
    return new LocalProcessEngine({
      poseExtraction: env.LOCAL_PROCESS_POSE_COMMAND,
      frameGeneration: env.LOCAL_PROCESS_FRAME_COMMAND,
      videoComposition: env.LOCAL_PROCESS_COMPOSE_COMMAND
    });
  }

  if (mode === 'remote-http') {
    return new RemoteHttpEngine();
  }

  return new MockEngine();
};
