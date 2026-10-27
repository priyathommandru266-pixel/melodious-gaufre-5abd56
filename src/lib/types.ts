/** Shared types for the File Converter Drop Box. Mirrors docs/API_CONTRACT.md. */

export type JobStatus =
  | 'PENDING_UPLOAD'
  | 'QUEUED'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'

export type ConversionType = 'TXT_TO_UPPERCASE' | 'CSV_TO_JSON' | 'PNG_TO_JPEG'

/** Where a job record came from. Only `aws` records reflect real cloud processing. */
export type JobSource = 'aws' | 'demo-sample' | 'demo-local'

export interface ConversionOption {
  id: ConversionType
  label: string
  description: string
  inputExtensions: string[]
  inputMimeTypes: string[]
  outputExtension: string
  outputMimeType: string
}

/** Response of GET /capabilities */
export interface Capabilities {
  service: string
  version: string
  maxUploadBytes: number
  conversions: Array<{
    id: string
    inputExtensions: string[]
    outputExtension: string
  }>
}

export interface Job {
  jobId: string
  originalFileName: string
  conversionType: ConversionType
  status: JobStatus
  createdAt: string
  updatedAt: string
  inputSize?: number
  contentType?: string
  outputFileName?: string
  outputSize?: number
  errorMessage?: string
  source: JobSource
}

/** Response of POST /jobs */
export interface CreateJobResponse {
  jobId: string
  status: JobStatus
  upload: {
    url: string
    fields: Record<string, string>
    expiresIn: number
    maxBytes: number
  }
}

export interface ListJobsResponse {
  items: Omit<Job, 'source'>[]
  nextToken?: string | null
}

export interface DownloadResponse {
  jobId: string
  fileName: string
  downloadUrl: string
  expiresIn: number
}
