import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  ClipboardList, Check, Zap, LayoutGrid, List, AlertTriangle,
  Clock, TrendingUp, Target, CheckCircle2, Activity, Calendar,
  ChevronRight, ArrowRight, Flame,
} from 'lucide-react'
import { RootState } from '../../store'
import { fetchDashboardRequest } from '../../store/slices/dashboardSlice'
import { fetchTasksRequest, updateTaskLocal } from '../../store/slices/tasksSlice'
import { submitReportRequest, resetSubmitStatus } from '../../store/slices/reportsSlice'
import { fetchProjectsRequest } from '../../store/slices/projectsSlice'
import { fetchTeamsRequest } from '../../store/slices/teamsSlice'
import { Pagination } from '../common/Pagination'
import { api } from '../../utils/api'
import { useToast } from '../shared'
import {
  STATUS_COLS, STATUS_LABELS, STATUS_COLORS, STATUS_BAR, STATUS_DOT,
  COLUMN_HEADER, PRIORITY_BORDER, PRIORITY_COLORS, PRIORITY_DOT,
  getGreeting, isToday,
} from './employee/employeeConstants'
import { PerformanceRing } from './employee/PerformanceRing'
import { TaskDetailModal } from './employee/TaskDetailModal'
import { DailyReportModal } from './employee/DailyReportModal'
import { MyProjectPhases } from './employee/MyProjectPhases'
import { MyTeamsWidget } from './employee/MyTeamsWidget'

