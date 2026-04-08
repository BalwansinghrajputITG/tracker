import React, { useEffect, useState } from 'react'
import {
  Loader2, Plus, Trash2, Save, Activity, RefreshCw,
} from 'lucide-react'
import { api } from '../../utils/api'
import { useToast } from '../shared'

// ─── Tracking Docs Tab ───────────────────────────────────────────────────────

export const TrackingTab: React.FC<{ projectId: string }> = ({ projectId }) => {
  const toast = useToast()
  const [trackingDocs, setTrackingDocs]         = useState<any[]>([])
  const [trackingDocsLoading, setTrackingDocsLoading] = useState(false)
  const [liveStats, setLiveStats]               = useState<any[]>([])
  const [liveLoading, setLiveLoading]           = useState(false)
  const [trackingForm, setTrackingForm]         = useState({ url: '', title: '', api_key: '' })
  const [trackingAdding, setTrackingAdding]     = useState(false)
  const [trackingError, setTrackingError]       = useState('')
  const [showTrackingForm, setShowTrackingForm] = useState(false)

  useEffect(() => { loadTrackingDocs() }, [projectId]) // eslint-disable-line

  const loadTrackingDocs = async () => {
    setTrackingDocsLoading(true)
    try { const r = await api.get(`/projects/${projectId}/tracking-docs`); setTrackingDocs(r.data.tracking_docs || []) } catch {}
    finally { setTrackingDocsLoading(false) }
  }

  const fetchLiveStats = async () => {
    setLiveLoading(true)
    try { const r = await api.get(`/projects/${projectId}/tracking-docs/live`); setLiveStats(r.data.docs || []) } catch {}
    finally { setLiveLoading(false) }
  }

  const addTrackingDoc = async () => {
    if (!trackingForm.url.trim()) return
    setTrackingAdding(true); setTrackingError('')
    try { await api.post(`/projects/${projectId}/tracking-docs`, trackingForm); setTrackingForm({ url: '', title: '', api_key: '' }); setShowTrackingForm(false); toast.success('Tracking doc added'); await loadTrackingDocs() }
    catch (err: any) { const msg = err?.response?.data?.detail || 'Failed to add tracking doc'; toast.error(msg); setTrackingError(msg) }
    finally { setTrackingAdding(false) }
  }

  const removeTrackingDoc = async (docId: string) => {
    try { await api.delete(`/projects/${projectId}/tracking-docs/${docId}`); setTrackingDocs(prev => prev.filter(d => d.id !== docId)); setLiveStats(prev => prev.filter(d => d.id !== docId)); toast.success('Tracking doc removed') } catch { toast.error('Failed to remove tracking doc') }
  }

  const typeColor: Record<string, string> = {
    sheets: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    docs: 'bg-blue-100 text-blue-700 border-blue-200',
    slides: 'bg-amber-100 text-amber-700 border-amber-200',
    other: 'bg-gray-100 text-gray-600 border-gray-200',
  }

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex items-center justify-between">
        <div><h3 className="text-sm font-semibold text-gray-800">Google Sheets & Docs Tracking</h3><p className="text-xs text-gray-400 mt-0.5">Track edit activity for performance analytics</p></div>
        <div className="flex items-center gap-2">
          <button onClick={fetchLiveStats} disabled={liveLoading || trackingDocs.length === 0} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-40 transition-colors"><RefreshCw size={12} className={liveLoading ? 'animate-spin' : ''} />{liveLoading ? 'Fetching…' : 'Fetch Live Stats'}</button>
          <button onClick={() => setShowTrackingForm(v => !v)} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"><Plus size={12} /> Add Doc</button>
        </div>
      </div>

      {showTrackingForm && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
          <h4 className="text-xs font-semibold text-gray-700">Add Google Sheet / Doc</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><label className="block text-xs font-medium text-gray-500 mb-1">Google Sheets / Docs URL *</label><input value={trackingForm.url} onChange={e => setTrackingForm(f => ({ ...f, url: e.target.value }))} placeholder="https://docs.google.com/spreadsheets/d/..." className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" /></div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Title (optional)</label><input value={trackingForm.title} onChange={e => setTrackingForm(f => ({ ...f, title: e.target.value }))} placeholder="Sprint Tracker" className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" /></div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Google Drive API Key<span className="ml-1 text-gray-400 font-normal">(needed for live stats)</span></label><input value={trackingForm.api_key} onChange={e => setTrackingForm(f => ({ ...f, api_key: e.target.value }))} placeholder="AIzaSy..." type="password" className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" /></div>
          </div>
          {trackingError && <p className="text-xs text-red-500">{trackingError}</p>}
          <div className="flex items-center gap-2 pt-1"><button onClick={addTrackingDoc} disabled={trackingAdding || !trackingForm.url.trim()} className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">{trackingAdding ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}Save</button><button onClick={() => { setShowTrackingForm(false); setTrackingError('') }} className="text-xs text-gray-500 hover:text-gray-800 px-3 py-2">Cancel</button></div>
        </div>
      )}

      {trackingDocsLoading ? <div className="flex items-center justify-center h-24 text-gray-400 text-xs gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</div> : trackingDocs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-gray-400"><Activity size={28} className="mb-2 text-gray-200" /><p className="text-sm">No tracking docs yet</p><p className="text-xs text-gray-300 mt-1">Add a Google Sheet or Doc to track edit activity</p></div>
      ) : (
        <div className="space-y-3">
          {trackingDocs.map(doc => {
            const live = liveStats.find(s => s.id === doc.id)
            return (
              <div key={doc.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start gap-3">
                  <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold border ${typeColor[doc.doc_type] || typeColor.other}`}>
                    {doc.doc_type === 'sheets' ? 'SH' : doc.doc_type === 'docs' ? 'DO' : doc.doc_type === 'slides' ? 'SL' : '??'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-800 truncate">{doc.title}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border capitalize ${typeColor[doc.doc_type] || typeColor.other}`}>{doc.doc_type}</span>
                      {!doc.has_api_key && <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">no API key</span>}
                    </div>
                    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline truncate block mt-0.5">{doc.url}</a>
                    {live && (
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                        {live.stats?.error ? <span className="text-red-500">{live.stats.error}</span> : (
                          <>
                            <span className="flex items-center gap-1 text-emerald-700 font-semibold"><Activity size={11} /> {live.stats?.version ?? '—'} edits</span>
                            {live.stats?.last_modifier && <span className="text-gray-500">Last: {live.stats.last_modifier}</span>}
                            {live.stats?.modified_time && <span className="text-gray-400">{new Date(live.stats.modified_time).toLocaleDateString()}</span>}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <button onClick={() => removeTrackingDoc(doc.id)} className="shrink-0 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={13} /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 text-xs text-blue-700">
        <p className="font-semibold mb-1">How it works</p>
        <p>The "edit count" is the document's version number from the Google Drive API, which increments with each save. PM analytics automatically include this data when calculating the performance score. Files must be shared publicly or via domain to use an API key.</p>
      </div>
    </div>
  )
}
