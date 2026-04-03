import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  ListChecks, Plus, X, AlertTriangle, Clock, Users,
  LayoutGrid, List, Save, Loader,
} from 'lucide-react'
import { Modal } from '../components/common/Modal'
import { Pagination } from '../components/common/Pagination'
import { RootState } from '../store'
import { fetchTasksRequest, createTaskRequest, updateTaskLocal } from '../store/slices/tasksSlice'
import { fetchProjectsRequest } from '../store/slices/projectsSlice'
import { api } from '../utils/api'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLS = ['todo', 'in_progress', 'review', 'done', 'blocked']
const STATUS_LABELS: Record<string, string> = {
  todo: 'To Do', in_progress: 'In Progress', review: 'In Review', done: 'Done', blocked: 'Blocked',
}
const STATUS_COLORS: Record<string, string> = {
  todo:        'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  review:      'bg-purple-100 text-purple-700',
  done:        'bg-emerald-100 text-emerald-700',
  blocked:     'bg-red-100 text-red-700',
}
const HEADER_COLORS: Record<string, { bg: string; dot: string }> = {
  todo:        { bg: 'bg-gray-50 border-gray-200',       dot: 'bg-gray-400' },
  in_progress: { bg: 'bg-blue-50 border-blue-200',       dot: 'bg-blue-500' },
  review:      { bg: 'bg-purple-50 border-purple-200',   dot: 'bg-purple-500' },
  done:        { bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  blocked:     { bg: 'bg-red-50 border-red-200',         dot: 'bg-red-500' },
}
const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-amber-100 text-amber-700',
  low:      'bg-gray-100 text-gray-600',
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500',
  'bg-orange-500', 'bg-pink-500', 'bg-teal-500',
]

