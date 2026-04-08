import React from 'react'

const PRIORITY_CFG: Record<string, { text: string; bg: string; label: string }> = {
  critical: { text: 'text-red-700',    bg: 'bg-red-100',    label: 'Critical' },
  high:     { text: 'text-orange-700', bg: 'bg-orange-100', label: 'High'     },
  medium:   { text: 'text-amber-700',  bg: 'bg-amber-100',  label: 'Medium'   },
  low:      { text: 'text-gray-600',   bg: 'bg-gray-100',   label: 'Low'      },
}

interface Props {
  priority: string
  className?: string
}

export function PriorityBadge({ priority, className = '' }: Props) {
  const cfg = PRIORITY_CFG[priority] ?? { text: 'text-gray-600', bg: 'bg-gray-100', label: priority }
  return (
    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-md font-semibold capitalize ${cfg.text} ${cfg.bg} ${className}`}>
      {cfg.label}
    </span>
  )
}

export { PRIORITY_CFG }
