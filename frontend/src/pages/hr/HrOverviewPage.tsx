import React, { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Lock, Users, UserPlus, UserMinus, Plane, CalendarX, Laptop, Briefcase,
  MessageSquareWarning, Cake, Award, AlertTriangle, Network, Download, Layers,
} from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { RootState } from '../../store'
import { fetchHrDashboardRequest, fetchHrAnalyticsRequest } from '../../store/slices/hrDashboardSlice'
import { fetchOrgChartRequest, fetchDesignationsRequest, Designation } from '../../store/slices/hrOrgSlice'
import { usePermissions } from '../../hooks/usePermissions'
import { OrgChartTree } from '../../components/hr/OrgChartTree'
import { IntegrationsPanel } from '../../components/hr/IntegrationsPanel'
import { DataTable, Column, useToast } from '../../components/shared'
import { api } from '../../utils/api'

type Tab = 'overview' | 'analytics' | 'departments' | 'org-chart' | 'reports' | 'integrations'

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'departments', label: 'Designations' },
  { key: 'org-chart', label: 'Org chart' },
  { key: 'reports', label: 'Reports' },
  { key: 'integrations', label: 'Integrations' },
]

// Chart palette. Drawn from the light-mode vocabulary index.css remaps, so the
// charts adapt with the rest of the app rather than staying stuck in one theme.
const COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#64748b']

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

