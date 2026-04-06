import React, { useEffect, useState, useMemo } from 'react'
import { navigate } from './AppLayout'
import ReactDOM from 'react-dom'
import { useDispatch, useSelector } from 'react-redux'
import {
  FolderOpen, Plus, X, Users, Calendar, AlertTriangle, CheckCircle2, Loader2, Search, UserCheck,
  Pencil, Trash2, GitBranch, GitCommitHorizontal, ExternalLink, Link2, Layout,
  ChevronRight, Tag, BarChart2, Clock, Shield, User,
} from 'lucide-react'
import { RootState } from '../store'
import { fetchProjectsRequest, createProjectRequest, updateProjectLocal } from '../store/slices/projectsSlice'
import { fetchUsersRequest } from '../store/slices/usersSlice'
import { fetchTeamsRequest } from '../store/slices/teamsSlice'
import { Modal } from '../components/common/Modal'
import { ToolsPicker, ProjectTool } from '../components/common/ToolsPicker'
import { Pagination } from '../components/common/Pagination'
import { UserPickerByRole } from '../components/common/UserPickerByRole'
import { api } from '../utils/api'

const STATUS_TABS = ['all', 'planning', 'active', 'on_hold', 'completed', 'cancelled']
const STATUS_COLORS: Record<string, string> = {
  planning:  'bg-blue-100 text-blue-700',
  active:    'bg-emerald-100 text-emerald-700',
  on_hold:   'bg-amber-100 text-amber-700',
  completed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-600',
}
const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-amber-100 text-amber-700',
  low:      'bg-gray-100 text-gray-600',
}

const emptyForm = {
  name: '', description: '', priority: 'medium',
  repo_url: '', repo_token: '', figma_url: '',
  start_date: new Date().toISOString().split('T')[0],
  due_date: '', team_ids: [] as string[], member_ids: [] as string[], tags: [] as string[],
  links: [] as { title: string; url: string }[],
  tools: [] as ProjectTool[],
}

const TASK_STATUS_COLORS: Record<string, string> = {
  todo:        'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  review:      'bg-purple-100 text-purple-700',
  done:        'bg-emerald-100 text-emerald-700',
  blocked:     'bg-red-100 text-red-600',
}
const TASK_PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-amber-100 text-amber-700',
  low:      'bg-gray-100 text-gray-500',
}

const AVATAR_GRADIENTS = [
  'from-blue-400 to-indigo-500', 'from-purple-400 to-pink-500',
  'from-emerald-400 to-teal-500', 'from-orange-400 to-red-500',
  'from-cyan-400 to-blue-500', 'from-rose-400 to-pink-500',
]
const getGradient = (name: string) => AVATAR_GRADIENTS[(name || 'A').charCodeAt(0) % AVATAR_GRADIENTS.length]

