import React, { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  TrendingUp, AlertTriangle, Users, FileCheck,
  FolderOpen, BarChart3, Sparkles, ArrowRight,
  ShieldCheck, Layers, Clock, Zap, Target,
  CheckCircle2, XCircle, Activity, Building2,
} from 'lucide-react'
import { RootState } from '../../store'
import { fetchDashboardRequest } from '../../store/slices/dashboardSlice'
import { openChatbot } from '../../store/slices/chatbotSlice'
import { navigate } from '../../pages/AppLayout'

/* ─────────────────────────────────────────── helpers ── */

function healthColor(score: number) {
  if (score >= 80) return { text: 'text-emerald-600', bg: 'bg-emerald-500', ring: 'stroke-emerald-500', light: 'bg-emerald-50', border: 'border-emerald-200' }
  if (score >= 55) return { text: 'text-amber-600',   bg: 'bg-amber-500',   ring: 'stroke-amber-500',   light: 'bg-amber-50',   border: 'border-amber-200'  }
  return               { text: 'text-red-600',         bg: 'bg-red-500',     ring: 'stroke-red-500',     light: 'bg-red-50',     border: 'border-red-200'    }
}

function priorityUrgency(daysOverdue: number) {
  if (daysOverdue >= 7) return { label: 'Critical', cls: 'bg-red-100 text-red-700 border-red-200' }
  if (daysOverdue >= 3) return { label: 'High',     cls: 'bg-orange-100 text-orange-700 border-orange-200' }
  if (daysOverdue >= 1) return { label: 'Medium',   cls: 'bg-amber-100 text-amber-700 border-amber-200' }
  return                       { label: 'At Risk',  cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' }
}

/* ─────────────────────────────────────────── sub-components ── */

const STATUS_CFG: Record<string, { dot: string; bar: string; label: string }> = {
  active:    { dot: 'bg-blue-500',    bar: 'bg-blue-500',    label: 'Active'    },
  planning:  { dot: 'bg-violet-400',  bar: 'bg-violet-400',  label: 'Planning'  },
  on_hold:   { dot: 'bg-amber-400',   bar: 'bg-amber-400',   label: 'On Hold'   },
  completed: { dot: 'bg-emerald-500', bar: 'bg-emerald-500', label: 'Completed' },
  cancelled: { dot: 'bg-gray-400',    bar: 'bg-gray-400',    label: 'Cancelled' },
}

interface KPICardProps {
  label: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  iconBg: string
  valueColor?: string
  badge?: { text: string; cls: string }
  delay?: number
  onClick?: () => void
}

const KPICard: React.FC<KPICardProps> = ({ label, value, sub, icon, iconBg, valueColor = 'text-gray-900', badge, delay = 0, onClick }) => (
  <div
    className={`bg-white rounded-2xl p-5 shadow-sm border border-gray-100 animate-fade-in-up transition-all duration-200 ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''}`}
    style={{ animationDelay: `${delay}s` }}
    onClick={onClick}
  >
    <div className="flex items-start justify-between mb-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
        {icon}
      </div>
      {badge && (
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${badge.cls}`}>{badge.text}</span>
      )}
    </div>
    <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
    <p className="text-sm text-gray-500 mt-0.5 font-medium">{label}</p>
    {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
  </div>
)

/* Ring gauge — fills from 0 to score% */
const HealthRing: React.FC<{ score: number }> = ({ score }) => {
  const r = 44
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const colors = healthColor(score)
  return (
    <div className="relative w-28 h-28">
      <svg viewBox="0 0 100 100" className="w-28 h-28 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#f1f5f9" strokeWidth="9" />
        <circle
          cx="50" cy="50" r={r} fill="none"
          className={colors.ring}
          strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
          style={{ transition: 'stroke-dasharray 1s cubic-bezier(.4,0,.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className={`text-2xl font-black ${colors.text}`}>{score}</p>
        <p className="text-xs text-gray-400 font-medium">/ 100</p>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────── main component ── */

export const CEODashboard: React.FC = () => {
  const dispatch = useDispatch()
  const { data, isLoading } = useSelector((s: RootState) => s.dashboard)
  const { user } = useSelector((s: RootState) => s.auth)

  useEffect(() => {
    dispatch(fetchDashboardRequest('ceo'))
    const interval = setInterval(() => dispatch(fetchDashboardRequest('ceo')), 60_000)
    return () => clearInterval(interval)
  }, [])

  const summary      = data?.summary          || {}
  const delayed      = data?.delayed_projects || []
  const statusMap    = data?.projects_by_status || {}
  const teamActivity = data?.team_activity_last_7_days || []
  const deptData     = data?.department_headcount || []

  const totalProjects = (Object.values(statusMap) as number[]).reduce((s, c) => s + c, 0) || 1
  const healthScore   = summary.health_score ?? 0
  const hc            = healthColor(healthScore)

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  if (isLoading && !data?.summary) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="h-36 skeleton rounded-2xl" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => <div key={i} className="h-28 skeleton rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => <div key={i} className="h-48 skeleton rounded-2xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* ── Hero Command Bar ─────────────────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 rounded-2xl p-6 text-white shadow-xl animate-fade-in-up relative overflow-hidden">
        {/* decorative blobs */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-48 h-48 bg-indigo-500/10 rounded-full translate-y-1/2 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-center gap-5">
            <HealthRing score={healthScore} />
            <div>
              <p className="text-blue-300 text-sm font-medium">{greeting()}, {user?.full_name?.split(' ')[0] || 'Executive'}</p>
              <h1 className="text-2xl font-black mt-0.5 leading-tight">Executive Overview</h1>
              <p className="text-blue-200/70 text-sm mt-1">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
              <div className="flex items-center gap-2 mt-3">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                  healthScore >= 80 ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  : healthScore >= 55 ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'bg-red-500/20 border-red-500/40 text-red-300'
                }`}>
                  <ShieldCheck size={11} />
                  {healthScore >= 80 ? 'Healthy' : healthScore >= 55 ? 'Needs Attention' : 'At Risk'} — Org Health Score
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 md:flex-col md:items-end">
            <button
              onClick={() => dispatch(openChatbot())}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur border border-white/20 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 hover:scale-105"
            >
              <Sparkles size={15} className="text-blue-300" />
              AI Insights
            </button>
            <button
              onClick={() => navigate('/analytics')}
              className="flex items-center gap-2 bg-blue-600/70 hover:bg-blue-600 backdrop-blur border border-blue-500/40 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 hover:scale-105"
            >
              <BarChart3 size={15} />
              Deep Analytics
            </button>
          </div>
        </div>

        {/* mini stat strip */}
        <div className="relative mt-5 pt-4 border-t border-white/10 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Avg Progress',     value: `${summary.avg_project_progress ?? 0}%`,   icon: <Target size={13} /> },
            { label: 'Tasks Completed',  value: `${summary.completed_tasks ?? 0}`,          icon: <CheckCircle2 size={13} /> },
            { label: 'Blocked Tasks',    value: `${summary.blocked_tasks ?? 0}`,            icon: <XCircle size={13} /> },
            { label: 'Active Teams',     value: `${summary.total_teams ?? 0}`,              icon: <Building2 size={13} /> },
          ].map(({ label, value, icon }) => (
            <div key={label} className="flex items-center gap-2.5">
              <span className="text-blue-300/70">{icon}</span>
              <div>
                <p className="text-white font-bold text-sm leading-tight">{value}</p>
                <p className="text-blue-300/60 text-xs">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── KPI Cards ────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          label="Active Projects"
          value={summary.total_active_projects ?? '--'}
          sub={`${summary.avg_project_progress ?? 0}% avg progress`}
          icon={<Layers size={18} className="text-blue-600" />}
          iconBg="bg-blue-50"
          delay={0.05}
          onClick={() => navigate('/projects')}
        />
        <KPICard
          label="Delayed Projects"
          value={summary.delayed_projects ?? '--'}
          sub="Require immediate action"
          icon={<AlertTriangle size={18} className="text-red-500" />}
          iconBg="bg-red-50"
          valueColor={(summary.delayed_projects ?? 0) > 0 ? 'text-red-600' : 'text-gray-900'}
          badge={(summary.delayed_projects ?? 0) > 0 ? { text: 'Action Needed', cls: 'bg-red-50 text-red-600 border-red-200' } : undefined}
          delay={0.10}
          onClick={() => navigate('/projects')}
        />
        <KPICard
          label="Total Employees"
          value={summary.total_employees ?? '--'}
          sub={`Across ${summary.total_teams ?? 0} active teams`}
          icon={<Users size={18} className="text-indigo-600" />}
          iconBg="bg-indigo-50"
          delay={0.15}
          onClick={() => navigate('/users')}
        />
        <KPICard
          label="Report Compliance"
          value={summary.report_compliance_today ?? '--'}
          sub={`${summary.reports_submitted_today ?? 0} / ${summary.total_employees ?? 0} submitted`}
          icon={<FileCheck size={18} className={(summary.compliance_rate_value ?? 0) >= 80 ? 'text-emerald-600' : 'text-amber-600'} />}
          iconBg={(summary.compliance_rate_value ?? 0) >= 80 ? 'bg-emerald-50' : 'bg-amber-50'}
          valueColor={(summary.compliance_rate_value ?? 0) >= 80 ? 'text-emerald-600' : 'text-amber-600'}
          delay={0.20}
          onClick={() => navigate('/reports')}
        />
        <KPICard
          label="Total Tasks"
          value={summary.total_tasks ?? '--'}
          sub={`${summary.overdue_tasks ?? 0} overdue`}
          icon={<Activity size={18} className="text-violet-600" />}
          iconBg="bg-violet-50"
          badge={(summary.overdue_tasks ?? 0) > 0 ? { text: `${summary.overdue_tasks} overdue`, cls: 'bg-orange-50 text-orange-600 border-orange-200' } : undefined}
          delay={0.25}
          onClick={() => navigate('/tasks')}
        />
      </div>

      {/* ── Middle Row: Pipeline + Delayed ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Project Pipeline */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-gray-100 animate-fade-in-up" style={{ animationDelay: '0.30s' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center">
                <FolderOpen size={14} className="text-blue-600" />
              </div>
              <h3 className="text-sm font-semibold text-gray-800">Project Pipeline</h3>
            </div>
            <button onClick={() => navigate('/projects')} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 group">
              View all <ArrowRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {/* Donut */}
          <div className="flex items-center gap-5 mb-4">
            <div className="relative w-24 h-24 shrink-0">
              <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
                <circle r="13" cx="18" cy="18" fill="transparent" stroke="#f1f5f9" strokeWidth="4" />
                {(() => {
                  const segs = Object.entries(statusMap)
                  let off = 25
                  return segs.map(([status, count]) => {
                    const cfg = STATUS_CFG[status] || { dot: 'bg-gray-400', bar: 'bg-gray-400', label: status }
                    const pct = ((count as number) / totalProjects) * 100
                    const strokeColor = cfg.bar.replace('bg-', '')
                    const colorMap: Record<string, string> = {
                      'blue-500': '#3b82f6', 'violet-400': '#a78bfa',
                      'amber-400': '#fbbf24', 'emerald-500': '#22c55e', 'gray-400': '#9ca3af',
                    }
                    const el = (
                      <circle key={status} r="13" cx="18" cy="18" fill="transparent"
                        stroke={colorMap[strokeColor] || '#9ca3af'}
                        strokeWidth="4"
                        strokeDasharray={`${pct} ${100 - pct}`}
                        strokeDashoffset={-off}
                        style={{ transition: 'stroke-dasharray 0.8s ease' }}
                      />
                    )
                    off += pct
                    return el
                  })
                })()}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-lg font-black text-gray-800">{totalProjects}</p>
                <p className="text-xs text-gray-400">total</p>
              </div>
            </div>
            <div className="flex-1 space-y-1.5">
              {Object.entries(statusMap).map(([status, count]) => {
                const cfg = STATUS_CFG[status] || { dot: 'bg-gray-400', bar: 'bg-gray-400', label: status }
                const pct = Math.round(((count as number) / totalProjects) * 100)
                return (
                  <div key={status} className="flex items-center gap-2 text-xs">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                    <span className="text-gray-600 flex-1 capitalize">{cfg.label}</span>
                    <span className="text-gray-500">{count as number}</span>
                    <span className="text-gray-400 w-7 text-right">{pct}%</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Progress bar per status */}
          <div className="space-y-2.5 pt-3 border-t border-gray-50">
            {Object.entries(statusMap).map(([status, count], i) => {
              const cfg = STATUS_CFG[status] || { dot: 'bg-gray-400', bar: 'bg-gray-400', label: status }
              const pct = Math.round(((count as number) / totalProjects) * 100)
              return (
                <div key={status} className="animate-fade-in" style={{ animationDelay: `${0.30 + i * 0.05}s` }}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-500 capitalize">{cfg.label}</span>
                    <span className="font-semibold text-gray-700">{count as number}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${cfg.bar} transition-all duration-700`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* At Risk / Delayed Projects */}
        <div className="lg:col-span-3 bg-white rounded-2xl p-5 shadow-sm border border-red-100/60 animate-fade-in-up" style={{ animationDelay: '0.35s' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-red-50 rounded-lg flex items-center justify-center">
                <AlertTriangle size={14} className="text-red-500" />
              </div>
              <h3 className="text-sm font-semibold text-gray-800">At-Risk & Delayed</h3>
              <span className="ml-1 bg-red-100 text-red-600 text-xs px-1.5 py-0.5 rounded-full font-semibold">{delayed.length}</span>
            </div>
            <button onClick={() => navigate('/projects')} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 group">
              Manage <ArrowRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {delayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mb-3">
                <CheckCircle2 size={22} className="text-emerald-500" />
              </div>
              <p className="text-sm font-semibold text-gray-700">All projects on track</p>
              <p className="text-xs text-gray-400 mt-1">No delayed or at-risk projects</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {delayed.map((p: any, i: number) => {
                const urgency = priorityUrgency(p.days_overdue || 0)
                return (
                  <div
                    key={p.id}
                    className="p-3.5 bg-red-50/50 rounded-xl border border-red-100/80 hover:border-red-200 transition-colors animate-fade-in"
                    style={{ animationDelay: `${0.35 + i * 0.04}s` }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                        <Clock size={14} className="text-red-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm text-gray-800 truncate">{p.name}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border shrink-0 ${urgency.cls}`}>{urgency.label}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5">
                          <div className="flex-1 bg-red-100 rounded-full h-1.5 overflow-hidden">
                            <div className="h-full bg-red-400 rounded-full" style={{ width: `${p.progress_percentage || 0}%` }} />
                          </div>
                          <span className="text-xs text-red-600 font-bold shrink-0">{p.progress_percentage ?? 0}%</span>
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <p className="text-xs text-gray-500 truncate">{p.delay_reason || 'No reason provided'}</p>
                          <p className="text-xs text-gray-400 shrink-0 ml-2">
                            {p.days_overdue > 0 ? `${p.days_overdue}d overdue` : `Due ${new Date(p.due_date).toLocaleDateString()}`}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Row: Team Activity + Departments + Quick Actions ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Team Activity */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 animate-fade-in-up" style={{ animationDelay: '0.40s' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-teal-50 rounded-lg flex items-center justify-center">
                <Zap size={14} className="text-teal-600" />
              </div>
              <h3 className="text-sm font-semibold text-gray-800">Team Activity</h3>
            </div>
            <span className="text-xs text-gray-400">Last 7 days</span>
          </div>
          {teamActivity.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">No team data available</p>
          ) : (
            <div className="space-y-3">
              {teamActivity.slice(0, 6).map((t: any, i: number) => {
                const maxCount = Math.max(...teamActivity.map((x: any) => x.report_count), 1)
                const pct = (t.report_count / maxCount) * 100
                return (
                  <div key={t.team_id || i} className="animate-fade-in" style={{ animationDelay: `${0.40 + i * 0.04}s` }}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 bg-teal-100 rounded-md flex items-center justify-center text-teal-700 font-bold" style={{ fontSize: '9px' }}>
                          {(t.name || 'T')[0].toUpperCase()}
                        </div>
                        <span className="text-gray-700 font-medium truncate max-w-[90px]">{t.name || 'Unknown'}</span>
                      </div>
                      <span className="font-semibold text-gray-700 ml-1 shrink-0">{t.report_count} reports</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-teal-400 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <button onClick={() => navigate('/teams')} className="mt-4 w-full text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center justify-center gap-1 group py-1.5 rounded-lg hover:bg-teal-50 transition-colors">
            View all teams <ArrowRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        {/* Department Headcount */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 animate-fade-in-up" style={{ animationDelay: '0.45s' }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 bg-indigo-50 rounded-lg flex items-center justify-center">
              <Building2 size={14} className="text-indigo-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-800">Headcount by Dept.</h3>
          </div>
          {deptData.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">No department data</p>
          ) : (
            <div className="space-y-2.5">
              {(deptData as any[]).slice(0, 6).map((d: any, i: number) => {
                const maxC = Math.max(...(deptData as any[]).map((x: any) => x.count), 1)
                const pct = (d.count / maxC) * 100
                return (
                  <div key={d.department} className="animate-fade-in" style={{ animationDelay: `${0.45 + i * 0.04}s` }}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-700 font-medium truncate max-w-[120px]">{d.department || 'Unknown'}</span>
                      <span className="font-semibold text-gray-700 ml-1">{d.count}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-400 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <button onClick={() => navigate('/users')} className="mt-4 w-full text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center justify-center gap-1 group py-1.5 rounded-lg hover:bg-indigo-50 transition-colors">
            Manage workforce <ArrowRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        {/* Report Compliance + Quick Actions */}
        <div className="space-y-4">

          {/* Compliance card */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 animate-fade-in-up" style={{ animationDelay: '0.50s' }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 bg-emerald-50 rounded-lg flex items-center justify-center">
                <FileCheck size={14} className="text-emerald-600" />
              </div>
              <h3 className="text-sm font-semibold text-gray-800">Today's Compliance</h3>
            </div>
            <div className="flex items-end justify-between mb-2">
              <p className={`text-3xl font-black ${(summary.compliance_rate_value ?? 0) >= 80 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {summary.report_compliance_today ?? '--'}
              </p>
              <p className="text-xs text-gray-400 mb-1">{summary.reports_submitted_today ?? 0} / {summary.total_employees ?? 0}</p>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${(summary.compliance_rate_value ?? 0) >= 80 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                style={{ width: `${summary.compliance_rate_value ?? 0}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {(summary.total_employees ?? 0) - (summary.reports_submitted_today ?? 0)} employees haven't submitted
            </p>
          </div>

          {/* Quick Actions */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4 border border-blue-100 animate-fade-in-up" style={{ animationDelay: '0.55s' }}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Quick Navigation</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Reports',    href: '/reports',   icon: <FileCheck size={13} />,    color: 'text-blue-600 bg-blue-50 hover:bg-blue-100' },
                { label: 'Teams',     href: '/teams',     icon: <Users size={13} />,         color: 'text-teal-600 bg-teal-50 hover:bg-teal-100' },
                { label: 'Projects',  href: '/projects',  icon: <FolderOpen size={13} />,    color: 'text-violet-600 bg-violet-50 hover:bg-violet-100' },
                { label: 'Analytics', href: '/analytics', icon: <TrendingUp size={13} />,    color: 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100' },
              ].map(action => (
                <button
                  key={action.href}
                  onClick={() => navigate(action.href)}
                  className={`flex items-center gap-2 text-xs font-semibold px-3 py-2.5 rounded-xl transition-all duration-150 hover:scale-105 ${action.color}`}
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
