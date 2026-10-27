import { createFileRoute, Link } from '@tanstack/react-router'
import { useId, useRef, useState } from 'react'
import { ArrowRight, CheckCircle2, Circle, CloudOff, Info, Laptop, Power, RotateCcw, ShieldCheck, XCircle } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/context/ToastContext'
import { api, ApiError, pollJob, uploadToS3 } from '@/lib/api'
import { ALL_CONVERSIONS } from '@/lib/conversions'
import { convertTxtLocally } from '@/lib/demo'
import { formatBytes } from '@/lib/format'
import { sanitizeFileName, validateFile, verifyFileSignature } from '@/lib/validation'
import type { ConversionOption, ConversionType, Job } from '@/lib/types'
import { Card, CardHeader, Spinner, btn } from '@/components/ui'
import { Dropzone } from '@/components/Dropzone'
import { StatusBadge, StatusLed, type LedState } from '@/components/StatusBadge'
import { DownloadButton } from '@/components/DownloadButton'

export const Route = createFileRoute('/convert')({
  component: ConvertPage,
})

type Phase = 'idle' | 'validating' | 'uploading' | 'processing' | 'succeeded' | 'failed'

const LED_FOR_PHASE: Record<Phase, LedState> = {
  idle: 'off',
  validating: 'uploading',
  uploading: 'uploading',
  processing: 'processing',
  succeeded: 'success',
  failed: 'error',
}

