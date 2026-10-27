import type { JobStatus } from '@/lib/types'

export const STATUS_META: Record<JobStatus, { label: string; badge: string; dot: string }> = {
  PENDING_UPLOAD: { label: 'Awaiting upload', badge: 'bg-slate-100 text-slate-700 ring-slate-200', dot: 'bg-slate-400' },
  QUEUED: { label: 'Queued', badge: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-500' },
  PROCESSING: { label: 'Processing', badge: 'bg-blue-50 text-blue-700 ring-blue-200', dot: 'bg-blue-500 animate-pulse' },
  SUCCEEDED: { label: 'Succeeded', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  FAILED: { label: 'Failed', badge: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500' },
}

export const ALL_STATUSES = Object.keys(STATUS_META) as JobStatus[]

export function StatusBadge({ status }: { status: JobStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.PENDING_UPLOAD
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${m.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} aria-hidden />
      {m.label}
    </span>
  )
}

export type LedState = 'off' | 'uploading' | 'processing' | 'success' | 'error'

/** The on-screen replacement for the drop box's physical status LED. */
export function StatusLed({ state, size = 'md' }: { state: LedState; size?: 'md' | 'lg' }) {
  const color: Record<LedState, string> = {
    off: 'bg-slate-300 shadow-none',
    uploading: 'bg-blue-500 shadow-[0_0_14px_3px_rgba(59,130,246,0.55)] animate-pulse',
    processing: 'bg-violet-500 shadow-[0_0_14px_3px_rgba(139,92,246,0.55)] animate-pulse',
    success: 'bg-emerald-500 shadow-[0_0_14px_3px_rgba(16,185,129,0.5)]',
    error: 'bg-rose-500 shadow-[0_0_14px_3px_rgba(244,63,94,0.5)]',
  }
  const dim = size === 'lg' ? 'h-5 w-5' : 'h-3 w-3'
  return (
    <span className="relative inline-flex items-center justify-center rounded-full bg-slate-800 p-1 ring-2 ring-slate-200" aria-hidden>
      <span className={`block rounded-full ${dim} ${color[state]}`} />
    </span>
  )
}
