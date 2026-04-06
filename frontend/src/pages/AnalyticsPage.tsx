import React, { useEffect, useState, useCallback } from 'react'
import { useSelector } from 'react-redux'
import {
  TrendingUp, CheckSquare, Lock, FolderOpen, Users, FileText,
  Zap, AlertTriangle, ChevronLeft, ChevronRight,
  Search, Filter, Target, Activity, Clock, BarChart3,
  CheckCircle2, Smile, Meh, Frown, ThumbsUp, ThumbsDown,
  Building2, Calendar, GitCommit, GitBranch, Sparkles, RefreshCw,
  Lightbulb, XCircle, Github, Trophy, TrendingDown,
} from 'lucide-react'
import { RootState } from '../store'
import { api } from '../utils/api'

/* ── Types ─────────────────────────────────────────────── */

interface CompanyData {
  project_health: { total: number; active: number; delayed: number; completed: number; on_hold: number; completion_rate: number; delay_rate: number }
  task_metrics: { total: number; completed: number; overdue: number; completion_rate: number }
  report_trend: Array<{ date: string; count: number; avg_hours: number }>
  productivity_score: number
  by_department: Array<{ department: string; reports: number }>
}

interface ProjectRow {
  id: string; name: string; status: string; priority: string; progress: number
  is_delayed: boolean; due_date: string | null; days_overdue: number
  member_count: number; tags: string[]
  total_tasks: number; done_tasks: number; blocked_tasks: number; overdue_tasks: number
  task_completion_rate: number; reports_in_period: number
  performance_score: number; rank: number; performance_tier: 'top' | 'low' | 'normal'
}

interface PerfMode {
  score: number; label: string; color: string
  breakdown: { hours: number; tasks: number; compliance: number; commits: number; docs: number }
}

interface EmployeeRow {
  id: string; name: string; email: string; department: string; role: string
  reports_in_period: number; submitted_today: boolean
  total_tasks: number; done_tasks: number; open_tasks: number; overdue_tasks: number
  task_completion_rate: number
  total_hours: number; avg_hours_per_day: number; last_mood: string
  github_repos: number; performance_mode: PerfMode
  rank: number; performance_tier: 'top' | 'low' | 'normal'
}

