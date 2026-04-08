import React from 'react'
import {
  Users, Calendar, AlertTriangle, Loader2,
  GitCommitHorizontal, Tag, BarChart2, Clock, Shield,
} from 'lucide-react'
import { getGradient } from '../projectsConstants'

interface OverviewTabProps {
  selectedProject: any
  detailProject: any
  detailLoading: boolean
  contributorStats: any[]
  contributorStatsLoading: boolean
  contributorStatsError: string
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  selectedProject, detailProject, detailLoading,
  contributorStats, contributorStatsLoading, contributorStatsError,
}) => {
  return (
    <div className="space-y-5">
      {selectedProject.description && (
        <p className="text-sm text-gray-600 leading-relaxed">{selectedProject.description}</p>
      )}

      {/* Key stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: <BarChart2 size={14} className="text-blue-500" />, label: 'Progress', value: `${selectedProject.progress_percentage}%` },
          { icon: <Users size={14} className="text-indigo-500" />, label: 'Members', value: detailProject?.members?.length ?? selectedProject.member_ids?.length ?? 0 },
          { icon: <Calendar size={14} className="text-emerald-500" />, label: 'Start', value: selectedProject.start_date ? new Date(selectedProject.start_date).toLocaleDateString() : 'N/A' },
          { icon: <Clock size={14} className="text-amber-500" />, label: 'Due Date', value: selectedProject.due_date ? new Date(selectedProject.due_date).toLocaleDateString() : 'N/A' },
        ].map(({ icon, label, value }) => (
          <div key={label} className="bg-gray-50 rounded-2xl p-3.5 border border-gray-100">
            <div className="flex items-center gap-1.5 mb-1">{icon}<p className="text-xs text-gray-400">{label}</p></div>
            <p className="text-sm font-bold text-gray-800">{value}</p>
          </div>
        ))}
      </div>

      {/* PM */}
      {detailLoading ? (
        <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 size={12} className="animate-spin" /> Loading details…</div>
      ) : detailProject?.pm && (
        <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-2xl border border-indigo-100">
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${getGradient(detailProject.pm.name)} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
            {detailProject.pm.name[0]}
          </div>
          <div>
            <p className="text-xs text-indigo-400 font-medium">Project Manager</p>
            <p className="text-sm font-semibold text-indigo-800">{detailProject.pm.name}</p>
            {detailProject.pm.email && <p className="text-xs text-indigo-400">{detailProject.pm.email}</p>}
          </div>
          <Shield size={16} className="text-indigo-300 ml-auto" />
        </div>
      )}

      {/* Delay warning */}
      {selectedProject.is_delayed && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">Project is Delayed</p>
            <p className="text-xs text-red-500 mt-0.5">{selectedProject.delay_reason || 'No reason specified'}</p>
          </div>
        </div>
      )}

      {/* Tags */}
      {selectedProject.tags?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Tag size={11} /> Tags</p>
          <div className="flex flex-wrap gap-2">
            {selectedProject.tags.map((tag: string) => (
              <span key={tag} className="text-xs bg-blue-50 text-blue-600 border border-blue-100 px-2.5 py-1 rounded-lg font-medium">{tag}</span>
            ))}
          </div>
        </div>
      )}

      {/* Teams */}
      {detailProject?.teams?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Users size={11} /> Teams</p>
          <div className="flex flex-wrap gap-2">
            {detailProject.teams.map((t: any) => (
              <span key={t.id} className="flex items-center gap-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-100 px-3 py-1.5 rounded-xl font-medium">
                <div className={`w-4 h-4 rounded-md bg-gradient-to-br ${getGradient(t.name)} flex items-center justify-center text-white text-[9px] font-bold`}>{t.name[0]}</div>
                {t.name}{t.department ? ` · ${t.department}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Contributor Activity Chart */}
      {selectedProject.repo_url && (
        <div className="border-t border-gray-100 pt-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <GitCommitHorizontal size={12} /> Contributor Activity
          </p>

          {contributorStatsLoading ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-4">
              <Loader2 size={12} className="animate-spin" /> Loading contributor stats…
            </div>
          ) : contributorStatsError ? (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2.5 rounded-xl">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>{contributorStatsError}</span>
            </div>
          ) : contributorStats.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">No contributor data available.</p>
          ) : (() => {
            const maxCommits = Math.max(...contributorStats.map((c: any) => c.commits), 1)
            const maxLines   = Math.max(...contributorStats.map((c: any) => c.lines),   1)
            return (
              <div className="space-y-3">
                {contributorStats.map((c: any) => (
                  <div key={c.author} className="group">
                    <div className="flex items-center gap-2.5 mb-1.5">
                      {c.avatar_url ? (
                        <img src={c.avatar_url} alt={c.author} className="w-7 h-7 rounded-full shrink-0" />
                      ) : (
                        <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${getGradient(c.author)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                          {c.author[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{c.author}</p>
                        {c.email && <p className="text-xs text-gray-400 truncate">{c.email}</p>}
                      </div>
                      <div className="text-right shrink-0 text-xs text-gray-500 space-y-0.5">
                        <p><span className="font-bold text-blue-600">{c.commits}</span> commits</p>
                        <p>
                          <span className="text-emerald-600 font-semibold">+{c.additions.toLocaleString()}</span>
                          {' / '}
                          <span className="text-red-500 font-semibold">-{c.deletions.toLocaleString()}</span>
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1 pl-9">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 w-12 shrink-0">Commits</span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all duration-700"
                            style={{ width: `${(c.commits / maxCommits) * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-gray-500 w-6 text-right">{c.commits}</span>
                      </div>
                      {c.lines > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-400 w-12 shrink-0">Lines</span>
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden flex">
                            <div
                              className="h-full bg-emerald-400 rounded-l-full transition-all duration-700"
                              style={{ width: `${(c.additions / maxLines) * 100}%` }}
                            />
                            <div
                              className="h-full bg-red-400 rounded-r-full transition-all duration-700"
                              style={{ width: `${(c.deletions / maxLines) * 100}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-gray-500 w-6 text-right">{c.lines.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-4 pt-1 pl-9">
                  <span className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-3 h-2 bg-blue-500 rounded-sm inline-block" /> Commits</span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-3 h-2 bg-emerald-400 rounded-sm inline-block" /> Lines added</span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-3 h-2 bg-red-400 rounded-sm inline-block" /> Lines deleted</span>
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
