import React, { useEffect, useState, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  Users, Plus, X, Search, UserCheck, Loader2, AlertCircle,
  CheckCircle2, Pencil, Trash2, MessageSquare, FolderKanban,
  Crown, Briefcase, ExternalLink, UserMinus, UserPlus,
} from 'lucide-react'
import { RootState } from '../../store'
import { fetchUsersRequest } from '../../store/slices/usersSlice'
import { fetchTeamsRequest } from '../../store/slices/teamsSlice'
import { setActiveRoom } from '../../store/slices/chatSlice'
import { Modal } from '../common/Modal'
import { Pagination } from '../common/Pagination'
import { UserPickerByRole } from '../common/UserPickerByRole'
import { useToast } from '../shared'
import { api } from '../../utils/api'
import { navigate } from '../../pages/AppLayout'
import { EXEC_ROLES } from '../../constants/roles'

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

// ─── Props ────────────────────────────────────────────────────────────────────

interface TeamsTabProps {
  callerRole: string
  userId: string
}

export const TeamsTab: React.FC<TeamsTabProps> = ({ callerRole, userId }) => {
  const dispatch = useDispatch()
  const toast = useToast()
  const { items, subordinates } = useSelector((s: RootState) => s.users)
  const { items: teamsItems, isLoading: teamsLoading, error: teamsError, total: teamsTotal } = useSelector((s: RootState) => s.teams)

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
  const teamsCanCreate = [...EXEC_ROLES, 'pm', 'team_lead'].includes(callerRole)
  const canManageTeam = (team?: any) => {
    if ([...EXEC_ROLES, 'pm'].includes(callerRole)) return true
    if (callerRole === 'team_lead' && team) return team.lead_id === userId
    return false
  }
  const teamsPmUsers = useMemo(() => teamsAllUsers.filter((u: any) => ['pm', 'coo', 'ceo'].includes(u.primary_role)), [teamsAllUsers])
  const teamsLeadUsers = useMemo(() => teamsAllUsers.filter((u: any) => ['team_lead', 'pm', 'coo', 'ceo'].includes(u.primary_role)), [teamsAllUsers])
  const getTeamUserName = (id: string) => teamsAllUsers.find((u: any) => u.id === id)?.full_name || items.find((u: any) => u.id === id)?.full_name || id
  const getTeamUserDept = (id: string) => teamsAllUsers.find((u: any) => u.id === id)?.department || items.find((u: any) => u.id === id)?.department || ''

  const openDmWithUser = async (targetUserId: string) => {
    try {
      const res = await api.post('/chat/rooms', { type: 'direct', participant_ids: [targetUserId] })
      dispatch(setActiveRoom(res.data.room_id))
    } catch {}
    navigate('/chat')
  }

  useEffect(() => {
    dispatch(fetchTeamsRequest({ page: teamsPage, limit: teamsLimit }))
    dispatch(fetchUsersRequest({}))
  }, [teamsPage, teamsLimit])

  const handleTeamQuickRemove = async (teamId: string, memberId: string) => {
    setRemovingMember(memberId)
    setTeamActionError('')
    try {
      await api.delete(`/teams/${teamId}/members/${memberId}`)
      setSelectedTeam((t: any) => t ? { ...t, member_ids: t.member_ids.filter((id: string) => id !== memberId) } : t)
      dispatch(fetchTeamsRequest({ page: teamsPage, limit: teamsLimit }))
      toast.success('Member removed')
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to remove member'
      toast.error(msg)
      setTeamActionError(msg)
    } finally {
      setRemovingMember(null)
    }
  }

  const handleTeamQuickAdd = async (teamId: string, memberId: string) => {
    setQuickAddLoading(memberId)
    setTeamActionError('')
    try {
      await api.post(`/teams/${teamId}/members`, { user_ids: [memberId] })
      setSelectedTeam((t: any) => t ? { ...t, member_ids: [...(t.member_ids || []), memberId] } : t)
      dispatch(fetchTeamsRequest({ page: teamsPage, limit: teamsLimit }))
      toast.success('Member added')
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to add member'
      toast.error(msg)
      setTeamActionError(msg)
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
      toast.success('Team created')
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to create team'
      toast.error(msg)
      setTeamCreateError(msg)
    } finally {
      setTeamCreating(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header button */}
      {teamsCanCreate && (
        <div className="flex justify-end">
          <button
            onClick={() => {
              if (callerRole === 'team_lead') {
                setTeamForm(f => ({ ...f, lead_id: userId }))
              }
              setShowTeamModal(true)
            }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-200 hover:scale-105 transition-all duration-200"
          >
            <Plus size={15} />
            New Team
          </button>
        </div>
      )}

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
                      <button
                        onClick={() => openDmWithUser(selectedTeam.lead_id)}
                        className="flex flex-col items-center gap-1.5 px-2 py-3 bg-amber-50 text-amber-600 rounded-xl text-xs font-medium hover:bg-amber-100 transition-colors"
                      >
                        <MessageSquare size={14} />
                        Message Lead
                      </button>
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
                          toast.success('Team updated')
                        } catch (err: any) {
                          const msg = err?.response?.data?.detail || 'Failed to update team'
                          toast.error(msg)
                          setTeamActionError(msg)
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
                          toast.success('Team deleted')
                        } catch (err: any) {
                          const msg = err?.response?.data?.detail || 'Failed to delete team'
                          toast.error(msg)
                          setTeamActionError(msg)
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
  )
}
