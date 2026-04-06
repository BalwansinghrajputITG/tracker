import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  Users, Plus, X, Search, UserCheck, Mail, Phone, Building2,
  Shield, Loader2, AlertTriangle, AlertCircle, Eye, EyeOff, CheckCircle2,
  Pencil, Trash2, MessageSquare, FolderOpen, ChevronRight,
  ChevronDown, Layers, UsersRound, LayoutGrid,
  Crown, Briefcase, ExternalLink, UserMinus, UserPlus, FolderKanban,
} from 'lucide-react'
import { RootState } from '../store'
import {
  fetchUsersRequest, createUserRequest, clearCreateError, User,
} from '../store/slices/usersSlice'
import { fetchProjectsRequest } from '../store/slices/projectsSlice'
import { fetchTeamsRequest } from '../store/slices/teamsSlice'
import { Modal } from '../components/common/Modal'
import { Pagination } from '../components/common/Pagination'
import { UserPickerByRole } from '../components/common/UserPickerByRole'
import { api } from '../utils/api'
import { navigate } from './AppLayout'

// ─── Role config ──────────────────────────────────────────────────────────────

const ALL_ROLES = ['ceo', 'coo', 'admin', 'pm', 'team_lead', 'employee'] as const
type Role = typeof ALL_ROLES[number]

const ASSIGNABLE_ROLES: Record<string, Role[]> = {
  ceo:       ['ceo', 'coo', 'admin', 'pm', 'team_lead', 'employee'],
  coo:       ['ceo', 'coo', 'admin', 'pm', 'team_lead', 'employee'],
  admin:     ['pm', 'team_lead', 'employee'],
  pm:        ['team_lead', 'employee'],
  team_lead: ['employee'],
}

const ROLE_COLORS: Record<string, string> = {
  ceo:       'bg-purple-100 text-purple-700 border-purple-200',
  coo:       'bg-indigo-100 text-indigo-700 border-indigo-200',
  admin:     'bg-rose-100 text-rose-700 border-rose-200',
  pm:        'bg-blue-100 text-blue-700 border-blue-200',
  team_lead: 'bg-teal-100 text-teal-700 border-teal-200',
  employee:  'bg-gray-100 text-gray-600 border-gray-200',
}

const AVATAR_COLORS: Record<string, string> = {
  ceo:       'from-purple-500 to-violet-600',
  coo:       'from-indigo-500 to-blue-600',
  admin:     'from-rose-500 to-red-600',
  pm:        'from-blue-500 to-cyan-600',
  team_lead: 'from-teal-500 to-emerald-600',
  employee:  'from-slate-400 to-gray-500',
}

const emptyForm = {
  full_name: '',
  email: '',
  password: '',
  department: '',
  roles: ['employee'] as string[],
  phone: '',
}

// ─── Teams helpers ────────────────────────────────────────────────────────────

const _TEAM_AVATAR_GRADIENTS = [
  'from-blue-400 to-indigo-500', 'from-purple-400 to-pink-500',
  'from-emerald-400 to-teal-500', 'from-orange-400 to-red-500',
  'from-cyan-400 to-blue-500', 'from-rose-400 to-pink-500',
]
const _TEAM_DEPT_COLOR_PALETTE = [
  'bg-blue-100 text-blue-700', 'bg-purple-100 text-purple-700',
  'bg-green-100 text-green-700', 'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700', 'bg-amber-100 text-amber-700',
  'bg-teal-100 text-teal-700', 'bg-cyan-100 text-cyan-700',
  'bg-rose-100 text-rose-700', 'bg-indigo-100 text-indigo-700',
]
function teamGradient(name: string): string {
  return _TEAM_AVATAR_GRADIENTS[name.charCodeAt(0) % _TEAM_AVATAR_GRADIENTS.length]
}
function teamDeptColor(dept: string): string {
  let hash = 0
  for (let i = 0; i < dept.length; i++) hash = (hash * 31 + dept.charCodeAt(i)) >>> 0
  return _TEAM_DEPT_COLOR_PALETTE[hash % _TEAM_DEPT_COLOR_PALETTE.length]
}

// ─── UsersPage ────────────────────────────────────────────────────────────────

