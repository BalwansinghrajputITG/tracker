import React, { useState, useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  X, Mail, Phone, Building2, Shield, Loader2, AlertTriangle,
  CheckCircle2, Plus, Eye, EyeOff, UserCheck,
} from 'lucide-react'
import { RootState } from '../../store'
import {
  createUserRequest, clearCreateError,
} from '../../store/slices/usersSlice'
import { Modal } from '../common/Modal'
import {
  ASSIGNABLE_ROLES,
  ROLE_AVATAR_GRADIENT as AVATAR_COLORS,
} from '../../constants/roles'

const emptyForm = {
  full_name: '',
  email: '',
  password: '',
  department: '',
  roles: ['employee'] as string[],
  phone: '',
}

interface DeptObj {
  id: string
  name: string
}

interface CreateUserModalProps {
  show: boolean
  onClose: () => void
  onSuccess: (name: string) => void
  callerRole: string
  deptObjects: DeptObj[]
}

export const CreateUserModal: React.FC<CreateUserModalProps> = ({
  show, onClose, onSuccess, callerRole, deptObjects,
}) => {
  const dispatch = useDispatch()
  const { createLoading, createError } = useSelector((s: RootState) => s.users)

  const [form, setForm] = useState(emptyForm)
  const [showPassword, setShowPassword] = useState(false)

  const assignableRoles = ASSIGNABLE_ROLES[callerRole] || []

  const toggleRole = (r: string) => {
    setForm(f => ({
      ...f,
      roles: f.roles.includes(r)
        ? f.roles.filter(x => x !== r)
        : [...f.roles, r],
    }))
  }

  const handleCreate = () => {
    if (!form.full_name || !form.email || !form.password || !form.department) return
    dispatch(createUserRequest({
      full_name: form.full_name,
      email: form.email,
      password: form.password,
      department: form.department,
      roles: form.roles,
      phone: form.phone || undefined,
    }))
  }

  const handleClose = () => {
    setForm(emptyForm)
    setShowPassword(false)
    dispatch(clearCreateError())
    onClose()
  }

  const prevLoading = useRef(false)
  useEffect(() => {
    if (prevLoading.current && !createLoading && !createError) {
      const name = form.full_name
      setForm(emptyForm)
      setShowPassword(false)
      onSuccess(name)
    }
    prevLoading.current = createLoading
  }, [createLoading, createError])

  if (!show) return null

  return (
    <Modal onClose={handleClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl animate-scale-in">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <UserCheck size={16} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-800">Add New User</h2>
              <p className="text-xs text-gray-400">Create an account and assign a role</p>
            </div>
          </div>
          <button onClick={handleClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {createError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-700 text-sm px-3 py-2.5 rounded-xl">
              <AlertTriangle size={13} className="shrink-0" />
              {createError}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
            <input
              type="text"
              value={form.full_name}
              onChange={e => setForm({ ...form, full_name: e.target.value })}
              placeholder="e.g. John Smith"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <span className="flex items-center gap-1.5"><Mail size={12} /> Email Address *</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="john@company.com"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Initial Password *</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder="Set a temporary password"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="flex items-center gap-1.5"><Building2 size={12} /> Department *</span>
              </label>
              <select
                value={form.department}
                onChange={e => setForm({ ...form, department: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
              >
                <option value="">Select…</option>
                {deptObjects.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="flex items-center gap-1.5"><Phone size={12} /> Phone</span>
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="+1 555 0100"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <span className="flex items-center gap-1.5"><Shield size={12} /> Assign Role *</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {assignableRoles.map(r => {
                const active = form.roles.includes(r)
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRole(r)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-200'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${active ? 'bg-white/20 text-white' : `bg-gradient-to-br ${AVATAR_COLORS[r as keyof typeof AVATAR_COLORS] || 'from-gray-400 to-gray-500'} text-white`}`}>
                      {r[0].toUpperCase()}
                    </span>
                    <span className="capitalize">{r.replace('_', ' ')}</span>
                    {active && <CheckCircle2 size={12} className="ml-auto" />}
                  </button>
                )
              })}
            </div>
            {form.roles.length === 0 && <p className="text-xs text-red-500 mt-1">At least one role is required.</p>}
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={handleClose} className="px-5 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">Cancel</button>
          <button
            onClick={handleCreate}
            disabled={!form.full_name || !form.email || !form.password || !form.department || form.roles.length === 0 || createLoading}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-all"
          >
            {createLoading
              ? <><Loader2 size={13} className="animate-spin" /> Creating…</>
              : <><Plus size={13} /> Create User</>}
          </button>
        </div>
      </div>
    </Modal>
  )
}
