import React from 'react'

/* ── Colorblind-safe palette ──────────────────────────────── */

const AVATAR_PALETTE = [
  { bg: 'bg-blue-600',    text: 'text-white' },
  { bg: 'bg-emerald-600', text: 'text-white' },
  { bg: 'bg-violet-600',  text: 'text-white' },
  { bg: 'bg-orange-500',  text: 'text-white' },
  { bg: 'bg-rose-600',    text: 'text-white' },
  { bg: 'bg-teal-600',    text: 'text-white' },
  { bg: 'bg-indigo-600',  text: 'text-white' },
  { bg: 'bg-amber-600',   text: 'text-white' },
  { bg: 'bg-cyan-600',    text: 'text-white' },
  { bg: 'bg-pink-600',    text: 'text-white' },
]

const AVATAR_GRADIENT_PALETTE = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-orange-500 to-red-600',
  'from-rose-500 to-pink-600',
  'from-teal-500 to-cyan-600',
  'from-indigo-500 to-blue-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-sky-600',
  'from-pink-500 to-rose-600',
]

/** Deterministic color from a string (name/email/id). Uses djb2 hash for even distribution. */
function hashIndex(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0
  }
  return hash % AVATAR_PALETTE.length
}

/* ── Size variants ────────────────────────────────────────── */

const SIZE_CFG = {
  xs: { container: 'w-6 h-6',  text: 'text-xs',  radius: 'rounded-lg',  dot: 'w-1.5 h-1.5' },
  sm: { container: 'w-8 h-8',  text: 'text-xs',  radius: 'rounded-xl',  dot: 'w-2 h-2' },
  md: { container: 'w-10 h-10', text: 'text-sm',  radius: 'rounded-xl',  dot: 'w-2.5 h-2.5' },
  lg: { container: 'w-12 h-12', text: 'text-base', radius: 'rounded-2xl', dot: 'w-3 h-3' },
  xl: { container: 'w-14 h-14', text: 'text-lg',  radius: 'rounded-2xl', dot: 'w-3 h-3' },
} as const

/* ── Component ────────────────────────────────────────────── */

interface AvatarProps {
  name: string
  src?: string | null
  size?: keyof typeof SIZE_CFG
  online?: boolean
  gradient?: boolean
  className?: string
}

export function Avatar({
  name,
  src,
  size = 'md',
  online,
  gradient = false,
  className = '',
}: AvatarProps) {
  const s = SIZE_CFG[size]
  const idx = hashIndex(name || 'U')
  const initials = (name || 'U')[0].toUpperCase()

  if (src) {
    return (
      <div className={`relative shrink-0 ${className}`}>
        <img
          src={src}
          alt={name}
          className={`${s.container} ${s.radius} object-cover`}
        />
        {online !== undefined && (
          <span className={`absolute -bottom-0.5 -right-0.5 ${s.dot} rounded-full border-2 border-white ${online ? 'bg-emerald-500' : 'bg-gray-300'}`} />
        )}
      </div>
    )
  }

  const palette = AVATAR_PALETTE[idx]
  const gradientClass = AVATAR_GRADIENT_PALETTE[idx]

  return (
    <div className={`relative shrink-0 ${className}`}>
      <div
        className={`${s.container} ${s.radius} flex items-center justify-center font-bold ${s.text} ${
          gradient
            ? `bg-gradient-to-br ${gradientClass} text-white`
            : `${palette.bg} ${palette.text}`
        } shadow-sm`}
      >
        {initials}
      </div>
      {online !== undefined && (
        <span className={`absolute -bottom-0.5 -right-0.5 ${s.dot} rounded-full border-2 border-white ${online ? 'bg-emerald-500' : 'bg-gray-300'}`} />
      )}
    </div>
  )
}

/** Get the avatar color for a name (for use outside the component) */
export function getAvatarColor(name: string) {
  return AVATAR_PALETTE[hashIndex(name)]
}

export function getAvatarGradient(name: string) {
  return AVATAR_GRADIENT_PALETTE[hashIndex(name)]
}