export const EmployeeDashboard: React.FC = () => {
  const dispatch = useDispatch()
  const toast = useToast()
  const { data } = useSelector((s: RootState) => s.dashboard)
  const { submitSuccess, isLoading: reportLoading } = useSelector((s: RootState) => s.reports)
  const { items: taskItems, total: taskTotal, isLoading: tasksLoading } = useSelector((s: RootState) => s.tasks)
  const { items: teams, isLoading: teamsLoading } = useSelector((s: RootState) => s.teams)
  const { user } = useSelector((s: RootState) => s.auth)
  const { items: projects } = useSelector((s: RootState) => s.projects)

  const [activeTab] = useState<'work'>('work')
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

  // ── Fetch ───────────────────────────────────────────────────────────────────

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

  // ── Task detail ─────────────────────────────────────────────────────────────

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
      toast.success('Task status updated')
    } catch {
      toast.error('Failed to update task status')
    }
    setStatusUpdating(false)
  }

  // ── Phase widget helpers ────────────────────────────────────────────────────

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
      const res = await api.get(`/projects/${projectId}`)
      setProjectPhaseCache(prev => ({ ...prev, [projectId]: res.data }))
      toast.success(!current ? 'Stage completed' : 'Stage reopened')
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Failed to update stage'
      toast.error(msg)
      setPhaseError(msg)
    } finally {
      setStageToggling(null)
    }
  }

  // ── Report submit ───────────────────────────────────────────────────────────

  const handleSubmitReport = () => {
    dispatch(submitReportRequest({
      ...report,
      tasks_completed: report.tasks_completed.filter(t => t.description),
      tasks_planned:   report.tasks_planned.filter(Boolean),
      blockers:        report.blockers.filter(Boolean),
    }))
  }

  // ── Derived stats ───────────────────────────────────────────────────────────

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
    { label: 'Total Assigned', value: taskTotal,       icon: <ClipboardList size={16} className="text-blue-600" />,   iconBg: 'bg-blue-50',    bar: 100,                                                                               barColor: 'bg-blue-500',   accent: 'text-blue-600' },
    { label: 'In Progress',    value: countInProgress, icon: <Activity size={16} className="text-violet-600" />,       iconBg: 'bg-violet-50',  bar: taskItems.length ? Math.round((countInProgress / taskItems.length) * 100) : 0,     barColor: 'bg-violet-500', accent: 'text-violet-600' },
    { label: 'Due Today',      value: countDueToday,   icon: <Calendar size={16} className={countDueToday > 0 ? 'text-amber-600' : 'text-gray-400'} />, iconBg: countDueToday > 0 ? 'bg-amber-50' : 'bg-gray-50', bar: taskItems.length ? Math.round((countDueToday / taskItems.length) * 100) : 0, barColor: countDueToday > 0 ? 'bg-amber-500' : 'bg-gray-300', accent: countDueToday > 0 ? 'text-amber-600' : 'text-gray-400' },
    { label: 'Completed',      value: countDone,       icon: <CheckCircle2 size={16} className="text-emerald-600" />, iconBg: 'bg-emerald-50', bar: completionPct,                                                                     barColor: 'bg-emerald-500',accent: 'text-emerald-600' },
  ]

  const evalBadge: Record<string, string> = { green: 'text-emerald-300', blue: 'text-blue-300', amber: 'text-amber-300', red: 'text-red-300' }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 animate-fade-in-up">

      {/* ── HERO BANNER ──────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 shadow-xl shadow-blue-200/40">
        <div className="pointer-events-none absolute -top-12 -right-12 w-56 h-56 bg-white/5 rounded-full" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 w-48 h-48 bg-white/5 rounded-full" />
        <div className="pointer-events-none absolute top-1/2 right-1/3 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl" />

        <div className="relative px-7 py-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-white/15 border border-white/20 backdrop-blur-sm flex items-center justify-center text-white text-2xl font-bold shrink-0 shadow-lg">
              {user?.full_name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="min-w-0">
              <p className="text-blue-200 text-sm font-medium">
                {getGreeting()} · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </p>
              <h1 className="text-white text-2xl font-bold mt-0.5 leading-tight truncate">{user?.full_name}</h1>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-xs bg-white/15 text-white px-2.5 py-1 rounded-lg font-semibold border border-white/10">{roleLabel}</span>
                {evalMode && <span className={`text-xs font-medium ${evalBadge[evalMode.color] || 'text-blue-200'}`}>{evalMode.label}</span>}
                {reportSubmitted && (
                  <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-1 rounded-lg font-medium flex items-center gap-1">
                    <Check size={10} /> Report done
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            {evalMode && <PerformanceRing score={evalMode.score} color={evalMode.color} />}
            {!reportSubmitted ? (
              <button onClick={() => setShowReportForm(true)} className="flex items-center gap-2 bg-white text-blue-700 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200">
                <ClipboardList size={15} /> Daily Report
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-white/10 text-white/80 border border-white/20 px-4 py-2.5 rounded-xl text-sm font-medium">
                <CheckCircle2 size={15} className="text-emerald-400" /> Submitted
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── STAT CARDS ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s, i) => (
          <div key={s.label} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200 animate-fade-in-up" style={{ animationDelay: `${i * 0.07}s` }}>
            <div className="flex items-center justify-between mb-3">
              <div className={`w-9 h-9 rounded-xl ${s.iconBg} flex items-center justify-center`}>{s.icon}</div>
              <span className={`text-2xl font-bold ${s.accent}`}>{s.value}</span>
            </div>
            <p className="text-xs font-medium text-gray-500">{s.label}</p>
            <div className="mt-2.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${s.barColor} transition-all duration-700`} style={{ width: `${Math.min(s.bar, 100)}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* ── Performance badge ─────────────────────────────────────────────────── */}
      {evalMode && (
        <div className={`self-start flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border ${
          evalMode.color === 'green' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
          evalMode.color === 'amber' ? 'bg-amber-50 text-amber-700 border-amber-200' :
          evalMode.color === 'red'   ? 'bg-red-50 text-red-600 border-red-200' :
          'bg-blue-50 text-blue-700 border-blue-200'
        }`}>
          <Zap size={12} /> {evalMode.label} · {evalMode.score}/100
        </div>
      )}

      {/* ── WORK CONTENT ─────────────────────────────────────────────────────── */}
      {activeTab === 'work' && (
        <div className="flex gap-5 items-start animate-fade-in-up">

          {/* Main column (task board) */}
          <div className="flex-1 min-w-0 space-y-4">

            {countBlocked > 0 && (
              <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3 animate-fade-in">
                <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
                  <AlertTriangle size={15} className="text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-red-800">{countBlocked} blocked {countBlocked === 1 ? 'task' : 'tasks'} need attention</p>
                  <p className="text-xs text-red-500 mt-0.5">Review and resolve blockers to keep projects on track</p>
                </div>
              </div>
            )}

            {countDueToday > 0 && countBlocked === 0 && (
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 animate-fade-in">
                <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
                  <Flame size={15} className="text-amber-600" />
                </div>
                <p className="text-sm font-semibold text-amber-800">{countDueToday} {countDueToday === 1 ? 'task is' : 'tasks are'} due today</p>
              </div>
            )}

            {/* Task board card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <ClipboardList size={16} className="text-blue-500" />
                  <h3 className="font-semibold text-gray-800 text-sm">My Tasks</h3>
                  <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg">{taskTotal}</span>
                </div>
                <div className="flex items-center gap-2">
                  <select value={taskFilterPriority} onChange={e => { setTaskFilterPriority(e.target.value); setTaskPage(1) }} className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-600 font-medium">
                    <option value="">All Priorities</option>
                    {['critical', 'high', 'medium', 'low'].map(p => (
                      <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                    ))}
                  </select>
                  <div className="flex bg-gray-100 rounded-xl p-0.5">
                    {(['kanban', 'list'] as const).map(v => (
                      <button key={v} onClick={() => setTaskView(v)} title={v === 'kanban' ? 'Board view' : 'List view'} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${taskView === v ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        {v === 'kanban' ? <LayoutGrid size={13} /> : <List size={13} />}
                        {v === 'kanban' ? 'Board' : 'List'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-4">
                {tasksLoading && taskItems.length === 0 ? (
                  taskView === 'kanban' ? (
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="flex-shrink-0 w-52 space-y-2">
                          <div className="h-8 skeleton rounded-xl" /><div className="h-24 skeleton rounded-xl" /><div className="h-16 skeleton rounded-xl" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-12 skeleton rounded-xl" />)}</div>
                  )
                ) : taskView === 'kanban' ? (
                  <div className="flex gap-3 overflow-x-auto pb-2" style={{ minHeight: 200 }}>
                    {STATUS_COLS.map((status, ci) => {
                      const col = tasksByStatus[status] || []
                      const ch = COLUMN_HEADER[status]
                      return (
                        <div key={status} className="flex-shrink-0 w-52 flex flex-col gap-2">
                          <div className={`rounded-xl border ${ch.bg} ${ch.border} px-3 py-2 flex items-center justify-between`}>
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`} />
                              <span className="text-xs font-semibold text-gray-700">{STATUS_LABELS[status]}</span>
                            </div>
                            <span className="text-xs bg-white/70 text-gray-500 font-semibold px-1.5 py-0.5 rounded-md">{col.length}</span>
                          </div>
                          <div className="space-y-2 flex-1">
                            {col.length === 0 ? (
                              <div className="border-2 border-dashed border-gray-100 rounded-xl py-6 flex items-center justify-center">
                                <p className="text-xs text-gray-300 font-medium">Empty</p>
                              </div>
                            ) : col.map((task: any, i: number) => (
                              <div key={task.id} onClick={() => openTaskDetail(task)} className={`bg-white rounded-xl border-l-[3px] border border-gray-100 ${PRIORITY_BORDER[task.priority] || 'border-l-gray-200'} p-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 cursor-pointer transition-all duration-150 group animate-fade-in-up`} style={{ animationDelay: `${ci * 0.04 + i * 0.02}s` }}>
                                <p className="text-xs font-semibold text-gray-800 line-clamp-2 leading-snug group-hover:text-blue-700 transition-colors">{task.title}</p>
                                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold flex items-center gap-0.5 ${PRIORITY_COLORS[task.priority] || 'bg-gray-100 text-gray-500'}`}>
                                    <span className={`w-1 h-1 rounded-full ${PRIORITY_DOT[task.priority] || 'bg-gray-400'}`} />{task.priority}
                                  </span>
                                  {task.due_date && (
                                    <span className={`text-[10px] flex items-center gap-0.5 font-medium ${isToday(task.due_date) ? 'text-amber-600' : 'text-gray-400'}`}>
                                      <Clock size={8} />{isToday(task.due_date) ? 'Today' : new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
                          <tr><td colSpan={5} className="text-center py-14">
                            <div className="flex flex-col items-center gap-2">
                              <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center"><ClipboardList size={18} className="text-gray-300" /></div>
                              <p className="text-sm text-gray-400 font-medium">No tasks assigned</p>
                            </div>
                          </td></tr>
                        ) : taskItems.map((task: any, i: number) => (
                          <tr key={task.id} onClick={() => openTaskDetail(task)} className="hover:bg-blue-50/40 cursor-pointer transition-colors group animate-fade-in" style={{ animationDelay: `${i * 0.02}s` }}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[task.priority] || 'bg-gray-300'}`} />
                                <p className="font-semibold text-gray-800 text-sm group-hover:text-blue-700 transition-colors truncate max-w-xs">{task.title}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-lg font-semibold ${STATUS_COLORS[task.status] || 'bg-gray-100'}`}>{STATUS_LABELS[task.status] || task.status}</span></td>
                            <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-lg font-semibold ${PRIORITY_COLORS[task.priority] || 'bg-gray-100'}`}>{task.priority}</span></td>
                            <td className="px-4 py-3 text-xs font-medium text-gray-500">
                              {task.due_date ? <span className={isToday(task.due_date) ? 'text-amber-600 font-semibold' : ''}>{isToday(task.due_date) ? 'Today' : new Date(task.due_date).toLocaleDateString()}</span> : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400">{task.logged_hours}/{task.estimated_hours}h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="px-4 pb-4">
                <Pagination page={taskPage} totalPages={Math.ceil(taskTotal / taskLimit)} total={taskTotal} limit={taskLimit} onPageChange={setTaskPage} onLimitChange={l => { setTaskLimit(l); setTaskPage(1) }} limitOptions={[10, 20, 50]} />
              </div>
            </div>
          </div>

          {/* Right sidebar */}
          <div className="w-72 shrink-0 space-y-4 sticky top-6 max-h-[calc(100vh-7rem)] overflow-y-auto scrollbar-hide">

            {/* Task Overview widget */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center"><TrendingUp size={13} className="text-blue-600" /></div>
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
                        <div className={`h-full rounded-full ${STATUS_BAR[status]} transition-all duration-700`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              {taskItems.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-gray-500 font-medium">Completion rate</span>
                  <span className="text-sm font-bold text-emerald-600">{completionPct}%</span>
                </div>
              )}
            </div>

            <MyTeamsWidget teams={teams} loading={teamsLoading} />

            <MyProjectPhases
              projects={projects}
              expandedProjectId={expandedProjectId}
              projectPhaseCache={projectPhaseCache}
              phaseLoadingId={phaseLoadingId}
              stageToggling={stageToggling}
              phaseError={phaseError}
              onToggleProject={loadProjectPhases}
              onToggleStage={togglePhaseStage}
            />

            {/* Quick actions */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h4 className="text-sm font-semibold text-gray-800 mb-3">Quick Actions</h4>
              <div className="space-y-1.5">
                {[
                  { label: 'Submit Daily Report', icon: <ClipboardList size={14} />, onClick: () => setShowReportForm(true), disabled: !!reportSubmitted, done: !!reportSubmitted },
                  { label: 'View All Projects',   icon: <Target size={14} />,        onClick: () => { window.history.pushState({}, '', '/projects'); window.dispatchEvent(new PopStateEvent('popstate')) } },
                  { label: 'Send a Message',      icon: <ArrowRight size={14} />,    onClick: () => { window.history.pushState({}, '', '/chat'); window.dispatchEvent(new PopStateEvent('popstate')) } },
                ].map(a => (
                  <button key={a.label} onClick={a.onClick} disabled={a.disabled} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left group ${a.done ? 'bg-emerald-50 text-emerald-700 cursor-default' : 'hover:bg-blue-50 hover:text-blue-700 text-gray-600'}`}>
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

      <TaskDetailModal
        task={detailTask}
        onClose={() => { setDetailTask(null); setEditForm(null) }}
        onStatusChange={handleStatusUpdate}
        loading={detailLoading}
        editForm={editForm}
        statusUpdating={statusUpdating}
      />

      <DailyReportModal
        show={showReportForm}
        onClose={() => setShowReportForm(false)}
        report={report}
        onChange={setReport}
        onSubmit={handleSubmitReport}
        loading={reportLoading}
        projects={projects}
      />
    </div>
  )
}
