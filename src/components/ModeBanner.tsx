import { Link } from '@tanstack/react-router'
import { AlertTriangle, CloudOff, FlaskConical, RefreshCw } from 'lucide-react'
import { useApp } from '@/context/AppContext'

/** Always-visible explanation of where data comes from. Never implies AWS is connected unless it is. */
export function ModeBanner() {
  const { mode, backendConfigured, setDemoEnabled, capabilitiesState, capabilitiesError, refresh } = useApp()

  if (mode === 'demo') {
    return (
      <div role="status" className="border-b border-amber-200 bg-amber-50">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-2.5 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p className="flex items-start gap-2">
            <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              <strong className="rounded bg-amber-900 px-1.5 py-0.5 text-xs font-bold tracking-wider text-amber-50">DEMO MODE</strong>{' '}
              Sample jobs are illustrative. TXT files convert locally in your browser — nothing is uploaded to S3 or saved to DynamoDB.
            </span>
          </p>
          <div className="flex shrink-0 gap-3 pl-6 sm:pl-0">
            <Link to="/setup" className="font-semibold underline underline-offset-2 hover:text-amber-700 focus-ring rounded">
              Connect AWS
            </Link>
            <button type="button" onClick={() => setDemoEnabled(false)} className="font-semibold underline underline-offset-2 hover:text-amber-700 focus-ring rounded">
              Exit demo
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'offline') {
    return (
      <div role="status" className="border-b border-slate-200 bg-slate-100">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-2.5 text-sm text-slate-800 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p className="flex items-start gap-2">
            <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
            <span>
              <strong>Backend not configured.</strong> Set <code className="rounded bg-white px-1 py-0.5 text-xs">VITE_API_BASE_URL</code> to your API Gateway URL to enable real cloud conversion.
            </span>
          </p>
          <div className="flex shrink-0 gap-3 pl-6 sm:pl-0">
            <button type="button" onClick={() => setDemoEnabled(true)} className="font-semibold text-indigo-700 underline underline-offset-2 hover:text-indigo-900 focus-ring rounded">
              Try demo mode
            </button>
            <Link to="/setup" className="font-semibold text-indigo-700 underline underline-offset-2 hover:text-indigo-900 focus-ring rounded">
              Setup guide
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (backendConfigured && capabilitiesState === 'error') {
    return (
      <div role="alert" className="border-b border-rose-200 bg-rose-50">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-2.5 text-sm text-rose-900 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              <strong>Backend unreachable.</strong> {capabilitiesError} No conversions can run until the API responds.
            </span>
          </p>
          <div className="flex shrink-0 gap-3 pl-6 sm:pl-0">
            <button type="button" onClick={() => refresh()} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 focus-ring rounded">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry
            </button>
            <button type="button" onClick={() => setDemoEnabled(true)} className="font-semibold underline underline-offset-2 focus-ring rounded">
              Use demo mode
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}

export function ModePill() {
  const { mode, capabilitiesState } = useApp()
  if (mode === 'demo')
    return <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold tracking-wider text-amber-800 ring-1 ring-amber-300">DEMO MODE</span>
  if (mode === 'offline')
    return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">Backend not configured</span>
  const ok = capabilitiesState === 'ready'
  const label = ok ? 'AWS backend connected' : capabilitiesState === 'error' ? 'AWS backend unreachable' : 'Checking AWS backend…'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${ok ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : capabilitiesState === 'error' ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-slate-50 text-slate-600 ring-slate-200'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-500' : capabilitiesState === 'error' ? 'bg-rose-500' : 'bg-slate-400 animate-pulse'}`} aria-hidden />
      {label}
    </span>
  )
}
