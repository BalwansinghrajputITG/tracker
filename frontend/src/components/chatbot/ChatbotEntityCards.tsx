import React, { useState } from 'react'
import { useSelector } from 'react-redux'
import {
  X, Pencil, Trash2, Mail, MessageSquare, FolderOpen, CheckCircle2,
  Loader2, AlertTriangle, Users, Calendar, BarChart2, Clock,
  ChevronDown, ChevronUp, Shield, Building2, Phone,
} from 'lucide-react'
import { api } from '../../utils/api'
import { useToast } from '../shared'
import { ANALYTICS_ROLES, EXEC_ROLES } from '../../constants/roles'
import { RootState } from '../../store'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  data: { type: string; items: any[] }
  callerRole: string
  onAction?: (msg: string) => void  // optional: send a follow-up message
}

// ─── Role / status colors ─────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  ceo:       'bg-purple-100 text-purple-700',
  coo:       'bg-indigo-100 text-indigo-700',
  pm:        'bg-blue-100 text-blue-700',
  team_lead: 'bg-teal-100 text-teal-700',
  employee:  'bg-gray-100 text-gray-600',
}
const AVATAR_COLORS: Record<string, string> = {
  ceo:       'from-purple-500 to-violet-600',
  coo:       'from-indigo-500 to-blue-600',
  pm:        'from-blue-500 to-cyan-600',
  team_lead: 'from-teal-500 to-emerald-600',
  employee:  'from-slate-400 to-gray-500',
}
const STATUS_COLORS: Record<string, string> = {
  planning:    'bg-blue-100 text-blue-700',
  active:      'bg-emerald-100 text-emerald-700',
  on_hold:     'bg-amber-100 text-amber-700',
  completed:   'bg-gray-100 text-gray-600',
  cancelled:   'bg-red-100 text-red-600',
}
const PRIORITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  high:     'bg-orange-400',
  medium:   'bg-amber-400',
  low:      'bg-gray-400',
}
const TASK_STATUS_COLORS: Record<string, string> = {
  todo:        'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  review:      'bg-violet-100 text-violet-700',
  done:        'bg-emerald-100 text-emerald-700',
  blocked:     'bg-red-100 text-red-600',
}
const MOOD_COLORS: Record<string, string> = {
  great:     'bg-emerald-100 text-emerald-700',
  good:      'bg-blue-100 text-blue-700',
  neutral:   'bg-amber-100 text-amber-700',
  stressed:  'bg-orange-100 text-orange-700',
  burned_out:'bg-red-100 text-red-600',
}

// ─── Small inline error/success toast ────────────────────────────────────────

