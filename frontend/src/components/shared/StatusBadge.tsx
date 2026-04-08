import React from 'react'

const STATUS_CFG: Record<string, { dot: string; text: string; bg: string; label: string }> = {
  active:      { dot: 'bg-blue-500',    text: 'text-blue-700',    bg: 'bg-blue-50',    label: 'Active'      },
  planning:    { dot: 'bg-violet-400',  text: 'text-violet-700',  bg: 'bg-violet-50',  label: 'Planning'    },
  on_hold:     { dot: 'bg-amber-400',   text: 'text-amber-700',   bg: 'bg-amber-50',   label: 'On Hold'     },
  completed:   { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', label: 'Completed'   },
  cancelled:   { dot: 'bg-gray-400',    text: 'text-gray-600',    bg: 'bg-gray-50',    label: 'Cancelled'   },
  todo:        { dot: 'bg-gray-400',    text: 'text-gray-600',    bg: 'bg-gray-100',   label: 'To Do'       },
  in_progress: { dot: 'bg-blue-500',    text: 'text-blue-700',    bg: 'bg-blue-100',   label: 'In Progress' },
  review:      { dot: 'bg-purple-500',  text: 'text-purple-700',  bg: 'bg-purple-100', label: 'In Review'   },
  blocked:     { dot: 'bg-red-500',     text: 'text-red-700',     bg: 'bg-red-100',    label: 'Blocked'     },
  done:        { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-100',label: 'Done'        },
}

interface Props {
  status: string
  showDot?: boolean
  className?: string
}

export function StatusBadge({ status, showDot = true, className = '' }: Props) {
  const cfg = STATUS_CFG[status] ?? { dot: 'bg-gray-400', text: 'text-gray-600', bg: 'bg-gray-50', label: status }
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-md font-semibold ${cfg.text} ${cfg.bg} ${className}`}>
      {showDot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />}
      {cfg.label}
    </span>
  )
}

export { STATUS_CFG }
