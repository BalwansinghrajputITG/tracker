import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useSelector } from 'react-redux'
import {
  ArrowLeft, FolderOpen, GitBranch, Link2, Layout, Users, CheckCircle2,
  AlertTriangle, Loader2, ExternalLink, Tag, Pencil, Trash2, Plus,
  BarChart2, GitCommitHorizontal, ChevronDown, ChevronUp,
  Shield, User, Calendar, Clock, Zap, RefreshCw, X, Eye, EyeOff, Save,
  Activity, Settings, Wrench, ListChecks, KeyRound, CheckCheck, RotateCcw,
  UserPlus, UserMinus, Search,
} from 'lucide-react'
import { RootState } from '../store'
import { navigate } from './AppLayout'
import { api } from '../utils/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectDetailPageProps {
  projectId: string
}

const STATUS_COLORS: Record<string, string> = {
  planning:  'bg-blue-100 text-blue-700 border-blue-200',
  active:    'bg-emerald-100 text-emerald-700 border-emerald-200',
  on_hold:   'bg-amber-100 text-amber-700 border-amber-200',
  completed: 'bg-gray-100 text-gray-600 border-gray-200',
  cancelled: 'bg-red-100 text-red-600 border-red-200',
}
const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-amber-100 text-amber-700',
  low:      'bg-gray-100 text-gray-500',
}
const TASK_STATUS_COLORS: Record<string, string> = {
  todo:        'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  review:      'bg-purple-100 text-purple-700',
  done:        'bg-emerald-100 text-emerald-700',
  blocked:     'bg-red-100 text-red-600',
}

const GRADIENTS = [
  'from-blue-400 to-indigo-500', 'from-purple-400 to-pink-500',
  'from-emerald-400 to-teal-500', 'from-orange-400 to-red-500',
  'from-cyan-400 to-blue-500',
]
const getGrad = (s: string) => GRADIENTS[(s?.charCodeAt(0) || 0) % GRADIENTS.length]

const fmt = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n)

// ─── Stat Card ────────────────────────────────────────────────────────────────

const StatCard: React.FC<{
  label: string; value: string | number; icon: React.ReactNode
  iconBg: string; sub?: string
}> = ({ label, value, icon, iconBg, sub }) => (
  <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-4">
    <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center shrink-0`}>{icon}</div>
    <div>
      <p className="text-xl font-bold text-gray-900 leading-tight">{value}</p>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
    </div>
  </div>
)

// ─── Tool Data Panel ──────────────────────────────────────────────────────────

const ToolDataPanel: React.FC<{
  tool: any
  projectId: string
  canManage: boolean
}> = ({ tool, projectId, canManage }) => {
  const [fieldDefs, setFieldDefs]       = useState<any[]>([])
  const [oauthOnly, setOauthOnly]       = useState(false)
  const [oauthMsg, setOauthMsg]         = useState('')
  const [credentials, setCredentials]   = useState<Record<string, string>>({})
  const [maskedCreds, setMaskedCreds]   = useState<Record<string, string>>({})
  const [isConfigured, setIsConfigured] = useState(false)
  const [showForm, setShowForm]         = useState(false)
  const [showSecrets, setShowSecrets]   = useState<Record<string, boolean>>({})
  const [liveData, setLiveData]         = useState<any>(null)
  const [loadingDefs, setLoadingDefs]   = useState(false)
  const [loadingData, setLoadingData]   = useState(false)
  const [saving, setSaving]             = useState(false)
  const [removing, setRemoving]         = useState(false)
  const [error, setError]               = useState('')
  const [expanded, setExpanded]         = useState(false)

  useEffect(() => {
    loadFieldDefs()
    checkConfigured()
  }, [tool.id]) // eslint-disable-line

  const loadFieldDefs = async () => {
    setLoadingDefs(true)
    try {
      const r = await api.get(`/project-tools/field-defs/${tool.id}`)
      setFieldDefs(r.data.fields || [])
      setOauthOnly(r.data.oauth_only || false)
      setOauthMsg(r.data.oauth_message || '')
      const init: Record<string, string> = {}
      ;(r.data.fields || []).forEach((f: any) => { init[f.key] = '' })
      setCredentials(init)
    } catch {
      setFieldDefs([{ key: 'api_key', label: 'API Key / Token', type: 'secret' }])
    } finally {
      setLoadingDefs(false)
    }
  }

  const checkConfigured = async () => {
    try {
      const r = await api.get(`/project-tools/${projectId}/tools`)
      const found = (r.data.tools || []).find((t: any) => t.tool_id === tool.id)
      if (found) {
        setIsConfigured(true)
        setMaskedCreds(found.credentials_masked || {})
        // Auto-expand and load live data immediately
        setExpanded(true)
        setLoadingData(true)
        try {
          const dr = await api.get(`/project-tools/${projectId}/tools/${tool.id}/data`)
          setLiveData(dr.data)
        } catch (err: any) {
          setError(err?.response?.data?.detail || 'Failed to fetch data')
        } finally {
          setLoadingData(false)
        }
      }
    } catch {}
  }

  const fetchData = useCallback(async () => {
    setLoadingData(true)
    setError('')
    try {
      const r = await api.get(`/project-tools/${projectId}/tools/${tool.id}/data`)
      setLiveData(r.data)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to fetch data')
    } finally {
      setLoadingData(false)
    }
  }, [projectId, tool.id])

  const saveCredentials = async () => {
    setSaving(true)
    setError('')
    try {
      await api.put(`/project-tools/${projectId}/tools/${tool.id}/credentials`, {
        credentials,
      })
      setIsConfigured(true)
      setShowForm(false)
      await fetchData()
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to save credentials')
    } finally {
      setSaving(false)
    }
  }

  const removeCredentials = async () => {
    if (!window.confirm(`Remove ${tool.name} integration from this project?`)) return
    setRemoving(true)
    try {
      await api.delete(`/project-tools/${projectId}/tools/${tool.id}`)
      setIsConfigured(false)
      setLiveData(null)
      setMaskedCreds({})
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to remove')
    } finally {
      setRemoving(false)
    }
  }

  const renderLiveData = () => {
    if (!liveData) return null
    if (liveData.error) return (
      <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 text-xs px-3 py-2.5 rounded-xl">
        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
        {liveData.error}
      </div>
    )
    if (liveData.status === 'not_configured') return (
      <p className="text-xs text-gray-400 italic">No credentials saved yet.</p>
    )
    if (liveData.status === 'oauth_only' || liveData.status === 'not_integrated') return (
      <div className="bg-amber-50 border border-amber-100 text-amber-700 text-xs px-3 py-2.5 rounded-xl">
        {liveData.message}
      </div>
    )

    if (tool.id === 'github')  return <GitHubDataDisplay  data={liveData} />
    if (tool.id === 'figma')   return <FigmaDataDisplay   data={liveData} />
    if (tool.id === 'jira')    return <JiraDataDisplay    data={liveData} />
    if (tool.id === 'linear')  return <LinearDataDisplay  data={liveData} />
    if (tool.id === 'notion')  return <NotionDataDisplay  data={liveData} />
    if (tool.id === 'semrush') return <SemrushDataDisplay data={liveData} />
    if (tool.id === 'vercel')  return <VercelDataDisplay  data={liveData} />
    if (tool.id === 'slack')   return <SlackDataDisplay   data={liveData} />

    // Generic fallback: kpi cards + list rows
    const skip = new Set(['status'])
    const scalars = Object.entries(liveData).filter(([k, v]) => !skip.has(k) && typeof v !== 'object' && !Array.isArray(v))
    const lists   = Object.entries(liveData).filter(([k, v]) => !skip.has(k) && Array.isArray(v) && (v as any[]).length > 0)
    return (
      <div className="space-y-3">
        {liveData.status === 'connected' && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl">
            <CheckCircle2 size={12} /> Connected{liveData.user ? ` as ${liveData.user}` : ''}
          </div>
        )}
        {scalars.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {scalars.map(([k, v]) => (
              <div key={k} className="bg-gray-50 rounded-xl p-3">
                <p className="text-sm font-bold text-gray-900">{typeof v === 'number' ? fmt(v as number) : String(v)}</p>
                <p className="text-xs text-gray-500 capitalize mt-0.5">{k.replace(/_/g, ' ')}</p>
              </div>
            ))}
          </div>
        )}
        {lists.map(([k, v]) => (
          <div key={k}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 capitalize">{k.replace(/_/g, ' ')}</p>
            <div className="space-y-1.5">
              {(v as any[]).slice(0, 5).map((item, i) => (
                <div key={i} className="text-xs bg-gray-50 rounded-lg px-3 py-2 text-gray-700">
                  {typeof item === 'object' ? (
                    Object.entries(item as Record<string, unknown>).map(([ik, iv]) => (
                      <span key={ik} className="mr-3"><span className="text-gray-400">{ik}:</span> {String(iv)}</span>
                    ))
                  ) : String(item)}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors select-none"
        onClick={() => {
          setExpanded(e => {
            // Only auto-fetch if not yet loaded and not currently loading
            if (!e && isConfigured && !liveData && !loadingData) fetchData()
            return !e
          })
        }}
      >
        <span
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-[10px] shrink-0"
          style={{ backgroundColor: tool.color || '#6264A7' }}
        >
          {(tool.abbr || tool.name || '?').slice(0, 2)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-800">{tool.name}</p>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
              isConfigured
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-gray-100 text-gray-500 border-gray-200'
            }`}>
              {isConfigured ? '● Connected' : '○ Not configured'}
            </span>
          </div>
          <p className="text-xs text-gray-400">{tool.category}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canManage && (
            <>
              {isConfigured && (
                <button
                  onClick={e => { e.stopPropagation(); fetchData() }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-indigo-600 transition-colors"
                  title="Refresh data"
                >
                  <RefreshCw size={13} className={loadingData ? 'animate-spin' : ''} />
                </button>
              )}
              <button
                onClick={e => { e.stopPropagation(); setShowForm(f => !f); setExpanded(true) }}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-indigo-600 transition-colors"
                title={isConfigured ? 'Edit credentials' : 'Configure'}
              >
                <Settings size={13} />
              </button>
              {isConfigured && (
                <button
                  onClick={e => { e.stopPropagation(); removeCredentials() }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                  title="Remove integration"
                >
                  {removing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              )}
            </>
          )}
          {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-700 text-xs px-3 py-2 rounded-xl">
              <AlertTriangle size={12} /> {error}
            </div>
          )}

          {/* Credential form */}
          {(showForm || (!isConfigured && canManage)) && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                  <Settings size={12} className="text-indigo-500" />
                  {isConfigured ? 'Update Credentials' : 'Configure Integration'}
                </p>
                {showForm && isConfigured && (
                  <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                    <X size={13} />
                  </button>
                )}
              </div>

              {oauthOnly && (
                <div className="bg-amber-50 border border-amber-100 text-amber-700 text-xs px-3 py-2 rounded-xl">
                  {oauthMsg}
                </div>
              )}

              {fieldDefs.map(field => (
                <div key={field.key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{field.label}</label>
                  {field.type === 'textarea' ? (
                    <textarea
                      value={credentials[field.key] || ''}
                      onChange={e => setCredentials(c => ({ ...c, [field.key]: e.target.value }))}
                      placeholder={field.placeholder || field.help || ''}
                      rows={3}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white resize-none"
                    />
                  ) : (
                    <div className="relative">
                      <input
                        type={field.type === 'secret' && !showSecrets[field.key] ? 'password' : field.type === 'secret' ? 'text' : field.type}
                        value={credentials[field.key] || ''}
                        onChange={e => setCredentials(c => ({ ...c, [field.key]: e.target.value }))}
                        placeholder={field.placeholder || (isConfigured && maskedCreds[field.key] ? maskedCreds[field.key] : '')}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white pr-8"
                      />
                      {field.type === 'secret' && (
                        <button
                          type="button"
                          onClick={() => setShowSecrets(s => ({ ...s, [field.key]: !s[field.key] }))}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showSecrets[field.key] ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      )}
                    </div>
                  )}
                  {field.help && <p className="text-[10px] text-gray-400 mt-0.5">{field.help}</p>}
                </div>
              ))}

              <button
                onClick={saveCredentials}
                disabled={saving}
                className="flex items-center gap-1.5 bg-indigo-600 text-white text-xs font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                {saving ? 'Saving…' : 'Save & Connect'}
              </button>
            </div>
          )}

          {/* Live data */}
          {loadingData ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-4 justify-center">
              <Loader2 size={14} className="animate-spin text-indigo-500" />
              Fetching live data…
            </div>
          ) : isConfigured && !showForm ? (
            renderLiveData()
          ) : !isConfigured && !canManage ? (
            <p className="text-xs text-gray-400 italic">This tool has not been configured yet.</p>
          ) : null}
        </div>
      )}
    </div>
  )
}

