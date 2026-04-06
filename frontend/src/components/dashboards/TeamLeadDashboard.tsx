import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  Users, FolderKanban, CheckCircle2, TrendingUp, AlertTriangle,
  Loader, LayoutGrid, List, ChevronRight, Zap, Target,
  Clock, BarChart3, Plus, RefreshCw, ArrowRight,
} from 'lucide-react'
import { RootState } from '../../store'
import { fetchTasksRequest } from '../../store/slices/tasksSlice'
import { fetchProjectsRequest } from '../../store/slices/projectsSlice'
import { fetchTeamsRequest } from '../../store/slices/teamsSlice'
import { navigate } from '../../pages/AppLayout'
import { api } from '../../utils/api'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TEAM_GRADIENTS = [
  'from-teal-400 to-emerald-500',
  'from-blue-400 to-indigo-500',
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

function isOverdue(dateStr: string | undefined) {
  if (!dateStr) return false
  return new Date(dateStr) < new Date()
}

// ─── Constants ────────────────────────────────────────────────────────────────

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
const STATUS_DOT: Record<string, string> = {
  todo:        'bg-gray-400',
  in_progress: 'bg-blue-500',
  review:      'bg-purple-500',
  blocked:     'bg-red-500',
  done:        'bg-emerald-500',
}
const COLUMN_HEADER: Record<string, { bg: string; border: string }> = {
  todo:        { bg: 'bg-gray-50',     border: 'border-gray-200'   },
  in_progress: { bg: 'bg-blue-50',    border: 'border-blue-200'   },
  review:      { bg: 'bg-purple-50',  border: 'border-purple-200' },
  blocked:     { bg: 'bg-red-50',     border: 'border-red-200'    },
  done:        { bg: 'bg-emerald-50', border: 'border-emerald-200'},
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

// ─── Stat Card ───────────────────────────────────────────────────────────────

const StatCard: React.FC<{
  icon: React.ReactNode; label: string; value: string | number
  sub?: string; color: string; onClick?: () => void
}> = ({ icon, label, value, sub, color, onClick }) => (
  <div
    className={`bg-white rounded-2xl border border-slate-100 p-4 shadow-sm hover:shadow-md transition-all duration-200 ${onClick ? 'cursor-pointer hover:-translate-y-0.5' : ''}`}
    onClick={onClick}
  >
    <div className="flex items-start justify-between mb-3">
      <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center`}>
        {icon}
      </div>
      {onClick && <ChevronRight size={14} className="text-gray-300 mt-1" />}
    </div>
    <p className="text-2xl font-bold text-gray-900 leading-none mb-1">{value}</p>
    <p className="text-xs font-semibold text-gray-500">{label}</p>
    {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
  </div>
)

// ─── Component ────────────────────────────────────────────────────────────────

export const TeamLeadDashboard: React.FC = () => {
  const dispatch = useDispatch()
  const { user } = useSelector((s: RootState) => s.auth)
  const { items: taskItems, isLoading: tasksLoading } = useSelector((s: RootState) => s.tasks)
  const { items: teams, isLoading: teamsLoading } = useSelector((s: RootState) => s.teams)
  const { items: projects } = useSelector((s: RootState) => s.projects)

  const [taskView, setTaskView] = useState<'kanban' | 'list'>('kanban')
  const [filterMember, setFilterMember] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [memberDetails, setMemberDetails] = useState<any[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)

  // ── Fetch ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    dispatch(fetchTasksRequest({ page: 1, limit: 200 }))
    dispatch(fetchProjectsRequest({}))
    dispatch(fetchTeamsRequest({ page: 1, limit: 50 }))
  }, [])

  // Fetch team member details via users API (scoped to team lead's teams)
  useEffect(() => {
    if (teamsLoading || teams.length === 0) return
    setLoadingMembers(true)
    api.get('/users?page=1&limit=100')
      .then(res => setMemberDetails(res.data?.users || res.data || []))
      .catch(() => {})
      .finally(() => setLoadingMembers(false))
  }, [teams, teamsLoading])

  // ── Derived stats ─────────────────────────────────────────────────────────

  const allMemberIds = useMemo(() => {
    const ids = new Set<string>()
    teams.forEach((t: any) => {
      t.member_ids?.forEach((id: string) => ids.add(String(id)))
      if (t.lead_id) ids.add(String(t.lead_id))
    })
    return ids
  }, [teams])

  const totalMembers = useMemo(() => {
    const fromTeams = new Set<string>()
    teams.forEach((t: any) => {
      t.member_ids?.forEach((id: string) => fromTeams.add(String(id)))
      if (t.lead_id) fromTeams.add(String(t.lead_id))
    })
    return fromTeams.size
  }, [teams])

  const totalTasks   = taskItems.length
  const doneTasks    = taskItems.filter((t: any) => t.status === 'done').length
  const blockedTasks = taskItems.filter((t: any) => t.status === 'blocked').length
  const overdueTasks = taskItems.filter((t: any) => t.status !== 'done' && isOverdue(t.due_date)).length
  const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
  const activeProjects = projects.filter((p: any) => p.status === 'active').length

  // ── Filtered tasks ────────────────────────────────────────────────────────

  const filteredTasks = useMemo(() => {
    let list = [...taskItems]
    if (filterMember) list = list.filter((t: any) =>
      (t.assignee_ids || []).some((id: any) => String(id) === filterMember)
    )
    if (filterStatus) list = list.filter((t: any) => t.status === filterStatus)
    return list
  }, [taskItems, filterMember, filterStatus])

  const tasksByStatus = useMemo(() => {
    const map: Record<string, any[]> = {}
    STATUS_COLS.forEach(s => { map[s] = [] })
    filteredTasks.forEach((t: any) => {
      if (map[t.status]) map[t.status].push(t)
    })
    return map
  }, [filteredTasks])

  // ── Member workload ───────────────────────────────────────────────────────

  const memberWorkload = useMemo(() => {
    return memberDetails
      .filter((m: any) => allMemberIds.has(String(m._id || m.id)))
      .map((m: any) => {
        const uid = String(m._id || m.id)
        const myTasks = taskItems.filter((t: any) =>
          (t.assignee_ids || []).some((id: any) => String(id) === uid)
        )
        const done    = myTasks.filter((t: any) => t.status === 'done').length
        const blocked = myTasks.filter((t: any) => t.status === 'blocked').length
        const active  = myTasks.filter((t: any) => !['done'].includes(t.status)).length
        return { ...m, uid, total: myTasks.length, done, blocked, active }
      })
      .sort((a, b) => b.active - a.active)
  }, [memberDetails, taskItems, allMemberIds])

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex gap-6 min-h-0">

      {/* ── LEFT: Main Content ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-5">

        {/* Hero */}
        <div className="bg-gradient-to-br from-teal-600 via-emerald-600 to-cyan-700 rounded-2xl p-6 text-white shadow-lg shadow-teal-200/40 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{backgroundImage:'radial-gradient(circle at 80% 20%, white 0%, transparent 60%)'}} />
          <div className="relative z-10">
            <p className="text-teal-100 text-sm font-medium mb-1">{getGreeting()}, {user?.full_name?.split(' ')[0]}</p>
            <h1 className="text-2xl font-black text-white mb-1">Team Lead Dashboard</h1>
            <p className="text-teal-100 text-sm">
              Managing <span className="font-bold text-white">{teams.length}</span> {teams.length === 1 ? 'team' : 'teams'} &middot; <span className="font-bold text-white">{totalMembers}</span> members &middot; <span className="font-bold text-white">{activeProjects}</span> active projects
            </p>
          </div>
          {completionRate > 0 && (
            <div className="absolute right-6 top-1/2 -translate-y-1/2 text-right">
              <p className="text-4xl font-black text-white">{completionRate}%</p>
              <p className="text-teal-100 text-xs font-medium">task completion</p>
            </div>
          )}
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<Users size={16} className="text-teal-600" />}
            label="Team Members" value={totalMembers}
            sub={`across ${teams.length} team${teams.length !== 1 ? 's' : ''}`}
            color="bg-teal-50"
            onClick={() => navigate('/users')}
          />
          <StatCard
            icon={<FolderKanban size={16} className="text-blue-600" />}
            label="Active Projects" value={activeProjects}
            sub={`${projects.length} total`}
            color="bg-blue-50"
            onClick={() => navigate('/projects')}
          />
          <StatCard
            icon={<CheckCircle2 size={16} className="text-emerald-600" />}
            label="Tasks Done" value={doneTasks}
            sub={`of ${totalTasks} total`}
            color="bg-emerald-50"
          />
          <StatCard
            icon={blockedTasks > 0 ? <AlertTriangle size={16} className="text-red-500" /> : <TrendingUp size={16} className="text-violet-600" />}
            label={blockedTasks > 0 ? 'Blocked Tasks' : 'Overdue Tasks'}
            value={blockedTasks > 0 ? blockedTasks : overdueTasks}
            sub={blockedTasks > 0 ? 'need attention' : overdueTasks > 0 ? 'past due date' : 'all on track'}
            color={blockedTasks > 0 ? 'bg-red-50' : 'bg-violet-50'}
          />
        </div>

        {/* Task Board */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {/* Board Header */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-teal-50 rounded-lg flex items-center justify-center">
                <Target size={14} className="text-teal-600" />
              </div>
              <h2 className="text-sm font-bold text-gray-800">Team Task Board</h2>
              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full font-medium">
                {filteredTasks.length} tasks
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* Member filter */}
              <select
                value={filterMember}
                onChange={e => setFilterMember(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-teal-400"
              >
                <option value="">All Members</option>
                {memberWorkload.map((m: any) => (
                  <option key={m.uid} value={m.uid}>{m.full_name || m.name}</option>
                ))}
              </select>
              {/* Status filter */}
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-teal-400"
              >
                <option value="">All Statuses</option>
                {STATUS_COLS.map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
              {/* View toggle */}
              <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setTaskView('kanban')}
                  className={`p-1.5 rounded-md transition-all ${taskView === 'kanban' ? 'bg-white shadow-sm text-gray-700' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  <LayoutGrid size={13} />
                </button>
                <button
                  onClick={() => setTaskView('list')}
                  className={`p-1.5 rounded-md transition-all ${taskView === 'list' ? 'bg-white shadow-sm text-gray-700' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  <List size={13} />
                </button>
              </div>
            </div>
          </div>

          {/* Board Body */}
          {tasksLoading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
              <Loader size={16} className="animate-spin" />
              <span className="text-sm">Loading tasks…</span>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <CheckCircle2 size={32} className="mb-2 text-gray-200" />
              <p className="text-sm font-medium">No tasks found</p>
              <p className="text-xs mt-0.5">Try changing filters or creating tasks</p>
            </div>
          ) : taskView === 'kanban' ? (
            /* Kanban */
            <div className="p-4 overflow-x-auto">
              <div className="flex gap-3 min-w-max">
                {STATUS_COLS.map(status => {
                  const col = tasksByStatus[status] || []
                  const { bg, border } = COLUMN_HEADER[status]
                  return (
                    <div key={status} className={`w-60 flex-shrink-0 ${bg} rounded-xl border ${border} p-2`}>
                      <div className="flex items-center justify-between mb-2 px-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`} />
                          <span className="text-xs font-semibold text-gray-600">{STATUS_LABELS[status]}</span>
                        </div>
                        <span className="text-xs text-gray-400 font-medium">{col.length}</span>
                      </div>
                      <div className="space-y-2">
                        {col.map((task: any) => (
                          <div
                            key={task._id || task.id}
                            className={`bg-white rounded-xl border border-slate-100 p-3 shadow-sm hover:shadow-md transition-all duration-150 cursor-pointer border-l-4 ${PRIORITY_BORDER[task.priority] || 'border-l-gray-200'}`}
                            onClick={() => navigate(`/tasks`)}
                          >
                            <p className="text-xs font-semibold text-gray-800 leading-snug mb-1.5 line-clamp-2">
                              {task.title}
                            </p>
                            <div className="flex items-center justify-between">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${PRIORITY_COLORS[task.priority] || 'bg-gray-100 text-gray-500'}`}>
                                {task.priority || 'medium'}
                              </span>
                              {task.due_date && (
                                <span className={`text-[10px] font-medium flex items-center gap-0.5 ${isOverdue(task.due_date) && task.status !== 'done' ? 'text-red-500' : 'text-gray-400'}`}>
                                  <Clock size={9} />
                                  {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                        {col.length === 0 && (
                          <p className="text-xs text-center text-gray-400 py-4">Empty</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            /* List view */
            <div className="divide-y divide-slate-50">
              {filteredTasks.map((task: any) => (
                <div
                  key={task._id || task.id}
                  className={`flex items-center gap-3 px-5 py-3 hover:bg-slate-50 cursor-pointer transition-colors border-l-4 ${PRIORITY_BORDER[task.priority] || 'border-l-transparent'}`}
                  onClick={() => navigate(`/tasks`)}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[task.status]}`} />
                  <p className="flex-1 text-sm font-medium text-gray-800 truncate">{task.title}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[task.status]}`}>
                    {STATUS_LABELS[task.status]}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[task.priority] || 'bg-gray-100 text-gray-500'}`}>
                    {task.priority || 'medium'}
                  </span>
                  {task.due_date && (
                    <span className={`text-xs font-medium flex items-center gap-1 shrink-0 ${isOverdue(task.due_date) && task.status !== 'done' ? 'text-red-500' : 'text-gray-400'}`}>
                      <Clock size={11} />
                      {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                  <ArrowRight size={13} className="text-gray-300 shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Sidebar ────────────────────────────────────────────────── */}
      <div className="w-72 shrink-0 flex flex-col gap-4 sticky top-6 max-h-[calc(100vh-7rem)] overflow-y-auto scrollbar-hide">

        {/* Quick Actions */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Quick Actions</h3>
          <div className="space-y-2">
            {[
              { label: 'View All Tasks',    icon: <Target size={14} />,    path: '/tasks',     color: 'bg-teal-50 text-teal-600'   },
              { label: 'Analytics',         icon: <BarChart3 size={14} />, path: '/analytics', color: 'bg-blue-50 text-blue-600'   },
              { label: 'Team Reports',      icon: <Zap size={14} />,       path: '/reports',   color: 'bg-violet-50 text-violet-600' },
              { label: 'Projects',          icon: <FolderKanban size={14} />, path: '/projects', color: 'bg-amber-50 text-amber-600' },
            ].map(action => (
              <button
                key={action.path}
                onClick={() => navigate(action.path)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100 hover:border-teal-200 hover:bg-teal-50/30 transition-all duration-150 group text-left"
              >
                <span className={`w-7 h-7 rounded-lg ${action.color} flex items-center justify-center shrink-0`}>
                  {action.icon}
                </span>
                <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">{action.label}</span>
                <ChevronRight size={13} className="ml-auto text-gray-300 group-hover:text-gray-500" />
              </button>
            ))}
          </div>
        </div>

        {/* My Teams */}
        {teams.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">My Teams</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto scrollbar-hide">
              {teams.map((team: any) => (
                <div key={team._id || team.id} className="flex items-center gap-2.5 py-1.5">
                  <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${teamGradient(team.name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                    {team.name?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate leading-tight">{team.name}</p>
                    <p className="text-xs text-gray-400">{team.member_ids?.length || 0} members</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Team Members Workload */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Member Workload</h3>
            {loadingMembers && <Loader size={12} className="animate-spin text-gray-400" />}
          </div>
          {memberWorkload.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">
              {loadingMembers ? 'Loading…' : 'No members found'}
            </p>
          ) : (
            <div className="space-y-3 max-h-60 overflow-y-auto scrollbar-hide">
              {memberWorkload.map((m: any) => {
                const pct = m.total > 0 ? Math.round((m.done / m.total) * 100) : 0
                return (
                  <div key={m.uid} className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${teamGradient(m.full_name || m.name || '')} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
                      {(m.full_name || m.name || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <p className="text-xs font-semibold text-gray-700 truncate leading-none">{m.full_name || m.name}</p>
                        <span className="text-[10px] text-gray-400 ml-1 shrink-0">{m.done}/{m.total}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className="bg-teal-500 h-1.5 rounded-full transition-all duration-700"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {m.blocked > 0 && (
                        <p className="text-[10px] text-red-500 mt-0.5">{m.blocked} blocked</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Performance Summary */}
        <div className="bg-gradient-to-br from-teal-600 to-emerald-700 rounded-2xl p-4 text-white shadow-lg shadow-teal-200/30">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={14} className="text-teal-200" />
            <h3 className="text-xs font-bold text-teal-100 uppercase tracking-wider">Team Performance</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-teal-100">Completion Rate</span>
              <span className="text-sm font-bold text-white">{completionRate}%</span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-1.5">
              <div className="bg-white h-1.5 rounded-full transition-all duration-700" style={{ width: `${completionRate}%` }} />
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-teal-100">Blocked</span>
              <span className={`text-sm font-bold ${blockedTasks > 0 ? 'text-red-300' : 'text-white'}`}>{blockedTasks}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-teal-100">Overdue</span>
              <span className={`text-sm font-bold ${overdueTasks > 0 ? 'text-amber-300' : 'text-white'}`}>{overdueTasks}</span>
            </div>
          </div>
          <button
            onClick={() => navigate('/analytics')}
            className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 bg-white/15 hover:bg-white/25 rounded-xl text-xs font-semibold text-white transition-all duration-150"
          >
            <BarChart3 size={12} />
            View Full Analytics
          </button>
        </div>

      </div>
    </div>
  )
}
