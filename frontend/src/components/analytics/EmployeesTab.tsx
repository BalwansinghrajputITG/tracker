import React, { useEffect, useState, useCallback } from 'react'
import {
  Users, Search, AlertTriangle, ChevronLeft, ChevronRight,
  Zap, Building2, TrendingUp, TrendingDown, Activity,
  CheckSquare, Smile, FolderOpen, FileText, Github, Trophy,
} from 'lucide-react'
import { api } from '../../utils/api'
import type { EmployeeRow, EmployeeDetail } from './analyticsTypes'
import {
  STATUS_CFG, MOOD_CFG, MODE_CFG,
  HBar, StatPill, ColChart, DonutMini, Skeleton,
} from './analyticsHelpers'

/* ═══════════════════════════════════════════════════════════
   EMPLOYEES TAB
═══════════════════════════════════════════════════════════ */

export function EmployeesTab({ range }: { range: number }) {
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
