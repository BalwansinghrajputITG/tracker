/**
 * Granular permission strings (docs/hr.md §28).
 * Mirrors backend/middleware/permissions.py — PERMISSIONS.
 *
 * These drive PRESENTATION only: hiding a button or redacting a column is a
 * courtesy, never a control. Every endpoint re-checks server-side, and sensitive
 * fields are stripped from the response payload rather than hidden in the UI.
 */

export const PERMISSIONS = [
  // Employee records
  'employee.read', 'employee.read_all', 'employee.create',
  'employee.update', 'employee.update_self', 'employee.delete',
  // Compensation / payroll
  'salary.read', 'salary.update', 'payroll.read',
  // Organization
  'department.read', 'department.manage',
  'designation.read', 'designation.manage',
  // Recruitment
  'job_position.read', 'job_position.create', 'job_position.update', 'job_position.delete',
  'candidate.read', 'candidate.create', 'candidate.update', 'candidate.delete',
  'application.read', 'application.create', 'application.update',
  'interview.read', 'interview.schedule', 'interview.update', 'interview.cancel',
  'feedback.read', 'feedback.submit',
  'offer.read', 'offer.create', 'offer.update', 'offer.approve', 'offer.send',
  'onboarding.read', 'onboarding.manage',
  // Time
  'attendance.read', 'attendance.read_all', 'attendance.mark',
  'attendance.update', 'attendance.regularize',
  'leave.read', 'leave.read_all', 'leave.request',
  'leave.approve', 'leave.approve_final', 'leave.manage',
  'holiday.read', 'holiday.manage',
  // Documents
  'document.read', 'document.read_all', 'document.upload',
  'document.download', 'document.delete', 'document.read_history',
  // Performance
  'performance.read', 'performance.read_all', 'performance.manage', 'performance.review',
  'goal.read', 'goal.create', 'goal.update', 'goal.approve',
  // Helpdesk
  'ticket.read', 'ticket.read_all', 'ticket.create', 'ticket.assign', 'ticket.resolve',
  // Platform
  'audit.read', 'audit.read_sensitive', 'analytics.hr_read',
  'integration.read', 'integration.sync', 'rbac.manage',
] as const

export type Permission = typeof PERMISSIONS[number]

/**
 * Permissions required to see each HR nav entry. A user needs ANY one of them.
 * Consumed by Sidebar alongside the older role-based NAV_ROLES.
 */
export const NAV_PERMISSIONS: Record<string, Permission[]> = {
  '/hr':             ['analytics.hr_read'],
  '/hr/employees':   ['employee.read_all'],
  '/hr/recruitment': ['candidate.read', 'job_position.read'],
  // Self-service, so everyone sees it: the page scopes to the caller and is
  // where an employee checks in and requests leave. Gating on *.read_all would
  // hide it from exactly the people who need it daily.
  '/hr/time':        ['leave.request', 'attendance.mark', 'leave.read_all'],
  // Self-service: everyone has goals and a review, so gating on read_all
  // would hide the page from the people it is about.
  '/hr/performance': ['performance.read', 'performance.read_all'],
  // Anyone can raise a ticket; the list scopes to what they may see.
  '/hr/helpdesk':    ['ticket.create', 'ticket.read_all'],
}
