import React, { useState, useMemo } from 'react'
import {
  Search, Users, Shield, FolderOpen, ChevronRight, ChevronDown,
} from 'lucide-react'
import { navigate } from '../../pages/AppLayout'
import { ROLE_AVATAR_GRADIENT as AVATAR_COLORS } from '../../constants/roles'

const STATUS_COLORS: Record<string, string> = {
  planning:  'bg-blue-100 text-blue-700 border-blue-200',
  active:    'bg-green-100 text-green-700 border-green-200',
  on_hold:   'bg-amber-100 text-amber-700 border-amber-200',
  completed: 'bg-violet-100 text-violet-700 border-violet-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
}

interface ProjectsViewProps {
  projects: any[]
  usersMap: Record<string, any>
  loading: boolean
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({ projects, usersMap, loading }) => {
  const [search, setSearch] = useState('')
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
            const members = memberIds.map((id: string) => usersMap[id]).filter(Boolean)
            const teamLeads = members.filter((u: any) => u.primary_role === 'team_lead')
            const employees = members.filter((u: any) => u.primary_role === 'employee')
            const others    = members.filter((u: any) => u.primary_role !== 'team_lead' && u.primary_role !== 'employee')
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
                              {group.list.map((u: any) => (
                                <button
                                  key={u.id}
                                  onClick={() => navigate(`/users/${u.id}`)}
                                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors hover:opacity-80 ${group.color}`}
                                >
                                  <span className={`w-4 h-4 rounded-md flex items-center justify-center text-white text-[9px] font-bold shrink-0 ${AVATAR_COLORS[u.primary_role as keyof typeof AVATAR_COLORS] ? `bg-gradient-to-br ${AVATAR_COLORS[u.primary_role as keyof typeof AVATAR_COLORS]}` : 'bg-gray-400'}`}>
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
