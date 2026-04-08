import React, { useEffect, useState } from 'react'
import { navigate } from './AppLayout'
import { useDispatch, useSelector } from 'react-redux'
import { FolderOpen, Plus, AlertTriangle, Search } from 'lucide-react'
import { RootState } from '../store'
import { fetchProjectsRequest, createProjectRequest, updateProjectLocal } from '../store/slices/projectsSlice'
import { fetchUsersRequest } from '../store/slices/usersSlice'
import { fetchTeamsRequest } from '../store/slices/teamsSlice'
import { Pagination } from '../components/common/Pagination'
import { api } from '../utils/api'
import { MANAGER_ROLES, EXEC_ROLES } from '../constants/roles'
import { useToast } from '../components/shared'
import { STATUS_TABS, emptyForm } from '../components/projects/projectsConstants'
import { ProjectCard } from '../components/projects/ProjectCard'
import { ProjectDetailPanel } from '../components/projects/ProjectDetailPanel'
import { CreateProjectModal } from '../components/projects/CreateProjectModal'

export const ProjectsPage: React.FC = () => {
  const dispatch = useDispatch()
  const toast = useToast()
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
  const [memberSearch, setMemberSearch] = useState('')
  const [showEditToken, setShowEditToken] = useState(false)
  const [showInlineTokenForm, setShowInlineTokenForm] = useState(false)
  const [inlineToken, setInlineToken] = useState('')
  const [showInlineTokenValue, setShowInlineTokenValue] = useState(false)
  const [tokenSaving, setTokenSaving] = useState(false)
  const [tokenSaveError, setTokenSaveError] = useState('')
  const [editMemberSearch, setEditMemberSearch] = useState('')

  const canCreate = MANAGER_ROLES.includes(user?.primary_role as any)
  const canManageProject = (project: any) => {
    const role = user?.primary_role || ''
    if ([...EXEC_ROLES, 'pm'].includes(role)) return true
    if (project?.pm_id === (user as any)?.id) return true
    if (role === 'team_lead') {
      const userTeamIds: string[] = (user as any)?.team_ids || []
      const projectTeamIds: string[] = project?.team_ids || []
      return projectTeamIds.some((tid: string) => userTeamIds.includes(tid)) ||
             (project?.member_ids || []).includes((user as any)?.id)
    }
    return false
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

    setDetailLoading(true)
    api.get(`/projects/${selectedProject.id}/detail`)
      .then((res: any) => { if (!cancelled) setDetailProject(res.data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDetailLoading(false) })

    if (selectedProject.repo_url) {
      setCommitsLoading(true)
      setCommits([])
      setCommitsError('')
      setContributorStatsError('')
      api.get(`/projects/${selectedProject.id}/commits`)
        .then((res: any) => {
          if (cancelled) return
          setCommits(res.data.commits || [])
          setCommitsTotal(res.data.total || 0)
          if (res.data.error) setCommitsError(res.data.error)
        })
        .catch(() => { if (!cancelled) setCommitsError('Failed to load commits.') })
        .finally(() => { if (!cancelled) setCommitsLoading(false) })

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
      toast.success('Repository token updated')
      setSelectedProject({ ...selectedProject, has_repo_token: true })
      setInlineToken('')
      setShowInlineTokenForm(false)
      setShowInlineTokenValue(false)
      setCommitsLoading(true)
      setCommits([])
      setCommitsError('')
      setContributorStatsError('')
      const res: any = await api.get(`/projects/${selectedProject.id}/commits`)
      setCommits(res.data.commits || [])
      setCommitsTotal(res.data.total || 0)
      if (res.data.error) setCommitsError(res.data.error)
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
      toast.error('Failed to save token')
      setTokenSaveError('Failed to save token. Please try again.')
    } finally {
      setTokenSaving(false)
      setCommitsLoading(false)
    }
  }

  const handleCreate = () => {
    if (!form.name || !form.due_date || !form.repo_url) return
    dispatch(createProjectRequest(form))
    setShowModal(false); setForm(emptyForm); setMemberSearch('')
  }
  const handleCloseModal = () => { setShowModal(false); setForm(emptyForm); setMemberSearch('') }

  const handleEditSave = async () => {
    setProjectActionLoading(true)
    setProjectActionError('')
    try {
      const payload: any = { ...editProjectForm }
      if (!payload.repo_token)  delete payload.repo_token
      if (!payload.pm_id)       delete payload.pm_id
      if (!payload.due_date)    delete payload.due_date
      if (!payload.repo_url)    delete payload.repo_url
      if (!payload.figma_url)   delete payload.figma_url
      await api.put(`/projects/${selectedProject.id}`, payload)
      toast.success('Project updated')
      dispatch(updateProjectLocal({ id: selectedProject.id, updates: payload }))
      setSelectedProject((p: any) => ({ ...p, ...payload }))
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
      toast.error(msg)
      setProjectActionError(msg)
    } finally {
      setProjectActionLoading(false)
    }
  }

  const handleDelete = async () => {
    setProjectActionLoading(true)
    setProjectActionError('')
    try {
      await api.delete(`/projects/${selectedProject.id}`)
      toast.success('Project deleted')
      dispatch(updateProjectLocal({ id: selectedProject.id, updates: { status: 'cancelled' } }))
      setSelectedProject(null)
      setProjectMode('view')
    } catch (err: any) {
      const d = err?.response?.data?.detail
      const deleteMsg = typeof d === 'string' ? d : Array.isArray(d) ? d.map((e: any) => e.msg).join(' · ') : 'Failed to cancel project'
      toast.error(deleteMsg)
      setProjectActionError(deleteMsg)
      setProjectActionLoading(false)
    }
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
            <ProjectCard key={project.id} project={project} index={i} progressColor={progressColor} />
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

      {/* Project Detail Slide-over */}
      <ProjectDetailPanel
        selectedProject={selectedProject}
        setSelectedProject={setSelectedProject}
        detailProject={detailProject}
        setDetailProject={setDetailProject}
        detailLoading={detailLoading}
        activeDetailTab={activeDetailTab}
        setActiveDetailTab={setActiveDetailTab}
        projectMode={projectMode}
        setProjectMode={setProjectMode}
        editProjectForm={editProjectForm}
        setEditProjectForm={setEditProjectForm}
        projectActionLoading={projectActionLoading}
        setProjectActionLoading={setProjectActionLoading}
        projectActionError={projectActionError}
        setProjectActionError={setProjectActionError}
        commits={commits}
        commitsTotal={commitsTotal}
        commitsLoading={commitsLoading}
        commitsError={commitsError}
        contributorStats={contributorStats}
        contributorStatsLoading={contributorStatsLoading}
        contributorStatsError={contributorStatsError}
        commitEmailFilter={commitEmailFilter}
        commitDayFilter={commitDayFilter}
        setCommitEmailFilter={setCommitEmailFilter}
        setCommitDayFilter={setCommitDayFilter}
        canManageProject={canManageProject}
        showEditToken={showEditToken}
        setShowEditToken={setShowEditToken}
        editMemberSearch={editMemberSearch}
        setEditMemberSearch={setEditMemberSearch}
        showInlineTokenForm={showInlineTokenForm}
        setShowInlineTokenForm={setShowInlineTokenForm}
        inlineToken={inlineToken}
        setInlineToken={setInlineToken}
        showInlineTokenValue={showInlineTokenValue}
        setShowInlineTokenValue={setShowInlineTokenValue}
        tokenSaving={tokenSaving}
        tokenSaveError={tokenSaveError}
        setTokenSaveError={setTokenSaveError}
        handleUpdateToken={handleUpdateToken}
        handleEditSave={handleEditSave}
        handleDelete={handleDelete}
      />

      {/* Create Project Modal */}
      <CreateProjectModal
        show={showModal}
        onClose={handleCloseModal}
        form={form}
        setForm={setForm}
        onSubmit={handleCreate}
        creating={isLoading}
        error={error}
        callerRole={user?.primary_role || ''}
        teams={teams}
        subordinates={subordinates}
      />
    </div>
  )
}
