import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  FileText, Plus, X, CheckCircle2, AlertTriangle, ArrowRight,
  ThumbsUp, Smile, Meh, Frown, ThumbsDown, Loader2, Trash2, Pencil, Save, User,
} from 'lucide-react'
import { Modal } from '../components/common/Modal'
import { Pagination } from '../components/common/Pagination'
import { RootState } from '../store'
import {
  fetchReportsRequest, fetchMissingRequest,
  submitReportRequest, resetSubmitStatus,
} from '../store/slices/reportsSlice'

import { fetchProjectsRequest } from '../store/slices/projectsSlice'
import { api } from '../utils/api'

const MOOD_OPTIONS = [
  { value: 'great',    label: 'Great',    icon: <ThumbsUp size={14} />,    color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  { value: 'good',     label: 'Good',     icon: <Smile size={14} />,       color: 'bg-blue-50 text-blue-700 border-blue-200',         dot: 'bg-blue-500' },
  { value: 'neutral',  label: 'Neutral',  icon: <Meh size={14} />,         color: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-500' },
  { value: 'stressed', label: 'Stressed', icon: <Frown size={14} />,       color: 'bg-orange-50 text-orange-700 border-orange-200',    dot: 'bg-orange-500' },
  { value: 'burned_out', label: 'Burned Out', icon: <ThumbsDown size={14} />, color: 'bg-red-50 text-red-700 border-red-200',         dot: 'bg-red-500' },
]

const emptyForm = {
  project_id: '',
  report_date: new Date().toISOString().split('T')[0],
  hours_worked: 8,
  tasks_completed: '',
  tasks_planned: '',
  blockers: '',
  mood: 'good',
  unstructured_notes: '',
}

export const ReportsPage: React.FC = () => {
  const dispatch = useDispatch()
  const { items, missing, total, isLoading, submitLoading, submitSuccess, submitError, error } = useSelector((s: RootState) => s.reports)
  const { items: projects } = useSelector((s: RootState) => s.projects)
  const { user } = useSelector((s: RootState) => s.auth)

  const [page, setPage]   = useState(1)
  const [limit, setLimit] = useState(10)
  const [activeTab, setActiveTab] = useState<'reports' | 'submit' | 'missing'>('reports')
  const [form, setForm] = useState(emptyForm)
  const [selectedReport, setSelectedReport] = useState<any>(null)
  const [reportConfirmDelete, setReportConfirmDelete] = useState(false)
  const [reportDeleteLoading, setReportDeleteLoading] = useState(false)
  const [reportDeleteError, setReportDeleteError] = useState('')
  const [submitBanner, setSubmitBanner] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState<any>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')

  const isManager = ['ceo', 'coo', 'pm', 'team_lead'].includes(user?.primary_role || '')

  useEffect(() => {
    dispatch(fetchReportsRequest({ page, limit }))
    dispatch(fetchProjectsRequest({}))
    if (isManager) dispatch(fetchMissingRequest())
  }, [page, limit])

  useEffect(() => {
    if (submitSuccess) {
      setForm(emptyForm)
      setSubmitBanner(true)
      setActiveTab('reports')
      dispatch(fetchReportsRequest({ page, limit }))
      dispatch(resetSubmitStatus())
      setTimeout(() => setSubmitBanner(false), 4000)
    }
  }, [submitSuccess])

  const handleSubmit = () => {
    if (!form.project_id) return
    const payload = {
      project_id: form.project_id,
      report_date: form.report_date,
      mood: form.mood,
      unstructured_notes: form.unstructured_notes,
      structured_data: {
        hours_worked: form.hours_worked,
        tasks_completed: form.tasks_completed.split('\n').filter(Boolean).map(t => ({ task: t.trim() })),
        tasks_planned: form.tasks_planned.split('\n').filter(Boolean).map(t => t.trim()),
        blockers: form.blockers.split('\n').filter(Boolean).map(t => t.trim()),
      },
    }
    dispatch(submitReportRequest(payload))
  }

  type ReportTab = 'reports' | 'submit' | 'missing'
  const tabs: Array<{ key: ReportTab; label: string }> = [
    { key: 'reports', label: 'All Reports' },
    { key: 'submit',  label: 'Submit Report' },
    ...(isManager ? [{ key: 'missing' as ReportTab, label: `Missing (${missing.length})` }] : []),
  ]

  const getMood = (val: string) => MOOD_OPTIONS.find(m => m.value === val)

  const openEdit = (report: any) => {
    const sd = report.structured_data || {}
    setEditForm({
      mood: report.mood || 'good',
      unstructured_notes: report.unstructured_notes || '',
      hours_worked: sd.hours_worked ?? 8,
      tasks_completed: (sd.tasks_completed || []).map((t: any) => typeof t === 'string' ? t : t.task).join('\n'),
      tasks_planned: (sd.tasks_planned || []).join('\n'),
      blockers: (sd.blockers || []).join('\n'),
    })
    setEditMode(true)
    setEditError('')
  }

  const handleEditSave = async () => {
    setEditLoading(true)
    setEditError('')
    try {
      await api.put(`/reports/${selectedReport.id}`, {
        mood: editForm.mood,
        unstructured_notes: editForm.unstructured_notes,
        structured_data: {
          hours_worked: editForm.hours_worked,
          tasks_completed: editForm.tasks_completed.split('\n').filter(Boolean).map((t: string) => ({ task: t.trim() })),
          tasks_planned: editForm.tasks_planned.split('\n').filter(Boolean).map((t: string) => t.trim()),
          blockers: editForm.blockers.split('\n').filter(Boolean).map((t: string) => t.trim()),
        },
      })
      setEditMode(false)
      setSelectedReport(null)
      dispatch(fetchReportsRequest({ page, limit }))
    } catch (err: any) {
      setEditError(err?.response?.data?.detail || 'Failed to update report')
    } finally {
      setEditLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500 text-sm mt-1">{total} total reports</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-150 -mb-px ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {submitBanner && (
        <div className="bg-emerald-50 text-emerald-700 text-sm px-4 py-3 rounded-xl border border-emerald-100 flex items-center gap-2 animate-fade-in">
          <CheckCircle2 size={14} className="shrink-0" />
          Report submitted successfully!
        </div>
      )}

      {(error || submitError) && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-100 flex items-center gap-2 animate-fade-in">
          <AlertTriangle size={14} className="shrink-0" />
          {submitError || error}
        </div>
      )}

      {/* Reports List */}
      {activeTab === 'reports' && (
        <div className="space-y-3">
          {isLoading && items.length === 0 ? (
            [...Array(4)].map((_, i) => <div key={i} className="h-20 skeleton" />)
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 animate-fade-in">
              <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
                <FileText size={22} className="text-gray-300" />
              </div>
              <p className="text-sm font-medium">No reports found</p>
            </div>
          ) : (
            items.map((report, i) => {
              const project = projects.find(p => p.id === report.project_id)
              const mood = getMood(report.mood)
              return (
                <div
                  key={report.id}
                  onClick={() => setSelectedReport(report)}
                  className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 card-hover cursor-pointer animate-fade-in-up"
                  style={{ animationDelay: `${i * 0.04}s` }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-800">{project?.name || report.project_id}</span>
                        {report.is_late_submission && (
                          <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-lg font-medium">Late</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span>{new Date(report.report_date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
                        {report.user_name && report.user_name !== 'Unknown' && (
                          <span className="flex items-center gap-1">
                            <User size={10} />
                            {report.user_name}
                            {report.user_department ? ` · ${report.user_department}` : ''}
                          </span>
                        )}
                      </div>
                      {report.unstructured_notes && (
                        <p className="text-sm text-gray-600 mt-1.5 line-clamp-2">{report.unstructured_notes}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 ml-4 shrink-0">
                      {mood && (
                        <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-xl border font-medium ${mood.color}`}>
                          {mood.icon}
                          {mood.label}
                        </div>
                      )}
                      <span className="text-xs text-gray-400 font-medium">{report.structured_data?.hours_worked}h</span>
                    </div>
                  </div>
                  {report.structured_data?.blockers?.length > 0 && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 rounded-lg px-2.5 py-1">
                      <AlertTriangle size={11} />
                      {report.structured_data.blockers.length} blocker(s)
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {activeTab === 'reports' && (
        <Pagination
          page={page}
          totalPages={Math.ceil(total / limit)}
          total={total}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={l => { setLimit(l); setPage(1) }}
          limitOptions={[5, 10, 20]}
        />
      )}

      {/* Submit Form */}
      {activeTab === 'submit' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5 max-w-2xl animate-fade-in-up">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center">
              <FileText size={15} className="text-emerald-600" />
            </div>
            <h2 className="text-base font-semibold text-gray-800">Daily Report</h2>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project *</label>
              <select value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50">
                <option value="">Select project...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Report Date</label>
              <input type="date" value={form.report_date} max={new Date().toISOString().split('T')[0]} onChange={e => setForm({ ...form, report_date: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hours Worked</label>
            <input type="number" value={form.hours_worked} min={0} max={24} onChange={e => setForm({ ...form, hours_worked: Number(e.target.value) })} className="w-28 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Mood</label>
            <div className="flex gap-2 flex-wrap">
              {MOOD_OPTIONS.map(m => (
                <button
                  key={m.value}
                  onClick={() => setForm({ ...form, mood: m.value })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs border font-medium transition-all hover:scale-105 ${
                    form.mood === m.value ? m.color + ' shadow-sm' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          </div>

          {[
            { label: 'Tasks Completed (one per line)', key: 'tasks_completed', placeholder: 'Finished login UI\nFixed auth bug' },
            { label: 'Planned for Tomorrow (one per line)', key: 'tasks_planned', placeholder: 'Implement dashboard' },
            { label: 'Blockers (one per line)', key: 'blockers', placeholder: 'Waiting for API spec' },
          ].map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <textarea value={(form as any)[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder} rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all resize-none" />
            </div>
          ))}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes</label>
            <textarea value={form.unstructured_notes} onChange={e => setForm({ ...form, unstructured_notes: e.target.value })} placeholder="Any context or observations..." rows={4} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all resize-none" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setForm(emptyForm)} disabled={submitLoading} className="px-5 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium disabled:opacity-40">Reset</button>
            <button onClick={handleSubmit} disabled={!form.project_id || submitLoading} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-all">
              {submitLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {submitLoading ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </div>
      )}

      {/* Missing Reports */}
      {activeTab === 'missing' && isManager && (
        <div className="space-y-3 animate-fade-in-up">
          {missing.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 animate-fade-in">
              <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mb-3">
                <CheckCircle2 size={22} className="text-emerald-400" />
              </div>
              <p className="text-sm font-medium">All reports submitted</p>
            </div>
          ) : (
            <>
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 flex items-center gap-2 animate-fade-in">
                <AlertTriangle size={15} className="text-orange-500" />
                <p className="text-sm text-orange-700 font-medium">{missing.length} member(s) haven't submitted today's report</p>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      {['Name', 'Department', 'Role', 'Last Report'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {missing.map((m: any, i: number) => (
                      <tr key={m.user_id} className="hover:bg-gray-50 transition-colors animate-fade-in" style={{ animationDelay: `${i * 0.03}s` }}>
                        <td className="px-4 py-3 font-medium text-gray-800">{m.full_name}</td>
                        <td className="px-4 py-3 text-gray-500">{m.department || '—'}</td>
                        <td className="px-4 py-3 text-gray-500 capitalize">{m.primary_role?.replace('_', ' ') || '—'}</td>
                        <td className="px-4 py-3 text-gray-400">{m.last_report_date ? new Date(m.last_report_date).toLocaleDateString() : 'Never'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Report Detail Modal */}
      {selectedReport && (
        <Modal onClose={() => { setSelectedReport(null); setReportConfirmDelete(false); setReportDeleteError(''); setEditMode(false); setEditError('') }}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl animate-scale-in">

            {/* Header */}
            <div className="px-7 py-5 border-b border-gray-100 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-gray-900">
                    {projects.find(p => p.id === selectedReport.project_id)?.name || 'Daily Report'}
                  </h2>
                  {selectedReport.is_late_submission && (
                    <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-lg font-semibold">Late</span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {new Date(selectedReport.report_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
                {/* Submitter info */}
                {selectedReport.user_name && (
                  <div className="flex items-center gap-2 mt-2.5">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {selectedReport.user_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-gray-800">{selectedReport.user_name}</span>
                      {selectedReport.user_department && (
                        <span className="text-xs text-gray-400 ml-2">· {selectedReport.user_department}</span>
                      )}
                      {selectedReport.user_role && (
                        <span className="text-xs text-gray-400 ml-1 capitalize">· {selectedReport.user_role.replace('_', ' ')}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={() => { setSelectedReport(null); setReportConfirmDelete(false); setReportDeleteError(''); setEditMode(false); setEditError('') }}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-7 py-6 space-y-6">
              {(reportDeleteError || editError) && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3 rounded-xl">
                  <AlertTriangle size={13} className="shrink-0" />
                  {reportDeleteError || editError}
                </div>
              )}

              {editMode ? (
                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Mood</label>
                    <div className="flex gap-2 flex-wrap">
                      {MOOD_OPTIONS.map(m => (
                        <button key={m.value} onClick={() => setEditForm({ ...editForm, mood: m.value })}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs border font-medium transition-all ${editForm.mood === m.value ? m.color + ' shadow-sm' : 'border-gray-200 text-gray-500'}`}>
                          {m.icon} {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Hours Worked</label>
                    <input type="number" min={0} max={24} value={editForm.hours_worked}
                      onChange={e => setEditForm({ ...editForm, hours_worked: Number(e.target.value) })}
                      className="w-28 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
                  </div>
                  {[
                    { label: 'Tasks Completed (one per line)', key: 'tasks_completed' },
                    { label: 'Planned for Tomorrow (one per line)', key: 'tasks_planned' },
                    { label: 'Blockers (one per line)', key: 'blockers' },
                  ].map(({ label, key }) => (
                    <div key={key}>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{label}</label>
                      <textarea rows={3} value={editForm[key]}
                        onChange={e => setEditForm({ ...editForm, [key]: e.target.value })}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 resize-none" />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Additional Notes</label>
                    <textarea rows={4} value={editForm.unstructured_notes}
                      onChange={e => setEditForm({ ...editForm, unstructured_notes: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 resize-none" />
                  </div>
                  <div className="flex gap-3 pt-2 border-t border-gray-100">
                    <button onClick={() => { setEditMode(false); setEditError('') }} className="flex-1 py-2.5 text-sm text-gray-600 font-medium border border-gray-200 rounded-xl hover:text-gray-800">Cancel</button>
                    <button onClick={handleEditSave} disabled={editLoading}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
                      {editLoading ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                      {editLoading ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              ) : !reportConfirmDelete ? (
                <>
                  {/* Mood + Hours banner */}
                  {(() => {
                    const mood = getMood(selectedReport.mood)
                    return mood ? (
                      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${mood.color}`}>
                        <span className={`w-3 h-3 rounded-full shrink-0 ${mood.dot}`} />
                        <span className="text-sm font-bold">{mood.label}</span>
                        <div className="ml-auto flex items-center gap-1.5 text-sm font-semibold">
                          <span>{selectedReport.structured_data?.hours_worked ?? 0}h worked</span>
                        </div>
                      </div>
                    ) : null
                  })()}

                  {/* Two-column content grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {selectedReport.structured_data?.tasks_completed?.length > 0 && (
                      <div className="bg-emerald-50/60 rounded-xl p-4">
                        <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <CheckCircle2 size={12} /> Tasks Completed
                        </p>
                        <ul className="space-y-2">
                          {selectedReport.structured_data.tasks_completed.map((t: any, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                              <CheckCircle2 size={13} className="text-emerald-500 mt-0.5 shrink-0" />
                              <span>{typeof t === 'string' ? t : t.task || JSON.stringify(t)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {selectedReport.structured_data?.tasks_planned?.length > 0 && (
                      <div className="bg-blue-50/60 rounded-xl p-4">
                        <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <ArrowRight size={12} /> Planned for Tomorrow
                        </p>
                        <ul className="space-y-2">
                          {selectedReport.structured_data.tasks_planned.map((t: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                              <ArrowRight size={13} className="text-blue-400 mt-0.5 shrink-0" />
                              <span>{t}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {selectedReport.structured_data?.blockers?.length > 0 && (
                    <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
                      <p className="text-xs font-bold text-orange-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <AlertTriangle size={12} /> Blockers
                      </p>
                      <ul className="space-y-2">
                        {selectedReport.structured_data.blockers.map((b: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-orange-700">
                            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selectedReport.unstructured_notes && (
                    <div className="bg-gray-50 rounded-xl p-4">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Additional Notes</p>
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{selectedReport.unstructured_notes}</p>
                    </div>
                  )}

                  {/* Review comment */}
                  {selectedReport.review_comment && (
                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                      <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-1">Manager Review</p>
                      <p className="text-sm text-indigo-800">{selectedReport.review_comment}</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-3 pt-2 border-t border-gray-100">
                    {selectedReport.user_id === user?.user_id && (
                      <button onClick={() => openEdit(selectedReport)}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-50 text-blue-600 rounded-xl text-sm font-medium hover:bg-blue-100 transition-colors">
                        <Pencil size={13} /> Edit
                      </button>
                    )}
                    <button
                      onClick={() => setReportConfirmDelete(true)}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-red-50 text-red-600 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors"
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="bg-red-50 border border-red-100 rounded-xl p-5 text-center">
                    <Trash2 size={24} className="text-red-400 mx-auto mb-2" />
                    <p className="text-sm font-bold text-red-700">Delete this report?</p>
                    <p className="text-xs text-red-500 mt-1">This action cannot be undone.</p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setReportConfirmDelete(false)} className="flex-1 py-2.5 text-sm text-gray-600 font-medium border border-gray-200 rounded-xl hover:text-gray-800">Cancel</button>
                    <button
                      disabled={reportDeleteLoading}
                      onClick={async () => {
                        setReportDeleteLoading(true)
                        setReportDeleteError('')
                        try {
                          await api.delete(`/reports/${selectedReport.id}`)
                          setSelectedReport(null)
                          setReportConfirmDelete(false)
                          dispatch(fetchReportsRequest({}))
                        } catch (err: any) {
                          setReportDeleteError(err?.response?.data?.detail || 'Failed to delete report')
                          setReportDeleteLoading(false)
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50"
                    >
                      {reportDeleteLoading ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      {reportDeleteLoading ? 'Deleting…' : 'Confirm Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
