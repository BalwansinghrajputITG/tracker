import React from 'react'
import { X, Check, Plus, ClipboardList } from 'lucide-react'
import { Modal } from '../../common/Modal'
import { MOODS } from './employeeConstants'

interface DailyReportModalProps {
  show: boolean
  onClose: () => void
  report: any
  onChange: (report: any) => void
  onSubmit: () => void
  loading: boolean
  projects: any[]
}

export const DailyReportModal: React.FC<DailyReportModalProps> = ({
  show,
  onClose,
  report,
  onChange,
  onSubmit,
  loading,
  projects,
}) => {
  if (!show) return null

  return (
    <Modal onClose={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl animate-scale-in flex flex-col"
        style={{ maxHeight: 'calc(100vh - 2rem)' }}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center">
              <ClipboardList size={16} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-800">Daily Report</h2>
              <p className="text-xs text-gray-400">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Project + Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Project <span className="text-red-400">*</span>
              </label>
              <select
                value={report.project_id}
                onChange={e => onChange({ ...report, project_id: e.target.value })}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
              >
                <option value="">Select project...</option>
                {projects.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Date</label>
              <input
                type="date"
                value={report.report_date}
                onChange={e => onChange({ ...report, report_date: e.target.value })}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
              />
            </div>
          </div>

          {/* Hours + Mood */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Hours Worked</label>
              <input
                type="number" min={1} max={16} step={0.5}
                value={report.hours_worked}
                onChange={e => onChange({ ...report, hours_worked: Number(e.target.value) })}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Mood</label>
              <div className="flex gap-1 flex-wrap">
                {MOODS.map(m => (
                  <button
                    key={m.value}
                    onClick={() => onChange({ ...report, mood: m.value })}
                    className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs border font-semibold transition-all ${
                      report.mood === m.value ? m.active : m.inactive
                    }`}
                  >
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tasks Completed */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Tasks Completed</label>
            <div className="space-y-2">
              {report.tasks_completed.map((task: any, i: number) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={task.description}
                    onChange={e => {
                      const updated = [...report.tasks_completed]
                      updated[i] = { ...updated[i], description: e.target.value }
                      onChange({ ...report, tasks_completed: updated })
                    }}
                    placeholder="Task description..."
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
                  />
                  <input
                    type="number" min={0.5} max={16} step={0.5}
                    value={task.hours_spent}
                    onChange={e => {
                      const updated = [...report.tasks_completed]
                      updated[i] = { ...updated[i], hours_spent: Number(e.target.value) }
                      onChange({ ...report, tasks_completed: updated })
                    }}
                    className="w-16 border border-gray-200 rounded-xl px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
                  />
                  {report.tasks_completed.length > 1 && (
                    <button
                      onClick={() => onChange({ ...report, tasks_completed: report.tasks_completed.filter((_: any, j: number) => j !== i) })}
                      className="w-9 h-9 flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-xl transition-all"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => onChange({ ...report, tasks_completed: [...report.tasks_completed, { description: '', hours_spent: 1, status: 'completed' }] })}
              className="flex items-center gap-1.5 text-blue-600 text-xs mt-2 hover:text-blue-700 font-semibold"
            >
              <Plus size={13} /> Add task
            </button>
          </div>

          {/* Blockers */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Blockers <span className="text-gray-400 font-normal text-xs">(optional)</span>
            </label>
            <div className="space-y-2">
              {report.blockers.map((b: string, i: number) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={b}
                    onChange={e => {
                      const updated = [...report.blockers]
                      updated[i] = e.target.value
                      onChange({ ...report, blockers: updated })
                    }}
                    placeholder="Describe a blocker..."
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
                  />
                  {report.blockers.length > 1 && (
                    <button
                      onClick={() => onChange({ ...report, blockers: report.blockers.filter((_: any, j: number) => j !== i) })}
                      className="w-9 h-9 flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-xl transition-all"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => onChange({ ...report, blockers: [...report.blockers, ''] })}
              className="flex items-center gap-1.5 text-blue-600 text-xs mt-2 hover:text-blue-700 font-semibold"
            >
              <Plus size={13} /> Add blocker
            </button>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Additional Notes</label>
            <textarea
              value={report.unstructured_notes}
              onChange={e => onChange({ ...report, unstructured_notes: e.target.value })}
              placeholder="Any other updates or context..."
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-gray-50 focus:bg-white"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 font-semibold rounded-xl hover:bg-gray-100 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={loading || !report.project_id}
            className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:shadow-lg hover:shadow-emerald-200 disabled:opacity-50 transition-all"
          >
            {loading
              ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting…</>
              : <><Check size={15} /> Submit Report</>}
          </button>
        </div>
      </div>
    </Modal>
  )
}
