import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  ClipboardList, Plus, Check, X, Smile, Frown, Meh, ThumbsUp, ThumbsDown,
  Briefcase, Zap, LayoutGrid, List, AlertTriangle, Loader, Clock,
  Users, TrendingUp, Target, CheckCircle2, Activity, Calendar,
  ChevronRight, ArrowRight, Flame, ChevronDown, ListChecks, Loader2,
} from 'lucide-react'
import { RootState } from '../../store'
import { fetchDashboardRequest } from '../../store/slices/dashboardSlice'
import { fetchTasksRequest, updateTaskLocal } from '../../store/slices/tasksSlice'
import { submitReportRequest, resetSubmitStatus } from '../../store/slices/reportsSlice'
import { fetchProjectsRequest } from '../../store/slices/projectsSlice'
import { fetchTeamsRequest } from '../../store/slices/teamsSlice'
import { Modal } from '../common/Modal'
import { Pagination } from '../common/Pagination'
import { api } from '../../utils/api'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TEAM_GRADIENTS = [
  'from-blue-400 to-indigo-500',
  'from-teal-400 to-emerald-500',
  'from-violet-400 to-purple-500',
  'from-rose-400 to-pink-500',
  'from-amber-400 to-orange-500',
  'from-cyan-400 to-sky-500',
]
function teamGradient(name: string) {
  const sum = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return TEAM_GRADIENTS[sum % TEAM_GRADIENTS.length]
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function isToday(dateStr: string | undefined) {
  if (!dateStr) return false
  return new Date(dateStr).toDateString() === new Date().toDateString()
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MOODS = [
  { icon: <ThumbsUp size={15} />,   value: 'great',    label: 'Great',    active: 'bg-emerald-500 text-white border-emerald-500', inactive: 'border-gray-200 text-gray-500 hover:border-emerald-300' },
  { icon: <Smile size={15} />,      value: 'good',     label: 'Good',     active: 'bg-blue-500 text-white border-blue-500',        inactive: 'border-gray-200 text-gray-500 hover:border-blue-300' },
  { icon: <Meh size={15} />,        value: 'neutral',  label: 'Neutral',  active: 'bg-amber-500 text-white border-amber-500',      inactive: 'border-gray-200 text-gray-500 hover:border-amber-300' },
  { icon: <Frown size={15} />,      value: 'stressed', label: 'Stressed', active: 'bg-orange-500 text-white border-orange-500',    inactive: 'border-gray-200 text-gray-500 hover:border-orange-300' },
  { icon: <ThumbsDown size={15} />, value: 'blocked',  label: 'Blocked',  active: 'bg-red-500 text-white border-red-500',          inactive: 'border-gray-200 text-gray-500 hover:border-red-300' },
]

const STATUS_COLS = ['todo', 'in_progress', 'review', 'blocked', 'done']
const STATUS_LABELS: Record<string, string> = {
  todo: 'To Do', in_progress: 'In Progress', review: 'In Review', blocked: 'Blocked', done: 'Done',
}
const STATUS_COLORS: Record<string, string> = {
  todo:        'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  review:      'bg-purple-100 text-purple-700',
  blocked:     'bg-red-100 text-red-700',
  done:        'bg-emerald-100 text-emerald-700',
}
const STATUS_BAR: Record<string, string> = {
  todo:        'bg-gray-300',
  in_progress: 'bg-blue-500',
  review:      'bg-purple-500',
  blocked:     'bg-red-500',
  done:        'bg-emerald-500',
}
const STATUS_DOT: Record<string, string> = {
  todo:        'bg-gray-400',
  in_progress: 'bg-blue-500',
  review:      'bg-purple-500',
  blocked:     'bg-red-500',
  done:        'bg-emerald-500',
}
const COLUMN_HEADER: Record<string, { bg: string; border: string }> = {
  todo:        { bg: 'bg-gray-50',    border: 'border-gray-200'   },
  in_progress: { bg: 'bg-blue-50',   border: 'border-blue-200'   },
  review:      { bg: 'bg-purple-50', border: 'border-purple-200' },
  blocked:     { bg: 'bg-red-50',    border: 'border-red-200'    },
  done:        { bg: 'bg-emerald-50',border: 'border-emerald-200'},
}
const PRIORITY_BORDER: Record<string, string> = {
  critical: 'border-l-red-500',
  high:     'border-l-orange-400',
  medium:   'border-l-amber-400',
  low:      'border-l-gray-300',
}
const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-50 text-red-600',
  high:     'bg-orange-50 text-orange-600',
  medium:   'bg-amber-50 text-amber-600',
  low:      'bg-gray-100 text-gray-500',
}
const PRIORITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  high:     'bg-orange-400',
  medium:   'bg-amber-400',
  low:      'bg-gray-300',
}

// ─── Performance Ring ─────────────────────────────────────────────────────────

