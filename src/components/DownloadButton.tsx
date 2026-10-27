import { useState } from 'react'
import { Download } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/context/ToastContext'
import type { Job } from '@/lib/types'
import { btn, Spinner } from './ui'

function triggerDownload(href: string, fileName: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = fileName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/**
 * Downloads a converted file.
 * - aws:        asks the API for a short-lived presigned S3 URL (bucket stays private).
 * - demo-local: downloads the blob produced in the browser.
 * - demo-sample: no file exists, so the button is disabled.
 */
export function DownloadButton({ job, variant = 'ghost' }: { job: Job; variant?: 'ghost' | 'primary' }) {
  const { getLocalDemoOutput } = useApp()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  if (job.status !== 'SUCCEEDED') return <span className="text-sm text-slate-400">—</span>

  if (job.source === 'demo-sample') {
    return (
      <span className="text-xs text-slate-400" title="Sample record — no real file exists">
        Sample only
      </span>
    )
  }

  async function onClick() {
    if (job.source === 'demo-local') {
      const blob = getLocalDemoOutput(job.jobId)
      if (!blob) {
        toast({ kind: 'error', title: 'Demo file no longer available', message: 'Local demo files are kept only until the page is reloaded.' })
        return
      }
      const url = URL.createObjectURL(blob)
      triggerDownload(url, job.outputFileName ?? 'output.txt')
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      return
    }
    setBusy(true)
    try {
      const res = await api.getDownload(job.jobId)
      triggerDownload(res.downloadUrl, res.fileName)
    } catch (e) {
      toast({ kind: 'error', title: 'Download failed', message: e instanceof ApiError ? e.message : 'Could not create a download link.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" onClick={onClick} disabled={busy} className={variant === 'primary' ? btn.primary : btn.ghost} aria-label={`Download ${job.outputFileName ?? 'converted file'}`}>
      {busy ? <Spinner /> : <Download className="h-4 w-4" aria-hidden />}
      {variant === 'primary' ? `Download ${job.outputFileName ?? ''}` : 'Download'}
    </button>
  )
}
