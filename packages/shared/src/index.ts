export enum JobStatus {
  QUEUED = 'queued',
  PREPROCESSING = 'preprocessing',
  POSE_EXTRACTION = 'pose_extraction',
  GENERATION = 'generation',
  POSTPROCESSING = 'postprocessing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export type JobStep =
  | JobStatus.QUEUED
  | JobStatus.PREPROCESSING
  | JobStatus.POSE_EXTRACTION
  | JobStatus.GENERATION
  | JobStatus.POSTPROCESSING
  | JobStatus.COMPLETED
  | JobStatus.FAILED;

export interface JobLogEntry {
  at: string;
  message: string;
}

export interface JobRecord {
  id: string;
  status: JobStatus;
  currentStep: JobStep;
  progress: number;
  sourcePhotoPath: string;
  normalizedSourcePhotoPath?: string;
  drivingVideoPath: string;
  normalizedVideoPath?: string;
  previewThumbnailPath?: string;
  outputVideoPath?: string;
  logs: JobLogEntry[];
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}
