/**
 * Client for the File Converter REST API (see docs/API_CONTRACT.md).
 * The browser never holds AWS credentials: it calls the API Gateway endpoint,
 * which returns short-lived presigned S3 URLs for upload and download.
 */
import { API_BASE_URL, isBackendConfigured, POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from './config'
import type {
  Capabilities,
  CreateJobResponse,
  DownloadResponse,
  Job,
  ListJobsResponse,
} from './types'

export class ApiError extends Error {
  status: number
  code: string
  constructor(message: string, status: number, code: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!isBackendConfigured) {
    throw new ApiError('Backend not configured. Set VITE_API_BASE_URL.', 0, 'NOT_CONFIGURED')
  }
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    })
  } catch {
    throw new ApiError(
      'Could not reach the backend API. Check VITE_API_BASE_URL, the API CORS settings and your network connection.',
      0,
      'NETWORK_ERROR',
    )
  }
  const text = await res.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    throw new ApiError(
      data?.error?.message ?? `The backend returned HTTP ${res.status}.`,
      res.status,
      data?.error?.code ?? 'HTTP_ERROR',
    )
  }
  return data as T
}

const withSource = (j: Omit<Job, 'source'>): Job => ({ ...j, source: 'aws' })

export const api = {
  getCapabilities: () => request<Capabilities>('/capabilities'),

  createJob: (body: {
    fileName: string
    contentType: string
    size: number
    conversionType: string
  }) => request<CreateJobResponse>('/jobs', { method: 'POST', body: JSON.stringify(body) }),

  startConversion: (jobId: string) =>
    request<{ jobId: string; status: Job['status'] }>(
      `/jobs/${encodeURIComponent(jobId)}/convert`,
      { method: 'POST' },
    ),

  getJob: async (jobId: string) =>
    withSource(await request<Omit<Job, 'source'>>(`/jobs/${encodeURIComponent(jobId)}`)),

  listJobs: async (nextToken?: string | null) => {
    const qs = new URLSearchParams({ limit: '50' })
    if (nextToken) qs.set('nextToken', nextToken)
    const res = await request<ListJobsResponse>(`/jobs?${qs}`)
    return { items: res.items.map(withSource), nextToken: res.nextToken ?? null }
  },

  getDownload: (jobId: string) =>
    request<DownloadResponse>(`/jobs/${encodeURIComponent(jobId)}/download`),
}

/** Upload directly to S3 using the presigned POST returned by POST /jobs. */
export function uploadToS3(
  upload: CreateJobResponse['upload'],
  file: File,
  onProgress: (percent: number | null) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    for (const [k, v] of Object.entries(upload.fields)) form.append(k, v)
    form.append('file', file) // must be the last field

    const xhr = new XMLHttpRequest()
    xhr.open('POST', upload.url)
    xhr.upload.onprogress = (e) =>
      onProgress(e.lengthComputable ? Math.round((e.loaded / e.total) * 100) : null)
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      const msg = /<Message>([^<]+)<\/Message>/.exec(xhr.responseText)?.[1]
      reject(new ApiError(`S3 rejected the upload${msg ? `: ${msg}` : ''} (HTTP ${xhr.status}).`, xhr.status, 'UPLOAD_REJECTED'))
    }
    xhr.onerror = () =>
      reject(new ApiError('Upload to S3 failed. Check the bucket CORS configuration.', 0, 'UPLOAD_NETWORK_ERROR'))
    xhr.send(form)
  })
}

/** Poll GET /jobs/{id} until the job finishes, fails or the timeout expires. */
export async function pollJob(jobId: string, onUpdate: (job: Job) => void): Promise<Job> {
  const started = Date.now()
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const job = await api.getJob(jobId)
    onUpdate(job)
    if (job.status === 'SUCCEEDED' || job.status === 'FAILED') return job
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  throw new ApiError(
    'The conversion is taking longer than expected. Check the History page later for its final status.',
    0,
    'POLL_TIMEOUT',
  )
}
