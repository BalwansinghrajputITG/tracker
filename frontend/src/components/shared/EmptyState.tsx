import React from 'react'

// ── Inline SVG illustrations ──────────────────────────────────────────────────

const IllustrationProjects = () => (
  <svg width="128" height="108" viewBox="0 0 128 108" fill="none" aria-hidden="true">
    {/* shadow */}
    <ellipse cx="64" cy="100" rx="40" ry="5" fill="#E5E7EB" />
    {/* folder body */}
    <rect x="10" y="36" width="108" height="60" rx="10" fill="#EFF6FF" stroke="#BFDBFE" strokeWidth="2" />
    {/* folder tab */}
    <path d="M10 44 L10 36 Q10 30 16 30 H44 L52 22 H112 Q118 22 118 28 V36" fill="#DBEAFE" stroke="#BFDBFE" strokeWidth="2" strokeLinejoin="round" />
    {/* dotted inner rect */}
    <rect x="26" y="50" width="76" height="36" rx="6" stroke="#93C5FD" strokeWidth="1.5" strokeDasharray="5 4" fill="white" fillOpacity="0.5" />
    {/* plus circle */}
    <circle cx="64" cy="68" r="13" fill="#3B82F6" fillOpacity="0.12" />
    <line x1="64" y1="61" x2="64" y2="75" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" />
    <line x1="57" y1="68" x2="71" y2="68" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
)

const IllustrationSearch = () => (
  <svg width="128" height="108" viewBox="0 0 128 108" fill="none" aria-hidden="true">
    <ellipse cx="64" cy="100" rx="36" ry="5" fill="#E5E7EB" />
    {/* glass outer */}
    <circle cx="52" cy="48" r="28" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="2.5" />
    {/* glass inner */}
    <circle cx="52" cy="48" r="20" fill="white" stroke="#F3F4F6" strokeWidth="1.5" />
    {/* X marks inside glass */}
    <line x1="44" y1="40" x2="60" y2="56" stroke="#D1D5DB" strokeWidth="2.5" strokeLinecap="round" />
    <line x1="60" y1="40" x2="44" y2="56" stroke="#D1D5DB" strokeWidth="2.5" strokeLinecap="round" />
    {/* handle */}
    <line x1="72" y1="68" x2="90" y2="86" stroke="#9CA3AF" strokeWidth="4" strokeLinecap="round" />
    {/* small sparkle top right */}
    <circle cx="88" cy="22" r="4" fill="#FDE68A" />
    <circle cx="100" cy="34" r="2.5" fill="#FDE68A" fillOpacity="0.6" />
    <circle cx="80" cy="14" r="2" fill="#FDE68A" fillOpacity="0.4" />
  </svg>
)

const IllustrationReports = () => (
  <svg width="128" height="108" viewBox="0 0 128 108" fill="none" aria-hidden="true">
    <ellipse cx="58" cy="100" rx="36" ry="5" fill="#E5E7EB" />
    {/* paper back */}
    <rect x="30" y="18" width="62" height="78" rx="8" fill="#ECFDF5" stroke="#A7F3D0" strokeWidth="2" />
    {/* page fold corner */}
    <path d="M76 18 L92 34 L76 34 Z" fill="#D1FAE5" stroke="#A7F3D0" strokeWidth="1.5" strokeLinejoin="round" />
    {/* lines */}
    <line x1="42" y1="48" x2="78" y2="48" stroke="#6EE7B7" strokeWidth="2" strokeLinecap="round" />
    <line x1="42" y1="58" x2="72" y2="58" stroke="#A7F3D0" strokeWidth="2" strokeLinecap="round" />
    <line x1="42" y1="68" x2="76" y2="68" stroke="#A7F3D0" strokeWidth="2" strokeLinecap="round" />
    <line x1="42" y1="78" x2="64" y2="78" stroke="#A7F3D0" strokeWidth="2" strokeLinecap="round" />
    {/* calendar badge */}
    <circle cx="92" cy="80" r="16" fill="white" stroke="#6EE7B7" strokeWidth="2" />
    <rect x="83" y="74" width="18" height="15" rx="3" fill="#F0FDF4" stroke="#6EE7B7" strokeWidth="1.5" />
    <line x1="86" y1="74" x2="86" y2="71" stroke="#34D399" strokeWidth="2" strokeLinecap="round" />
    <line x1="98" y1="74" x2="98" y2="71" stroke="#34D399" strokeWidth="2" strokeLinecap="round" />
    <line x1="83" y1="79" x2="101" y2="79" stroke="#A7F3D0" strokeWidth="1.5" />
    <circle cx="88" cy="85" r="1.5" fill="#34D399" />
    <circle cx="92" cy="85" r="1.5" fill="#A7F3D0" />
    <circle cx="96" cy="85" r="1.5" fill="#A7F3D0" />
  </svg>
)

