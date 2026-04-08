import React, { useEffect, useState } from 'react'
import {
  TrendingUp, CheckSquare, FolderOpen, FileText,
  Zap, AlertTriangle, Target, Activity, BarChart3, Building2,
} from 'lucide-react'
import { api } from '../../utils/api'
import { CompanyData } from './analyticsTypes'
import { HBar, StatPill, ColChart, DonutMini } from './analyticsHelpers'

export function OverviewTab({ range }: { range: number }) {
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
