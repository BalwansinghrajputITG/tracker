import React from 'react'
import {
  AlertTriangle, CheckCircle2, GitBranch, GitCommitHorizontal, Zap, Activity,
} from 'lucide-react'
import { fmt } from './projectTypes'

// ─── GitHub Data Display ──────────────────────────────────────────────────────

export const GitHubDataDisplay: React.FC<{ data: any }> = ({ data }) => {
  if (data.error) return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 text-xs px-3 py-2.5 rounded-xl">
      <AlertTriangle size={12} className="shrink-0 mt-0.5" />{data.error}
    </div>
  )
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-lg font-bold text-gray-900">{fmt(data.total_commits || 0)}</p>
          <p className="text-xs text-gray-500">Total Commits</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-lg font-bold text-gray-900">{data.total_contributors || 0}</p>
          <p className="text-xs text-gray-500">Contributors</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <GitBranch size={12} className="text-gray-400" />
        <a href={`https://github.com/${data.repo}`} target="_blank" rel="noopener noreferrer"
           className="text-blue-600 hover:underline font-medium">{data.repo}</a>
      </div>
      {data.commits?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recent Commits</p>
          <div className="space-y-1.5">
            {data.commits.slice(0, 5).map((c: any, i: number) => (
              <div key={i} className="flex items-start gap-2 text-xs bg-gray-50 rounded-lg px-3 py-2">
                <GitCommitHorizontal size={12} className="text-gray-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-gray-700 truncate">{c.message || c.commit?.message || ''}</p>
                  <p className="text-gray-400">{c.author || c.commit?.author?.name || ''}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Figma Data Display ───────────────────────────────────────────────────────

export const FigmaDataDisplay: React.FC<{ data: any }> = ({ data }) => {
  if (data.error) return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 text-xs px-3 py-2.5 rounded-xl">
      <AlertTriangle size={12} className="shrink-0 mt-0.5" />{data.error}
    </div>
  )
  return (
    <div className="space-y-3">
      {data.user && (
        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl">
          <CheckCircle2 size={12} />
          Connected as <strong>{data.user}</strong>
        </div>
      )}
      {data.file && (
        <div className="bg-gray-50 rounded-xl p-3 space-y-2">
          {data.file.thumbnail_url && (
            <img src={data.file.thumbnail_url} alt={data.file.name} className="w-full h-32 object-cover rounded-lg" />
          )}
          <p className="text-sm font-semibold text-gray-800">{data.file.name}</p>
          <div className="grid grid-cols-2 gap-2">
            <div><p className="text-sm font-bold text-gray-900">{data.file.pages || 0}</p><p className="text-xs text-gray-500">Pages</p></div>
            <div><p className="text-sm font-bold text-gray-900">v{data.file.version}</p><p className="text-xs text-gray-500">Version</p></div>
          </div>
          {data.file.last_modified && (
            <p className="text-xs text-gray-400">Last modified: {new Date(data.file.last_modified).toLocaleDateString()}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Jira Data Display ────────────────────────────────────────────────────────

const JIRA_PRIORITY_COLORS: Record<string, string> = {
  Highest: 'text-red-600', High: 'text-orange-500', Medium: 'text-amber-500',
  Low: 'text-blue-500', Lowest: 'text-gray-400',
}

export const JiraDataDisplay: React.FC<{ data: any }> = ({ data }) => {
  if (data.error) return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 text-xs px-3 py-2.5 rounded-xl">
      <AlertTriangle size={12} className="shrink-0 mt-0.5" />{data.error}
    </div>
  )
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl">
        <CheckCircle2 size={12} /> Connected as <strong>{data.user}</strong>{data.email ? ` · ${data.email}` : ''}
      </div>
      <div className="grid grid-cols-1 gap-2">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
            <Activity size={16} className="text-white" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-900">{data.open_issues || 0}</p>
            <p className="text-xs text-gray-500">Open Issues</p>
          </div>
        </div>
      </div>
      {data.issues?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Open Issues</p>
          <div className="space-y-1.5">
            {data.issues.map((issue: any, i: number) => (
              <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-[10px] font-mono text-blue-600 font-semibold shrink-0">{issue.key}</span>
                <p className="flex-1 text-xs text-gray-700 truncate">{issue.summary}</p>
                <span className="text-xs text-gray-400 shrink-0">{issue.status}</span>
                {issue.priority && (
                  <span className={`text-[10px] font-semibold shrink-0 ${JIRA_PRIORITY_COLORS[issue.priority] || 'text-gray-500'}`}>
                    {issue.priority}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Linear Data Display ──────────────────────────────────────────────────────

const LINEAR_PRIORITY: Record<number, { label: string; color: string }> = {
  0: { label: 'No priority', color: 'text-gray-400' },
  1: { label: 'Urgent',      color: 'text-red-600'  },
  2: { label: 'High',        color: 'text-orange-500' },
  3: { label: 'Medium',      color: 'text-amber-500' },
  4: { label: 'Low',         color: 'text-blue-500' },
}

export const LinearDataDisplay: React.FC<{ data: any }> = ({ data }) => {
  if (data.error) return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 text-xs px-3 py-2.5 rounded-xl">
      <AlertTriangle size={12} className="shrink-0 mt-0.5" />{data.error}
    </div>
  )
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl">
        <CheckCircle2 size={12} /> Connected as <strong>{data.user}</strong>
      </div>
      <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 flex items-center gap-3">
        <div className="w-9 h-9 bg-purple-600 rounded-xl flex items-center justify-center shrink-0">
          <Zap size={16} className="text-white" />
        </div>
        <div>
          <p className="text-xl font-bold text-gray-900">{data.open_issues || 0}</p>
          <p className="text-xs text-gray-500">Open Issues</p>
        </div>
      </div>
      {data.issues?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Active Issues</p>
          <div className="space-y-1.5">
            {data.issues.map((issue: any, i: number) => {
              const prio = LINEAR_PRIORITY[issue.priority] || LINEAR_PRIORITY[0]
              return (
                <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  <p className="flex-1 text-xs text-gray-700 truncate">{issue.title}</p>
                  <span className="text-xs text-gray-400 shrink-0 bg-gray-100 px-2 py-0.5 rounded-lg">{issue.state}</span>
                  <span className={`text-[10px] font-semibold shrink-0 ${prio.color}`}>{prio.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Notion Data Display ──────────────────────────────────────────────────────

export const NotionDataDisplay: React.FC<{ data: any }> = ({ data }) => {
  if (data.error) return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 text-xs px-3 py-2.5 rounded-xl">
      <AlertTriangle size={12} className="shrink-0 mt-0.5" />{data.error}
    </div>
  )
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl">
        <CheckCircle2 size={12} /> Connected as <strong>{data.user}</strong>
        {data.type && <span className="text-gray-400">({data.type})</span>}
      </div>
      {data.database && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xl font-bold text-gray-900">{data.database.total_pages || 0}</p>
            <p className="text-xs text-gray-500">Pages in Database</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${data.database.has_more ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            <div>
              <p className="text-xs font-semibold text-gray-700">{data.database.has_more ? 'More pages' : 'All loaded'}</p>
              <p className="text-[10px] text-gray-400">Database status</p>
            </div>
          </div>
        </div>
      )}
      {!data.database && (
        <div className="bg-amber-50 border border-amber-100 text-amber-700 text-xs px-3 py-2 rounded-xl">
          Workspace connected. Add a Database ID to view page analytics.
        </div>
      )}
    </div>
  )
}

// ─── SEMrush Data Display ─────────────────────────────────────────────────────

export const SemrushDataDisplay: React.FC<{ data: any }> = ({ data }) => {
  if (data.error) return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 text-xs px-3 py-2.5 rounded-xl">
      <AlertTriangle size={12} className="shrink-0 mt-0.5" />{data.error}
    </div>
  )
  const metrics = [
    { label: 'Organic Keywords', value: data.organic_keywords, color: 'bg-emerald-500', bg: 'bg-emerald-50 border-emerald-100' },
    { label: 'Organic Traffic',  value: data.organic_traffic,  color: 'bg-blue-500',    bg: 'bg-blue-50 border-blue-100'       },
    { label: 'Paid Keywords',    value: data.paid_keywords,    color: 'bg-orange-400',  bg: 'bg-orange-50 border-orange-100'   },
    { label: 'Paid Traffic',     value: data.paid_traffic,     color: 'bg-purple-500',  bg: 'bg-purple-50 border-purple-100'   },
    { label: 'Backlinks',        value: data.backlinks,        color: 'bg-cyan-500',    bg: 'bg-cyan-50 border-cyan-100'       },
    { label: 'Authority Score',  value: data.authority_score,  color: 'bg-indigo-500',  bg: 'bg-indigo-50 border-indigo-100'   },
  ]
  const maxVal = Math.max(...metrics.map(m => m.value || 0), 1)
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl">
        <CheckCircle2 size={12} /> Domain analytics for <strong>{data.domain}</strong>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {metrics.slice(0, 4).map(m => (
          <div key={m.label} className={`border rounded-xl p-3 ${m.bg}`}>
            <p className="text-lg font-bold text-gray-900">{fmt(m.value || 0)}</p>
            <p className="text-xs text-gray-500">{m.label}</p>
          </div>
        ))}
      </div>
      <div className="bg-white border border-gray-100 rounded-xl p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Traffic Breakdown</p>
        {metrics.map(m => (
          <div key={m.label} className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-28 shrink-0">{m.label}</span>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full ${m.color} rounded-full transition-all`} style={{ width: `${Math.min(100, ((m.value || 0) / maxVal) * 100)}%` }} />
            </div>
            <span className="text-xs font-semibold text-gray-700 w-14 text-right shrink-0">{fmt(m.value || 0)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Vercel Data Display ──────────────────────────────────────────────────────

const VERCEL_STATE_COLORS: Record<string, string> = {
  READY:        'bg-emerald-100 text-emerald-700',
  ERROR:        'bg-red-100 text-red-600',
  BUILDING:     'bg-blue-100 text-blue-700',
  CANCELED:     'bg-gray-100 text-gray-500',
}

export const VercelDataDisplay: React.FC<{ data: any }> = ({ data }) => {
  if (data.error) return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 text-xs px-3 py-2.5 rounded-xl">
      <AlertTriangle size={12} className="shrink-0 mt-0.5" />{data.error}
    </div>
  )
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl">
        <CheckCircle2 size={12} /> Connected as <strong>{data.user}</strong>
      </div>
      {data.latest_deployment && (
        <div className="bg-black rounded-xl p-4 text-white">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">Latest Deployment</p>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-mono text-gray-200 truncate">{data.latest_deployment.url}</p>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg ml-2 shrink-0 ${VERCEL_STATE_COLORS[data.latest_deployment.state] || 'bg-gray-700 text-gray-300'}`}>
              {data.latest_deployment.state}
            </span>
          </div>
          {data.latest_deployment.created && (
            <p className="text-[10px] text-gray-500">
              {new Date(data.latest_deployment.created).toLocaleString()}
            </p>
          )}
        </div>
      )}
      {data.deployments?.length > 1 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recent Deployments</p>
          <div className="space-y-1.5">
            {data.deployments.slice(1).map((d: any, i: number) => (
              <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg shrink-0 ${VERCEL_STATE_COLORS[d.state] || 'bg-gray-100 text-gray-500'}`}>{d.state}</span>
                <p className="flex-1 text-xs text-gray-500 font-mono truncate">{d.url}</p>
                {d.created && <p className="text-[10px] text-gray-400 shrink-0">{new Date(d.created).toLocaleDateString()}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
      {!data.deployments?.length && (
        <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-400 text-center">
          Account connected. Add a Vercel Project ID to view deployments.
        </div>
      )}
    </div>
  )
}

// ─── Slack Data Display ───────────────────────────────────────────────────────

export const SlackDataDisplay: React.FC<{ data: any }> = ({ data }) => {
  if (data.error) return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 text-xs px-3 py-2.5 rounded-xl">
      <AlertTriangle size={12} className="shrink-0 mt-0.5" />{data.error}
    </div>
  )
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl">
        <CheckCircle2 size={12} /> Slack bot connected
        {data.channel && <span className="ml-1 font-mono text-gray-500">#{data.channel}</span>}
      </div>
      <div className="bg-[#4A154B] rounded-xl p-4 text-white text-center">
        <p className="text-xs text-purple-300 mb-1">Integration Active</p>
        <p className="text-sm font-medium">Notifications will be posted to the configured channel.</p>
      </div>
    </div>
  )
}