export const ProjectsPage: React.FC = () => {
  const dispatch = useDispatch()
  const { items, total, isLoading, error } = useSelector((s: RootState) => s.projects)
  const { user } = useSelector((s: RootState) => s.auth)
  const { subordinates } = useSelector((s: RootState) => s.users)
  const { items: teams } = useSelector((s: RootState) => s.teams)
  const [page, setPage]   = useState(1)
  const [limit, setLimit] = useState(12)
  const [statusFilter, setStatusFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [selectedProject, setSelectedProject] = useState<any>(null)
  const [projectMode, setProjectMode] = useState<'view' | 'edit' | 'confirm-delete'>('view')
  const [editProjectForm, setEditProjectForm] = useState<any>({})
  const [projectActionLoading, setProjectActionLoading] = useState(false)
  const [projectActionError, setProjectActionError] = useState('')
  const [commits, setCommits] = useState<any[]>([])
  const [commitsTotal, setCommitsTotal] = useState(0)
  const [commitsLoading, setCommitsLoading] = useState(false)
  const [commitsError, setCommitsError] = useState('')
  const [detailProject, setDetailProject] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [activeDetailTab, setActiveDetailTab] = useState('overview')
  const [contributorStats, setContributorStats] = useState<any[]>([])
  const [contributorStatsLoading, setContributorStatsLoading] = useState(false)
  const [contributorStatsError, setContributorStatsError] = useState('')
  const [commitEmailFilter, setCommitEmailFilter] = useState('')
  const [commitDayFilter, setCommitDayFilter]   = useState('')
  const [nameSearch, setNameSearch]             = useState('')

  const canCreate = ['ceo', 'coo', 'admin', 'pm', 'team_lead'].includes(user?.primary_role || '')
  const canManageProject = (project: any) => {
    const role = user?.primary_role || ''
    if (['ceo', 'coo', 'pm'].includes(role)) return true
    if (project?.pm_id === (user as any)?.id) return true
    // Team lead can manage projects linked to their teams
    if (role === 'team_lead') {
      const userTeamIds: string[] = (user as any)?.team_ids || []
      const projectTeamIds: string[] = project?.team_ids || []
      return projectTeamIds.some((tid: string) => userTeamIds.includes(tid)) ||
             (project?.member_ids || []).includes((user as any)?.id)
    }
    return false
  }
  const [memberSearch, setMemberSearch] = useState('')
  const [teamSearch, setTeamSearch] = useState('')
  const [isPrivateRepo, setIsPrivateRepo] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [showEditToken, setShowEditToken] = useState(false)
  const [showInlineTokenForm, setShowInlineTokenForm] = useState(false)
  const [inlineToken, setInlineToken] = useState('')
  const [showInlineTokenValue, setShowInlineTokenValue] = useState(false)
  const [tokenSaving, setTokenSaving] = useState(false)
  const [tokenSaveError, setTokenSaveError] = useState('')
  const [editMemberSearch, setEditMemberSearch] = useState('')

  const availableTeams = useMemo(() => {
    if (!teamSearch.trim()) return teams
    const q = teamSearch.toLowerCase()
    return teams.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.department?.toLowerCase().includes(q)
    )
  }, [teams, teamSearch])

  const toggleTeam = (id: string) => {
    setForm(f => ({
      ...f,
      team_ids: f.team_ids.includes(id)
        ? f.team_ids.filter(x => x !== id)
        : [...f.team_ids, id],
    }))
  }

  useEffect(() => {
    const params: any = { page, limit }
    if (statusFilter !== 'all') params.status = statusFilter
    dispatch(fetchProjectsRequest(params))
    dispatch(fetchUsersRequest())
    dispatch(fetchTeamsRequest({ limit: 100 }))
  }, [statusFilter, page, limit])

  // Reset inline token form when project changes or closes
  useEffect(() => {
    setShowInlineTokenForm(false)
    setInlineToken('')
    setShowInlineTokenValue(false)
    setTokenSaveError('')
  }, [selectedProject?.id])

  // Fetch full detail + commits whenever a project is selected
  useEffect(() => {
    if (!selectedProject) {
      setDetailProject(null)
      setCommits([])
      setCommitsTotal(0)
      setCommitsError('')
      setActiveDetailTab('overview')
      return
    }
    let cancelled = false

    // Full detail (members, teams, tasks populated)
    setDetailLoading(true)
    api.get(`/projects/${selectedProject.id}/detail`)
      .then((res: any) => { if (!cancelled) setDetailProject(res.data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDetailLoading(false) })

    // Commits
    if (selectedProject.repo_url) {
      setCommitsLoading(true)
      setCommits([])
      setCommitsError('')
      api.get(`/projects/${selectedProject.id}/commits`)
        .then((res: any) => {
          if (cancelled) return
          setCommits(res.data.commits || [])
          setCommitsTotal(res.data.total || 0)
          if (res.data.error) setCommitsError(res.data.error)
        })
        .catch(() => { if (!cancelled) setCommitsError('Failed to load commits.') })
        .finally(() => { if (!cancelled) setCommitsLoading(false) })

      // Contributor stats
      setContributorStatsLoading(true)
      setContributorStats([])
      setContributorStatsError('')
      api.get(`/projects/${selectedProject.id}/contributor-stats`)
        .then((res: any) => {
          if (cancelled) return
          setContributorStats(res.data.contributors || [])
          if (res.data.error) setContributorStatsError(res.data.error)
        })
        .catch((err: any) => {
          if (!cancelled) setContributorStatsError(err?.response?.data?.detail || 'Failed to load contributor stats.')
        })
        .finally(() => { if (!cancelled) setContributorStatsLoading(false) })
    } else {
      setCommits([])
      setCommitsTotal(0)
      setCommitsError('')
      setContributorStats([])
      setContributorStatsError('')
    }
    setCommitEmailFilter('')
    setCommitDayFilter('')

    return () => { cancelled = true }
  }, [selectedProject?.id])

  const handleUpdateToken = async () => {
    if (!inlineToken.trim() || !selectedProject) return
    setTokenSaving(true)
    setTokenSaveError('')
    try {
      await api.put(`/projects/${selectedProject.id}`, { repo_token: inlineToken.trim() })
      setSelectedProject({ ...selectedProject, has_repo_token: true })
      setInlineToken('')
      setShowInlineTokenForm(false)
      setShowInlineTokenValue(false)
      // Re-fetch commits + contributor stats with the new token
      setCommitsLoading(true)
      setCommits([])
      setCommitsError('')
      setContributorStatsError('')
      const res: any = await api.get(`/projects/${selectedProject.id}/commits`)
      setCommits(res.data.commits || [])
      setCommitsTotal(res.data.total || 0)
      if (res.data.error) setCommitsError(res.data.error)
      // Re-fetch contributor stats
      setContributorStatsLoading(true)
      setContributorStats([])
      try {
        const csRes: any = await api.get(`/projects/${selectedProject.id}/contributor-stats`)
        setContributorStats(csRes.data.contributors || [])
        if (csRes.data.error) setContributorStatsError(csRes.data.error)
      } catch {
        setContributorStatsError('Failed to load contributor stats.')
      } finally {
        setContributorStatsLoading(false)
      }
    } catch {
      setTokenSaveError('Failed to save token. Please try again.')
    } finally {
      setTokenSaving(false)
      setCommitsLoading(false)
    }
  }

  const handleCreate = () => {
    if (!form.name || !form.due_date || !form.repo_url) return
    dispatch(createProjectRequest(form))
    setShowModal(false)
    setForm(emptyForm)
    setMemberSearch('')
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setForm(emptyForm)
    setMemberSearch('')
    setTeamSearch('')
    setIsPrivateRepo(false)
    setShowToken(false)
  }

  const progressColor = (pct: number) =>
    pct >= 75 ? 'bg-emerald-500' : pct >= 40 ? 'bg-blue-500' : 'bg-amber-400'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-gray-500 text-sm mt-1">{total} total projects</p>
        </div>
        {canCreate && (
          <button
            onClick={() => navigate('/projects/new')}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-200 hover:scale-105 transition-all duration-200"
          >
            <Plus size={16} />
            New Project
          </button>
        )}
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 flex-wrap animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
        {STATUS_TABS.map(s => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1) }}
            className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-all duration-150 capitalize ${
              statusFilter === s
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-600'
            }`}
          >
            {s === 'all' ? 'All' : s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Name search */}
      <div className="relative animate-fade-in-up" style={{ animationDelay: '0.07s' }}>
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={nameSearch}
          onChange={e => setNameSearch(e.target.value)}
          placeholder="Search projects by name…"
          className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white transition-all"
        />
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-100 flex items-center gap-2 animate-fade-in">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {/* Grid */}
      {isLoading && items.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-44 skeleton" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400 animate-fade-in">
          <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
            <FolderOpen size={22} className="text-gray-300" />
          </div>
          <p className="text-sm font-medium">No projects found</p>
        </div>
      ) : (() => {
        const displayItems = nameSearch.trim()
          ? items.filter(p => p.name.toLowerCase().includes(nameSearch.trim().toLowerCase()))
          : items
        if (displayItems.length === 0) return (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 animate-fade-in">
            <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
              <Search size={20} className="text-gray-300" />
            </div>
            <p className="text-sm font-medium">No projects match "{nameSearch}"</p>
          </div>
        )
        return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {displayItems.map((project, i) => (
            <div
              key={project.id}
              onClick={() => navigate('/projects/' + project.id)}
              className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 card-hover cursor-pointer animate-fade-in-up"
              style={{ animationDelay: `${i * 0.04}s` }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-800 truncate">{project.name}</h3>
                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{project.description}</p>
                </div>
                <div className="flex flex-col gap-1 ml-2 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${STATUS_COLORS[project.status] || 'bg-gray-100 text-gray-600'}`}>
                    {project.status.replace('_', ' ')}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${PRIORITY_COLORS[project.priority] || 'bg-gray-100'}`}>
                    {project.priority}
                  </span>
                </div>
              </div>

              <div className="mb-3">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                  <span>Progress</span>
                  <span className="font-semibold">{project.progress_percentage}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${progressColor(project.progress_percentage)}`}
                    style={{ width: `${project.progress_percentage}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-400">
                <div className="flex items-center gap-1">
                  <Users size={12} />
                  <span>{project.member_ids?.length || 0}</span>
                </div>
                {project.due_date && (
                  <div className={`flex items-center gap-1 ${project.is_delayed ? 'text-red-500 font-medium' : ''}`}>
                    {project.is_delayed && <AlertTriangle size={11} />}
                    <Calendar size={11} />
                    <span>{new Date(project.due_date).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        )
      })()}

      <Pagination
        page={page}
        totalPages={Math.ceil(total / limit)}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={l => { setLimit(l); setPage(1) }}
        limitOptions={[6, 12, 24]}
      />

      {/* ── Project Detail Slide-over ── */}
      {selectedProject && ReactDOM.createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 z-40 animate-fade-in"
            onClick={() => { setSelectedProject(null); setProjectMode('view'); setProjectActionError('') }}
          />

          {/* Panel */}
          <div className="fixed inset-y-0 right-0 w-full max-w-3xl bg-white z-50 flex flex-col shadow-2xl animate-slide-in-right overflow-hidden">

            {/* ── Header ── */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-4 shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                      <FolderOpen size={15} className="text-white" />
                    </div>
                    <h2 className="text-lg font-bold text-white truncate">{selectedProject.name}</h2>
                  </div>
                  <div className="flex items-center gap-2 pl-10">
                    <span className={`text-xs px-2 py-0.5 rounded-lg font-medium bg-white/20 text-white`}>
                      {selectedProject.status.replace('_', ' ')}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-lg font-medium bg-white/20 text-white`}>
                      {selectedProject.priority}
                    </span>
                    {selectedProject.is_delayed && (
                      <span className="text-xs px-2 py-0.5 rounded-lg font-medium bg-red-500/80 text-white flex items-center gap-1">
                        <AlertTriangle size={10} /> Delayed
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {canManageProject(selectedProject) && projectMode === 'view' && (
                    <>
                      <button
                        onClick={() => {
                          setEditProjectForm({
                            name: selectedProject.name,
                            description: selectedProject.description || '',
                            priority: selectedProject.priority,
                            status: selectedProject.status,
                            due_date: selectedProject.due_date ? selectedProject.due_date.split('T')[0] : '',
                            repo_url: selectedProject.repo_url || '',
                            repo_token: '',
                            figma_url: detailProject?.figma_url || '',
                            pm_id: detailProject?.pm?.id || '',
                            member_ids: (detailProject?.members || []).map((m: any) => m.id),
                            links: detailProject?.links || [],
                            tools: detailProject?.tools || [],
                          })
                          setShowEditToken(false)
                          setProjectMode('edit')
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white rounded-lg text-xs font-medium transition-colors"
                      >
                        <Pencil size={12} /> Edit
                      </button>
                      <button
                        onClick={() => setProjectMode('confirm-delete')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/70 hover:bg-red-500/90 text-white rounded-lg text-xs font-medium transition-colors"
                      >
                        <Trash2 size={12} /> Cancel
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => { setSelectedProject(null); setProjectMode('view'); setProjectActionError('') }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/15 transition-colors ml-1"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-3 pl-10">
                <div className="flex items-center justify-between text-xs text-blue-200 mb-1">
                  <span>Progress</span>
                  <span className="font-bold text-white">{selectedProject.progress_percentage}%</span>
                </div>
                <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-all duration-700"
                    style={{ width: `${selectedProject.progress_percentage}%` }}
                  />
                </div>
              </div>
            </div>

            {/* ── Tab bar ── */}
            {projectMode === 'view' && (
              <div className="flex border-b border-gray-100 bg-gray-50 shrink-0 overflow-x-auto">
                {[
                  { key: 'overview',  label: 'Overview',       icon: <BarChart2 size={13} /> },
                  { key: 'members',   label: `Members${detailProject ? ` (${detailProject.members?.length ?? 0})` : ''}`, icon: <Users size={13} /> },
                  { key: 'tasks',     label: `Tasks${detailProject ? ` (${detailProject.tasks?.length ?? 0})` : ''}`,     icon: <CheckCircle2 size={13} /> },
                  { key: 'repo',      label: 'Repository',     icon: <GitBranch size={13} /> },
                  { key: 'links',     label: 'Links',          icon: <Link2 size={13} /> },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveDetailTab(tab.key)}
                    className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                      activeDetailTab === tab.key
                        ? 'text-blue-600 border-blue-600 bg-white'
                        : 'text-gray-500 border-transparent hover:text-gray-700'
                    }`}
                  >
                    {tab.icon}{tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto">
              {projectActionError && (
                <div className="flex items-center gap-2 bg-red-50 border-b border-red-100 text-red-700 text-xs px-6 py-2.5">
                  <AlertTriangle size={12} className="shrink-0" />{projectActionError}
                </div>
              )}

              {/* ════ VIEW TABS ════ */}
              {projectMode === 'view' && (
                <div className="p-6">

                  {/* ── OVERVIEW tab ── */}
                  {activeDetailTab === 'overview' && (
                    <div className="space-y-5">
                      {selectedProject.description && (
                        <p className="text-sm text-gray-600 leading-relaxed">{selectedProject.description}</p>
                      )}

                      {/* Key stats grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { icon: <BarChart2 size={14} className="text-blue-500" />, label: 'Progress', value: `${selectedProject.progress_percentage}%` },
                          { icon: <Users size={14} className="text-indigo-500" />, label: 'Members', value: detailProject?.members?.length ?? selectedProject.member_ids?.length ?? 0 },
                          { icon: <Calendar size={14} className="text-emerald-500" />, label: 'Start', value: selectedProject.start_date ? new Date(selectedProject.start_date).toLocaleDateString() : 'N/A' },
                          { icon: <Clock size={14} className="text-amber-500" />, label: 'Due Date', value: selectedProject.due_date ? new Date(selectedProject.due_date).toLocaleDateString() : 'N/A' },
                        ].map(({ icon, label, value }) => (
                          <div key={label} className="bg-gray-50 rounded-2xl p-3.5 border border-gray-100">
                            <div className="flex items-center gap-1.5 mb-1">{icon}<p className="text-xs text-gray-400">{label}</p></div>
                            <p className="text-sm font-bold text-gray-800">{value}</p>
                          </div>
                        ))}
                      </div>

                      {/* PM */}
                      {detailLoading ? (
                        <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 size={12} className="animate-spin" /> Loading details…</div>
                      ) : detailProject?.pm && (
                        <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-2xl border border-indigo-100">
                          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${getGradient(detailProject.pm.name)} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                            {detailProject.pm.name[0]}
                          </div>
                          <div>
                            <p className="text-xs text-indigo-400 font-medium">Project Manager</p>
                            <p className="text-sm font-semibold text-indigo-800">{detailProject.pm.name}</p>
                            {detailProject.pm.email && <p className="text-xs text-indigo-400">{detailProject.pm.email}</p>}
                          </div>
                          <Shield size={16} className="text-indigo-300 ml-auto" />
                        </div>
                      )}

                      {/* Delay warning */}
                      {selectedProject.is_delayed && (
                        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-start gap-3">
                          <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-red-700">Project is Delayed</p>
                            <p className="text-xs text-red-500 mt-0.5">{selectedProject.delay_reason || 'No reason specified'}</p>
                          </div>
                        </div>
                      )}

                      {/* Tags */}
                      {selectedProject.tags?.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Tag size={11} /> Tags</p>
                          <div className="flex flex-wrap gap-2">
                            {selectedProject.tags.map((tag: string) => (
                              <span key={tag} className="text-xs bg-blue-50 text-blue-600 border border-blue-100 px-2.5 py-1 rounded-lg font-medium">{tag}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Teams */}
                      {detailProject?.teams?.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Users size={11} /> Teams</p>
                          <div className="flex flex-wrap gap-2">
                            {detailProject.teams.map((t: any) => (
                              <span key={t.id} className="flex items-center gap-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-100 px-3 py-1.5 rounded-xl font-medium">
                                <div className={`w-4 h-4 rounded-md bg-gradient-to-br ${getGradient(t.name)} flex items-center justify-center text-white text-[9px] font-bold`}>{t.name[0]}</div>
                                {t.name}{t.department ? ` · ${t.department}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ── Contributor Activity Chart ── */}
                      {selectedProject.repo_url && (
                        <div className="border-t border-gray-100 pt-5">
                          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                            <GitCommitHorizontal size={12} /> Contributor Activity
                          </p>

                          {contributorStatsLoading ? (
                            <div className="flex items-center gap-2 text-xs text-gray-400 py-4">
                              <Loader2 size={12} className="animate-spin" /> Loading contributor stats…
                            </div>
                          ) : contributorStatsError ? (
                            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2.5 rounded-xl">
                              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                              <span>{contributorStatsError}</span>
                            </div>
                          ) : contributorStats.length === 0 ? (
                            <p className="text-xs text-gray-400 py-2">No contributor data available.</p>
                          ) : (() => {
                            const maxCommits = Math.max(...contributorStats.map((c: any) => c.commits), 1)
                            const maxLines   = Math.max(...contributorStats.map((c: any) => c.lines),   1)
                            return (
                              <div className="space-y-3">
                                {contributorStats.map((c: any) => (
                                  <div key={c.author} className="group">
                                    {/* Author row */}
                                    <div className="flex items-center gap-2.5 mb-1.5">
                                      {c.avatar_url ? (
                                        <img src={c.avatar_url} alt={c.author} className="w-7 h-7 rounded-full shrink-0" />
                                      ) : (
                                        <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${getGradient(c.author)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                                          {c.author[0]?.toUpperCase()}
                                        </div>
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-800 truncate">{c.author}</p>
                                        {c.email && <p className="text-xs text-gray-400 truncate">{c.email}</p>}
                                      </div>
                                      <div className="text-right shrink-0 text-xs text-gray-500 space-y-0.5">
                                        <p><span className="font-bold text-blue-600">{c.commits}</span> commits</p>
                                        <p>
                                          <span className="text-emerald-600 font-semibold">+{c.additions.toLocaleString()}</span>
                                          {' / '}
                                          <span className="text-red-500 font-semibold">-{c.deletions.toLocaleString()}</span>
                                        </p>
                                      </div>
                                    </div>

                                    {/* Commits bar */}
                                    <div className="space-y-1 pl-9">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-gray-400 w-12 shrink-0">Commits</span>
                                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                          <div
                                            className="h-full bg-blue-500 rounded-full transition-all duration-700"
                                            style={{ width: `${(c.commits / maxCommits) * 100}%` }}
                                          />
                                        </div>
                                        <span className="text-[10px] text-gray-500 w-6 text-right">{c.commits}</span>
                                      </div>
                                      {c.lines > 0 && (
                                        <div className="flex items-center gap-2">
                                          <span className="text-[10px] text-gray-400 w-12 shrink-0">Lines</span>
                                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden flex">
                                            <div
                                              className="h-full bg-emerald-400 rounded-l-full transition-all duration-700"
                                              style={{ width: `${(c.additions / maxLines) * 100}%` }}
                                            />
                                            <div
                                              className="h-full bg-red-400 rounded-r-full transition-all duration-700"
                                              style={{ width: `${(c.deletions / maxLines) * 100}%` }}
                                            />
                                          </div>
                                          <span className="text-[10px] text-gray-500 w-6 text-right">{c.lines.toLocaleString()}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}

                                {/* Legend */}
                                <div className="flex items-center gap-4 pt-1 pl-9">
                                  <span className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-3 h-2 bg-blue-500 rounded-sm inline-block" /> Commits</span>
                                  <span className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-3 h-2 bg-emerald-400 rounded-sm inline-block" /> Lines added</span>
                                  <span className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-3 h-2 bg-red-400 rounded-sm inline-block" /> Lines deleted</span>
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── MEMBERS tab ── */}
                  {activeDetailTab === 'members' && (
                    <div className="space-y-3">
                      {detailLoading ? (
                        <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-blue-500" /></div>
                      ) : !detailProject?.members?.length ? (
                        <div className="text-center py-12 text-gray-400">
                          <Users size={28} className="mx-auto mb-2 text-gray-200" />
                          <p className="text-sm">No members added yet</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {detailProject.members.map((m: any) => (
                            <div key={m.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors">
                              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getGradient(m.name)} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                                {m.name[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-800 truncate">{m.name}</p>
                                <p className="text-xs text-gray-400 capitalize truncate">{m.role?.replace('_', ' ')}{m.department ? ` · ${m.department}` : ''}</p>
                                {m.email && <p className="text-xs text-blue-400 truncate">{m.email}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── TASKS tab ── */}
                  {activeDetailTab === 'tasks' && (
                    <div className="space-y-4">
                      {detailLoading ? (
                        <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-blue-500" /></div>
                      ) : !detailProject?.tasks?.length ? (
                        <div className="text-center py-12 text-gray-400">
                          <CheckCircle2 size={28} className="mx-auto mb-2 text-gray-200" />
                          <p className="text-sm">No tasks yet</p>
                        </div>
                      ) : (
                        <>
                          {/* Status summary chips */}
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(
                              detailProject.tasks.reduce((acc: any, t: any) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc }, {})
                            ).map(([status, count]) => (
                              <span key={status} className={`text-xs px-2.5 py-1 rounded-xl font-semibold ${TASK_STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
                                {status.replace('_', ' ')} · {count as number}
                              </span>
                            ))}
                          </div>

                          {/* Task list */}
                          <div className="space-y-2">
                            {detailProject.tasks.map((t: any) => (
                              <div key={t.id} className={`p-3 rounded-2xl border transition-colors ${t.is_blocked ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100 hover:border-blue-100'}`}>
                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                  <p className={`text-sm font-medium leading-snug ${t.is_blocked ? 'text-red-700' : 'text-gray-800'}`}>{t.title}</p>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${TASK_STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-600'}`}>
                                      {t.status.replace('_', ' ')}
                                    </span>
                                    <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${TASK_PRIORITY_COLORS[t.priority] || 'bg-gray-100 text-gray-500'}`}>
                                      {t.priority}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-gray-400">
                                  {t.due_date && (
                                    <span className="flex items-center gap-1"><Calendar size={10} />{new Date(t.due_date).toLocaleDateString()}</span>
                                  )}
                                  {t.is_blocked && <span className="text-red-500 font-medium flex items-center gap-1"><AlertTriangle size={10} /> Blocked</span>}
                                  {t.assignees?.length > 0 && (
                                    <span className="flex items-center gap-1">
                                      <User size={10} />
                                      {t.assignees.map((a: any) => a.name).join(', ')}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* ── REPOSITORY tab ── */}
                  {activeDetailTab === 'repo' && (
                    <div className="space-y-4">
                      {selectedProject.repo_url ? (
                        <>
                          {/* Repo URL + token */}
                          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1.5"><GitBranch size={11} /> Repository</p>
                              <div className="flex items-center gap-2">
                                {selectedProject.has_repo_token ? (
                                  <span className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-0.5 rounded-lg font-medium flex items-center gap-1">
                                    <CheckCircle2 size={10} /> Token set
                                  </span>
                                ) : (
                                  <span className="text-xs bg-amber-50 text-amber-600 border border-amber-100 px-2 py-0.5 rounded-lg font-medium">No token</span>
                                )}
                                <button
                                  onClick={() => { setShowInlineTokenForm(v => !v); setInlineToken(''); setTokenSaveError(''); setShowInlineTokenValue(false) }}
                                  className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                                >
                                  {showInlineTokenForm ? 'Cancel' : selectedProject.has_repo_token ? 'Update Token' : 'Add Token'}
                                </button>
                              </div>
                            </div>
                            <a
                              href={selectedProject.repo_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium group"
                            >
                              <span className="truncate">{selectedProject.repo_url}</span>
                              <ExternalLink size={13} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </a>

                            {showInlineTokenForm && (
                              <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
                                <p className="text-xs text-gray-500">
                                  Paste your GitHub / GitLab Personal Access Token with <code className="bg-gray-100 px-1 rounded">repo</code> scope.
                                </p>
                                <div className="relative">
                                  <input
                                    type={showInlineTokenValue ? 'text' : 'password'}
                                    value={inlineToken}
                                    onChange={e => setInlineToken(e.target.value)}
                                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 pr-16 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                    autoFocus
                                  />
                                  <button type="button" onClick={() => setShowInlineTokenValue(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 font-medium">
                                    {showInlineTokenValue ? 'Hide' : 'Show'}
                                  </button>
                                </div>
                                {tokenSaveError && <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={11} />{tokenSaveError}</p>}
                                <div className="flex gap-2">
                                  <button onClick={() => { setShowInlineTokenForm(false); setInlineToken(''); setTokenSaveError('') }} className="flex-1 py-1.5 text-xs text-gray-500 font-medium border border-gray-200 rounded-lg hover:text-gray-700">Cancel</button>
                                  <button onClick={handleUpdateToken} disabled={!inlineToken.trim() || tokenSaving} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                                    {tokenSaving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                                    {tokenSaving ? 'Saving…' : 'Save & Retry'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Commits */}
                          <div>
                            {/* Header + filter */}
                            <div className="flex items-center justify-between gap-3 mb-3">
                              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                                <GitCommitHorizontal size={12} /> Commits
                                {commitsTotal > 0 && (
                                  <span className="ml-1 bg-blue-100 text-blue-600 px-2 py-0.5 rounded-lg font-bold">{commitsTotal}</span>
                                )}
                              </p>
                              {/* Filters */}
                              {commits.length > 0 && (
                                <div className="flex items-center gap-2 flex-wrap">
                                  {/* Contributor filter */}
                                  <select
                                    value={commitEmailFilter}
                                    onChange={e => setCommitEmailFilter(e.target.value)}
                                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-600 max-w-[160px]"
                                  >
                                    <option value="">All contributors</option>
                                    {Array.from(new Map(commits.filter((c: any) => c.email || c.author).map((c: any) => [c.email || c.author, c])).values())
                                      .map((c: any) => (
                                        <option key={c.email || c.author} value={c.email || c.author}>
                                          {c.author}{c.email ? ` (${c.email})` : ''}
                                        </option>
                                      ))
                                    }
                                  </select>
                                  {/* Day filter */}
                                  <select
                                    value={commitDayFilter}
                                    onChange={e => setCommitDayFilter(e.target.value)}
                                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-600 max-w-[160px]"
                                  >
                                    <option value="">All days</option>
                                    {Array.from(new Set(commits.map((c: any) => (c.date || '').split('T')[0]).filter(Boolean))).sort().reverse()
                                      .map((day: any) => {
                                        const label = new Date(day + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                                        const cnt = commits.filter((c: any) => (c.date || '').startsWith(day)).length
                                        return <option key={day} value={day}>{label} ({cnt})</option>
                                      })
                                    }
                                  </select>
                                  {(commitEmailFilter || commitDayFilter) && (
                                    <button
                                      onClick={() => { setCommitEmailFilter(''); setCommitDayFilter('') }}
                                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                    >
                                      Clear
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>

                            {commitsLoading ? (
                              <div className="flex items-center gap-2 text-xs text-gray-400 py-4"><Loader2 size={13} className="animate-spin" /> Loading commits…</div>
                            ) : commitsError ? (
                              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                                <AlertTriangle size={13} className="shrink-0" />{commitsError}
                              </div>
                            ) : commits.length === 0 ? (
                              <p className="text-sm text-gray-400 py-4 text-center">No commits found.</p>
                            ) : (() => {
                              let filtered = commits
                              if (commitEmailFilter) filtered = filtered.filter((c: any) => c.email === commitEmailFilter || c.author === commitEmailFilter)
                              if (commitDayFilter)   filtered = filtered.filter((c: any) => (c.date || '').startsWith(commitDayFilter))

                              // Group by day for day-wise display
                              const grouped: Record<string, any[]> = {}
                              filtered.forEach((c: any) => {
                                const d = (c.date || '').split('T')[0] || 'Unknown'
                                if (!grouped[d]) grouped[d] = []
                                grouped[d].push(c)
                              })
                              const days = Object.keys(grouped).sort().reverse()

                              return filtered.length === 0 ? (
                                <p className="text-sm text-gray-400 py-4 text-center">No commits match the selected filters.</p>
                              ) : (
                                <div className="space-y-4">
                                  {days.map((day: string) => {
                                    const dayLabel = new Date(day + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
                                    return (
                                      <div key={day}>
                                        {/* Day header */}
                                        <div className="flex items-center gap-2 mb-2">
                                          <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg">{dayLabel}</span>
                                          <span className="text-xs text-gray-400">{grouped[day].length} commit{grouped[day].length !== 1 ? 's' : ''}</span>
                                          <div className="flex-1 h-px bg-gray-100" />
                                        </div>
                                        <div className="space-y-2">
                                          {grouped[day].map((c: any) => {
                                            const [firstLine, ...rest] = (c.message || '').split('\n')
                                            const body = rest.filter((l: string) => l.trim()).join('\n').trim()
                                            return (
                                              <div key={c.sha} className="p-3 rounded-xl border border-gray-100 hover:border-blue-100 hover:bg-blue-50/20 transition-colors">
                                                <div className="flex items-start gap-2.5">
                                                  {c.avatar_url ? (
                                                    <img src={c.avatar_url} alt={c.author} className="w-7 h-7 rounded-full shrink-0 mt-0.5" />
                                                  ) : (
                                                    <div className={`w-7 h-7 bg-gradient-to-br ${getGradient(c.author)} rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5`}>
                                                      {(c.author || '?')[0].toUpperCase()}
                                                    </div>
                                                  )}
                                                  <div className="flex-1 min-w-0">
                                                    <p className="text-sm text-gray-800 font-semibold leading-snug">{firstLine}</p>
                                                    {body && (
                                                      <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap leading-relaxed">{body}</p>
                                                    )}
                                                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                      <span className="text-xs text-gray-500 font-medium">{c.author}</span>
                                                      {c.email && <span className="text-xs text-gray-400">{c.email}</span>}
                                                      <span className="text-gray-300">·</span>
                                                      <span className="text-xs text-gray-400">{new Date(c.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                                                    </div>
                                                  </div>
                                                  <code className="text-[11px] text-gray-400 font-mono shrink-0 bg-gray-100 px-1.5 py-0.5 rounded-md">{c.sha}</code>
                                                </div>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )
                            })()}
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-12 text-gray-400">
                          <GitBranch size={28} className="mx-auto mb-2 text-gray-200" />
                          <p className="text-sm">No repository linked</p>
                          <p className="text-xs mt-1">Edit the project to add a Git repository URL</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── LINKS tab ── */}
                  {activeDetailTab === 'links' && (
                    <div className="space-y-3">
                      {/* Repository link */}
                      {selectedProject.repo_url && (
                        <a
                          href={selectedProject.repo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors group"
                        >
                          <div className="w-10 h-10 bg-gray-800 rounded-xl flex items-center justify-center shrink-0">
                            <GitBranch size={18} className="text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800">Git Repository</p>
                            <p className="text-xs text-gray-400 truncate">{selectedProject.repo_url}</p>
                          </div>
                          <ExternalLink size={15} className="text-gray-300 group-hover:text-blue-500 shrink-0 transition-colors" />
                        </a>
                      )}

                      {/* Figma link */}
                      {detailProject?.figma_url ? (
                        <a
                          href={detailProject.figma_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100 hover:border-purple-200 hover:bg-purple-50/30 transition-colors group"
                        >
                          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shrink-0">
                            <Layout size={18} className="text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800">Figma Design</p>
                            <p className="text-xs text-gray-400 truncate">{detailProject.figma_url}</p>
                          </div>
                          <ExternalLink size={15} className="text-gray-300 group-hover:text-purple-500 shrink-0 transition-colors" />
                        </a>
                      ) : (
                        <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                          <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center shrink-0">
                            <Layout size={18} className="text-gray-300" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-500">No Figma link</p>
                            <p className="text-xs text-gray-400">Edit the project to add a Figma design URL</p>
                          </div>
                        </div>
                      )}

                      {/* Custom links */}
                      {detailProject?.links?.filter((l: any) => l.url).map((l: any, idx: number) => (
                        <a
                          key={idx}
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors group"
                        >
                          <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center shrink-0">
                            <Link2 size={18} className="text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800">{l.title || 'Link'}</p>
                            <p className="text-xs text-gray-400 truncate">{l.url}</p>
                          </div>
                          <ExternalLink size={15} className="text-gray-300 group-hover:text-blue-500 shrink-0 transition-colors" />
                        </a>
                      ))}

                      {/* Tools & Integrations */}
                      {detailProject?.tools?.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                            <span className="w-3.5 h-3.5 bg-indigo-500 rounded-sm inline-block" />
                            Tools & Integrations
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            {detailProject.tools.map((tool: any) => (
                              tool.url ? (
                                <a
                                  key={tool.id}
                                  href={tool.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors group"
                                >
                                  <span
                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-[10px] shrink-0"
                                    style={{ backgroundColor: tool.color || '#6264A7' }}
                                  >
                                    {(tool.abbr || tool.name || '?').slice(0, 2)}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-gray-800 truncate">{tool.name}</p>
                                    <p className="text-[10px] text-gray-400 truncate">{tool.url}</p>
                                  </div>
                                  <ExternalLink size={12} className="text-gray-300 group-hover:text-indigo-500 shrink-0 transition-colors" />
                                </a>
                              ) : (
                                <div
                                  key={tool.id}
                                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100"
                                >
                                  <span
                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-[10px] shrink-0"
                                    style={{ backgroundColor: tool.color || '#6264A7' }}
                                  >
                                    {(tool.abbr || tool.name || '?').slice(0, 2)}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-gray-800 truncate">{tool.name}</p>
                                    <p className="text-[10px] text-gray-400">{tool.category}</p>
                                  </div>
                                </div>
                              )
                            ))}
                          </div>
                        </div>
                      )}

                      {(!selectedProject.repo_url && !detailProject?.figma_url && !detailProject?.links?.filter((l: any) => l.url)?.length && !detailProject?.tools?.length) && (
                        <div className="text-center py-12 text-gray-400">
                          <Link2 size={28} className="mx-auto mb-2 text-gray-200" />
                          <p className="text-sm">No links added yet</p>
                          <p className="text-xs mt-1">Edit the project to add repository or Figma links</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ════ EDIT form ════ */}
              {projectMode === 'edit' && (
                <div className="p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Pencil size={14} className="text-blue-500" /> Edit Project</h3>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Project Name</label>
                    <input type="text" value={editProjectForm.name || ''} onChange={e => setEditProjectForm({ ...editProjectForm, name: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                    <textarea value={editProjectForm.description || ''} onChange={e => setEditProjectForm({ ...editProjectForm, description: e.target.value })} rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 resize-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
                      <select value={editProjectForm.priority || 'medium'} onChange={e => setEditProjectForm({ ...editProjectForm, priority: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50">
                        {['low', 'medium', 'high', 'critical'].map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                      <select value={editProjectForm.status || 'active'} onChange={e => setEditProjectForm({ ...editProjectForm, status: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50">
                        {['planning', 'active', 'on_hold', 'completed', 'cancelled'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
                    <input type="date" value={editProjectForm.due_date || ''} onChange={e => setEditProjectForm({ ...editProjectForm, due_date: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><GitBranch size={11} className="text-gray-400" /> Repository URL</label>
                    <input type="url" value={editProjectForm.repo_url || ''} onChange={e => setEditProjectForm({ ...editProjectForm, repo_url: e.target.value })} placeholder="https://github.com/org/repo" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                      <GitBranch size={11} className="text-gray-400" /> Personal Access Token
                      <span className="ml-1 text-xs font-normal text-gray-400">(leave blank to keep existing)</span>
                    </label>
                    <div className="relative">
                      <input type={showEditToken ? 'text' : 'password'} value={editProjectForm.repo_token || ''} onChange={e => setEditProjectForm({ ...editProjectForm, repo_token: e.target.value })} placeholder="Enter new token to replace…" className="w-full border border-gray-200 rounded-xl px-3 py-2 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 font-mono" />
                      <button type="button" onClick={() => setShowEditToken(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 font-medium">{showEditToken ? 'Hide' : 'Show'}</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><Layout size={11} className="text-gray-400" /> Figma Design URL</label>
                    <input type="url" value={editProjectForm.figma_url || ''} onChange={e => setEditProjectForm({ ...editProjectForm, figma_url: e.target.value })} placeholder="https://www.figma.com/file/…" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
                  </div>

                  {/* Additional links */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                        <Link2 size={11} className="text-gray-400" /> Additional Links
                      </label>
                      <button
                        type="button"
                        onClick={() => setEditProjectForm((f: any) => ({ ...f, links: [...(f.links || []), { title: '', url: '' }] }))}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        <Plus size={11} /> Add Link
                      </button>
                    </div>
                    {!(editProjectForm.links?.length) ? (
                      <p className="text-xs text-gray-400">No additional links — click "Add Link" to add one.</p>
                    ) : (
                      <div className="space-y-2">
                        {(editProjectForm.links || []).map((link: any, i: number) => (
                          <div key={i} className="flex gap-2 items-center">
                            <input
                              type="text"
                              value={link.title || ''}
                              onChange={e => setEditProjectForm((f: any) => ({ ...f, links: f.links.map((l: any, j: number) => j === i ? { ...l, title: e.target.value } : l) }))}
                              placeholder="Title"
                              className="w-28 shrink-0 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                            />
                            <input
                              type="url"
                              value={link.url || ''}
                              onChange={e => setEditProjectForm((f: any) => ({ ...f, links: f.links.map((l: any, j: number) => j === i ? { ...l, url: e.target.value } : l) }))}
                              placeholder="https://…"
                              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                            />
                            <button
                              type="button"
                              onClick={() => setEditProjectForm((f: any) => ({ ...f, links: f.links.filter((_: any, j: number) => j !== i) }))}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Tools & Integrations */}
                  <ToolsPicker
                    compact
                    value={editProjectForm.tools || []}
                    onChange={tools => setEditProjectForm((f: any) => ({ ...f, tools }))}
                  />

                  {/* PM picker */}
                  {subordinates.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1.5">
                        <Shield size={11} className="text-indigo-400" /> Project Manager
                      </label>
                      <select
                        value={editProjectForm.pm_id || ''}
                        onChange={e => setEditProjectForm({ ...editProjectForm, pm_id: e.target.value })}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"
                      >
                        <option value="">— Keep current PM —</option>
                        {subordinates
                          .filter(u => ['ceo','coo','pm'].includes(u.primary_role || ''))
                          .map(u => (
                            <option key={u.id} value={u.id}>{u.full_name} ({u.primary_role})</option>
                          ))
                        }
                      </select>
                    </div>
                  )}

                  {/* Member picker */}
                  <UserPickerByRole
                    users={subordinates}
                    selected={editProjectForm.member_ids || []}
                    onChange={ids => setEditProjectForm((f: any) => ({ ...f, member_ids: ids }))}
                    maxHeight="max-h-44"
                  />

                  <div className="flex gap-2 pt-1">
                    <button onClick={() => { setProjectMode('view'); setProjectActionError(''); setEditMemberSearch('') }} className="flex-1 py-2.5 text-sm text-gray-600 font-medium border border-gray-200 rounded-xl hover:text-gray-800">Cancel</button>
                    <button
                      disabled={projectActionLoading}
                      onClick={async () => {
                        setProjectActionLoading(true)
                        setProjectActionError('')
                        try {
                          const payload: any = { ...editProjectForm }
                          // Strip fields that must not be sent as empty strings
                          if (!payload.repo_token)  delete payload.repo_token
                          if (!payload.pm_id)       delete payload.pm_id
                          if (!payload.due_date)    delete payload.due_date
                          if (!payload.repo_url)    delete payload.repo_url
                          if (!payload.figma_url)   delete payload.figma_url
                          await api.put(`/projects/${selectedProject.id}`, payload)
                          dispatch(updateProjectLocal({ id: selectedProject.id, updates: payload }))
                          setSelectedProject((p: any) => ({ ...p, ...payload }))
                          // Re-fetch full detail so members/PM reflect changes
                          api.get(`/projects/${selectedProject.id}/detail`)
                            .then((res: any) => setDetailProject(res.data))
                            .catch(() => {})
                          setProjectMode('view')
                          setEditMemberSearch('')
                        } catch (err: any) {
                          const detail = err?.response?.data?.detail
                          const msg = typeof detail === 'string'
                            ? detail
                            : Array.isArray(detail)
                              ? detail.map((e: any) => `${e.loc?.slice(-1)[0] ?? 'field'}: ${e.msg}`).join(' · ')
                              : 'Failed to update project'
                          setProjectActionError(msg)
                        } finally {
                          setProjectActionLoading(false)
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50"
                    >
                      {projectActionLoading ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                      {projectActionLoading ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              )}

              {/* ════ CONFIRM CANCEL ════ */}
              {projectMode === 'confirm-delete' && (
                <div className="p-6 space-y-4">
                  <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
                    <Trash2 size={28} className="text-red-400 mx-auto mb-3" />
                    <p className="text-base font-bold text-red-700">Cancel "{selectedProject.name}"?</p>
                    <p className="text-sm text-red-500 mt-1">The project will be marked as cancelled. This cannot be undone.</p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => { setProjectMode('view'); setProjectActionError('') }} className="flex-1 py-2.5 text-sm text-gray-600 font-medium border border-gray-200 rounded-xl hover:text-gray-800">Go Back</button>
                    <button
                      disabled={projectActionLoading}
                      onClick={async () => {
                        setProjectActionLoading(true)
                        setProjectActionError('')
                        try {
                          await api.delete(`/projects/${selectedProject.id}`)
                          dispatch(updateProjectLocal({ id: selectedProject.id, updates: { status: 'cancelled' } }))
                          setSelectedProject(null)
                          setProjectMode('view')
                        } catch (err: any) {
                          const d = err?.response?.data?.detail
                          setProjectActionError(typeof d === 'string' ? d : Array.isArray(d) ? d.map((e: any) => e.msg).join(' · ') : 'Failed to cancel project')
                          setProjectActionLoading(false)
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 disabled:opacity-50"
                    >
                      {projectActionLoading ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      {projectActionLoading ? 'Cancelling…' : 'Confirm Cancel'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>,
        document.body
      )}

      {/* Create Project Modal */}
      {showModal && (
        <Modal onClose={handleCloseModal}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl animate-scale-in">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center">
                  <FolderOpen size={15} className="text-blue-600" />
                </div>
                <h2 className="text-lg font-semibold text-gray-800">New Project</h2>
              </div>
              <button onClick={handleCloseModal} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {[
                { label: 'Project Name *', key: 'name', placeholder: 'e.g. Website Redesign' },
                { label: 'Description', key: 'description', placeholder: 'Brief description...' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <input
                    type="text"
                    value={(form as any)[key]}
                    onChange={e => setForm({ ...form, [key]: e.target.value })}
                    placeholder={placeholder}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all"
                  />
                </div>
              ))}

              {/* Repository URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                  <GitBranch size={14} className="text-gray-500" />
                  Git Repository URL *
                </label>
                <input
                  type="url"
                  value={form.repo_url}
                  onChange={e => setForm({ ...form, repo_url: e.target.value })}
                  placeholder="https://github.com/org/repo"
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all ${
                    !form.repo_url ? 'border-gray-200' : 'border-gray-200'
                  }`}
                />
                <p className="text-xs text-gray-400 mt-1">GitHub or GitLab URL required to track commits</p>
              </div>

              {/* Private repo toggle */}
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isPrivateRepo}
                  onChange={e => {
                    setIsPrivateRepo(e.target.checked)
                    if (!e.target.checked) {
                      setForm(f => ({ ...f, repo_token: '' }))
                      setShowToken(false)
                    }
                  }}
                  className="w-4 h-4 rounded accent-blue-600"
                />
                <span className="text-sm text-gray-700 font-medium">This is a private repository</span>
              </label>

              {/* Personal Access Token — only shown for private repos */}
              {isPrivateRepo && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <GitBranch size={14} className="text-blue-500 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-800">Personal Access Token</p>
                      <p className="text-xs text-blue-500 mt-0.5">
                        Required to read commits from a private repo. Generate one at <strong>GitHub → Settings → Developer Settings → Personal Access Tokens</strong> with <code className="bg-blue-100 px-1 rounded">repo</code> scope.
                      </p>
                    </div>
                  </div>
                  <div className="relative">
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={form.repo_token}
                      onChange={e => setForm({ ...form, repo_token: e.target.value })}
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      className="w-full border border-blue-200 rounded-xl px-3 py-2.5 pr-20 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-mono"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-blue-400 hover:text-blue-600 font-medium"
                    >
                      {showToken ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <p className="text-xs text-blue-400">Stored securely — never exposed after saving.</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    value={form.priority}
                    onChange={e => setForm({ ...form, priority: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  >
                    {['low', 'medium', 'high', 'critical'].map(p => (
                      <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date *</label>
                  <input
                    type="date"
                    value={form.due_date}
                    min={form.start_date}
                    onChange={e => setForm({ ...form, due_date: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={e => setForm({ ...form, start_date: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                />
              </div>
              {/* Figma URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                  <Layout size={14} className="text-purple-500" />
                  Figma Design URL
                </label>
                <input
                  type="url"
                  value={form.figma_url}
                  onChange={e => setForm({ ...form, figma_url: e.target.value })}
                  placeholder="https://www.figma.com/file/…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50 focus:bg-white transition-all"
                />
              </div>

              {/* Additional Links */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <Link2 size={14} className="text-gray-500" /> Additional Links
                  </label>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, links: [...f.links, { title: '', url: '' }] }))}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    <Plus size={12} /> Add Link
                  </button>
                </div>
                {form.links.length === 0 ? (
                  <p className="text-xs text-gray-400">No additional links — click "Add Link" to add one.</p>
                ) : (
                  <div className="space-y-2">
                    {form.links.map((link, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={link.title}
                          onChange={e => setForm(f => ({ ...f, links: f.links.map((l, j) => j === i ? { ...l, title: e.target.value } : l) }))}
                          placeholder="Title"
                          className="w-28 shrink-0 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                        />
                        <input
                          type="url"
                          value={link.url}
                          onChange={e => setForm(f => ({ ...f, links: f.links.map((l, j) => j === i ? { ...l, url: e.target.value } : l) }))}
                          placeholder="https://…"
                          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                        />
                        <button
                          type="button"
                          onClick={() => setForm(f => ({ ...f, links: f.links.filter((_, j) => j !== i) }))}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tools & Integrations */}
              <div>
                <ToolsPicker
                  value={form.tools}
                  onChange={tools => setForm(f => ({ ...f, tools }))}
                />
              </div>

              {/* Team Picker */}
              {teams.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                      <Users size={14} className="text-indigo-500" />
                      Teams
                    </label>
                    {form.team_ids.length > 0 && (
                      <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">
                        {form.team_ids.length} selected
                      </span>
                    )}
                  </div>
                  <div className="relative mb-1.5">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={teamSearch}
                      onChange={e => setTeamSearch(e.target.value)}
                      placeholder="Search teams…"
                      className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 focus:bg-white transition-all"
                    />
                  </div>
                  <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100 bg-white">
                    {availableTeams.length === 0 ? (
                      <p className="text-center text-xs text-gray-400 py-4">No teams match your search</p>
                    ) : availableTeams.map(t => {
                      const checked = form.team_ids.includes(t.id)
                      return (
                        <label
                          key={t.id}
                          className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                            checked ? 'bg-indigo-50 hover:bg-indigo-100' : 'hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleTeam(t.id)}
                            className="rounded accent-indigo-600 shrink-0"
                          />
                          <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0 ${
                            checked ? 'bg-gradient-to-br from-indigo-500 to-purple-600' : 'bg-gradient-to-br from-gray-300 to-gray-400'
                          }`}>
                            {t.name[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{t.name}</p>
                            {t.department && (
                              <p className="text-xs text-gray-400 truncate">{t.department}</p>
                            )}
                          </div>
                          {checked && <UserCheck size={13} className="text-indigo-500 shrink-0" />}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Member Picker */}
              <UserPickerByRole
                users={subordinates.length > 0 ? subordinates : []}
                selected={form.member_ids}
                onChange={ids => setForm(f => ({ ...f, member_ids: ids }))}
                label="Team Members"
                maxHeight="max-h-52"
              />
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={handleCloseModal} className="px-5 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!form.name || !form.due_date || !form.repo_url}
                className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-all"
              >
                {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Create Project
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
