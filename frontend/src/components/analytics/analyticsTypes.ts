/* ── Analytics Types ─────────────────────────────────────── */

export interface CompanyData {
  project_health: { total: number; active: number; delayed: number; completed: number; on_hold: number; completion_rate: number; delay_rate: number }
  task_metrics: { total: number; completed: number; overdue: number; completion_rate: number }
  report_trend: Array<{ date: string; count: number; avg_hours: number }>
  productivity_score: number
  by_department: Array<{ department: string; reports: number }>
}

export interface ProjectRow {
  id: string; name: string; status: string; priority: string; progress: number
  is_delayed: boolean; due_date: string | null; days_overdue: number
  member_count: number; tags: string[]
  total_tasks: number; done_tasks: number; blocked_tasks: number; overdue_tasks: number
  task_completion_rate: number; reports_in_period: number
  performance_score: number; rank: number; performance_tier: 'top' | 'low' | 'normal'
}

export interface PerfMode {
  score: number; label: string; color: string
  breakdown: { hours: number; tasks: number; compliance: number; commits: number; docs: number }
}

export interface EmployeeRow {
  id: string; name: string; email: string; department: string; role: string
  reports_in_period: number; submitted_today: boolean
  total_tasks: number; done_tasks: number; open_tasks: number; overdue_tasks: number
  task_completion_rate: number
  total_hours: number; avg_hours_per_day: number; last_mood: string
  github_repos: number; performance_mode: PerfMode
  rank: number; performance_tier: 'top' | 'low' | 'normal'
}

export interface EmployeeDetail {
  employee: { id: string; name: string; email: string; department: string; role: string }
  report_trend: Array<{ date: string; hours: number; mood: string; blockers: number }>
  mood_distribution: Record<string, number>
  task_distribution: Record<string, number>
  hours_summary: { total: number; avg: number; max: number }
  projects_involved: Array<{ id: string; name: string; status: string; progress: number; tasks_assigned: number; tasks_done: number }>
  github_commits: {
    repos: Array<{
      repo_url: string; repo_name: string; project_name?: string; total_commits: number; error?: string
      recent: Array<{ sha: string; author: string; message: string; date: string }>
    }>
    total_commits: number
    commits_per_day: number
  }
  tracking_docs?: {
    docs: Array<{
      project: string; title: string; url: string; doc_type: string
      version: number | null; modified_time?: string; last_modifier?: string; error?: string
    }>
    total_edits: number
    edits_per_day: number
  }
  performance_mode: PerfMode
  period_days: number
}

export interface ProjectDetail {
  task_distribution: Record<string, { count: number; hours: number }>
  report_trend: Array<{ date: string; count: number; avg_hours: number }>
  member_workload: Array<{ user_id: string; name: string; department: string; open_tasks: number; blocked: number }>
  commits?: {
    total?: number
    recent?: Array<{ sha: string; author: string; message: string; date: string }>
    contributors?: Array<{ author: string; commits: number; additions: number; deletions: number; avatar_url?: string }>
    error?: string
  }
}

export interface AISuggestions {
  suggestions: string[]
  context: Record<string, any>
  generated_at: string
}

export type Tab = 'overview' | 'projects' | 'employees'
