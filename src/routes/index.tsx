import { createFileRoute, Link } from '@tanstack/react-router'
import {
  AlertOctagon,
  CheckCircle2,
  Clock3,
  Database,
  FolderInput,
  FolderOutput,
  Layers,
  RefreshCw,
  UploadCloud,
  Inbox,
  CloudOff,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { ALL_CONVERSIONS } from '@/lib/conversions'
import { formatBytes } from '@/lib/format'
import { computeStats } from '@/lib/stats'
import { Card, CardHeader, EmptyState, PageHeader, Spinner, btn } from '@/components/ui'
import { JobsTable, TYPE_ICON } from '@/components/JobsTable'
import { ALL_STATUSES, STATUS_META } from '@/components/StatusBadge'

export const Route = createFileRoute('/')({
  component: Dashboard,
})

function StatCard({ label, value, icon: Icon, tone, hint }: { label: string; value: string | number; icon: typeof Layers; tone: string; hint: string }) {
  return (
    <Card as="div" className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </Card>
  )
}

function Dashboard() {
  const { mode, jobs, jobsState, jobsError, refresh, conversionOptions, lastLoadedAt, setDemoEnabled } = useApp()
  const stats = computeStats(jobs)
  const loading = jobsState === 'loading'
  const sourceHint = mode === 'live' ? 'From DynamoDB job records' : mode === 'demo' ? 'Demo sample data' : 'No backend connected'
  const supported = new Set(conversionOptions.map((o) => o.id))
  const recent = [...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6)
  const storageTotal = stats.inputBytes + stats.outputBytes

  return (
    <>
      <PageHeader
        title="File Converter Cloud Dashboard"
        description="Drop a file in the virtual drop box, choose a format and let serverless AWS Lambda convert it. Track every job from upload to download."
        actions={
          <>
            <button type="button" onClick={() => refresh()} disabled={loading || mode === 'offline'} className={btn.secondary}>
              {loading ? <Spinner /> : <RefreshCw className="h-4 w-4" aria-hidden />}
              Refresh
            </button>
            <Link to="/convert" className={`${btn.primary} px-5 py-3 text-base`}>
              <UploadCloud className="h-5 w-5" aria-hidden />
              Upload &amp; Convert
            </Link>
          </>
        }
      />

      {jobsError && (
        <div role="alert" className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <strong>Could not load jobs:</strong> {jobsError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total conversion jobs" value={stats.total} icon={Layers} tone="bg-indigo-50 text-indigo-600" hint={sourceHint} />
        <StatCard label="Successful conversions" value={stats.succeeded} icon={CheckCircle2} tone="bg-emerald-50 text-emerald-600" hint={stats.total ? `${Math.round((stats.succeeded / stats.total) * 100)}% success rate` : sourceHint} />
        <StatCard label="Failed conversions" value={stats.failed} icon={AlertOctagon} tone="bg-rose-50 text-rose-600" hint="Open History to see error details" />
        <StatCard label="Waiting for processing" value={stats.waiting} icon={Clock3} tone="bg-amber-50 text-amber-600" hint="Awaiting upload, queued or processing" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Recent conversion activity"
            subtitle={lastLoadedAt ? `Updated ${lastLoadedAt.toLocaleTimeString()}` : undefined}
            action={<Link to="/history" className={btn.ghost}>View all</Link>}
          />
          {mode === 'offline' ? (
            <EmptyState icon={<CloudOff className="h-6 w-6" />} title="No backend connected">
              Configure <code>VITE_API_BASE_URL</code> to load real jobs from DynamoDB, or{' '}
              <button type="button" onClick={() => setDemoEnabled(true)} className="font-semibold text-indigo-700 underline underline-offset-2 focus-ring rounded">
                preview with demo data
              </button>
              .
            </EmptyState>
          ) : loading && jobs.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Spinner /> Loading jobs…</div>
          ) : recent.length === 0 ? (
            <EmptyState icon={<Inbox className="h-6 w-6" />} title="No conversions yet">
              Upload your first file to see it here.
            </EmptyState>
          ) : (
            <JobsTable jobs={recent} compact />
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="File types" subtitle={mode === 'live' ? 'Reported by the AWS backend' : mode === 'demo' ? 'Available in demo mode' : 'Configure a backend to enable'} />
            <ul className="divide-y divide-slate-100">
              {ALL_CONVERSIONS.map((c) => {
                const Icon = TYPE_ICON[c.id]
                const on = supported.has(c.id)
                const count = stats.byType[c.id]
                return (
                  <li key={c.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${on ? 'bg-gradient-to-br from-blue-50 to-violet-50 text-indigo-600 ring-1 ring-indigo-100' : 'bg-slate-100 text-slate-400'}`}>
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">{c.label}</p>
                      <p className="text-xs text-slate-500">.{c.inputExtensions[0]} → .{c.outputExtension} · {count} job{count === 1 ? '' : 's'}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${on ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {on ? (mode === 'demo' ? 'Local demo' : 'Available') : mode === 'demo' ? 'Needs AWS' : 'Unavailable'}
                    </span>
                  </li>
                )
              })}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Storage overview" subtitle={mode === 'live' ? 'Totals from loaded job records' : mode === 'demo' ? 'Demo sample figures' : 'No data'} icon={<Database className="h-5 w-5" aria-hidden />} />
            <div className="space-y-4 px-5 py-4 sm:px-6">
              {[
                { label: 'Input files (S3 uploads bucket)', value: stats.inputBytes, icon: FolderInput, bar: 'from-blue-500 to-blue-400' },
                { label: 'Converted files (S3 output bucket)', value: stats.outputBytes, icon: FolderOutput, bar: 'from-violet-500 to-violet-400' },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-600"><row.icon className="h-4 w-4 text-slate-400" aria-hidden />{row.label}</span>
                    <span className="font-semibold tabular-nums text-slate-900">{formatBytes(row.value)}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="presentation">
                    <div className={`h-full rounded-full bg-gradient-to-r ${row.bar}`} style={{ width: `${storageTotal ? Math.max(2, (row.value / storageTotal) * 100) : 0}%` }} />
                  </div>
                </div>
              ))}
              <p className="text-xs text-slate-500">Buckets are private. Files are only reachable through short-lived presigned URLs.</p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Job status indicators" />
            <ul className="grid grid-cols-1 gap-2 px-5 py-4 text-sm sm:grid-cols-2 sm:px-6 xl:grid-cols-1">
              {ALL_STATUSES.map((s) => (
                <li key={s} className="flex items-center gap-2 text-slate-700">
                  <span className={`h-2.5 w-2.5 rounded-full ${STATUS_META[s].dot}`} aria-hidden />
                  <span className="font-medium">{STATUS_META[s].label}</span>
                  <span className="ml-auto tabular-nums text-slate-500">{jobs.filter((j) => j.status === s).length}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  )
}