const PerformanceRing: React.FC<{ score: number; color: string }> = ({ score, color }) => {
  const r = 26; const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const ringColor = color === 'green' ? '#10b981' : color === 'amber' ? '#f59e0b' : color === 'red' ? '#ef4444' : '#3b82f6'
  return (
    <div className="relative w-[68px] h-[68px] flex items-center justify-center shrink-0">
      <svg width="68" height="68" className="-rotate-90">
        <circle cx="34" cy="34" r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="5" />
        <circle cx="34" cy="34" r={r} fill="none" stroke={ringColor} strokeWidth="5"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(.4,0,.2,1)', filter: `drop-shadow(0 0 4px ${ringColor}80)` }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-white text-base font-bold leading-none">{score}</span>
        <span className="text-white/60 text-[9px] font-medium">score</span>
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export const EmployeeDashboard: React.FC = () => {
  const dispatch = useDispatch()
  const { data } = useSelector((s: RootState) => s.dashboard)
  const { submitSuccess, isLoading: reportLoading } = useSelector((s: RootState) => s.reports)
  const { items: taskItems, total: taskTotal, isLoading: tasksLoading } = useSelector((s: RootState) => s.tasks)
  const { items: teams, isLoading: teamsLoading } = useSelector((s: RootState) => s.teams)
  const { user } = useSelector((s: RootState) => s.auth)
  const { items: projects } = useSelector((s: RootState) => s.projects)

  const [activeTab, setActiveTab] = useState<'work'>('work')
  const [evalMode, setEvalMode] = useState<{ label: string; color: string; score: number } | null>(null)

  // Report form state
  const [showReportForm, setShowReportForm] = useState(false)
  const [report, setReport] = useState({
    project_id: '',
    report_date: new Date().toISOString().split('T')[0],
    tasks_completed: [{ description: '', hours_spent: 1, status: 'completed' }],
    tasks_planned: [''],
    blockers: [''],
    hours_worked: 8,
    unstructured_notes: '',
    mood: 'good',
  })

  // Task board state
  const [taskView, setTaskView] = useState<'kanban' | 'list'>('kanban')
  const [taskFilterPriority, setTaskFilterPriority] = useState('')
  const [taskPage, setTaskPage] = useState(1)
  const [taskLimit, setTaskLimit] = useState(20)

  // Task detail modal state
  const [detailTask, setDetailTask] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [editForm, setEditForm] = useState<any>(null)
  const [statusUpdating, setStatusUpdating] = useState(false)

  // Phase widget state
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null)
  const [projectPhaseCache, setProjectPhaseCache] = useState<Record<string, any>>({})
  const [phaseLoadingId, setPhaseLoadingId] = useState<string | null>(null)
  const [stageToggling, setStageToggling] = useState<string | null>(null)
  const [phaseError, setPhaseError] = useState('')

  const role = user?.primary_role || 'employee'
  const roleLabel = role === 'pm' ? 'Project Manager' : role === 'team_lead' ? 'Team Lead' : 'Employee'
  const reportSubmitted = data?.report_submitted_today

  // ── Fetch ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    dispatch(fetchDashboardRequest('employee'))
    dispatch(fetchProjectsRequest({}))
    dispatch(fetchTeamsRequest({ page: 1, limit: 50 }))
    api.get('/personal/performance').then(res => {
      const ev = res.data?.evaluation
      if (ev) setEvalMode({ label: ev.label, color: ev.color, score: ev.score })
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (activeTab !== 'work') return
    const params: any = { page: taskPage, limit: taskLimit }
    if (taskFilterPriority) params.priority = taskFilterPriority
    dispatch(fetchTasksRequest(params))
  }, [activeTab, taskPage, taskLimit, taskFilterPriority])

  useEffect(() => {
    if (submitSuccess) {
      setShowReportForm(false)
      dispatch(resetSubmitStatus())
      dispatch(fetchDashboardRequest('employee'))
    }
  }, [submitSuccess])

  // ── Task detail ───────────────────────────────────────────────────────────

  const openTaskDetail = async (task: any) => {
    setDetailTask(task)
    setDetailLoading(true)
    setEditForm(null)
    try {
      const res = await api.get(`/tasks/${task.id}`)
      const full = res.data
      setDetailTask(full)
      setEditForm({ status: full.status, priority: full.priority })
    } catch {
      setEditForm({ status: task.status, priority: task.priority })
    } finally {
      setDetailLoading(false)
    }
  }

  const handleStatusUpdate = async (newStatus: string) => {
    if (!detailTask) return
    setStatusUpdating(true)
    try {
      await api.patch(`/tasks/${detailTask.id}/status`, { status: newStatus })
      dispatch(updateTaskLocal({ id: detailTask.id, updates: { status: newStatus } }))
      setDetailTask((prev: any) => prev ? { ...prev, status: newStatus } : prev)
      setEditForm((prev: any) => prev ? { ...prev, status: newStatus } : prev)
    } catch {}
    setStatusUpdating(false)
  }

  // ── Phase widget helpers ──────────────────────────────────────────────────

  const loadProjectPhases = async (projectId: string) => {
    if (projectPhaseCache[projectId]) {
      setExpandedProjectId(prev => prev === projectId ? null : projectId)
      return
    }
    setExpandedProjectId(projectId)
    setPhaseLoadingId(projectId)
    setPhaseError('')
    try {
      const res = await api.get(`/projects/${projectId}`)
      setProjectPhaseCache(prev => ({ ...prev, [projectId]: res.data }))
    } catch {
      setPhaseError('Failed to load phases')
      setExpandedProjectId(null)
    } finally {
      setPhaseLoadingId(null)
    }
  }

  const togglePhaseStage = async (projectId: string, phase: string, stageId: string, current: boolean) => {
    if (stageToggling) return
    setStageToggling(stageId)
    setPhaseError('')
    try {
      await api.patch(`/projects/${projectId}/stages`, { phase, stage_id: stageId, completed: !current })
      // Refresh cached project data
      const res = await api.get(`/projects/${projectId}`)
      setProjectPhaseCache(prev => ({ ...prev, [projectId]: res.data }))
    } catch (e: any) {
      setPhaseError(e?.response?.data?.detail || 'Failed to update stage')
    } finally {
      setStageToggling(null)
    }
  }

  // ── Report submit ─────────────────────────────────────────────────────────

  const handleSubmitReport = () => {
    dispatch(submitReportRequest({
      ...report,
      tasks_completed: report.tasks_completed.filter(t => t.description),
      tasks_planned:   report.tasks_planned.filter(Boolean),
      blockers:        report.blockers.filter(Boolean),
    }))
  }

  // ── Derived stats ─────────────────────────────────────────────────────────

  const tasksByStatus = useMemo(() =>
    STATUS_COLS.reduce((acc, s) => {
      acc[s] = taskItems.filter((t: any) => t.status === s)
      return acc
    }, {} as Record<string, typeof taskItems>),
    [taskItems]
  )

  const countDone       = tasksByStatus['done']?.length ?? 0
  const countInProgress = tasksByStatus['in_progress']?.length ?? 0
  const countBlocked    = tasksByStatus['blocked']?.length ?? 0
  const countDueToday   = taskItems.filter((t: any) => isToday(t.due_date) && t.status !== 'done').length
  const completionPct   = taskTotal > 0 ? Math.round((countDone / Math.max(taskItems.length, 1)) * 100) : 0

  const statCards = [
    {
      label: 'Total Assigned',
      value: taskTotal,
      icon: <ClipboardList size={16} className="text-blue-600" />,
      iconBg: 'bg-blue-50',
      bar: 100,
      barColor: 'bg-blue-500',
      accent: 'text-blue-600',
    },
    {
      label: 'In Progress',
      value: countInProgress,
      icon: <Activity size={16} className="text-violet-600" />,
      iconBg: 'bg-violet-50',
      bar: taskItems.length ? Math.round((countInProgress / taskItems.length) * 100) : 0,
      barColor: 'bg-violet-500',
      accent: 'text-violet-600',
    },
    {
      label: 'Due Today',
      value: countDueToday,
      icon: <Calendar size={16} className={countDueToday > 0 ? 'text-amber-600' : 'text-gray-400'} />,
      iconBg: countDueToday > 0 ? 'bg-amber-50' : 'bg-gray-50',
      bar: taskItems.length ? Math.round((countDueToday / taskItems.length) * 100) : 0,
      barColor: countDueToday > 0 ? 'bg-amber-500' : 'bg-gray-300',
      accent: countDueToday > 0 ? 'text-amber-600' : 'text-gray-400',
    },
    {
      label: 'Completed',
      value: countDone,
      icon: <CheckCircle2 size={16} className="text-emerald-600" />,
      iconBg: 'bg-emerald-50',
      bar: completionPct,
      barColor: 'bg-emerald-500',
      accent: 'text-emerald-600',
    },
  ]

  const evalBadge: Record<string, string> = {
    green: 'text-emerald-300',
    blue:  'text-blue-300',
    amber: 'text-amber-300',
    red:   'text-red-300',
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 animate-fade-in-up">

      {/* ── HERO BANNER ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 shadow-xl shadow-blue-200/40">
        {/* Decorative orbs */}
        <div className="pointer-events-none absolute -top-12 -right-12 w-56 h-56 bg-white/5 rounded-full" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 w-48 h-48 bg-white/5 rounded-full" />
        <div className="pointer-events-none absolute top-1/2 right-1/3 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl" />

        <div className="relative px-7 py-6 flex items-center justify-between gap-4">
          {/* Left: avatar + greeting */}
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-white/15 border border-white/20 backdrop-blur-sm flex items-center justify-center text-white text-2xl font-bold shrink-0 shadow-lg">
              {user?.full_name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="min-w-0">
              <p className="text-blue-200 text-sm font-medium">
                {getGreeting()} · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </p>
              <h1 className="text-white text-2xl font-bold mt-0.5 leading-tight truncate">
                {user?.full_name}
              </h1>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-xs bg-white/15 text-white px-2.5 py-1 rounded-lg font-semibold border border-white/10">
                  {roleLabel}
                </span>
                {evalMode && (
                  <span className={`text-xs font-medium ${evalBadge[evalMode.color] || 'text-blue-200'}`}>
                    {evalMode.label}
                  </span>
                )}
                {reportSubmitted && (
                  <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-1 rounded-lg font-medium flex items-center gap-1">
                    <Check size={10} /> Report done
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: performance ring + CTA */}
          <div className="flex items-center gap-4 shrink-0">
            {evalMode && <PerformanceRing score={evalMode.score} color={evalMode.color} />}

            {!reportSubmitted ? (
              <button
                onClick={() => setShowReportForm(true)}
                className="flex items-center gap-2 bg-white text-blue-700 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200"
              >
                <ClipboardList size={15} />
                Daily Report
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-white/10 text-white/80 border border-white/20 px-4 py-2.5 rounded-xl text-sm font-medium">
                <CheckCircle2 size={15} className="text-emerald-400" />
                Submitted
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── STAT CARDS ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s, i) => (
          <div
            key={s.label}
            className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200 animate-fade-in-up"
            style={{ animationDelay: `${i * 0.07}s` }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`w-9 h-9 rounded-xl ${s.iconBg} flex items-center justify-center`}>
                {s.icon}
              </div>
              <span className={`text-2xl font-bold ${s.accent}`}>{s.value}</span>
            </div>
            <p className="text-xs font-medium text-gray-500">{s.label}</p>
            <div className="mt-2.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${s.barColor} transition-all duration-700`}
                style={{ width: `${Math.min(s.bar, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* ── Performance badge ───────────────────────────────────────────────── */}
      {evalMode && (
        <div className={`self-start flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border ${
          evalMode.color === 'green' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
          evalMode.color === 'amber' ? 'bg-amber-50 text-amber-700 border-amber-200' :
          evalMode.color === 'red'   ? 'bg-red-50 text-red-600 border-red-200' :
          'bg-blue-50 text-blue-700 border-blue-200'
        }`}>
          <Zap size={12} />
          {evalMode.label} · {evalMode.score}/100
        </div>
      )}

      {/* ── WORK CONTENT ────────────────────────────────────────────────────── */}
      {activeTab === 'work' && (
        <div className="flex gap-5 items-start animate-fade-in-up">

          {/* ── Main column (task board) ──────────────────────────────────── */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Urgent alert banner */}
            {countBlocked > 0 && (
              <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3 animate-fade-in">
                <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
                  <AlertTriangle size={15} className="text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-red-800">
                    {countBlocked} blocked {countBlocked === 1 ? 'task' : 'tasks'} need attention
                  </p>
                  <p className="text-xs text-red-500 mt-0.5">Review and resolve blockers to keep projects on track</p>
                </div>
              </div>
            )}

            {countDueToday > 0 && countBlocked === 0 && (
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 animate-fade-in">
                <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
                  <Flame size={15} className="text-amber-600" />
                </div>
                <p className="text-sm font-semibold text-amber-800">
                  {countDueToday} {countDueToday === 1 ? 'task is' : 'tasks are'} due today
                </p>
              </div>
            )}

            {/* Task board card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

              {/* Board header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <ClipboardList size={16} className="text-blue-500" />
                  <h3 className="font-semibold text-gray-800 text-sm">My Tasks</h3>
                  <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg">{taskTotal}</span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Priority filter */}
                  <select
                    value={taskFilterPriority}
                    onChange={e => { setTaskFilterPriority(e.target.value); setTaskPage(1) }}
                    className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-600 font-medium"
                  >
                    <option value="">All Priorities</option>
                    {['critical', 'high', 'medium', 'low'].map(p => (
                      <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                    ))}
                  </select>
                  {/* View toggle */}
                  <div className="flex bg-gray-100 rounded-xl p-0.5">
                    {(['kanban', 'list'] as const).map(v => (
                      <button
                        key={v}
                        onClick={() => setTaskView(v)}
                        title={v === 'kanban' ? 'Board view' : 'List view'}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          taskView === v ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {v === 'kanban' ? <LayoutGrid size={13} /> : <List size={13} />}
                        {v === 'kanban' ? 'Board' : 'List'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Board content */}
              <div className="p-4">
                {/* Loading skeleton */}
                {tasksLoading && taskItems.length === 0 ? (
                  taskView === 'kanban' ? (
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="flex-shrink-0 w-52 space-y-2">
                          <div className="h-8 skeleton rounded-xl" />
                          <div className="h-24 skeleton rounded-xl" />
                          <div className="h-16 skeleton rounded-xl" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {[...Array(5)].map((_, i) => <div key={i} className="h-12 skeleton rounded-xl" />)}
                    </div>
                  )
                ) : taskView === 'kanban' ? (
                  /* ── Kanban ── */
                  <div className="flex gap-3 overflow-x-auto pb-2" style={{ minHeight: 200 }}>
                    {STATUS_COLS.map((status, ci) => {
                      const col = tasksByStatus[status] || []
                      const ch = COLUMN_HEADER[status]
                      return (
                        <div key={status} className="flex-shrink-0 w-52 flex flex-col gap-2">
                          {/* Column header */}
                          <div className={`rounded-xl border ${ch.bg} ${ch.border} px-3 py-2 flex items-center justify-between`}>
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`} />
                              <span className="text-xs font-semibold text-gray-700">{STATUS_LABELS[status]}</span>
                            </div>
                            <span className="text-xs bg-white/70 text-gray-500 font-semibold px-1.5 py-0.5 rounded-md">{col.length}</span>
                          </div>

                          {/* Cards */}
                          <div className="space-y-2 flex-1">
                            {col.length === 0 ? (
                              <div className="border-2 border-dashed border-gray-100 rounded-xl py-6 flex items-center justify-center">
                                <p className="text-xs text-gray-300 font-medium">Empty</p>
                              </div>
                            ) : col.map((task: any, i: number) => (
                              <div
                                key={task.id}
                                onClick={() => openTaskDetail(task)}
                                className={`bg-white rounded-xl border-l-[3px] border border-gray-100 ${PRIORITY_BORDER[task.priority] || 'border-l-gray-200'} p-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 cursor-pointer transition-all duration-150 group animate-fade-in-up`}
                                style={{ animationDelay: `${ci * 0.04 + i * 0.02}s` }}
                              >
                                <p className="text-xs font-semibold text-gray-800 line-clamp-2 leading-snug group-hover:text-blue-700 transition-colors">
                                  {task.title}
                                </p>
                                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold flex items-center gap-0.5 ${PRIORITY_COLORS[task.priority] || 'bg-gray-100 text-gray-500'}`}>
                                    <span className={`w-1 h-1 rounded-full ${PRIORITY_DOT[task.priority] || 'bg-gray-400'}`} />
                                    {task.priority}
                                  </span>
                                  {task.due_date && (
                                    <span className={`text-[10px] flex items-center gap-0.5 font-medium ${isToday(task.due_date) ? 'text-amber-600' : 'text-gray-400'}`}>
                                      <Clock size={8} />
                                      {isToday(task.due_date) ? 'Today' : new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  /* ── List ── */
                  <div className="overflow-hidden rounded-xl border border-gray-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          {['Task', 'Status', 'Priority', 'Due', 'Hours'].map(h => (
                            <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {taskItems.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center py-14">
                              <div className="flex flex-col items-center gap-2">
                                <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                                  <ClipboardList size={18} className="text-gray-300" />
                                </div>
                                <p className="text-sm text-gray-400 font-medium">No tasks assigned</p>
                              </div>
                            </td>
                          </tr>
                        ) : taskItems.map((task: any, i: number) => (
                          <tr
                            key={task.id}
                            onClick={() => openTaskDetail(task)}
                            className="hover:bg-blue-50/40 cursor-pointer transition-colors group animate-fade-in"
                            style={{ animationDelay: `${i * 0.02}s` }}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[task.priority] || 'bg-gray-300'}`} />
                                <p className="font-semibold text-gray-800 text-sm group-hover:text-blue-700 transition-colors truncate max-w-xs">{task.title}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-1 rounded-lg font-semibold ${STATUS_COLORS[task.status] || 'bg-gray-100'}`}>
                                {STATUS_LABELS[task.status] || task.status}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-1 rounded-lg font-semibold ${PRIORITY_COLORS[task.priority] || 'bg-gray-100'}`}>
                                {task.priority}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs font-medium text-gray-500">
                              {task.due_date
                                ? <span className={isToday(task.due_date) ? 'text-amber-600 font-semibold' : ''}>
                                    {isToday(task.due_date) ? 'Today' : new Date(task.due_date).toLocaleDateString()}
                                  </span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400">{task.logged_hours}/{task.estimated_hours}h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Pagination */}
              <div className="px-4 pb-4">
                <Pagination
                  page={taskPage}
                  totalPages={Math.ceil(taskTotal / taskLimit)}
                  total={taskTotal}
                  limit={taskLimit}
                  onPageChange={setTaskPage}
                  onLimitChange={l => { setTaskLimit(l); setTaskPage(1) }}
                  limitOptions={[10, 20, 50]}
                />
              </div>
            </div>
          </div>

          {/* ── Right sidebar ────────────────────────────────────────────── */}
          <div className="w-72 shrink-0 space-y-4 sticky top-6 max-h-[calc(100vh-7rem)] overflow-y-auto scrollbar-hide">

            {/* Task Overview widget */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center">
                    <TrendingUp size={13} className="text-blue-600" />
                  </div>
                  <h4 className="text-sm font-semibold text-gray-800">Task Overview</h4>
                </div>
                <span className="text-xs text-gray-400">{taskItems.length} loaded</span>
              </div>

              <div className="space-y-3">
                {STATUS_COLS.map(status => {
                  const count = tasksByStatus[status]?.length ?? 0
                  const pct = taskItems.length > 0 ? Math.round((count / taskItems.length) * 100) : 0
                  return (
                    <div key={status}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`} />
                          <span className="text-xs font-medium text-gray-600">{STATUS_LABELS[status]}</span>
                        </div>
                        <span className="text-xs font-bold text-gray-800">{count}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${STATUS_BAR[status]} transition-all duration-700`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Completion summary */}
              {taskItems.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-gray-500 font-medium">Completion rate</span>
                  <span className="text-sm font-bold text-emerald-600">{completionPct}%</span>
                </div>
              )}
            </div>

            {/* My Teams widget */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-violet-50 rounded-lg flex items-center justify-center">
                    <Users size={13} className="text-violet-600" />
                  </div>
                  <h4 className="text-sm font-semibold text-gray-800">My Teams</h4>
                </div>
                {teams.length > 0 && (
                  <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg">{teams.length}</span>
                )}
              </div>

              {teamsLoading && teams.length === 0 ? (
                <div className="space-y-2">
                  {[1, 2].map(i => <div key={i} className="h-12 skeleton rounded-xl" />)}
                </div>
              ) : teams.length === 0 ? (
                <div className="py-6 flex flex-col items-center gap-2 text-center">
                  <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                    <Users size={18} className="text-gray-300" />
                  </div>
                  <p className="text-xs text-gray-400 font-medium">Not part of any team yet</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-hide">
                  {teams.map((team: any, i: number) => (
                    <div
                      key={team.id}
                      className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors cursor-default animate-fade-in"
                      style={{ animationDelay: `${i * 0.05}s` }}
                    >
                      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${teamGradient(team.name)} flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm`}>
                        {team.name?.[0]?.toUpperCase() || 'T'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-800 truncate">{team.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {team.department && (
                            <span className="text-[10px] text-violet-600 font-semibold truncate">{team.department}</span>
                          )}
                          <span className="text-[10px] text-gray-400 flex items-center gap-0.5 shrink-0">
                            <Users size={8} />
                            {team.member_count ?? team.member_ids?.length ?? 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* My Project Phases widget */}
            {projects.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 bg-indigo-50 rounded-lg flex items-center justify-center">
                    <ListChecks size={13} className="text-indigo-600" />
                  </div>
                  <h4 className="text-sm font-semibold text-gray-800">My Project Phases</h4>
                </div>

                {phaseError && (
                  <p className="text-xs text-red-500 mb-2 flex items-center gap-1">
                    <AlertTriangle size={11} /> {phaseError}
                  </p>
                )}

                <div className="space-y-1.5">
                  {projects.map((proj: any) => {
                    const isOpen = expandedProjectId === proj.id
                    const cached = projectPhaseCache[proj.id]
                    const currentPhase = proj.status || 'planning'
                    const stages: any[] = cached?.phase_stages?.[currentPhase] || []
                    const doneCnt = stages.filter((s: any) => s.completed).length
                    const isLoading = phaseLoadingId === proj.id

                    return (
                      <div key={proj.id} className="rounded-xl border border-gray-100 overflow-hidden">
                        {/* Project row */}
                        <button
                          onClick={() => loadProjectPhases(proj.id)}
                          className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
                        >
                          <span className="flex-1 text-xs font-semibold text-gray-700 truncate">{proj.name}</span>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md capitalize shrink-0 ${
                            currentPhase === 'active'    ? 'bg-emerald-50 text-emerald-600' :
                            currentPhase === 'planning'  ? 'bg-blue-50 text-blue-600' :
                            currentPhase === 'completed' ? 'bg-gray-100 text-gray-500' :
                            'bg-amber-50 text-amber-600'
                          }`}>
                            {currentPhase.replace('_', ' ')}
                          </span>
                          {isLoading
                            ? <Loader2 size={12} className="text-gray-400 animate-spin shrink-0" />
                            : <ChevronDown size={12} className={`text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                          }
                        </button>

                        {/* Stages */}
                        {isOpen && cached && (
                          <div className="border-t border-gray-100 px-3 py-2 space-y-1.5 bg-gray-50/50">
                            {stages.length === 0 ? (
                              <p className="text-xs text-gray-400 py-1 text-center">No stages for this phase yet</p>
                            ) : (
                              <>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] text-gray-400 font-medium">{doneCnt}/{stages.length} done</span>
                                  <div className="flex-1 mx-2 h-1 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                                      style={{ width: `${stages.length > 0 ? Math.round((doneCnt / stages.length) * 100) : 0}%` }}
                                    />
                                  </div>
                                </div>
                                {stages.map((stage: any) => (
                                  <button
                                    key={stage.id}
                                    onClick={() => togglePhaseStage(proj.id, currentPhase, stage.id, stage.completed)}
                                    disabled={!!stageToggling}
                                    className="w-full flex items-center gap-2 text-left hover:bg-white rounded-lg px-1.5 py-1 transition-colors group disabled:opacity-60"
                                  >
                                    <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                                      stage.completed
                                        ? 'bg-indigo-500 border-indigo-500'
                                        : 'border-gray-300 group-hover:border-indigo-400'
                                    }`}>
                                      {stageToggling === stage.id
                                        ? <Loader2 size={9} className="animate-spin text-white" />
                                        : stage.completed
                                        ? <Check size={9} className="text-white" />
                                        : null}
                                    </span>
                                    <span className={`text-xs flex-1 truncate ${stage.completed ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                                      {stage.name}
                                    </span>
                                  </button>
                                ))}
                              </>
                            )}
                            <button
                              onClick={() => { window.history.pushState({}, '', `/projects/${proj.id}`); window.dispatchEvent(new PopStateEvent('popstate')) }}
                              className="w-full text-center text-[10px] text-indigo-500 hover:text-indigo-700 font-medium pt-1"
                            >
                              View all phases →
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h4 className="text-sm font-semibold text-gray-800 mb-3">Quick Actions</h4>
              <div className="space-y-1.5">
                {[
                  { label: 'Submit Daily Report',  icon: <ClipboardList size={14} />, onClick: () => setShowReportForm(true), disabled: !!reportSubmitted, done: !!reportSubmitted },
                  { label: 'View All Projects',     icon: <Target size={14} />,        onClick: () => { window.history.pushState({}, '', '/projects'); window.dispatchEvent(new PopStateEvent('popstate')) } },
                  { label: 'Send a Message',        icon: <ArrowRight size={14} />,    onClick: () => { window.history.pushState({}, '', '/chat'); window.dispatchEvent(new PopStateEvent('popstate')) } },
                ].map(a => (
                  <button
                    key={a.label}
                    onClick={a.onClick}
                    disabled={a.disabled}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left group ${
                      a.done
                        ? 'bg-emerald-50 text-emerald-700 cursor-default'
                        : 'hover:bg-blue-50 hover:text-blue-700 text-gray-600'
                    }`}
                  >
                    <span className={`shrink-0 ${a.done ? 'text-emerald-500' : 'text-gray-400 group-hover:text-blue-500'}`}>
                      {a.done ? <CheckCircle2 size={14} /> : a.icon}
                    </span>
                    {a.label}
                    {!a.done && <ChevronRight size={13} className="ml-auto text-gray-300 group-hover:text-blue-400 transition-colors" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Task Detail Modal ────────────────────────────────────────────────── */}
      {detailTask && (
        <Modal onClose={() => { setDetailTask(null); setEditForm(null) }}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl animate-scale-in">

            {/* Header */}
            <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[detailTask.priority] || 'bg-gray-400'}`} />
                  <span className={`text-xs px-2 py-0.5 rounded-lg font-semibold ${PRIORITY_COLORS[detailTask.priority] || 'bg-gray-100 text-gray-500'}`}>
                    {detailTask.priority} priority
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-lg font-semibold ${STATUS_COLORS[detailTask.status] || 'bg-gray-100'}`}>
                    {STATUS_LABELS[detailTask.status] || detailTask.status}
                  </span>
                </div>
                <h2 className="text-base font-bold text-gray-900 leading-snug">{detailTask.title}</h2>
              </div>
              <button
                onClick={() => { setDetailTask(null); setEditForm(null) }}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            {detailLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader size={22} className="animate-spin text-blue-500" />
              </div>
            ) : (
              <div className="p-5 space-y-5">

                {detailTask.description && (
                  <p className="text-sm text-gray-600 leading-relaxed">{detailTask.description}</p>
                )}

                {/* Status update */}
                {editForm && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Update Status</label>
                    <div className="grid grid-cols-3 gap-2">
                      {STATUS_COLS.map(s => (
                        <button
                          key={s}
                          disabled={statusUpdating}
                          onClick={() => handleStatusUpdate(s)}
                          className={`py-2 px-2 rounded-xl text-xs font-semibold border-2 transition-all ${
                            editForm.status === s
                              ? `${STATUS_COLORS[s]} border-current shadow-sm`
                              : 'bg-white border-gray-100 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                          }`}
                        >
                          {STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>
                    {statusUpdating && (
                      <p className="text-xs text-blue-500 mt-2 flex items-center gap-1">
                        <Loader size={11} className="animate-spin" /> Saving…
                      </p>
                    )}
                  </div>
                )}

                {/* Assignees */}
                {detailTask.assignees?.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Assigned to</label>
                    <div className="flex flex-wrap gap-2">
                      {detailTask.assignees.map((a: any) => (
                        <span key={a.id} className="flex items-center gap-2 text-xs bg-blue-50 text-blue-700 px-2.5 py-1.5 rounded-lg font-semibold">
                          <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold">
                            {a.name?.[0]?.toUpperCase()}
                          </div>
                          {a.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Meta info */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {[
                    ['Est.', `${detailTask.estimated_hours ?? 0}h`],
                    ['Logged', `${detailTask.logged_hours ?? 0}h`],
                    ...(detailTask.due_date ? [['Due', new Date(detailTask.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })]] : []),
                  ].map(([label, value]) => (
                    <div key={label} className="bg-gray-50 rounded-xl px-3 py-2.5 text-center">
                      <p className="text-gray-400 mb-0.5 text-[10px] uppercase tracking-wide font-medium">{label}</p>
                      <p className="font-bold text-gray-700 text-sm">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Blocked banner */}
                {detailTask.is_blocked && (
                  <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-start gap-2">
                    <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm text-red-700 font-semibold">Blocked</p>
                      <p className="text-xs text-red-500 mt-0.5">{detailTask.blocked_reason || 'No reason specified'}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ── Daily Report Modal ───────────────────────────────────────────────── */}
      {showReportForm && (
        <Modal onClose={() => setShowReportForm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl animate-scale-in flex flex-col"
               style={{ maxHeight: 'calc(100vh - 2rem)' }}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center">
                  <ClipboardList size={16} className="text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-800">Daily Report</h2>
                  <p className="text-xs text-gray-400">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                </div>
              </div>
              <button
                onClick={() => setShowReportForm(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Project <span className="text-red-400">*</span></label>
                  <select
                    value={report.project_id}
                    onChange={e => setReport({ ...report, project_id: e.target.value })}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
                  >
                    <option value="">Select project...</option>
                    {projects.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Date</label>
                  <input
                    type="date"
                    value={report.report_date}
                    onChange={e => setReport({ ...report, report_date: e.target.value })}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Hours Worked</label>
                  <input
                    type="number" min={1} max={16} step={0.5}
                    value={report.hours_worked}
                    onChange={e => setReport({ ...report, hours_worked: Number(e.target.value) })}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Mood</label>
                  <div className="flex gap-1 flex-wrap">
                    {MOODS.map(m => (
                      <button
                        key={m.value}
                        onClick={() => setReport({ ...report, mood: m.value })}
                        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs border font-semibold transition-all ${
                          report.mood === m.value ? m.active : m.inactive
                        }`}
                      >
                        {m.icon} {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Tasks Completed</label>
                <div className="space-y-2">
                  {report.tasks_completed.map((task, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        value={task.description}
                        onChange={e => {
                          const updated = [...report.tasks_completed]
                          updated[i] = { ...updated[i], description: e.target.value }
                          setReport({ ...report, tasks_completed: updated })
                        }}
                        placeholder="Task description..."
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
                      />
                      <input
                        type="number" min={0.5} max={16} step={0.5}
                        value={task.hours_spent}
                        onChange={e => {
                          const updated = [...report.tasks_completed]
                          updated[i] = { ...updated[i], hours_spent: Number(e.target.value) }
                          setReport({ ...report, tasks_completed: updated })
                        }}
                        className="w-16 border border-gray-200 rounded-xl px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
                      />
                      {report.tasks_completed.length > 1 && (
                        <button
                          onClick={() => setReport({ ...report, tasks_completed: report.tasks_completed.filter((_, j) => j !== i) })}
                          className="w-9 h-9 flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-xl transition-all"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setReport({ ...report, tasks_completed: [...report.tasks_completed, { description: '', hours_spent: 1, status: 'completed' }] })}
                  className="flex items-center gap-1.5 text-blue-600 text-xs mt-2 hover:text-blue-700 font-semibold"
                >
                  <Plus size={13} /> Add task
                </button>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Blockers <span className="text-gray-400 font-normal text-xs">(optional)</span>
                </label>
                <div className="space-y-2">
                  {report.blockers.map((b, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        value={b}
                        onChange={e => {
                          const updated = [...report.blockers]
                          updated[i] = e.target.value
                          setReport({ ...report, blockers: updated })
                        }}
                        placeholder="Describe a blocker..."
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
                      />
                      {report.blockers.length > 1 && (
                        <button
                          onClick={() => setReport({ ...report, blockers: report.blockers.filter((_, j) => j !== i) })}
                          className="w-9 h-9 flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-xl transition-all"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setReport({ ...report, blockers: [...report.blockers, ''] })}
                  className="flex items-center gap-1.5 text-blue-600 text-xs mt-2 hover:text-blue-700 font-semibold"
                >
                  <Plus size={13} /> Add blocker
                </button>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Additional Notes</label>
                <textarea
                  value={report.unstructured_notes}
                  onChange={e => setReport({ ...report, unstructured_notes: e.target.value })}
                  placeholder="Any other updates or context..."
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-gray-50 focus:bg-white"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 shrink-0">
              <button
                onClick={() => setShowReportForm(false)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 font-semibold rounded-xl hover:bg-gray-100 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitReport}
                disabled={reportLoading || !report.project_id}
                className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:shadow-lg hover:shadow-emerald-200 disabled:opacity-50 transition-all"
              >
                {reportLoading
                  ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting…</>
                  : <><Check size={15} /> Submit Report</>}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
