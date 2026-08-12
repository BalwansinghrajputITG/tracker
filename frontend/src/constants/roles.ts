/**
 * Single source of truth for all role-related constants.
 * Import from here instead of defining locally in each file.
 */

// ─── Role definitions ─────────────────────────────────────────────────────────

export const ALL_ROLES = [
  'ceo', 'coo', 'admin', 'pm', 'team_lead', 'employee',
  // HR Controller roles (docs/hr.md §28) — must match backend/middleware/permissions.py
  'hr_admin', 'hr_manager', 'recruiter', 'hiring_manager', 'finance',
] as const

export type Role = typeof ALL_ROLES[number]

/** Ordered list for display (dropdowns, pickers, labels) */
export const ROLE_ORDER: Role[] = [
  'ceo', 'coo', 'admin',
  'hr_admin', 'hr_manager', 'recruiter', 'hiring_manager', 'finance',
  'pm', 'team_lead', 'employee',
]

/** Human-readable labels */
export const ROLE_LABELS: Record<Role, string> = {
  ceo:            'CEO',
  coo:            'COO',
  admin:          'Administrator',
  pm:             'Project Manager',
  team_lead:      'Team Lead',
  employee:       'Employee',
  hr_admin:       'HR Admin',
  hr_manager:     'HR Manager',
  recruiter:      'Recruiter',
  hiring_manager: 'Hiring Manager',
  finance:        'Finance',
}

// ─── RBAC — what each role can create/assign ─────────────────────────────────

/**
 * Roles that a caller is allowed to assign when creating or editing a user.
 * Must match backend/routers/users.py  _ALLOWED_ROLES
 */
export const ASSIGNABLE_ROLES: Record<string, Role[]> = {
  ceo:        [...ROLE_ORDER],
  coo:        [...ROLE_ORDER],
  admin:      [...ROLE_ORDER],
  hr_admin:   ['hr_manager', 'recruiter', 'hiring_manager', 'finance', 'employee'],
  hr_manager: ['recruiter', 'employee'],
  pm:         ['team_lead', 'employee'],
  team_lead:  ['employee'],
}

// ─── Permission helpers ───────────────────────────────────────────────────────

/** Roles that can manage other users (edit, deactivate, assign projects) */
export const MANAGER_ROLES: Role[] = ['ceo', 'coo', 'admin', 'pm', 'team_lead']

/** Roles with full exec / analytics access */
export const EXEC_ROLES: Role[] = ['ceo', 'coo', 'admin']

/** Roles that can see analytics, reports, and management pages */
export const ANALYTICS_ROLES: Role[] = ['ceo', 'coo', 'admin', 'pm', 'team_lead']

/** Roles that can manage projects (create, edit, delete) */
export const PROJECT_MANAGER_ROLES: Role[] = ['ceo', 'coo', 'admin', 'pm', 'team_lead']

/** Helper — does the caller have manager-level access? */
export const isManager = (role: string | undefined) =>
  MANAGER_ROLES.includes(role as Role)

/** Helper — is the caller an exec (CEO / COO / Admin)? */
export const isExec = (role: string | undefined) =>
  EXEC_ROLES.includes(role as Role)

// ─── Styling ──────────────────────────────────────────────────────────────────

/**
 * Tailwind badge classes (bg + text + border) for role chips/pills.
 * Used in user cards, tables, modals.
 */
export const ROLE_BADGE_CLASSES: Record<Role, string> = {
  ceo:            'bg-purple-100 text-purple-700 border-purple-200',
  coo:            'bg-indigo-100 text-indigo-700 border-indigo-200',
  admin:          'bg-rose-100   text-rose-700   border-rose-200',
  pm:             'bg-blue-100   text-blue-700   border-blue-200',
  team_lead:      'bg-teal-100   text-teal-700   border-teal-200',
  employee:       'bg-gray-100   text-gray-600   border-gray-200',
  hr_admin:       'bg-amber-100  text-amber-700  border-amber-200',
  hr_manager:     'bg-orange-100 text-orange-700 border-orange-200',
  recruiter:      'bg-lime-100   text-lime-700   border-lime-200',
  hiring_manager: 'bg-cyan-100   text-cyan-700   border-cyan-200',
  finance:        'bg-emerald-100 text-emerald-700 border-emerald-200',
}

/**
 * Tailwind gradient classes for avatar backgrounds.
 * Used in sidebar profile, user cards, team headers.
 */
export const ROLE_AVATAR_GRADIENT: Record<Role, string> = {
  ceo:            'from-purple-500 to-violet-600',
  coo:            'from-indigo-500 to-blue-600',
  admin:          'from-rose-500   to-red-600',
  pm:             'from-blue-500   to-cyan-600',
  team_lead:      'from-teal-500   to-emerald-600',
  employee:       'from-slate-400  to-gray-500',
  hr_admin:       'from-amber-500  to-orange-600',
  hr_manager:     'from-orange-500 to-amber-600',
  recruiter:      'from-lime-500   to-green-600',
  hiring_manager: 'from-cyan-500   to-sky-600',
  finance:        'from-emerald-500 to-teal-600',
}

/**
 * Simple badge bg + text (no border) for compact use (sidebar, settings).
 */
export const ROLE_BADGE_SIMPLE: Record<Role, string> = {
  ceo:            'bg-purple-100 text-purple-700',
  coo:            'bg-indigo-100 text-indigo-700',
  admin:          'bg-rose-100   text-rose-700',
  pm:             'bg-blue-100   text-blue-700',
  team_lead:      'bg-teal-100   text-teal-700',
  employee:       'bg-gray-100   text-gray-600',
  hr_admin:       'bg-amber-100  text-amber-700',
  hr_manager:     'bg-orange-100 text-orange-700',
  recruiter:      'bg-lime-100   text-lime-700',
  hiring_manager: 'bg-cyan-100   text-cyan-700',
  finance:        'bg-emerald-100 text-emerald-700',
}

// ─── Nav access ───────────────────────────────────────────────────────────────

/**
 * Which roles can access each route.
 * Used in Sidebar to filter visible nav items.
 */
export const NAV_ROLES: Record<string, Role[]> = {
  '/projects':  ['ceo', 'coo', 'admin', 'pm', 'team_lead', 'employee'],
  '/tasks':     ['ceo', 'coo', 'admin', 'pm', 'team_lead'],
  '/reports':   ['ceo', 'coo', 'admin', 'pm', 'team_lead', 'employee'],
  '/chat':      ['ceo', 'coo', 'admin', 'pm', 'team_lead', 'employee'],
  '/users':     ['ceo', 'coo', 'admin', 'pm', 'team_lead'],
  '/analytics': ['ceo', 'coo', 'admin', 'pm', 'team_lead'],
  '/basecamp':  ['ceo', 'coo', 'admin', 'pm', 'team_lead', 'employee'],
}
