/**
 * Single source of truth for all role-related constants.
 * Import from here instead of defining locally in each file.
 */

// ─── Role definitions ─────────────────────────────────────────────────────────

export const ALL_ROLES = [
  'ceo', 'coo', 'admin', 'pm', 'team_lead', 'employee',
] as const

export type Role = typeof ALL_ROLES[number]

/** Ordered list for display (dropdowns, pickers, labels) */
export const ROLE_ORDER: Role[] = [
  'ceo', 'coo', 'admin', 'pm', 'team_lead', 'employee',
]

/** Human-readable labels */
export const ROLE_LABELS: Record<Role, string> = {
  ceo:       'CEO',
  coo:       'COO',
  admin:     'Administrator',
  pm:        'Project Manager',
  team_lead: 'Team Lead',
  employee:  'Employee',
}

// ─── RBAC — what each role can create/assign ─────────────────────────────────

/**
 * Roles that a caller is allowed to assign when creating or editing a user.
 * Must match backend/routers/users.py  _ALLOWED_ROLES
 */
export const ASSIGNABLE_ROLES: Record<string, Role[]> = {
  ceo:       ['ceo', 'coo', 'admin', 'pm', 'team_lead', 'employee'],
  coo:       ['ceo', 'coo', 'admin', 'pm', 'team_lead', 'employee'],
  admin:     ['ceo', 'coo', 'admin', 'pm', 'team_lead', 'employee'],
  pm:        ['team_lead', 'employee'],
  team_lead: ['employee'],
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
  ceo:       'bg-purple-100 text-purple-700 border-purple-200',
  coo:       'bg-indigo-100 text-indigo-700 border-indigo-200',
  admin:     'bg-rose-100   text-rose-700   border-rose-200',
  pm:        'bg-blue-100   text-blue-700   border-blue-200',
  team_lead: 'bg-teal-100   text-teal-700   border-teal-200',
  employee:  'bg-gray-100   text-gray-600   border-gray-200',
}

/**
 * Tailwind gradient classes for avatar backgrounds.
 * Used in sidebar profile, user cards, team headers.
 */
export const ROLE_AVATAR_GRADIENT: Record<Role, string> = {
  ceo:       'from-purple-500 to-violet-600',
  coo:       'from-indigo-500 to-blue-600',
  admin:     'from-rose-500   to-red-600',
  pm:        'from-blue-500   to-cyan-600',
  team_lead: 'from-teal-500   to-emerald-600',
  employee:  'from-slate-400  to-gray-500',
}

/**
 * Simple badge bg + text (no border) for compact use (sidebar, settings).
 */
export const ROLE_BADGE_SIMPLE: Record<Role, string> = {
  ceo:       'bg-purple-100 text-purple-700',
  coo:       'bg-indigo-100 text-indigo-700',
  admin:     'bg-rose-100   text-rose-700',
  pm:        'bg-blue-100   text-blue-700',
  team_lead: 'bg-teal-100   text-teal-700',
  employee:  'bg-gray-100   text-gray-600',
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