const InlineMsg: React.FC<{ msg: string; isError?: boolean }> = ({ msg, isError }) => (
  <div className={`flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg ${isError ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
    {isError ? <AlertTriangle size={11} /> : <CheckCircle2 size={11} />}
    {msg}
  </div>
)

// ─── EntityCards ─────────────────────────────────────────────────────────────

export const EntityCards: React.FC<Props> = ({ data, callerRole, onAction }) => {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

  const canManage = ANALYTICS_ROLES.includes(callerRole as any)
  const isExec = EXEC_ROLES.includes(callerRole as any)

  const toggle = (i: number) => setSelectedIdx(prev => prev === i ? null : i)

  if (!data.items.length) return null

  return (
    <div className="mt-2 space-y-2">
      {/* Label */}
      <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 pl-0.5">
        {data.items.length} {data.type} found
      </p>
      {/* Scrollable mini-card row */}
      <div className="flex gap-2 overflow-x-auto pb-1.5 scrollbar-hide">
        {data.items.map((item, i) => (
          <MiniCard
            key={item.id || i}
            item={item}
            type={data.type}
            selected={selectedIdx === i}
            onClick={() => toggle(i)}
          />
        ))}
      </div>

      {/* Expanded detail panel */}
      {selectedIdx !== null && data.items[selectedIdx] && (
        <DetailPanel
          item={data.items[selectedIdx]}
          type={data.type}
          callerRole={callerRole}
          canManage={canManage}
          isExec={isExec}
          onClose={() => setSelectedIdx(null)}
          onAction={onAction}
        />
      )}
    </div>
  )
}

// ─── MiniCard ─────────────────────────────────────────────────────────────────

const MiniCard: React.FC<{ item: any; type: string; selected: boolean; onClick: () => void }> = ({
  item, type, selected, onClick,
}) => {
  const base = `shrink-0 cursor-pointer rounded-xl border text-left transition-all duration-200 p-3 text-xs shadow-sm ${
    selected
      ? 'border-indigo-400 bg-indigo-50 shadow-indigo-100'
      : 'border-gray-100 bg-white hover:border-indigo-300 hover:shadow-md hover:shadow-indigo-50'
  }`

  if (type === 'projects') {
    return (
      <button className={`${base} w-44`} onClick={onClick}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-bold text-gray-800 truncate max-w-[100px] text-[11px]">{item.name}</span>
          {selected ? <ChevronUp size={11} className="text-indigo-500 shrink-0" /> : <ChevronDown size={11} className="text-gray-300 shrink-0" />}
        </div>
        <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-lg font-semibold mb-2 ${STATUS_COLORS[item.status] || 'bg-gray-100 text-gray-600'}`}>
          {item.status?.replace('_', ' ')}
        </span>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all" style={{ width: `${item.progress_percentage || 0}%` }} />
        </div>
        <p className="text-indigo-500 font-bold text-[10px] mt-1">{item.progress_percentage || 0}%</p>
      </button>
    )
  }

  if (type === 'users') {
    const role = item.primary_role || 'employee'
    return (
      <button className={`${base} w-36`} onClick={onClick}>
        <div className="flex items-center gap-2 mb-1">
          <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${AVATAR_COLORS[role] || AVATAR_COLORS.employee} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
            {item.full_name?.[0]?.toUpperCase()}
          </div>
          {selected ? <ChevronUp size={11} className="text-blue-500 ml-auto shrink-0" /> : <ChevronDown size={11} className="text-gray-400 ml-auto shrink-0" />}
        </div>
        <p className="font-semibold text-gray-800 truncate">{item.full_name}</p>
        <span className={`inline-block text-xs px-1.5 py-0.5 rounded-md font-medium mt-0.5 ${ROLE_COLORS[role] || ROLE_COLORS.employee}`}>
          {role.replace('_', ' ')}
        </span>
      </button>
    )
  }

  if (type === 'teams') {
    return (
      <button className={`${base} w-40`} onClick={onClick}>
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold text-gray-800 truncate max-w-[90px]">{item.name}</span>
          {selected ? <ChevronUp size={11} className="text-blue-500 shrink-0" /> : <ChevronDown size={11} className="text-gray-400 shrink-0" />}
        </div>
        <p className="text-gray-400 truncate">{item.department || '—'}</p>
        <div className="flex items-center gap-2 mt-1 text-gray-500">
          <span className="flex items-center gap-0.5"><Users size={10} /> {item.member_ids?.length || 0}</span>
        </div>
      </button>
    )
  }

  if (type === 'reports') {
    return (
      <button className={`${base} w-40`} onClick={onClick}>
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold text-gray-800 truncate max-w-[90px]">{item.project_name || 'Report'}</span>
          {selected ? <ChevronUp size={11} className="text-blue-500 shrink-0" /> : <ChevronDown size={11} className="text-gray-400 shrink-0" />}
        </div>
        <p className="text-gray-500">{item.employee_name}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${MOOD_COLORS[item.mood] || 'bg-gray-100 text-gray-600'}`}>{item.mood || '—'}</span>
          <span className="text-gray-400 flex items-center gap-0.5"><Clock size={10} /> {item.structured_data?.hours_worked || 0}h</span>
        </div>
      </button>
    )
  }

  if (type === 'tasks') {
    return (
      <button className={`${base} w-44`} onClick={onClick}>
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold text-gray-800 truncate max-w-[100px]">{item.title}</span>
          {selected ? <ChevronUp size={11} className="text-blue-500 shrink-0" /> : <ChevronDown size={11} className="text-gray-400 shrink-0" />}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${TASK_STATUS_COLORS[item.status] || 'bg-gray-100 text-gray-600'}`}>
            {item.status?.replace('_', ' ')}
          </span>
          <span className={`w-2 h-2 rounded-full ${PRIORITY_DOT[item.priority] || 'bg-gray-400'}`} title={item.priority} />
        </div>
        <p className="text-gray-400 mt-1 truncate">{item.project_name}</p>
      </button>
    )
  }

  return null
}

