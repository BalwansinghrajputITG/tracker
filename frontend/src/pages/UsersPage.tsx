import React, { useEffect, useState, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  Users, Plus, X, Search, UserCheck, Mail, Phone, Building2,
  Shield, Loader2, AlertTriangle, Eye, EyeOff, CheckCircle2,
  Pencil, Trash2, MessageSquare, FolderOpen, ChevronRight,
  ChevronDown, Layers, UsersRound,
} from 'lucide-react'
import { RootState } from '../store'
import {
  fetchUsersRequest, createUserRequest, clearCreateError, User,
} from '../store/slices/usersSlice'
import { fetchProjectsRequest } from '../store/slices/projectsSlice'
import { fetchTeamsRequest } from '../store/slices/teamsSlice'
import { Modal } from '../components/common/Modal'
import { Pagination } from '../components/common/Pagination'
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

// ─── UsersPage ────────────────────────────────────────────────────────────────

export const UsersPage: React.FC = () => {
  const dispatch = useDispatch()
  const { items, total, isLoading, createLoading, createError } = useSelector(
    (s: RootState) => s.users
  )
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
  const [departments, setDepartments] = useState<string[]>([])
  const [activeView, setActiveView]   = useState<'people' | 'projects' | 'teams'>('people')
  const [allUsersMap, setAllUsersMap] = useState<Record<string, any>>({})
  const [allProjects, setAllProjects] = useState<any[]>([])
  const [allTeams, setAllTeams]       = useState<any[]>([])
  const [sideLoading, setSideLoading] = useState(false)

  useEffect(() => {
    api.get('/users/departments').then(res => setDepartments(res.data.departments || [])).catch(() => {})
  }, [])

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
      </div>

      {/* View tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit animate-fade-in-up">
        {([
          { key: 'people',   label: 'People',   icon: <Users size={13} /> },
          { key: 'projects', label: 'Projects',  icon: <FolderOpen size={13} /> },
          { key: 'teams',    label: 'Teams',     icon: <UsersRound size={13} /> },
        ] as const).map(v => (
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
        <TeamsView teams={allTeams} usersMap={allUsersMap} loading={sideLoading} />
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
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
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

// ─── Teams view ───────────────────────────────────────────────────────────────

const TeamsView: React.FC<{ teams: any[]; usersMap: Record<string, any>; loading: boolean }> = ({ teams, usersMap, loading }) => {
  const [search, setSearch]     = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const toggle = (id: string) => setExpanded(p => ({ ...p, [id]: !p[id] }))

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return teams.filter(t =>
      !q || t.name?.toLowerCase().includes(q) || t.department?.toLowerCase().includes(q)
    )
  }, [teams, search])

  if (loading) return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {[...Array(4)].map((_, i) => <div key={i} className="h-28 skeleton rounded-2xl" />)}
    </div>
  )

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-gray-500">{filtered.length} team{filtered.length !== 1 ? 's' : ''}</p>
        <div className="relative w-72">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search teams…"
            className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
          <UsersRound size={36} className="mb-2 text-gray-200" />
          <p className="text-sm font-medium">No teams found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filtered.map(team => {
            const lead    = usersMap[team.lead_id]
            const memberIds: string[] = team.member_ids || []
            const members = memberIds.map(id => usersMap[id]).filter(Boolean)
            const tls     = members.filter(u => u.primary_role === 'team_lead')
            const emps    = members.filter(u => u.primary_role === 'employee')
            const others  = members.filter(u => u.primary_role !== 'team_lead' && u.primary_role !== 'employee')
            const isOpen  = expanded[team.id]

            return (
              <div key={team.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Header */}
                <button
                  onClick={() => toggle(team.id)}
                  className="w-full flex items-start gap-3 px-5 py-4 text-left hover:bg-gray-50/50 transition-colors"
                >
                  <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                    <Layers size={15} className="text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{team.name}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                      {team.department && (
                        <span className="flex items-center gap-1">
                          <Building2 size={10} /> {team.department}
                        </span>
                      )}
                      {lead && (
                        <span className="flex items-center gap-1 text-teal-600 font-medium">
                          <Shield size={10} /> {lead.full_name}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Users size={10} /> {memberIds.length} member{memberIds.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {isOpen ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-300" />}
                  </div>
                </button>

                {/* Expanded */}
                {isOpen && (
                  <div className="px-5 pb-4 pt-3 border-t border-gray-50 space-y-3">
                    {members.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-2">No members in this team</p>
                    ) : (
                      <>
                        {[
                          { label: 'Team Leads', list: tls,    color: 'bg-teal-100 text-teal-700',       dot: 'bg-teal-500' },
                          { label: 'Employees',  list: emps,   color: 'bg-gray-100 text-gray-600',        dot: 'bg-gray-400' },
                          { label: 'Others',     list: others, color: 'bg-indigo-100 text-indigo-700',    dot: 'bg-indigo-500' },
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
