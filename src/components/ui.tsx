import { Loader2 } from 'lucide-react'

export function Card({
  children,
  className = '',
  as: Tag = 'section',
  ...rest
}: { children: React.ReactNode; className?: string; as?: 'section' | 'div' | 'article' } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={`rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03] ${className}`} {...rest}>
      {children}
    </Tag>
  )
}

export function CardHeader({ title, subtitle, action, icon }: { title: string; subtitle?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
      <div className="flex items-start gap-3">
        {icon && <div className="mt-0.5 text-indigo-600">{icon}</div>}
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden />
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-slate-600 sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export const btn = {
  primary:
    'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:from-blue-700 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none focus-ring',
  secondary:
    'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus-ring',
  ghost:
    'inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent focus-ring',
}

export function EmptyState({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 rounded-2xl bg-slate-100 p-3 text-slate-500">{icon}</div>
      <p className="font-semibold text-slate-800">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-slate-500">{children}</div>}
    </div>
  )
}
