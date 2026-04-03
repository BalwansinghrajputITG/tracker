import React, { useEffect, useState } from 'react'
import {
  ArrowLeft, Mail, Phone, Building2, Shield, CheckCircle2, AlertTriangle,
  GitCommit, FolderOpen, Users, Clock, BarChart2, Loader2, Calendar,
  TrendingUp, Star, Activity, Briefcase, FileText, GitBranch, User,
} from 'lucide-react'
import { api } from '../utils/api'
import { navigate } from './AppLayout'

// ─── Shared constants ─────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  ceo:       'bg-purple-100 text-purple-700 border-purple-200',
  coo:       'bg-indigo-100 text-indigo-700 border-indigo-200',
  admin:     'bg-rose-100 text-rose-700 border-rose-200',
  pm:        'bg-blue-100 text-blue-700 border-blue-200',
  team_lead: 'bg-teal-100 text-teal-700 border-teal-200',
  employee:  'bg-gray-100 text-gray-600 border-gray-200',
}

const AVATAR_COLORS: Record<string, string> = {
  ceo:       'from-purple-500 to-violet-600',
  coo:       'from-indigo-500 to-blue-600',
  admin:     'from-rose-500 to-red-600',
  pm:        'from-blue-500 to-cyan-600',
  team_lead: 'from-teal-500 to-emerald-600',
  employee:  'from-slate-400 to-gray-500',
}

const STATUS_COLORS: Record<string, string> = {
  todo:        'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  review:      'bg-amber-100 text-amber-700',
  done:        'bg-emerald-100 text-emerald-700',
  blocked:     'bg-red-100 text-red-700',
}

const PRIORITY_COLORS: Record<string, string> = {
  low:      'text-gray-500',
  medium:   'text-amber-600',
  high:     'text-orange-600',
  critical: 'text-red-600',
}

const MOOD_EMOJI: Record<string, string> = {
  great:      '😄',
  good:       '🙂',
  neutral:    '😐',
  stressed:   '😰',
  burned_out: '🥵',
}