// ─── GitHub Data Display ──────────────────────────────────────────────────────

const GitHubDataDisplay: React.FC<{ data: any }> = ({ data }) => {
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

const FigmaDataDisplay: React.FC<{ data: any }> = ({ data }) => {
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

const JiraDataDisplay: React.FC<{ data: any }> = ({ data }) => {
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

const LinearDataDisplay: React.FC<{ data: any }> = ({ data }) => {
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

const NotionDataDisplay: React.FC<{ data: any }> = ({ data }) => {
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

const SemrushDataDisplay: React.FC<{ data: any }> = ({ data }) => {
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

const VercelDataDisplay: React.FC<{ data: any }> = ({ data }) => {
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

const SlackDataDisplay: React.FC<{ data: any }> = ({ data }) => {
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

// ─── Phase Tracker ───────────────────────────────────────────────────────────

const PHASE_ORDER = ['planning', 'active', 'on_hold', 'completed', 'cancelled']

const PHASE_META: Record<string, {
  label: string; dot: string; ring: string; bar: string; badge: string; textColor: string
}> = {
  planning:  { label: 'Planning',  dot: 'bg-blue-500',    ring: 'ring-blue-300',    bar: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 border-blue-200',         textColor: 'text-blue-600'   },
  active:    { label: 'Active',    dot: 'bg-emerald-500', ring: 'ring-emerald-300', bar: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', textColor: 'text-emerald-600' },
  on_hold:   { label: 'On Hold',   dot: 'bg-amber-500',   ring: 'ring-amber-300',   bar: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200',       textColor: 'text-amber-600'  },
  completed: { label: 'Completed', dot: 'bg-gray-400',    ring: 'ring-gray-300',    bar: 'bg-gray-400',    badge: 'bg-gray-100 text-gray-600 border-gray-200',         textColor: 'text-gray-600'   },
  cancelled: { label: 'Cancelled', dot: 'bg-red-500',     ring: 'ring-red-300',     bar: 'bg-red-500',     badge: 'bg-red-50 text-red-600 border-red-200',             textColor: 'text-red-600'    },
}

// Quick-add suggestions (shown as chips when adding a stage)
const STAGE_SUGGESTIONS: Record<string, string[]> = {
  planning:  ['Requirements Gathering', 'Resource Planning', 'Risk Assessment', 'Timeline & Milestones', 'Budget Approval', 'Project Kickoff'],
  active:    ['Design & Architecture', 'Development', 'Code Review', 'Testing & QA', 'Staging Deployment', 'Production Release'],
  on_hold:   ['Identify Blockers', 'Stakeholder Review', 'Impact Assessment', 'Resume Plan'],
  completed: ['Documentation', 'Client Handover', 'Retrospective', 'Project Archive'],
  cancelled: ['Notify Team', 'Resource Release', 'Cancellation Docs'],
}

interface PhaseTrackerProps {
  project: any
  canManage: boolean
  canToggleStage: boolean
  projectId: string
  onUpdate: () => void
}

const PhaseTracker: React.FC<PhaseTrackerProps> = ({ project, canManage, canToggleStage, projectId, onUpdate }) => {
  const [selectedPhase, setSelectedPhase] = useState<string>(project.status || 'planning')
  const [toggling, setToggling]           = useState<string | null>(null)
  const [deletingId, setDeletingId]       = useState<string | null>(null)
  const [addingStage, setAddingStage]     = useState(false)
  const [newName, setNewName]             = useState('')
  const [newDesc, setNewDesc]             = useState('')
  const [newDueDate, setNewDueDate]       = useState('')
  const [addLoading, setAddLoading]       = useState(false)
  const [actionError, setActionError]     = useState('')
  const [bulkLoading, setBulkLoading]     = useState(false)
  // Inline edit state
  const [editingStageId, setEditingStageId] = useState<string | null>(null)
  const [editName, setEditName]           = useState('')
  const [editDesc, setEditDesc]           = useState('')
  const [editDue, setEditDue]             = useState('')
  const [editSaving, setEditSaving]       = useState(false)

  // Reset add-form when phase changes
  useEffect(() => {
    setAddingStage(false)
    setNewName('')
    setNewDesc('')
    setNewDueDate('')
    setEditingStageId(null)
    setActionError('')
  }, [selectedPhase])

  const phaseStages: Record<string, any[]> = project.phase_stages || {}
  const stages       = phaseStages[selectedPhase] || []
  const completedCount = stages.filter((s: any) => s.completed).length
  const totalCount     = stages.length
  const progressPct    = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
  const meta           = PHASE_META[selectedPhase]
  const suggestions    = (STAGE_SUGGESTIONS[selectedPhase] || []).filter(
    s => !stages.some((st: any) => st.name.toLowerCase() === s.toLowerCase())
  )

  // Overall project progress across all phases
  const allStages      = Object.values(phaseStages).flat()
  const allDone        = allStages.filter((s: any) => s.completed).length
  const allTotal       = allStages.length
  const overallPct     = allTotal > 0 ? Math.round((allDone / allTotal) * 100) : (project.progress_percentage || 0)

  const handleToggle = async (stageId: string, current: boolean) => {
    if (!canToggleStage || toggling) return
    setToggling(stageId)
    setActionError('')
    try {
      await api.patch(`/projects/${projectId}/stages`, { phase: selectedPhase, stage_id: stageId, completed: !current })
      onUpdate()
    } catch (e: any) {
      setActionError(e?.response?.data?.detail || 'Failed to update stage')
    } finally {
      setToggling(null)
    }
  }

  const handleAddStage = async (nameOverride?: string) => {
    const name = (nameOverride ?? newName).trim()
    if (!name) return
    setAddLoading(true)
    setActionError('')
    try {
      await api.post(`/projects/${projectId}/stages`, { phase: selectedPhase, name, description: newDesc.trim(), due_date: newDueDate || null })
      setNewName('')
      setNewDesc('')
      setNewDueDate('')
      setAddingStage(false)
      onUpdate()
    } catch (e: any) {
      setActionError(e?.response?.data?.detail || 'Failed to add stage')
    } finally {
      setAddLoading(false)
    }
  }

  const handleDelete = async (stageId: string) => {
    if (deletingId) return
    setDeletingId(stageId)
    setActionError('')
    try {
      await api.delete(`/projects/${projectId}/stages/${stageId}?phase=${selectedPhase}`)
      onUpdate()
    } catch (e: any) {
      setActionError(e?.response?.data?.detail || 'Failed to delete stage')
    } finally {
      setDeletingId(null)
    }
  }

  const handleBulkToggle = async (completed: boolean) => {
    if (bulkLoading || stages.length === 0) return
    setBulkLoading(true)
    setActionError('')
    try {
      await api.patch(`/projects/${projectId}/stages/bulk`, { phase: selectedPhase, completed })
      onUpdate()
    } catch (e: any) {
      setActionError(e?.response?.data?.detail || 'Bulk action failed')
    } finally {
      setBulkLoading(false)
    }
  }

  const startEditStage = (stage: any) => {
    setEditingStageId(stage.id)
    setEditName(stage.name)
    setEditDesc(stage.description || '')
    setEditDue(stage.due_date ? stage.due_date.split('T')[0] : '')
  }

  const saveEditStage = async () => {
    if (!editingStageId || !editName.trim()) return
    setEditSaving(true)
    setActionError('')
    try {
      const originalDue = stages.find((s: any) => s.id === editingStageId)?.due_date
      await api.put(`/projects/${projectId}/stages`, {
        phase: selectedPhase,
        stage_id: editingStageId,
        name: editName.trim(),
        description: editDesc.trim(),
        ...(editDue ? { due_date: editDue } : originalDue ? { clear_due_date: true } : {}),
      })
      setEditingStageId(null)
      onUpdate()
    } catch (e: any) {
      setActionError(e?.response?.data?.detail || 'Failed to save')
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Overall Progress Banner ── */}
      {allTotal > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4 flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                <Activity size={12} className="text-indigo-500" /> Overall Project Progress
              </p>
              <span className="text-sm font-bold text-gray-800">{overallPct}%</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-700"
                style={{ width: `${overallPct}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">{allDone} of {allTotal} stages completed across all phases</p>
          </div>
        </div>
      )}

      {/* ── Phase Journey Stepper ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-5 flex items-center gap-2">
          <ListChecks size={14} className="text-indigo-500" /> Project Journey
        </h3>
        <div className="flex items-start">
          {PHASE_ORDER.map((phase, idx) => {
            const pm    = PHASE_META[phase]
            const ps    = phaseStages[phase] || []
            const done  = ps.filter((s: any) => s.completed).length
            const total = ps.length
            const isCurrent  = project.status === phase
            const isSelected = selectedPhase === phase
            return (
              <React.Fragment key={phase}>
                <button
                  onClick={() => setSelectedPhase(phase)}
                  className={`flex flex-col items-center gap-1.5 transition-all duration-150 min-w-0 flex-1 ${
                    isSelected ? '' : 'opacity-50 hover:opacity-80'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold transition-all ${
                    isCurrent ? `${pm.dot} ring-4 ${pm.ring} ring-offset-2 scale-110`
                    : isSelected ? pm.dot : 'bg-gray-200'
                  }`}>
                    {idx + 1}
                  </div>
                  <p className={`text-xs font-semibold text-center leading-tight ${
                    isCurrent ? pm.textColor : isSelected ? 'text-gray-700' : 'text-gray-400'
                  }`}>{pm.label}</p>
                  <p className="text-[10px] text-gray-400">{total > 0 ? `${done}/${total}` : canManage ? 'no stages' : '—'}</p>
                  {isCurrent && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${pm.badge}`}>Current</span>
                  )}
                </button>
                {idx < PHASE_ORDER.length - 1 && (
                  <div className="flex-1 h-px bg-gray-200 mt-4 mx-1 max-w-[40px]" />
                )}
              </React.Fragment>
            )
          })}
        </div>
      </div>

      {/* ── Stage List ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${meta.badge}`}>
              {meta.label}{project.status === selectedPhase ? ' · Current' : ''}
            </span>
            {totalCount > 0 && (
              <span className="text-xs text-gray-400">{completedCount}/{totalCount} stages done</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {totalCount > 0 && (
              <span className="text-sm font-bold text-gray-700">{progressPct}%</span>
            )}
            {canToggleStage && totalCount > 0 && !addingStage && (
              <>
                <button
                  onClick={() => handleBulkToggle(true)}
                  disabled={bulkLoading || completedCount === totalCount}
                  title="Mark all complete"
                  className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl hover:bg-emerald-100 disabled:opacity-40 transition-colors"
                >
                  {bulkLoading ? <Loader2 size={11} className="animate-spin" /> : <CheckCheck size={11} />}
                  All done
                </button>
                <button
                  onClick={() => handleBulkToggle(false)}
                  disabled={bulkLoading || completedCount === 0}
                  title="Reset all stages"
                  className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 bg-gray-50 text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-100 disabled:opacity-40 transition-colors"
                >
                  <RotateCcw size={11} /> Reset
                </button>
              </>
            )}
            {canManage && !addingStage && (
              <button
                onClick={() => setAddingStage(true)}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
              >
                <Plus size={12} /> Add Stage
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {totalCount > 0 && (
          <div className="h-1.5 bg-gray-100">
            <div className={`h-full ${meta.bar} transition-all duration-500`} style={{ width: `${progressPct}%` }} />
          </div>
        )}

        {/* Error */}
        {actionError && (
          <div className="flex items-center gap-2 bg-red-50 text-red-700 text-xs px-5 py-2.5 border-b border-red-100">
            <AlertTriangle size={11} className="shrink-0" /> {actionError}
          </div>
        )}

        {/* Add stage form */}
        {addingStage && (
          <div className="px-5 py-4 border-b border-blue-100 bg-blue-50/40 space-y-3">
            <p className="text-xs font-semibold text-gray-700">New Stage for <span className="capitalize">{meta.label}</span></p>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddStage(); if (e.key === 'Escape') setAddingStage(false) }}
              placeholder="Stage name..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
            <input
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 font-medium shrink-0">Due Date</label>
              <input
                type="date"
                value={newDueDate}
                onChange={e => setNewDueDate(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              {newDueDate && (
                <button type="button" onClick={() => setNewDueDate('')} className="text-gray-300 hover:text-red-400">
                  <X size={13} />
                </button>
              )}
            </div>
            {/* Suggestion chips */}
            {suggestions.length > 0 && (
              <div>
                <p className="text-[10px] text-gray-400 mb-1.5 font-medium">Quick add:</p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map(s => (
                    <button
                      key={s}
                      onClick={() => handleAddStage(s)}
                      disabled={addLoading}
                      className="text-xs px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setAddingStage(false); setNewName(''); setNewDesc('') }}
                className="px-4 py-1.5 text-sm text-gray-500 font-medium border border-gray-200 rounded-xl hover:bg-gray-50"
              >Cancel</button>
              <button
                onClick={() => handleAddStage()}
                disabled={!newName.trim() || addLoading}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50"
              >
                {addLoading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                {addLoading ? 'Adding…' : 'Add Stage'}
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {stages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-gray-300 gap-2">
            <ListChecks size={36} />
            <p className="text-sm text-gray-400 font-medium">No stages added yet</p>
            {canManage ? (
              <p className="text-xs text-gray-400">
                Click <strong>Add Stage</strong> to define the steps for the <span className="capitalize">{meta.label}</span> phase.
              </p>
            ) : (
              <p className="text-xs text-gray-400">The project manager hasn't added stages for this phase yet.</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {stages.map((stage: any, i: number) => (
              <div
                key={stage.id}
                className={`flex items-start gap-4 px-5 py-4 group transition-colors ${stage.completed ? 'bg-gray-50/50' : 'hover:bg-gray-50/30'}`}
              >
                {/* Checkbox */}
                <button
                  disabled={!canToggleStage || !!toggling}
                  onClick={() => handleToggle(stage.id, stage.completed)}
                  className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                    stage.completed ? `${meta.dot} border-transparent` : 'border-gray-300 hover:border-blue-400 bg-white'
                  } ${canToggleStage ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  {toggling === stage.id
                    ? <Loader2 size={10} className="animate-spin text-white" />
                    : stage.completed
                    ? <CheckCircle2 size={11} className="text-white" />
                    : null}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {editingStageId === stage.id ? (
                    <div className="space-y-1.5" onClick={e => e.stopPropagation()}>
                      <input
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEditStage(); if (e.key === 'Escape') setEditingStageId(null) }}
                        className="w-full border border-blue-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                      />
                      <input
                        value={editDesc}
                        onChange={e => setEditDesc(e.target.value)}
                        placeholder="Description"
                        className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                      />
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] text-gray-400 shrink-0">Due</label>
                        <input
                          type="date"
                          value={editDue}
                          onChange={e => setEditDue(e.target.value)}
                          className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                        />
                        {editDue && <button type="button" onClick={() => setEditDue('')} className="text-gray-300 hover:text-red-400"><X size={11} /></button>}
                      </div>
                      <div className="flex gap-1.5 pt-0.5">
                        <button onClick={() => setEditingStageId(null)} className="px-2 py-1 text-[11px] text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                        <button onClick={saveEditStage} disabled={!editName.trim() || editSaving}
                          className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white text-[11px] rounded-lg hover:bg-blue-700 disabled:opacity-50">
                          {editSaving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className={`text-sm font-semibold ${stage.completed ? 'text-gray-400 line-through decoration-gray-300' : 'text-gray-800'}`}>
                        {stage.name}
                      </p>
                      {stage.description && (
                        <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{stage.description}</p>
                      )}
                      {stage.completed && stage.completed_at && (
                        <p className="text-[10px] text-gray-300 mt-1 font-medium">
                          ✓ {new Date(stage.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      )}
                      {stage.due_date && (() => {
                        const due = new Date(stage.due_date)
                        const overdue = !stage.completed && due < new Date()
                        return (
                          <p className={`text-[10px] mt-1 font-medium flex items-center gap-1 ${overdue ? 'text-red-400' : 'text-gray-400'}`}>
                            {overdue ? '⚠ Overdue · ' : '📅 Due '}
                            {due.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        )
                      })()}
                    </>
                  )}
                </div>

                {/* Right side: index + edit + delete */}
                <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${stage.completed ? `${meta.badge} border` : 'bg-gray-100 text-gray-400'}`}>
                    #{i + 1}
                  </span>
                  {canManage && editingStageId !== stage.id && (
                    <>
                      <button
                        onClick={() => startEditStage(stage)}
                        className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg flex items-center justify-center text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-all"
                        title="Edit stage"
                      >
                        <Pencil size={10} />
                      </button>
                      <button
                        disabled={!!deletingId}
                        onClick={() => handleDelete(stage.id)}
                        className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                      >
                        {deletingId === stage.id
                          ? <Loader2 size={11} className="animate-spin text-red-400" />
                          : <Trash2 size={11} />}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


// ─── Members Tab ─────────────────────────────────────────────────────────────

const MembersTab: React.FC<{
  project: any
  projectId: string
  canManage: boolean
  onMemberChange: () => void
}> = ({ project, projectId, canManage, onMemberChange }) => {
  const [showAddModal, setShowAddModal] = useState(false)
  const [searchQuery, setSearchQuery]  = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching]      = useState(false)
  const [adding, setAdding]            = useState<string | null>(null)
  const [removing, setRemoving]        = useState<string | null>(null)
  const [actionError, setActionError]  = useState('')
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const memberIds = new Set((project.members || []).map((m: any) => m.id))

  const searchUsers = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return }
    setSearching(true)
    try {
      const r = await api.get('/users', { params: { search: q, limit: 20 } })
      const all: any[] = r.data.users || r.data || []
      setSearchResults(all.filter((u: any) => !memberIds.has(u.id || u._id)))
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, [memberIds])

  const handleSearchChange = (q: string) => {
    setSearchQuery(q)
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => searchUsers(q), 300)
  }

  const addMember = async (userId: string) => {
    setAdding(userId)
    setActionError('')
    try {
      await api.post(`/projects/${projectId}/members/${userId}`)
      onMemberChange()
      setSearchResults(prev => prev.filter(u => (u.id || u._id) !== userId))
    } catch (err: any) {
      setActionError(err?.response?.data?.detail || 'Failed to add member')
    } finally {
      setAdding(null)
    }
  }

  const removeMember = async (userId: string) => {
    setRemoving(userId)
    setActionError('')
    try {
      await api.delete(`/projects/${projectId}/members/${userId}`)
      onMemberChange()
    } catch (err: any) {
      setActionError(err?.response?.data?.detail || 'Failed to remove member')
    } finally {
      setRemoving(null)
    }
  }

  const teamLeads = (project.members || []).filter((m: any) => m.role === 'team_lead')
  const employees = (project.members || []).filter((m: any) => m.role !== 'team_lead')

  return (
    <div className="animate-fade-in space-y-5">
      {/* Header row with Add button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 font-medium">
          {(project.members?.length || 0)} member{project.members?.length !== 1 ? 's' : ''}
        </p>
        {canManage && (
          <button
            onClick={() => { setShowAddModal(true); setSearchQuery(''); setSearchResults([]); setActionError('') }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
          >
            <UserPlus size={13} /> Add Member
          </button>
        )}
      </div>

      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-xl">{actionError}</div>
      )}

      {/* Project Manager */}
      {project.pm && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <Shield size={11} className="text-indigo-500" /> Project Manager
          </p>
          <div
            onClick={() => navigate(`/users/${project.pm.id}`)}
            className="inline-flex items-center gap-3 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-2xl cursor-pointer hover:border-indigo-400 hover:shadow-md transition-all"
          >
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-base shrink-0 shadow-sm">
              {project.pm.name[0]}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-gray-900">{project.pm.name}</p>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-600 text-white">PM</span>
              </div>
              <p className="text-xs text-indigo-500 mt-0.5">{project.pm.email}</p>
            </div>
          </div>
        </div>
      )}

      {/* Team Leads */}
      {teamLeads.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <Shield size={11} className="text-teal-500" /> Team Leads
            <span className="ml-1 bg-teal-100 text-teal-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{teamLeads.length}</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {teamLeads.map((m: any) => (
              <MemberCard
                key={m.id} member={m} canManage={canManage}
                removing={removing === m.id}
                onRemove={() => removeMember(m.id)}
                onNavigate={() => navigate(`/users/${m.id}`)}
                variant="teal"
              />
            ))}
          </div>
        </div>
      )}

      {/* Employees */}
      {employees.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <Users size={11} /> Employees
            <span className="ml-1 bg-gray-100 text-gray-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{employees.length}</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {employees.map((m: any) => (
              <MemberCard
                key={m.id} member={m} canManage={canManage}
                removing={removing === m.id}
                onRemove={() => removeMember(m.id)}
                onNavigate={() => navigate(`/users/${m.id}`)}
                variant="default"
              />
            ))}
          </div>
        </div>
      )}

      {(!project.pm && (!project.members || project.members.length === 0)) && (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
          <Users size={28} className="mb-2 text-gray-200" />
          <p className="text-sm">No members added yet</p>
          {canManage && (
            <button onClick={() => setShowAddModal(true)} className="mt-3 flex items-center gap-1.5 text-xs text-blue-600 font-semibold hover:underline">
              <UserPlus size={13} /> Add the first member
            </button>
          )}
        </div>
      )}

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center">
                  <UserPlus size={15} className="text-blue-600" />
                </div>
                <h2 className="text-base font-bold text-gray-900">Add Member</h2>
              </div>
              <button onClick={() => setShowAddModal(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
                <X size={14} className="text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Search input */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={e => handleSearchChange(e.target.value)}
                  placeholder="Search by name, email or department…"
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                />
                {searching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />}
              </div>

              {/* Results list */}
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {!searchQuery.trim() && (
                  <p className="text-xs text-gray-400 text-center py-6">Type a name or email to search users</p>
                )}
                {searchQuery.trim() && !searching && searchResults.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-6">No users found — they may already be a member</p>
                )}
                {searchResults.map((u: any) => {
                  const uid = u.id || u._id
                  return (
                    <div key={uid} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-all">
                      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${getGrad(u.full_name || u.name || '')} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                        {(u.full_name || u.name || '?')[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{u.full_name || u.name}</p>
                        <p className="text-xs text-gray-400 truncate">{u.primary_role?.replace('_', ' ')}{u.department ? ` · ${u.department}` : ''}</p>
                      </div>
                      <button
                        onClick={() => addMember(uid)}
                        disabled={adding === uid}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors shrink-0"
                      >
                        {adding === uid ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                        Add
                      </button>
                    </div>
                  )
                })}
              </div>

              {actionError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{actionError}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Member Card ──────────────────────────────────────────────────────────────

const MemberCard: React.FC<{
  member: any
  canManage: boolean
  removing: boolean
  onRemove: () => void
  onNavigate: () => void
  variant: 'teal' | 'default'
}> = ({ member, canManage, removing, onRemove, onNavigate, variant }) => {
  const [confirmRemove, setConfirmRemove] = useState(false)

  const bgClass   = variant === 'teal' ? 'bg-teal-50 border-teal-200 hover:border-teal-400' : 'bg-white border-gray-100 hover:border-blue-200 hover:bg-blue-50/30'
  const gradClass = variant === 'teal' ? 'from-teal-500 to-emerald-600' : getGrad(member.name)
  const badgeEl   = variant === 'teal'
    ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-teal-500 text-white shrink-0">TL</span>
    : null

  if (confirmRemove) {
    return (
      <div className="flex flex-col gap-2 p-4 bg-red-50 border-2 border-red-200 rounded-2xl">
        <p className="text-xs font-semibold text-red-700">Remove <span className="font-bold">{member.name}</span> from this project?</p>
        <div className="flex gap-2">
          <button
            onClick={() => { onRemove(); setConfirmRemove(false) }}
            disabled={removing}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 disabled:opacity-60 transition-colors"
          >
            {removing ? <Loader2 size={11} className="animate-spin" /> : <UserMinus size={11} />} Remove
          </button>
          <button onClick={() => setConfirmRemove(false)} className="flex-1 py-1.5 bg-white text-gray-600 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-3 p-4 rounded-2xl shadow-sm border transition-all group ${bgClass}`}>
      <div
        onClick={onNavigate}
        className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradClass} flex items-center justify-center text-white font-bold shrink-0 cursor-pointer`}
      >
        {member.name[0]}
      </div>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onNavigate}>
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-blue-700 transition-colors">{member.name}</p>
          {badgeEl}
        </div>
        <p className="text-xs text-gray-400 capitalize truncate">{member.role?.replace('_', ' ')}{member.department ? ` · ${member.department}` : ''}</p>
        {member.email && <p className="text-xs text-blue-400 truncate">{member.email}</p>}
      </div>
      {canManage && (
        <button
          onClick={() => setConfirmRemove(true)}
          title="Remove from project"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all shrink-0"
        >
          <UserMinus size={14} />
        </button>
      )}
    </div>
  )
}


// ─── Main Page ────────────────────────────────────────────────────────────────

export const ProjectDetailPage: React.FC<ProjectDetailPageProps> = ({ projectId }) => {
  const { user } = useSelector((s: RootState) => s.auth)

  const [project, setProject]       = useState<any>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [activeTab, setActiveTab]   = useState('overview')
  const [editMode, setEditMode]     = useState(false)
  const [editForm, setEditForm]     = useState<any>({})
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState('')
  const [deleting, setDeleting]     = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  // Commits
  const [commits, setCommits]               = useState<any[]>([])
  const [commitsTotal, setCommitsTotal]     = useState(0)
  const [commitsLoading, setCommitsLoading] = useState(false)
  const [commitsError, setCommitsError]     = useState('')
  const [commitFilter, setCommitFilter]     = useState('')

  // Contributor stats
  const [contribStats, setContribStats]         = useState<any[]>([])
  const [contribLoading, setContribLoading]     = useState(false)
  const [contribError, setContribError]         = useState('')

  // GitHub token change
  const [tokenInput, setTokenInput]       = useState('')
  const [showTokenInput, setShowTokenInput] = useState(false)
  const [tokenSaving, setTokenSaving]     = useState(false)
  const [tokenError, setTokenError]       = useState('')
  const [tokenSuccess, setTokenSuccess]   = useState(false)

  // Tracking docs
  const [trackingDocs, setTrackingDocs]         = useState<any[]>([])
  const [trackingDocsLoading, setTrackingDocsLoading] = useState(false)
  const [liveStats, setLiveStats]               = useState<any[]>([])
  const [liveLoading, setLiveLoading]           = useState(false)
  const [trackingForm, setTrackingForm]         = useState({ url: '', title: '', api_key: '' })
  const [trackingAdding, setTrackingAdding]     = useState(false)
  const [trackingError, setTrackingError]       = useState('')
  const [showTrackingForm, setShowTrackingForm] = useState(false)

  const loadProject = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const r = await api.get(`/projects/${projectId}/detail`)
      setProject(r.data)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to load project')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { loadProject() }, [loadProject])

  useEffect(() => {
    if (activeTab === 'repo' && project?.repo_url) {
      fetchCommits()
      fetchContribs()
    }
    if (activeTab === 'tracking' && project?.id) {
      loadTrackingDocs()
    }
  }, [activeTab, project?.id])

  const fetchCommits = async () => {
    if (!project?.id) return
    setCommitsLoading(true)
    setCommitsError('')
    try {
      const r = await api.get(`/projects/${project.id}/commits`)
      setCommits(r.data.commits || [])
      setCommitsTotal(r.data.total || 0)
    } catch (err: any) {
      setCommitsError(err?.response?.data?.detail || 'Could not load commits')
    } finally {
      setCommitsLoading(false)
    }
  }

  const fetchContribs = async () => {
    if (!project?.id) return
    setContribLoading(true)
    setContribError('')
    try {
      const r = await api.get(`/projects/${project.id}/contributor-stats`)
      setContribStats(Array.isArray(r.data) ? r.data : r.data.contributors || [])
    } catch (err: any) {
      setContribError(err?.response?.data?.detail || 'Could not load contributor stats')
    } finally {
      setContribLoading(false)
    }
  }

  const loadTrackingDocs = async () => {
    if (!project?.id) return
    setTrackingDocsLoading(true)
    try {
      const r = await api.get(`/projects/${project.id}/tracking-docs`)
      setTrackingDocs(r.data.tracking_docs || [])
    } catch { /* ignore */ }
    finally { setTrackingDocsLoading(false) }
  }

  const fetchLiveStats = async () => {
    if (!project?.id) return
    setLiveLoading(true)
    try {
      const r = await api.get(`/projects/${project.id}/tracking-docs/live`)
      setLiveStats(r.data.docs || [])
    } catch { /* ignore */ }
    finally { setLiveLoading(false) }
  }

  const addTrackingDoc = async () => {
    if (!trackingForm.url.trim()) return
    setTrackingAdding(true)
    setTrackingError('')
    try {
      await api.post(`/projects/${project.id}/tracking-docs`, trackingForm)
      setTrackingForm({ url: '', title: '', api_key: '' })
      setShowTrackingForm(false)
      await loadTrackingDocs()
    } catch (err: any) {
      setTrackingError(err?.response?.data?.detail || 'Failed to add tracking doc')
    } finally {
      setTrackingAdding(false)
    }
  }

  const removeTrackingDoc = async (docId: string) => {
    try {
      await api.delete(`/projects/${project.id}/tracking-docs/${docId}`)
      setTrackingDocs(prev => prev.filter(d => d.id !== docId))
      setLiveStats(prev => prev.filter(d => d.id !== docId))
    } catch { /* ignore */ }
  }

  const openEdit = () => {
    setEditForm({
      name:        project.name,
      description: project.description || '',
      priority:    project.priority,
      status:      project.status,
      due_date:    project.due_date ? project.due_date.split('T')[0] : '',
      repo_url:    project.repo_url || '',
      figma_url:   project.figma_url || '',
      pm_id:       project.pm?.id || '',
    })
    setEditMode(true)
  }

  const saveEdit = async () => {
    setSaving(true)
    setSaveError('')
    try {
      const payload = { ...editForm }
      if (!payload.repo_url)  delete payload.repo_url
      if (!payload.figma_url) delete payload.figma_url
      if (!payload.pm_id)     delete payload.pm_id
      if (!payload.due_date)  delete payload.due_date
      await api.put(`/projects/${projectId}`, payload)
      await loadProject()
      setEditMode(false)
    } catch (err: any) {
      const d = err?.response?.data?.detail
      setSaveError(typeof d === 'string' ? d : Array.isArray(d) ? d.map((e: any) => e.msg).join(' · ') : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const deleteProject = async () => {
    setDeleting(true)
    try {
      await api.delete(`/projects/${projectId}`)
      navigate('/projects')
    } catch (err: any) {
      setDeleting(false)
      setDeleteConfirm(false)
      alert(err?.response?.data?.detail || 'Failed to delete project')
    }
  }

  const saveToken = async () => {
    if (!tokenInput.trim()) return
    setTokenSaving(true)
    setTokenError('')
    setTokenSuccess(false)
    try {
      await api.put(`/projects/${projectId}`, { repo_token: tokenInput })
      setTokenInput('')
      setShowTokenInput(false)
      setTokenSuccess(true)
      setTimeout(() => setTokenSuccess(false), 4000)
    } catch (err: any) {
      setTokenError(err?.response?.data?.detail || 'Failed to update token')
    } finally {
      setTokenSaving(false)
    }
  }

  const canManage = (() => {
    const role = user?.primary_role || ''
    if (['ceo', 'coo'].includes(role)) return true
    if (project?.pm?.id === (user as any)?.id) return true
    if (role === 'pm') return true
    if (role === 'team_lead') return (project?.members || []).some((m: any) => m.id === (user as any)?.id)
    return false
  })()

  // Any project member (including employees) can check off phase stages
  const _userId = (user as any)?.user_id || (user as any)?.id
  const canToggleStage = canManage || (project?.members || []).some((m: any) => m.id === _userId)

  if (loading) return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="h-10 skeleton rounded-xl w-48" />
      <div className="h-36 skeleton rounded-2xl" />
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-20 skeleton rounded-2xl" />)}
      </div>
    </div>
  )

  if (error) return (
    <div className="max-w-5xl mx-auto flex flex-col items-center justify-center h-64 text-gray-400 gap-4">
      <AlertTriangle size={28} className="text-red-400" />
      <p className="text-sm font-medium text-red-600">{error}</p>
      <button onClick={() => navigate('/projects')} className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
        <ArrowLeft size={14} /> Back to Projects
      </button>
    </div>
  )

  if (!project) return null

  const doneTasks  = (project.tasks || []).filter((t: any) => t.status === 'done').length
  const totalTasks = (project.tasks || []).length
  const daysLeft   = project.due_date
    ? Math.ceil((new Date(project.due_date).getTime() - Date.now()) / 86_400_000)
    : null

  const currentPhaseStages = (project.phase_stages || {})[project.status] || []
  const currentPhaseDone = currentPhaseStages.filter((s: any) => s.completed).length
  const currentPhaseTotal = currentPhaseStages.length

  const TABS = [
    { key: 'overview',  label: 'Overview',    icon: <BarChart2 size={13} /> },
    { key: 'phases',    label: `Phases${currentPhaseTotal > 0 ? ` (${currentPhaseDone}/${currentPhaseTotal})` : ''}`, icon: <ListChecks size={13} /> },
    { key: 'members',   label: `Members (${project.members?.length || 0})`,  icon: <Users size={13} /> },
    { key: 'tasks',     label: `Tasks (${totalTasks})`,    icon: <CheckCircle2 size={13} /> },
    { key: 'repo',      label: 'Repository',  icon: <GitBranch size={13} /> },
    { key: 'tools',     label: `Tools (${project.tools?.length || 0})`, icon: <Wrench size={13} /> },
    { key: 'links',     label: 'Links',       icon: <Link2 size={13} /> },
    ...(canManage ? [{ key: 'tracking', label: 'Tracking', icon: <Activity size={13} /> }] : []),
  ]

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-fade-in">
      {/* Back */}
      <button
        onClick={() => navigate('/projects')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors font-medium"
      >
        <ArrowLeft size={15} /> All Projects
      </button>

      {/* ── Header ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className={`h-2 w-full ${
          project.status === 'active'    ? 'bg-emerald-500' :
          project.status === 'planning'  ? 'bg-blue-500'    :
          project.status === 'on_hold'   ? 'bg-amber-500'   :
          project.status === 'completed' ? 'bg-gray-400'    : 'bg-red-500'
        }`} />
        <div className="p-6">
          {editMode ? (
            /* ── Edit form ── */
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                <Pencil size={14} className="text-indigo-500" /> Editing Project
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Project Name</label>
                  <input value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                  <textarea value={editForm.description || ''} onChange={e => setEditForm({...editForm, description: e.target.value})}
                    rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 resize-none" />
                </div>
                {[
                  { label: 'Priority', key: 'priority', opts: ['critical','high','medium','low'] },
                  { label: 'Status',   key: 'status',   opts: ['planning','active','on_hold','completed','cancelled'] },
                ].map(({ label, key, opts }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                    <select value={editForm[key] || ''} onChange={e => setEditForm({...editForm, [key]: e.target.value})}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 capitalize">
                      {opts.map(o => <option key={o} value={o} className="capitalize">{o.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
                  <input type="date" value={editForm.due_date || ''} onChange={e => setEditForm({...editForm, due_date: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Repository URL</label>
                  <input type="url" value={editForm.repo_url || ''} onChange={e => setEditForm({...editForm, repo_url: e.target.value})}
                    placeholder="https://github.com/org/repo"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Figma URL</label>
                  <input type="url" value={editForm.figma_url || ''} onChange={e => setEditForm({...editForm, figma_url: e.target.value})}
                    placeholder="https://www.figma.com/file/…"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
                </div>
              </div>
              {saveError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-700 text-xs px-3 py-2 rounded-xl">
                  <AlertTriangle size={12} /> {saveError}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditMode(false)} className="px-4 py-2 text-sm text-gray-600 font-medium border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
                <button onClick={saveEdit} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50">
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          ) : (
            /* ── View ── */
            <div>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap mb-2">
                    <h1 className="text-2xl font-bold text-gray-900 truncate">{project.name}</h1>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border capitalize ${STATUS_COLORS[project.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      {project.status?.replace('_', ' ')}
                    </span>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${PRIORITY_COLORS[project.priority] || ''}`}>
                      {project.priority}
                    </span>
                  </div>
                  {project.description && (
                    <p className="text-sm text-gray-500 leading-relaxed mb-3">{project.description}</p>
                  )}
                  {/* Progress */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex-1 max-w-xs h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                        style={{ width: `${project.progress_percentage || 0}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-700">{project.progress_percentage || 0}%</span>
                    {currentPhaseTotal > 0 && (
                      <button
                        onClick={() => setActiveTab('phases')}
                        className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors hover:opacity-80 ${PHASE_META[project.status]?.badge || 'bg-gray-100 text-gray-600 border-gray-200'}`}
                      >
                        <ListChecks size={11} />
                        {currentPhaseDone}/{currentPhaseTotal} stages
                      </button>
                    )}
                  </div>
                </div>

                {canManage && !deleteConfirm && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={openEdit}
                      className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-xl transition-colors">
                      <Pencil size={13} /> Edit
                    </button>
                    <button onClick={() => setDeleteConfirm(true)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded-xl transition-colors">
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                )}
                {deleteConfirm && (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-red-600 font-medium">Delete this project?</span>
                    <button onClick={() => setDeleteConfirm(false)} className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                    <button onClick={deleteProject} disabled={deleting}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50">
                      {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                      {deleting ? 'Deleting…' : 'Confirm'}
                    </button>
                  </div>
                )}
              </div>

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-gray-500">
                {project.pm && (
                  <div className="flex items-center gap-1.5">
                    <Shield size={12} className="text-indigo-400" />
                    <span>PM: <strong className="text-gray-700">{project.pm.name}</strong></span>
                  </div>
                )}
                {project.due_date && (
                  <div className="flex items-center gap-1.5">
                    <Calendar size={12} className="text-gray-400" />
                    <span>Due: <strong className="text-gray-700">{new Date(project.due_date).toLocaleDateString()}</strong></span>
                  </div>
                )}
                {daysLeft !== null && (
                  <div className={`flex items-center gap-1.5 ${daysLeft < 0 ? 'text-red-500' : daysLeft <= 7 ? 'text-amber-600' : ''}`}>
                    <Clock size={12} />
                    <span>{daysLeft < 0 ? `${Math.abs(daysLeft)} days overdue` : `${daysLeft} days left`}</span>
                  </div>
                )}
              </div>

              {/* Tags */}
              {project.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {project.tags.map((t: string) => (
                    <span key={t} className="text-xs bg-blue-50 text-blue-600 border border-blue-100 px-2.5 py-0.5 rounded-lg font-medium">{t}</span>
                  ))}
                </div>
              )}

              {/* Delay banner */}
              {project.is_delayed && (
                <div className="mt-3 flex items-center gap-2 bg-red-50 border border-red-100 text-red-700 text-xs px-4 py-2.5 rounded-xl">
                  <AlertTriangle size={13} className="shrink-0" />
                  <span><strong>Delayed</strong>{project.delay_reason ? `: ${project.delay_reason}` : ''}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Stat cards ── */}
      {!editMode && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Tasks Done"   value={`${doneTasks} / ${totalTasks}`}   icon={<CheckCircle2 size={18} className="text-emerald-600" />} iconBg="bg-emerald-50" sub="completed" />
          <StatCard label="Members"      value={project.members?.length || 0}    icon={<Users size={18} className="text-blue-600" />}           iconBg="bg-blue-50" />
          <StatCard label="Teams"        value={project.teams?.length || 0}      icon={<Activity size={18} className="text-purple-600" />}      iconBg="bg-purple-50" />
          <StatCard
            label={daysLeft !== null && daysLeft < 0 ? 'Days Overdue' : 'Days Left'}
            value={daysLeft !== null ? Math.abs(daysLeft) : '—'}
            icon={<Calendar size={18} className={daysLeft !== null && daysLeft < 0 ? 'text-red-500' : 'text-amber-600'} />}
            iconBg={daysLeft !== null && daysLeft < 0 ? 'bg-red-50' : 'bg-amber-50'}
          />
        </div>
      )}

      {/* ── Tabs ── */}
      {!editMode && (
        <>
          <div className="flex gap-1 border-b border-gray-200">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-150 -mb-px whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>

          {/* ── Overview ── */}
          {activeTab === 'overview' && (
            <div className="space-y-5 animate-fade-in">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* PM & Teams */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-gray-800">Project Details</h3>
                  {project.pm && (
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Shield size={11} /> Project Manager</p>
                      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${getGrad(project.pm.name)} flex items-center justify-center text-white font-bold text-sm`}>
                          {project.pm.name[0]}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{project.pm.name}</p>
                          <p className="text-xs text-gray-400">{project.pm.email}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {project.teams?.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Users size={11} /> Teams</p>
                      <div className="flex flex-wrap gap-2">
                        {project.teams.map((t: any) => (
                          <span key={t.id} className="flex items-center gap-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-100 px-3 py-1.5 rounded-xl font-medium">
                            <div className={`w-4 h-4 rounded-md bg-gradient-to-br ${getGrad(t.name)} flex items-center justify-center text-white text-[9px] font-bold`}>{t.name[0]}</div>
                            {t.name}{t.department ? ` · ${t.department}` : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Task summary */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                  <h3 className="text-sm font-semibold text-gray-800 mb-4">Task Breakdown</h3>
                  {totalTasks === 0 ? (
                    <p className="text-xs text-gray-400 py-8 text-center">No tasks yet</p>
                  ) : (
                    <div className="space-y-2.5">
                      {Object.entries(
                        (project.tasks || []).reduce((acc: any, t: any) => {
                          acc[t.status] = (acc[t.status] || 0) + 1; return acc
                        }, {})
                      ).map(([status, count]) => (
                        <div key={status} className="flex items-center gap-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-lg capitalize min-w-[80px] text-center ${TASK_STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
                            {status.replace('_', ' ')}
                          </span>
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(count as number / totalTasks) * 100}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-gray-700 min-w-[20px] text-right">{count as number}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Contributor activity preview */}
              {project.repo_url && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <GitCommitHorizontal size={12} /> Repository Overview
                  </p>
                  <div className="flex items-center gap-3">
                    <a href={project.repo_url} target="_blank" rel="noopener noreferrer"
                       className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium group">
                      <GitBranch size={14} />
                      <span className="truncate">{project.repo_url}</span>
                      <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                    <button onClick={() => setActiveTab('repo')} className="text-xs text-gray-400 hover:text-blue-600 underline ml-auto">
                      View commits →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Phases ── */}
          {activeTab === 'phases' && (
            <PhaseTracker
              project={project}
              canManage={canManage}
              canToggleStage={canToggleStage}
              projectId={projectId}
              onUpdate={loadProject}
            />
          )}

          {/* ── Members ── */}
          {activeTab === 'members' && (
            <MembersTab
              project={project}
              projectId={projectId}
              canManage={canManage}
              onMemberChange={loadProject}
            />
          )}

          {/* ── Tasks ── */}
          {activeTab === 'tasks' && (
            <div className="animate-fade-in space-y-3">
              {totalTasks === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                  <CheckCircle2 size={28} className="mb-2 text-gray-200" />
                  <p className="text-sm">No tasks yet</p>
                </div>
              ) : (
                project.tasks.map((t: any, i: number) => (
                  <div key={t.id} className="flex items-center gap-3 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 hover:border-blue-100 transition-colors animate-fade-in-up" style={{ animationDelay: `${i * 0.03}s` }}>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-xl capitalize shrink-0 ${TASK_STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-600'}`}>
                      {t.status?.replace('_', ' ')}
                    </span>
                    <p className="flex-1 text-sm font-medium text-gray-800 truncate">{t.title}</p>
                    {t.priority && (
                      <span className={`text-xs px-2 py-0.5 rounded-lg capitalize shrink-0 ${PRIORITY_COLORS[t.priority] || ''}`}>{t.priority}</span>
                    )}
                    {t.assignees?.length > 0 && (
                      <div className="flex -space-x-1.5 shrink-0">
                        {t.assignees.slice(0, 3).map((a: any) => (
                          <div key={a.id} title={a.name} className={`w-6 h-6 rounded-full bg-gradient-to-br ${getGrad(a.name)} border-2 border-white flex items-center justify-center text-white text-[8px] font-bold`}>
                            {a.name?.[0]}
                          </div>
                        ))}
                      </div>
                    )}
                    {t.due_date && (
                      <span className="text-xs text-gray-400 shrink-0">{new Date(t.due_date).toLocaleDateString()}</span>
                    )}
                    {t.is_blocked && <span title="Blocked"><AlertTriangle size={13} className="text-red-400 shrink-0" /></span>}
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Repository ── */}
          {activeTab === 'repo' && (
            <div className="animate-fade-in space-y-5">
              {/* GitHub Token Manager */}
              {canManage && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                      <KeyRound size={13} className="text-amber-500" /> Private Repository Access Token
                    </p>
                    <div className="flex items-center gap-2">
                      {project.has_repo_token && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Token set</span>
                      )}
                      {tokenSuccess && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 size={10} /> Updated!
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">
                    {project.has_repo_token
                      ? 'A token is stored for this repo. Enter a new token below to replace it.'
                      : 'No token set. Required to fetch commits from private repositories.'}
                  </p>
                  {showTokenInput ? (
                    <div className="space-y-2">
                      <div className="relative">
                        <input
                          type={showTokenInput ? 'text' : 'password'}
                          value={tokenInput}
                          onChange={e => setTokenInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveToken(); if (e.key === 'Escape') { setShowTokenInput(false); setTokenInput('') } }}
                          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                          autoFocus
                          className="w-full border border-amber-200 rounded-xl px-3 py-2.5 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-amber-50/30 font-mono"
                        />
                        <button type="button" onClick={() => setTokenInput('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-red-400">
                          <X size={13} />
                        </button>
                      </div>
                      {tokenError && <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={11} /> {tokenError}</p>}
                      <div className="flex gap-2">
                        <button onClick={() => { setShowTokenInput(false); setTokenInput(''); setTokenError('') }}
                          className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50">
                          Cancel
                        </button>
                        <button onClick={saveToken} disabled={!tokenInput.trim() || tokenSaving}
                          className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-xl hover:bg-amber-600 disabled:opacity-50 transition-colors">
                          {tokenSaving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                          {tokenSaving ? 'Saving…' : project.has_repo_token ? 'Update Token' : 'Save Token'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowTokenInput(true)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold rounded-xl hover:bg-amber-100 transition-colors"
                    >
                      <KeyRound size={12} />
                      {project.has_repo_token ? 'Change Access Token' : 'Add Access Token'}
                    </button>
                  )}
                </div>
              )}

              {!project.repo_url ? (
                <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                  <GitBranch size={28} className="mb-2 text-gray-200" />
                  <p className="text-sm">No repository linked</p>
                  {canManage && <button onClick={openEdit} className="mt-2 text-xs text-blue-600 hover:underline">Add repository URL</button>}
                </div>
              ) : (
                <>
                  {/* Contributor Stats */}
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-4 flex items-center gap-1.5">
                      <Activity size={12} /> Contributor Activity
                    </p>
                    {contribLoading ? (
                      <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 size={12} className="animate-spin" /> Loading…</div>
                    ) : contribError ? (
                      <p className="text-xs text-amber-600">{contribError}</p>
                    ) : contribStats.length === 0 ? (
                      <p className="text-xs text-gray-400">No contributor data available</p>
                    ) : (
                      <div className="space-y-3">
                        {contribStats.map((c: any) => {
                          const max = Math.max(...contribStats.map((x: any) => x.commits), 1)
                          return (
                            <div key={c.author} className="flex items-center gap-3">
                              {c.avatar_url
                                ? <img src={c.avatar_url} alt={c.author} className="w-7 h-7 rounded-full shrink-0" />
                                : <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${getGrad(c.author)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>{c.author?.[0]}</div>
                              }
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-xs font-medium text-gray-700 truncate">{c.author}</p>
                                  <span className="text-xs text-gray-400 ml-2 shrink-0">{c.commits} commits</span>
                                </div>
                                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(c.commits / max) * 100}%` }} />
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Commits */}
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                        <GitCommitHorizontal size={12} /> Commits
                        {commitsTotal > 0 && <span className="ml-1 bg-blue-100 text-blue-600 px-2 py-0.5 rounded-lg font-bold">{commitsTotal}</span>}
                      </p>
                      <button onClick={fetchCommits} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
                        <RefreshCw size={12} className={commitsLoading ? 'animate-spin' : ''} />
                      </button>
                    </div>
                    {commitsLoading ? (
                      <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 size={12} className="animate-spin" /> Loading commits…</div>
                    ) : commitsError ? (
                      <p className="text-xs text-amber-600">{commitsError}</p>
                    ) : commits.length === 0 ? (
                      <p className="text-xs text-gray-400">No commits found</p>
                    ) : (
                      <div className="space-y-2">
                        {commits
                          .filter((c: any) => !commitFilter || c.author_email === commitFilter)
                          .slice(0, 15)
                          .map((c: any, i: number) => (
                            <div key={c.sha || i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                              <GitCommitHorizontal size={13} className="text-gray-400 mt-0.5 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-gray-800 truncate">{c.message}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5">
                                  {c.author_name || c.author} · {c.date ? new Date(c.date).toLocaleDateString() : ''}
                                  {c.sha && <span className="ml-2 font-mono">{c.sha.slice(0, 7)}</span>}
                                </p>
                              </div>
                            </div>
                          ))
                        }
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Tools ── */}
          {activeTab === 'tools' && (
            <div className="animate-fade-in space-y-3">
              {(!project.tools || project.tools.length === 0) ? (
                <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                  <Wrench size={28} className="mb-2 text-gray-200" />
                  <p className="text-sm font-medium">No tools added to this project</p>
                  {canManage && (
                    <p className="text-xs mt-1 text-gray-400">Edit the project and add tools from the "Tools & Integrations" section</p>
                  )}
                </div>
              ) : (
                project.tools.map((tool: any) => (
                  <ToolDataPanel
                    key={tool.id}
                    tool={tool}
                    projectId={projectId}
                    canManage={canManage}
                  />
                ))
              )}
            </div>
          )}

          {/* ── Links ── */}
          {activeTab === 'links' && (
            <div className="animate-fade-in space-y-3">
              {project.repo_url && (
                <a href={project.repo_url} target="_blank" rel="noopener noreferrer"
                   className="flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors group">
                  <div className="w-10 h-10 bg-gray-800 rounded-xl flex items-center justify-center shrink-0"><GitBranch size={18} className="text-white" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">Git Repository</p>
                    <p className="text-xs text-gray-400 truncate">{project.repo_url}</p>
                  </div>
                  <ExternalLink size={15} className="text-gray-300 group-hover:text-blue-500 shrink-0 transition-colors" />
                </a>
              )}
              {project.figma_url && (
                <a href={project.figma_url} target="_blank" rel="noopener noreferrer"
                   className="flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 hover:border-purple-200 hover:bg-purple-50/30 transition-colors group">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shrink-0"><Layout size={18} className="text-white" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">Figma Design</p>
                    <p className="text-xs text-gray-400 truncate">{project.figma_url}</p>
                  </div>
                  <ExternalLink size={15} className="text-gray-300 group-hover:text-purple-500 shrink-0 transition-colors" />
                </a>
              )}
              {project.links?.filter((l: any) => l.url).map((l: any, idx: number) => (
                <a key={idx} href={l.url} target="_blank" rel="noopener noreferrer"
                   className="flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors group">
                  <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center shrink-0"><Link2 size={18} className="text-white" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{l.title || 'Link'}</p>
                    <p className="text-xs text-gray-400 truncate">{l.url}</p>
                  </div>
                  <ExternalLink size={15} className="text-gray-300 group-hover:text-blue-500 shrink-0 transition-colors" />
                </a>
              ))}
              {/* Tool links */}
              {project.tools?.filter((t: any) => t.url).map((t: any) => (
                <a key={t.id} href={t.url} target="_blank" rel="noopener noreferrer"
                   className="flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors group">
                  <span className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-xs shrink-0" style={{ backgroundColor: t.color || '#6264A7' }}>
                    {(t.abbr || t.name || '?').slice(0, 2)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{t.name}</p>
                    <p className="text-xs text-gray-400 truncate">{t.url}</p>
                  </div>
                  <ExternalLink size={15} className="text-gray-300 group-hover:text-indigo-500 shrink-0 transition-colors" />
                </a>
              ))}
              {!project.repo_url && !project.figma_url && !project.links?.filter((l: any) => l.url)?.length && !project.tools?.filter((t: any) => t.url)?.length && (
                <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                  <Link2 size={28} className="mb-2 text-gray-200" />
                  <p className="text-sm">No links added yet</p>
                </div>
              )}
            </div>
          )}

          {/* ── Tracking Docs ── */}
          {activeTab === 'tracking' && canManage && (
            <div className="animate-fade-in space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">Google Sheets & Docs Tracking</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Track edit activity for performance analytics</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchLiveStats}
                    disabled={liveLoading || trackingDocs.length === 0}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-40 transition-colors"
                  >
                    <RefreshCw size={12} className={liveLoading ? 'animate-spin' : ''} />
                    {liveLoading ? 'Fetching…' : 'Fetch Live Stats'}
                  </button>
                  <button
                    onClick={() => setShowTrackingForm(v => !v)}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                  >
                    <Plus size={12} /> Add Doc
                  </button>
                </div>
              </div>

              {/* Add form */}
              {showTrackingForm && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
                  <h4 className="text-xs font-semibold text-gray-700">Add Google Sheet / Doc</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Google Sheets / Docs URL *</label>
                      <input
                        value={trackingForm.url}
                        onChange={e => setTrackingForm(f => ({ ...f, url: e.target.value }))}
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                        className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Title (optional)</label>
                      <input
                        value={trackingForm.title}
                        onChange={e => setTrackingForm(f => ({ ...f, title: e.target.value }))}
                        placeholder="Sprint Tracker"
                        className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        Google Drive API Key
                        <span className="ml-1 text-gray-400 font-normal">(needed for live stats)</span>
                      </label>
                      <input
                        value={trackingForm.api_key}
                        onChange={e => setTrackingForm(f => ({ ...f, api_key: e.target.value }))}
                        placeholder="AIzaSy..."
                        type="password"
                        className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                      />
                    </div>
                  </div>
                  {trackingError && <p className="text-xs text-red-500">{trackingError}</p>}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={addTrackingDoc}
                      disabled={trackingAdding || !trackingForm.url.trim()}
                      className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {trackingAdding ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                      Save
                    </button>
                    <button
                      onClick={() => { setShowTrackingForm(false); setTrackingError('') }}
                      className="text-xs text-gray-500 hover:text-gray-800 px-3 py-2"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Doc list */}
              {trackingDocsLoading ? (
                <div className="flex items-center justify-center h-24 text-gray-400 text-xs gap-2">
                  <Loader2 size={14} className="animate-spin" /> Loading…
                </div>
              ) : trackingDocs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                  <Activity size={28} className="mb-2 text-gray-200" />
                  <p className="text-sm">No tracking docs yet</p>
                  <p className="text-xs text-gray-300 mt-1">Add a Google Sheet or Doc to track edit activity</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {trackingDocs.map(doc => {
                    const live = liveStats.find(s => s.id === doc.id)
                    const typeColor: Record<string, string> = {
                      sheets: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                      docs:   'bg-blue-100 text-blue-700 border-blue-200',
                      slides: 'bg-amber-100 text-amber-700 border-amber-200',
                      other:  'bg-gray-100 text-gray-600 border-gray-200',
                    }
                    return (
                      <div key={doc.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                        <div className="flex items-start gap-3">
                          <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold border ${typeColor[doc.doc_type] || typeColor.other}`}>
                            {doc.doc_type === 'sheets' ? 'SH' : doc.doc_type === 'docs' ? 'DO' : doc.doc_type === 'slides' ? 'SL' : '??'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-gray-800 truncate">{doc.title}</p>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border capitalize ${typeColor[doc.doc_type] || typeColor.other}`}>
                                {doc.doc_type}
                              </span>
                              {!doc.has_api_key && (
                                <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">
                                  no API key
                                </span>
                              )}
                            </div>
                            <a href={doc.url} target="_blank" rel="noopener noreferrer"
                               className="text-xs text-blue-500 hover:underline truncate block mt-0.5">
                              {doc.url}
                            </a>
                            {live && (
                              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                                {live.stats?.error ? (
                                  <span className="text-red-500">{live.stats.error}</span>
                                ) : (
                                  <>
                                    <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                                      <Activity size={11} /> {live.stats?.version ?? '—'} edits
                                    </span>
                                    {live.stats?.last_modifier && (
                                      <span className="text-gray-500">Last: {live.stats.last_modifier}</span>
                                    )}
                                    {live.stats?.modified_time && (
                                      <span className="text-gray-400">
                                        {new Date(live.stats.modified_time).toLocaleDateString()}
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => removeTrackingDoc(doc.id)}
                            className="shrink-0 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Info note */}
              <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 text-xs text-blue-700">
                <p className="font-semibold mb-1">How it works</p>
                <p>The "edit count" is the document's version number from the Google Drive API, which increments with each save. PM analytics automatically include this data when calculating the performance score. Files must be shared publicly or via domain to use an API key.</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