export const UsersPage: React.FC = () => {
  const dispatch = useDispatch()
  const { items, total, isLoading, createLoading, createError, subordinates } = useSelector(
    (s: RootState) => s.users
  )
  const { items: teamsItems, isLoading: teamsLoading, error: teamsError, total: teamsTotal } = useSelector((s: RootState) => s.teams)
  const { user } = useSelector((s: RootState) => s.auth)

  const callerRole = user?.primary_role || 'employee'
  const canCreate = ['ceo', 'coo', 'admin', 'pm', 'team_lead'].includes(callerRole)
  const assignableRoles = ASSIGNABLE_ROLES[callerRole] || []

  const [page, setPage]   = useState(1)
  const [limit, setLimit] = useState(12)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [showPassword, setShowPassword] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  interface DeptObj { id: string; name: string; description: string; user_count: number; pm_id?: string; pm_name?: string; tl_id?: string; tl_name?: string }
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
  interface DeptMember { id: string; full_name: string; email: string; primary_role: string; department: string }
  const [managingDept, setManagingDept] = useState<DeptObj | null>(null)
  const [deptMembers, setDeptMembers] = useState<DeptMember[]>([])
  const [deptMembersLoading, setDeptMembersLoading] = useState(false)
  const [deptMemberError, setDeptMemberError] = useState('')
  const [deptMemberAction, setDeptMemberAction] = useState<string | null>(null) // userId in flight
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
  type ViewKey = 'people' | 'projects' | 'teams' | 'departments'
  const [activeView, setActiveView] = useState<ViewKey>('people')
  const isAdminOrAbove = ['ceo', 'coo', 'admin'].includes(callerRole)
  // keep alias so existing references still compile
  const isCeoOrCoo = isAdminOrAbove
  const [allUsersMap, setAllUsersMap] = useState<Record<string, any>>({})

  // ── Teams tab state ──────────────────────────────────────────────────────────
  const [teamsPage, setTeamsPage] = useState(1)
  const [teamsLimit, setTeamsLimit] = useState(12)
  const [selectedTeam, setSelectedTeam] = useState<any>(null)
  const [teamProjects, setTeamProjects] = useState<any[]>([])
  const [teamProjectsLoading, setTeamProjectsLoading] = useState(false)
  const [teamMode, setTeamMode] = useState<'view' | 'edit' | 'confirm-delete'>('view')
  const [editTeamForm, setEditTeamForm] = useState({ name: '', description: '', department: '', lead_id: '', pm_id: '', member_ids: [] as string[] })
  const [editMemberSearch, setEditMemberSearch] = useState('')
  const [teamActionLoading, setTeamActionLoading] = useState(false)
  const [teamActionError, setTeamActionError] = useState('')
  const [showTeamModal, setShowTeamModal] = useState(false)
  const [teamCreating, setTeamCreating] = useState(false)
  const [teamCreateError, setTeamCreateError] = useState('')
  const [teamForm, setTeamForm] = useState({ name: '', description: '', department: '', lead_id: '', pm_id: '', member_ids: [] as string[] })
  const [quickAddSearch, setQuickAddSearch] = useState('')
  const [quickAddLoading, setQuickAddLoading] = useState<string | null>(null)
  const [removingMember, setRemovingMember] = useState<string | null>(null)
  const [showQuickAdd, setShowQuickAdd] = useState(false)

  // Teams permissions and helpers
  const teamsAllUsers = subordinates.length > 0 ? subordinates : items
  const teamsCanCreate = ['ceo', 'coo', 'pm', 'team_lead'].includes(callerRole)
  const canManageTeam = (team?: any) => {
    if (['ceo', 'coo', 'pm'].includes(callerRole)) return true
    if (callerRole === 'team_lead' && team) return team.lead_id === (user as any)?.id
    return false
  }
  const teamsPmUsers = useMemo(() => teamsAllUsers.filter((u: any) => ['pm', 'coo', 'ceo'].includes(u.primary_role)), [teamsAllUsers])
  const teamsLeadUsers = useMemo(() => teamsAllUsers.filter((u: any) => ['team_lead', 'pm', 'coo', 'ceo'].includes(u.primary_role)), [teamsAllUsers])
  const getTeamUserName = (id: string) => teamsAllUsers.find((u: any) => u.id === id)?.full_name || items.find((u: any) => u.id === id)?.full_name || id
  const getTeamUserDept = (id: string) => teamsAllUsers.find((u: any) => u.id === id)?.department || items.find((u: any) => u.id === id)?.department || ''

  const viewTabs: Array<{ key: ViewKey; label: string; icon: React.ReactNode }> = [
    { key: 'people', label: 'People', icon: <Users size={13} /> },
    { key: 'projects', label: 'Projects', icon: <FolderOpen size={13} /> },
    { key: 'teams', label: 'Teams', icon: <UsersRound size={13} /> },
    ...(isCeoOrCoo ? [{ key: 'departments' as ViewKey, label: 'Departments', icon: <LayoutGrid size={13} /> }] : []),
  ]
  const [allProjects, setAllProjects] = useState<any[]>([])
  const [allTeams, setAllTeams]       = useState<any[]>([])
  const [sideLoading, setSideLoading] = useState(false)

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
      loadDepts()
    } catch (err: any) {
      setDeptError(err?.response?.data?.detail || 'Failed to save department')
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
      loadDepts()
    } catch (err: any) {
      setDeptError(err?.response?.data?.detail || 'Failed to delete department')
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
      loadDepts()
    } catch (err: any) {
      setDeptMemberError(err?.response?.data?.detail || 'Failed to remove member')
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
      loadDepts()
    } catch (err: any) {
      setDeptMemberError(err?.response?.data?.detail || 'Failed to add member')
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
      await openManageDept(managingDept)
    } catch (err: any) {
      setDeptMemberError(err?.response?.data?.detail || 'Failed to replace members')
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

  useEffect(() => {
    if (activeView !== 'teams') return
    dispatch(fetchTeamsRequest({ page: teamsPage, limit: teamsLimit }))
    dispatch(fetchUsersRequest({}))
  }, [activeView, teamsPage, teamsLimit])

  const handleTeamQuickRemove = async (teamId: string, userId: string) => {
    setRemovingMember(userId)
    setTeamActionError('')
    try {
      await api.delete(`/teams/${teamId}/members/${userId}`)
      setSelectedTeam((t: any) => t ? { ...t, member_ids: t.member_ids.filter((id: string) => id !== userId) } : t)
      dispatch(fetchTeamsRequest({ page: teamsPage, limit: teamsLimit }))
    } catch (err: any) {
      setTeamActionError(err?.response?.data?.detail || 'Failed to remove member')
    } finally {
      setRemovingMember(null)
    }
  }

  const handleTeamQuickAdd = async (teamId: string, userId: string) => {
    setQuickAddLoading(userId)
    setTeamActionError('')
    try {
      await api.post(`/teams/${teamId}/members`, { user_ids: [userId] })
      setSelectedTeam((t: any) => t ? { ...t, member_ids: [...(t.member_ids || []), userId] } : t)
      dispatch(fetchTeamsRequest({ page: teamsPage, limit: teamsLimit }))
    } catch (err: any) {
      setTeamActionError(err?.response?.data?.detail || 'Failed to add member')
    } finally {
      setQuickAddLoading(null)
    }
  }

  const handleTeamCreate = async () => {
    if (!teamForm.name || !teamForm.department || !teamForm.lead_id) return
    setTeamCreating(true)
    setTeamCreateError('')
    try {
      await api.post('/teams', { ...teamForm, pm_id: teamForm.pm_id || undefined })
      dispatch(fetchTeamsRequest({ page: teamsPage, limit: teamsLimit }))
      setShowTeamModal(false)
      setTeamForm({ name: '', description: '', department: '', lead_id: '', pm_id: '', member_ids: [] })
    } catch (err: any) {
      setTeamCreateError(err?.response?.data?.detail || 'Failed to create team')
    } finally {
      setTeamCreating(false)
    }
  }

  useEffect(() => {
    const params: any = { page, limit }
    if (roleFilter !== 'all') params.role = roleFilter
    dispatch(fetchUsersRequest(params))
    dispatch(fetchProjectsRequest({}))
  }, [page, limit, roleFilter])

  // Load full users map + all projects + all teams for the Projects/Teams views
  useEffect(() => {
    if (activeView === 'people') return
    setSideLoading(true)
    Promise.all([
      api.get('/users/for-project', { params: { page: 1, limit: 200 } }),
      api.get('/projects', { params: { page: 1, limit: 100 } }),
      api.get('/teams', { params: { page: 1, limit: 100 } }),
    ]).then(([uRes, pRes, tRes]) => {
      const map: Record<string, any> = {}
      for (const u of uRes.data.users || []) map[u.id] = u
      setAllUsersMap(map)
      setAllProjects(pRes.data.projects || [])
      setAllTeams(tRes.data.teams || [])
    }).catch(() => {}).finally(() => setSideLoading(false))
  }, [activeView])

  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(''), 3000)
      return () => clearTimeout(t)
    }
  }, [successMsg])

  const filtered = useMemo(() => {
    return items.filter(u => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q)
      const matchRole = roleFilter === 'all' || u.primary_role === roleFilter
      return matchSearch && matchRole
    })
  }, [items, search, roleFilter])

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

  const prevLoading = React.useRef(false)
  useEffect(() => {
    if (prevLoading.current && !createLoading && !createError) {
      setSuccessMsg(`User "${form.full_name}" created successfully!`)
      setShowModal(false)
      setForm(emptyForm)
      setShowPassword(false)
    }
    prevLoading.current = createLoading
  }, [createLoading, createError])

  const handleCloseModal = () => {
    setShowModal(false)
    setForm(emptyForm)
    setShowPassword(false)
    dispatch(clearCreateError())
  }

  const toggleRole = (r: string) => {
    setForm(f => ({
      ...f,
      roles: f.roles.includes(r)
        ? f.roles.filter(x => x !== r)
        : [...f.roles, r],
    }))
  }

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    items.forEach(u => { counts[u.primary_role] = (counts[u.primary_role] || 0) + 1 })
    return counts
  }, [items])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-500 text-sm mt-0.5">{total} total members</p>
        </div>
        {canCreate && activeView === 'people' && (
          <button
            onClick={() => { dispatch(clearCreateError()); setShowModal(true) }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-200 hover:scale-105 transition-all duration-200"
          >
            <Plus size={15} />
            Add User
          </button>
        )}
        {isCeoOrCoo && activeView === 'departments' && (
          <button
            onClick={openCreateDeptModal}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-200 hover:scale-105 transition-all duration-200"
          >
            <Plus size={15} />
            New Department
          </button>
        )}
        {teamsCanCreate && activeView === 'teams' && (
          <button
            onClick={() => {
              if (callerRole === 'team_lead') {
                setTeamForm(f => ({ ...f, lead_id: (user as any)?.id || '' }))
              }
              setShowTeamModal(true)
            }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-200 hover:scale-105 transition-all duration-200"
          >
            <Plus size={15} />
            New Team
          </button>
        )}
      </div>

      {/* View tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit animate-fade-in-up">
        {viewTabs.map(v => (
          <button
            key={v.key}
            onClick={() => setActiveView(v.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeView === v.key
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {v.icon} {v.label}
          </button>
        ))}
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 rounded-xl animate-fade-in">
          <CheckCircle2 size={15} className="shrink-0" />
          {successMsg}
        </div>
      )}

      {activeView === 'people' && (<>
        <div className="flex flex-wrap gap-2 animate-fade-in-up" style={{ animationDelay: '0.04s' }}>
          <button
            onClick={() => { setRoleFilter('all'); setPage(1) }}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
              roleFilter === 'all'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
            }`}
          >
            All
          </button>
          {ALL_ROLES.filter(r => roleCounts[r]).map(r => (
            <button
              key={r}
              onClick={() => { setRoleFilter(roleFilter === r ? 'all' : r); setPage(1) }}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                roleFilter === r
                  ? 'bg-blue-600 text-white border-blue-600'
                  : `${ROLE_COLORS[r]} hover:opacity-80`
              }`}
            >
              {r.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="relative animate-fade-in-up" style={{ animationDelay: '0.06s' }}>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, or department…"
            className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white transition-all"
          />
        </div>

        {isLoading && items.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <div key={i} className="h-28 skeleton rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 animate-fade-in">
            <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
              <Users size={22} className="text-gray-300" />
            </div>
            <p className="text-sm font-medium">No users found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((u, i) => (
              <UserCard key={u.id} user={u} index={i} onClick={() => navigate(`/users/${u.id}`)} />
            ))}
          </div>
        )}

        <Pagination
          page={page}
          totalPages={Math.ceil(total / limit)}
          total={total}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={l => { setLimit(l); setPage(1) }}
          limitOptions={[6, 12, 24]}
        />
      </>)}

      {activeView === 'projects' && (
        <ProjectsView projects={allProjects} usersMap={allUsersMap} loading={sideLoading} />
      )}

      {activeView === 'teams' && (
        <div className="space-y-6 animate-fade-in">
          {teamsError && (
            <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-100 flex items-center gap-2">
              <AlertCircle size={14} />
              {teamsError}
            </div>
          )}

          {teamsLoading && teamsItems.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => <div key={i} className="h-44 skeleton" />)}
            </div>
          ) : teamsItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
                <Users size={22} className="text-gray-300" />
              </div>
              <p className="text-sm font-medium">No teams found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {teamsItems.map((team, i) => {
                const lead = team.lead_id ? teamsAllUsers.find((u: any) => u.id === team.lead_id) || items.find((u: any) => u.id === team.lead_id) : null
                return (
                  <div
                    key={team.id}
                    onClick={async () => {
                      setSelectedTeam(team)
                      setTeamProjects([])
                      setTeamProjectsLoading(true)
                      try {
                        const res = await api.get('/projects', { params: { team_id: team.id, limit: 50 } })
                        setTeamProjects(res.data.projects || [])
                      } catch { setTeamProjects([]) }
                      finally { setTeamProjectsLoading(false) }
                    }}
                    className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 card-hover cursor-pointer animate-fade-in-up"
                    style={{ animationDelay: `${i * 0.04}s` }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-800 truncate">{team.name}</h3>
                        {team.description && (
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{team.description}</p>
                        )}
                      </div>
                      {team.department && (
                        <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ml-2 shrink-0 ${teamDeptColor(team.department)}`}>
                          {team.department}
                        </span>
                      )}
                    </div>

                    {lead && (
                      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-50">
                        <div className={`w-7 h-7 bg-gradient-to-br ${teamGradient(lead.full_name)} rounded-lg flex items-center justify-center text-white text-xs font-bold`}>
                          {lead.full_name[0]}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <p className="text-xs font-semibold text-gray-700 truncate">{lead.full_name}</p>
                            <Crown size={10} className="text-amber-500 shrink-0" />
                          </div>
                          <p className="text-xs text-gray-400">Team Lead</p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
                      <div className="flex items-center gap-1">
                        <Users size={11} />
                        <span>{team.member_ids?.length || 0} members</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Briefcase size={11} />
                        <span>{team.project_ids?.length || 0} projects</span>
                      </div>
                    </div>

                    {team.member_ids?.length > 0 && (
                      <div className="flex items-center -space-x-1.5">
                        {team.member_ids.slice(0, 5).map((id: string) => {
                          const name = getTeamUserName(id)
                          return (
                            <div key={id} title={name} className={`w-7 h-7 bg-gradient-to-br ${teamGradient(name)} rounded-full flex items-center justify-center text-white text-xs font-bold ring-2 ring-white`}>
                              {name[0]}
                            </div>
                          )
                        })}
                        {team.member_ids.length > 5 && (
                          <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 text-xs font-semibold ring-2 ring-white">
                            +{team.member_ids.length - 5}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <Pagination
            page={teamsPage}
            totalPages={Math.ceil(teamsTotal / teamsLimit)}
            total={teamsTotal}
            limit={teamsLimit}
            onPageChange={setTeamsPage}
            onLimitChange={l => { setTeamsLimit(l); setTeamsPage(1) }}
            limitOptions={[6, 12, 24]}
          />

          {/* Team Detail Modal */}
          {selectedTeam && (
            <Modal onClose={() => { setSelectedTeam(null); setTeamMode('view'); setTeamActionError(''); setTeamProjects([]); setShowQuickAdd(false); setQuickAddSearch('') }}>
              <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl animate-scale-in">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-800">{selectedTeam.name}</h2>
                    {selectedTeam.department && (
                      <span className={`text-xs px-2 py-0.5 rounded-lg font-medium mt-1 inline-block ${teamDeptColor(selectedTeam.department)}`}>
                        {selectedTeam.department}
                      </span>
                    )}
                  </div>
                  <button onClick={() => { setSelectedTeam(null); setTeamMode('view'); setTeamActionError(''); setTeamProjects([]) }} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                    <X size={16} />
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  {teamActionError && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-700 text-xs px-3 py-2 rounded-xl">
                      <AlertCircle size={12} className="shrink-0" />
                      {teamActionError}
                    </div>
                  )}

                  {/* View mode */}
                  {teamMode === 'view' && (
                    <>
                      {selectedTeam.description && <p className="text-sm text-gray-600">{selectedTeam.description}</p>}

                      {selectedTeam.lead_id && (
                        <div>
                          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">Team Lead</p>
                          <div className="flex items-center gap-3 bg-amber-50 rounded-xl p-3 border border-amber-100">
                            <div className={`w-9 h-9 bg-gradient-to-br ${teamGradient(getTeamUserName(selectedTeam.lead_id))} rounded-xl flex items-center justify-center text-white text-sm font-bold`}>
                              {getTeamUserName(selectedTeam.lead_id)[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-800">{getTeamUserName(selectedTeam.lead_id)}</p>
                              <p className="text-xs text-gray-500">{getTeamUserDept(selectedTeam.lead_id)}</p>
                            </div>
                            <Crown size={14} className="text-amber-500 shrink-0" />
                          </div>
                        </div>
                      )}

                      {(selectedTeam.member_ids?.length > 0 || canManageTeam(selectedTeam)) && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                              Members ({selectedTeam.member_ids?.length || 0})
                            </p>
                            {canManageTeam(selectedTeam) && (
                              <button
                                onClick={() => { setShowQuickAdd(v => !v); setQuickAddSearch('') }}
                                className="flex items-center gap-1 text-xs text-blue-600 font-medium hover:text-blue-700 transition-colors"
                              >
                                <UserPlus size={11} />
                                {showQuickAdd ? 'Close' : 'Add Member'}
                              </button>
                            )}
                          </div>

                          {showQuickAdd && canManageTeam(selectedTeam) && (
                            <div className="mb-3 bg-blue-50 rounded-xl p-3 border border-blue-100">
                              <p className="text-xs font-medium text-blue-700 mb-2">Search & add a member</p>
                              <input
                                type="text"
                                value={quickAddSearch}
                                onChange={e => setQuickAddSearch(e.target.value)}
                                placeholder="Search by name or department…"
                                className="w-full border border-blue-200 rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 mb-2"
                              />
                              <div className="space-y-1 max-h-32 overflow-y-auto">
                                {teamsAllUsers
                                  .filter((u: any) => {
                                    if (selectedTeam.member_ids?.includes(u.id)) return false
                                    if (!quickAddSearch.trim()) return true
                                    const q = quickAddSearch.toLowerCase()
                                    return u.full_name.toLowerCase().includes(q) || u.department?.toLowerCase().includes(q)
                                  })
                                  .slice(0, 8)
                                  .map((u: any) => (
                                    <div key={u.id} className="flex items-center justify-between gap-2 py-1 px-1.5 rounded-lg hover:bg-white transition-colors">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <div className={`w-6 h-6 bg-gradient-to-br ${teamGradient(u.full_name)} rounded-md flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                                          {u.full_name[0]}
                                        </div>
                                        <div className="min-w-0">
                                          <p className="text-xs font-medium text-gray-700 truncate">{u.full_name}</p>
                                          <p className="text-xs text-gray-400">{u.primary_role?.replace('_', ' ')}</p>
                                        </div>
                                      </div>
                                      <button
                                        disabled={quickAddLoading === u.id}
                                        onClick={() => handleTeamQuickAdd(selectedTeam.id, u.id)}
                                        className="shrink-0 flex items-center gap-1 text-xs bg-blue-600 text-white px-2 py-1 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                      >
                                        {quickAddLoading === u.id ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                                        Add
                                      </button>
                                    </div>
                                  ))}
                                {teamsAllUsers.filter((u: any) => !selectedTeam.member_ids?.includes(u.id)).length === 0 && (
                                  <p className="text-xs text-gray-400 text-center py-2">All users are already members</p>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="space-y-1.5 max-h-48 overflow-y-auto">
                            {(selectedTeam.member_ids || []).map((id: string) => {
                              const memberUser = teamsAllUsers.find((u: any) => u.id === id) || items.find((u: any) => u.id === id)
                              const name = getTeamUserName(id)
                              const isRemoving = removingMember === id
                              return (
                                <div key={id} className="flex items-center gap-2.5 py-1.5 px-2 rounded-xl hover:bg-blue-50 transition-colors group">
                                  <div onClick={() => navigate(`/users/${id}`)} className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer">
                                    <div className={`w-7 h-7 bg-gradient-to-br ${teamGradient(name)} rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                                      {name[0]}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-sm text-gray-700 font-medium truncate">{name}</p>
                                      {memberUser && (
                                        <p className="text-xs text-gray-400">{memberUser.primary_role?.replace('_', ' ')} · {memberUser.department}</p>
                                      )}
                                    </div>
                                  </div>
                                  {canManageTeam(selectedTeam) && (
                                    <button
                                      disabled={isRemoving}
                                      onClick={() => handleTeamQuickRemove(selectedTeam.id, id)}
                                      title="Remove from team"
                                      className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 disabled:opacity-50 transition-all"
                                    >
                                      {isRemoving ? <Loader2 size={11} className="animate-spin text-red-400" /> : <UserMinus size={11} />}
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                            {selectedTeam.member_ids?.length === 0 && (
                              <p className="text-xs text-gray-400 italic py-1 px-2">No members yet. Use "Add Member" to assign people.</p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Projects */}
                      <div>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2 flex items-center gap-1.5">
                          <FolderKanban size={11} />
                          Projects ({teamProjectsLoading ? '…' : teamProjects.length})
                        </p>
                        {teamProjectsLoading ? (
                          <div className="flex items-center gap-2 py-3 text-xs text-gray-400">
                            <Loader2 size={13} className="animate-spin" /> Loading projects…
                          </div>
                        ) : teamProjects.length === 0 ? (
                          <p className="text-xs text-gray-400 italic py-1">No projects assigned to this team yet.</p>
                        ) : (
                          <div className="space-y-1.5 max-h-36 overflow-y-auto">
                            {teamProjects.map((proj: any) => (
                              <div
                                key={proj.id}
                                onClick={() => { setSelectedTeam(null); setTeamMode('view'); setTeamProjects([]); navigate(`/projects/${proj.id}`) }}
                                className="flex items-center gap-2.5 py-2 px-3 rounded-xl hover:bg-blue-50 transition-colors cursor-pointer group border border-transparent hover:border-blue-100"
                              >
                                <div className={`w-2 h-2 rounded-full shrink-0 ${
                                  proj.status === 'active'    ? 'bg-emerald-400' :
                                  proj.status === 'planning'  ? 'bg-blue-400' :
                                  proj.status === 'on_hold'   ? 'bg-amber-400' :
                                  proj.status === 'completed' ? 'bg-gray-300' :
                                  proj.status === 'cancelled' ? 'bg-red-400' : 'bg-gray-300'
                                }`} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-700 font-medium truncate group-hover:text-blue-700">{proj.name}</p>
                                  <p className="text-xs text-gray-400 capitalize">{proj.status?.replace('_', ' ')} · {proj.progress_percentage ?? 0}% done</p>
                                </div>
                                <ExternalLink size={12} className="text-gray-300 group-hover:text-blue-400 shrink-0" />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                        <div>
                          <p className="text-xs text-gray-400">Projects</p>
                          <p className="text-lg font-bold text-gray-800">{teamProjects.length || selectedTeam.project_ids?.length || 0}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Members</p>
                          <p className="text-lg font-bold text-gray-800">{selectedTeam.member_ids?.length || 0}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-1">
                        {selectedTeam.lead_id && (
                          <a href="/chat" className="flex flex-col items-center gap-1.5 px-2 py-3 bg-amber-50 text-amber-600 rounded-xl text-xs font-medium hover:bg-amber-100 transition-colors">
                            <MessageSquare size={14} />
                            Message Lead
                          </a>
                        )}
                        {canManageTeam(selectedTeam) && (
                          <>
                            <button
                              onClick={() => {
                                setEditTeamForm({ name: selectedTeam.name, description: selectedTeam.description || '', department: selectedTeam.department || '', lead_id: selectedTeam.lead_id || '', pm_id: selectedTeam.pm_id || '', member_ids: selectedTeam.member_ids || [] })
                                setEditMemberSearch('')
                                setShowQuickAdd(false)
                                setTeamMode('edit')
                              }}
                              className="flex flex-col items-center gap-1.5 px-2 py-3 bg-blue-50 text-blue-600 rounded-xl text-xs font-medium hover:bg-blue-100 transition-colors"
                            >
                              <Pencil size={14} />
                              Edit Team
                            </button>
                            <button
                              onClick={() => setTeamMode('confirm-delete')}
                              className="flex flex-col items-center gap-1.5 px-2 py-3 bg-red-50 text-red-600 rounded-xl text-xs font-medium hover:bg-red-100 transition-colors"
                            >
                              <Trash2 size={14} />
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}

                  {/* Edit mode */}
                  {teamMode === 'edit' && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-gray-700">Edit Team</h3>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Team Name</label>
                        <input type="text" value={editTeamForm.name} onChange={e => setEditTeamForm({ ...editTeamForm, name: e.target.value })} placeholder="Team name" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Department</label>
                        <input type="text" value={editTeamForm.department} onChange={e => setEditTeamForm({ ...editTeamForm, department: e.target.value })} placeholder="Department" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                        <input type="text" value={editTeamForm.description} onChange={e => setEditTeamForm({ ...editTeamForm, description: e.target.value })} placeholder="Brief description" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                          <Crown size={11} className="text-amber-500" /> Team Lead
                        </label>
                        <select value={editTeamForm.lead_id} onChange={e => setEditTeamForm({ ...editTeamForm, lead_id: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50">
                          <option value="">— Select team lead —</option>
                          {(teamsLeadUsers.length > 0 ? teamsLeadUsers : teamsAllUsers).map((u: any) => (
                            <option key={u.id} value={u.id}>{u.full_name} · {u.primary_role?.replace('_', ' ')} ({u.department})</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                          <UserCheck size={11} className="text-blue-500" /> Project Manager
                        </label>
                        <select value={editTeamForm.pm_id} onChange={e => setEditTeamForm({ ...editTeamForm, pm_id: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50">
                          <option value="">— None / Select PM —</option>
                          {(teamsPmUsers.length > 0 ? teamsPmUsers : teamsAllUsers).map((u: any) => (
                            <option key={u.id} value={u.id}>{u.full_name} · {u.primary_role?.replace('_', ' ')} ({u.department})</option>
                          ))}
                        </select>
                      </div>
                      <UserPickerByRole
                        users={teamsAllUsers}
                        selected={editTeamForm.member_ids}
                        onChange={ids => setEditTeamForm({ ...editTeamForm, member_ids: ids })}
                        maxHeight="max-h-44"
                      />
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => { setTeamMode('view'); setTeamActionError(''); setEditMemberSearch('') }} className="flex-1 py-2 text-sm text-gray-600 font-medium border border-gray-200 rounded-xl hover:text-gray-800">Cancel</button>
                        <button
                          disabled={teamActionLoading}
                          onClick={async () => {
                            setTeamActionLoading(true)
                            setTeamActionError('')
                            try {
                              await api.put(`/teams/${selectedTeam.id}`, editTeamForm)
                              setSelectedTeam({ ...selectedTeam, ...editTeamForm })
                              dispatch(fetchTeamsRequest({ page: teamsPage, limit: teamsLimit }))
                              setTeamMode('view')
                              setEditMemberSearch('')
                            } catch (err: any) {
                              setTeamActionError(err?.response?.data?.detail || 'Failed to update team')
                            } finally {
                              setTeamActionLoading(false)
                            }
                          }}
                          className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50"
                        >
                          {teamActionLoading ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                          {teamActionLoading ? 'Saving…' : 'Save Changes'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Confirm delete mode */}
                  {teamMode === 'confirm-delete' && (
                    <div className="space-y-3">
                      <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
                        <Trash2 size={22} className="text-red-400 mx-auto mb-2" />
                        <p className="text-sm font-semibold text-red-700">Delete "{selectedTeam.name}"?</p>
                        <p className="text-xs text-red-500 mt-1">This team will be deactivated.</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { setTeamMode('view'); setTeamActionError('') }} className="flex-1 py-2 text-sm text-gray-600 font-medium border border-gray-200 rounded-xl hover:text-gray-800">Cancel</button>
                        <button
                          disabled={teamActionLoading}
                          onClick={async () => {
                            setTeamActionLoading(true)
                            setTeamActionError('')
                            try {
                              await api.delete(`/teams/${selectedTeam.id}`)
                              setSelectedTeam(null)
                              setTeamMode('view')
                              dispatch(fetchTeamsRequest({ page: teamsPage, limit: teamsLimit }))
                            } catch (err: any) {
                              setTeamActionError(err?.response?.data?.detail || 'Failed to delete team')
                              setTeamActionLoading(false)
                            }
                          }}
                          className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 disabled:opacity-50"
                        >
                          {teamActionLoading ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                          {teamActionLoading ? 'Deleting…' : 'Confirm Delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Modal>
          )}

          {/* Create Team Modal */}
          {showTeamModal && (
            <Modal onClose={() => { setShowTeamModal(false); setTeamForm({ name: '', description: '', department: '', lead_id: '', pm_id: '', member_ids: [] }) }}>
              <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center">
                      <Users size={15} className="text-blue-600" />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-800">New Team</h2>
                  </div>
                  <button onClick={() => setShowTeamModal(false)} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                    <X size={16} />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  {teamCreateError && (
                    <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-xl flex items-center gap-2">
                      <AlertCircle size={13} />
                      {teamCreateError}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Team Name *</label>
                    <input type="text" value={teamForm.name} onChange={e => setTeamForm({ ...teamForm, name: e.target.value })} placeholder="e.g. Frontend Team" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
                    <input type="text" value={teamForm.department} onChange={e => setTeamForm({ ...teamForm, department: e.target.value })} placeholder="e.g. Engineering" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                      <Crown size={13} className="text-amber-500" /> Team Lead *
                    </label>
                    <select value={teamForm.lead_id} onChange={e => setTeamForm({ ...teamForm, lead_id: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50">
                      <option value="">— Select team lead —</option>
                      {(teamsLeadUsers.length > 0 ? teamsLeadUsers : teamsAllUsers).map((u: any) => (
                        <option key={u.id} value={u.id}>{u.full_name} · {u.primary_role?.replace('_', ' ')} ({u.department})</option>
                      ))}
                    </select>
                    {teamsLeadUsers.length === 0 && teamsAllUsers.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">No users loaded. Try refreshing the page.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                      <UserCheck size={13} className="text-blue-500" /> Project Manager
                    </label>
                    <select value={teamForm.pm_id} onChange={e => setTeamForm({ ...teamForm, pm_id: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50">
                      <option value="">— None / Select PM —</option>
                      {(teamsPmUsers.length > 0 ? teamsPmUsers : teamsAllUsers).map((u: any) => (
                        <option key={u.id} value={u.id}>{u.full_name} · {u.primary_role?.replace('_', ' ')} ({u.department})</option>
                      ))}
                    </select>
                  </div>
                  <UserPickerByRole
                    users={teamsAllUsers}
                    selected={teamForm.member_ids}
                    onChange={ids => setTeamForm({ ...teamForm, member_ids: ids })}
                    maxHeight="max-h-52"
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea value={teamForm.description} onChange={e => setTeamForm({ ...teamForm, description: e.target.value })} placeholder="Brief description..." rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all resize-none" />
                  </div>
                </div>
                <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
                  <button onClick={() => { setShowTeamModal(false); setTeamForm({ name: '', description: '', department: '', lead_id: '', pm_id: '', member_ids: [] }) }} className="px-5 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">Cancel</button>
                  <button onClick={handleTeamCreate} disabled={!teamForm.name || !teamForm.department || !teamForm.lead_id || teamCreating} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-all">
                    {teamCreating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    {teamCreating ? 'Creating...' : 'Create Team'}
                  </button>
                </div>
              </div>
            </Modal>
          )}
        </div>
      )}

      {activeView === 'departments' && isCeoOrCoo && (
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
      )}

      {/* User Detail Modal */}
      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          callerRole={callerRole}
          onClose={() => setSelectedUser(null)}
          onDeactivated={() => {
            setSelectedUser(null)
            dispatch(fetchUsersRequest())
          }}
          onUpdated={() => {
            setSelectedUser(null)
            dispatch(fetchUsersRequest())
          }}
        />
      )}

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

      {/* Create User Modal */}
      {showModal && (
        <Modal onClose={handleCloseModal}>
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
              <button onClick={handleCloseModal} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
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
                <input type="text" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="e.g. John Smith" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1"><span className="flex items-center gap-1.5"><Mail size={12} /> Email Address *</span></label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="john@company.com" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Initial Password *</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Set a temporary password" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all" />
                  <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1"><span className="flex items-center gap-1.5"><Building2 size={12} /> Department *</span></label>
                  <select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50">
                    <option value="">Select…</option>
                    {deptObjects.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1"><span className="flex items-center gap-1.5"><Phone size={12} /> Phone</span></label>
                  <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+1 555 0100" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2"><span className="flex items-center gap-1.5"><Shield size={12} /> Assign Role *</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {assignableRoles.map(r => {
                    const active = form.roles.includes(r)
                    return (
                      <button key={r} type="button" onClick={() => toggleRole(r)}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                          active ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-200' : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                        }`}>
                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${active ? 'bg-white/20 text-white' : `bg-gradient-to-br ${AVATAR_COLORS[r]} text-white`}`}>{r[0].toUpperCase()}</span>
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
              <button onClick={handleCloseModal} className="px-5 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">Cancel</button>
              <button
                onClick={handleCreate}
                disabled={!form.full_name || !form.email || !form.password || !form.department || form.roles.length === 0 || createLoading}
                className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-all"
              >
                {createLoading ? <><Loader2 size={13} className="animate-spin" /> Creating…</> : <><Plus size={13} /> Create User</>}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Projects view ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  planning:  'bg-blue-100 text-blue-700 border-blue-200',
  active:    'bg-green-100 text-green-700 border-green-200',
  on_hold:   'bg-amber-100 text-amber-700 border-amber-200',
  completed: 'bg-violet-100 text-violet-700 border-violet-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
}

const ProjectsView: React.FC<{ projects: any[]; usersMap: Record<string, any>; loading: boolean }> = ({ projects, usersMap, loading }) => {
  const [search, setSearch]   = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const toggle = (id: string) => setExpanded(p => ({ ...p, [id]: !p[id] }))

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return projects.filter(p =>
      !q || p.name?.toLowerCase().includes(q) || p.status?.toLowerCase().includes(q)
    )
  }, [projects, search])

  if (loading) return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {[...Array(4)].map((_, i) => <div key={i} className="h-32 skeleton rounded-2xl" />)}
    </div>
  )

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-gray-500">{filtered.length} project{filtered.length !== 1 ? 's' : ''}</p>
        <div className="relative w-72">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search projects…"
            className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
          <FolderOpen size={36} className="mb-2 text-gray-200" />
          <p className="text-sm font-medium">No projects found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filtered.map(project => {
            const memberIds: string[] = project.member_ids || []
            const members = memberIds.map(id => usersMap[id]).filter(Boolean)
            const teamLeads = members.filter(u => u.primary_role === 'team_lead')
            const employees = members.filter(u => u.primary_role === 'employee')
            const others    = members.filter(u => u.primary_role !== 'team_lead' && u.primary_role !== 'employee')
            const isOpen = expanded[project.id]
            const statusColor = STATUS_COLORS[project.status] || 'bg-gray-100 text-gray-600 border-gray-200'

            return (
              <div key={project.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Header */}
                <button
                  onClick={() => toggle(project.id)}
                  className="w-full flex items-start gap-3 px-5 py-4 text-left hover:bg-gray-50/50 transition-colors"
                >
                  <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                    <FolderOpen size={15} className="text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-800 truncate">{project.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-lg border font-medium capitalize ${statusColor}`}>
                        {project.status?.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Users size={10} /> {memberIds.length} member{memberIds.length !== 1 ? 's' : ''}
                      </span>
                      {teamLeads.length > 0 && (
                        <span className="flex items-center gap-1 text-teal-600">
                          <Shield size={10} /> {teamLeads.length} TL{teamLeads.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {employees.length > 0 && (
                        <span>{employees.length} employee{employees.length !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-semibold text-gray-500">{project.progress_percentage || 0}%</span>
                    {isOpen ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-300" />}
                  </div>
                </button>

                {/* Progress bar */}
                <div className="h-1 bg-gray-100 mx-5">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all"
                    style={{ width: `${project.progress_percentage || 0}%` }}
                  />
                </div>

                {/* Expanded member list */}
                {isOpen && (
                  <div className="px-5 pb-4 pt-3 space-y-3 border-t border-gray-50 mt-1">
                    {members.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-2">No members assigned yet</p>
                    ) : (
                      <>
                        {[
                          { label: 'Team Leads', list: teamLeads, color: 'bg-teal-100 text-teal-700', dot: 'bg-teal-500' },
                          { label: 'Employees',  list: employees, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
                          { label: 'Others',     list: others,    color: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500' },
                        ].filter(g => g.list.length > 0).map(group => (
                          <div key={group.label}>
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${group.dot}`} />
                              {group.label}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {group.list.map(u => (
                                <button
                                  key={u.id}
                                  onClick={() => navigate(`/users/${u.id}`)}
                                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors hover:opacity-80 ${group.color}`}
                                >
                                  <span className={`w-4 h-4 rounded-md flex items-center justify-center text-white text-[9px] font-bold shrink-0 ${AVATAR_COLORS[u.primary_role] ? `bg-gradient-to-br ${AVATAR_COLORS[u.primary_role]}` : 'bg-gray-400'}`}>
                                    {u.full_name?.[0]?.toUpperCase()}
                                  </span>
                                  {u.full_name}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                    <button
                      onClick={() => navigate(`/projects/${project.id}`)}
                      className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-700 font-medium mt-1"
                    >
                      <ChevronRight size={12} /> Open project
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── User card ────────────────────────────────────────────────────────────────

const UserCard: React.FC<{ user: User; index: number; onClick: () => void }> = ({ user, index, onClick }) => {
  const role = user.primary_role || 'employee'
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-100 transition-all duration-200 animate-fade-in-up cursor-pointer group"
      style={{ animationDelay: `${index * 0.03}s` }}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${AVATAR_COLORS[role] || AVATAR_COLORS.employee} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm`}>
          {user.full_name?.[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-800 truncate">{user.full_name}</p>
            <span className={`text-xs px-2 py-0.5 rounded-lg font-medium border ${ROLE_COLORS[role] || ROLE_COLORS.employee}`}>
              {role.replace('_', ' ')}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 truncate">
            <Mail size={10} className="shrink-0" />
            {user.email}
          </p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Building2 size={10} />
              {user.department || '—'}
            </span>
            {user.is_active !== false ? (
              <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                Active
              </span>
            ) : (
              <span className="text-xs text-gray-400 font-medium">Inactive</span>
            )}
          </div>
        </div>
        <ChevronRight size={14} className="text-gray-300 group-hover:text-blue-400 transition-colors shrink-0 mt-1" />
      </div>
    </div>
  )
}

// ─── User Detail Modal ────────────────────────────────────────────────────────

const UserDetailModal: React.FC<{
  user: User
  callerRole: string
  onClose: () => void
  onDeactivated: () => void
  onUpdated: () => void
}> = ({ user, callerRole, onClose, onDeactivated, onUpdated }) => {
  const { items: projects } = useSelector((s: RootState) => s.projects)
  const role = user.primary_role || 'employee'

  const [mode, setMode] = useState<'view' | 'edit' | 'assign' | 'confirm-delete'>('view')
  const [editForm, setEditForm] = useState({ full_name: user.full_name, department: user.department || '', phone: user.phone || '' })
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [assigning, setAssigning] = useState(false)

  const canManage = ['ceo', 'coo', 'pm', 'team_lead'].includes(callerRole)

  const handleEdit = async () => {
    setSaving(true)
    setActionError('')
    try {
      await api.put(`/users/${user.id}`, editForm)
      onUpdated()
    } catch (err: any) {
      setActionError(err?.response?.data?.detail || 'Failed to update user')
      setSaving(false)
    }
  }

  const handleDeactivate = async () => {
    setSaving(true)
    setActionError('')
    try {
      await api.delete(`/users/${user.id}`)
      onDeactivated()
    } catch (err: any) {
      setActionError(err?.response?.data?.detail || 'Failed to deactivate user')
      setSaving(false)
    }
  }

  const handleAssignProject = async () => {
    if (!selectedProjectId) return
    setAssigning(true)
    setActionError('')
    try {
      await api.post(`/projects/${selectedProjectId}/members/${user.id}`)
      setMode('view')
      setSelectedProjectId('')
    } catch (err: any) {
      setActionError(err?.response?.data?.detail || 'Failed to assign project')
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
            <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${AVATAR_COLORS[role] || AVATAR_COLORS.employee} flex items-center justify-center text-white font-bold text-lg shadow-sm`}>
              {user.full_name?.[0]?.toUpperCase()}
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-800">{user.full_name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs px-2 py-0.5 rounded-lg font-medium border ${ROLE_COLORS[role] || ROLE_COLORS.employee}`}>
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
                  <a
                    href="/chat"
                    className="flex items-center justify-center gap-2 px-3 py-2.5 bg-amber-50 text-amber-600 rounded-xl text-sm font-medium hover:bg-amber-100 transition-colors"
                  >
                    <MessageSquare size={13} /> Message
                  </a>
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
                {projects.filter(p => p.status !== 'cancelled' && p.status !== 'completed').map(p => (
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
