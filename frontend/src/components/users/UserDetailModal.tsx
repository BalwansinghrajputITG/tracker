import React, { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  X, Mail, Phone, Building2, Shield, Loader2, AlertTriangle,
  CheckCircle2, Pencil, Trash2, MessageSquare, FolderOpen,
} from 'lucide-react'
import { RootState } from '../../store'
import { User } from '../../store/slices/usersSlice'
import { setActiveRoom } from '../../store/slices/chatSlice'
import { Modal } from '../common/Modal'
import { useToast } from '../shared'
import { api } from '../../utils/api'
import { navigate } from '../../pages/AppLayout'
import {
  MANAGER_ROLES, EXEC_ROLES,
  ROLE_BADGE_CLASSES as ROLE_COLORS,
  ROLE_AVATAR_GRADIENT as AVATAR_COLORS,
} from '../../constants/roles'

interface UserDetailModalProps {
  user: User
  callerRole: string
  onClose: () => void
  onDeactivated: () => void
  onUpdated: () => void
}

export const UserDetailModal: React.FC<UserDetailModalProps> = ({
  user, callerRole, onClose, onDeactivated, onUpdated,
}) => {
  const { items: projects } = useSelector((s: RootState) => s.projects)
  const role = user.primary_role || 'employee'

  const [mode, setMode] = useState<'view' | 'edit' | 'assign' | 'confirm-delete'>('view')
  const [editForm, setEditForm] = useState({
    full_name: user.full_name,
    department: user.department || '',
    phone: user.phone || '',
    email: user.email || '',
    roles: (user.roles || [user.primary_role || 'employee']).join(', '),
    primary_role: user.primary_role || 'employee',
  })
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [dmLoading, setDmLoading] = useState(false)

  const dispatch = useDispatch()
  const toast = useToast()
  const canManage = MANAGER_ROLES.includes(callerRole as any)
  const isPrivileged = EXEC_ROLES.includes(callerRole as any)

  const openDm = async () => {
    setDmLoading(true)
    try {
      const res = await api.post('/chat/rooms', { type: 'direct', participant_ids: [user.id] })
      dispatch(setActiveRoom(res.data.room_id))
      toast.success('Chat opened')
      navigate('/chat')
      onClose()
    } catch {
      navigate('/chat')
      onClose()
    } finally {
      setDmLoading(false)
    }
  }

  const handleEdit = async () => {
    setSaving(true)
    setActionError('')
    try {
      const payload: any = {
        full_name: editForm.full_name,
        department: editForm.department,
        phone: editForm.phone,
      }
      if (isPrivileged) {
        if (editForm.email) payload.email = editForm.email
        if (editForm.roles) {
          const rolesArr = editForm.roles.split(',').map((r: string) => r.trim()).filter(Boolean)
          payload.roles = rolesArr
          payload.primary_role = editForm.primary_role || rolesArr[0]
        }
      }
      await api.put(`/users/${user.id}`, payload)
      toast.success('User updated')
      onUpdated()
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to update user'
      toast.error(msg)
      setActionError(msg)
      setSaving(false)
    }
  }

  const handleDeactivate = async () => {
    setSaving(true)
    setActionError('')
    try {
      await api.delete(`/users/${user.id}`)
      toast.success('User deactivated')
      onDeactivated()
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to deactivate user'
      toast.error(msg)
      setActionError(msg)
      setSaving(false)
    }
  }

  const handleAssignProject = async () => {
    if (!selectedProjectId) return
    setAssigning(true)
    setActionError('')
    try {
      await api.post(`/projects/${selectedProjectId}/members/${user.id}`)
      toast.success('Project assigned')
      setMode('view')
      setSelectedProjectId('')
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to assign project'
      toast.error(msg)
      setActionError(msg)
    } finally {
      setAssigning(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto shadow-2xl animate-scale-in">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${AVATAR_COLORS[role as keyof typeof AVATAR_COLORS] || AVATAR_COLORS.employee} flex items-center justify-center text-white font-bold text-lg shadow-sm`}>
              {user.full_name?.[0]?.toUpperCase()}
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-800">{user.full_name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs px-2 py-0.5 rounded-lg font-medium border ${ROLE_COLORS[role as keyof typeof ROLE_COLORS] || ROLE_COLORS.employee}`}>
                  {role.replace('_', ' ')}
                </span>
                {user.is_active !== false ? (
                  <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" /> Active
                  </span>
                ) : (
                  <span className="text-xs text-red-400 font-medium">Inactive</span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {actionError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-700 text-xs px-3 py-2 rounded-xl">
              <AlertTriangle size={12} className="shrink-0" />
              {actionError}
            </div>
          )}

          {/* ── View mode ──────────────────────────────────────────────── */}
          {mode === 'view' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: <Mail size={13} />, label: 'Email', value: user.email },
                  { icon: <Phone size={13} />, label: 'Phone', value: user.phone || '—' },
                  { icon: <Building2 size={13} />, label: 'Department', value: user.department || '—' },
                  { icon: <Shield size={13} />, label: 'Role', value: role.replace('_', ' ') },
                ].map(({ icon, label, value }) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 text-gray-400 mb-1">
                      {icon}
                      <span className="text-xs">{label}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-800 capitalize truncate">{value}</p>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              {canManage && (
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    onClick={() => setMode('edit')}
                    className="flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-50 text-blue-600 rounded-xl text-sm font-medium hover:bg-blue-100 transition-colors"
                  >
                    <Pencil size={13} /> Edit Profile
                  </button>
                  <button
                    onClick={() => setMode('assign')}
                    className="flex items-center justify-center gap-2 px-3 py-2.5 bg-emerald-50 text-emerald-600 rounded-xl text-sm font-medium hover:bg-emerald-100 transition-colors"
                  >
                    <FolderOpen size={13} /> Assign Project
                  </button>
                  <a
                    href={`mailto:${user.email}`}
                    className="flex items-center justify-center gap-2 px-3 py-2.5 bg-violet-50 text-violet-600 rounded-xl text-sm font-medium hover:bg-violet-100 transition-colors"
                  >
                    <Mail size={13} /> Send Email
                  </a>
                  <button
                    onClick={openDm}
                    disabled={dmLoading}
                    className="flex items-center justify-center gap-2 px-3 py-2.5 bg-amber-50 text-amber-600 rounded-xl text-sm font-medium hover:bg-amber-100 transition-colors disabled:opacity-60"
                  >
                    {dmLoading ? <Loader2 size={13} className="animate-spin" /> : <MessageSquare size={13} />}
                    Message
                  </button>
                </div>
              )}

              {canManage && user.is_active !== false && (
                <button
                  onClick={() => setMode('confirm-delete')}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-red-50 text-red-600 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors"
                >
                  <Trash2 size={13} /> Deactivate Account
                </button>
              )}
            </>
          )}

          {/* ── Edit mode ──────────────────────────────────────────────── */}
          {mode === 'edit' && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Edit Profile</h3>
              {[
                { label: 'Full Name', key: 'full_name', placeholder: 'Full name' },
                { label: 'Department', key: 'department', placeholder: 'Department' },
                { label: 'Phone', key: 'phone', placeholder: 'Phone number' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                  <input
                    type="text"
                    value={(editForm as any)[key]}
                    onChange={e => setEditForm({ ...editForm, [key]: e.target.value })}
                    placeholder={placeholder}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  />
                </div>
              ))}
              {isPrivileged && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                      placeholder="Email address"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Primary Role</label>
                    <select
                      value={editForm.primary_role}
                      onChange={e => setEditForm({ ...editForm, primary_role: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                    >
                      {['employee', 'team_lead', 'pm', 'admin', 'coo', 'ceo'].map(r => (
                        <option key={r} value={r}>{r.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setMode('view'); setActionError('') }} className="flex-1 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium border border-gray-200 rounded-xl">Cancel</button>
                <button
                  onClick={handleEdit}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}

          {/* ── Assign project mode ────────────────────────────────────── */}
          {mode === 'assign' && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Assign to Project</h3>
              <select
                value={selectedProjectId}
                onChange={e => setSelectedProjectId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
              >
                <option value="">Select a project…</option>
                {projects.filter((p: any) => p.status !== 'cancelled' && p.status !== 'completed').map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <button onClick={() => { setMode('view'); setActionError('') }} className="flex-1 py-2 text-sm text-gray-600 font-medium border border-gray-200 rounded-xl hover:text-gray-800">Cancel</button>
                <button
                  onClick={handleAssignProject}
                  disabled={!selectedProjectId || assigning}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-50"
                >
                  {assigning ? <Loader2 size={13} className="animate-spin" /> : <FolderOpen size={13} />}
                  {assigning ? 'Assigning…' : 'Assign'}
                </button>
              </div>
            </div>
          )}

          {/* ── Confirm deactivate ─────────────────────────────────────── */}
          {mode === 'confirm-delete' && (
            <div className="space-y-3">
              <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
                <Trash2 size={22} className="text-red-400 mx-auto mb-2" />
                <p className="text-sm font-semibold text-red-700">Deactivate {user.full_name}?</p>
                <p className="text-xs text-red-500 mt-1">This will revoke their access. You can reactivate later.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setMode('view'); setActionError('') }} className="flex-1 py-2 text-sm text-gray-600 font-medium border border-gray-200 rounded-xl hover:text-gray-800">Cancel</button>
                <button
                  onClick={handleDeactivate}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  {saving ? 'Deactivating…' : 'Confirm Deactivate'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
