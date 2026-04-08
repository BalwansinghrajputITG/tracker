import React, { useEffect, useState, useCallback } from 'react'
import {
  CheckSquare, FolderOpen, Users, FileText,
  AlertTriangle, ChevronLeft, ChevronRight,
  Search, Filter, Calendar, GitCommit, GitBranch, Sparkles, RefreshCw,
  Lightbulb, TrendingDown, Github, Trophy,
} from 'lucide-react'
import { api } from '../../utils/api'
import { ProjectRow, ProjectDetail, AISuggestions } from './analyticsTypes'
import { HBar, StatPill, ColChart, DonutMini, Skeleton, STATUS_CFG, PRIORITY_CFG } from './analyticsHelpers'

export function ProjectsTab({ range }: { range: number }) {
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

export function ProjectDetailView({ project, detail, loading, onBack, range, aiData, aiLoading, onRefreshAI }: {
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
