import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react'

/* ── Types ────────────────────────────────────────────────── */

type ToastVariant = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: number
  variant: ToastVariant
  message: string
  duration: number
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant, duration?: number) => void
  success: (message: string) => void
  error: (message: string) => void
  warning: (message: string) => void
  info: (message: string) => void
}

/* ── Config ───────────────────────────────────────────────── */

const VARIANT_CFG: Record<ToastVariant, { icon: React.ReactNode; bg: string; border: string; text: string }> = {
  success: { icon: <CheckCircle2 size={16} />, bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  error:   { icon: <XCircle size={16} />,      bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700'     },
  warning: { icon: <AlertTriangle size={16} />, bg: 'bg-amber-50',  border: 'border-amber-200',   text: 'text-amber-700'   },
  info:    { icon: <Info size={16} />,          bg: 'bg-blue-50',   border: 'border-blue-200',     text: 'text-blue-700'    },
}

/* ── Context ──────────────────────────────────────────────── */

const ToastContext = createContext<ToastContextValue | null>(null)

let _nextId = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const push = useCallback((message: string, variant: ToastVariant = 'info', duration: number = 3500) => {
    const id = ++_nextId
    setToasts(prev => [...prev, { id, variant, message, duration }])
  }, [])

  const ctx: ToastContextValue = {
    toast: push,
    success: useCallback((msg: string) => push(msg, 'success'), [push]),
    error:   useCallback((msg: string) => push(msg, 'error'),   [push]),
    warning: useCallback((msg: string) => push(msg, 'warning'), [push]),
    info:    useCallback((msg: string) => push(msg, 'info'),    [push]),
  }

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {ReactDOM.createPortal(
        <div className="fixed top-4 right-4 z-toast flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 380 }}>
          {toasts.map(t => (
            <ToastCard key={t.id} item={t} onDismiss={() => remove(t.id)} />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}

/* ── Hook ─────────────────────────────────────────────────── */

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}

/* ── Toast card ───────────────────────────────────────────── */

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const cfg = VARIANT_CFG[item.variant]

  useEffect(() => {
    const timer = setTimeout(onDismiss, item.duration)
    return () => clearTimeout(timer)
  }, [item.duration, onDismiss])

  return (
    <div
      className={`pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-lg animate-fade-in-up ${cfg.bg} ${cfg.border}`}
      role="alert"
    >
      <span className={`shrink-0 mt-0.5 ${cfg.text}`}>{cfg.icon}</span>
      <p className={`text-sm font-medium flex-1 ${cfg.text}`}>{item.message}</p>
      <button
        onClick={onDismiss}
        className={`shrink-0 mt-0.5 opacity-60 hover:opacity-100 transition-opacity ${cfg.text}`}
      >
        <X size={14} />
      </button>
    </div>
  )
}
