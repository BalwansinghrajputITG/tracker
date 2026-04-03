import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  ClipboardList, Plus, Check, X, Smile, Frown, Meh, ThumbsUp, ThumbsDown,
} from 'lucide-react'
import { RootState } from '../../store'
import { fetchDashboardRequest } from '../../store/slices/dashboardSlice'
import { submitReportRequest, resetSubmitStatus } from '../../store/slices/reportsSlice'

const MOODS = [
  { icon: <ThumbsUp size={16} />,  value: 'great',   label: 'Great',   active: 'bg-emerald-500 text-white border-emerald-500', inactive: 'border-gray-200 text-gray-500 hover:border-emerald-300' },
  { icon: <Smile size={16} />,     value: 'good',    label: 'Good',    active: 'bg-blue-500 text-white border-blue-500',     inactive: 'border-gray-200 text-gray-500 hover:border-blue-300' },
  { icon: <Meh size={16} />,       value: 'neutral', label: 'Neutral', active: 'bg-amber-500 text-white border-amber-500',   inactive: 'border-gray-200 text-gray-500 hover:border-amber-300' },
  { icon: <Frown size={16} />,     value: 'stressed', label: 'Stressed', active: 'bg-orange-500 text-white border-orange-500', inactive: 'border-gray-200 text-gray-500 hover:border-orange-300' },
  { icon: <ThumbsDown size={16} />, value: 'blocked', label: 'Blocked', active: 'bg-red-500 text-white border-red-500',      inactive: 'border-gray-200 text-gray-500 hover:border-red-300' },
]

