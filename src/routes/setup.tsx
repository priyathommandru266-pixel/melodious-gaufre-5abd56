import { createFileRoute } from '@tanstack/react-router'
import { ArrowDown, ArrowRight, CheckCircle2, CircleDashed, Cloud, Database, Globe, HardDrive, KeyRound, RefreshCw, Server, Zap, XCircle } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { API_BASE_URL, CLIENT_MAX_UPLOAD_BYTES } from '@/lib/config'
import { formatBytes } from '@/lib/format'
import { Card, CardHeader, PageHeader, Spinner, btn } from '@/components/ui'

export const Route = createFileRoute('/setup')({
  component: SetupPage,
})

type Health = 'ok' | 'pending' | 'unknown' | 'error'

function HealthIcon({ h }: { h: Health }) {
  if (h === 'ok') return <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-label="Connected" />
  if (h === 'error') return <XCircle className="h-4 w-4 text-rose-500" aria-label="Error" />
  if (h === 'pending') return <Spinner className="h-4 w-4 text-slate-400" />
  return <CircleDashed className="h-4 w-4 text-slate-400" aria-label="Not verified" />
}

const FEATURES: Array<{ name: string; status: 'done' | 'aws' | 'todo'; note: string }> = [
  { name: 'Responsive dashboard, upload page, history page', status: 'done', note: 'Works in every mode.' },
  { name: 'File validation (extension, MIME type, size, PNG signature, binary check)', status: 'done', note: 'Repeated on the server.' },
  { name: 'Demo mode with labelled sample data', status: 'done', note: 'No AWS calls are made.' },
  { name: 'Local TXT → uppercase conversion (demo)', status: 'done', note: 'Runs in the browser only.' },
  { name: 'Presigned S3 upload with progress', status: 'aws', note: 'Needs the API + uploads bucket.' },
  { name: 'TXT → uppercase, CSV → JSON, PNG → JPEG (sharp) on Lambda', status: 'aws', note: 'Code in aws/lambdas/converter.' },
  { name: 'Job status + history in DynamoDB', status: 'aws', note: 'Table + GSI from aws/template.yaml.' },
  { name: 'Secure downloads via presigned S3 URLs', status: 'aws', note: 'URLs expire after 5 minutes.' },
  { name: 'User accounts / per-user history', status: 'todo', note: 'All visitors share one history.' },
  { name: 'Malware scanning of uploads', status: 'todo', note: 'Recommended for production.' },
]

