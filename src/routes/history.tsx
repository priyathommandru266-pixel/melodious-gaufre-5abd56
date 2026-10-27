import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { CloudOff, Inbox, RefreshCw, Search, UploadCloud } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { ALL_CONVERSIONS, conversionLabel } from '@/lib/conversions'
import type { ConversionType, JobStatus } from '@/lib/types'
import { Card, EmptyState, PageHeader, Spinner, btn } from '@/components/ui'
import { JobsTable } from '@/components/JobsTable'
import { ALL_STATUSES, STATUS_META } from '@/components/StatusBadge'

export const Route = createFileRoute('/history')({
  component: HistoryPage,
})

type SortKey = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'status'

const fieldCls =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30'

function HistoryPage() {
  const { mode, jobs, jobsState, jobsError, refresh, hasMoreJobs, loadMoreJobs, setDemoEnabled } = useApp()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<JobStatus | 'ALL'>('ALL')
  const [type, setType] = useState<ConversionType | 'ALL'>('ALL')
  const [sort, setSort] = useState<SortKey>('newest')
  const [loadingMore, setLoadingMore] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = jobs.filter(
      (j) =>
        (status === 'ALL' || j.status === status) &&
        (type === 'ALL' || j.conversionType === type) &&
        (!q ||
          j.originalFileName.toLowerCase().includes(q) ||
          j.jobId.toLowerCase().includes(q) ||
          (j.outputFileName ?? '').toLowerCase().includes(q) ||
          conversionLabel(j.conversionType).toLowerCase().includes(q)),
    )
    const cmp: Record<SortKey, (a: (typeof rows)[0], b: (typeof rows)[0]) => number> = {
      newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
      oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
      'name-asc': (a, b) => a.originalFileName.localeCompare(b.originalFileName),
      'name-desc': (a, b) => b.originalFileName.localeCompare(a.originalFileName),
      status: (a, b) => ALL_STATUSES.indexOf(a.status) - ALL_STATUSES.indexOf(b.status),
    }
    return [...rows].sort(cmp[sort])
  }, [jobs, query, status, type, sort])

  const loading = jobsState === 'loading'
  const filtersActive = query || status !== 'ALL' || type !== 'ALL'

  return (
    <>
      <PageHeader
        title="Conversion History"
        description={
          mode === 'live'
            ? 'Every job recorded in Amazon DynamoDB, newest first.'
            : mode === 'demo'
              ? 'DEMO MODE — sample jobs plus anything you converted locally this session. Nothing here is stored in the cloud.'
              : 'History is loaded from DynamoDB once the backend is configured.'
        }
        actions={
          <>
            <button type="button" onClick={() => refresh()} disabled={loading || mode === 'offline'} className={btn.secondary}>
              {loading ? <Spinner /> : <RefreshCw className="h-4 w-4" aria-hidden />} Refresh
            </button>
            <Link to="/convert" className={btn.primary}><UploadCloud className="h-4 w-4" aria-hidden /> Upload &amp; Convert</Link>
          </>
        }
      />

      <Card>
        <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <label htmlFor="h-search" className="sr-only">Search jobs</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input id="h-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search file name or job ID" className={`${fieldCls} pl-9`} />
          </div>
          <div>
            <label htmlFor="h-status" className="sr-only">Filter by status</label>
            <select id="h-status" value={status} onChange={(e) => setStatus(e.target.value as JobStatus | 'ALL')} className={fieldCls}>
              <option value="ALL">All statuses</option>
              {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="h-type" className="sr-only">Filter by conversion type</label>
            <select id="h-type" value={type} onChange={(e) => setType(e.target.value as ConversionType | 'ALL')} className={fieldCls}>
              <option value="ALL">All conversion types</option>
              {ALL_CONVERSIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="h-sort" className="sr-only">Sort jobs</label>
            <select id="h-sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={fieldCls}>
              <option value="newest">Sort: Newest first</option>
              <option value="oldest">Sort: Oldest first</option>
              <option value="name-asc">Sort: File name A–Z</option>
              <option value="name-desc">Sort: File name Z–A</option>
              <option value="status">Sort: Status</option>
            </select>
          </div>
        </div>

        {jobsError && (
          <div role="alert" className="m-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <strong>Could not load history from the backend:</strong> {jobsError}
          </div>
        )}

        {mode === 'offline' ? (
          <EmptyState icon={<CloudOff className="h-6 w-6" />} title="Backend not configured">
            Set <code>VITE_API_BASE_URL</code> to load history from DynamoDB, or{' '}
            <button type="button" onClick={() => setDemoEnabled(true)} className="font-semibold text-indigo-700 underline underline-offset-2 focus-ring rounded">enable demo mode</button>.
          </EmptyState>
        ) : loading && jobs.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Spinner /> Loading history…</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Inbox className="h-6 w-6" />} title={filtersActive ? 'No jobs match your filters' : 'No conversion jobs yet'}>
            {filtersActive ? (
              <button type="button" onClick={() => { setQuery(''); setStatus('ALL'); setType('ALL') }} className="font-semibold text-indigo-700 underline underline-offset-2 focus-ring rounded">Clear filters</button>
            ) : (
              'Converted files will appear here.'
            )}
          </EmptyState>
        ) : (
          <JobsTable jobs={filtered} />
        )}

        <div className="flex flex-col items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-500 sm:flex-row sm:px-6">
          <span aria-live="polite">Showing {filtered.length} of {jobs.length} loaded job{jobs.length === 1 ? '' : 's'}</span>
          {hasMoreJobs && (
            <button
              type="button"
              disabled={loadingMore}
              onClick={async () => { setLoadingMore(true); await loadMoreJobs(); setLoadingMore(false) }}
              className={btn.ghost}
            >
              {loadingMore && <Spinner />} Load older jobs
            </button>
          )}
        </div>
      </Card>
    </>
  )
}
