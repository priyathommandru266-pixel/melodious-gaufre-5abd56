import { useId, useRef, useState } from 'react'
import { FileUp, Trash2, FileText, FileImage, FileSpreadsheet, File as FileIcon } from 'lucide-react'
import { formatBytes } from '@/lib/format'
import { getExtension, sanitizeFileName } from '@/lib/validation'

const ICONS: Record<string, typeof FileIcon> = { txt: FileText, csv: FileSpreadsheet, png: FileImage }

interface Props {
  file: File | null
  onSelect: (file: File) => void
  onRemove: () => void
  accept: string
  disabled?: boolean
  maxBytes: number
  supportedLabel: string
  error?: string | null
}

export function Dropzone({ file, onSelect, onRemove, accept, disabled, maxBytes, supportedLabel, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const hintId = useId()
  const errorId = useId()

  function pick(files: FileList | null) {
    if (files && files.length > 0) onSelect(files[0])
    if (inputRef.current) inputRef.current.value = ''
  }

  if (file) {
    const ext = getExtension(file.name)
    const Icon = ICONS[ext] ?? FileIcon
    const safe = sanitizeFileName(file.name)
    return (
      <div className={`rounded-2xl border-2 p-4 sm:p-5 ${error ? 'border-rose-300 bg-rose-50/50' : 'border-indigo-200 bg-indigo-50/40'}`}>
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200">
            <Icon className="h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-slate-900" title={file.name}>{file.name}</p>
            <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              <div className="flex gap-1"><dt className="text-slate-400">Type</dt><dd className="font-medium uppercase">{ext ? `.${ext}` : 'none'}</dd></div>
              <div className="flex gap-1"><dt className="text-slate-400">Size</dt><dd className="font-medium">{formatBytes(file.size)}</dd></div>
              {file.type && <div className="flex gap-1"><dt className="text-slate-400">MIME</dt><dd className="font-medium">{file.type}</dd></div>}
            </dl>
            {safe !== file.name && (
              <p className="mt-1 text-xs text-slate-500">Will be stored as <code className="rounded bg-white px-1">{safe}</code></p>
            )}
          </div>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-100 disabled:opacity-40 focus-ring"
          >
            <Trash2 className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Remove</span><span className="sr-only sm:hidden">Remove file</span>
          </button>
        </div>
        {error && <p id={errorId} role="alert" className="mt-3 rounded-lg bg-rose-100 px-3 py-2 text-sm font-medium text-rose-800">{error}</p>}
      </div>
    )
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-describedby={hintId}
        aria-label="Choose a file to upload, or drag and drop it here"
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (!disabled) pick(e.dataTransfer.files)
        }}
        className={`group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition focus-ring sm:py-14 ${
          disabled
            ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60'
            : dragging
              ? 'border-indigo-500 bg-indigo-50'
              : 'border-slate-300 bg-slate-50/60 hover:border-indigo-400 hover:bg-indigo-50/40'
        }`}
      >
        <span className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg shadow-indigo-500/30 transition ${dragging ? 'scale-110' : 'group-hover:scale-105'}`}>
          <FileUp className="h-7 w-7" aria-hidden />
        </span>
        <p className="text-base font-semibold text-slate-900">
          {dragging ? 'Drop the file into the box' : 'Drag & drop a file here'}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          or <span className="font-semibold text-indigo-600 underline underline-offset-2">browse your computer</span>
        </p>
        <p id={hintId} className="mt-3 text-xs text-slate-500">
          Supported: {supportedLabel || 'none in this mode'} · Max {formatBytes(maxBytes)}
        </p>
      </div>
      <input ref={inputRef} type="file" accept={accept} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => pick(e.target.files)} />
      {error && <p role="alert" className="mt-3 rounded-lg bg-rose-100 px-3 py-2 text-sm font-medium text-rose-800">{error}</p>}
    </div>
  )
}