function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function initials(name: string) {
  const parts = name.trim().split(' ')
  return parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectMember {
  id: string
  name: string
  role: string
  department: string
}

const emptyForm = {
  title: '', description: '', priority: 'medium',
  project_id: '', assignee_ids: [] as string[],
  due_date: '', estimated_hours: 4,
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const TasksPage: React.FC = () => {
  const dispatch = useDispatch()
  const { items, total, isLoading } = useSelector((s: RootState) => s.tasks)
  const { items: projects } = useSelector((s: RootState) => s.projects)
  const { user } = useSelector((s: RootState) => s.auth)

  const [page, setPage]   = useState(1)
  const [limit, setLimit] = useState(20)
  const [view, setView]   = useState<'kanban' | 'list'>('kanban')
  const [filterProject, setFilterProject] = useState('')
  const [filterPriority, setFilterPriority] = useState('')

  // Create modal
  const [showModal, setShowModal]             = useState(false)
  const [form, setForm]                       = useState(emptyForm)
  const [createMembers, setCreateMembers]     = useState<ProjectMember[]>([])
  const [createMembersLoading, setCreateMembersLoading] = useState(false)

  // Task detail modal
  const [detailTask, setDetailTask]           = useState<any>(null)
  const [detailLoading, setDetailLoading]     = useState(false)
  const [editForm, setEditForm]               = useState<any>(null)
  const [detailMembers, setDetailMembers]     = useState<ProjectMember[]>([])
  const [statusUpdating, setStatusUpdating]   = useState(false)
  const [taskSaving, setTaskSaving]           = useState(false)

  const isManager = ['ceo', 'coo', 'pm', 'team_lead'].includes(user?.primary_role || '')

  useEffect(() => {
    const params: any = { page, limit }
    if (filterProject)  params.project_id = filterProject
    if (filterPriority) params.priority   = filterPriority
    dispatch(fetchTasksRequest(params))
    dispatch(fetchProjectsRequest({}))
  }, [filterProject, filterPriority, page, limit])

  // ── Fetch project members for create/edit assignee picker ──────────────────

  const fetchProjectMembers = async (projectId: string): Promise<ProjectMember[]> => {
    if (!projectId) return []
    try {
      const res = await api.get(`/projects/${projectId}/detail`)
      return res.data.members || []
    } catch {
      return []
    }
  }

  const handleProjectChange = async (projectId: string) => {
    setForm(f => ({ ...f, project_id: projectId, assignee_ids: [] }))
    if (!projectId) { setCreateMembers([]); return }
    setCreateMembersLoading(true)
    const members = await fetchProjectMembers(projectId)
    setCreateMembers(members)
    setCreateMembersLoading(false)
  }

  // ── Open task detail ───────────────────────────────────────────────────────

  const openTaskDetail = async (task: any) => {
    setDetailTask(task)
    setDetailLoading(true)
    setDetailMembers([])
    try {
      const res = await api.get(`/tasks/${task.id}`)
      const full = res.data
      setDetailTask(full)
      setEditForm({
        title:        full.title,
        description:  full.description || '',
        status:       full.status,
        priority:     full.priority,
        due_date:     full.due_date ? full.due_date.substring(0, 10) : '',
        assignee_ids: full.assignee_ids || [],
      })
      if (isManager && full.project_id) {
        const members = await fetchProjectMembers(full.project_id)
        setDetailMembers(members)
      }
    } catch {
      setEditForm({
        title:        task.title,
        description:  task.description || '',
        status:       task.status,
        priority:     task.priority,
        due_date:     task.due_date ? task.due_date.substring(0, 10) : '',
        assignee_ids: task.assignee_ids || [],
      })
    } finally {
      setDetailLoading(false)
    }
  }

  // ── Employee: status-only update ───────────────────────────────────────────

  const handleStatusUpdate = async (newStatus: string) => {
    if (!detailTask) return
    setStatusUpdating(true)
    try {
      await api.patch(`/tasks/${detailTask.id}/status`, { status: newStatus })
      dispatch(updateTaskLocal({ id: detailTask.id, updates: { status: newStatus } }))
      setDetailTask((prev: any) => prev ? { ...prev, status: newStatus } : prev)
      setEditForm((prev: any) => prev ? { ...prev, status: newStatus } : prev)
    } catch {}
    setStatusUpdating(false)
  }

  // ── Manager: full task update ──────────────────────────────────────────────

  const handleSaveTask = async () => {
    if (!detailTask || !editForm) return
    setTaskSaving(true)
    try {
      const payload: any = {
        title:        editForm.title,
        description:  editForm.description,
        status:       editForm.status,
        priority:     editForm.priority,
        assignee_ids: editForm.assignee_ids,
        due_date:     editForm.due_date ? new Date(editForm.due_date).toISOString() : null,
      }
      await api.put(`/tasks/${detailTask.id}`, payload)
      dispatch(updateTaskLocal({ id: detailTask.id, updates: {
        title: payload.title, description: payload.description,
        status: payload.status, priority: payload.priority,
        assignee_ids: payload.assignee_ids,
        due_date: payload.due_date,
      }}))
      // Refresh task list
      const params: any = { page, limit }
      if (filterProject)  params.project_id = filterProject
      if (filterPriority) params.priority   = filterPriority
      dispatch(fetchTasksRequest(params))
      setDetailTask(null)
    } catch {}
    setTaskSaving(false)
  }

  // ── Create task ────────────────────────────────────────────────────────────

  const handleCreate = () => {
    if (!form.title || !form.project_id) return
    dispatch(createTaskRequest({ ...form, due_date: form.due_date || null }))
    setShowModal(false)
    setForm(emptyForm)
    setCreateMembers([])
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const tasksByStatus = STATUS_COLS.reduce((acc, s) => {
    acc[s] = items.filter(t => t.status === s)
    return acc
  }, {} as Record<string, typeof items>)

  const isAssignee = detailTask && user &&
    (detailTask.assignee_ids || []).includes(user.user_id)

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-gray-500 text-sm mt-1">{total} total tasks</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 rounded-xl p-1">
            {(['kanban', 'list'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${
                  view === v ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {v === 'kanban' ? <LayoutGrid size={14} /> : <List size={14} />}
                {v}
              </button>
            ))}
          </div>
          {isManager && (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 hover:scale-105 hover:shadow-lg hover:shadow-blue-200 transition-all duration-200"
            >
              <Plus size={16} />
              New Task
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
        <select
          value={filterProject}
          onChange={e => { setFilterProject(e.target.value); setPage(1) }}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          value={filterPriority}
          onChange={e => { setFilterPriority(e.target.value); setPage(1) }}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">All Priorities</option>
          {['critical', 'high', 'medium', 'low'].map(p => (
            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Board / List */}
      {isLoading && items.length === 0 ? (
        <div className="flex gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="flex-1 h-48 skeleton" />)}
        </div>
      ) : view === 'kanban' ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STATUS_COLS.map((status, ci) => {
            const style = HEADER_COLORS[status]
            return (
              <div key={status} className="flex-shrink-0 w-64 animate-fade-in-up" style={{ animationDelay: `${ci * 0.06}s` }}>
                <div className={`rounded-xl border px-3 py-2.5 mb-3 flex items-center justify-between ${style.bg}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                    <span className="text-sm font-semibold text-gray-700">{STATUS_LABELS[status]}</span>
                  </div>
                  <span className="text-xs bg-white px-2 py-0.5 rounded-lg text-gray-500 font-semibold">
                    {tasksByStatus[status]?.length || 0}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {(tasksByStatus[status] || []).map((task, i) => (
                    <KanbanCard
                      key={task.id}
                      task={task}
                      delay={ci * 0.06 + i * 0.03}
                      onClick={() => openTaskDetail(task)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in-up">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['Task', 'Status', 'Priority', 'Assignees', 'Due', 'Hours'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400 text-sm">No tasks found</td></tr>
              ) : (
                items.map((task, i) => (
                  <tr
                    key={task.id}
                    onClick={() => openTaskDetail(task)}
                    className="hover:bg-blue-50/30 cursor-pointer transition-colors animate-fade-in"
                    style={{ animationDelay: `${i * 0.02}s` }}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{task.title}</p>
                      {task.description && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{task.description}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${STATUS_COLORS[task.status] || 'bg-gray-100'}`}>
                        {STATUS_LABELS[task.status] || task.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${PRIORITY_COLORS[task.priority] || 'bg-gray-100'}`}>
                        {task.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <AssigneeAvatarStack assigneeIds={task.assignee_ids || []} assignees={(task as any).assignees} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {task.due_date ? new Date(task.due_date).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{task.logged_hours}/{task.estimated_hours}h</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={page}
        totalPages={Math.ceil(total / limit)}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={l => { setLimit(l); setPage(1) }}
        limitOptions={[10, 20, 50]}
      />

      {/* ── Task Detail Modal ── */}
      {detailTask && (
        <Modal onClose={() => setDetailTask(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl animate-scale-in">

            {/* Header */}
            <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {isManager && editForm ? (
                  <input
                    value={editForm.title}
                    onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                    className="w-full text-lg font-semibold text-gray-800 border-0 border-b-2 border-transparent focus:border-blue-500 focus:outline-none bg-transparent pb-0.5 transition-colors"
                  />
                ) : (
                  <h2 className="text-lg font-semibold text-gray-800 leading-snug">{detailTask.title}</h2>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${STATUS_COLORS[detailTask.status] || 'bg-gray-100'}`}>
                    {STATUS_LABELS[detailTask.status] || detailTask.status}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${PRIORITY_COLORS[detailTask.priority] || 'bg-gray-100'}`}>
                    {detailTask.priority}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setDetailTask(null)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            {detailLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader size={22} className="animate-spin text-blue-500" />
              </div>
            ) : (
              <div className="p-5 space-y-5">

                {/* Description */}
                {isManager && editForm ? (
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Description</label>
                    <textarea
                      value={editForm.description}
                      onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                      rows={2}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white resize-none transition-all"
                    />
                  </div>
                ) : detailTask.description ? (
                  <p className="text-sm text-gray-600">{detailTask.description}</p>
                ) : null}

                {/* Status — employee view */}
                {!isManager && (isAssignee || true) && editForm && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Update Status</label>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {STATUS_COLS.map(s => (
                        <button
                          key={s}
                          disabled={statusUpdating}
                          onClick={() => handleStatusUpdate(s)}
                          className={`py-2 px-2 rounded-xl text-xs font-semibold border-2 transition-all ${
                            editForm.status === s
                              ? `${STATUS_COLORS[s]} border-current`
                              : 'bg-white border-gray-100 text-gray-400 hover:border-gray-300'
                          }`}
                        >
                          {STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>
                    {statusUpdating && (
                      <p className="text-xs text-blue-500 mt-1.5 flex items-center gap-1">
                        <Loader size={11} className="animate-spin" /> Saving…
                      </p>
                    )}
                  </div>
                )}

                {/* Manager edit fields */}
                {isManager && editForm && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Status</label>
                        <select
                          value={editForm.status}
                          onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                        >
                          {STATUS_COLS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Priority</label>
                        <select
                          value={editForm.priority}
                          onChange={e => setEditForm({ ...editForm, priority: e.target.value })}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                        >
                          {['low', 'medium', 'high', 'critical'].map(p => (
                            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Due Date</label>
                      <input
                        type="date"
                        value={editForm.due_date}
                        onChange={e => setEditForm({ ...editForm, due_date: e.target.value })}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                      />
                    </div>

                    {/* Assignee picker */}
                    {detailMembers.length > 0 && (
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Assignees</label>
                        <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-50">
                          {detailMembers.map(m => {
                            const checked = editForm.assignee_ids.includes(m.id)
                            return (
                              <label key={m.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={e => setEditForm({
                                    ...editForm,
                                    assignee_ids: e.target.checked
                                      ? [...editForm.assignee_ids, m.id]
                                      : editForm.assignee_ids.filter((id: string) => id !== m.id),
                                  })}
                                  className="rounded accent-blue-600"
                                />
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${avatarColor(m.name)}`}>
                                  {initials(m.name).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-700 truncate">{m.name}</p>
                                  <p className="text-xs text-gray-400 capitalize">{m.role} · {m.department}</p>
                                </div>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Assignee display (read-only when no edit form or employee) */}
                {!isManager && detailTask.assignees?.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Assigned to</label>
                    <div className="flex flex-wrap gap-2">
                      {detailTask.assignees.map((a: any) => (
                        <span key={a.id} className="flex items-center gap-2 text-xs bg-blue-50 text-blue-700 px-2.5 py-1.5 rounded-lg font-medium">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${avatarColor(a.name)}`}>
                            {initials(a.name).toUpperCase()}
                          </div>
                          {a.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Meta info */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {[
                    ['Est. Hours', `${detailTask.estimated_hours}h`],
                    ['Logged',     `${detailTask.logged_hours}h`],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-gray-50 rounded-xl px-3 py-2.5">
                      <p className="text-gray-400 mb-0.5">{label}</p>
                      <p className="font-semibold text-gray-700">{value}</p>
                    </div>
                  ))}
                  {detailTask.due_date && !isManager && (
                    <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                      <p className="text-gray-400 mb-0.5">Due</p>
                      <p className="font-semibold text-gray-700">{new Date(detailTask.due_date).toLocaleDateString()}</p>
                    </div>
                  )}
                </div>

                {/* Blocked banner */}
                {detailTask.is_blocked && (
                  <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-start gap-2">
                    <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm text-red-700 font-medium">Blocked</p>
                      <p className="text-xs text-red-500 mt-0.5">{detailTask.blocked_reason || 'No reason specified'}</p>
                    </div>
                  </div>
                )}

                {/* Manager save button */}
                {isManager && (
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={handleSaveTask}
                      disabled={taskSaving}
                      className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-all"
                    >
                      {taskSaving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
                      Save Changes
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ── Create Task Modal ── */}
      {showModal && (
        <Modal onClose={() => { setShowModal(false); setCreateMembers([]) }}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl animate-scale-in">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center">
                  <ListChecks size={15} className="text-blue-600" />
                </div>
                <h2 className="text-lg font-semibold text-gray-800">New Task</h2>
              </div>
              <button
                onClick={() => { setShowModal(false); setCreateMembers([]) }}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Task Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Implement login page"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Brief description…"
                  rows={2}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project *</label>
                <select
                  value={form.project_id}
                  onChange={e => handleProjectChange(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                >
                  <option value="">Select project…</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    value={form.priority}
                    onChange={e => setForm({ ...form, priority: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  >
                    {['low', 'medium', 'high', 'critical'].map(p => (
                      <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Est. Hours</label>
                  <input
                    type="number" min={1}
                    value={form.estimated_hours}
                    onChange={e => setForm({ ...form, estimated_hours: Number(e.target.value) })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={e => setForm({ ...form, due_date: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                />
              </div>

              {/* Assignee picker — project members */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Assign To
                  {form.project_id && createMembersLoading && (
                    <span className="ml-2 text-xs text-gray-400 font-normal">Loading members…</span>
                  )}
                  {form.project_id && !createMembersLoading && createMembers.length === 0 && (
                    <span className="ml-2 text-xs text-gray-400 font-normal">No members in this project yet</span>
                  )}
                </label>
                {!form.project_id && (
                  <p className="text-xs text-gray-400 italic">Select a project to see assignable members</p>
                )}
                {createMembersLoading && (
                  <div className="flex items-center justify-center py-4">
                    <Loader size={16} className="animate-spin text-blue-400" />
                  </div>
                )}
                {!createMembersLoading && createMembers.length > 0 && (
                  <>
                    {/* Group by role */}
                    {(['team_lead', 'employee'] as const).map(role => {
                      const group = createMembers.filter(m => m.role === role)
                      if (group.length === 0) return null
                      return (
                        <div key={role} className="mb-2">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1 mb-1">
                            {role === 'team_lead' ? 'Team Leads' : 'Employees'}
                          </p>
                          <div className="border border-gray-200 rounded-xl divide-y divide-gray-50 overflow-hidden">
                            {group.map(m => (
                              <label key={m.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={form.assignee_ids.includes(m.id)}
                                  onChange={e => setForm({
                                    ...form,
                                    assignee_ids: e.target.checked
                                      ? [...form.assignee_ids, m.id]
                                      : form.assignee_ids.filter(id => id !== m.id),
                                  })}
                                  className="rounded accent-blue-600"
                                />
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${avatarColor(m.name)}`}>
                                  {initials(m.name).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-700 truncate">{m.name}</p>
                                  <p className="text-xs text-gray-400">{m.department}</p>
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                    {/* Other roles */}
                    {(() => {
                      const others = createMembers.filter(m => m.role !== 'team_lead' && m.role !== 'employee')
                      if (others.length === 0) return null
                      return (
                        <div className="mb-2">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1 mb-1">Other</p>
                          <div className="border border-gray-200 rounded-xl divide-y divide-gray-50 overflow-hidden">
                            {others.map(m => (
                              <label key={m.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={form.assignee_ids.includes(m.id)}
                                  onChange={e => setForm({
                                    ...form,
                                    assignee_ids: e.target.checked
                                      ? [...form.assignee_ids, m.id]
                                      : form.assignee_ids.filter(id => id !== m.id),
                                  })}
                                  className="rounded accent-blue-600"
                                />
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${avatarColor(m.name)}`}>
                                  {initials(m.name).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-700 truncate">{m.name}</p>
                                  <p className="text-xs text-gray-400 capitalize">{m.role} · {m.department}</p>
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>
                      )
                    })()}
                  </>
                )}
              </div>
            </div>

            <div className="p-5 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => { setShowModal(false); setCreateMembers([]) }}
                className="px-5 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!form.title || !form.project_id}
                className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-all"
              >
                <Plus size={14} />
                Create Task
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────

interface KanbanCardProps {
  task: any
  delay: number
  onClick: () => void
}

const KanbanCard: React.FC<KanbanCardProps> = ({ task, delay, onClick }) => {
  const assignees: { id: string; name: string }[] = task.assignees || []
  const assigneeCount = task.assignee_ids?.length || 0

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl p-3.5 shadow-sm border border-gray-100 card-hover cursor-pointer animate-fade-in"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium text-gray-800 leading-snug">{task.title}</p>
        <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium shrink-0 ${PRIORITY_COLORS[task.priority] || 'bg-gray-100'}`}>
          {task.priority}
        </span>
      </div>
      {task.description && (
        <p className="text-xs text-gray-400 line-clamp-2 mb-2">{task.description}</p>
      )}
      <div className="flex items-center justify-between">
        {/* Assignee avatars */}
        {assigneeCount > 0 ? (
          <div className="flex items-center">
            <div className="flex -space-x-1.5">
              {assignees.slice(0, 3).map(a => (
                <div
                  key={a.id}
                  title={a.name}
                  className={`w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-white text-[9px] font-bold ${avatarColor(a.name)}`}
                >
                  {initials(a.name).toUpperCase()}
                </div>
              ))}
              {/* If we have IDs but no name objects, show count placeholder */}
              {assignees.length === 0 && assigneeCount > 0 && (
                <div className="w-6 h-6 rounded-full border-2 border-white bg-gray-300 flex items-center justify-center text-white text-[9px] font-bold">
                  <Users size={10} />
                </div>
              )}
            </div>
            {assigneeCount > 3 && (
              <span className="ml-1.5 text-[10px] text-gray-400 font-medium">+{assigneeCount - 3}</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1 text-xs text-gray-300">
            <Users size={11} />
            <span>Unassigned</span>
          </div>
        )}
        {task.due_date && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Clock size={11} />
            <span>{new Date(task.due_date).toLocaleDateString()}</span>
          </div>
        )}
      </div>
      {task.is_blocked && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg px-2 py-1">
          <AlertTriangle size={11} />
          {task.blocked_reason || 'Blocked'}
        </div>
      )}
    </div>
  )
}

// ─── Assignee Avatar Stack (list view) ────────────────────────────────────────

interface AssigneeAvatarStackProps {
  assigneeIds: string[]
  assignees?: { id: string; name: string }[]
  size?: 'sm' | 'md'
}

const AssigneeAvatarStack: React.FC<AssigneeAvatarStackProps> = ({ assigneeIds, assignees, size = 'md' }) => {
  const dim = size === 'sm' ? 'w-6 h-6 text-[9px]' : 'w-7 h-7 text-xs'
  if (!assigneeIds?.length) {
    return <span className="text-xs text-gray-300">—</span>
  }
  const named = assignees || []
  return (
    <div className="flex items-center">
      <div className="flex -space-x-1.5">
        {(named.length > 0 ? named : assigneeIds.map(id => ({ id, name: id }))).slice(0, 3).map(a => (
          <div
            key={a.id}
            title={a.name !== a.id ? a.name : undefined}
            className={`${dim} rounded-full border-2 border-white flex items-center justify-center text-white font-bold ${avatarColor(a.name)}`}
          >
            {initials(a.name).toUpperCase()}
          </div>
        ))}
      </div>
      {assigneeIds.length > 3 && (
        <span className="ml-1.5 text-[10px] text-gray-400">+{assigneeIds.length - 3}</span>
      )}
    </div>
  )
}