function SetupPage() {
  const { mode, backendConfigured, capabilities, capabilitiesState, capabilitiesError, refresh, jobsState } = useApp()
  const apiHealth: Health = !backendConfigured ? 'unknown' : capabilitiesState === 'ready' ? 'ok' : capabilitiesState === 'error' ? 'error' : 'pending'
  const dbHealth: Health = mode !== 'live' ? 'unknown' : jobsState === 'ready' ? 'ok' : jobsState === 'error' ? 'error' : 'pending'

  const pipeline = [
    { icon: Globe, title: 'Netlify', detail: 'Hosts this React frontend', health: 'ok' as Health },
    { icon: Server, title: 'API Gateway + API Lambda', detail: backendConfigured ? 'GET /capabilities' : 'VITE_API_BASE_URL not set', health: apiHealth },
    { icon: HardDrive, title: 'S3 uploads bucket', detail: 'Private · presigned POST', health: 'unknown' as Health },
    { icon: Zap, title: 'Converter Lambda', detail: 'Invoked async by the API', health: 'unknown' as Health },
    { icon: HardDrive, title: 'S3 output bucket', detail: 'Private · presigned GET', health: 'unknown' as Health },
    { icon: Database, title: 'DynamoDB jobs table', detail: mode === 'live' ? 'GET /jobs' : 'Not checked', health: dbHealth },
  ]

  return (
    <>
      <PageHeader
        title="AWS Setup & Status"
        description="How the drop box connects to AWS, what is verified right now, and which features need cloud configuration."
        actions={backendConfigured ? <button type="button" onClick={() => refresh()} className={btn.secondary}><RefreshCw className="h-4 w-4" aria-hidden /> Re-check backend</button> : undefined}
      />

      <Card className="mb-6">
        <CardHeader title="Architecture" subtitle="Ticks only appear after a real API response. S3 and Lambda are verified indirectly when a conversion succeeds." icon={<Cloud className="h-5 w-5" aria-hidden />} />
        <ol className="flex flex-col items-stretch gap-2 p-5 sm:p-6 xl:flex-row xl:items-center">
          {pipeline.map((p, i) => (
            <li key={p.title} className="flex flex-col items-center gap-2 xl:flex-1 xl:flex-row">
              <div className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200"><p.icon className="h-4 w-4" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{p.title}</p>
                  <p className="truncate text-xs text-slate-500">{p.detail}</p>
                </div>
                <HealthIcon h={p.health} />
              </div>
              {i < pipeline.length - 1 && (
                <>
                  <ArrowDown className="h-4 w-4 shrink-0 text-slate-300 xl:hidden" aria-hidden />
                  <ArrowRight className="hidden h-4 w-4 shrink-0 text-slate-300 xl:block" aria-hidden />
                </>
              )}
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Current configuration" icon={<KeyRound className="h-5 w-5" aria-hidden />} />
          <dl className="divide-y divide-slate-100 text-sm">
            <Row label="Mode" value={mode === 'live' ? 'Live AWS backend' : mode === 'demo' ? 'DEMO MODE' : 'Backend not configured'} />
            <Row label="VITE_API_BASE_URL" value={API_BASE_URL || 'not set'} mono />
            <Row label="Client upload limit" value={formatBytes(CLIENT_MAX_UPLOAD_BYTES)} />
            <Row label="Server upload limit" value={capabilities ? formatBytes(capabilities.maxUploadBytes) : '—'} />
            <Row label="Backend conversions" value={capabilities ? capabilities.conversions.map((c) => c.id).join(', ') || 'none' : '—'} mono />
            <Row label="Backend version" value={capabilities ? `${capabilities.service} ${capabilities.version}` : '—'} />
          </dl>
          {capabilitiesError && <p role="alert" className="m-5 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{capabilitiesError}</p>}
          <p className="px-5 pb-5 text-xs text-slate-500 sm:px-6">
            The browser never receives AWS credentials. Only the public API URL is configured here; Lambda uses its IAM execution role (e.g. LabRole) on the server.
          </p>
        </Card>

        <Card>
          <CardHeader title="Connect the real backend" />
          <ol className="list-decimal space-y-3 py-4 pl-10 pr-6 text-sm text-slate-700">
            <li>Deploy <code className="rounded bg-slate-100 px-1">aws/template.yaml</code> with AWS SAM (see <code className="rounded bg-slate-100 px-1">docs/AWS_SETUP.md</code>). Pass your LabRole ARN if your lab does not allow creating IAM roles.</li>
            <li>Copy the <strong>ApiBaseUrl</strong> stack output.</li>
            <li>In Netlify: <em>Project configuration → Environment variables</em>, add <code className="rounded bg-slate-100 px-1">VITE_API_BASE_URL</code> with that URL.</li>
            <li>Set the stack's <code className="rounded bg-slate-100 px-1">AllowedOrigin</code> parameter to your Netlify site URL (for API and S3 CORS).</li>
            <li>Trigger a redeploy, turn demo mode off, and check that this page shows green ticks.</li>
            <li>Run <code className="rounded bg-slate-100 px-1">aws/scripts/smoke-test.sh</code> to verify permissions end-to-end.</li>
          </ol>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Feature status" subtitle="What works today and what depends on AWS." />
        <ul className="divide-y divide-slate-100">
          {FEATURES.map((f) => (
            <li key={f.name} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
              <span className={`w-fit shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${f.status === 'done' ? 'bg-emerald-50 text-emerald-700' : f.status === 'aws' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                {f.status === 'done' ? 'Implemented' : f.status === 'aws' ? 'Needs AWS config' : 'Not implemented'}
              </span>
              <span className="flex-1 text-sm font-medium text-slate-900">{f.name}</span>
              <span className="text-xs text-slate-500">{f.note}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 px-5 py-3 sm:flex-row sm:justify-between sm:gap-4 sm:px-6">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`break-all text-slate-900 sm:text-right ${mono ? 'font-mono text-xs' : 'font-medium'}`}>{value}</dd>
    </div>
  )
}
