import { FileText, FileSpreadsheet, FileImage, Laptop } from 'lucide-react'
import { conversionLabel } from '@/lib/conversions'
import { formatDateTime, shortId } from '@/lib/format'
import type { ConversionType, Job } from '@/lib/types'
import { StatusBadge } from './StatusBadge'
import { DownloadButton } from './DownloadButton'

export const TYPE_ICON: Record<ConversionType, typeof FileText> = {
  TXT_TO_UPPERCASE: FileText,
  CSV_TO_JSON: FileSpreadsheet,
  PNG_TO_JPEG: FileImage,
}

function SourceTag({ job }: { job: Job }) {
  if (job.source === 'demo-sample') return <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">Sample</span>
  if (job.source === 'demo-local')
    return (
      <span className="inline-flex items-center gap-1 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-800">
        <Laptop className="h-3 w-3" aria-hidden /> Local demo
      </span>
    )
  return null
}

function FileCell({ job }: { job: Job }) {
  const Icon = TYPE_ICON[job.conversionType] ?? FileText
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-violet-50 text-indigo-600 ring-1 ring-indigo-100">
        <Icon className="h-4.5 w-4.5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-900" title={job.originalFileName}>{job.originalFileName}</p>
        <div className="mt-0.5 flex items-center gap-1.5"><SourceTag job={job} /></div>
      </div>
    </div>
  )
}

export function JobsTable({ jobs, compact = false }: { jobs: Job[]; compact?: boolean }) {
  return (
    <>
      {/* Table: tablet & desktop */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {!compact && <th scope="col" className="px-6 py-3">Job ID</th>}
              <th scope="col" className={compact ? 'px-6 py-3' : 'px-3 py-3'}>Original file</th>
              <th scope="col" className="px-3 py-3">Conversion</th>
              <th scope="col" className="px-3 py-3">Uploaded</th>
              <th scope="col" className="px-3 py-3">Status</th>
              {!compact && <th scope="col" className="px-3 py-3">Output file</th>}
              <th scope="col" className="px-6 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {jobs.map((job) => (
              <tr key={job.jobId} className="align-middle transition hover:bg-slate-50/70">
                {!compact && (
                  <td className="px-6 py-3 font-mono text-xs text-slate-500" title={job.jobId}>{shortId(job.jobId)}</td>
                )}
                <td className={`${compact ? 'px-6' : 'px-3'} max-w-[16rem] py-3`}><FileCell job={job} /></td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-700">{conversionLabel(job.conversionType)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDateTime(job.createdAt)}</td>
                <td className="px-3 py-3">
                  <StatusBadge status={job.status} />
                  {job.status === 'FAILED' && job.errorMessage && !compact && (
                    <p className="mt-1 max-w-[16rem] text-xs text-rose-600">{job.errorMessage}</p>
                  )}
                </td>
                {!compact && (
                  <td className="max-w-[12rem] truncate px-3 py-3 text-slate-700" title={job.outputFileName}>{job.outputFileName ?? '—'}</td>
                )}
                <td className="px-6 py-3 text-right"><DownloadButton job={job} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cards: mobile */}
      <ul className="divide-y divide-slate-100 md:hidden">
        {jobs.map((job) => (
          <li key={job.jobId} className="space-y-2 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <FileCell job={job} />
              <StatusBadge status={job.status} />
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-slate-500">Conversion</dt><dd className="text-slate-800">{conversionLabel(job.conversionType)}</dd>
              <dt className="text-slate-500">Uploaded</dt><dd className="text-slate-800">{formatDateTime(job.createdAt)}</dd>
              {!compact && (<><dt className="text-slate-500">Job ID</dt><dd className="font-mono text-slate-800">{shortId(job.jobId)}</dd></>)}
              {job.outputFileName && (<><dt className="text-slate-500">Output</dt><dd className="truncate text-slate-800">{job.outputFileName}</dd></>)}
            </dl>
            {job.status === 'FAILED' && job.errorMessage && <p className="text-xs text-rose-600">{job.errorMessage}</p>}
            <div className="flex justify-end"><DownloadButton job={job} /></div>
          </li>
        ))}
      </ul>
    </>
  )
}
