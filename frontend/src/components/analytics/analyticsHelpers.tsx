import React from 'react'
import { ThumbsUp, Smile, Meh, Frown, ThumbsDown, XCircle } from 'lucide-react'

/* ── Shared visual helpers ─────────────────────────────── */

export const STATUS_CFG: Record<string, { dot: string; text: string; bg: string }> = {
  active:      { dot: 'bg-blue-500',    text: 'text-blue-700',    bg: 'bg-blue-50'    },
  planning:    { dot: 'bg-violet-400',  text: 'text-violet-700',  bg: 'bg-violet-50'  },
  on_hold:     { dot: 'bg-amber-400',   text: 'text-amber-700',   bg: 'bg-amber-50'   },
  completed:   { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  cancelled:   { dot: 'bg-gray-400',    text: 'text-gray-600',    bg: 'bg-gray-50'    },
}

export const PRIORITY_CFG: Record<string, { text: string; bg: string }> = {
  critical: { text: 'text-red-700',    bg: 'bg-red-100'    },
  high:     { text: 'text-orange-700', bg: 'bg-orange-100' },
  medium:   { text: 'text-amber-700',  bg: 'bg-amber-100'  },
  low:      { text: 'text-gray-600',   bg: 'bg-gray-100'   },
}

export const MOOD_CFG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  great:      { icon: <ThumbsUp size={13} />,   label: 'Great',     color: 'text-emerald-600' },
  good:       { icon: <Smile size={13} />,       label: 'Good',      color: 'text-blue-600'    },
  neutral:    { icon: <Meh size={13} />,         label: 'Neutral',   color: 'text-amber-600'   },
  stressed:   { icon: <Frown size={13} />,       label: 'Stressed',  color: 'text-orange-600'  },
  burned_out: { icon: <ThumbsDown size={13} />,  label: 'Burned Out',color: 'text-red-600'     },
  blocked:    { icon: <XCircle size={13} />,     label: 'Blocked',   color: 'text-red-700'     },
}

export const MODE_CFG: Record<string, { badge: string; bar: string; ring: string; bg: string; text: string }> = {
  green: { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', bar: 'bg-emerald-500', ring: 'ring-emerald-200', bg: 'bg-emerald-50',  text: 'text-emerald-700' },
  blue:  { badge: 'bg-blue-100 text-blue-700 border-blue-200',          bar: 'bg-blue-500',    ring: 'ring-blue-200',   bg: 'bg-blue-50',     text: 'text-blue-700'    },
  amber: { badge: 'bg-amber-100 text-amber-700 border-amber-200',       bar: 'bg-amber-500',   ring: 'ring-amber-200',  bg: 'bg-amber-50',    text: 'text-amber-700'   },
  red:   { badge: 'bg-red-100 text-red-600 border-red-200',             bar: 'bg-red-500',     ring: 'ring-red-200',    bg: 'bg-red-50',      text: 'text-red-600'     },
}

export function HBar({ value, max, color = 'bg-blue-500' }: { value: number; max: number; color?: string }) {
  return (
    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
    </div>
  )
}

export function StatPill({ label, value, color = 'text-gray-800' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="text-center bg-gray-50 rounded-xl p-2.5">
      <p className={`text-base font-black leading-tight ${color}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
    </div>
  )
}

export function ColChart({ points, labels, color = '#6366f1', height = 80 }: {
  points: number[]; labels: string[]; color?: string; height?: number
}) {
  const max = Math.max(...points, 1)
  if (!points.length) return <p className="text-xs text-gray-400 text-center py-4">No data</p>
  return (
    <div className="flex items-end gap-0.5" style={{ height }}>
      {points.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center group relative cursor-pointer" style={{ height }}>
          <div
            className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none"
          >{labels[i]}: {v}</div>
          <div
            className="w-full rounded-t transition-all duration-300 hover:opacity-80"
            style={{ height: `${Math.max((v / max) * 100, 3)}%`, background: color, marginTop: 'auto' }}
          />
        </div>
      ))}
    </div>
  )
}

export function DonutMini({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).filter(([, v]) => v > 0)
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1
  const COLORS = ['#3b82f6', '#22c55e', '#ef4444', '#f59e0b', '#8b5cf6', '#6b7280']
  let off = 25
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-20 h-20 shrink-0">
        <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
          <circle r="13" cx="18" cy="18" fill="transparent" stroke="#f1f5f9" strokeWidth="5" />
          {entries.map(([key, val], i) => {
            const pct = (val / total) * 100
            const el = (
              <circle key={key} r="13" cx="18" cy="18" fill="transparent"
                stroke={COLORS[i % COLORS.length]} strokeWidth="5"
                strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={-off}
                style={{ transition: 'stroke-dasharray 0.7s ease' }}
              />
            )
            off += pct
            return el
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm font-black text-gray-700">{total}</p>
        </div>
      </div>
      <div className="flex-1 space-y-1.5">
        {entries.map(([key, val], i) => (
          <div key={key} className="flex items-center gap-1.5 text-xs">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="text-gray-600 flex-1 capitalize">{key.replace('_', ' ')}</span>
            <span className="font-bold text-gray-700">{val}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-10 skeleton rounded-xl" />
      {[...Array(rows)].map((_, i) => <div key={i} className="h-16 skeleton rounded-xl" />)}
    </div>
  )
}
