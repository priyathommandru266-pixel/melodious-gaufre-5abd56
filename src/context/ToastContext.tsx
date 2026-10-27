import { createContext, useCallback, useContext, useState } from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'

type ToastKind = 'success' | 'error' | 'info'
interface Toast {
  id: number
  kind: ToastKind
  title: string
  message?: string
}

const ToastContext = createContext<(t: Omit<Toast, 'id'>) => void>(() => {})

let nextId = 1

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), [])

  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = nextId++
      setToasts((ts) => [...ts.slice(-3), { ...t, id }])
      setTimeout(() => dismiss(id), t.kind === 'error' ? 9000 : 5000)
    },
    [dismiss],
  )

  const styles: Record<ToastKind, { icon: typeof Info; cls: string }> = {
    success: { icon: CheckCircle2, cls: 'text-emerald-600' },
    error: { icon: AlertTriangle, cls: 'text-rose-600' },
    info: { icon: Info, cls: 'text-indigo-600' },
  }

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6"
      >
        {toasts.map((t) => {
          const { icon: Icon, cls } = styles[t.kind]
          return (
            <div
              key={t.id}
              role={t.kind === 'error' ? 'alert' : 'status'}
              className="toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-900/10"
            >
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${cls}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{t.title}</p>
                {t.message && <p className="mt-0.5 text-sm text-slate-600">{t.message}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-ring"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
