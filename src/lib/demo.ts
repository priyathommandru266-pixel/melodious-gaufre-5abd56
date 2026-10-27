/**
 * DEMO MODE fixtures. Nothing in this file touches AWS.
 * Sample jobs are illustrative records only — they were never uploaded to S3
 * or stored in DynamoDB, and they have no downloadable output.
 */
import type { Job } from './types'

function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

export function getSampleJobs(): Job[] {
  const rows: Array<Omit<Job, 'source' | 'updatedAt'> & { updatedAgo?: number }> = [
    { jobId: 'demo-7f3a91c2', originalFileName: 'lab-notes.txt', conversionType: 'TXT_TO_UPPERCASE', status: 'SUCCEEDED', createdAt: ago(12), inputSize: 4_812, outputFileName: 'lab-notes_uppercase.txt', outputSize: 4_812 },
    { jobId: 'demo-2b8e44d0', originalFileName: 'student-marks.csv', conversionType: 'CSV_TO_JSON', status: 'SUCCEEDED', createdAt: ago(35), inputSize: 18_340, outputFileName: 'student-marks.json', outputSize: 41_207 },
    { jobId: 'demo-c91d07aa', originalFileName: 'architecture-diagram.png', conversionType: 'PNG_TO_JPEG', status: 'PROCESSING', createdAt: ago(2), inputSize: 1_482_113 },
    { jobId: 'demo-5e60b3f7', originalFileName: 'sensor-readings.csv', conversionType: 'CSV_TO_JSON', status: 'FAILED', createdAt: ago(58), inputSize: 9_904, errorMessage: 'CSV parse error on line 14: row has 5 columns, header has 4.' },
    { jobId: 'demo-a4f28e19', originalFileName: 'team-photo.png', conversionType: 'PNG_TO_JPEG', status: 'SUCCEEDED', createdAt: ago(95), inputSize: 3_206_550, outputFileName: 'team-photo.jpg', outputSize: 612_480 },
    { jobId: 'demo-0d17c6b5', originalFileName: 'readme-draft.txt', conversionType: 'TXT_TO_UPPERCASE', status: 'QUEUED', createdAt: ago(1), inputSize: 1_120 },
    { jobId: 'demo-e83b52f1', originalFileName: 'inventory.csv', conversionType: 'CSV_TO_JSON', status: 'SUCCEEDED', createdAt: ago(240), inputSize: 52_118, outputFileName: 'inventory.json', outputSize: 120_944 },
    { jobId: 'demo-91ac3d6e', originalFileName: 'logo-transparent.png', conversionType: 'PNG_TO_JPEG', status: 'FAILED', createdAt: ago(420), inputSize: 11_904_221, errorMessage: 'File exceeds the 10 MB server-side upload limit.' },
    { jobId: 'demo-4c2f9b80', originalFileName: 'assignment-1.txt', conversionType: 'TXT_TO_UPPERCASE', status: 'SUCCEEDED', createdAt: ago(1440), inputSize: 2_960, outputFileName: 'assignment-1_uppercase.txt', outputSize: 2_960 },
    { jobId: 'demo-b7e1a0d4', originalFileName: 'attendance.csv', conversionType: 'CSV_TO_JSON', status: 'PENDING_UPLOAD', createdAt: ago(5) },
  ]
  return rows.map((r) => ({ ...r, updatedAt: r.createdAt, source: 'demo-sample' }))
}

/** Real TXT → uppercase conversion, performed entirely in the browser. */
export async function convertTxtLocally(file: File): Promise<{ blob: Blob; outputFileName: string }> {
  const text = await file.text()
  const base = file.name.replace(/\.[^.]+$/, '')
  return {
    blob: new Blob([text.toUpperCase()], { type: 'text/plain;charset=utf-8' }),
    outputFileName: `${base}_uppercase.txt`,
  }
}
