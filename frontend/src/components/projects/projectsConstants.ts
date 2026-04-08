import { ProjectTool } from '../common/ToolsPicker'

export const STATUS_TABS = ['all', 'planning', 'active', 'on_hold', 'completed', 'cancelled']
export const STATUS_COLORS: Record<string, string> = {
  planning:  'bg-blue-100 text-blue-700',
  active:    'bg-emerald-100 text-emerald-700',
  on_hold:   'bg-amber-100 text-amber-700',
  completed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-600',
}
export const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-amber-100 text-amber-700',
  low:      'bg-gray-100 text-gray-600',
}

export const emptyForm = {
  name: '', description: '', priority: 'medium',
  repo_url: '', repo_token: '', figma_url: '',
  start_date: new Date().toISOString().split('T')[0],
  due_date: '', team_ids: [] as string[], member_ids: [] as string[], tags: [] as string[],
  links: [] as { title: string; url: string }[],
  tools: [] as ProjectTool[],
}

export const TASK_STATUS_COLORS: Record<string, string> = {
  todo:        'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  review:      'bg-purple-100 text-purple-700',
  done:        'bg-emerald-100 text-emerald-700',
  blocked:     'bg-red-100 text-red-600',
}
export const TASK_PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-amber-100 text-amber-700',
  low:      'bg-gray-100 text-gray-500',
}

export const AVATAR_GRADIENTS = [
  'from-blue-400 to-indigo-500', 'from-purple-400 to-pink-500',
  'from-emerald-400 to-teal-500', 'from-orange-400 to-red-500',
  'from-cyan-400 to-blue-500', 'from-rose-400 to-pink-500',
]
export const getGradient = (name: string) => AVATAR_GRADIENTS[(name || 'A').charCodeAt(0) % AVATAR_GRADIENTS.length]
