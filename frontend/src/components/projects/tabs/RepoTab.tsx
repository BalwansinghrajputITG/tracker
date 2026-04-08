import React from 'react'
import {
  AlertTriangle, CheckCircle2, Loader2,
  GitBranch, GitCommitHorizontal, ExternalLink,
} from 'lucide-react'
import { getGradient } from '../projectsConstants'

interface RepoTabProps {
  selectedProject: any
  commits: any[]
  commitsTotal: number
  commitsLoading: boolean
  commitsError: string
  commitEmailFilter: string
  commitDayFilter: string
  setCommitEmailFilter: (v: string) => void
  setCommitDayFilter: (v: string) => void
  showInlineTokenForm: boolean
  setShowInlineTokenForm: (v: boolean | ((prev: boolean) => boolean)) => void
  inlineToken: string
  setInlineToken: (v: string) => void
  showInlineTokenValue: boolean
  setShowInlineTokenValue: (v: boolean | ((prev: boolean) => boolean)) => void
  tokenSaving: boolean
  tokenSaveError: string
  setTokenSaveError: (v: string) => void
  handleUpdateToken: () => void
}

export const RepoTab: React.FC<RepoTabProps> = ({
  selectedProject, commits, commitsTotal, commitsLoading, commitsError,
  commitEmailFilter, commitDayFilter, setCommitEmailFilter, setCommitDayFilter,
  showInlineTokenForm, setShowInlineTokenForm, inlineToken, setInlineToken,
  showInlineTokenValue, setShowInlineTokenValue, tokenSaving, tokenSaveError, setTokenSaveError,
  handleUpdateToken,
}) => {
  return (
    <div className="space-y-4">
      {selectedProject.repo_url ? (
        <>
          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1.5"><GitBranch size={11} /> Repository</p>
              <div className="flex items-center gap-2">
                {selectedProject.has_repo_token ? (
                  <span className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-0.5 rounded-lg font-medium flex items-center gap-1">
                    <CheckCircle2 size={10} /> Token set
                  </span>
                ) : (
                  <span className="text-xs bg-amber-50 text-amber-600 border border-amber-100 px-2 py-0.5 rounded-lg font-medium">No token</span>
                )}
                <button
                  onClick={() => { setShowInlineTokenForm((v: boolean) => !v); setInlineToken(''); setTokenSaveError(''); setShowInlineTokenValue(false) }}
                  className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                >
                  {showInlineTokenForm ? 'Cancel' : selectedProject.has_repo_token ? 'Update Token' : 'Add Token'}
                </button>
              </div>
            </div>
            <a
              href={selectedProject.repo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium group"
            >
              <span className="truncate">{selectedProject.repo_url}</span>
              <ExternalLink size={13} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>

            {showInlineTokenForm && (
              <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
                <p className="text-xs text-gray-500">
                  Paste your GitHub / GitLab Personal Access Token with <code className="bg-gray-100 px-1 rounded">repo</code> scope.
                </p>
                <div className="relative">
                  <input
                    type={showInlineTokenValue ? 'text' : 'password'}
                    value={inlineToken}
                    onChange={e => setInlineToken(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 pr-16 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    autoFocus
                  />
                  <button type="button" onClick={() => setShowInlineTokenValue((v: boolean) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 font-medium">
                    {showInlineTokenValue ? 'Hide' : 'Show'}
                  </button>
                </div>
                {tokenSaveError && <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={11} />{tokenSaveError}</p>}
                <div className="flex gap-2">
                  <button onClick={() => { setShowInlineTokenForm(false); setInlineToken(''); setTokenSaveError('') }} className="flex-1 py-1.5 text-xs text-gray-500 font-medium border border-gray-200 rounded-lg hover:text-gray-700">Cancel</button>
                  <button onClick={handleUpdateToken} disabled={!inlineToken.trim() || tokenSaving} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {tokenSaving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                    {tokenSaving ? 'Saving…' : 'Save & Retry'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Commits */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                <GitCommitHorizontal size={12} /> Commits
                {commitsTotal > 0 && (
                  <span className="ml-1 bg-blue-100 text-blue-600 px-2 py-0.5 rounded-lg font-bold">{commitsTotal}</span>
                )}
              </p>
              {commits.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={commitEmailFilter}
                    onChange={e => setCommitEmailFilter(e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-600 max-w-[160px]"
                  >
                    <option value="">All contributors</option>
                    {Array.from(new Map(commits.filter((c: any) => c.email || c.author).map((c: any) => [c.email || c.author, c])).values())
                      .map((c: any) => (
                        <option key={c.email || c.author} value={c.email || c.author}>
                          {c.author}{c.email ? ` (${c.email})` : ''}
                        </option>
                      ))
                    }
                  </select>
                  <select
                    value={commitDayFilter}
                    onChange={e => setCommitDayFilter(e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-600 max-w-[160px]"
                  >
                    <option value="">All days</option>
                    {Array.from(new Set(commits.map((c: any) => (c.date || '').split('T')[0]).filter(Boolean))).sort().reverse()
                      .map((day: any) => {
                        const label = new Date(day + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                        const cnt = commits.filter((c: any) => (c.date || '').startsWith(day)).length
                        return <option key={day} value={day}>{label} ({cnt})</option>
                      })
                    }
                  </select>
                  {(commitEmailFilter || commitDayFilter) && (
                    <button
                      onClick={() => { setCommitEmailFilter(''); setCommitDayFilter('') }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>

            {commitsLoading ? (
              <div className="flex items-center gap-2 text-xs text-gray-400 py-4"><Loader2 size={13} className="animate-spin" /> Loading commits…</div>
            ) : commitsError ? (
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                <AlertTriangle size={13} className="shrink-0" />{commitsError}
              </div>
            ) : commits.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No commits found.</p>
            ) : (() => {
              let filtered = commits
              if (commitEmailFilter) filtered = filtered.filter((c: any) => c.email === commitEmailFilter || c.author === commitEmailFilter)
              if (commitDayFilter)   filtered = filtered.filter((c: any) => (c.date || '').startsWith(commitDayFilter))

              const grouped: Record<string, any[]> = {}
              filtered.forEach((c: any) => {
                const d = (c.date || '').split('T')[0] || 'Unknown'
                if (!grouped[d]) grouped[d] = []
                grouped[d].push(c)
              })
              const days = Object.keys(grouped).sort().reverse()

              return filtered.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No commits match the selected filters.</p>
              ) : (
                <div className="space-y-4">
                  {days.map((day: string) => {
                    const dayLabel = new Date(day + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
                    return (
                      <div key={day}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg">{dayLabel}</span>
                          <span className="text-xs text-gray-400">{grouped[day].length} commit{grouped[day].length !== 1 ? 's' : ''}</span>
                          <div className="flex-1 h-px bg-gray-100" />
                        </div>
                        <div className="space-y-2">
                          {grouped[day].map((c: any) => {
                            const [firstLine, ...rest] = (c.message || '').split('\n')
                            const body = rest.filter((l: string) => l.trim()).join('\n').trim()
                            return (
                              <div key={c.sha} className="p-3 rounded-xl border border-gray-100 hover:border-blue-100 hover:bg-blue-50/20 transition-colors">
                                <div className="flex items-start gap-2.5">
                                  {c.avatar_url ? (
                                    <img src={c.avatar_url} alt={c.author} className="w-7 h-7 rounded-full shrink-0 mt-0.5" />
                                  ) : (
                                    <div className={`w-7 h-7 bg-gradient-to-br ${getGradient(c.author)} rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5`}>
                                      {(c.author || '?')[0].toUpperCase()}
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-gray-800 font-semibold leading-snug">{firstLine}</p>
                                    {body && (
                                      <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap leading-relaxed">{body}</p>
                                    )}
                                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                      <span className="text-xs text-gray-500 font-medium">{c.author}</span>
                                      {c.email && <span className="text-xs text-gray-400">{c.email}</span>}
                                      <span className="text-gray-300">·</span>
                                      <span className="text-xs text-gray-400">{new Date(c.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                  </div>
                                  <code className="text-[11px] text-gray-400 font-mono shrink-0 bg-gray-100 px-1.5 py-0.5 rounded-md">{c.sha}</code>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-gray-400">
          <GitBranch size={28} className="mx-auto mb-2 text-gray-200" />
          <p className="text-sm">No repository linked</p>
          <p className="text-xs mt-1">Edit the project to add a Git repository URL</p>
        </div>
      )}
    </div>
  )
}
