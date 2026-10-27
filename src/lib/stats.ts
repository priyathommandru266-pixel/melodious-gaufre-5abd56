import type { ConversionType, Job } from './types'

export function computeStats(jobs: Job[]) {
  const byType: Record<ConversionType, number> = {
    TXT_TO_UPPERCASE: 0,
    CSV_TO_JSON: 0,
    PNG_TO_JPEG: 0,
  }
  let succeeded = 0
  let failed = 0
  let waiting = 0
  let inputBytes = 0
  let outputBytes = 0
  for (const j of jobs) {
    if (j.status === 'SUCCEEDED') succeeded++
    else if (j.status === 'FAILED') failed++
    else waiting++
    if (j.conversionType in byType) byType[j.conversionType]++
    inputBytes += j.inputSize ?? 0
    outputBytes += j.outputSize ?? 0
  }
  return { total: jobs.length, succeeded, failed, waiting, byType, inputBytes, outputBytes }
}
