import React, { useEffect, useState, useCallback } from 'react'
import {
  AlertTriangle, Loader2, CheckCircle2, ChevronDown, ChevronUp,
  RefreshCw, X, Eye, EyeOff, Save, Settings, Trash2,
} from 'lucide-react'
import { api } from '../../utils/api'
import { useToast } from '../shared'
import { fmt } from './projectTypes'
import {
  GitHubDataDisplay, FigmaDataDisplay, JiraDataDisplay, LinearDataDisplay,
  NotionDataDisplay, SemrushDataDisplay, VercelDataDisplay, SlackDataDisplay,
} from './ToolDataDisplays'

// ─── Tool Data Panel ──────────────────────────────────────────────────────────

export const ToolDataPanel: React.FC<{
  tool: any
  projectId: string
  canManage: boolean
}> = ({ tool, projectId, canManage }) => {
  const toast = useToast()
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
      toast.success('Credentials saved')
      await fetchData()
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to save credentials'
      toast.error(msg)
      setError(msg)
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
      toast.success('Integration removed')
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to remove'
      toast.error(msg)
      setError(msg)
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