function ConvertPage() {
  const app = useApp()
  const { mode, conversionOptions, maxUploadBytes, capabilitiesState, setDemoEnabled } = app
  const toast = useToast()
  const selectId = useId()

  const [file, setFile] = useState<File | null>(null)
  const [conversionId, setConversionId] = useState<ConversionType | ''>('')
  const [fileError, setFileError] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState<number | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [failure, setFailure] = useState<{ stage: string; message: string; step: Phase } | null>(null)
  const inFlight = useRef(false)

  const option: ConversionOption | null = conversionOptions.find((o) => o.id === conversionId) ?? null
  const busy = phase === 'validating' || phase === 'uploading' || phase === 'processing'
  const supportedExts = [...new Set(conversionOptions.flatMap((o) => o.inputExtensions.map((e) => `.${e}`)))]
  const accept = supportedExts.join(',')
  const supportedLabel = supportedExts.join(', ')
  const unavailable = ALL_CONVERSIONS.filter((c) => !conversionOptions.some((o) => o.id === c.id))

  function resetRun() {
    setPhase('idle')
    setProgress(null)
    setJob(null)
    setFailure(null)
  }

  function onSelect(f: File) {
    resetRun()
    setFile(f)
    const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
    const matches = conversionOptions.filter((o) => o.inputExtensions.includes(ext))
    const nextOpt = option && option.inputExtensions.includes(ext) ? option : matches.length === 1 ? matches[0] : null
    if (nextOpt) setConversionId(nextOpt.id)
    const v = validateFile(f, nextOpt, conversionOptions, maxUploadBytes)
    setFileError(v.ok ? null : v.message)
  }

  function onRemove() {
    setFile(null)
    setFileError(null)
    resetRun()
  }

  function onChangeConversion(id: ConversionType | '') {
    setConversionId(id)
    resetRun()
    if (file) {
      const v = validateFile(file, conversionOptions.find((o) => o.id === id) ?? null, conversionOptions, maxUploadBytes)
      setFileError(v.ok ? null : v.message)
    }
  }

  function fail(stage: string, err: unknown, step: Phase) {
    const message = err instanceof ApiError || err instanceof Error ? err.message : 'Unexpected error.'
    setFailure({ stage, message, step })
    setPhase('failed')
    toast({ kind: 'error', title: `${stage} failed`, message })
  }

  async function runLive(f: File, opt: ConversionOption) {
    setPhase('uploading')
    let created
    try {
      created = await api.createJob({
        fileName: sanitizeFileName(f.name),
        contentType: f.type || opt.inputMimeTypes[0],
        size: f.size,
        conversionType: opt.id,
      })
    } catch (e) {
      return fail('Creating upload request', e, 'uploading')
    }
    const pending: Job = {
      jobId: created.jobId,
      originalFileName: sanitizeFileName(f.name),
      conversionType: opt.id,
      status: created.status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      inputSize: f.size,
      source: 'aws',
    }
    setJob(pending)
    try {
      await uploadToS3(created.upload, f, setProgress)
    } catch (e) {
      return fail('Upload to S3', e, 'uploading')
    }
    setPhase('processing')
    try {
      await api.startConversion(created.jobId)
    } catch (e) {
      return fail('Starting conversion', e, 'processing')
    }
    try {
      const final = await pollJob(created.jobId, (j) => setJob(j))
      app.upsertJob(final)
      if (final.status === 'SUCCEEDED') {
        setPhase('succeeded')
        toast({ kind: 'success', title: 'Conversion complete', message: `${final.outputFileName} is ready to download.` })
      } else {
        fail('Conversion', new Error(final.errorMessage ?? 'The converter reported a failure without details.'), 'processing')
      }
    } catch (e) {
      fail('Checking status', e, 'processing')
    }
  }

  async function runLocalDemo(f: File, opt: ConversionOption) {
    setPhase('processing')
    const now = new Date().toISOString()
    const jobId = `local-${crypto.randomUUID().slice(0, 8)}`
    try {
      const { blob, outputFileName } = await convertTxtLocally(f)
      const done: Job = {
        jobId,
        originalFileName: f.name,
        conversionType: opt.id,
        status: 'SUCCEEDED',
        createdAt: now,
        updatedAt: new Date().toISOString(),
        inputSize: f.size,
        outputFileName,
        outputSize: blob.size,
        source: 'demo-local',
      }
      app.addLocalDemoJob(done, blob)
      setJob(done)
      setPhase('succeeded')
      toast({ kind: 'success', title: 'Converted locally (demo)', message: 'Processed in your browser — not uploaded to AWS.' })
    } catch (e) {
      fail('Local conversion', e, 'processing')
    }
  }

  async function onConvert() {
    if (inFlight.current) return // guard against double clicks
    if (!file) return setFileError('Choose a file first.')
    if (!option) return setFileError('Choose a conversion type.')
    inFlight.current = true
    try {
      resetRun()
      setPhase('validating')
      const v = validateFile(file, option, conversionOptions, maxUploadBytes)
      if (!v.ok) {
        setFileError(v.message)
        setPhase('idle')
        return
      }
      const sig = await verifyFileSignature(file, option)
      if (!sig.ok) {
        setFileError(sig.message)
        setPhase('idle')
        return
      }
      setFileError(null)
      if (mode === 'live') await runLive(file, option)
      else if (mode === 'demo') await runLocalDemo(file, option)
    } finally {
      inFlight.current = false
    }
  }

  const steps =
    mode === 'demo'
      ? [
          { key: 'validating', label: 'Validate file', detail: 'Extension, size and content checks' },
          { key: 'processing', label: 'Convert locally in browser', detail: 'DEMO — no S3 upload, no Lambda, no DynamoDB' },
          { key: 'succeeded', label: 'Ready to download', detail: 'Local file, kept until page reload' },
        ]
      : [
          { key: 'validating', label: 'Validate file', detail: 'Extension, size and content checks' },
          { key: 'uploading', label: 'Upload to Amazon S3', detail: 'Presigned POST to the private uploads bucket' },
          { key: 'processing', label: 'Convert with AWS Lambda', detail: 'Status read from DynamoDB' },
          { key: 'succeeded', label: 'Ready to download', detail: 'Presigned S3 download link' },
        ]
  const order = steps.map((s) => s.key)
  const currentIdx = phase === 'failed' ? -1 : order.indexOf(phase)
  const failedIdx = phase === 'failed' && failure ? Math.max(0, order.indexOf(failure.step)) : -1

  const canConvert = !!file && !!option && !fileError && !busy && conversionOptions.length > 0 && mode !== 'offline'
  const ledLabel: Record<Phase, string> = {
    idle: 'Idle — ready',
    validating: 'Validating…',
    uploading: progress !== null ? `Uploading ${progress}%` : 'Uploading…',
    processing: mode === 'demo' ? 'Converting locally…' : 'Processing on Lambda…',
    succeeded: 'Success',
    failed: 'Failed',
  }

  if (mode === 'offline') {
    return (
      <>
        <Header />
        <Card className="mx-auto max-w-2xl p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
            <CloudOff className="h-7 w-7" aria-hidden />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Backend not configured</h2>
          <p className="mt-2 text-slate-600">
            Real conversions need the AWS API. Set <code className="rounded bg-slate-100 px-1">VITE_API_BASE_URL</code> in Netlify and redeploy.
            Until then, you can preview the interface in demo mode — TXT files are converted locally in your browser and nothing is sent to AWS.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <button type="button" onClick={() => setDemoEnabled(true)} className={btn.primary}>Enable demo mode</button>
            <Link to="/setup" className={btn.secondary}>Read the AWS setup guide</Link>
          </div>
        </Card>
      </>
    )
  }

  return (
    <>
      <Header />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader title="1. Choose a file" subtitle="Drag it into the drop box or browse." />
            <div className="p-5 sm:p-6">
              <Dropzone
                file={file}
                onSelect={onSelect}
                onRemove={onRemove}
                accept={accept}
                disabled={busy || conversionOptions.length === 0}
                maxBytes={maxUploadBytes}
                supportedLabel={supportedLabel}
                error={fileError}
              />
              <p className="mt-3 flex items-start gap-2 text-xs text-slate-500">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                The {formatBytes(maxUploadBytes)} limit is checked here for convenience; the backend enforces the same limit in the S3 upload policy and rejects larger files.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="2. Choose a conversion" subtitle={mode === 'live' ? 'Only conversions the AWS backend reports as supported are listed.' : 'Demo mode can only run conversions that work in the browser.'} />
            <div className="p-5 sm:p-6">
              <label htmlFor={selectId} className="mb-1.5 block text-sm font-semibold text-slate-700">Conversion type</label>
              {mode === 'live' && capabilitiesState === 'loading' ? (
                <p className="flex items-center gap-2 text-sm text-slate-500"><Spinner /> Loading supported conversions from the backend…</p>
              ) : (
                <select
                  id={selectId}
                  value={conversionId}
                  onChange={(e) => onChangeConversion(e.target.value as ConversionType | '')}
                  disabled={busy || conversionOptions.length === 0}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">{conversionOptions.length ? 'Select a conversion…' : 'No conversions available'}</option>
                  {conversionOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              )}
              {option && <p className="mt-2 text-sm text-slate-600">{option.description}</p>}
              {unavailable.length > 0 && (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                  <span>
                    Not available {mode === 'demo' ? 'in demo mode (requires the AWS backend)' : 'on this backend'}:{' '}
                    {unavailable.map((u) => u.label).join(', ')}.
                  </span>
                </p>
              )}
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="flex flex-col items-stretch gap-5 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={onConvert}
                disabled={!canConvert}
                aria-busy={busy}
                className="group relative inline-flex flex-1 items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 px-8 py-5 text-lg font-bold text-white shadow-xl shadow-indigo-500/30 transition hover:-translate-y-0.5 hover:shadow-2xl active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none focus-ring"
              >
                {busy ? <Spinner className="h-6 w-6" /> : <Power className="h-6 w-6" aria-hidden />}
                {busy ? 'Working…' : 'Convert File'}
              </button>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:min-w-52" aria-live="polite">
                <StatusLed state={LED_FOR_PHASE[phase]} size="lg" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Status LED</p>
                  <p className="text-sm font-semibold text-slate-800">{ledLabel[phase]}</p>
                </div>
              </div>
            </div>
            {mode === 'demo' && (
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                <Laptop className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                DEMO MODE: this button runs a real uppercase conversion inside your browser. It is not a cloud upload.
              </p>
            )}
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="lg:sticky lg:top-24">
            <CardHeader title="Conversion status" subtitle={mode === 'live' ? 'Live status from the AWS backend' : 'Local demo run'} />
            <ol className="space-y-1 px-5 py-4 sm:px-6">
              {steps.map((s, i) => {
                const done = phase === 'succeeded' ? true : currentIdx > i || (phase === 'failed' && i < failedIdx)
                const active = currentIdx === i && phase !== 'succeeded'
                const failed = phase === 'failed' && i === failedIdx
                return (
                  <li key={s.key} className="flex gap-3 py-2">
                    <span className="mt-0.5">
                      {failed ? <XCircle className="h-5 w-5 text-rose-500" aria-hidden /> : done ? <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-hidden /> : active ? <Spinner className="h-5 w-5 text-indigo-600" /> : <Circle className="h-5 w-5 text-slate-300" aria-hidden />}
                    </span>
                    <div>
                      <p className={`text-sm font-semibold ${failed ? 'text-rose-700' : active ? 'text-indigo-700' : done ? 'text-slate-900' : 'text-slate-500'}`}>
                        {s.label}
                        {s.key === 'uploading' && active && progress !== null && <span className="ml-2 tabular-nums">{progress}%</span>}
                      </p>
                      <p className="text-xs text-slate-500">{s.detail}</p>
                      {s.key === 'uploading' && active && (
                        <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? undefined} aria-label="Upload progress">
                          <div className={`h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all ${progress === null ? 'w-1/3 animate-pulse' : ''}`} style={progress !== null ? { width: `${progress}%` } : undefined} />
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>

            <div className="border-t border-slate-100 px-5 py-5 sm:px-6">
              {job && (
                <dl className="mb-4 grid grid-cols-3 gap-y-2 text-sm">
                  <dt className="text-slate-500">Job ID</dt><dd className="col-span-2 truncate font-mono text-xs text-slate-800" title={job.jobId}>{job.jobId}</dd>
                  <dt className="text-slate-500">Server status</dt><dd className="col-span-2"><StatusBadge status={job.status} /></dd>
                  {job.outputFileName && (<><dt className="text-slate-500">Output</dt><dd className="col-span-2 truncate font-medium text-slate-900">{job.outputFileName}</dd></>)}
                  {job.outputSize !== undefined && (<><dt className="text-slate-500">Size</dt><dd className="col-span-2 text-slate-800">{formatBytes(job.outputSize)}</dd></>)}
                </dl>
              )}

              {phase === 'succeeded' && job && (
                <div className="space-y-3">
                  <div role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    <strong>Conversion succeeded.</strong>{' '}
                    {job.source === 'aws' ? 'Confirmed by the backend; the output is stored in the private S3 output bucket.' : 'Converted locally in your browser (demo). Not stored in the cloud.'}
                  </div>
                  <DownloadButton job={job} variant="primary" />
                  <button type="button" onClick={onRemove} className={`${btn.secondary} w-full`}>
                    <RotateCcw className="h-4 w-4" aria-hidden /> Convert another file
                  </button>
                </div>
              )}

              {phase === 'failed' && failure && (
                <div className="space-y-3">
                  <div role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
                    <strong>{failure.stage} failed.</strong> {failure.message}
                  </div>
                  <button type="button" onClick={resetRun} className={`${btn.secondary} w-full`}>
                    <RotateCcw className="h-4 w-4" aria-hidden /> Try again
                  </button>
                </div>
              )}

              {phase === 'idle' && !job && (
                <p className="text-sm text-slate-500">
                  Choose a file and a conversion, then press <strong>Convert File</strong>. The status LED and steps update as the {mode === 'live' ? 'backend' : 'demo'} reports progress.
                </p>
              )}
            </div>
            <div className="border-t border-slate-100 px-5 py-3 sm:px-6">
              <Link to="/history" className={btn.ghost}>Open conversion history <ArrowRight className="h-4 w-4" aria-hidden /></Link>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}

function Header() {
  return (
    <div className="mb-6 sm:mb-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Upload &amp; Convert</h1>
      <p className="mt-1.5 max-w-2xl text-sm text-slate-600 sm:text-base">
        The virtual drop box: the big button replaces the physical push-button and the status LED shows each stage of the job.
      </p>
    </div>
  )
}
