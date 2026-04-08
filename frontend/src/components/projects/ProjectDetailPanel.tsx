import React from 'react'
import ReactDOM from 'react-dom'
import {
  FolderOpen, X, AlertTriangle, CheckCircle2, Loader2,
  Pencil, Trash2, GitBranch, Users, Link2,
  BarChart2,
} from 'lucide-react'
import { ProjectDetailTabs } from './ProjectDetailTabs'
import { EditProjectForm } from './EditProjectForm'

interface ProjectDetailPanelProps {
  selectedProject: any
  setSelectedProject: (v: any) => void
  detailProject: any
  setDetailProject: (v: any) => void
  detailLoading: boolean
  activeDetailTab: string
  setActiveDetailTab: (v: string) => void
  projectMode: 'view' | 'edit' | 'confirm-delete'
  setProjectMode: (v: 'view' | 'edit' | 'confirm-delete') => void
  editProjectForm: any
  setEditProjectForm: (v: any) => void
  projectActionLoading: boolean
  setProjectActionLoading: (v: boolean) => void
  projectActionError: string
  setProjectActionError: (v: string) => void
  commits: any[]
  commitsTotal: number
  commitsLoading: boolean
  commitsError: string
  contributorStats: any[]
  contributorStatsLoading: boolean
  contributorStatsError: string
  commitEmailFilter: string
  commitDayFilter: string
  setCommitEmailFilter: (v: string) => void
  setCommitDayFilter: (v: string) => void
  canManageProject: (p: any) => boolean
  showEditToken: boolean
  setShowEditToken: (v: boolean | ((prev: boolean) => boolean)) => void
  editMemberSearch: string
  setEditMemberSearch: (v: string) => void
  showInlineTokenForm: boolean
  setShowInlineTokenForm: (v: boolean | ((prev: boolean) => boolean)) => void
  inlineToken: string
  setInlineToken: (v: string) => void
  showInlineTokenValue: boolean
  setShowInlineTokenValue: (v: boolean | ((prev: boolean) => boolean)) => void
  tokenSaving: boolean
  tokenSaveError: string
  setTokenSaveError: (v: string) => void
  handleUpdateToken: () => void
  handleEditSave: () => void
  handleDelete: () => void
}

export const ProjectDetailPanel: React.FC<ProjectDetailPanelProps> = ({
  selectedProject, setSelectedProject,
  detailProject, setDetailProject,
  detailLoading, activeDetailTab, setActiveDetailTab,
  projectMode, setProjectMode,
  editProjectForm, setEditProjectForm,
  projectActionLoading, setProjectActionLoading,
  projectActionError, setProjectActionError,
  commits, commitsTotal, commitsLoading, commitsError,
  contributorStats, contributorStatsLoading, contributorStatsError,
  commitEmailFilter, commitDayFilter, setCommitEmailFilter, setCommitDayFilter,
  canManageProject,
  showEditToken, setShowEditToken,
  editMemberSearch, setEditMemberSearch,
  showInlineTokenForm, setShowInlineTokenForm,
  inlineToken, setInlineToken,
  showInlineTokenValue, setShowInlineTokenValue,
  tokenSaving, tokenSaveError, setTokenSaveError,
  handleUpdateToken, handleEditSave, handleDelete,
}) => {
  if (!selectedProject) return null

  const closePanel = () => {
    setSelectedProject(null)
    setProjectMode('view')
    setProjectActionError('')
  }

  return ReactDOM.createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40 animate-fade-in" onClick={closePanel} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-3xl bg-white z-50 flex flex-col shadow-2xl animate-slide-in-right overflow-hidden">

        {/* Header */}
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
                <span className="text-xs px-2 py-0.5 rounded-lg font-medium bg-white/20 text-white">
                  {selectedProject.status.replace('_', ' ')}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-lg font-medium bg-white/20 text-white">
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
              <button onClick={closePanel} className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/15 transition-colors ml-1">
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
              <div className="h-full bg-white rounded-full transition-all duration-700" style={{ width: `${selectedProject.progress_percentage}%` }} />
            </div>
          </div>
        </div>

        {/* Tab bar */}
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {projectActionError && (
            <div className="flex items-center gap-2 bg-red-50 border-b border-red-100 text-red-700 text-xs px-6 py-2.5">
              <AlertTriangle size={12} className="shrink-0" />{projectActionError}
            </div>
          )}

          {projectMode === 'view' && (
            <ProjectDetailTabs
              selectedProject={selectedProject}
              detailProject={detailProject}
              detailLoading={detailLoading}
              activeDetailTab={activeDetailTab}
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
            />
          )}

          {projectMode === 'edit' && (
            <EditProjectForm
              editProjectForm={editProjectForm}
              setEditProjectForm={setEditProjectForm}
              projectActionLoading={projectActionLoading}
              projectActionError={projectActionError}
              setProjectActionError={setProjectActionError}
              showEditToken={showEditToken}
              setShowEditToken={setShowEditToken}
              editMemberSearch={editMemberSearch}
              setEditMemberSearch={setEditMemberSearch}
              setProjectMode={setProjectMode}
              handleEditSave={handleEditSave}
            />
          )}

          {/* CONFIRM CANCEL */}
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
                  onClick={handleDelete}
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
  )
}
