import React, { useEffect, useState, useCallback } from 'react'
import { useSelector } from 'react-redux'
import {
  ArrowLeft, GitBranch, Link2, Layout, Users, CheckCircle2,
  AlertTriangle, Loader2, ExternalLink, Pencil, Trash2,
  BarChart2, GitCommitHorizontal,
  Shield, Calendar, Clock, RefreshCw, X, Save,
  Activity, Wrench, ListChecks, KeyRound,
} from 'lucide-react'
import { RootState } from '../store'
import { navigate } from './AppLayout'
import { api } from '../utils/api'
import { EXEC_ROLES } from '../constants/roles'
import { useToast } from '../components/shared'

import {
  STATUS_COLORS, PRIORITY_COLORS, TASK_STATUS_COLORS,
  getGrad, PHASE_META,
} from '../components/projects/projectTypes'
import { StatCard } from '../components/projects/StatCard'
import { ToolDataPanel } from '../components/projects/ToolDataPanel'
import { PhaseTracker } from '../components/projects/PhaseTracker'
import { MembersTab } from '../components/projects/MembersTab'
import { TrackingTab } from '../components/projects/TrackingTab'

// ─── Main Page ────────────────────────────────────────────────────────────────

interface ProjectDetailPageProps {
  projectId: string
}

