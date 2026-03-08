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
  | JobStatus.PREPROCESSING
  | JobStatus.POSE_EXTRACTION
  | JobStatus.GENERATION
  | JobStatus.POSTPROCESSING;

export interface JobLogEntry {
  at: string;
  message: string;
}

export interface JobRecord {
  id: string;
  status: JobStatus;
  sourcePhotoPath: string;
  drivingVideoPath: string;
  normalizedVideoPath?: string;
  outputVideoPath?: string;
  logs: JobLogEntry[];
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}
