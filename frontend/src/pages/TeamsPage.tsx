import React, { useEffect, useState, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Users, Plus, X, AlertCircle, Loader2, Crown, Briefcase, Pencil, Trash2, MessageSquare, CheckCircle2, Search, UserCheck, FolderKanban, ExternalLink } from 'lucide-react'
import { Modal } from '../components/common/Modal'
import { Pagination } from '../components/common/Pagination'
import { UserPickerByRole } from '../components/common/UserPickerByRole'
import { RootState } from '../store'
import { fetchTeamsRequest } from '../store/slices/teamsSlice'
import { fetchUsersRequest } from '../store/slices/usersSlice'
import { api } from '../utils/api'
import { navigate } from './AppLayout'

const _DEPT_COLOR_PALETTE = [
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-green-100 text-green-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
  'bg-amber-100 text-amber-700',
  'bg-teal-100 text-teal-700',
  'bg-cyan-100 text-cyan-700',
  'bg-rose-100 text-rose-700',
  'bg-indigo-100 text-indigo-700',
]
function deptColor(dept: string): string {
  let hash = 0
  for (let i = 0; i < dept.length; i++) hash = (hash * 31 + dept.charCodeAt(i)) >>> 0
  return _DEPT_COLOR_PALETTE[hash % _DEPT_COLOR_PALETTE.length]
}
const AVATAR_GRADIENTS = [
  'from-blue-400 to-indigo-500', 'from-purple-400 to-pink-500',
  'from-emerald-400 to-teal-500', 'from-orange-400 to-red-500',
  'from-cyan-400 to-blue-500', 'from-rose-400 to-pink-500',
]

