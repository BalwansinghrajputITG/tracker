import React from 'react'
import {
  Calendar, AlertTriangle, CheckCircle2, Loader2, User,
} from 'lucide-react'
import { TASK_STATUS_COLORS, TASK_PRIORITY_COLORS } from '../projectsConstants'

interface TasksTabProps {
  detailProject: any
  detailLoading: boolean
}

export const TasksTab: React.FC<TasksTabProps> = ({ detailProject, detailLoading }) => {
  return (
    <div className="space-y-4">
      {detailLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-blue-500" /></div>
      ) : !detailProject?.tasks?.length ? (
        <div className="text-center py-12 text-gray-400">
          <CheckCircle2 size={28} className="mx-auto mb-2 text-gray-200" />
          <p className="text-sm">No tasks yet</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {Object.entries(
              detailProject.tasks.reduce((acc: any, t: any) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc }, {})
            ).map(([status, count]) => (
              <span key={status} className={`text-xs px-2.5 py-1 rounded-xl font-semibold ${TASK_STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
                {status.replace('_', ' ')} · {count as number}
              </span>
            ))}
          </div>
          <div className="space-y-2">
            {detailProject.tasks.map((t: any) => (
              <div key={t.id} className={`p-3 rounded-2xl border transition-colors ${t.is_blocked ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100 hover:border-blue-100'}`}>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <p className={`text-sm font-medium leading-snug ${t.is_blocked ? 'text-red-700' : 'text-gray-800'}`}>{t.title}</p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${TASK_STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-600'}`}>
                      {t.status.replace('_', ' ')}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${TASK_PRIORITY_COLORS[t.priority] || 'bg-gray-100 text-gray-500'}`}>
                      {t.priority}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  {t.due_date && (
                    <span className="flex items-center gap-1"><Calendar size={10} />{new Date(t.due_date).toLocaleDateString()}</span>
                  )}
                  {t.is_blocked && <span className="text-red-500 font-medium flex items-center gap-1"><AlertTriangle size={10} /> Blocked</span>}
                  {t.assignees?.length > 0 && (
                    <span className="flex items-center gap-1">
                      <User size={10} />
                      {t.assignees.map((a: any) => a.name).join(', ')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