// ─── DetailPanel ──────────────────────────────────────────────────────────────

const DetailPanel: React.FC<{
  item: any
  type: string
  callerRole: string
  canManage: boolean
  isExec: boolean
  onClose: () => void
  onAction?: (msg: string) => void
}> = ({ item, type, callerRole, canManage, isExec, onClose, onAction }) => {
  const toastNotify = useToast()
  const { items: projects } = useSelector((s: RootState) => s.projects)

  const [mode, setMode] = useState<'view' | 'edit' | 'assign' | 'status' | 'confirm-delete'>('view')
  const [editForm, setEditForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [selectedStatus, setSelectedStatus] = useState(item.status || 'todo')

  // live-updated local copy of the item
  const [localItem, setLocalItem] = useState(item)

  const showToast = (msg: string, error = false) => {
    setToast({ msg, error })
    setTimeout(() => setToast(null), 3000)
  }

  const resetMode = () => { setMode('view'); setSaving(false) }

  // ── Project detail ────────────────────────────────────────────────────────
  if (type === 'projects') {
    const p = localItem
    const canEdit = canManage

    const handleEditProject = async () => {
      setSaving(true)
      try {
        await api.put(`/projects/${p.id}`, editForm)
        setLocalItem({ ...p, ...editForm })
        showToast('Project updated successfully')
        toastNotify.success('Project updated')
        resetMode()
      } catch (err: any) {
        showToast(err?.response?.data?.detail || 'Failed to update', true)
        toastNotify.error(err?.response?.data?.detail || 'Failed to update project')
        setSaving(false)
      }
    }

    const handleCancelProject = async () => {
      setSaving(true)
      try {
        await api.delete(`/projects/${p.id}`)
        setLocalItem({ ...p, status: 'cancelled' })
        showToast('Project cancelled')
        toastNotify.success('Project cancelled')
        resetMode()
      } catch (err: any) {
        showToast(err?.response?.data?.detail || 'Failed to cancel', true)
        toastNotify.error(err?.response?.data?.detail || 'Failed to cancel project')
        setSaving(false)
      }
    }

    return (
      <div className="bg-white border border-indigo-100 rounded-2xl p-4 shadow-md shadow-indigo-50 space-y-3 animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-bold text-gray-900">{p.name}</p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className={`text-[10px] px-2 py-0.5 rounded-lg font-semibold ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-600'}`}>{p.status?.replace('_', ' ')}</span>
              <span className={`w-2 h-2 rounded-full ${PRIORITY_DOT[p.priority] || 'bg-gray-400'}`} title={p.priority} />
              <span className="text-[10px] text-gray-400 capitalize font-medium">{p.priority}</span>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400 transition-colors shrink-0">
            <X size={13} />
          </button>
        </div>

        {toast && <InlineMsg msg={toast.msg} isError={toast.error} />}

        {/* View mode */}
        {mode === 'view' && (
          <>
            {p.description && <p className="text-xs text-gray-500">{p.description}</p>}
            <div className="grid grid-cols-2 gap-2">
              {[
                ['PM', p.pm_name || 'Unassigned'],
                ['Progress', `${p.progress_percentage || 0}%`],
                ['Members', p.member_ids?.length || 0],
                ['Due', p.due_date ? new Date(p.due_date).toLocaleDateString() : 'N/A'],
              ].map(([k, v]) => (
                <div key={k as string} className="bg-gray-50 rounded-lg p-2">
                  <p className="text-xs text-gray-400">{k}</p>
                  <p className="text-xs font-semibold text-gray-700">{v}</p>
                </div>
              ))}
            </div>
            {p.is_delayed && (
              <div className="flex items-start gap-1.5 bg-red-50 border border-red-100 rounded-lg p-2 text-xs text-red-600">
                <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                <span><b>Delayed</b>{p.delay_reason ? `: ${p.delay_reason}` : ''}</span>
              </div>
            )}
            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Progress</span><span>{p.progress_percentage || 0}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${p.progress_percentage || 0}%` }} />
              </div>
            </div>
            {canEdit && (
              <div className="grid grid-cols-2 gap-1.5">
                <button onClick={() => { setEditForm({ name: p.name, description: p.description || '', priority: p.priority, status: p.status, due_date: p.due_date ? p.due_date.split('T')[0] : '' }); setMode('edit') }}
                  className="flex items-center justify-center gap-1.5 text-xs py-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 font-semibold border border-indigo-100 transition-colors">
                  <Pencil size={11} /> Edit
                </button>
                {p.status !== 'cancelled' && (
                  <button onClick={() => setMode('confirm-delete')}
                    className="flex items-center justify-center gap-1.5 text-xs py-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 font-semibold border border-red-100 transition-colors">
                    <Trash2 size={11} /> Cancel
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* Edit mode */}
        {mode === 'edit' && (
          <div className="space-y-2">
            <input value={editForm.name || ''} onChange={e => setEditForm({ ...editForm, name: e.target.value })} placeholder="Project name" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50" />
            <textarea value={editForm.description || ''} onChange={e => setEditForm({ ...editForm, description: e.target.value })} placeholder="Description" rows={2} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50 resize-none" />
            <div className="grid grid-cols-2 gap-1.5">
              <select value={editForm.priority || 'medium'} onChange={e => setEditForm({ ...editForm, priority: e.target.value })} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50">
                {['low', 'medium', 'high', 'critical'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={editForm.status || 'active'} onChange={e => setEditForm({ ...editForm, status: e.target.value })} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50">
                {['planning', 'active', 'on_hold', 'completed', 'cancelled'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
            <input type="date" value={editForm.due_date || ''} onChange={e => setEditForm({ ...editForm, due_date: e.target.value })} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50" />
            <div className="flex gap-1.5">
              <button onClick={resetMode} className="flex-1 text-xs py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={handleEditProject} disabled={saving} className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Save
              </button>
            </div>
          </div>
        )}

        {/* Confirm cancel */}
        {mode === 'confirm-delete' && (
          <div className="space-y-2">
            <p className="text-xs text-red-600 font-medium text-center">Cancel project "{p.name}"?</p>
            <div className="flex gap-1.5">
              <button onClick={resetMode} className="flex-1 text-xs py-1.5 border border-gray-200 rounded-lg text-gray-600">No</button>
              <button onClick={handleCancelProject} disabled={saving} className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                {saving ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Confirm
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── User/Employee detail ──────────────────────────────────────────────────
  if (type === 'users') {
    const u = localItem
    const role = u.primary_role || 'employee'
    const canEdit = canManage

    const handleEditUser = async () => {
      setSaving(true)
      try {
        await api.put(`/users/${u.id}`, editForm)
        setLocalItem({ ...u, ...editForm })
        showToast('User updated')
        toastNotify.success('User updated')
        resetMode()
      } catch (err: any) {
        showToast(err?.response?.data?.detail || 'Failed to update', true)
        toastNotify.error(err?.response?.data?.detail || 'Failed to update user')
        setSaving(false)
      }
    }

    const handleDeactivate = async () => {
      setSaving(true)
      try {
        await api.delete(`/users/${u.id}`)
        setLocalItem({ ...u, is_active: false })
        showToast(`${u.full_name} deactivated`)
        toastNotify.success('User deactivated')
        resetMode()
      } catch (err: any) {
        showToast(err?.response?.data?.detail || 'Failed to deactivate', true)
        toastNotify.error(err?.response?.data?.detail || 'Failed to deactivate user')
        setSaving(false)
      }
    }

    const handleAssignProject = async () => {
      if (!selectedProjectId) return
      setSaving(true)
      try {
        await api.post(`/projects/${selectedProjectId}/members/${u.id}`)
        showToast('Added to project')
        toastNotify.success('Assigned to project')
        resetMode()
      } catch (err: any) {
        showToast(err?.response?.data?.detail || 'Failed to assign', true)
        toastNotify.error(err?.response?.data?.detail || 'Failed to assign project')
        setSaving(false)
      }
    }

    return (
      <div className="bg-white border border-indigo-100 rounded-2xl p-4 shadow-md shadow-indigo-50 space-y-3 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${AVATAR_COLORS[role] || AVATAR_COLORS.employee} flex items-center justify-center text-white font-bold text-sm shadow-sm`}>
              {u.full_name?.[0]?.toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">{u.full_name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-[10px] px-2 py-0.5 rounded-lg font-semibold ${ROLE_COLORS[role] || ROLE_COLORS.employee}`}>{role.replace('_', ' ')}</span>
                {u.is_active === false && <span className="text-[10px] text-red-500 font-semibold bg-red-50 px-2 py-0.5 rounded-lg">Inactive</span>}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400 transition-colors shrink-0">
            <X size={13} />
          </button>
        </div>

        {toast && <InlineMsg msg={toast.msg} isError={toast.error} />}

        {mode === 'view' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {[
                [<Mail size={11} />, 'Email', u.email],
                [<Phone size={11} />, 'Phone', u.phone || '—'],
                [<Building2 size={11} />, 'Dept', u.department || '—'],
                [<Shield size={11} />, 'Role', role.replace('_', ' ')],
              ].map(([icon, label, value]: any) => (
                <div key={label} className="bg-gray-50 rounded-lg p-2">
                  <div className="flex items-center gap-1 text-gray-400 mb-0.5">{icon}<span className="text-xs">{label}</span></div>
                  <p className="text-xs font-semibold text-gray-700 capitalize truncate">{value}</p>
                </div>
              ))}
            </div>
            {canEdit && (
              <div className="grid grid-cols-2 gap-1.5">
                <button onClick={() => { setEditForm({ full_name: u.full_name, department: u.department || '', phone: u.phone || '' }); setMode('edit') }}
                  className="flex items-center justify-center gap-1 text-xs py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium">
                  <Pencil size={11} /> Edit
                </button>
                <button onClick={() => setMode('assign')}
                  className="flex items-center justify-center gap-1 text-xs py-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 font-medium">
                  <FolderOpen size={11} /> Assign Project
                </button>
                <a href={`mailto:${u.email}`}
                  className="flex items-center justify-center gap-1 text-xs py-2 bg-violet-50 text-violet-600 rounded-lg hover:bg-violet-100 font-medium">
                  <Mail size={11} /> Email
                </a>
                <a href="/chat"
                  className="flex items-center justify-center gap-1 text-xs py-2 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 font-medium">
                  <MessageSquare size={11} /> Message
                </a>
              </div>
            )}
            {canManage && u.is_active !== false && (
              <button onClick={() => setMode('confirm-delete')}
                className="w-full flex items-center justify-center gap-1 text-xs py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium">
                <Trash2 size={11} /> Deactivate Account
              </button>
            )}
          </>
        )}

        {mode === 'edit' && (
          <div className="space-y-2">
            {[
              { label: 'Full Name', key: 'full_name' },
              { label: 'Department', key: 'department' },
              { label: 'Phone', key: 'phone' },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className="text-xs text-gray-500 mb-0.5 block">{label}</label>
                <input value={editForm[key] || ''} onChange={e => setEditForm({ ...editForm, [key]: e.target.value })} placeholder={label} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50" />
              </div>
            ))}
            <div className="flex gap-1.5">
              <button onClick={resetMode} className="flex-1 text-xs py-1.5 border border-gray-200 rounded-lg text-gray-600">Cancel</button>
              <button onClick={handleEditUser} disabled={saving} className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Save
              </button>
            </div>
          </div>
        )}

        {mode === 'assign' && (
          <div className="space-y-2">
            <label className="text-xs text-gray-500 block">Assign to project</label>
            <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50">
              <option value="">Select a project…</option>
              {projects.filter((p: any) => p.status !== 'cancelled' && p.status !== 'completed').map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <div className="flex gap-1.5">
              <button onClick={resetMode} className="flex-1 text-xs py-1.5 border border-gray-200 rounded-lg text-gray-600">Cancel</button>
              <button onClick={handleAssignProject} disabled={!selectedProjectId || saving} className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                {saving ? <Loader2 size={11} className="animate-spin" /> : <FolderOpen size={11} />} Assign
              </button>
            </div>
          </div>
        )}

        {mode === 'confirm-delete' && (
          <div className="space-y-2">
            <p className="text-xs text-red-600 font-medium text-center">Deactivate {u.full_name}?</p>
            <div className="flex gap-1.5">
              <button onClick={resetMode} className="flex-1 text-xs py-1.5 border border-gray-200 rounded-lg text-gray-600">No</button>
              <button onClick={handleDeactivate} disabled={saving} className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                {saving ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Deactivate
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Team detail ───────────────────────────────────────────────────────────
  if (type === 'teams') {
    const t = localItem
    const canEdit = isExec || callerRole === 'pm'

    const handleEditTeam = async () => {
      setSaving(true)
      try {
        await api.put(`/teams/${t.id}`, editForm)
        setLocalItem({ ...t, ...editForm })
        showToast('Team updated')
        toastNotify.success('Team updated')
        resetMode()
      } catch (err: any) {
        showToast(err?.response?.data?.detail || 'Failed to update', true)
        toastNotify.error(err?.response?.data?.detail || 'Failed to update team')
        setSaving(false)
      }
    }

    const handleDeleteTeam = async () => {
      setSaving(true)
      try {
        await api.delete(`/teams/${t.id}`)
        setLocalItem({ ...t, is_active: false })
        showToast('Team deleted')
        toastNotify.success('Team deleted')
        resetMode()
      } catch (err: any) {
        showToast(err?.response?.data?.detail || 'Failed to delete', true)
        toastNotify.error(err?.response?.data?.detail || 'Failed to delete team')
        setSaving(false)
      }
    }

    return (
      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm space-y-3 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-gray-800">{t.name}</p>
            {t.department && <p className="text-xs text-gray-400">{t.department}</p>}
          </div>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 shrink-0">
            <X size={13} />
          </button>
        </div>

        {toast && <InlineMsg msg={toast.msg} isError={toast.error} />}

        {mode === 'view' && (
          <>
            {t.lead_name && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg p-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {t.lead_name[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-700 truncate">{t.lead_name}</p>
                  <p className="text-xs text-gray-400">Team Lead</p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-xs text-gray-400 flex items-center gap-1"><Users size={10} /> Members</p>
                <p className="text-sm font-bold text-gray-700">{t.member_ids?.length || 0}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-xs text-gray-400 flex items-center gap-1"><FolderOpen size={10} /> Projects</p>
                <p className="text-sm font-bold text-gray-700">{t.project_ids?.length || 0}</p>
              </div>
            </div>
            {t.description && <p className="text-xs text-gray-500">{t.description}</p>}
            {canEdit && (
              <div className="grid grid-cols-3 gap-1.5">
                {t.lead_name && (
                  <a href="/chat" className="flex items-center justify-center gap-1 text-xs py-2 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 font-medium">
                    <MessageSquare size={11} /> Message
                  </a>
                )}
                <button onClick={() => { setEditForm({ name: t.name, description: t.description || '', department: t.department || '' }); setMode('edit') }}
                  className="flex items-center justify-center gap-1 text-xs py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium">
                  <Pencil size={11} /> Edit
                </button>
                <button onClick={() => setMode('confirm-delete')}
                  className="flex items-center justify-center gap-1 text-xs py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium">
                  <Trash2 size={11} /> Delete
                </button>
              </div>
            )}
          </>
        )}

        {mode === 'edit' && (
          <div className="space-y-2">
            {[
              { label: 'Team Name', key: 'name' },
              { label: 'Department', key: 'department' },
              { label: 'Description', key: 'description' },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className="text-xs text-gray-500 mb-0.5 block">{label}</label>
                <input value={editForm[key] || ''} onChange={e => setEditForm({ ...editForm, [key]: e.target.value })} placeholder={label} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50" />
              </div>
            ))}
            <div className="flex gap-1.5">
              <button onClick={resetMode} className="flex-1 text-xs py-1.5 border border-gray-200 rounded-lg text-gray-600">Cancel</button>
              <button onClick={handleEditTeam} disabled={saving} className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Save
              </button>
            </div>
          </div>
        )}

        {mode === 'confirm-delete' && (
          <div className="space-y-2">
            <p className="text-xs text-red-600 font-medium text-center">Delete team "{t.name}"?</p>
            <div className="flex gap-1.5">
              <button onClick={resetMode} className="flex-1 text-xs py-1.5 border border-gray-200 rounded-lg text-gray-600">No</button>
              <button onClick={handleDeleteTeam} disabled={saving} className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                {saving ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Confirm
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Report detail ─────────────────────────────────────────────────────────
  if (type === 'reports') {
    const r = localItem

    const handleDeleteReport = async () => {
      setSaving(true)
      try {
        await api.delete(`/reports/${r.id}`)
        setLocalItem({ ...r, _deleted: true })
        showToast('Report deleted')
        toastNotify.success('Report deleted')
        resetMode()
      } catch (err: any) {
        showToast(err?.response?.data?.detail || 'Failed to delete', true)
        toastNotify.error(err?.response?.data?.detail || 'Failed to delete report')
        setSaving(false)
      }
    }

    if (localItem._deleted) {
      return (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400">Report deleted</p>
        </div>
      )
    }

    return (
      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm space-y-3 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-gray-800">{r.project_name}</p>
            <p className="text-xs text-gray-400">{r.employee_name} · {r.report_date ? new Date(r.report_date).toLocaleDateString() : ''}</p>
          </div>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 shrink-0">
            <X size={13} />
          </button>
        </div>

        {toast && <InlineMsg msg={toast.msg} isError={toast.error} />}

        {mode === 'view' && (
          <>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${MOOD_COLORS[r.mood] || 'bg-gray-100 text-gray-600'}`}>{r.mood || '—'}</span>
              <span className="text-xs text-gray-500 flex items-center gap-1"><Clock size={10} /> {r.structured_data?.hours_worked || 0}h worked</span>
            </div>
            {r.structured_data?.tasks_completed?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">Completed</p>
                <ul className="space-y-0.5">
                  {r.structured_data.tasks_completed.slice(0, 3).map((t: any, i: number) => (
                    <li key={i} className="flex items-start gap-1 text-xs text-gray-600">
                      <CheckCircle2 size={10} className="text-emerald-500 mt-0.5 shrink-0" />
                      {typeof t === 'string' ? t : t.task || JSON.stringify(t)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {r.structured_data?.blockers?.length > 0 && (
              <div className="bg-orange-50 border border-orange-100 rounded-lg p-2">
                <p className="text-xs font-semibold text-orange-600 mb-1">Blockers</p>
                {r.structured_data.blockers.slice(0, 2).map((b: string, i: number) => (
                  <p key={i} className="text-xs text-orange-700">• {b}</p>
                ))}
              </div>
            )}
            {r.unstructured_notes && <p className="text-xs text-gray-500 italic">"{r.unstructured_notes.slice(0, 120)}{r.unstructured_notes.length > 120 ? '…' : ''}"</p>}
            <button onClick={() => setMode('confirm-delete')}
              className="w-full flex items-center justify-center gap-1 text-xs py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium">
              <Trash2 size={11} /> Delete Report
            </button>
          </>
        )}

        {mode === 'confirm-delete' && (
          <div className="space-y-2">
            <p className="text-xs text-red-600 font-medium text-center">Delete this report?</p>
            <div className="flex gap-1.5">
              <button onClick={resetMode} className="flex-1 text-xs py-1.5 border border-gray-200 rounded-lg text-gray-600">No</button>
              <button onClick={handleDeleteReport} disabled={saving} className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                {saving ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Confirm
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Task detail ───────────────────────────────────────────────────────────
  if (type === 'tasks') {
    const t = localItem

    const handleUpdateStatus = async () => {
      setSaving(true)
      try {
        await api.put(`/tasks/${t.id}`, { status: selectedStatus })
        setLocalItem({ ...t, status: selectedStatus })
        showToast(`Status updated to ${selectedStatus}`)
        toastNotify.success('Task status updated')
        resetMode()
      } catch (err: any) {
        showToast(err?.response?.data?.detail || 'Failed to update', true)
        toastNotify.error(err?.response?.data?.detail || 'Failed to update task')
        setSaving(false)
      }
    }

    return (
      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm space-y-3 animate-fade-in">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-800 truncate">{t.title}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${TASK_STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-600'}`}>{t.status?.replace('_', ' ')}</span>
              <span className={`w-2 h-2 rounded-full ${PRIORITY_DOT[t.priority] || 'bg-gray-400'}`} />
              <span className="text-xs text-gray-400 capitalize">{t.priority}</span>
            </div>
          </div>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 shrink-0 ml-2">
            <X size={13} />
          </button>
        </div>

        {toast && <InlineMsg msg={toast.msg} isError={toast.error} />}

        {mode === 'view' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-xs text-gray-400">Project</p>
                <p className="text-xs font-semibold text-gray-700 truncate">{t.project_name}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-xs text-gray-400">Due</p>
                <p className="text-xs font-semibold text-gray-700">{t.due_date ? new Date(t.due_date).toLocaleDateString() : 'N/A'}</p>
              </div>
            </div>
            {t.assignee_names?.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-xs text-gray-400 mb-1">Assignees</p>
                <div className="flex flex-wrap gap-1">
                  {t.assignee_names.map((n: string) => (
                    <span key={n} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md">{n}</span>
                  ))}
                </div>
              </div>
            )}
            {t.is_blocked && (
              <div className="flex items-start gap-1.5 bg-red-50 border border-red-100 rounded-lg p-2 text-xs text-red-600">
                <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                <span><b>Blocked</b>{t.blocked_reason ? `: ${t.blocked_reason}` : ''}</span>
              </div>
            )}
            <button onClick={() => setMode('status')}
              className="w-full flex items-center justify-center gap-1 text-xs py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium">
              <BarChart2 size={11} /> Update Status
            </button>
          </>
        )}

        {mode === 'status' && (
          <div className="space-y-2">
            <label className="text-xs text-gray-500 block">New status</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(['todo', 'in_progress', 'review', 'done', 'blocked'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSelectedStatus(s)}
                  className={`text-xs py-1.5 rounded-lg border font-medium transition-all ${
                    selectedStatus === s
                      ? 'border-blue-500 bg-blue-600 text-white'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'
                  }`}
                >
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <button onClick={resetMode} className="flex-1 text-xs py-1.5 border border-gray-200 rounded-lg text-gray-600">Cancel</button>
              <button onClick={handleUpdateStatus} disabled={saving || selectedStatus === t.status} className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Update
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return null
}
