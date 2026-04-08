import React from 'react'
import { ThumbsUp, Smile, Meh, Frown, ThumbsDown } from 'lucide-react'

// ─── Gradients & Helpers ──────────────────────────────────────────────────────

export const TEAM_GRADIENTS = [
  'from-blue-400 to-indigo-500',
  'from-teal-400 to-emerald-500',
  'from-violet-400 to-purple-500',
  'from-rose-400 to-pink-500',
  'from-amber-400 to-orange-500',
  'from-cyan-400 to-sky-500',
]

export function teamGradient(name: string) {
  const sum = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return TEAM_GRADIENTS[sum % TEAM_GRADIENTS.length]
}

export function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function isToday(dateStr: string | undefined) {
  if (!dateStr) return false
  return new Date(dateStr).toDateString() === new Date().toDateString()
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const MOODS = [
  { icon: React.createElement(ThumbsUp, { size: 15 }),   value: 'great',    label: 'Great',    active: 'bg-emerald-500 text-white border-emerald-500', inactive: 'border-gray-200 text-gray-500 hover:border-emerald-300' },
  { icon: React.createElement(Smile, { size: 15 }),      value: 'good',     label: 'Good',     active: 'bg-blue-500 text-white border-blue-500',        inactive: 'border-gray-200 text-gray-500 hover:border-blue-300' },
  { icon: React.createElement(Meh, { size: 15 }),        value: 'neutral',  label: 'Neutral',  active: 'bg-amber-500 text-white border-amber-500',      inactive: 'border-gray-200 text-gray-500 hover:border-amber-300' },
  { icon: React.createElement(Frown, { size: 15 }),      value: 'stressed', label: 'Stressed', active: 'bg-orange-500 text-white border-orange-500',    inactive: 'border-gray-200 text-gray-500 hover:border-orange-300' },
  { icon: React.createElement(ThumbsDown, { size: 15 }), value: 'blocked',  label: 'Blocked',  active: 'bg-red-500 text-white border-red-500',          inactive: 'border-gray-200 text-gray-500 hover:border-red-300' },
]

export const STATUS_COLS = ['todo', 'in_progress', 'review', 'blocked', 'done']

export const STATUS_LABELS: Record<string, string> = {
  todo: 'To Do', in_progress: 'In Progress', review: 'In Review', blocked: 'Blocked', done: 'Done',
}

export const STATUS_COLORS: Record<string, string> = {
  todo:        'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  review:      'bg-purple-100 text-purple-700',
  blocked:     'bg-red-100 text-red-700',
  done:        'bg-emerald-100 text-emerald-700',
}

export const STATUS_BAR: Record<string, string> = {
  todo:        'bg-gray-300',
  in_progress: 'bg-blue-500',
  review:      'bg-purple-500',
  blocked:     'bg-red-500',
  done:        'bg-emerald-500',
}

export const STATUS_DOT: Record<string, string> = {
  todo:        'bg-gray-400',
  in_progress: 'bg-blue-500',
  review:      'bg-purple-500',
  blocked:     'bg-red-500',
  done:        'bg-emerald-500',
}

export const COLUMN_HEADER: Record<string, { bg: string; border: string }> = {
  todo:        { bg: 'bg-gray-50',    border: 'border-gray-200'   },
  in_progress: { bg: 'bg-blue-50',   border: 'border-blue-200'   },
  review:      { bg: 'bg-purple-50', border: 'border-purple-200' },
  blocked:     { bg: 'bg-red-50',    border: 'border-red-200'    },
  done:        { bg: 'bg-emerald-50',border: 'border-emerald-200'},
}

export const PRIORITY_BORDER: Record<string, string> = {
  critical: 'border-l-red-500',
  high:     'border-l-orange-400',
  medium:   'border-l-amber-400',
  low:      'border-l-gray-300',
}

export const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-50 text-red-600',
  high:     'bg-orange-50 text-orange-600',
  medium:   'bg-amber-50 text-amber-600',
  low:      'bg-gray-100 text-gray-500',
}

export const PRIORITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  high:     'bg-orange-400',
  medium:   'bg-amber-400',
  low:      'bg-gray-300',
}