const IllustrationTasks = () => (
  <svg width="128" height="108" viewBox="0 0 128 108" fill="none" aria-hidden="true">
    <ellipse cx="64" cy="100" rx="44" ry="5" fill="#E5E7EB" />
    {/* columns */}
    <rect x="6"  y="24" width="32" height="66" rx="8" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="2" strokeDasharray="5 4" />
    <rect x="48" y="24" width="32" height="66" rx="8" fill="#EFF6FF" stroke="#BFDBFE" strokeWidth="2" />
    <rect x="90" y="24" width="32" height="66" rx="8" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="2" strokeDasharray="5 4" />
    {/* card in middle column (active) */}
    <rect x="54" y="34" width="20" height="14" rx="4" fill="#BFDBFE" />
    <rect x="54" y="52" width="20" height="14" rx="4" fill="#DBEAFE" />
    <rect x="54" y="70" width="20" height="10" rx="4" fill="#EFF6FF" stroke="#BFDBFE" strokeWidth="1.5" strokeDasharray="4 3" />
    {/* filter funnel */}
    <path d="M104 14 L118 14 L112 22 L112 30 L110 30 L110 22 Z" fill="#FCD34D" fillOpacity="0.8" stroke="#F59E0B" strokeWidth="1.5" strokeLinejoin="round" />
    <line x1="111" y1="19" x2="111" y2="19" stroke="#F59E0B" strokeWidth="1" />
  </svg>
)

const IllustrationDefault = () => (
  <svg width="128" height="108" viewBox="0 0 128 108" fill="none" aria-hidden="true">
    <ellipse cx="64" cy="100" rx="34" ry="5" fill="#E5E7EB" />
    <circle cx="64" cy="50" r="32" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="2" />
    <circle cx="64" cy="50" r="22" fill="white" />
    <line x1="54" y1="50" x2="74" y2="50" stroke="#D1D5DB" strokeWidth="2.5" strokeLinecap="round" />
    <line x1="64" y1="40" x2="64" y2="60" stroke="#D1D5DB" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
)

const ILLUSTRATIONS = {
  projects: <IllustrationProjects />,
  search:   <IllustrationSearch />,
  reports:  <IllustrationReports />,
  tasks:    <IllustrationTasks />,
  default:  <IllustrationDefault />,
} as const

export type EmptyStateVariant = keyof typeof ILLUSTRATIONS

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  /** Pre-built illustrated variant. Pass `icon` to override with a custom lucide icon instead. */
  variant?: EmptyStateVariant
  /** Custom icon node — overrides the illustration when provided */
  icon?: React.ReactNode
  title?: string
  description?: string
  action?: React.ReactNode
  className?: string
  /** 'compact' reduces vertical padding; useful inside panels or table cells */
  size?: 'default' | 'compact'
}

export function EmptyState({
  variant = 'default',
  icon,
  title = 'Nothing here',
  description,
  action,
  className = '',
  size = 'default',
}: Props) {
  const py = size === 'compact' ? 'py-8' : 'py-14'

  return (
    <div className={`flex flex-col items-center justify-center text-center ${py} ${className}`}>
      {/* Illustration or icon */}
      {icon ? (
        <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
          {icon}
        </div>
      ) : (
        <div className="mb-4 select-none pointer-events-none animate-fade-in">
          {ILLUSTRATIONS[variant]}
        </div>
      )}

      {/* Text */}
      <p className="text-sm font-semibold text-gray-700 leading-snug">{title}</p>
      {description && (
        <p className="text-xs text-gray-400 mt-1.5 max-w-[260px] leading-relaxed">{description}</p>
      )}

      {/* CTA */}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
