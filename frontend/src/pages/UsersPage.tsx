import React, { useEffect, useState, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  Users, Plus, Search, CheckCircle2,
  FolderOpen, UsersRound, LayoutGrid,
} from 'lucide-react'
import { RootState } from '../store'
import {
  fetchUsersRequest, clearCreateError, User,
} from '../store/slices/usersSlice'
import { fetchProjectsRequest } from '../store/slices/projectsSlice'
import { setActiveRoom } from '../store/slices/chatSlice'
import { Pagination } from '../components/common/Pagination'
import { api } from '../utils/api'
import { navigate } from './AppLayout'
import {
  ALL_ROLES, MANAGER_ROLES, EXEC_ROLES,
  ROLE_BADGE_CLASSES as ROLE_COLORS,
} from '../constants/roles'

import { UserCard } from '../components/users/UserCard'
import { UserDetailModal } from '../components/users/UserDetailModal'
import { CreateUserModal } from '../components/users/CreateUserModal'
import { ProjectsView } from '../components/users/ProjectsView'
import { TeamsTab } from '../components/users/TeamsTab'
import { DepartmentsTab } from '../components/users/DepartmentsTab'

// ─── UsersPage ────────────────────────────────────────────────────────────────

export const UsersPage: React.FC = () => {
  const dispatch = useDispatch()
  const { items, total, isLoading } = useSelector((s: RootState) => s.users)
  const { user } = useSelector((s: RootState) => s.auth)

  const callerRole = user?.primary_role || 'employee'
  const canCreate = MANAGER_ROLES.includes(callerRole as any)
  const isAdminOrAbove = EXEC_ROLES.includes(callerRole as any)
  const isCeoOrCoo = isAdminOrAbove

  // ── People tab state ──────────────────────────────────────────────────────
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(12)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)

  type ViewKey = 'people' | 'projects' | 'teams' | 'departments'
  const [activeView, setActiveView] = useState<ViewKey>('people')

  const [allProjects, setAllProjects] = useState<any[]>([])
  const [allTeams, setAllTeams] = useState<any[]>([])
  const [sideLoading, setSideLoading] = useState(false)
  const [allUsersMap, setAllUsersMap] = useState<Record<string, any>>({})

  // Dept objects needed for CreateUserModal department dropdown
  interface DeptObj { id: string; name: string; description: string; user_count: number; pm_id?: string; pm_name?: string; tl_id?: string; tl_name?: string }
  const [deptObjects, setDeptObjects] = useState<DeptObj[]>([])

  const openDmWithUser = async (userId: string) => {
    try {
      const res = await api.post('/chat/rooms', { type: 'direct', participant_ids: [userId] })
      dispatch(setActiveRoom(res.data.room_id))
    } catch {}
    navigate('/chat')
  }

  const viewTabs: Array<{ key: ViewKey; label: string; icon: React.ReactNode }> = [
    { key: 'people', label: 'People', icon: <Users size={13} /> },
    { key: 'projects', label: 'Projects', icon: <FolderOpen size={13} /> },
    { key: 'teams', label: 'Teams', icon: <UsersRound size={13} /> },
    ...(isCeoOrCoo ? [{ key: 'departments' as ViewKey, label: 'Departments', icon: <LayoutGrid size={13} /> }] : []),
  ]

  // Load departments for CreateUserModal
  useEffect(() => {
    api.get('/departments')
      .then(res => setDeptObjects(res.data.departments || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const params: any = { page, limit }
    if (roleFilter !== 'all') params.role = roleFilter
    dispatch(fetchUsersRequest(params))
    dispatch(fetchProjectsRequest({}))
  }, [page, limit, roleFilter])

  // Load full users map + all projects + all teams for the Projects view
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
              <UserCard
                key={u.id}
                user={u}
                index={i}
                onClick={() => navigate(`/users/${u.id}`)}
                canManage={isAdminOrAbove || ['pm', 'team_lead'].includes(callerRole)}
                onEdit={() => setSelectedUser(u)}
              />
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
        <TeamsTab callerRole={callerRole} userId={(user as any)?.id || ''} />
      )}

      {activeView === 'departments' && isCeoOrCoo && (
        <DepartmentsTab callerRole={callerRole} />
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
      <CreateUserModal
        show={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={(name) => {
          setSuccessMsg(`User "${name}" created successfully!`)
          setShowModal(false)
        }}
        callerRole={callerRole}
        deptObjects={deptObjects}
      />
    </div>
  )
}