const TASK_STATUSES = ['todo', 'in_progress', 'review', 'blocked', 'done']
const STATUS_STYLES: Record<string, { header: string; dot: string }> = {
  todo:        { header: 'bg-gray-100 text-gray-600',   dot: 'bg-gray-400' },
  in_progress: { header: 'bg-blue-50 text-blue-600',    dot: 'bg-blue-500' },
  review:      { header: 'bg-purple-50 text-purple-600', dot: 'bg-purple-500' },
  blocked:     { header: 'bg-red-50 text-red-600',      dot: 'bg-red-500' },
  done:        { header: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
}
const PRIORITY_STYLES: Record<string, string> = {
  critical: 'bg-red-100 text-red-600',
  high:     'bg-orange-100 text-orange-600',
  medium:   'bg-amber-100 text-amber-600',
  low:      'bg-gray-100 text-gray-500',
}

export const EmployeeDashboard: React.FC = () => {
  const dispatch = useDispatch()
  const { data } = useSelector((s: RootState) => s.dashboard)
  const { submitSuccess, isLoading: reportLoading } = useSelector((s: RootState) => s.reports)
  const [showReportForm, setShowReportForm] = useState(false)
  const [report, setReport] = useState({
    project_id: '',
    report_date: new Date().toISOString().split('T')[0],
    tasks_completed: [{ description: '', hours_spent: 1, status: 'completed' }],
    tasks_planned: [''],
    blockers: [''],
    hours_worked: 8,
    unstructured_notes: '',
    mood: 'good',
  })

  useEffect(() => {
    dispatch(fetchDashboardRequest('employee'))
  }, [])

  useEffect(() => {
    if (submitSuccess) {
      setShowReportForm(false)
      dispatch(resetSubmitStatus())
      dispatch(fetchDashboardRequest('employee'))
    }
  }, [submitSuccess])

  const tasks = data?.tasks || []
  const reportSubmitted = data?.report_submitted_today

  const tasksByStatus = TASK_STATUSES.reduce<Record<string, any[]>>((acc, s) => {
    acc[s] = tasks.filter((t: any) => t.status === s)
    return acc
  }, {})

  const handleSubmitReport = () => {
    const payload = {
      ...report,
      tasks_completed: report.tasks_completed.filter(t => t.description),
      tasks_planned: report.tasks_planned.filter(Boolean),
      blockers: report.blockers.filter(Boolean),
    }
    dispatch(submitReportRequest(payload))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Workspace</h1>
          <p className="text-gray-500 text-sm mt-1">Your tasks and today's progress</p>
        </div>
        <div className="flex gap-3">
          {!reportSubmitted ? (
            <button
              onClick={() => setShowReportForm(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-emerald-200 hover:scale-105 transition-all duration-200"
            >
              <ClipboardList size={15} />
              Submit Daily Report
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2.5 rounded-xl text-sm font-medium border border-emerald-200">
              <Check size={15} />
              Report submitted today
            </div>
          )}
        </div>
      </div>

      {/* Task Kanban */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
        <div className="flex items-center gap-2 mb-4">
          <ClipboardList size={16} className="text-gray-500" />
          <h3 className="font-semibold text-gray-800 text-sm">My Tasks</h3>
          <span className="ml-auto text-xs text-gray-400">{tasks.length} total</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 overflow-x-auto">
          {TASK_STATUSES.map((status, i) => {
            const style = STATUS_STYLES[status]
            return (
              <div key={status} className="min-w-[140px] animate-fade-in-up" style={{ animationDelay: `${0.1 + i * 0.05}s` }}>
                <div className={`text-xs font-semibold uppercase tracking-wide mb-2.5 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 ${style.header}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                  {status.replace('_', ' ')}
                  <span className="ml-auto opacity-70">{tasksByStatus[status]?.length || 0}</span>
                </div>
                <div className="space-y-2">
                  {(tasksByStatus[status] || []).map((task: any) => (
                    <div
                      key={task.id}
                      className="bg-gray-50 rounded-xl p-3 border border-gray-100 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-150 cursor-pointer"
                    >
                      <p className="text-xs font-medium text-gray-800 line-clamp-2 leading-snug">{task.title}</p>
                      <div className="flex items-center gap-1 mt-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${PRIORITY_STYLES[task.priority] || 'bg-gray-100 text-gray-500'}`}>
                          {task.priority}
                        </span>
                      </div>
                      {task.due_date && (
                        <p className="text-xs text-gray-400 mt-1.5">
                          {new Date(task.due_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Daily Report Modal */}
      {showReportForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-scale-in">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center">
                  <ClipboardList size={15} className="text-emerald-600" />
                </div>
                <h2 className="text-lg font-semibold text-gray-800">Daily Report</h2>
              </div>
              <button
                onClick={() => setShowReportForm(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={report.report_date}
                    onChange={e => setReport({ ...report, report_date: e.target.value })}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hours Worked</label>
                  <input
                    type="number"
                    min={1} max={16} step={0.5}
                    value={report.hours_worked}
                    onChange={e => setReport({ ...report, hours_worked: Number(e.target.value) })}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Mood */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">How are you feeling?</label>
                <div className="flex gap-2 flex-wrap">
                  {MOODS.map(m => (
                    <button
                      key={m.value}
                      onClick={() => setReport({ ...report, mood: m.value })}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm border font-medium transition-all duration-150 hover:scale-105 ${
                        report.mood === m.value ? m.active : m.inactive
                      }`}
                    >
                      {m.icon}
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tasks Completed */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tasks Completed</label>
                <div className="space-y-2">
                  {report.tasks_completed.map((task, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        value={task.description}
                        onChange={e => {
                          const updated = [...report.tasks_completed]
                          updated[i] = { ...updated[i], description: e.target.value }
                          setReport({ ...report, tasks_completed: updated })
                        }}
                        placeholder="Task description..."
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="number"
                        min={0.5} max={16} step={0.5}
                        value={task.hours_spent}
                        onChange={e => {
                          const updated = [...report.tasks_completed]
                          updated[i] = { ...updated[i], hours_spent: Number(e.target.value) }
                          setReport({ ...report, tasks_completed: updated })
                        }}
                        className="w-16 border border-gray-200 rounded-xl px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setReport({ ...report, tasks_completed: [...report.tasks_completed, { description: '', hours_spent: 1, status: 'completed' }] })}
                  className="flex items-center gap-1.5 text-blue-600 text-sm mt-2 hover:text-blue-700 font-medium"
                >
                  <Plus size={14} />
                  Add task
                </button>
              </div>

              {/* Blockers */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Blockers (if any)</label>
                <div className="space-y-2">
                  {report.blockers.map((b, i) => (
                    <input
                      key={i}
                      value={b}
                      onChange={e => {
                        const updated = [...report.blockers]
                        updated[i] = e.target.value
                        setReport({ ...report, blockers: updated })
                      }}
                      placeholder="Describe a blocker..."
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes</label>
                <textarea
                  value={report.unstructured_notes}
                  onChange={e => setReport({ ...report, unstructured_notes: e.target.value })}
                  placeholder="Any other updates, context, or notes..."
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setShowReportForm(false)}
                className="px-5 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitReport}
                disabled={reportLoading}
                className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white px-6 py-2 rounded-xl text-sm font-semibold hover:shadow-md disabled:opacity-50 transition-all"
              >
                {reportLoading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Check size={15} />
                    Submit Report
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
