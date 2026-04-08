// ─── Shared Types & Constants for Project Detail ────────────────────────────

export interface ProjectDetailPageProps {
  projectId: string
}

export const STATUS_COLORS: Record<string, string> = {
  planning:  'bg-blue-100 text-blue-700 border-blue-200',
  active:    'bg-emerald-100 text-emerald-700 border-emerald-200',
  on_hold:   'bg-amber-100 text-amber-700 border-amber-200',
  completed: 'bg-gray-100 text-gray-600 border-gray-200',
  cancelled: 'bg-red-100 text-red-600 border-red-200',
}

export const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-amber-100 text-amber-700',
  low:      'bg-gray-100 text-gray-500',
}

export const TASK_STATUS_COLORS: Record<string, string> = {
  todo:        'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  review:      'bg-purple-100 text-purple-700',
  done:        'bg-emerald-100 text-emerald-700',
  blocked:     'bg-red-100 text-red-600',
}

export const GRADIENTS = [
  'from-blue-400 to-indigo-500', 'from-purple-400 to-pink-500',
  'from-emerald-400 to-teal-500', 'from-orange-400 to-red-500',
  'from-cyan-400 to-blue-500',
]

export const getGrad = (s: string) => GRADIENTS[(s?.charCodeAt(0) || 0) % GRADIENTS.length]

export const fmt = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n)

export const PHASE_META: Record<string, {
  label: string; dot: string; ring: string; bar: string; badge: string; textColor: string
}> = {
  planning:  { label: 'Planning',  dot: 'bg-blue-500',    ring: 'ring-blue-300',    bar: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 border-blue-200',         textColor: 'text-blue-600'   },
  active:    { label: 'Active',    dot: 'bg-emerald-500', ring: 'ring-emerald-300', bar: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', textColor: 'text-emerald-600' },
  on_hold:   { label: 'On Hold',   dot: 'bg-amber-500',   ring: 'ring-amber-300',   bar: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200',       textColor: 'text-amber-600'  },
  completed: { label: 'Completed', dot: 'bg-gray-400',    ring: 'ring-gray-300',    bar: 'bg-gray-400',    badge: 'bg-gray-100 text-gray-600 border-gray-200',         textColor: 'text-gray-600'   },
  cancelled: { label: 'Cancelled', dot: 'bg-red-500',     ring: 'ring-red-300',     bar: 'bg-red-500',     badge: 'bg-red-50 text-red-600 border-red-200',             textColor: 'text-red-600'    },
}

export const PHASE_ORDER = ['planning', 'active', 'on_hold', 'completed', 'cancelled']

// Quick-add suggestions (shown as chips when adding a stage)
export const STAGE_SUGGESTIONS: Record<string, string[]> = {
  planning:  ['Requirements Gathering', 'Resource Planning', 'Risk Assessment', 'Timeline & Milestones', 'Budget Approval', 'Project Kickoff'],
  active:    ['Design & Architecture', 'Development', 'Code Review', 'Testing & QA', 'Staging Deployment', 'Production Release'],
  on_hold:   ['Identify Blockers', 'Stakeholder Review', 'Impact Assessment', 'Resume Plan'],
  completed: ['Documentation', 'Client Handover', 'Retrospective', 'Project Archive'],
  cancelled: ['Notify Team', 'Resource Release', 'Cancellation Docs'],
}

export interface PhaseTrackerProps {
  project: any
  canManage: boolean
  canToggleStage: boolean
  projectId: string
  onUpdate: () => void
}
