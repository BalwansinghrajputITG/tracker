import React from 'react'
import { X, Loader, AlertTriangle } from 'lucide-react'
import { Modal } from '../../common/Modal'
import {
  STATUS_COLS, STATUS_LABELS, STATUS_COLORS,
  PRIORITY_COLORS, PRIORITY_DOT,
} from './employeeConstants'

interface TaskDetailModalProps {
  task: any | null
  onClose: () => void
  onStatusChange: (newStatus: string) => void
  loading: boolean
  editForm: any
  statusUpdating: boolean
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  task,
  onClose,
  onStatusChange,
  loading,
  editForm,
  statusUpdating,
}) => {
  if (!task) return null

  return (
    <Modal onClose={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl animate-scale-in">

        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[task.priority] || 'bg-gray-400'}`} />
              <span className={`text-xs px-2 py-0.5 rounded-lg font-semibold ${PRIORITY_COLORS[task.priority] || 'bg-gray-100 text-gray-500'}`}>
                {task.priority} priority
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-lg font-semibold ${STATUS_COLORS[task.status] || 'bg-gray-100'}`}>
                {STATUS_LABELS[task.status] || task.status}
              </span>
            </div>
            <h2 className="text-base font-bold text-gray-900 leading-snug">{task.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader size={22} className="animate-spin text-blue-500" />
          </div>
        ) : (
          <div className="p-5 space-y-5">

            {task.description && (
              <p className="text-sm text-gray-600 leading-relaxed">{task.description}</p>
            )}

            {/* Status update */}
            {editForm && (
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Update Status</label>
                <div className="grid grid-cols-3 gap-2">
                  {STATUS_COLS.map(s => (
                    <button
                      key={s}
                      disabled={statusUpdating}
                      onClick={() => onStatusChange(s)}
                      className={`py-2 px-2 rounded-xl text-xs font-semibold border-2 transition-all ${
                        editForm.status === s
                          ? `${STATUS_COLORS[s]} border-current shadow-sm`
                          : 'bg-white border-gray-100 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                      }`}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
                {statusUpdating && (
                  <p className="text-xs text-blue-500 mt-2 flex items-center gap-1">
                    <Loader size={11} className="animate-spin" /> Saving…
                  </p>
                )}
              </div>
            )}

            {/* Assignees */}
            {task.assignees?.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Assigned to</label>
                <div className="flex flex-wrap gap-2">
                  {task.assignees.map((a: any) => (
                    <span key={a.id} className="flex items-center gap-2 text-xs bg-blue-50 text-blue-700 px-2.5 py-1.5 rounded-lg font-semibold">
                      <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold">
                        {a.name?.[0]?.toUpperCase()}
                      </div>
                      {a.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Meta info */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                ['Est.', `${task.estimated_hours ?? 0}h`],
                ['Logged', `${task.logged_hours ?? 0}h`],
                ...(task.due_date ? [['Due', new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })]] : []),
              ].map(([label, value]) => (
                <div key={label} className="bg-gray-50 rounded-xl px-3 py-2.5 text-center">
                  <p className="text-gray-400 mb-0.5 text-[10px] uppercase tracking-wide font-medium">{label}</p>
                  <p className="font-bold text-gray-700 text-sm">{value}</p>
                </div>
              ))}
            </div>

            {/* Blocked banner */}
            {task.is_blocked && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-start gap-2">
                <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-red-700 font-semibold">Blocked</p>
                  <p className="text-xs text-red-500 mt-0.5">{task.blocked_reason || 'No reason specified'}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