const PROJECT_STATUS_COLORS: Record<string, string> = {
  active:     'bg-emerald-100 text-emerald-700',
  on_hold:    'bg-amber-100 text-amber-700',
  completed:  'bg-blue-100 text-blue-700',
  cancelled:  'bg-gray-100 text-gray-500',
  planning:   'bg-violet-100 text-violet-700',
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function repoName(url: string) {
  const parts = url.replace(/\.git$/, '').split('/')
  return parts.slice(-2).join('/') || url
}

// ─── Stat card ────────────────────────────────────────────────────────────────

const StatCard: React.FC<{
  icon: React.ReactNode
  label: string
  value: string | number
  color: string
}> = ({ icon, label, value, color }) => (
  <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center gap-3">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
      {icon}
    </div>
    <div>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-xl font-bold text-gray-900 leading-tight">{value}</p>
    </div>
  </div>
)

// ─── Tab button ───────────────────────────────────────────────────────────────

const Tab: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({
  active, onClick, children,
}) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 text-sm font-medium rounded-xl transition-all ${
      active
        ? 'bg-blue-600 text-white shadow-sm'
        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
    }`}
  >
    {children}
  </button>
)

// ─── Overview tab ─────────────────────────────────────────────────────────────

const OverviewTab: React.FC<{ profile: any }> = ({ profile }) => {
  const breakdown: Record<string, number> = profile.task_breakdown || {}
  const statuses = ['todo', 'in_progress', 'review', 'done', 'blocked']
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0) || 1

  return (
    <div className="space-y-5">
      {/* Manager */}
      {profile.manager && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <User size={14} className="text-gray-400" /> Reports To
          </h3>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${AVATAR_COLORS[profile.manager.role] || AVATAR_COLORS.employee} flex items-center justify-center text-white font-bold text-sm shadow-sm`}>
              {profile.manager.name?.[0]?.toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">{profile.manager.name}</p>
              <p className="text-xs text-gray-500">{profile.manager.role?.replace('_', ' ')} · {profile.manager.department}</p>
            </div>
            <a href={`mailto:${profile.manager.email}`} className="ml-auto text-xs text-blue-600 hover:underline flex items-center gap-1">
              <Mail size={11} /> {profile.manager.email}
            </a>
          </div>
        </div>
      )}

      {/* Task Breakdown */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <BarChart2 size={14} className="text-gray-400" /> Task Breakdown
        </h3>
        <div className="space-y-3">
          {statuses.map(s => {
            const count = breakdown[s] || 0
            const pct = Math.round((count / total) * 100)
            return (
              <div key={s} className="flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded-lg font-medium w-24 text-center ${STATUS_COLORS[s] || 'bg-gray-100 text-gray-600'}`}>
                  {s.replace('_', ' ')}
                </span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      s === 'done' ? 'bg-emerald-500' :
                      s === 'in_progress' ? 'bg-blue-500' :
                      s === 'review' ? 'bg-amber-500' :
                      s === 'blocked' ? 'bg-red-500' : 'bg-gray-300'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-12 text-right">{count} ({pct}%)</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent Activity — last 5 commits */}
      {profile.commits?.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <GitCommit size={14} className="text-gray-400" /> Recent Commits
          </h3>
          <div className="space-y-2">
            {profile.commits.slice(0, 5).map((c: any, i: number) => (
              <div key={i} className="flex items-start gap-2.5 py-2 border-b border-gray-50 last:border-0">
                <span className="font-mono text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded shrink-0">{c.sha}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 truncate">{c.message}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{repoName(c.repo)} · {fmtDate(c.date)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Projects tab ─────────────────────────────────────────────────────────────

const ProjectsTab: React.FC<{ projects: any[] }> = ({ projects }) => {
  if (!projects.length) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-gray-400">
        <FolderOpen size={32} className="mb-2 text-gray-200" />
        <p className="text-sm">No projects assigned</p>
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {projects.map((p: any) => (
        <div
          key={p.id}
          onClick={() => navigate(`/projects/${p.id}`)}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md hover:border-blue-100 transition-all cursor-pointer group"
        >
          <div className="flex items-start justify-between gap-2 mb-3">
            <p className="text-sm font-semibold text-gray-800 group-hover:text-blue-700 transition-colors">{p.name}</p>
            <span className={`text-xs px-2 py-0.5 rounded-lg font-medium shrink-0 ${PROJECT_STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-600'}`}>
              {p.status?.replace('_', ' ')}
            </span>
          </div>
          <div className="mb-2">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Progress</span>
              <span className="font-medium">{p.progress}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${p.progress}%` }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span className={`font-medium ${PRIORITY_COLORS[p.priority] || ''}`}>{p.priority}</span>
            <span className="flex items-center gap-1">
              <Calendar size={10} /> {fmtDate(p.due_date)}
            </span>
          </div>
          {p.is_delayed && (
            <div className="mt-2 flex items-center gap-1 text-xs text-red-500 font-medium">
              <AlertTriangle size={11} /> Delayed
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Teams tab ────────────────────────────────────────────────────────────────

const TeamsTab: React.FC<{ teams: any[] }> = ({ teams }) => {
  if (!teams.length) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-gray-400">
        <Users size={32} className="mb-2 text-gray-200" />
        <p className="text-sm">No teams assigned</p>
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {teams.map((t: any) => (
        <div key={t.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-teal-50 rounded-xl flex items-center justify-center">
              <Users size={16} className="text-teal-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">{t.name}</p>
              <p className="text-xs text-gray-500">{t.department || 'No department'}</p>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span className="flex items-center gap-1"><User size={11} /> Lead: <span className="font-medium text-gray-700 ml-1">{t.lead}</span></span>
            <span className="flex items-center gap-1"><FolderOpen size={11} /> {t.project_count} project{t.project_count !== 1 ? 's' : ''}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Tasks tab ────────────────────────────────────────────────────────────────

const TasksTab: React.FC<{ tasks: any[] }> = ({ tasks }) => {
  const [filter, setFilter] = useState('all')

  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter)

  if (!tasks.length) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-gray-400">
        <CheckCircle2 size={32} className="mb-2 text-gray-200" />
        <p className="text-sm">No tasks assigned</p>
      </div>
    )
  }

  const statuses = ['all', 'todo', 'in_progress', 'review', 'done', 'blocked']

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {statuses.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
              filter === s
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
            }`}
          >
            {s === 'all' ? `All (${tasks.length})` : s.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map((t: any) => (
          <div key={t.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-start gap-3">
            <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
              t.status === 'done' ? 'bg-emerald-500' :
              t.status === 'in_progress' ? 'bg-blue-500' :
              t.status === 'review' ? 'bg-amber-500' :
              t.status === 'blocked' ? 'bg-red-500' : 'bg-gray-300'
            }`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-gray-800">{t.title}</p>
                <span className={`text-xs px-2 py-0.5 rounded-lg font-medium shrink-0 ${STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-600'}`}>
                  {t.status.replace('_', ' ')}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                <span className="flex items-center gap-1"><FolderOpen size={10} /> {t.project}</span>
                <span className={`font-medium ${PRIORITY_COLORS[t.priority] || ''}`}>{t.priority}</span>
                {t.due_date && <span className="flex items-center gap-1"><Calendar size={10} /> {fmtDate(t.due_date)}</span>}
                {t.logged_hours > 0 && <span className="flex items-center gap-1"><Clock size={10} /> {t.logged_hours}h</span>}
                {t.is_blocked && <span className="flex items-center gap-1 text-red-500"><AlertTriangle size={10} /> Blocked</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Reports tab ──────────────────────────────────────────────────────────────

const ReportsTab: React.FC<{ reports: any[] }> = ({ reports }) => {
  if (!reports.length) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-gray-400">
        <FileText size={32} className="mb-2 text-gray-200" />
        <p className="text-sm">No reports in the last 30 days</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {reports.map((r: any, i: number) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">{MOOD_EMOJI[r.mood] || '—'}</span>
              <div>
                <p className="text-sm font-semibold text-gray-800">{fmtDate(r.date)}</p>
                <p className="text-xs text-gray-500">{r.hours_worked}h worked · {r.tasks_completed} task{r.tasks_completed !== 1 ? 's' : ''} completed</p>
              </div>
            </div>
            {r.reviewed ? (
              <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium shrink-0">
                <CheckCircle2 size={11} /> Reviewed
              </span>
            ) : (
              <span className="text-xs text-gray-400 shrink-0">Pending review</span>
            )}
          </div>
          {r.notes && (
            <p className="text-xs text-gray-600 bg-gray-50 rounded-xl px-3 py-2 mt-2">{r.notes}</p>
          )}
          {r.blockers?.length > 0 && (
            <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
              <AlertTriangle size={11} /> Blockers: {r.blockers.join(', ')}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Repository tab ───────────────────────────────────────────────────────────

function commitDay(iso: string) {
  if (!iso) return ''
  return iso.split('T')[0]  // "2024-03-15"
}

function fmtDay(day: string) {
  if (!day) return ''
  return new Date(day + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

const RepositoryTab: React.FC<{ commits: any[]; repos: any[]; totalCommits: number }> = ({
  commits, repos, totalCommits,
}) => {
  const [dayFilter, setDayFilter] = useState('')

  if (!totalCommits && !repos.length) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-gray-400">
        <GitBranch size={32} className="mb-2 text-gray-200" />
        <p className="text-sm">No repository activity found</p>
        <p className="text-xs mt-1">Projects must have a GitHub repo configured</p>
      </div>
    )
  }

  const maxCommits = Math.max(...repos.map((r: any) => r.commits || 0), 1)

  // Unique days sorted newest-first
  const uniqueDays = Array.from(new Set(commits.map((c: any) => commitDay(c.date)).filter(Boolean))).sort().reverse()

  const filteredCommits = dayFilter
    ? commits.filter((c: any) => commitDay(c.date) === dayFilter)
    : commits

  // Group filtered commits by day
  const grouped: Record<string, any[]> = {}
  filteredCommits.forEach((c: any) => {
    const d = commitDay(c.date) || 'Unknown'
    if (!grouped[d]) grouped[d] = []
    grouped[d].push(c)
  })
  const groupedDays = Object.keys(grouped).sort().reverse()

  return (
    <div className="space-y-5">
      {/* Repos contributed */}
      {repos.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <GitBranch size={14} className="text-gray-400" /> Repositories Contributed
          </h3>
          <div className="space-y-3">
            {repos.map((r: any, i: number) => {
              const pct = Math.round((r.commits / maxCommits) * 100)
              return (
                <div key={i} className="flex items-center gap-3">
                  <p className="text-xs text-gray-700 font-medium w-48 truncate" title={r.repo}>
                    {repoName(r.repo)}
                  </p>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-16 text-right">{r.commits} commit{r.commits !== 1 ? 's' : ''}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Commit list */}
      {commits.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          {/* Header + day filter */}
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <GitCommit size={14} className="text-gray-400" />
              Commit History
              <span className="bg-violet-100 text-violet-700 text-xs font-bold px-2 py-0.5 rounded-lg">
                {filteredCommits.length}{dayFilter ? '' : ' total'}
              </span>
            </h3>
            <div className="flex items-center gap-2">
              <Calendar size={13} className="text-gray-400 shrink-0" />
              <select
                value={dayFilter}
                onChange={e => setDayFilter(e.target.value)}
                className="text-xs border border-gray-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-gray-600"
              >
                <option value="">All days</option>
                {uniqueDays.map(d => (
                  <option key={d} value={d}>
                    {fmtDay(d)} ({commits.filter((c: any) => commitDay(c.date) === d).length})
                  </option>
                ))}
              </select>
              {dayFilter && (
                <button
                  onClick={() => setDayFilter('')}
                  className="text-xs text-violet-600 hover:text-violet-800 font-medium"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {filteredCommits.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No commits on this day.</p>
          ) : (
            <div className="space-y-4">
              {groupedDays.map(day => (
                <div key={day}>
                  {/* Day separator */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg">
                      {fmtDay(day)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {grouped[day].length} commit{grouped[day].length !== 1 ? 's' : ''}
                    </span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>

                  <div className="space-y-1">
                    {grouped[day].map((c: any, i: number) => (
                      <div key={i} className="flex items-start gap-2.5 py-2 border-b border-gray-50 last:border-0">
                        {c.avatar_url ? (
                          <img src={c.avatar_url} alt="" className="w-6 h-6 rounded-full shrink-0 mt-0.5" />
                        ) : (
                          <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                            <User size={12} className="text-gray-400" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded">{c.sha}</span>
                            <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded truncate max-w-[120px]" title={c.repo}>
                              {repoName(c.repo)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-700 mt-0.5 line-clamp-2">{c.message}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {new Date(c.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export const UserProfilePage: React.FC<{ userId: string }> = ({ userId }) => {
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')
  const [tab, setTab]       = useState<'overview' | 'projects' | 'teams' | 'tasks' | 'reports' | 'repository'>('overview')

  useEffect(() => {
    setLoading(true)
    setError('')
    api.get(`/users/${userId}/profile`)
      .then(r => setProfile(r.data))
      .catch(e => setError(e?.response?.data?.detail || 'Failed to load profile'))
      .finally(() => setLoading(false))
  }, [userId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="animate-spin text-blue-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400">
        <AlertTriangle size={32} className="mb-2 text-red-300" />
        <p className="text-sm font-medium text-red-500">{error}</p>
        <button onClick={() => navigate(-1 as any)} className="mt-3 text-xs text-blue-600 hover:underline flex items-center gap-1">
          <ArrowLeft size={12} /> Go back
        </button>
      </div>
    )
  }

  if (!profile) return null

  const role = profile.primary_role || 'employee'
  const stats = profile.stats || {}

  const TABS = [
    { key: 'overview',    label: 'Overview' },
    { key: 'projects',    label: `Projects (${profile.projects?.length || 0})` },
    { key: 'teams',       label: `Teams (${profile.teams?.length || 0})` },
    { key: 'tasks',       label: `Tasks (${profile.tasks?.length || 0})` },
    { key: 'reports',     label: `Reports (${profile.reports?.length || 0})` },
    { key: 'repository',  label: `Repository (${stats.total_commits || 0})` },
  ] as const

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Back */}
      <button
        onClick={() => window.history.back()}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
      >
        <ArrowLeft size={14} /> Back
      </button>

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start gap-5 flex-wrap">
          {/* Avatar */}
          <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${AVATAR_COLORS[role] || AVATAR_COLORS.employee} flex items-center justify-center text-white font-bold text-2xl shadow-md shrink-0`}>
            {profile.full_name?.[0]?.toUpperCase()}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{profile.full_name}</h1>
              <span className={`text-xs px-2.5 py-1 rounded-lg font-medium border ${ROLE_COLORS[role] || ROLE_COLORS.employee}`}>
                {role.replace('_', ' ')}
              </span>
              {profile.is_active !== false ? (
                <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" /> Active
                </span>
              ) : (
                <span className="text-xs text-red-400 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-red-400 rounded-full" /> Inactive
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-4 mt-2">
              <span className="text-sm text-gray-500 flex items-center gap-1.5">
                <Mail size={13} className="text-gray-400" /> {profile.email}
              </span>
              {profile.phone && (
                <span className="text-sm text-gray-500 flex items-center gap-1.5">
                  <Phone size={13} className="text-gray-400" /> {profile.phone}
                </span>
              )}
              {profile.department && (
                <span className="text-sm text-gray-500 flex items-center gap-1.5">
                  <Building2 size={13} className="text-gray-400" /> {profile.department}
                </span>
              )}
            </div>
          </div>

          {/* Email action */}
          <a
            href={`mailto:${profile.email}`}
            className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-sm font-medium hover:bg-blue-100 transition-colors shrink-0"
          >
            <Mail size={13} /> Send Email
          </a>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          icon={<CheckCircle2 size={18} className="text-emerald-600" />}
          label="Total Tasks"
          value={stats.total_tasks ?? 0}
          color="bg-emerald-50"
        />
        <StatCard
          icon={<Briefcase size={18} className="text-blue-600" />}
          label="Active Projects"
          value={stats.active_projects ?? 0}
          color="bg-blue-50"
        />
        <StatCard
          icon={<Users size={18} className="text-teal-600" />}
          label="Teams"
          value={stats.total_teams ?? 0}
          color="bg-teal-50"
        />
        <StatCard
          icon={<GitCommit size={18} className="text-violet-600" />}
          label="Commits"
          value={stats.total_commits ?? 0}
          color="bg-violet-50"
        />
        <StatCard
          icon={<Clock size={18} className="text-amber-600" />}
          label="Avg Hours/Day"
          value={stats.avg_hours ?? 0}
          color="bg-amber-50"
        />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 bg-gray-100 p-1.5 rounded-2xl w-fit">
        {TABS.map(t => (
          <Tab key={t.key} active={tab === t.key} onClick={() => setTab(t.key as any)}>
            {t.label}
          </Tab>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === 'overview'   && <OverviewTab profile={profile} />}
        {tab === 'projects'   && <ProjectsTab projects={profile.projects || []} />}
        {tab === 'teams'      && <TeamsTab teams={profile.teams || []} />}
        {tab === 'tasks'      && <TasksTab tasks={profile.tasks || []} />}
        {tab === 'reports'    && <ReportsTab reports={profile.reports || []} />}
        {tab === 'repository' && (
          <RepositoryTab
            commits={profile.commits || []}
            repos={profile.repos_contributed || []}
            totalCommits={stats.total_commits || 0}
          />
        )}
      </div>
    </div>
  )
}
