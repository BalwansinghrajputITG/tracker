import React, { useEffect, useState, useRef, useCallback } from 'react'
import {
  Users, Plus, X, Search, UserCheck, Building2,
  Shield, Loader2, AlertTriangle, CheckCircle2,
  Pencil, Trash2, Layers,
} from 'lucide-react'
import { Modal } from '../common/Modal'
import { useToast } from '../shared'
import { api } from '../../utils/api'
import { navigate } from '../../pages/AppLayout'
import { EXEC_ROLES } from '../../constants/roles'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeptObj {
  id: string
  name: string
  description: string
  user_count: number
  pm_id?: string
  pm_name?: string
  tl_id?: string
  tl_name?: string
}

interface DeptMember {
  id: string
  full_name: string
  email: string
  primary_role: string
  department: string
}

interface DepartmentsTabProps {
  callerRole: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export const DepartmentsTab: React.FC<DepartmentsTabProps> = ({ callerRole }) => {
  const toast = useToast()
  const isAdminOrAbove = EXEC_ROLES.includes(callerRole as any)
  const isCeoOrCoo = isAdminOrAbove

  // ── Dept state ─────────────────────────────────────────────────────────────
  const [deptObjects, setDeptObjects] = useState<DeptObj[]>([])
  const [deptLoading, setDeptLoading] = useState(false)
  const [showDeptModal, setShowDeptModal] = useState(false)
  const [editingDept, setEditingDept] = useState<DeptObj | null>(null)
  const [deptForm, setDeptForm] = useState({ name: '', description: '', pm_id: '', tl_id: '' })
  const [deptSaving, setDeptSaving] = useState(false)
  const [deptError, setDeptError] = useState('')
  const [confirmDeleteDept, setConfirmDeleteDept] = useState<DeptObj | null>(null)
  const [deptDeleting, setDeptDeleting] = useState(false)

  // dept member management
  const [managingDept, setManagingDept] = useState<DeptObj | null>(null)
  const [deptMembers, setDeptMembers] = useState<DeptMember[]>([])
  const [deptMembersLoading, setDeptMembersLoading] = useState(false)
  const [deptMemberError, setDeptMemberError] = useState('')
  const [deptMemberAction, setDeptMemberAction] = useState<string | null>(null)
  const [deptAddSearch, setDeptAddSearch] = useState('')
  const [showDeptAddPanel, setShowDeptAddPanel] = useState(false)
  const [replaceMode, setReplaceMode] = useState(false)
  const [replaceIds, setReplaceIds] = useState<string[]>([])
  const [replaceSaving, setReplaceSaving] = useState(false)
  const [allUsersList, setAllUsersList] = useState<any[]>([])
  const [deptModalTab, setDeptModalTab] = useState<'members' | 'add' | 'replace'>('members')

  // members to add when creating a new dept
  const [deptFormMembers, setDeptFormMembers] = useState<string[]>([])
  const [deptFormMemberSearch, setDeptFormMemberSearch] = useState('')

  // paginated user picker for create/edit modal
  const [deptPickerUsers, setDeptPickerUsers] = useState<any[]>([])
  const [deptPickerPage, setDeptPickerPage] = useState(1)
  const [deptPickerHasMore, setDeptPickerHasMore] = useState(false)
  const [deptPickerLoading, setDeptPickerLoading] = useState(false)
  const [deptPickerError, setDeptPickerError] = useState('')
  const deptPickerSentinelRef = useRef<HTMLDivElement>(null)
  const deptPickerSearchRef = useRef('')

  // PM picker
  const [pmSearch, setPmSearch] = useState('')
  const [pmUsers, setPmUsers] = useState<any[]>([])
  const [pmPage, setPmPage] = useState(1)
  const [pmHasMore, setPmHasMore] = useState(false)
  const [pmLoading, setPmLoading] = useState(false)
  const [pmError, setPmError] = useState('')
  const pmSentinelRef = useRef<HTMLDivElement>(null)
  const pmSearchRef = useRef('')

  // TL picker
  const [tlSearch, setTlSearch] = useState('')
  const [tlUsers, setTlUsers] = useState<any[]>([])
  const [tlPage, setTlPage] = useState(1)
  const [tlHasMore, setTlHasMore] = useState(false)
  const [tlLoading, setTlLoading] = useState(false)
  const [tlError, setTlError] = useState('')
  const tlSentinelRef = useRef<HTMLDivElement>(null)
  const tlSearchRef = useRef('')

  const [pmSelected, setPmSelected] = useState<{ id: string; full_name: string } | null>(null)
  const [tlSelected, setTlSelected] = useState<{ id: string; full_name: string } | null>(null)

  // ── Functions ──────────────────────────────────────────────────────────────

  const loadDepts = () => {
    setDeptLoading(true)
    api.get('/departments')
      .then(res => setDeptObjects(res.data.departments || []))
      .catch(() => {})
      .finally(() => setDeptLoading(false))
  }

  useEffect(() => { loadDepts() }, [])

  const resetRolePickers = (pmSel?: { id: string; full_name: string } | null, tlSel?: { id: string; full_name: string } | null) => {
    setPmSearch(''); setPmUsers([]); setPmPage(1); setPmHasMore(true); setPmLoading(false); setPmError(''); setPmSelected(pmSel ?? null)
    setTlSearch(''); setTlUsers([]); setTlPage(1); setTlHasMore(true); setTlLoading(false); setTlError(''); setTlSelected(tlSel ?? null)
    pmSearchRef.current = ''; tlSearchRef.current = ''
  }

  const openCreateDeptModal = () => {
    setEditingDept(null)
    setDeptForm({ name: '', description: '', pm_id: '', tl_id: '' })
    setDeptFormMembers([])
    setDeptFormMemberSearch('')
    setDeptPickerUsers([])
    setDeptPickerPage(1)
    setDeptPickerHasMore(true)
    setDeptPickerError('')
    setDeptError('')
    resetRolePickers()
    setShowDeptModal(true)
  }

  const handleSaveDept = async () => {
    if (!deptForm.name.trim()) return
    setDeptSaving(true)
    setDeptError('')
    try {
      if (editingDept) {
        await api.put(`/departments/${editingDept.id}`, deptForm)
        if (deptFormMembers.length > 0) {
          await api.post(`/departments/${editingDept.id}/members`, { user_ids: deptFormMembers })
        }
      } else {
        const res = await api.post('/departments', deptForm)
        const newId: string = res.data.id
        if (deptFormMembers.length > 0) {
          await api.post(`/departments/${newId}/members`, { user_ids: deptFormMembers })
        }
      }
      setShowDeptModal(false)
      setEditingDept(null)
      setDeptForm({ name: '', description: '', pm_id: '', tl_id: '' })
      setDeptFormMembers([])
      setDeptFormMemberSearch('')
      toast.success(editingDept ? 'Department updated' : 'Department created')
      loadDepts()
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to save department'
      toast.error(msg)
      setDeptError(msg)
    } finally {
      setDeptSaving(false)
    }
  }

  const handleDeleteDept = async (dept: typeof confirmDeleteDept) => {
    if (!dept) return
    setDeptDeleting(true)
    try {
      await api.delete(`/departments/${dept.id}`)
      setConfirmDeleteDept(null)
      toast.success('Department deleted')
      loadDepts()
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to delete department'
      toast.error(msg)
      setDeptError(msg)
      setDeptDeleting(false)
    } finally {
      setDeptDeleting(false)
    }
  }

  const openManageDept = async (dept: DeptObj) => {
    setManagingDept(dept)
    setDeptMembers([])
    setDeptMemberError('')
    setShowDeptAddPanel(false)
    setDeptAddSearch('')
    setReplaceMode(false)
    setReplaceIds([])
    setDeptModalTab('members')
    setDeptMembersLoading(true)
    try {
      const membersRes = await api.get(`/departments/${dept.id}/members`)
      setDeptMembers(membersRes.data.members || [])
    } catch (err: any) {
      setDeptMemberError(err?.response?.data?.detail || 'Failed to load members')
    } finally {
      setDeptMembersLoading(false)
    }
    try {
      const usersRes = await api.get('/users/for-project', { params: { page: 1, limit: 500 } })
      setAllUsersList(usersRes.data.users || [])
    } catch {
      // allUsersList stays empty; Add/Replace tabs will show no users
    }
  }

  const handleRemoveDeptMember = async (userId: string) => {
    if (!managingDept) return
    setDeptMemberAction(userId)
    setDeptMemberError('')
    try {
      await api.delete(`/departments/${managingDept.id}/members/${userId}`)
      setDeptMembers(m => m.filter(u => u.id !== userId))
      setManagingDept(d => d ? { ...d, user_count: d.user_count - 1 } : d)
      toast.success('Member removed')
      loadDepts()
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to remove member'
      toast.error(msg)
      setDeptMemberError(msg)
    } finally {
      setDeptMemberAction(null)
    }
  }

  const handleAddDeptMember = async (userId: string) => {
    if (!managingDept) return
    setDeptMemberAction(userId)
    setDeptMemberError('')
    try {
      await api.post(`/departments/${managingDept.id}/members`, { user_ids: [userId] })
      const newUser = allUsersList.find(u => u.id === userId)
      if (newUser) {
        setDeptMembers(m => [...m, { id: newUser.id, full_name: newUser.full_name, email: newUser.email, primary_role: newUser.primary_role, department: managingDept.name }])
        setManagingDept(d => d ? { ...d, user_count: d.user_count + 1 } : d)
      }
      toast.success('Member added')
      loadDepts()
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to add member'
      toast.error(msg)
      setDeptMemberError(msg)
    } finally {
      setDeptMemberAction(null)
    }
  }

  const handleReplaceMembers = async () => {
    if (!managingDept) return
    setReplaceSaving(true)
    setDeptMemberError('')
    try {
      await api.put(`/departments/${managingDept.id}/members`, { user_ids: replaceIds })
      setReplaceMode(false)
      setReplaceIds([])
      toast.success('Members replaced')
      await openManageDept(managingDept)
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to replace members'
      toast.error(msg)
      setDeptMemberError(msg)
      setReplaceSaving(false)
    }
  }

  const loadDeptPickerPage = useCallback(async (page: number, search: string, reset: boolean) => {
    setDeptPickerLoading(true)
    if (reset) setDeptPickerError('')
    try {
      const params: any = { page, limit: 5 }
      if (search.trim()) params.search = search.trim()
      const res = await api.get('/users/for-project', { params })
      const fetched: any[] = res.data.users || []
      setDeptPickerUsers(prev => reset ? fetched : [...prev, ...fetched])
      setDeptPickerPage(page)
      setDeptPickerHasMore(fetched.length === 5)
    } catch (err: any) {
      setDeptPickerHasMore(false)
      setDeptPickerError(err?.response?.data?.detail || 'Failed to load users')
    } finally {
      setDeptPickerLoading(false)
    }
  }, [])

  // Reload picker whenever modal opens or search changes
  useEffect(() => {
    if (!showDeptModal) return
    deptPickerSearchRef.current = deptFormMemberSearch
    const timer = setTimeout(() => {
      setDeptPickerUsers([])
      setDeptPickerHasMore(true)
      loadDeptPickerPage(1, deptFormMemberSearch, true)
    }, deptFormMemberSearch ? 300 : 0)
    return () => clearTimeout(timer)
  }, [showDeptModal, deptFormMemberSearch, loadDeptPickerPage])

  // IntersectionObserver — triggers next page when sentinel scrolls into view
  useEffect(() => {
    const sentinel = deptPickerSentinelRef.current
    if (!sentinel || !deptPickerHasMore || deptPickerLoading) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        loadDeptPickerPage(deptPickerPage + 1, deptPickerSearchRef.current, false)
      }
    }, { threshold: 0.1 })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [deptPickerHasMore, deptPickerLoading, deptPickerPage, loadDeptPickerPage])

  // ── PM picker ──────────────────────────────────────────────────────────────
  const loadPmPage = useCallback(async (page: number, search: string, reset: boolean) => {
    setPmLoading(true)
    if (reset) setPmError('')
    try {
      const params: any = { page, limit: 5, roles: 'ceo,coo,pm' }
      if (search.trim()) params.search = search.trim()
      const res = await api.get('/users/for-project', { params })
      const fetched: any[] = res.data.users || []
      setPmUsers(prev => reset ? fetched : [...prev, ...fetched])
      setPmPage(page)
      setPmHasMore(fetched.length === 5)
    } catch (err: any) {
      setPmHasMore(false)
      setPmError(err?.response?.data?.detail || 'Failed to load users')
    } finally {
      setPmLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!showDeptModal) return
    pmSearchRef.current = pmSearch
    const timer = setTimeout(() => {
      setPmUsers([]); setPmHasMore(true)
      loadPmPage(1, pmSearch, true)
    }, pmSearch ? 300 : 0)
    return () => clearTimeout(timer)
  }, [showDeptModal, pmSearch, loadPmPage])

  useEffect(() => {
    const sentinel = pmSentinelRef.current
    if (!sentinel || !pmHasMore || pmLoading) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) loadPmPage(pmPage + 1, pmSearchRef.current, false)
    }, { threshold: 0.1 })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [pmHasMore, pmLoading, pmPage, loadPmPage])

  // ── TL picker ──────────────────────────────────────────────────────────────
  const loadTlPage = useCallback(async (page: number, search: string, reset: boolean) => {
    setTlLoading(true)
    if (reset) setTlError('')
    try {
      const params: any = { page, limit: 5, role: 'team_lead' }
      if (search.trim()) params.search = search.trim()
      const res = await api.get('/users/for-project', { params })
      const fetched: any[] = res.data.users || []
      setTlUsers(prev => reset ? fetched : [...prev, ...fetched])
      setTlPage(page)
      setTlHasMore(fetched.length === 5)
    } catch (err: any) {
      setTlHasMore(false)
      setTlError(err?.response?.data?.detail || 'Failed to load users')
    } finally {
      setTlLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!showDeptModal) return
    tlSearchRef.current = tlSearch
    const timer = setTimeout(() => {
      setTlUsers([]); setTlHasMore(true)
      loadTlPage(1, tlSearch, true)
    }, tlSearch ? 300 : 0)
    return () => clearTimeout(timer)
  }, [showDeptModal, tlSearch, loadTlPage])

  useEffect(() => {
    const sentinel = tlSentinelRef.current
    if (!sentinel || !tlHasMore || tlLoading) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) loadTlPage(tlPage + 1, tlSearchRef.current, false)
    }, { threshold: 0.1 })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [tlHasMore, tlLoading, tlPage, loadTlPage])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Header button */}
      {isCeoOrCoo && (
        <div className="flex items-center justify-between mb-4">
          <div />
          <button
            onClick={openCreateDeptModal}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-200 hover:scale-105 transition-all duration-200"
          >
            <Plus size={15} />
            New Department
          </button>
        </div>
      )}

      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{deptObjects.length} department{deptObjects.length !== 1 ? 's' : ''}</p>
        </div>

        {deptLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <div key={i} className="h-28 skeleton rounded-2xl" />)}
          </div>
        ) : deptObjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
              <Building2 size={22} className="text-gray-300" />
            </div>
            <p className="text-sm font-medium">No departments yet</p>
            <p className="text-xs text-gray-400 mt-1">Create your first department to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {deptObjects.map((dept, i) => (
              <div
                key={dept.id}
                onClick={() => openManageDept(dept)}
                className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 transition-all duration-200 animate-fade-in-up cursor-pointer"
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                    <Building2 size={18} className="text-blue-500" />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={e => { e.stopPropagation(); setEditingDept(dept); setDeptForm({ name: dept.name, description: dept.description, pm_id: dept.pm_id || '', tl_id: dept.tl_id || '' }); setDeptFormMembers([]); setDeptFormMemberSearch(''); setDeptPickerUsers([]); setDeptPickerPage(1); setDeptPickerHasMore(true); setDeptPickerError(''); setDeptError(''); resetRolePickers(dept.pm_id && dept.pm_name ? { id: dept.pm_id, full_name: dept.pm_name } : null, dept.tl_id && dept.tl_name ? { id: dept.tl_id, full_name: dept.tl_name } : null); setShowDeptModal(true) }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      title="Edit department"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setDeptError(''); setConfirmDeleteDept(dept) }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Delete department"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <h3 className="font-semibold text-gray-800 mb-1">{dept.name}</h3>
                {dept.description && (
                  <p className="text-xs text-gray-400 line-clamp-2 mb-3">{dept.description}</p>
                )}
                <div className="space-y-1.5 mt-auto">
                  {dept.pm_name && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 bg-blue-50 rounded-md flex items-center justify-center shrink-0">
                        <UserCheck size={11} className="text-blue-500" />
                      </div>
                      <span className="text-xs text-gray-500 truncate"><span className="font-medium text-gray-600">PM:</span> {dept.pm_name}</span>
                    </div>
                  )}
                  {dept.tl_name && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 bg-teal-50 rounded-md flex items-center justify-center shrink-0">
                        <Shield size={11} className="text-teal-500" />
                      </div>
                      <span className="text-xs text-gray-500 truncate"><span className="font-medium text-gray-600">TL:</span> {dept.tl_name}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 bg-blue-100 rounded-md flex items-center justify-center">
                      <Users size={11} className="text-blue-500" />
                    </div>
                    <span className="text-xs font-medium text-gray-600">{dept.user_count} member{dept.user_count !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Department Member Management Modal */}
      {managingDept && isAdminOrAbove && (
        <Modal onClose={() => { setManagingDept(null); setDeptAddSearch('') }}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-scale-in flex flex-col" style={{ maxHeight: '88vh' }}>

            {/* ── Header ── */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm shadow-blue-200">
                    <Building2 size={18} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 leading-tight">{managingDept.name}</h2>
                    {managingDept.description && (
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{managingDept.description}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => { setManagingDept(null); setDeptAddSearch('') }}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0 mt-0.5"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-4 mt-4">
                <div className="flex items-center gap-1.5 bg-blue-50 rounded-xl px-3 py-1.5">
                  <Users size={13} className="text-blue-500" />
                  <span className="text-sm font-semibold text-blue-700">{deptMembers.length}</span>
                  <span className="text-xs text-blue-500">member{deptMembers.length !== 1 ? 's' : ''}</span>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 mt-4 bg-gray-100 rounded-xl p-1">
                {([
                  { key: 'members', label: 'Members', icon: <Users size={12} /> },
                  { key: 'add',     label: 'Add Members', icon: <Plus size={12} /> },
                  { key: 'replace', label: 'Replace All', icon: <Layers size={12} /> },
                ] as const).map(t => (
                  <button
                    key={t.key}
                    onClick={() => {
                      setDeptModalTab(t.key)
                      setDeptAddSearch('')
                      if (t.key === 'replace') setReplaceIds(deptMembers.map(m => m.id))
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      deptModalTab === t.key
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
              {deptMemberError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-700 text-xs px-3 py-2.5 rounded-xl mb-3">
                  <AlertTriangle size={13} className="shrink-0" /> {deptMemberError}
                </div>
              )}

              {/* ── Members tab ── */}
              {deptModalTab === 'members' && (
                <>
                  {deptMembersLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
                      <Loader2 size={24} className="animate-spin text-blue-400" />
                      <p className="text-sm">Loading members…</p>
                    </div>
                  ) : deptMembers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
                      <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-1">
                        <Users size={24} className="text-gray-300" />
                      </div>
                      <p className="text-sm font-medium text-gray-500">No members yet</p>
                      <p className="text-xs text-gray-400">Switch to "Add Members" to assign people.</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {deptMembers.map(member => (
                        <div
                          key={member.id}
                          className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group"
                        >
                          <div
                            onClick={() => navigate(`/users/${member.id}`)}
                            className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                          >
                            <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0">
                              {member.full_name[0].toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-800 truncate leading-tight">{member.full_name}</p>
                              <p className="text-xs text-gray-400 truncate">{member.email}</p>
                            </div>
                          </div>
                          <span className="shrink-0 text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-lg font-medium capitalize">
                            {member.primary_role?.replace('_', ' ')}
                          </span>
                          <button
                            disabled={deptMemberAction === member.id}
                            onClick={() => handleRemoveDeptMember(member.id)}
                            title="Remove from department"
                            className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 disabled:opacity-50 transition-all"
                          >
                            {deptMemberAction === member.id
                              ? <Loader2 size={12} className="animate-spin text-red-400" />
                              : <Trash2 size={12} />}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* ── Add Members tab ── */}
              {deptModalTab === 'add' && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      autoFocus
                      type="text"
                      value={deptAddSearch}
                      onChange={e => setDeptAddSearch(e.target.value)}
                      placeholder="Search by name, email or role…"
                      className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    {allUsersList
                      .filter(u => {
                        if (deptMembers.some(m => m.id === u.id)) return false
                        if (!deptAddSearch.trim()) return true
                        const q = deptAddSearch.toLowerCase()
                        return (
                          u.full_name?.toLowerCase().includes(q) ||
                          u.email?.toLowerCase().includes(q) ||
                          u.primary_role?.toLowerCase().includes(q)
                        )
                      })
                      .slice(0, 15)
                      .map(u => (
                        <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                          <div className="w-9 h-9 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0">
                            {u.full_name?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate leading-tight">{u.full_name}</p>
                            <p className="text-xs text-gray-400 truncate">{u.email}</p>
                          </div>
                          <span className="shrink-0 text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-lg font-medium capitalize">
                            {u.primary_role?.replace('_', ' ')}
                          </span>
                          <button
                            disabled={deptMemberAction === u.id}
                            onClick={() => handleAddDeptMember(u.id)}
                            className="shrink-0 flex items-center gap-1.5 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                          >
                            {deptMemberAction === u.id
                              ? <Loader2 size={11} className="animate-spin" />
                              : <Plus size={11} />}
                            Add
                          </button>
                        </div>
                      ))}
                    {allUsersList.filter(u => !deptMembers.some(m => m.id === u.id)).length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                        <CheckCircle2 size={28} className="text-emerald-300" />
                        <p className="text-sm font-medium text-gray-500">Everyone is already a member</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Replace All tab ── */}
              {deptModalTab === 'replace' && (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                    <AlertTriangle size={15} className="text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-700 leading-relaxed">
                      Select the <strong>new complete member list</strong>. Users currently in this department but not selected will have their department cleared.
                    </p>
                  </div>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={deptAddSearch}
                      onChange={e => setDeptAddSearch(e.target.value)}
                      placeholder="Filter users…"
                      className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all"
                    />
                  </div>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {allUsersList
                      .filter(u => {
                        if (!deptAddSearch.trim()) return true
                        const q = deptAddSearch.toLowerCase()
                        return u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
                      })
                      .map(u => {
                        const checked = replaceIds.includes(u.id)
                        return (
                          <label
                            key={u.id}
                            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${checked ? 'bg-amber-50 border border-amber-200' : 'hover:bg-gray-50 border border-transparent'}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setReplaceIds(ids => checked ? ids.filter(id => id !== u.id) : [...ids, u.id])}
                              className="w-4 h-4 rounded accent-amber-600 shrink-0"
                            />
                            <div className={`w-9 h-9 bg-gradient-to-br rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0 ${checked ? 'from-amber-400 to-orange-500' : 'from-gray-300 to-gray-400'}`}>
                              {u.full_name?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-800 truncate leading-tight">{u.full_name}</p>
                              <p className="text-xs text-gray-400 truncate">{u.email}</p>
                            </div>
                            <span className="shrink-0 text-xs px-2 py-0.5 bg-white border border-gray-200 text-gray-500 rounded-lg font-medium capitalize">
                              {u.primary_role?.replace('_', ' ')}
                            </span>
                          </label>
                        )
                      })}
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <p className="text-sm text-gray-500">
                      <span className="font-semibold text-gray-800">{replaceIds.length}</span> selected
                    </p>
                    <button
                      disabled={replaceSaving}
                      onClick={handleReplaceMembers}
                      className="flex items-center gap-2 bg-amber-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors shadow-sm shadow-amber-200"
                    >
                      {replaceSaving
                        ? <><Loader2 size={13} className="animate-spin" /> Saving…</>
                        : <><CheckCircle2 size={13} /> Confirm Replace</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Department Create / Edit Modal */}
      {showDeptModal && isCeoOrCoo && (
        <Modal onClose={() => { setShowDeptModal(false); setDeptError('') }}>
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Building2 size={15} className="text-blue-600" />
                </div>
                <h2 className="text-base font-semibold text-gray-800">
                  {editingDept ? 'Edit Department' : 'New Department'}
                </h2>
              </div>
              <button onClick={() => { setShowDeptModal(false); setDeptError('') }} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <X size={14} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {deptError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-700 text-sm px-3 py-2 rounded-xl">
                  <AlertTriangle size={13} className="shrink-0" />
                  {deptError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department Name *</label>
                <input
                  autoFocus
                  type="text"
                  value={deptForm.name}
                  onChange={e => setDeptForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Engineering, Marketing, Finance"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={deptForm.description}
                  onChange={e => setDeptForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional — what does this department do?"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all resize-none"
                />
              </div>
              {/* PM and TL pickers */}
              <div className="grid grid-cols-2 gap-3">
                {/* ── PM picker ── */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <UserCheck size={13} className="text-blue-400" />
                    Project Manager
                    {deptForm.pm_id && (
                      <button onClick={() => { setDeptForm(f => ({ ...f, pm_id: '' })); setPmSelected(null) }} className="ml-auto text-xs text-gray-400 hover:text-red-500 font-normal">Clear</button>
                    )}
                  </label>
                  {pmSelected && (
                    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-blue-50 border border-blue-200 rounded-xl mb-1.5">
                      <div className="w-6 h-6 rounded-lg bg-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">{pmSelected.full_name[0]?.toUpperCase() || '?'}</div>
                      <span className="text-xs font-semibold text-blue-800 truncate">{pmSelected.full_name}</span>
                    </div>
                  )}
                  <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                    <div className="relative">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={pmSearch}
                        onChange={e => setPmSearch(e.target.value)}
                        placeholder="Search PM…"
                        className="w-full bg-transparent pl-7 pr-3 py-2 text-xs focus:outline-none border-b border-gray-200"
                      />
                    </div>
                    <div className="max-h-36 overflow-y-auto divide-y divide-gray-100">
                      {pmUsers.map(u => {
                        const selected = deptForm.pm_id === u.id
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => { setDeptForm(f => ({ ...f, pm_id: selected ? '' : u.id })); setPmSelected(selected ? null : { id: u.id, full_name: u.full_name }) }}
                            className={`w-full flex items-center gap-2 px-2.5 py-2 text-left transition-colors ${selected ? 'bg-blue-50' : 'hover:bg-white'}`}
                          >
                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0 ${selected ? 'bg-blue-500' : 'bg-gray-300'}`}>
                              {u.full_name?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-gray-700 truncate leading-tight">{u.full_name}</p>
                              <p className="text-xs text-gray-400 truncate capitalize">{u.primary_role?.replace('_', ' ')}</p>
                            </div>
                            {selected && <div className="w-3.5 h-3.5 rounded-full bg-blue-500 shrink-0" />}
                          </button>
                        )
                      })}
                      {pmHasMore && !pmLoading && <div ref={pmSentinelRef} className="h-1" />}
                      {pmLoading && <div className="flex items-center justify-center gap-1.5 py-2 text-xs text-gray-400"><Loader2 size={11} className="animate-spin text-blue-400" />Loading…</div>}
                      {pmError && !pmLoading && (
                        <div className="flex items-center justify-between px-2.5 py-2 text-xs text-red-600 bg-red-50">
                          <span className="flex items-center gap-1"><AlertTriangle size={11} />{pmError}</span>
                          <button onClick={() => loadPmPage(1, pmSearch, true)} className="text-blue-600 font-medium hover:underline shrink-0">Retry</button>
                        </div>
                      )}
                      {!pmLoading && !pmError && !pmHasMore && pmUsers.length === 0 && (
                        <div className="flex items-center justify-center py-3 text-xs text-gray-400">No users found</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── TL picker ── */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <Shield size={13} className="text-teal-400" />
                    Team Lead
                    {deptForm.tl_id && (
                      <button onClick={() => { setDeptForm(f => ({ ...f, tl_id: '' })); setTlSelected(null) }} className="ml-auto text-xs text-gray-400 hover:text-red-500 font-normal">Clear</button>
                    )}
                  </label>
                  {tlSelected && (
                    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-teal-50 border border-teal-200 rounded-xl mb-1.5">
                      <div className="w-6 h-6 rounded-lg bg-teal-500 flex items-center justify-center text-white text-xs font-bold shrink-0">{tlSelected.full_name[0]?.toUpperCase() || '?'}</div>
                      <span className="text-xs font-semibold text-teal-800 truncate">{tlSelected.full_name}</span>
                    </div>
                  )}
                  <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                    <div className="relative">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={tlSearch}
                        onChange={e => setTlSearch(e.target.value)}
                        placeholder="Search TL…"
                        className="w-full bg-transparent pl-7 pr-3 py-2 text-xs focus:outline-none border-b border-gray-200"
                      />
                    </div>
                    <div className="max-h-36 overflow-y-auto divide-y divide-gray-100">
                      {tlUsers.map(u => {
                        const selected = deptForm.tl_id === u.id
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => { setDeptForm(f => ({ ...f, tl_id: selected ? '' : u.id })); setTlSelected(selected ? null : { id: u.id, full_name: u.full_name }) }}
                            className={`w-full flex items-center gap-2 px-2.5 py-2 text-left transition-colors ${selected ? 'bg-teal-50' : 'hover:bg-white'}`}
                          >
                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0 ${selected ? 'bg-teal-500' : 'bg-gray-300'}`}>
                              {u.full_name?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-gray-700 truncate leading-tight">{u.full_name}</p>
                              <p className="text-xs text-gray-400 truncate">Team Lead</p>
                            </div>
                            {selected && <div className="w-3.5 h-3.5 rounded-full bg-teal-500 shrink-0" />}
                          </button>
                        )
                      })}
                      {tlHasMore && !tlLoading && <div ref={tlSentinelRef} className="h-1" />}
                      {tlLoading && <div className="flex items-center justify-center gap-1.5 py-2 text-xs text-gray-400"><Loader2 size={11} className="animate-spin text-teal-400" />Loading…</div>}
                      {tlError && !tlLoading && (
                        <div className="flex items-center justify-between px-2.5 py-2 text-xs text-red-600 bg-red-50">
                          <span className="flex items-center gap-1"><AlertTriangle size={11} />{tlError}</span>
                          <button onClick={() => loadTlPage(1, tlSearch, true)} className="text-blue-600 font-medium hover:underline shrink-0">Retry</button>
                        </div>
                      )}
                      {!tlLoading && !tlError && !tlHasMore && tlUsers.length === 0 && (
                        <div className="flex items-center justify-center py-3 text-xs text-gray-400">No team leads found</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {editingDept && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                  Renaming will automatically update all users and teams that belong to it.
                </p>
              )}

              {/* Member picker */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                  <Users size={13} className="text-gray-400" />
                  Add Members <span className="text-xs font-normal text-gray-400">(optional)</span>
                </label>
                <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={deptFormMemberSearch}
                      onChange={e => setDeptFormMemberSearch(e.target.value)}
                      placeholder="Search users to assign…"
                      className="w-full bg-transparent pl-8 pr-3 py-2.5 text-sm focus:outline-none border-b border-gray-200"
                    />
                  </div>
                  <div className="max-h-44 overflow-y-auto divide-y divide-gray-100">
                    {deptPickerUsers.map(u => {
                      const selected = deptFormMembers.includes(u.id)
                      return (
                        <label key={u.id} className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors ${selected ? 'bg-blue-50' : 'hover:bg-white'}`}>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => setDeptFormMembers(ids => selected ? ids.filter(id => id !== u.id) : [...ids, u.id])}
                            className="w-3.5 h-3.5 rounded accent-blue-600 shrink-0"
                          />
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0 transition-colors ${selected ? 'bg-blue-500' : 'bg-gray-300'}`}>
                            {u.full_name?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-gray-700 truncate">{u.full_name}</p>
                            <p className="text-xs text-gray-400 truncate">{u.email}</p>
                          </div>
                          <span className="text-xs text-gray-400 shrink-0 capitalize">{u.primary_role?.replace('_', ' ')}</span>
                        </label>
                      )
                    })}

                    {/* Infinite scroll sentinel */}
                    {deptPickerHasMore && !deptPickerLoading && (
                      <div ref={deptPickerSentinelRef} className="h-1" />
                    )}

                    {/* Loading spinner */}
                    {deptPickerLoading && (
                      <div className="flex items-center justify-center gap-2 py-3 text-xs text-gray-400">
                        <Loader2 size={13} className="animate-spin text-blue-400" />
                        Loading…
                      </div>
                    )}

                    {/* Error state */}
                    {!deptPickerLoading && deptPickerError && (
                      <div className="flex items-center justify-between gap-2 px-3 py-2.5 text-xs text-red-600 bg-red-50">
                        <span className="flex items-center gap-1.5"><AlertTriangle size={12} />{deptPickerError}</span>
                        <button
                          onClick={() => loadDeptPickerPage(1, deptFormMemberSearch, true)}
                          className="text-blue-600 font-medium hover:underline shrink-0"
                        >
                          Retry
                        </button>
                      </div>
                    )}

                    {/* Empty state */}
                    {!deptPickerLoading && !deptPickerError && !deptPickerHasMore && deptPickerUsers.length === 0 && (
                      <div className="flex items-center justify-center py-4 text-xs text-gray-400">
                        No users found
                      </div>
                    )}
                  </div>
                  {deptFormMembers.length > 0 && (
                    <div className="px-3 py-2 bg-blue-50 border-t border-blue-100 flex items-center justify-between">
                      <span className="text-xs text-blue-700 font-medium">{deptFormMembers.length} selected</span>
                      <button onClick={() => setDeptFormMembers([])} className="text-xs text-blue-500 hover:text-blue-700">Clear</button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => { setShowDeptModal(false); setDeptError('') }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">Cancel</button>
              <button
                onClick={handleSaveDept}
                disabled={!deptForm.name.trim() || deptSaving}
                className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-all"
              >
                {deptSaving ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : <><CheckCircle2 size={13} /> {editingDept ? 'Save Changes' : 'Create'}</>}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Department Delete Confirm */}
      {confirmDeleteDept && isCeoOrCoo && (
        <Modal onClose={() => setConfirmDeleteDept(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-scale-in p-6 space-y-4">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Trash2 size={20} className="text-red-500" />
              </div>
              <h3 className="text-base font-semibold text-gray-800">Delete "{confirmDeleteDept.name}"?</h3>
              <p className="text-sm text-gray-500 mt-1">
                {confirmDeleteDept.user_count > 0
                  ? `${confirmDeleteDept.user_count} user${confirmDeleteDept.user_count !== 1 ? 's' : ''} currently belong to this department. They will not be deleted, but their department field will remain as-is.`
                  : 'This department has no members. It will be permanently removed.'}
              </p>
            </div>
            {deptError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-700 text-xs px-3 py-2 rounded-xl">
                <AlertTriangle size={12} /> {deptError}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setConfirmDeleteDept(null)} className="flex-1 py-2.5 text-sm text-gray-600 font-medium border border-gray-200 rounded-xl hover:text-gray-800">Cancel</button>
              <button
                disabled={deptDeleting}
                onClick={() => handleDeleteDept(confirmDeleteDept)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 disabled:opacity-50"
              >
                {deptDeleting ? <><Loader2 size={13} className="animate-spin" /> Deleting…</> : <><Trash2 size={13} /> Delete</>}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