const Stat: React.FC<{
  icon: React.ReactNode; value: React.ReactNode; label: string
  sub?: string; tone?: 'default' | 'warn' | 'danger'; onClick?: () => void; delay?: string
}> = ({ icon, value, label, sub, tone = 'default', onClick, delay }) => (
  <div
    onClick={onClick}
    className={`bg-white rounded-2xl shadow-sm border p-4 animate-fade-in-up transition-all ${
      onClick ? 'cursor-pointer hover:shadow-md hover:border-blue-100' : ''
    } ${tone === 'danger' ? 'border-rose-200' : tone === 'warn' ? 'border-amber-200' : 'border-gray-100'}`}
    style={{ animationDelay: delay }}
  >
    <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2.5 ${
      tone === 'danger' ? 'bg-rose-50' : tone === 'warn' ? 'bg-amber-50' : 'bg-blue-50'
    }`}>{icon}</div>
    <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
    <p className="text-sm text-gray-600 mt-0.5">{label}</p>
    {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
  </div>
)

const Panel: React.FC<{ title: string; children: React.ReactNode; action?: React.ReactNode }> = ({
  title, children, action,
}) => (
  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 animate-fade-in-up">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      {action}
    </div>
    {children}
  </div>
)

export const HrOverviewPage: React.FC = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const toast = useToast()
  const { can } = usePermissions()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'overview'

  const { dashboard, workforce, recruitment, attendance, leave, performance, attrition,
          isLoading, analyticsLoading, error } = useSelector((s: RootState) => s.hrDashboard)
  const { chart, chartLoading, designations, designationsLoading } =
    useSelector((s: RootState) => s.hrOrg)

  useEffect(() => {
    if (can('analytics.hr_read')) dispatch(fetchHrDashboardRequest())
  }, [can, dispatch])

  useEffect(() => {
    if (tab === 'analytics' && can('analytics.hr_read')) dispatch(fetchHrAnalyticsRequest())
    if (tab === 'org-chart') dispatch(fetchOrgChartRequest())
    if (tab === 'departments') dispatch(fetchDesignationsRequest())
  }, [tab, can, dispatch])

  useEffect(() => { if (error) toast.error(error) }, [error, toast])

  if (!can('analytics.hr_read') && !can('employee.read')) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 animate-fade-in">
        <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
          <Lock size={24} className="text-gray-300" />
        </div>
        <p className="text-base font-semibold text-gray-600">Access Restricted</p>
        <p className="text-sm mt-1">HR is available to HR staff and executives</p>
      </div>
    )
  }

  const s = dashboard?.summary

  const download = async (report: string, format: 'csv' | 'xlsx') => {
    try {
      const res = await api.get(`/hr/reports/${report}`, {
        params: { format }, responseType: 'blob',
      })
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${report}.${format}`; a.click()
      URL.revokeObjectURL(url)
      toast.success(`${report} exported`)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Export failed.')
    }
  }

  const designationCols: Column<Designation>[] = [
    {
      key: 'title', header: 'Designation',
      render: d => (
        <div>
          <p className="text-sm font-medium text-gray-900">{d.title}</p>
          <p className="text-xs text-gray-400">{d.department_name || 'Company-wide'}</p>
        </div>
      ),
    },
    { key: 'level', header: 'Level', render: d => <span className="text-sm text-gray-600">L{d.level}</span> },
    { key: 'career_level', header: 'Track', render: d => <span className="text-sm text-gray-600 capitalize">{d.career_level}</span> },
    { key: 'employee_count', header: 'Headcount', render: d => <span className="text-sm text-gray-800">{d.employee_count}</span> },
    {
      key: 'salary_band', header: 'Salary band',
      render: d => d.salary_band
        ? <span className="text-sm text-gray-700">
            {d.salary_band.currency} {(d.salary_band.min / 100000).toFixed(1)}L–{(d.salary_band.max / 100000).toFixed(1)}L
          </span>
        : <span className="text-xs text-gray-300">Restricted</span>,
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">HR Overview</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Workforce, structure and reporting lines
            {dashboard?.cached && <span className="text-gray-400"> · cached</span>}
          </p>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setParams({ tab: t.key })}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              tab === t.key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}>{t.label}</button>
        ))}
      </div>

      {/* ── Overview: the §2 counters ─────────────────────────────────────── */}
      {tab === 'overview' && (
        isLoading && !dashboard ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 animate-pulse">
            {Array.from({ length: 12 }).map((_, i) => <div key={i} className="h-28 skeleton rounded-2xl" />)}
          </div>
        ) : s ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <Stat icon={<Users size={15} className="text-blue-600" />} value={s.total_employees}
                label="Employees" sub={`${s.active_employees} active · ${s.on_probation} probation`}
                onClick={() => navigate('/hr/employees')} delay="0s" />
              <Stat icon={<UserPlus size={15} className="text-blue-600" />} value={s.new_employees}
                label="New this month" sub={`${s.joining_this_month} joining`} delay="0.03s" />
              <Stat icon={<UserMinus size={15} className="text-blue-600" />} value={s.leaving_this_month}
                label="Leaving" sub="Notice + exits" delay="0.06s" />
              <Stat icon={<Plane size={15} className="text-blue-600" />} value={s.employees_on_leave}
                label="On leave today" onClick={() => navigate('/hr/time?tab=leave')} delay="0.09s" />
              <Stat icon={<CalendarX size={15} className={s.absent_today ? 'text-amber-600' : 'text-blue-600'} />}
                value={s.absent_today} label="Absent today" tone={s.absent_today ? 'warn' : 'default'}
                sub={`${s.present_today} present`} onClick={() => navigate('/hr/time')} delay="0.12s" />
              <Stat icon={<Laptop size={15} className="text-blue-600" />} value={s.working_remotely}
                label="Remote / hybrid" delay="0.15s" />

              <Stat icon={<Briefcase size={15} className="text-blue-600" />} value={s.open_positions}
                label="Open positions" onClick={() => navigate('/hr/recruitment')} delay="0.18s" />
              <Stat icon={<Users size={15} className="text-blue-600" />} value={s.candidates_in_interview}
                label="In interview" onClick={() => navigate('/hr/recruitment?tab=pipeline')} delay="0.21s" />
              <Stat icon={<Award size={15} className="text-blue-600" />} value={s.offers_pending}
                label="Offers pending" onClick={() => navigate('/hr/recruitment?tab=offers')} delay="0.24s" />
              <Stat icon={<Plane size={15} className={s.pending_leave_approvals ? 'text-amber-600' : 'text-blue-600'} />}
                value={s.pending_leave_approvals} label="Leave approvals"
                tone={s.pending_leave_approvals ? 'warn' : 'default'}
                onClick={() => navigate('/hr/time?tab=approvals')} delay="0.27s" />
              <Stat icon={<MessageSquareWarning size={15} className={s.sla_breached_tickets ? 'text-rose-600' : 'text-blue-600'} />}
                value={s.open_tickets} label="Open tickets"
                tone={s.sla_breached_tickets ? 'danger' : 'default'}
                sub={s.sla_breached_tickets ? `${s.sla_breached_tickets} SLA breached` : undefined}
                onClick={() => navigate('/hr/helpdesk')} delay="0.3s" />
              <Stat icon={<AlertTriangle size={15} className={s.attendance_anomalies ? 'text-amber-600' : 'text-blue-600'} />}
                value={s.attendance_anomalies} label="Attendance anomalies"
                tone={s.attendance_anomalies ? 'warn' : 'default'} delay="0.33s" />
            </div>

            {/* §2 asks for these; neither module exists yet, so say so rather
                than render a zero that reads as real data. */}
            <div className="flex flex-wrap gap-3 text-xs text-gray-400">
              <span className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
                Expense approvals — module not built (§21)
              </span>
              <span className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
                Payroll — {s.payroll_status === 'not_connected' ? 'Keka not connected (§15)' : s.payroll_status}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <Panel title="Department overview">
                  {dashboard.departments.length ? (
                    <div className="space-y-3">
                      {dashboard.departments.map(d => (
                        <div key={d.id}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-gray-700">{d.name}</span>
                            <span className="text-xs text-gray-500">
                              {d.headcount} people
                              {d.attendance_rate != null && ` · ${d.attendance_rate}% in today`}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${d.attendance_rate ?? 0}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-gray-400">No departments with headcount yet.</p>}
                </Panel>
              </div>

              <Panel title="Coming up">
                <div className="space-y-3">
                  {dashboard.upcoming_birthdays.slice(0, 4).map(p => (
                    <div key={`b-${p.user_id}`} className="flex items-center gap-2.5">
                      <Cake size={13} className="text-pink-500 shrink-0" />
                      <span className="text-sm text-gray-700 truncate flex-1">{p.full_name}</span>
                      <span className="text-xs text-gray-400">{fmtDate(p.date)}</span>
                    </div>
                  ))}
                  {dashboard.upcoming_anniversaries.slice(0, 4).map(p => (
                    <div key={`a-${p.user_id}`} className="flex items-center gap-2.5">
                      <Award size={13} className="text-amber-500 shrink-0" />
                      <span className="text-sm text-gray-700 truncate flex-1">
                        {p.full_name} {p.years ? `· ${p.years}y` : ''}
                      </span>
                      <span className="text-xs text-gray-400">{fmtDate(p.date)}</span>
                    </div>
                  ))}
                  {!dashboard.upcoming_birthdays.length && !dashboard.upcoming_anniversaries.length && (
                    <p className="text-sm text-gray-400">Nothing in the next 30 days.</p>
                  )}
                </div>
              </Panel>
            </div>
          </div>
        ) : null
      )}

      {/* ── Analytics (§26) ───────────────────────────────────────────────── */}
      {tab === 'analytics' && (
        analyticsLoading && !workforce ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-pulse">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-72 skeleton rounded-2xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {workforce && (
              <Panel title="Headcount by department">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={workforce.by_department}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#2563eb" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
            )}

            {workforce && (
              <Panel title="Tenure distribution">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={workforce.tenure_distribution} dataKey="count" nameKey="band"
                      cx="50%" cy="50%" outerRadius={80} label={(e: any) => e.band}>
                      {workforce.tenure_distribution.map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Panel>
            )}

            {attendance && (
              <Panel title={`Attendance trend · last ${attendance.days} days`}>
                <div className="flex gap-4 mb-3 text-xs">
                  <span className="text-gray-500">Rate <b className="text-gray-800">{attendance.attendance_rate ?? '—'}%</b></span>
                  <span className="text-gray-500">Absenteeism <b className="text-gray-800">{attendance.absenteeism_rate ?? '—'}%</b></span>
                  <span className="text-gray-500">Overtime <b className="text-gray-800">{attendance.overtime_hours}h</b></span>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={attendance.daily_trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="present" stroke="#059669" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="absent" stroke="#dc2626" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="leave" stroke="#d97706" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Panel>
            )}

            {recruitment && (
              <Panel title="Recruitment funnel">
                <div className="flex gap-4 mb-3 text-xs">
                  <span className="text-gray-500">Time to hire <b className="text-gray-800">
                    {recruitment.time_to_hire_days?.avg ?? '—'}d</b></span>
                  <span className="text-gray-500">Offer acceptance <b className="text-gray-800">
                    {recruitment.offer_acceptance_rate ?? '—'}%</b></span>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={Object.entries(recruitment.funnel).map(([stage, count]) => ({
                    stage: stage.replace(/_/g, ' '), count,
                  }))} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="stage" width={90} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#7c3aed" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
            )}

            {leave && (
              <Panel title="Leave utilization by type">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={leave.by_type}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="leave_type" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="allocated" fill="#cbd5e1" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="used" fill="#0891b2" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
            )}

            {performance && (
              <Panel title="Performance distribution">
                <div className="flex gap-4 mb-3 text-xs">
                  <span className="text-gray-500">Average composite <b className="text-gray-800">
                    {performance.average_composite ?? '—'}</b></span>
                  <span className="text-gray-500">Goals completed <b className="text-gray-800">
                    {performance.goals.completed}/{performance.goals.total}</b></span>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={performance.score_distribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="band" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#059669" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
            )}

            {attrition && (
              <Panel title={`Attrition · last ${attrition.months} months`}>
                <div className="flex gap-4 mb-3 text-xs">
                  <span className="text-gray-500">Rate <b className="text-gray-800">{attrition.attrition_rate ?? '—'}%</b></span>
                  <span className="text-gray-500">Exits <b className="text-gray-800">{attrition.total_exits}</b></span>
                  <span className="text-gray-500">Headcount <b className="text-gray-800">{attrition.current_headcount}</b></span>
                </div>
                {attrition.monthly_trend.length ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={attrition.monthly_trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Line type="monotone" dataKey="exits" stroke="#dc2626" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-gray-400 py-8 text-center">No exits recorded yet.</p>
                )}
              </Panel>
            )}
          </div>
        )
      )}

      {tab === 'integrations' && (
        can('integration.read')
          ? <div className="animate-fade-in-up"><IntegrationsPanel /></div>
          : <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
              <p className="text-sm text-gray-500">Integration settings require the integration.read permission.</p>
            </div>
      )}

      {tab === 'departments' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in-up">
          <DataTable columns={designationCols} data={designations} loading={designationsLoading}
            emptyMessage="No designations defined yet" />
        </div>
      )}

      {tab === 'org-chart' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 animate-fade-in-up">
          <OrgChartTree
            roots={chart?.roots || []} total={chart?.total || 0} orphaned={chart?.orphaned || 0}
            loading={chartLoading}
            onSelect={node => { if (node.employee_id) navigate(`/hr/employees/${node.employee_id}`) }}
          />
        </div>
      )}

      {/* ── Reports (§39) ─────────────────────────────────────────────────── */}
      {tab === 'reports' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-fade-in-up">
          {[
            { key: 'employees', label: 'Employee report', icon: <Users size={15} /> },
            { key: 'attendance', label: 'Attendance report', icon: <CalendarX size={15} /> },
            { key: 'leave', label: 'Leave report', icon: <Plane size={15} /> },
            { key: 'recruitment', label: 'Recruitment report', icon: <Briefcase size={15} /> },
            { key: 'performance', label: 'Performance report', icon: <Award size={15} /> },
            { key: 'documents', label: 'Documents report', icon: <Layers size={15} /> },
            { key: 'tickets', label: 'Helpdesk report', icon: <MessageSquareWarning size={15} /> },
            { key: 'onboarding', label: 'Onboarding report', icon: <UserPlus size={15} /> },
            { key: 'departments', label: 'Department report', icon: <Network size={15} /> },
          ].map(r => (
            <div key={r.key} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center mb-2.5 text-blue-600">
                {r.icon}
              </div>
              <p className="text-sm font-medium text-gray-900 mb-3">{r.label}</p>
              <div className="flex gap-2">
                <button onClick={() => download(r.key, 'csv')}
                  className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-1">
                  <Download size={11} /> CSV
                </button>
                <button onClick={() => download(r.key, 'xlsx')}
                  className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-1">
                  <Download size={11} /> Excel
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