export const ProjectDetailPage: React.FC<ProjectDetailPageProps> = ({ projectId }) => {
  const toast = useToast()
  const { user } = useSelector((s: RootState) => s.auth)

  const [project, setProject]       = useState<any>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [activeTab, setActiveTab]   = useState('overview')
  const [editMode, setEditMode]     = useState(false)
  const [editForm, setEditForm]     = useState<any>({})
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState('')
  const [deleting, setDeleting]     = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  // Commits
  const [commits, setCommits]               = useState<any[]>([])
  const [commitsTotal, setCommitsTotal]     = useState(0)
  const [commitsLoading, setCommitsLoading] = useState(false)
  const [commitsError, setCommitsError]     = useState('')
  const [commitFilter, setCommitFilter]     = useState('')

  // Contributor stats
  const [contribStats, setContribStats]         = useState<any[]>([])
  const [contribLoading, setContribLoading]     = useState(false)
  const [contribError, setContribError]         = useState('')

  // GitHub token change
  const [tokenInput, setTokenInput]       = useState('')
  const [showTokenInput, setShowTokenInput] = useState(false)
  const [tokenSaving, setTokenSaving]     = useState(false)
  const [tokenError, setTokenError]       = useState('')
  const [tokenSuccess, setTokenSuccess]   = useState(false)


  const loadProject = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const r = await api.get(`/projects/${projectId}/detail`)
      setProject(r.data)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to load project')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { loadProject() }, [loadProject])

  useEffect(() => {
    if (activeTab === 'repo' && project?.repo_url) {
      fetchCommits()
      fetchContribs()
    }
  }, [activeTab, project?.id])

  const fetchCommits = async () => {
    if (!project?.id) return
    setCommitsLoading(true); setCommitsError('')
    try { const r = await api.get(`/projects/${project.id}/commits`); setCommits(r.data.commits || []); setCommitsTotal(r.data.total || 0) }
    catch (err: any) { setCommitsError(err?.response?.data?.detail || 'Could not load commits') }
    finally { setCommitsLoading(false) }
  }

  const fetchContribs = async () => {
    if (!project?.id) return
    setContribLoading(true); setContribError('')
    try { const r = await api.get(`/projects/${project.id}/contributor-stats`); setContribStats(Array.isArray(r.data) ? r.data : r.data.contributors || []) }
    catch (err: any) { setContribError(err?.response?.data?.detail || 'Could not load contributor stats') }
    finally { setContribLoading(false) }
  }


  const openEdit = () => {
    setEditForm({ name: project.name, description: project.description || '', priority: project.priority, status: project.status, due_date: project.due_date ? project.due_date.split('T')[0] : '', repo_url: project.repo_url || '', figma_url: project.figma_url || '', pm_id: project.pm?.id || '' })
    setEditMode(true)
  }

  const saveEdit = async () => {
    setSaving(true); setSaveError('')
    try {
      const payload = { ...editForm }
      if (!payload.repo_url) delete payload.repo_url; if (!payload.figma_url) delete payload.figma_url
      if (!payload.pm_id) delete payload.pm_id; if (!payload.due_date) delete payload.due_date
      await api.put(`/projects/${projectId}`, payload); await loadProject(); setEditMode(false); toast.success('Project updated')
    } catch (err: any) { const d = err?.response?.data?.detail; const msg = typeof d === 'string' ? d : Array.isArray(d) ? d.map((e: any) => e.msg).join(' · ') : 'Failed to save'; setSaveError(msg); toast.error(msg) }
    finally { setSaving(false) }
  }

  const deleteProject = async () => {
    setDeleting(true)
    try { await api.delete(`/projects/${projectId}`); toast.success('Project deleted'); navigate('/projects') }
    catch (err: any) { setDeleting(false); setDeleteConfirm(false); toast.error(err?.response?.data?.detail || 'Failed to delete project') }
  }

  const saveToken = async () => {
    if (!tokenInput.trim()) return
    setTokenSaving(true); setTokenError(''); setTokenSuccess(false)
    try { await api.put(`/projects/${projectId}`, { repo_token: tokenInput }); setTokenInput(''); setShowTokenInput(false); setTokenSuccess(true); setTimeout(() => setTokenSuccess(false), 4000); toast.success('Repository token updated') }
    catch (err: any) { setTokenError(err?.response?.data?.detail || 'Failed to update token'); toast.error(err?.response?.data?.detail || 'Failed to update token') }
    finally { setTokenSaving(false) }
  }

  const canManage = (() => {
    const role = user?.primary_role || ''
    if (EXEC_ROLES.includes(role as any)) return true
    if (project?.pm?.id === (user as any)?.id) return true
    if (role === 'pm') return true
    if (role === 'team_lead') return (project?.members || []).some((m: any) => m.id === (user as any)?.id)
    return false
  })()

  const _userId = (user as any)?.user_id || (user as any)?.id
  const canToggleStage = canManage || (project?.members || []).some((m: any) => m.id === _userId)

  if (loading) return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="h-10 skeleton rounded-xl w-48" />
      <div className="h-36 skeleton rounded-2xl" />
      <div className="grid grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-20 skeleton rounded-2xl" />)}</div>
    </div>
  )

  if (error) return (
    <div className="max-w-5xl mx-auto flex flex-col items-center justify-center h-64 text-gray-400 gap-4">
      <AlertTriangle size={28} className="text-red-400" />
      <p className="text-sm font-medium text-red-600">{error}</p>
      <button onClick={() => navigate('/projects')} className="flex items-center gap-2 text-sm text-blue-600 hover:underline"><ArrowLeft size={14} /> Back to Projects</button>
    </div>
  )

  if (!project) return null

  const doneTasks  = (project.tasks || []).filter((t: any) => t.status === 'done').length
  const totalTasks = (project.tasks || []).length
  const daysLeft   = project.due_date ? Math.ceil((new Date(project.due_date).getTime() - Date.now()) / 86_400_000) : null

  const currentPhaseStages = (project.phase_stages || {})[project.status] || []
  const currentPhaseDone = currentPhaseStages.filter((s: any) => s.completed).length
  const currentPhaseTotal = currentPhaseStages.length

  const TABS = [
    { key: 'overview',  label: 'Overview',    icon: <BarChart2 size={13} /> },
    { key: 'phases',    label: `Phases${currentPhaseTotal > 0 ? ` (${currentPhaseDone}/${currentPhaseTotal})` : ''}`, icon: <ListChecks size={13} /> },
    { key: 'members',   label: `Members (${project.members?.length || 0})`,  icon: <Users size={13} /> },
    { key: 'tasks',     label: `Tasks (${totalTasks})`,    icon: <CheckCircle2 size={13} /> },
    { key: 'repo',      label: 'Repository',  icon: <GitBranch size={13} /> },
    { key: 'tools',     label: `Tools (${project.tools?.length || 0})`, icon: <Wrench size={13} /> },
    { key: 'links',     label: 'Links',       icon: <Link2 size={13} /> },
    ...(canManage ? [{ key: 'tracking', label: 'Tracking', icon: <Activity size={13} /> }] : []),
  ]

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-fade-in">
      {/* Back */}
      <button onClick={() => navigate('/projects')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors font-medium">
        <ArrowLeft size={15} /> All Projects
      </button>

      {/* ── Header ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className={`h-2 w-full ${project.status === 'active' ? 'bg-emerald-500' : project.status === 'planning' ? 'bg-blue-500' : project.status === 'on_hold' ? 'bg-amber-500' : project.status === 'completed' ? 'bg-gray-400' : 'bg-red-500'}`} />
        <div className="p-6">
          {editMode ? (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-600 flex items-center gap-2"><Pencil size={14} className="text-indigo-500" /> Editing Project</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">Project Name</label><input value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" /></div>
                <div className="col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">Description</label><textarea value={editForm.description || ''} onChange={e => setEditForm({...editForm, description: e.target.value})} rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 resize-none" /></div>
                {[{ label: 'Priority', key: 'priority', opts: ['critical','high','medium','low'] }, { label: 'Status', key: 'status', opts: ['planning','active','on_hold','completed','cancelled'] }].map(({ label, key, opts }) => (
                  <div key={key}><label className="block text-xs font-medium text-gray-600 mb-1">{label}</label><select value={editForm[key] || ''} onChange={e => setEditForm({...editForm, [key]: e.target.value})} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 capitalize">{opts.map(o => <option key={o} value={o} className="capitalize">{o.replace('_', ' ')}</option>)}</select></div>
                ))}
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label><input type="date" value={editForm.due_date || ''} onChange={e => setEditForm({...editForm, due_date: e.target.value})} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Repository URL</label><input type="url" value={editForm.repo_url || ''} onChange={e => setEditForm({...editForm, repo_url: e.target.value})} placeholder="https://github.com/org/repo" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Figma URL</label><input type="url" value={editForm.figma_url || ''} onChange={e => setEditForm({...editForm, figma_url: e.target.value})} placeholder="https://www.figma.com/file/…" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" /></div>
              </div>
              {saveError && (<div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-700 text-xs px-3 py-2 rounded-xl"><AlertTriangle size={12} /> {saveError}</div>)}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditMode(false)} className="px-4 py-2 text-sm text-gray-600 font-medium border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
                <button onClick={saveEdit} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50">{saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}{saving ? 'Saving…' : 'Save Changes'}</button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap mb-2">
                    <h1 className="text-2xl font-bold text-gray-900 truncate">{project.name}</h1>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border capitalize ${STATUS_COLORS[project.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>{project.status?.replace('_', ' ')}</span>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${PRIORITY_COLORS[project.priority] || ''}`}>{project.priority}</span>
                  </div>
                  {project.description && <p className="text-sm text-gray-500 leading-relaxed mb-3">{project.description}</p>}
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex-1 max-w-xs h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500" style={{ width: `${project.progress_percentage || 0}%` }} /></div>
                    <span className="text-sm font-semibold text-gray-700">{project.progress_percentage || 0}%</span>
                    {currentPhaseTotal > 0 && (
                      <button onClick={() => setActiveTab('phases')} className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors hover:opacity-80 ${PHASE_META[project.status]?.badge || 'bg-gray-100 text-gray-600 border-gray-200'}`}><ListChecks size={11} />{currentPhaseDone}/{currentPhaseTotal} stages</button>
                    )}
                  </div>
                </div>
                {canManage && !deleteConfirm && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={openEdit} className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-xl transition-colors"><Pencil size={13} /> Edit</button>
                    <button onClick={() => setDeleteConfirm(true)} className="flex items-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded-xl transition-colors"><Trash2 size={13} /> Delete</button>
                  </div>
                )}
                {deleteConfirm && (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-red-600 font-medium">Delete this project?</span>
                    <button onClick={() => setDeleteConfirm(false)} className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                    <button onClick={deleteProject} disabled={deleting} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50">{deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}{deleting ? 'Deleting…' : 'Confirm'}</button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-gray-500">
                {project.pm && <div className="flex items-center gap-1.5"><Shield size={12} className="text-indigo-400" /><span>PM: <strong className="text-gray-700">{project.pm.name}</strong></span></div>}
                {project.due_date && <div className="flex items-center gap-1.5"><Calendar size={12} className="text-gray-400" /><span>Due: <strong className="text-gray-700">{new Date(project.due_date).toLocaleDateString()}</strong></span></div>}
                {daysLeft !== null && <div className={`flex items-center gap-1.5 ${daysLeft < 0 ? 'text-red-500' : daysLeft <= 7 ? 'text-amber-600' : ''}`}><Clock size={12} /><span>{daysLeft < 0 ? `${Math.abs(daysLeft)} days overdue` : `${daysLeft} days left`}</span></div>}
              </div>
              {project.tags?.length > 0 && <div className="flex flex-wrap gap-1.5 mt-3">{project.tags.map((t: string) => <span key={t} className="text-xs bg-blue-50 text-blue-600 border border-blue-100 px-2.5 py-0.5 rounded-lg font-medium">{t}</span>)}</div>}
              {project.is_delayed && <div className="mt-3 flex items-center gap-2 bg-red-50 border border-red-100 text-red-700 text-xs px-4 py-2.5 rounded-xl"><AlertTriangle size={13} className="shrink-0" /><span><strong>Delayed</strong>{project.delay_reason ? `: ${project.delay_reason}` : ''}</span></div>}
            </div>
          )}
        </div>
      </div>

      {/* ── Stat cards ── */}
      {!editMode && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Tasks Done" value={`${doneTasks} / ${totalTasks}`} icon={<CheckCircle2 size={18} className="text-emerald-600" />} iconBg="bg-emerald-50" sub="completed" />
          <StatCard label="Members" value={project.members?.length || 0} icon={<Users size={18} className="text-blue-600" />} iconBg="bg-blue-50" />
          <StatCard label="Teams" value={project.teams?.length || 0} icon={<Activity size={18} className="text-purple-600" />} iconBg="bg-purple-50" />
          <StatCard label={daysLeft !== null && daysLeft < 0 ? 'Days Overdue' : 'Days Left'} value={daysLeft !== null ? Math.abs(daysLeft) : '—'} icon={<Calendar size={18} className={daysLeft !== null && daysLeft < 0 ? 'text-red-500' : 'text-amber-600'} />} iconBg={daysLeft !== null && daysLeft < 0 ? 'bg-red-50' : 'bg-amber-50'} />
        </div>
      )}

      {/* ── Tabs ── */}
      {!editMode && (
        <>
          <div className="flex gap-1 border-b border-gray-200">
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-150 -mb-px whitespace-nowrap ${activeTab === tab.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{tab.icon}{tab.label}</button>
            ))}
          </div>

          {/* ── Overview ── */}
          {activeTab === 'overview' && (
            <div className="space-y-5 animate-fade-in">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-gray-800">Project Details</h3>
                  {project.pm && (<div><p className="text-xs text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Shield size={11} /> Project Manager</p><div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl"><div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${getGrad(project.pm.name)} flex items-center justify-center text-white font-bold text-sm`}>{project.pm.name[0]}</div><div><p className="text-sm font-semibold text-gray-800">{project.pm.name}</p><p className="text-xs text-gray-400">{project.pm.email}</p></div></div></div>)}
                  {project.teams?.length > 0 && (<div><p className="text-xs text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Users size={11} /> Teams</p><div className="flex flex-wrap gap-2">{project.teams.map((t: any) => <span key={t.id} className="flex items-center gap-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-100 px-3 py-1.5 rounded-xl font-medium"><div className={`w-4 h-4 rounded-md bg-gradient-to-br ${getGrad(t.name)} flex items-center justify-center text-white text-[9px] font-bold`}>{t.name[0]}</div>{t.name}{t.department ? ` · ${t.department}` : ''}</span>)}</div></div>)}
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                  <h3 className="text-sm font-semibold text-gray-800 mb-4">Task Breakdown</h3>
                  {totalTasks === 0 ? <p className="text-xs text-gray-400 py-8 text-center">No tasks yet</p> : (
                    <div className="space-y-2.5">{Object.entries((project.tasks || []).reduce((acc: any, t: any) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc }, {})).map(([status, count]) => (<div key={status} className="flex items-center gap-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-lg capitalize min-w-[80px] text-center ${TASK_STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>{status.replace('_', ' ')}</span><div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${(count as number / totalTasks) * 100}%` }} /></div><span className="text-xs font-semibold text-gray-700 min-w-[20px] text-right">{count as number}</span></div>))}</div>
                  )}
                </div>
              </div>
              {project.repo_url && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5"><GitCommitHorizontal size={12} /> Repository Overview</p>
                  <div className="flex items-center gap-3"><a href={project.repo_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium group"><GitBranch size={14} /><span className="truncate">{project.repo_url}</span><ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" /></a><button onClick={() => setActiveTab('repo')} className="text-xs text-gray-400 hover:text-blue-600 underline ml-auto">View commits →</button></div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'phases' && <PhaseTracker project={project} canManage={canManage} canToggleStage={canToggleStage} projectId={projectId} onUpdate={loadProject} />}
          {activeTab === 'members' && <MembersTab project={project} projectId={projectId} canManage={canManage} onMemberChange={loadProject} />}

          {/* ── Tasks ── */}
          {activeTab === 'tasks' && (
            <div className="animate-fade-in space-y-3">
              {totalTasks === 0 ? (<div className="flex flex-col items-center justify-center h-48 text-gray-400"><CheckCircle2 size={28} className="mb-2 text-gray-200" /><p className="text-sm">No tasks yet</p></div>) : (
                project.tasks.map((t: any, i: number) => (
                  <div key={t.id} className="flex items-center gap-3 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 hover:border-blue-100 transition-colors animate-fade-in-up" style={{ animationDelay: `${i * 0.03}s` }}>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-xl capitalize shrink-0 ${TASK_STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-600'}`}>{t.status?.replace('_', ' ')}</span>
                    <p className="flex-1 text-sm font-medium text-gray-800 truncate">{t.title}</p>
                    {t.priority && <span className={`text-xs px-2 py-0.5 rounded-lg capitalize shrink-0 ${PRIORITY_COLORS[t.priority] || ''}`}>{t.priority}</span>}
                    {t.assignees?.length > 0 && <div className="flex -space-x-1.5 shrink-0">{t.assignees.slice(0, 3).map((a: any) => <div key={a.id} title={a.name} className={`w-6 h-6 rounded-full bg-gradient-to-br ${getGrad(a.name)} border-2 border-white flex items-center justify-center text-white text-[8px] font-bold`}>{a.name?.[0]}</div>)}</div>}
                    {t.due_date && <span className="text-xs text-gray-400 shrink-0">{new Date(t.due_date).toLocaleDateString()}</span>}
                    {t.is_blocked && <span title="Blocked"><AlertTriangle size={13} className="text-red-400 shrink-0" /></span>}
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Repository ── */}
          {activeTab === 'repo' && (
            <div className="animate-fade-in space-y-5">
              {canManage && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5"><KeyRound size={13} className="text-amber-500" /> Private Repository Access Token</p>
                    <div className="flex items-center gap-2">{project.has_repo_token && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Token set</span>}{tokenSuccess && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1"><CheckCircle2 size={10} /> Updated!</span>}</div>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">{project.has_repo_token ? 'A token is stored for this repo. Enter a new token below to replace it.' : 'No token set. Required to fetch commits from private repositories.'}</p>
                  {showTokenInput ? (
                    <div className="space-y-2">
                      <div className="relative"><input type={showTokenInput ? 'text' : 'password'} value={tokenInput} onChange={e => setTokenInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveToken(); if (e.key === 'Escape') { setShowTokenInput(false); setTokenInput('') } }} placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" autoFocus className="w-full border border-amber-200 rounded-xl px-3 py-2.5 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-amber-50/30 font-mono" /><button type="button" onClick={() => setTokenInput('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-red-400"><X size={13} /></button></div>
                      {tokenError && <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={11} /> {tokenError}</p>}
                      <div className="flex gap-2"><button onClick={() => { setShowTokenInput(false); setTokenInput(''); setTokenError('') }} className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button><button onClick={saveToken} disabled={!tokenInput.trim() || tokenSaving} className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-xl hover:bg-amber-600 disabled:opacity-50 transition-colors">{tokenSaving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}{tokenSaving ? 'Saving…' : project.has_repo_token ? 'Update Token' : 'Save Token'}</button></div>
                    </div>
                  ) : <button onClick={() => setShowTokenInput(true)} className="flex items-center gap-1.5 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold rounded-xl hover:bg-amber-100 transition-colors"><KeyRound size={12} />{project.has_repo_token ? 'Change Access Token' : 'Add Access Token'}</button>}
                </div>
              )}
              {!project.repo_url ? (
                <div className="flex flex-col items-center justify-center h-48 text-gray-400"><GitBranch size={28} className="mb-2 text-gray-200" /><p className="text-sm">No repository linked</p>{canManage && <button onClick={openEdit} className="mt-2 text-xs text-blue-600 hover:underline">Add repository URL</button>}</div>
              ) : (
                <>
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-4 flex items-center gap-1.5"><Activity size={12} /> Contributor Activity</p>
                    {contribLoading ? <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 size={12} className="animate-spin" /> Loading…</div> : contribError ? <p className="text-xs text-amber-600">{contribError}</p> : contribStats.length === 0 ? <p className="text-xs text-gray-400">No contributor data available</p> : (
                      <div className="space-y-3">{contribStats.map((c: any) => { const max = Math.max(...contribStats.map((x: any) => x.commits), 1); return (<div key={c.author} className="flex items-center gap-3">{c.avatar_url ? <img src={c.avatar_url} alt={c.author} className="w-7 h-7 rounded-full shrink-0" /> : <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${getGrad(c.author)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>{c.author?.[0]}</div>}<div className="flex-1 min-w-0"><div className="flex items-center justify-between mb-1"><p className="text-xs font-medium text-gray-700 truncate">{c.author}</p><span className="text-xs text-gray-400 ml-2 shrink-0">{c.commits} commits</span></div><div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${(c.commits / max) * 100}%` }} /></div></div></div>) })}</div>
                    )}
                  </div>
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1.5"><GitCommitHorizontal size={12} /> Commits{commitsTotal > 0 && <span className="ml-1 bg-blue-100 text-blue-600 px-2 py-0.5 rounded-lg font-bold">{commitsTotal}</span>}</p>
                      <button onClick={fetchCommits} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"><RefreshCw size={12} className={commitsLoading ? 'animate-spin' : ''} /></button>
                    </div>
                    {commitsLoading ? <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 size={12} className="animate-spin" /> Loading commits…</div> : commitsError ? <p className="text-xs text-amber-600">{commitsError}</p> : commits.length === 0 ? <p className="text-xs text-gray-400">No commits found</p> : (
                      <div className="space-y-2">{commits.filter((c: any) => !commitFilter || c.author_email === commitFilter).slice(0, 15).map((c: any, i: number) => (<div key={c.sha || i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"><GitCommitHorizontal size={13} className="text-gray-400 mt-0.5 shrink-0" /><div className="flex-1 min-w-0"><p className="text-xs font-medium text-gray-800 truncate">{c.message}</p><p className="text-[10px] text-gray-400 mt-0.5">{c.author_name || c.author} · {c.date ? new Date(c.date).toLocaleDateString() : ''}{c.sha && <span className="ml-2 font-mono">{c.sha.slice(0, 7)}</span>}</p></div></div>))}</div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Tools ── */}
          {activeTab === 'tools' && (
            <div className="animate-fade-in space-y-3">
              {(!project.tools || project.tools.length === 0) ? (
                <div className="flex flex-col items-center justify-center h-48 text-gray-400"><Wrench size={28} className="mb-2 text-gray-200" /><p className="text-sm font-medium">No tools added to this project</p>{canManage && <p className="text-xs mt-1 text-gray-400">Edit the project and add tools from the "Tools & Integrations" section</p>}</div>
              ) : project.tools.map((tool: any) => <ToolDataPanel key={tool.id} tool={tool} projectId={projectId} canManage={canManage} />)}
            </div>
          )}

          {/* ── Links ── */}
          {activeTab === 'links' && (
            <div className="animate-fade-in space-y-3">
              {project.repo_url && <a href={project.repo_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors group"><div className="w-10 h-10 bg-gray-800 rounded-xl flex items-center justify-center shrink-0"><GitBranch size={18} className="text-white" /></div><div className="flex-1 min-w-0"><p className="text-sm font-semibold text-gray-800">Git Repository</p><p className="text-xs text-gray-400 truncate">{project.repo_url}</p></div><ExternalLink size={15} className="text-gray-300 group-hover:text-blue-500 shrink-0 transition-colors" /></a>}
              {project.figma_url && <a href={project.figma_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 hover:border-purple-200 hover:bg-purple-50/30 transition-colors group"><div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shrink-0"><Layout size={18} className="text-white" /></div><div className="flex-1 min-w-0"><p className="text-sm font-semibold text-gray-800">Figma Design</p><p className="text-xs text-gray-400 truncate">{project.figma_url}</p></div><ExternalLink size={15} className="text-gray-300 group-hover:text-purple-500 shrink-0 transition-colors" /></a>}
              {project.links?.filter((l: any) => l.url).map((l: any, idx: number) => <a key={idx} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors group"><div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center shrink-0"><Link2 size={18} className="text-white" /></div><div className="flex-1 min-w-0"><p className="text-sm font-semibold text-gray-800">{l.title || 'Link'}</p><p className="text-xs text-gray-400 truncate">{l.url}</p></div><ExternalLink size={15} className="text-gray-300 group-hover:text-blue-500 shrink-0 transition-colors" /></a>)}
              {project.tools?.filter((t: any) => t.url).map((t: any) => <a key={t.id} href={t.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors group"><span className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-xs shrink-0" style={{ backgroundColor: t.color || '#6264A7' }}>{(t.abbr || t.name || '?').slice(0, 2)}</span><div className="flex-1 min-w-0"><p className="text-sm font-semibold text-gray-800">{t.name}</p><p className="text-xs text-gray-400 truncate">{t.url}</p></div><ExternalLink size={15} className="text-gray-300 group-hover:text-indigo-500 shrink-0 transition-colors" /></a>)}
              {!project.repo_url && !project.figma_url && !project.links?.filter((l: any) => l.url)?.length && !project.tools?.filter((t: any) => t.url)?.length && <div className="flex flex-col items-center justify-center h-48 text-gray-400"><Link2 size={28} className="mb-2 text-gray-200" /><p className="text-sm">No links added yet</p></div>}
            </div>
          )}

          {/* ── Tracking Docs ── */}
          {activeTab === 'tracking' && canManage && <TrackingTab projectId={project.id} />}
        </>
      )}
    </div>
  )
}
