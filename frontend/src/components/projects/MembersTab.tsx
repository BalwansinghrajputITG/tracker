import React, { useState, useCallback, useRef } from 'react'
import {
  Users, Loader2, Plus, X, Shield,
  UserPlus, UserMinus, Search,
} from 'lucide-react'
import { api } from '../../utils/api'
import { useToast } from '../shared'
import { navigate } from '../../pages/AppLayout'
import { getGrad } from './projectTypes'

// ─── Member Card ──────────────────────────────────────────────────────────────

const MemberCard: React.FC<{
  member: any
  canManage: boolean
  removing: boolean
  onRemove: () => void
  onNavigate: () => void
  variant: 'teal' | 'default'
}> = ({ member, canManage, removing, onRemove, onNavigate, variant }) => {
  const [confirmRemove, setConfirmRemove] = useState(false)

  const bgClass   = variant === 'teal' ? 'bg-teal-50 border-teal-200 hover:border-teal-400' : 'bg-white border-gray-100 hover:border-blue-200 hover:bg-blue-50/30'
  const gradClass = variant === 'teal' ? 'from-teal-500 to-emerald-600' : getGrad(member.name)
  const badgeEl   = variant === 'teal'
    ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-teal-500 text-white shrink-0">TL</span>
    : null

  if (confirmRemove) {
    return (
      <div className="flex flex-col gap-2 p-4 bg-red-50 border-2 border-red-200 rounded-2xl">
        <p className="text-xs font-semibold text-red-700">Remove <span className="font-bold">{member.name}</span> from this project?</p>
        <div className="flex gap-2">
          <button
            onClick={() => { onRemove(); setConfirmRemove(false) }}
            disabled={removing}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 disabled:opacity-60 transition-colors"
          >
            {removing ? <Loader2 size={11} className="animate-spin" /> : <UserMinus size={11} />} Remove
          </button>
          <button onClick={() => setConfirmRemove(false)} className="flex-1 py-1.5 bg-white text-gray-600 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-3 p-4 rounded-2xl shadow-sm border transition-all group ${bgClass}`}>
      <div
        onClick={onNavigate}
        className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradClass} flex items-center justify-center text-white font-bold shrink-0 cursor-pointer`}
      >
        {member.name[0]}
      </div>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onNavigate}>
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-blue-700 transition-colors">{member.name}</p>
          {badgeEl}
        </div>
        <p className="text-xs text-gray-400 capitalize truncate">{member.role?.replace('_', ' ')}{member.department ? ` · ${member.department}` : ''}</p>
        {member.email && <p className="text-xs text-blue-400 truncate">{member.email}</p>}
      </div>
      {canManage && (
        <button
          onClick={() => setConfirmRemove(true)}
          title="Remove from project"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all shrink-0"
        >
          <UserMinus size={14} />
        </button>
      )}
    </div>
  )
}

// ─── Members Tab ─────────────────────────────────────────────────────────────

export const MembersTab: React.FC<{
  project: any
  projectId: string
  canManage: boolean
  onMemberChange: () => void
}> = ({ project, projectId, canManage, onMemberChange }) => {
  const toast = useToast()
  const [showAddModal, setShowAddModal] = useState(false)
  const [searchQuery, setSearchQuery]  = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching]      = useState(false)
  const [adding, setAdding]            = useState<string | null>(null)
  const [removing, setRemoving]        = useState<string | null>(null)
  const [actionError, setActionError]  = useState('')
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const memberIds = new Set((project.members || []).map((m: any) => m.id))

  const searchUsers = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return }
    setSearching(true)
    try {
      const r = await api.get('/users', { params: { search: q, limit: 20 } })
      const all: any[] = r.data.users || r.data || []
      setSearchResults(all.filter((u: any) => !memberIds.has(u.id || u._id)))
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, [memberIds])

  const handleSearchChange = (q: string) => {
    setSearchQuery(q)
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => searchUsers(q), 300)
  }

  const addMember = async (userId: string) => {
    setAdding(userId)
    setActionError('')
    try {
      await api.post(`/projects/${projectId}/members/${userId}`)
      onMemberChange()
      setSearchResults(prev => prev.filter(u => (u.id || u._id) !== userId))
      toast.success('Member added')
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to add member'
      toast.error(msg)
      setActionError(msg)
    } finally {
      setAdding(null)
    }
  }

  const removeMember = async (userId: string) => {
    setRemoving(userId)
    setActionError('')
    try {
      await api.delete(`/projects/${projectId}/members/${userId}`)
      onMemberChange()
      toast.success('Member removed')
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to remove member'
      toast.error(msg)
      setActionError(msg)
    } finally {
      setRemoving(null)
    }
  }

  const teamLeads = (project.members || []).filter((m: any) => m.role === 'team_lead')
  const employees = (project.members || []).filter((m: any) => m.role !== 'team_lead')

  return (
    <div className="animate-fade-in space-y-5">
      {/* Header row with Add button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 font-medium">
          {(project.members?.length || 0)} member{project.members?.length !== 1 ? 's' : ''}
        </p>
        {canManage && (
          <button
            onClick={() => { setShowAddModal(true); setSearchQuery(''); setSearchResults([]); setActionError('') }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
          >
            <UserPlus size={13} /> Add Member
          </button>
        )}
      </div>

      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-xl">{actionError}</div>
      )}

      {/* Project Manager */}
      {project.pm && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <Shield size={11} className="text-indigo-500" /> Project Manager
          </p>
          <div
            onClick={() => navigate(`/users/${project.pm.id}`)}
            className="inline-flex items-center gap-3 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-2xl cursor-pointer hover:border-indigo-400 hover:shadow-md transition-all"
          >
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-base shrink-0 shadow-sm">
              {project.pm.name[0]}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-gray-900">{project.pm.name}</p>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-600 text-white">PM</span>
              </div>
              <p className="text-xs text-indigo-500 mt-0.5">{project.pm.email}</p>
            </div>
          </div>
        </div>
      )}

      {/* Team Leads */}
      {teamLeads.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <Shield size={11} className="text-teal-500" /> Team Leads
            <span className="ml-1 bg-teal-100 text-teal-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{teamLeads.length}</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {teamLeads.map((m: any) => (
              <MemberCard
                key={m.id} member={m} canManage={canManage}
                removing={removing === m.id}
                onRemove={() => removeMember(m.id)}
                onNavigate={() => navigate(`/users/${m.id}`)}
                variant="teal"
              />
            ))}
          </div>
        </div>
      )}

      {/* Employees */}
      {employees.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <Users size={11} /> Employees
            <span className="ml-1 bg-gray-100 text-gray-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{employees.length}</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {employees.map((m: any) => (
              <MemberCard
                key={m.id} member={m} canManage={canManage}
                removing={removing === m.id}
                onRemove={() => removeMember(m.id)}
                onNavigate={() => navigate(`/users/${m.id}`)}
                variant="default"
              />
            ))}
          </div>
        </div>
      )}

      {(!project.pm && (!project.members || project.members.length === 0)) && (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
          <Users size={28} className="mb-2 text-gray-200" />
          <p className="text-sm">No members added yet</p>
          {canManage && (
            <button onClick={() => setShowAddModal(true)} className="mt-3 flex items-center gap-1.5 text-xs text-blue-600 font-semibold hover:underline">
              <UserPlus size={13} /> Add the first member
            </button>
          )}
        </div>
      )}

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center">
                  <UserPlus size={15} className="text-blue-600" />
                </div>
                <h2 className="text-base font-bold text-gray-900">Add Member</h2>
              </div>
              <button onClick={() => setShowAddModal(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
                <X size={14} className="text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Search input */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={e => handleSearchChange(e.target.value)}
                  placeholder="Search by name, email or department…"
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                />
                {searching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />}
              </div>

              {/* Results list */}
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {!searchQuery.trim() && (
                  <p className="text-xs text-gray-400 text-center py-6">Type a name or email to search users</p>
                )}
                {searchQuery.trim() && !searching && searchResults.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-6">No users found — they may already be a member</p>
                )}
                {searchResults.map((u: any) => {
                  const uid = u.id || u._id
                  return (
                    <div key={uid} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-all">
                      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${getGrad(u.full_name || u.name || '')} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                        {(u.full_name || u.name || '?')[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{u.full_name || u.name}</p>
                        <p className="text-xs text-gray-400 truncate">{u.primary_role?.replace('_', ' ')}{u.department ? ` · ${u.department}` : ''}</p>
                      </div>
                      <button
                        onClick={() => addMember(uid)}
                        disabled={adding === uid}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors shrink-0"
                      >
                        {adding === uid ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                        Add
                      </button>
                    </div>
                  )
                })}
              </div>

              {actionError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{actionError}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
