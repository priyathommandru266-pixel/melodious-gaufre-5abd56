import { Link, useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { BookOpenCheck, History, LayoutDashboard, Menu, UploadCloud, X } from 'lucide-react'
import { ModeBanner, ModePill } from './ModeBanner'
import { useApp } from '@/context/AppContext'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/convert', label: 'Upload & Convert', icon: UploadCloud },
  { to: '/history', label: 'Conversion History', icon: History },
  { to: '/setup', label: 'AWS Setup & Status', icon: BookOpenCheck },
] as const

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 rounded-lg focus-ring">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-md shadow-indigo-500/30">
        <UploadCloud className="h-5 w-5" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-bold text-slate-900">File Converter</span>
        <span className="block text-xs font-medium text-slate-500">Physical Drop Box</span>
      </span>
    </Link>
  )
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname })
  return (
    <nav aria-label="Main navigation">
      <ul className="space-y-1">
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = to === '/' ? path === '/' : path.startsWith(to)
          return (
            <li key={to}>
              <Link
                to={to}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition focus-ring ${
                  active
                    ? 'bg-gradient-to-r from-blue-50 to-violet-50 text-indigo-700 ring-1 ring-indigo-100'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? 'text-indigo-600' : 'text-slate-400'}`} aria-hidden />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function SidebarFooter() {
  const { mode, demoEnabled, setDemoEnabled } = useApp()
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Data source</p>
      <p className="mt-1 text-sm text-slate-700">
        {mode === 'live' ? 'AWS API (S3 · Lambda · DynamoDB)' : mode === 'demo' ? 'Sample data + local browser demo' : 'None — backend not configured'}
      </p>
      <label className="mt-3 flex cursor-pointer items-center justify-between gap-2 text-sm font-medium text-slate-700">
        Demo mode
        <input
          type="checkbox"
          role="switch"
          checked={demoEnabled}
          onChange={(e) => setDemoEnabled(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className="relative h-6 w-11 rounded-full bg-slate-300 transition after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-amber-500 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 peer-focus-visible:ring-offset-2"
        />
      </label>
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const path = useRouterState({ select: (s) => s.location.pathname })
  useEffect(() => setOpen(false), [path])

  return (
    <div className="min-h-screen bg-slate-50">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lg">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col justify-between border-r border-slate-200 bg-white px-4 py-5 lg:flex">
        <div className="space-y-8">
          <div className="px-2"><Logo /></div>
          <NavLinks />
        </div>
        <SidebarFooter />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col justify-between bg-white px-4 py-5 shadow-xl">
            <div className="space-y-8">
              <div className="flex items-center justify-between px-2">
                <Logo />
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-ring" aria-label="Close navigation">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
            <SidebarFooter />
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus-ring lg:hidden" aria-label="Open navigation">
                <Menu className="h-5 w-5" />
              </button>
              <div className="lg:hidden"><Logo /></div>
              <p className="hidden text-sm font-medium text-slate-500 lg:block">Cloud Computing Lab · Serverless file conversion</p>
            </div>
            <ModePill />
          </div>
          <ModeBanner />
        </header>
        <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  )
}