interface EmployeeDetail {
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

interface ProjectDetail {
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

interface AISuggestions {
  suggestions: string[]
  context: Record<string, any>
  generated_at: string
}

/* ── Shared visual helpers ─────────────────────────────── */

const STATUS_CFG: Record<string, { dot: string; text: string; bg: string }> = {
  active:      { dot: 'bg-blue-500',    text: 'text-blue-700',    bg: 'bg-blue-50'    },
  planning:    { dot: 'bg-violet-400',  text: 'text-violet-700',  bg: 'bg-violet-50'  },
  on_hold:     { dot: 'bg-amber-400',   text: 'text-amber-700',   bg: 'bg-amber-50'   },
  completed:   { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  cancelled:   { dot: 'bg-gray-400',    text: 'text-gray-600',    bg: 'bg-gray-50'    },
}

const PRIORITY_CFG: Record<string, { text: string; bg: string }> = {
  critical: { text: 'text-red-700',    bg: 'bg-red-100'    },
  high:     { text: 'text-orange-700', bg: 'bg-orange-100' },
  medium:   { text: 'text-amber-700',  bg: 'bg-amber-100'  },
  low:      { text: 'text-gray-600',   bg: 'bg-gray-100'   },
}

const MOOD_CFG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  great:      { icon: <ThumbsUp size={13} />,   label: 'Great',     color: 'text-emerald-600' },
  good:       { icon: <Smile size={13} />,       label: 'Good',      color: 'text-blue-600'    },
  neutral:    { icon: <Meh size={13} />,         label: 'Neutral',   color: 'text-amber-600'   },
  stressed:   { icon: <Frown size={13} />,       label: 'Stressed',  color: 'text-orange-600'  },
  burned_out: { icon: <ThumbsDown size={13} />,  label: 'Burned Out',color: 'text-red-600'     },
  blocked:    { icon: <XCircle size={13} />,     label: 'Blocked',   color: 'text-red-700'     },
}

const MODE_CFG: Record<string, { badge: string; bar: string; ring: string; bg: string; text: string }> = {
  green: { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', bar: 'bg-emerald-500', ring: 'ring-emerald-200', bg: 'bg-emerald-50',  text: 'text-emerald-700' },
  blue:  { badge: 'bg-blue-100 text-blue-700 border-blue-200',          bar: 'bg-blue-500',    ring: 'ring-blue-200',   bg: 'bg-blue-50',     text: 'text-blue-700'    },
  amber: { badge: 'bg-amber-100 text-amber-700 border-amber-200',       bar: 'bg-amber-500',   ring: 'ring-amber-200',  bg: 'bg-amber-50',    text: 'text-amber-700'   },
  red:   { badge: 'bg-red-100 text-red-600 border-red-200',             bar: 'bg-red-500',     ring: 'ring-red-200',    bg: 'bg-red-50',      text: 'text-red-600'     },
}

function HBar({ value, max, color = 'bg-blue-500' }: { value: number; max: number; color?: string }) {
  return (
    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
    </div>
  )
}

function StatPill({ label, value, color = 'text-gray-800' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="text-center bg-gray-50 rounded-xl p-2.5">
      <p className={`text-base font-black leading-tight ${color}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
    </div>
  )
}

function ColChart({ points, labels, color = '#6366f1', height = 80 }: {
  points: number[]; labels: string[]; color?: string; height?: number
}) {
  const max = Math.max(...points, 1)
  if (!points.length) return <p className="text-xs text-gray-400 text-center py-4">No data</p>
  return (
    <div className="flex items-end gap-0.5" style={{ height }}>
      {points.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center group relative cursor-pointer" style={{ height }}>
          <div
            className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none"
          >{labels[i]}: {v}</div>
          <div
            className="w-full rounded-t transition-all duration-300 hover:opacity-80"
            style={{ height: `${Math.max((v / max) * 100, 3)}%`, background: color, marginTop: 'auto' }}
          />
        </div>
      ))}
    </div>
  )
}

function DonutMini({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).filter(([, v]) => v > 0)
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1
  const COLORS = ['#3b82f6', '#22c55e', '#ef4444', '#f59e0b', '#8b5cf6', '#6b7280']
  let off = 25
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-20 h-20 shrink-0">
        <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
          <circle r="13" cx="18" cy="18" fill="transparent" stroke="#f1f5f9" strokeWidth="5" />
          {entries.map(([key, val], i) => {
            const pct = (val / total) * 100
            const el = (
              <circle key={key} r="13" cx="18" cy="18" fill="transparent"
                stroke={COLORS[i % COLORS.length]} strokeWidth="5"
                strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={-off}
                style={{ transition: 'stroke-dasharray 0.7s ease' }}
              />
            )
            off += pct
            return el
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm font-black text-gray-700">{total}</p>
        </div>
      </div>
      <div className="flex-1 space-y-1.5">
        {entries.map(([key, val], i) => (
          <div key={key} className="flex items-center gap-1.5 text-xs">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="text-gray-600 flex-1 capitalize">{key.replace('_', ' ')}</span>
            <span className="font-bold text-gray-700">{val}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Loading skeleton ──────────────────────────────────── */
function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-10 skeleton rounded-xl" />
      {[...Array(rows)].map((_, i) => <div key={i} className="h-16 skeleton rounded-xl" />)}
    </div>
  )
}

/* ── Main page ─────────────────────────────────────────── */

type Tab = 'overview' | 'projects' | 'employees'

export const AnalyticsPage: React.FC = () => {
  const { user } = useSelector((s: RootState) => s.auth)
  const [tab, setTab] = useState<Tab>('overview')
  const [range, setRange] = useState(30)
  const isManager = ['ceo', 'coo', 'pm', 'team_lead'].includes(user?.primary_role || '')

  if (!isManager) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 animate-fade-in">
        <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
          <Lock size={24} className="text-gray-300" />
        </div>
        <p className="text-base font-semibold text-gray-600">Access Restricted</p>
        <p className="text-sm mt-1">Analytics are available to managers only</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-500 text-sm mt-0.5">Deep insights across your organisation</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-xl p-1">
            {[7, 30, 90].map(d => (
              <button key={d} onClick={() => setRange(d)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${range === d ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {d}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
        {([
          { id: 'overview',  label: 'Overview',  icon: <BarChart3 size={14} /> },
          { id: 'projects',  label: 'Projects',  icon: <FolderOpen size={14} /> },
          { id: 'employees', label: 'Employees', icon: <Users size={14} /> },
        ] as { id: Tab; label: string; icon: React.ReactNode }[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'overview'  && <OverviewTab range={range} />}
      {tab === 'projects'  && <ProjectsTab range={range} />}
      {tab === 'employees' && <EmployeesTab range={range} />}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   OVERVIEW TAB
═══════════════════════════════════════════════════════════ */

function OverviewTab({ range }: { range: number }) {
  const [data, setData] = useState<CompanyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true); setError('')
    api.get('/analytics/company', { params: { days: range } })
      .then(r => setData(r.data))
      .catch(e => setError(e?.response?.data?.detail || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [range])

  if (loading) return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-28 skeleton rounded-2xl" />)}</div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">{[...Array(3)].map((_, i) => <div key={i} className="h-56 skeleton rounded-2xl" />)}</div>
    </div>
  )
  if (error) return <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-100">{error}</div>
  if (!data) return null

  const ph = data.project_health
  const tm = data.task_metrics
  const trendPoints = data.report_trend.slice(-14).map(r => r.count)
  const trendLabels = data.report_trend.slice(-14).map(r => r.date)
  const maxDept = Math.max(...data.by_department.map(d => d.reports), 1)

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Productivity Score', value: `${data.productivity_score}%`, sub: 'Composite KPI', icon: <Zap size={18} />, color: data.productivity_score >= 70 ? 'text-emerald-600' : data.productivity_score >= 40 ? 'text-amber-600' : 'text-red-600', bg: data.productivity_score >= 70 ? 'bg-emerald-50' : data.productivity_score >= 40 ? 'bg-amber-50' : 'bg-red-50', delay: 0.05 },
          { label: 'Project Completion', value: `${ph.completion_rate}%`, sub: `${ph.completed} of ${ph.total} done`, icon: <FolderOpen size={18} className="text-blue-600" />, color: 'text-blue-600', bg: 'bg-blue-50', delay: 0.10 },
          { label: 'Task Completion', value: `${tm.completion_rate}%`, sub: `${tm.completed} of ${tm.total} done`, icon: <CheckSquare size={18} className="text-violet-600" />, color: 'text-violet-600', bg: 'bg-violet-50', delay: 0.15 },
          { label: 'Delay Rate', value: `${ph.delay_rate}%`, sub: `${ph.delayed} projects delayed`, icon: <AlertTriangle size={18} className={ph.delayed > 0 ? 'text-red-500' : 'text-emerald-500'} />, color: ph.delayed > 0 ? 'text-red-600' : 'text-emerald-600', bg: ph.delayed > 0 ? 'bg-red-50' : 'bg-emerald-50', delay: 0.20 },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 animate-fade-in-up card-hover" style={{ animationDelay: `${c.delay}s` }}>
            <div className={`w-10 h-10 ${c.bg} rounded-xl flex items-center justify-center mb-3`}>{c.icon}</div>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-sm text-gray-500 font-medium mt-0.5">{c.label}</p>
            {c.sub && <p className="text-xs text-gray-400 mt-1">{c.sub}</p>}
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Project health donut */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center"><FolderOpen size={14} className="text-blue-600" /></div>
            <h3 className="text-sm font-semibold text-gray-700">Project Health</h3>
          </div>
          <DonutMini data={{ active: ph.active, completed: ph.completed, delayed: ph.delayed, on_hold: ph.on_hold }} />
          <div className="mt-4 pt-3 border-t border-gray-50 grid grid-cols-2 gap-2">
            <StatPill label="Completion" value={`${ph.completion_rate}%`} color="text-blue-600" />
            <StatPill label="Delay Rate" value={`${ph.delay_rate}%`} color={ph.delay_rate > 20 ? 'text-red-600' : 'text-emerald-600'} />
          </div>
        </div>

        {/* Task breakdown */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 animate-fade-in-up" style={{ animationDelay: '0.30s' }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 bg-violet-50 rounded-lg flex items-center justify-center"><CheckSquare size={14} className="text-violet-600" /></div>
            <h3 className="text-sm font-semibold text-gray-700">Task Breakdown</h3>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Completed', val: tm.completed, color: 'bg-emerald-500', tc: 'text-emerald-600' },
              { label: 'In Progress', val: Math.max(0, tm.total - tm.completed - tm.overdue), color: 'bg-blue-500', tc: 'text-blue-600' },
              { label: 'Overdue', val: tm.overdue, color: 'bg-red-400', tc: 'text-red-600' },
            ].map(it => (
              <div key={it.label}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-gray-500 font-medium">{it.label}</span>
                  <span className={`font-bold ${it.tc}`}>{it.val}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${it.color} transition-all duration-700`} style={{ width: `${tm.total ? (it.val / tm.total) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-gray-50 grid grid-cols-2 gap-2">
            <StatPill label="Total" value={tm.total} />
            <StatPill label="Rate" value={`${tm.completion_rate}%`} color="text-violet-600" />
          </div>
        </div>

        {/* Productivity score ring */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 animate-fade-in-up" style={{ animationDelay: '0.35s' }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 bg-amber-50 rounded-lg flex items-center justify-center"><Target size={14} className="text-amber-600" /></div>
            <h3 className="text-sm font-semibold text-gray-700">Productivity Score</h3>
          </div>
          <div className="flex flex-col items-center py-1">
            {(() => {
              const s = data.productivity_score
              const r = 38; const circ = 2 * Math.PI * r; const dash = (s / 100) * circ
              const color = s >= 70 ? '#22c55e' : s >= 40 ? '#f59e0b' : '#ef4444'
              return (
                <div className="relative w-24 h-24">
                  <svg viewBox="0 0 100 100" className="w-24 h-24 -rotate-90">
                    <circle cx="50" cy="50" r={r} fill="none" stroke="#f1f5f9" strokeWidth="10" />
                    <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
                      strokeDasharray={`${dash} ${circ - dash}`}
                      style={{ transition: 'stroke-dasharray 1s ease' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-xl font-black" style={{ color }}>{s}%</p>
                  </div>
                </div>
              )
            })()}
            <p className={`mt-2 text-sm font-bold ${data.productivity_score >= 70 ? 'text-emerald-600' : data.productivity_score >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
              {data.productivity_score >= 70 ? 'Excellent' : data.productivity_score >= 40 ? 'Moderate' : 'Needs Improvement'}
            </p>
          </div>
          {trendPoints.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-50">
              <p className="text-xs text-gray-400 mb-2">Report submissions ({range}d)</p>
              <ColChart points={trendPoints} labels={trendLabels} color="#6366f1" height={48} />
            </div>
          )}
        </div>
      </div>

      {/* Report trend + Dept breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {data.report_trend.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 animate-fade-in-up" style={{ animationDelay: '0.40s' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center"><FileText size={14} className="text-blue-600" /></div>
                <h3 className="text-sm font-semibold text-gray-700">Report Submissions</h3>
              </div>
              <span className="text-xs text-gray-400">Last {range} days</span>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <StatPill label="Total" value={data.report_trend.reduce((s, r) => s + r.count, 0)} />
              <StatPill label="Avg/day" value={Math.round(data.report_trend.reduce((s, r) => s + r.count, 0) / (data.report_trend.length || 1))} />
              <StatPill label="Avg hrs" value={(data.report_trend.reduce((s, r) => s + r.avg_hours, 0) / (data.report_trend.length || 1)).toFixed(1)} />
            </div>
            <ColChart points={trendPoints} labels={trendLabels} color="#3b82f6" height={80} />
          </div>
        )}
        {data.by_department.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 animate-fade-in-up" style={{ animationDelay: '0.45s' }}>
            <div className="flex items-center gap-2 mb-5">
              <div className="w-7 h-7 bg-indigo-50 rounded-lg flex items-center justify-center"><Building2 size={14} className="text-indigo-600" /></div>
              <h3 className="text-sm font-semibold text-gray-700">Reports by Department</h3>
              <span className="ml-auto text-xs text-gray-400">Last {range} days</span>
            </div>
            <div className="space-y-2.5">
              {data.by_department.map((d, i) => (
                <div key={d.department} className="flex items-center gap-3 animate-fade-in" style={{ animationDelay: `${i * 0.04}s` }}>
                  <div className="w-6 h-6 rounded-md flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: `hsl(${220 + i * 25}, 70%, 55%)` }}>
                    {d.department[0]?.toUpperCase()}
                  </div>
                  <span className="text-xs text-gray-600 w-28 truncate shrink-0 font-medium">{d.department}</span>
                  <HBar value={d.reports} max={maxDept} color="bg-indigo-500" />
                  <span className="text-xs font-bold text-gray-700 w-8 text-right shrink-0">{d.reports}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Insight callouts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-fade-in-up" style={{ animationDelay: '0.50s' }}>
        {[
          { icon: <Activity size={15} className="text-blue-600" />, bg: 'bg-blue-50', title: 'Project Health', text: ph.delay_rate > 20 ? `${ph.delay_rate}% of projects are delayed — consider a sprint review.` : `Only ${ph.delay_rate}% delay rate — projects are largely on track.` },
          { icon: <CheckSquare size={15} className="text-violet-600" />, bg: 'bg-violet-50', title: 'Task Velocity', text: tm.completion_rate >= 70 ? `${tm.completion_rate}% task completion — teams are highly productive.` : `Task completion at ${tm.completion_rate}%. ${tm.overdue} tasks overdue and need attention.` },
          { icon: <BarChart3 size={15} className="text-amber-600" />, bg: 'bg-amber-50', title: 'Reporting Cadence', text: data.productivity_score >= 70 ? `Productivity score of ${data.productivity_score}% is excellent.` : `Productivity at ${data.productivity_score}%. Encourage daily report submissions.` },
        ].map(c => (
          <div key={c.title} className={`rounded-2xl p-4 ${c.bg}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 bg-white rounded-lg flex items-center justify-center shadow-sm">{c.icon}</div>
              <p className="text-xs font-semibold text-gray-700">{c.title}</p>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">{c.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   PROJECTS TAB
═══════════════════════════════════════════════════════════ */

function ProjectsTab({ range }: { range: number }) {
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selected, setSelected] = useState<ProjectRow | null>(null)
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [aiData, setAiData] = useState<AISuggestions | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    setLoading(true); setError('')
    api.get('/analytics/projects', { params: { days: range } })
      .then(r => setProjects(r.data.projects || []))
      .catch(e => setError(e?.response?.data?.detail || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [range])

  const fetchAI = useCallback(async (projectId: string) => {
    setAiData(null); setAiLoading(true)
    try {
      const r = await api.get(`/analytics/project/${projectId}/ai`, { params: { days: range } })
      setAiData(r.data)
    } catch { setAiData(null) }
    finally { setAiLoading(false) }
  }, [range])

  const openDetail = useCallback(async (p: ProjectRow) => {
    setSelected(p); setDetail(null); setDetailLoading(true); setAiData(null)
    try {
      const [detailRes] = await Promise.all([
        api.get(`/analytics/project/${p.id}`, { params: { days: range } }),
      ])
      setDetail(detailRes.data)
      // Fetch AI suggestions in background
      fetchAI(p.id)
    } catch { setDetail(null) }
    finally { setDetailLoading(false) }
  }, [range, fetchAI])

  const filtered = projects
    .filter(p => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
      const matchStatus = statusFilter === 'all' || p.status === statusFilter
      return matchSearch && matchStatus
    })
    .sort((a, b) => b.performance_score - a.performance_score)

  const topProjects = filtered.filter(p => p.performance_tier === 'top').slice(0, 5)
  const lowProjects = filtered.filter(p => p.performance_tier === 'low')

  if (selected) return <ProjectDetailView project={selected} detail={detail} loading={detailLoading} onBack={() => { setSelected(null); setDetail(null); setAiData(null) }} range={range} aiData={aiData} aiLoading={aiLoading} onRefreshAI={() => fetchAI(selected.id)} />

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 animate-fade-in-up">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects or tags…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={13} className="text-gray-400 shrink-0" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="all">All Statuses</option>
            {['active', 'planning', 'on_hold', 'completed', 'cancelled'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </div>
      </div>

      {/* Top 5 performers banner */}
      {!loading && topProjects.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-2xl p-4 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-amber-100 rounded-lg flex items-center justify-center">
              <Trophy size={14} className="text-amber-600" />
            </div>
            <h3 className="text-sm font-bold text-amber-800">Top Performing Projects</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {topProjects.map((p, i) => (
              <button key={p.id} onClick={() => openDetail(p)}
                className="flex items-center gap-1.5 bg-white border border-amber-200 rounded-xl px-3 py-1.5 hover:border-amber-400 hover:shadow-sm transition-all">
                <span className="text-xs font-black text-amber-600">#{p.rank}</span>
                <span className="text-xs font-semibold text-gray-800">{p.name}</span>
                <span className="text-xs font-bold text-emerald-600">{p.performance_score}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Low performers banner */}
      {!loading && lowProjects.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-red-100 rounded-lg flex items-center justify-center">
              <TrendingDown size={14} className="text-red-600" />
            </div>
            <h3 className="text-sm font-bold text-red-700">Needs Attention</h3>
            <span className="text-xs text-red-500 font-medium">— {lowProjects.length} project{lowProjects.length > 1 ? 's' : ''} at risk</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowProjects.map(p => (
              <button key={p.id} onClick={() => openDetail(p)}
                className="flex items-center gap-1.5 bg-white border border-red-200 rounded-xl px-3 py-1.5 hover:border-red-400 hover:shadow-sm transition-all">
                <AlertTriangle size={11} className="text-red-500 shrink-0" />
                <span className="text-xs font-semibold text-gray-800">{p.name}</span>
                <span className="text-xs font-bold text-red-600">{p.performance_score}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-100">{error}</div>}
      {loading ? <Skeleton /> : (
        <div className="space-y-2.5">
          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <FolderOpen size={32} className="mx-auto mb-3 text-gray-200" />
              <p className="text-sm font-medium">No projects match your filter</p>
            </div>
          )}
          {filtered.map((p, i) => {
            const sc = STATUS_CFG[p.status] || STATUS_CFG.active
            const pc = PRIORITY_CFG[p.priority] || PRIORITY_CFG.medium
            const isTop = p.performance_tier === 'top'
            const isLow = p.performance_tier === 'low'
            return (
              <div key={p.id}
                onClick={() => openDetail(p)}
                className={`bg-white rounded-2xl border p-4 cursor-pointer hover:shadow-md transition-all duration-150 animate-fade-in-up group relative overflow-hidden
                  ${isTop ? 'border-amber-300 hover:border-amber-400' : isLow ? 'border-red-200 hover:border-red-300' : 'border-gray-100 hover:border-blue-200'}`}
                style={{ animationDelay: `${i * 0.03}s` }}>
                {/* Rank stripe */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl ${isTop ? 'bg-amber-400' : isLow ? 'bg-red-400' : 'bg-transparent'}`} />
                <div className="flex items-start gap-4 pl-1">
                  {/* Rank badge */}
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-black text-xs
                    ${isTop ? 'bg-amber-100 text-amber-700' : isLow ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                    {isTop ? <Trophy size={14} /> : `#${p.rank}`}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${sc.dot}`} />
                      <p className="font-semibold text-gray-900 text-sm group-hover:text-blue-700 transition-colors">{p.name}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded-md font-semibold capitalize ${sc.text} ${sc.bg}`}>{p.status.replace('_', ' ')}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-md font-semibold capitalize ${pc.text} ${pc.bg}`}>{p.priority}</span>
                      {isTop && <span className="text-xs px-1.5 py-0.5 rounded-md font-bold text-amber-700 bg-amber-100 border border-amber-200">⭐ Top #{p.rank}</span>}
                      {isLow && <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md font-bold text-red-700 bg-red-100 border border-red-200"><TrendingDown size={10} />At Risk</span>}
                      {p.is_delayed && <span className="text-xs px-1.5 py-0.5 rounded-md font-semibold text-red-700 bg-red-100">Delayed {p.days_overdue > 0 ? `${p.days_overdue}d` : ''}</span>}
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden max-w-xs">
                        <div className={`h-full rounded-full transition-all duration-700 ${isTop ? 'bg-amber-500' : isLow ? 'bg-red-400' : 'bg-blue-500'}`} style={{ width: `${p.progress}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 font-semibold shrink-0">{p.progress}%</span>
                    </div>
                    {p.tags.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {p.tags.slice(0, 4).map(t => <span key={t} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md font-medium">{t}</span>)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-start gap-4 shrink-0">
                    {/* Performance score */}
                    <div className="text-center min-w-[44px]">
                      <p className={`text-sm font-black leading-tight ${isTop ? 'text-amber-600' : isLow ? 'text-red-600' : 'text-gray-700'}`}>{p.performance_score}</p>
                      <p className="text-xs text-gray-400">Score</p>
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { label: 'Tasks', value: p.total_tasks, color: 'text-gray-800' },
                        { label: 'Done', value: `${p.task_completion_rate}%`, color: p.task_completion_rate >= 70 ? 'text-emerald-600' : 'text-amber-600' },
                        { label: 'Blocked', value: p.blocked_tasks, color: p.blocked_tasks > 0 ? 'text-red-600' : 'text-gray-400' },
                        { label: 'Members', value: p.member_count, color: 'text-indigo-600' },
                      ].map(m => (
                        <div key={m.label} className="text-center min-w-[44px]">
                          <p className={`text-sm font-black leading-tight ${m.color}`}>{m.value}</p>
                          <p className="text-xs text-gray-400">{m.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-500 transition-colors shrink-0 mt-1" />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ProjectDetailView({ project, detail, loading, onBack, range, aiData, aiLoading, onRefreshAI }: {
  project: ProjectRow; detail: ProjectDetail | null; loading: boolean; onBack: () => void; range: number
  aiData: AISuggestions | null; aiLoading: boolean; onRefreshAI: () => void
}) {
  const sc = STATUS_CFG[project.status] || STATUS_CFG.active
  const trendPoints = detail?.report_trend.map(r => r.count) || []
  const trendLabels = detail?.report_trend.map(r => r.date) || []
  const maxWork = Math.max(...(detail?.member_workload.map(m => m.open_tasks) || []), 1)
  const commits = detail?.commits
  const maxContrib = Math.max(...(commits?.contributors?.map(c => c.commits) || []), 1)

  return (
    <div className="space-y-4 animate-fade-in-up">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 font-medium transition-colors">
        <ChevronLeft size={15} /> Back to Projects
      </button>

      {/* Header card */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2.5 h-2.5 rounded-full ${sc.dot}`} />
              <h2 className="text-xl font-bold text-gray-900">{project.name}</h2>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-md font-semibold capitalize ${sc.text} ${sc.bg}`}>{project.status.replace('_', ' ')}</span>
              <span className={`text-xs px-2 py-0.5 rounded-md font-semibold capitalize ${(PRIORITY_CFG[project.priority] || PRIORITY_CFG.medium).text} ${(PRIORITY_CFG[project.priority] || PRIORITY_CFG.medium).bg}`}>{project.priority}</span>
              {project.is_delayed && <span className="text-xs px-2 py-0.5 rounded-md font-semibold text-red-700 bg-red-100">⚠ Delayed</span>}
              {project.due_date && <span className="flex items-center gap-1 text-xs text-gray-500"><Calendar size={11} />{new Date(project.due_date).toLocaleDateString()}</span>}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-2xl font-black text-blue-600">{project.progress}%</p>
              <p className="text-xs text-gray-400">Progress</p>
            </div>
            <div className="w-16 h-16 relative">
              <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                <circle r="14" cx="18" cy="18" fill="transparent" stroke="#f1f5f9" strokeWidth="4" />
                <circle r="14" cx="18" cy="18" fill="transparent" stroke="#3b82f6" strokeWidth="4"
                  strokeDasharray={`${project.progress} ${100 - project.progress}`} strokeDashoffset="-25" />
              </svg>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatPill label="Total Tasks" value={project.total_tasks} />
          <StatPill label="Completed" value={`${project.task_completion_rate}%`} color="text-emerald-600" />
          <StatPill label="Blocked" value={project.blocked_tasks} color={project.blocked_tasks > 0 ? 'text-red-600' : 'text-gray-800'} />
          <StatPill label="Members" value={project.member_count} color="text-indigo-600" />
        </div>
      </div>

      {/* AI Suggestions */}
      <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-2xl p-5 border border-violet-100 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-white rounded-lg flex items-center justify-center shadow-sm">
              <Sparkles size={14} className="text-violet-600" />
            </div>
            <h3 className="text-sm font-semibold text-violet-800">AI Recommendations</h3>
          </div>
          <button onClick={onRefreshAI} disabled={aiLoading}
            className="flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-800 font-medium disabled:opacity-50 transition-colors">
            <RefreshCw size={12} className={aiLoading ? 'animate-spin' : ''} />
            {aiLoading ? 'Generating…' : 'Regenerate'}
          </button>
        </div>
        {aiLoading && !aiData && (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-4 bg-violet-100 rounded-lg animate-pulse" style={{ width: `${70 + i * 8}%` }} />)}
          </div>
        )}
        {aiData && (
          <div className="space-y-2">
            {aiData.suggestions.map((s, i) => (
              <div key={i} className="flex items-start gap-2.5 bg-white rounded-xl px-3 py-2.5 shadow-sm">
                <div className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Lightbulb size={10} className="text-violet-600" />
                </div>
                <p className="text-xs text-gray-700 leading-relaxed">{s}</p>
              </div>
            ))}
          </div>
        )}
        {!aiLoading && !aiData && (
          <p className="text-xs text-violet-500 text-center py-3">Click Regenerate to get AI recommendations for this project.</p>
        )}
      </div>

      {loading && <Skeleton rows={3} />}
      {detail && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Task distribution */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 bg-violet-50 rounded-lg flex items-center justify-center"><CheckSquare size={14} className="text-violet-600" /></div>
              <h3 className="text-sm font-semibold text-gray-700">Task Distribution</h3>
            </div>
            <DonutMini data={Object.fromEntries(Object.entries(detail.task_distribution).map(([k, v]) => [k, v.count]))} />
            {Object.entries(detail.task_distribution).length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-50 space-y-2">
                {Object.entries(detail.task_distribution).map(([status, d]) => (
                  <div key={status} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 capitalize">{status.replace('_', ' ')}</span>
                    <span className="text-gray-500 font-medium">{d.hours}h logged</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Report trend */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center"><FileText size={14} className="text-blue-600" /></div>
              <h3 className="text-sm font-semibold text-gray-700">Team Report Activity ({range}d)</h3>
            </div>
            {trendPoints.length > 0
              ? <ColChart points={trendPoints} labels={trendLabels} color="#3b82f6" height={88} />
              : <p className="text-xs text-gray-400 text-center py-8">No report activity in this period</p>
            }
          </div>

          {/* GitHub Commits */}
          {commits && !commits.error && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-gray-800 rounded-lg flex items-center justify-center"><GitBranch size={13} className="text-white" /></div>
                  <h3 className="text-sm font-semibold text-gray-700">GitHub Commits</h3>
                  {commits.total! > 0 && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold">{commits.total}</span>}
                </div>
              </div>
              {commits.recent && commits.recent.length > 0 ? (
                <div className="space-y-2">
                  {commits.recent.map((c, i) => (
                    <div key={i} className="flex items-start gap-2.5 py-2 border-b border-gray-50 last:border-0">
                      <span className="font-mono text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded shrink-0">{c.sha}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-700 truncate">{c.message}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{c.author} · {c.date ? new Date(c.date).toLocaleDateString() : ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-gray-400 text-center py-6">No recent commits</p>}
            </div>
          )}

          {/* Contributor stats */}
          {commits?.contributors && commits.contributors.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 bg-indigo-50 rounded-lg flex items-center justify-center"><GitCommit size={14} className="text-indigo-600" /></div>
                <h3 className="text-sm font-semibold text-gray-700">Top Contributors</h3>
              </div>
              <div className="space-y-2.5">
                {commits.contributors.map((c, i) => (
                  <div key={i} className="flex items-center gap-3">
                    {c.avatar_url ? (
                      <img src={c.avatar_url} alt={c.author} className="w-6 h-6 rounded-full shrink-0" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold shrink-0">
                        {c.author?.[0]?.toUpperCase()}
                      </div>
                    )}
                    <span className="text-xs text-gray-700 font-medium w-28 truncate shrink-0">{c.author}</span>
                    <HBar value={c.commits} max={maxContrib} color="bg-indigo-400" />
                    <span className="text-xs font-bold text-gray-700 w-14 text-right shrink-0">{c.commits} commits</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Repo error */}
          {commits?.error && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-start gap-2 lg:col-span-2">
              <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-700">Repository unavailable</p>
                <p className="text-xs text-amber-600 mt-0.5">{commits.error}</p>
              </div>
            </div>
          )}

          {/* Member workload */}
          {detail.member_workload.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 bg-teal-50 rounded-lg flex items-center justify-center"><Users size={14} className="text-teal-600" /></div>
                <h3 className="text-sm font-semibold text-gray-700">Member Workload</h3>
              </div>
              <div className="space-y-2.5">
                {detail.member_workload.map(m => (
                  <div key={m.user_id} className="flex items-center gap-3">
                    <div className="w-7 h-7 bg-teal-100 rounded-lg flex items-center justify-center text-teal-700 font-bold text-xs shrink-0">
                      {m.name[0]?.toUpperCase()}
                    </div>
                    <div className="w-32 shrink-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{m.name}</p>
                      <p className="text-xs text-gray-400 truncate">{m.department}</p>
                    </div>
                    <HBar value={m.open_tasks} max={maxWork} color="bg-teal-400" />
                    <span className="text-xs font-bold text-gray-700 w-16 text-right shrink-0">{m.open_tasks} open</span>
                    {m.blocked > 0 && <span className="text-xs text-red-600 font-semibold shrink-0">{m.blocked} blocked</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   EMPLOYEES TAB
═══════════════════════════════════════════════════════════ */

function EmployeesTab({ range }: { range: number }) {
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('all')
  const [selected, setSelected] = useState<EmployeeRow | null>(null)
  const [detail, setDetail] = useState<EmployeeDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    setLoading(true); setError('')
    api.get('/analytics/employees', { params: { days: range } })
      .then(r => setEmployees(r.data.employees || []))
      .catch(e => setError(e?.response?.data?.detail || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [range])

  const openDetail = useCallback(async (emp: EmployeeRow) => {
    setSelected(emp); setDetail(null); setDetailLoading(true)
    try {
      const r = await api.get(`/analytics/employee/${emp.id}`, { params: { days: range } })
      setDetail(r.data)
    } catch { setDetail(null) }
    finally { setDetailLoading(false) }
  }, [range])

  const departments = ['all', ...Array.from(new Set(employees.map(e => e.department).filter(Boolean)))]
  const filtered = employees
    .filter(e => {
      const matchS = e.name.toLowerCase().includes(search.toLowerCase()) || e.email.toLowerCase().includes(search.toLowerCase()) || e.department.toLowerCase().includes(search.toLowerCase())
      const matchD = deptFilter === 'all' || e.department === deptFilter
      return matchS && matchD
    })
    .sort((a, b) => b.performance_mode.score - a.performance_mode.score)

  const topEmployees = filtered.filter(e => e.performance_tier === 'top').slice(0, 5)
  const lowEmployees = filtered.filter(e => e.performance_tier === 'low')

  if (selected) return <EmployeeDetailView employee={selected} detail={detail} loading={detailLoading} onBack={() => { setSelected(null); setDetail(null) }} range={range} />

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 animate-fade-in-up">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email, department…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        </div>
        <div className="flex items-center gap-2">
          <Building2 size={13} className="text-gray-400 shrink-0" />
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            {departments.map(d => <option key={d} value={d}>{d === 'all' ? 'All Departments' : d}</option>)}
          </select>
        </div>
      </div>

      {/* Summary pills */}
      {!loading && employees.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
          {[
            { label: 'Total Employees', value: employees.length, color: 'text-gray-900' },
            { label: 'Submitted Today', value: employees.filter(e => e.submitted_today).length, color: 'text-emerald-600' },
            { label: 'Avg Task Rate', value: `${Math.round(employees.reduce((s, e) => s + e.task_completion_rate, 0) / employees.length)}%`, color: 'text-violet-600' },
            { label: 'Avg Hours/Day', value: (employees.reduce((s, e) => s + e.avg_hours_per_day, 0) / employees.length).toFixed(1), color: 'text-blue-600' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
              <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Top 5 performers banner */}
      {!loading && topEmployees.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-2xl p-4 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-amber-100 rounded-lg flex items-center justify-center">
              <Trophy size={14} className="text-amber-600" />
            </div>
            <h3 className="text-sm font-bold text-amber-800">Top Performers</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {topEmployees.map(emp => (
              <button key={emp.id} onClick={() => openDetail(emp)}
                className="flex items-center gap-2 bg-white border border-amber-200 rounded-xl px-3 py-2 hover:border-amber-400 hover:shadow-sm transition-all">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-black shrink-0">
                  {emp.rank}
                </div>
                <div className="text-left">
                  <p className="text-xs font-semibold text-gray-800 leading-tight">{emp.name}</p>
                  <p className="text-xs text-amber-600 font-bold">{emp.performance_mode.score}/100</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Low performers banner */}
      {!loading && lowEmployees.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-red-100 rounded-lg flex items-center justify-center">
              <TrendingDown size={14} className="text-red-600" />
            </div>
            <h3 className="text-sm font-bold text-red-700">Needs Attention</h3>
            <span className="text-xs text-red-500 font-medium">— {lowEmployees.length} employee{lowEmployees.length > 1 ? 's' : ''} below threshold</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowEmployees.map(emp => (
              <button key={emp.id} onClick={() => openDetail(emp)}
                className="flex items-center gap-2 bg-white border border-red-200 rounded-xl px-3 py-1.5 hover:border-red-400 hover:shadow-sm transition-all">
                <AlertTriangle size={11} className="text-red-500 shrink-0" />
                <span className="text-xs font-semibold text-gray-800">{emp.name}</span>
                <span className="text-xs font-bold text-red-600">{emp.performance_mode.score}/100</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-100">{error}</div>}
      {loading ? <Skeleton /> : (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Users size={32} className="mx-auto mb-3 text-gray-200" />
              <p className="text-sm font-medium">No employees match your filter</p>
            </div>
          )}
          {filtered.map((emp, i) => {
            const isTop = emp.performance_tier === 'top'
            const isLow = emp.performance_tier === 'low'
            return (
              <div key={emp.id}
                onClick={() => openDetail(emp)}
                className={`bg-white rounded-2xl border p-4 cursor-pointer hover:shadow-md transition-all duration-150 animate-fade-in-up group relative overflow-hidden
                  ${isTop ? 'border-amber-300 hover:border-amber-400' : isLow ? 'border-red-200 hover:border-red-300' : 'border-gray-100 hover:border-blue-200'}`}
                style={{ animationDelay: `${i * 0.025}s` }}>
                {/* Tier stripe */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl ${isTop ? 'bg-amber-400' : isLow ? 'bg-red-400' : 'bg-transparent'}`} />
                <div className="flex items-center gap-4 pl-1">
                  {/* Rank + Avatar */}
                  <div className="flex flex-col items-center shrink-0 w-10 gap-0.5">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold
                      ${isTop ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-blue-500 to-indigo-600'}`}>
                      {isTop ? <Trophy size={16} /> : emp.name[0]?.toUpperCase()}
                    </div>
                    <span className={`text-xs font-bold leading-none ${isTop ? 'text-amber-600' : isLow ? 'text-red-500' : 'text-gray-400'}`}>
                      #{emp.rank}
                    </span>
                  </div>
                  {/* Name + dept */}
                  <div className="w-44 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-gray-900 text-sm truncate group-hover:text-blue-700 transition-colors">{emp.name}</p>
                      {isTop && <span className="text-xs font-bold text-amber-600 shrink-0">⭐</span>}
                    </div>
                    <p className="text-xs text-gray-400 truncate">{emp.department || '—'}</p>
                  </div>
                  {/* Role */}
                  <div className="hidden sm:block w-24 shrink-0">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md font-medium capitalize">{emp.role.replace('_', ' ')}</span>
                  </div>
                  {/* Metrics */}
                  <div className="flex-1 grid grid-cols-4 gap-3 hidden md:grid">
                    <div className="text-center">
                      <p className="text-sm font-black text-gray-800">{emp.avg_hours_per_day}h</p>
                      <p className="text-xs text-gray-400">Avg Hrs/Day</p>
                    </div>
                    <div className="text-center">
                      <p className={`text-sm font-black ${emp.task_completion_rate >= 70 ? 'text-emerald-600' : 'text-amber-600'}`}>{emp.task_completion_rate}%</p>
                      <p className="text-xs text-gray-400">Task Rate</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-black text-blue-600">{emp.reports_in_period}</p>
                      <p className="text-xs text-gray-400">Reports</p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Github size={11} className="text-gray-500" />
                        <p className={`text-sm font-black ${emp.github_repos > 0 ? 'text-gray-800' : 'text-gray-300'}`}>{emp.github_repos}</p>
                      </div>
                      <p className="text-xs text-gray-400">GitHub</p>
                    </div>
                  </div>
                  {/* Performance badge */}
                  <div className="flex items-center gap-2 shrink-0">
                    {emp.performance_mode && (() => {
                      const mc = MODE_CFG[emp.performance_mode.color] || MODE_CFG.blue
                      return (
                        <div className="flex flex-col items-end gap-1">
                          <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-xl border ${mc.badge}`}>
                            <Zap size={11} />{emp.performance_mode.label}
                          </span>
                          <span className={`text-xs font-bold ${isTop ? 'text-amber-600' : isLow ? 'text-red-600' : 'text-gray-400'}`}>
                            {emp.performance_mode.score}/100
                          </span>
                        </div>
                      )
                    })()}
                    {isLow && (
                      <span className="hidden lg:flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full font-semibold border border-red-200">
                        <TrendingDown size={10} />At Risk
                      </span>
                    )}
                    {emp.overdue_tasks > 0 && (
                      <span className="hidden lg:flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full font-semibold border border-red-200">
                        <AlertTriangle size={10} />{emp.overdue_tasks}
                      </span>
                    )}
                  </div>
                  <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-500 transition-colors shrink-0" />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── Employee Detail View ───────────────────────────────── */

function EmployeeDetailView({ employee, detail, loading, onBack, range }: {
  employee: EmployeeRow; detail: EmployeeDetail | null; loading: boolean; onBack: () => void; range: number
}) {
  const trendPoints = detail?.report_trend.map(r => r.hours) || []
  const trendLabels = detail?.report_trend.map(r => r.date) || []
  const moodEntries = Object.entries(detail?.mood_distribution || {})
  const totalMoods  = moodEntries.reduce((s, [, v]) => s + v, 0) || 1

  return (
    <div className="space-y-4 animate-fade-in-up">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 font-medium transition-colors">
        <ChevronLeft size={15} /> Back to Employees
      </button>

      {/* Profile hero */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl font-black shrink-0">
            {employee.name[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-900">{employee.name}</h2>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-sm text-gray-500">{employee.email}</span>
              {employee.department && <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-semibold">{employee.department}</span>}
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md font-medium capitalize">{employee.role.replace('_', ' ')}</span>
            </div>
          </div>
          {/* Performance mode badge in hero */}
          {employee.performance_mode && (() => {
            const mc = MODE_CFG[employee.performance_mode.color] || MODE_CFG.blue
            return (
              <div className={`flex flex-col items-center px-4 py-3 rounded-2xl ring-1 ${mc.ring} ${mc.bg} shrink-0`}>
                <Zap size={16} className={mc.text} />
                <p className={`text-base font-black mt-1 ${mc.text}`}>{employee.performance_mode.score}</p>
                <p className="text-xs text-gray-400">/100</p>
                <p className={`text-xs font-bold mt-0.5 ${mc.text}`}>{employee.performance_mode.label}</p>
              </div>
            )
          })()}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatPill label={`Reports (${range}d)`} value={employee.reports_in_period} color="text-blue-600" />
          <StatPill label="Total Tasks" value={employee.total_tasks} />
          <StatPill label="Completed" value={`${employee.task_completion_rate}%`} color="text-emerald-600" />
          <StatPill label={`Hours (${range}d)`} value={`${employee.total_hours}h`} color="text-violet-600" />
          <StatPill label="Avg/Day" value={`${employee.avg_hours_per_day}h`} />
        </div>
      </div>

      {loading && <Skeleton rows={3} />}
      {detail && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Hours trend */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center"><TrendingUp size={14} className="text-blue-600" /></div>
              <h3 className="text-sm font-semibold text-gray-700">Daily Hours ({range}d)</h3>
            </div>
            {trendPoints.length > 0 ? (
              <>
                <ColChart points={trendPoints} labels={trendLabels} color="#6366f1" height={88} />
                <div className="mt-3 pt-3 border-t border-gray-50 grid grid-cols-3 gap-2">
                  <StatPill label="Total" value={`${detail.hours_summary.total}h`} color="text-violet-600" />
                  <StatPill label="Avg/day" value={`${detail.hours_summary.avg}h`} />
                  <StatPill label="Max/day" value={`${detail.hours_summary.max}h`} />
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-400 text-center py-8">No hours data in this period</p>
            )}
          </div>

          {/* Task distribution */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 bg-violet-50 rounded-lg flex items-center justify-center"><CheckSquare size={14} className="text-violet-600" /></div>
              <h3 className="text-sm font-semibold text-gray-700">Task Status Breakdown</h3>
            </div>
            {Object.keys(detail.task_distribution).length > 0
              ? <DonutMini data={detail.task_distribution} />
              : <p className="text-xs text-gray-400 text-center py-8">No tasks assigned</p>
            }
          </div>

          {/* Mood distribution */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 bg-amber-50 rounded-lg flex items-center justify-center"><Smile size={14} className="text-amber-600" /></div>
              <h3 className="text-sm font-semibold text-gray-700">Mood Breakdown ({range}d)</h3>
            </div>
            {moodEntries.length > 0 ? (
              <div className="space-y-2.5">
                {moodEntries.sort(([, a], [, b]) => b - a).map(([mood, count]) => {
                  const cfg = MOOD_CFG[mood]
                  const pct = Math.round((count / totalMoods) * 100)
                  return (
                    <div key={mood} className="flex items-center gap-3">
                      <span className={`flex items-center gap-1 text-xs font-medium w-20 shrink-0 ${cfg?.color || 'text-gray-600'}`}>
                        {cfg?.icon}{cfg?.label || mood}
                      </span>
                      <HBar value={count} max={totalMoods} color="bg-blue-400" />
                      <span className="text-xs font-bold text-gray-700 w-12 text-right shrink-0">{count} ({pct}%)</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-8">No mood data available</p>
            )}
          </div>

          {/* Performance Mode Breakdown */}
          {detail.performance_mode && (() => {
            const pm = detail.performance_mode
            const mc = MODE_CFG[pm.color] || MODE_CFG.blue
            const bars = [
              { label: 'Work Hours',   value: pm.breakdown.hours,      max: 25 },
              { label: 'Task Rate',    value: pm.breakdown.tasks,       max: 20 },
              { label: 'Compliance',   value: pm.breakdown.compliance,  max: 15 },
              { label: 'Commits',      value: pm.breakdown.commits,     max: 20 },
              { label: 'Docs/Sheets',  value: pm.breakdown.docs ?? 0,   max: 20 },
            ]
            return (
              <div className={`bg-white rounded-2xl p-5 shadow-sm border ring-1 ${mc.ring}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${mc.bg}`}>
                      <Zap size={14} className={mc.text} />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-700">Performance Mode</h3>
                  </div>
                  <div className="text-right">
                    <span className={`text-xl font-black ${mc.text}`}>{pm.score}</span>
                    <span className="text-xs text-gray-400">/100</span>
                    <p className={`text-xs font-bold ${mc.text}`}>{pm.label}</p>
                  </div>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full mb-4 overflow-hidden">
                  <div className={`h-full rounded-full ${mc.bar}`} style={{ width: `${pm.score}%` }} />
                </div>
                <div className="space-y-2">
                  {bars.map(b => (
                    <div key={b.label} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-24 shrink-0">{b.label}</span>
                      <HBar value={b.value} max={b.max} color={mc.bar} />
                      <span className="text-xs font-bold text-gray-700 w-10 text-right shrink-0">{b.value}/{b.max}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* GitHub Commits */}
          {detail.github_commits && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center"><Github size={14} className="text-gray-700" /></div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700">GitHub Commits</h3>
                    <p className="text-[10px] text-gray-400">per project repository</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-gray-800">{detail.github_commits.total_commits}</p>
                  <p className="text-xs text-gray-400">{detail.github_commits.commits_per_day}/day avg</p>
                </div>
              </div>
              {detail.github_commits.repos.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">Not a member of any project with a repository</p>
              ) : (
                <div className="space-y-3">
                  {detail.github_commits.repos.map((repo, ri) => (
                    <div key={ri} className="rounded-xl border border-gray-100 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Github size={13} className="text-gray-500 shrink-0" />
                          <div className="min-w-0">
                            <span className="text-xs font-semibold text-gray-800 truncate block">{repo.repo_name}</span>
                            {(repo as any).project_name && (repo as any).project_name !== repo.repo_name && (
                              <span className="text-[10px] text-gray-400 truncate block">{(repo as any).project_name}</span>
                            )}
                          </div>
                        </div>
                        {repo.error
                          ? <span className="text-xs text-red-400 shrink-0">Private / Error</span>
                          : <span className="text-xs font-bold text-gray-700 shrink-0">{repo.total_commits} commits</span>
                        }
                      </div>
                      {!repo.error && repo.recent.length > 0 && (
                        <div className="space-y-1">
                          {repo.recent.map(c => (
                            <div key={c.sha} className="flex items-start gap-2">
                              <span className="text-xs font-mono text-gray-400 shrink-0 mt-0.5">{c.sha}</span>
                              <span className="text-xs text-gray-600 truncate flex-1">{c.message}</span>
                              <span className="text-xs text-gray-400 shrink-0">{new Date(c.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tracking Docs (PM) */}
          {detail.tracking_docs && detail.tracking_docs.docs.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-emerald-50 rounded-lg flex items-center justify-center"><FileText size={14} className="text-emerald-600" /></div>
                  <h3 className="text-sm font-semibold text-gray-700">Docs & Sheets Activity</h3>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-gray-800">{detail.tracking_docs.total_edits}</p>
                  <p className="text-xs text-gray-400">{detail.tracking_docs.edits_per_day}/day avg</p>
                </div>
              </div>
              <div className="space-y-3">
                {detail.tracking_docs.docs.map((doc, di) => {
                  const typeColor: Record<string, string> = {
                    sheets: 'bg-emerald-100 text-emerald-700',
                    docs:   'bg-blue-100 text-blue-700',
                    slides: 'bg-amber-100 text-amber-700',
                    other:  'bg-gray-100 text-gray-600',
                  }
                  return (
                    <div key={di} className="rounded-xl border border-gray-100 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md capitalize ${typeColor[doc.doc_type] || typeColor.other}`}>{doc.doc_type}</span>
                          <span className="text-xs font-semibold text-gray-800 truncate">{doc.title}</span>
                        </div>
                        {doc.error
                          ? <span className="text-xs text-red-400 shrink-0">{doc.error}</span>
                          : <span className="text-xs font-bold text-gray-700 shrink-0">{doc.version ?? '—'} edits</span>
                        }
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span className="text-gray-500 font-medium">{doc.project}</span>
                        {doc.last_modifier && <span>· {doc.last_modifier}</span>}
                        {doc.modified_time && <span>· {new Date(doc.modified_time).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Projects involved in */}
          {detail.projects_involved.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 bg-teal-50 rounded-lg flex items-center justify-center"><FolderOpen size={14} className="text-teal-600" /></div>
                <h3 className="text-sm font-semibold text-gray-700">Projects ({detail.projects_involved.length})</h3>
              </div>
              <div className="space-y-2.5">
                {detail.projects_involved.map(p => {
                  const sc = STATUS_CFG[p.status] || STATUS_CFG.active
                  const rate = p.tasks_assigned ? Math.round((p.tasks_done / p.tasks_assigned) * 100) : 0
                  return (
                    <div key={p.id} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sc.dot}`} />
                          <p className="text-xs font-semibold text-gray-800 truncate">{p.name}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <HBar value={p.progress} max={100} color="bg-blue-400" />
                          <span className="text-xs text-gray-500 shrink-0">{p.progress}%</span>
                        </div>
                      </div>
                      <div className="text-center shrink-0">
                        <p className={`text-sm font-black ${rate >= 70 ? 'text-emerald-600' : 'text-amber-600'}`}>{rate}%</p>
                        <p className="text-xs text-gray-400">{p.tasks_done}/{p.tasks_assigned} tasks</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Report timeline */}
          {detail.report_trend.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center"><Activity size={14} className="text-blue-600" /></div>
                <h3 className="text-sm font-semibold text-gray-700">Report Log</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-100">
                      <th className="text-left pb-2 font-medium">Date</th>
                      <th className="text-right pb-2 font-medium">Hours</th>
                      <th className="text-center pb-2 font-medium">Mood</th>
                      <th className="text-right pb-2 font-medium">Blockers</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {[...detail.report_trend].reverse().slice(0, 14).map(r => {
                      const mc = MOOD_CFG[r.mood]
                      return (
                        <tr key={r.date} className="hover:bg-gray-50 transition-colors">
                          <td className="py-2 text-gray-700 font-medium">{r.date}</td>
                          <td className="py-2 text-right font-bold text-blue-600">{r.hours}h</td>
                          <td className="py-2 text-center">
                            {mc ? <span className={`flex items-center justify-center gap-1 ${mc.color}`}>{mc.icon}{mc.label}</span> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="py-2 text-right">
                            {r.blockers > 0 ? <span className="text-red-600 font-semibold">{r.blockers}</span> : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