export const TeamsPage: React.FC = () => {
  const dispatch = useDispatch()
  const { items: teams, isLoading, error, total } = useSelector((s: RootState) => s.teams)
  const { items: users, subordinates } = useSelector((s: RootState) => s.users)
  const { user } = useSelector((s: RootState) => s.auth)

  // Use subordinates for dropdowns (all visible users, unpaginated)
  // Fall back to paginated items if subordinates not yet loaded
  const allUsers = subordinates.length > 0 ? subordinates : users

  const [page, setPage]   = useState(1)
  const [limit, setLimit] = useState(12)

  const [selectedTeam, setSelectedTeam] = useState<any>(null)
  const [teamProjects, setTeamProjects] = useState<any[]>([])
  const [teamProjectsLoading, setTeamProjectsLoading] = useState(false)
  const [teamMode, setTeamMode] = useState<'view' | 'edit' | 'confirm-delete'>('view')
  const [editTeamForm, setEditTeamForm] = useState({ name: '', description: '', department: '', lead_id: '', pm_id: '', member_ids: [] as string[] })
  const [editMemberSearch, setEditMemberSearch] = useState('')
  const [teamActionLoading, setTeamActionLoading] = useState(false)
  const [teamActionError, setTeamActionError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [memberSearch, setMemberSearch] = useState('')
  const [form, setForm] = useState({ name: '', description: '', department: '', lead_id: '', pm_id: '', member_ids: [] as string[] })

  const canCreate = ['ceo', 'coo', 'pm', 'team_lead'].includes(user?.primary_role || '')
  const canManageTeam = (team?: any) => {
    const role = user?.primary_role || ''
    if (['ceo', 'coo', 'pm'].includes(role)) return true
    if (role === 'team_lead' && team) return team.lead_id === (user as any)?.id
    return false
  }

  useEffect(() => {
    dispatch(fetchTeamsRequest({ page, limit }))
    dispatch(fetchUsersRequest())
  }, [page, limit])

  const getUserName = (id: string) => allUsers.find(u => u.id === id)?.full_name || users.find(u => u.id === id)?.full_name || id
  const getUserDept = (id: string) => allUsers.find(u => u.id === id)?.department || users.find(u => u.id === id)?.department || ''

  const pmUsers    = useMemo(() => allUsers.filter(u => ['pm', 'coo', 'ceo'].includes(u.primary_role)), [allUsers])
  const leadUsers  = useMemo(() => allUsers.filter(u => ['team_lead', 'pm', 'coo', 'ceo'].includes(u.primary_role)), [allUsers])
  const getGradient = (name: string) => AVATAR_GRADIENTS[name.charCodeAt(0) % AVATAR_GRADIENTS.length]
  const getDeptColor = (dept: string) => deptColor(dept || '')

  const handleCreate = async () => {
    if (!form.name || !form.department || !form.lead_id) return
    setCreating(true)
    setCreateError('')
    try {
      await api.post('/teams', { ...form, pm_id: form.pm_id || undefined })
      dispatch(fetchTeamsRequest({ page, limit }))
      setShowModal(false)
      setForm({ name: '', description: '', department: '', lead_id: '', pm_id: '', member_ids: [] })
      setMemberSearch('')
    } catch (err: any) {
      setCreateError(err?.response?.data?.detail || 'Failed to create team')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teams</h1>
          <p className="text-gray-500 text-sm mt-1">{total} total teams</p>
        </div>
        {canCreate && (
          <button
            onClick={() => {
              // Pre-fill lead_id for team leads — backend requires them to be lead of their own teams
              if (user?.primary_role === 'team_lead') {
                setForm(f => ({ ...f, lead_id: (user as any)?.id || '' }))
              }
              setShowModal(true)
            }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 hover:scale-105 hover:shadow-lg hover:shadow-blue-200 transition-all duration-200"
          >
            <Plus size={16} />
            New Team
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-100 flex items-center gap-2 animate-fade-in">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {isLoading && teams.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-44 skeleton" />)}
        </div>
      ) : teams.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400 animate-fade-in">
          <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
            <Users size={22} className="text-gray-300" />
          </div>
          <p className="text-sm font-medium">No teams found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {teams.map((team, i) => {
            const lead = team.lead_id ? users.find(u => u.id === team.lead_id) : null
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
                    <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ml-2 shrink-0 ${getDeptColor(team.department)}`}>
                      {team.department}
                    </span>
                  )}
                </div>

                {lead && (
                  <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-50">
                    <div className={`w-7 h-7 bg-gradient-to-br ${getGradient(lead.full_name)} rounded-lg flex items-center justify-center text-white text-xs font-bold`}>
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
                      const name = getUserName(id)
                      return (
                        <div
                          key={id}
                          title={name}
                          className={`w-7 h-7 bg-gradient-to-br ${getGradient(name)} rounded-full flex items-center justify-center text-white text-xs font-bold ring-2 ring-white`}
                        >
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
        page={page}
        totalPages={Math.ceil(total / limit)}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={l => { setLimit(l); setPage(1) }}
        limitOptions={[6, 12, 24]}
      />

      {/* Team Detail Modal */}
      {selectedTeam && (
        <Modal onClose={() => { setSelectedTeam(null); setTeamMode('view'); setTeamActionError(''); setTeamProjects([]) }}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl animate-scale-in">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">{selectedTeam.name}</h2>
                {selectedTeam.department && (
                  <span className={`text-xs px-2 py-0.5 rounded-lg font-medium mt-1 inline-block ${getDeptColor(selectedTeam.department)}`}>
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

              {/* ── View ── */}
              {teamMode === 'view' && (
                <>
                  {selectedTeam.description && <p className="text-sm text-gray-600">{selectedTeam.description}</p>}

                  {selectedTeam.lead_id && (
                    <div>
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">Team Lead</p>
                      <div className="flex items-center gap-3 bg-amber-50 rounded-xl p-3 border border-amber-100">
                        <div className={`w-9 h-9 bg-gradient-to-br ${getGradient(getUserName(selectedTeam.lead_id))} rounded-xl flex items-center justify-center text-white text-sm font-bold`}>
                          {getUserName(selectedTeam.lead_id)[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800">{getUserName(selectedTeam.lead_id)}</p>
                          <p className="text-xs text-gray-500">{getUserDept(selectedTeam.lead_id)}</p>
                        </div>
                        <Crown size={14} className="text-amber-500 shrink-0" />
                      </div>
                    </div>
                  )}

                  {selectedTeam.member_ids?.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">Members ({selectedTeam.member_ids.length})</p>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {selectedTeam.member_ids.map((id: string) => {
                          const memberUser = users.find(u => u.id === id)
                          const name = getUserName(id)
                          return (
                            <div key={id} onClick={() => navigate(`/users/${id}`)} className="flex items-center gap-2.5 py-1.5 px-2 rounded-xl hover:bg-blue-50 transition-colors cursor-pointer">
                              <div className={`w-7 h-7 bg-gradient-to-br ${getGradient(name)} rounded-lg flex items-center justify-center text-white text-xs font-bold`}>
                                {name[0]}
                              </div>
                              <div>
                                <p className="text-sm text-gray-700 font-medium">{name}</p>
                                {memberUser && (
                                  <p className="text-xs text-gray-400">{memberUser.primary_role?.replace('_', ' ')} · {memberUser.department}</p>
                                )}
                              </div>
                            </div>
                          )
                        })}
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
                              proj.status === 'active'     ? 'bg-emerald-400' :
                              proj.status === 'planning'   ? 'bg-blue-400' :
                              proj.status === 'on_hold'    ? 'bg-amber-400' :
                              proj.status === 'completed'  ? 'bg-gray-300' :
                              proj.status === 'cancelled'  ? 'bg-red-400' : 'bg-gray-300'
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

                  {/* Action buttons */}
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {selectedTeam.lead_id && (
                      <a
                        href="/chat"
                        className="flex flex-col items-center gap-1.5 px-2 py-3 bg-amber-50 text-amber-600 rounded-xl text-xs font-medium hover:bg-amber-100 transition-colors"
                      >
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

              {/* ── Edit ── */}
              {teamMode === 'edit' && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700">Edit Team</h3>

                  {/* Name */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Team Name</label>
                    <input
                      type="text"
                      value={editTeamForm.name}
                      onChange={e => setEditTeamForm({ ...editTeamForm, name: e.target.value })}
                      placeholder="Team name"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                    />
                  </div>

                  {/* Department */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Department</label>
                    <input
                      type="text"
                      value={editTeamForm.department}
                      onChange={e => setEditTeamForm({ ...editTeamForm, department: e.target.value })}
                      placeholder="Department"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                    <input
                      type="text"
                      value={editTeamForm.description}
                      onChange={e => setEditTeamForm({ ...editTeamForm, description: e.target.value })}
                      placeholder="Brief description"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                    />
                  </div>

                  {/* Team Lead */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                      <Crown size={11} className="text-amber-500" /> Team Lead
                    </label>
                    <select
                      value={editTeamForm.lead_id}
                      onChange={e => setEditTeamForm({ ...editTeamForm, lead_id: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                    >
                      <option value="">— Select team lead —</option>
                      {(leadUsers.length > 0 ? leadUsers : allUsers).map(u => (
                        <option key={u.id} value={u.id}>{u.full_name} · {u.primary_role?.replace('_', ' ')} ({u.department})</option>
                      ))}
                    </select>
                  </div>

                  {/* Project Manager */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                      <UserCheck size={11} className="text-blue-500" /> Project Manager
                    </label>
                    <select
                      value={editTeamForm.pm_id}
                      onChange={e => setEditTeamForm({ ...editTeamForm, pm_id: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                    >
                      <option value="">— None / Select PM —</option>
                      {(pmUsers.length > 0 ? pmUsers : allUsers).map(u => (
                        <option key={u.id} value={u.id}>{u.full_name} · {u.primary_role?.replace('_', ' ')} ({u.department})</option>
                      ))}
                    </select>
                  </div>

                  {/* Members */}
                  <UserPickerByRole
                    users={allUsers}
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
                          dispatch(fetchTeamsRequest())
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

              {/* ── Confirm delete ── */}
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
                          dispatch(fetchTeamsRequest())
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
      {showModal && (
        <Modal onClose={() => { setShowModal(false); setMemberSearch(''); setForm({ name: '', description: '', department: '', lead_id: '', pm_id: '', member_ids: [] }) }}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Users size={15} className="text-blue-600" />
                </div>
                <h2 className="text-lg font-semibold text-gray-800">New Team</h2>
              </div>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {createError && (
                <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-xl flex items-center gap-2">
                  <AlertCircle size={13} />
                  {createError}
                </div>
              )}
              {/* Team Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Team Name *</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Frontend Team" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all" />
              </div>

              {/* Department */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
                <input type="text" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} placeholder="e.g. Engineering" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all" />
              </div>

              {/* Team Lead */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                  <Crown size={13} className="text-amber-500" /> Team Lead *
                </label>
                <select value={form.lead_id} onChange={e => setForm({ ...form, lead_id: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50">
                  <option value="">— Select team lead —</option>
                  {leadUsers.length > 0
                    ? leadUsers.map(u => <option key={u.id} value={u.id}>{u.full_name} · {u.primary_role?.replace('_', ' ')} ({u.department})</option>)
                    : allUsers.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.department})</option>)
                  }
                </select>
                {leadUsers.length === 0 && allUsers.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">No users loaded. Try refreshing the page.</p>
                )}
              </div>

              {/* Project Manager */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                  <UserCheck size={13} className="text-blue-500" /> Project Manager
                </label>
                <select value={form.pm_id} onChange={e => setForm({ ...form, pm_id: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50">
                  <option value="">— None / Select PM —</option>
                  {pmUsers.length > 0
                    ? pmUsers.map(u => <option key={u.id} value={u.id}>{u.full_name} · {u.primary_role?.replace('_', ' ')} ({u.department})</option>)
                    : allUsers.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.department})</option>)
                  }
                </select>
              </div>

              {/* Members */}
              <UserPickerByRole
                users={allUsers}
                selected={form.member_ids}
                onChange={ids => setForm({ ...form, member_ids: ids })}
                maxHeight="max-h-52"
              />

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Brief description..." rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all resize-none" />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => { setShowModal(false); setMemberSearch(''); setForm({ name: '', description: '', department: '', lead_id: '', pm_id: '', member_ids: [] }) }} className="px-5 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">Cancel</button>
              <button onClick={handleCreate} disabled={!form.name || !form.department || !form.lead_id || creating} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-all">
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {creating ? 'Creating...' : 'Create Team'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
