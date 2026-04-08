import React from 'react'
import { useSelector } from 'react-redux'
import {
  Plus, X, CheckCircle2, Loader2,
  Pencil, GitBranch, Link2, Layout, Shield,
} from 'lucide-react'
import { RootState } from '../../store'
import { ToolsPicker } from '../common/ToolsPicker'
import { UserPickerByRole } from '../common/UserPickerByRole'
import { EXEC_ROLES } from '../../constants/roles'

interface EditProjectFormProps {
  editProjectForm: any
  setEditProjectForm: (v: any) => void
  projectActionLoading: boolean
  projectActionError: string
  setProjectActionError: (v: string) => void
  showEditToken: boolean
  setShowEditToken: (v: boolean | ((prev: boolean) => boolean)) => void
  editMemberSearch: string
  setEditMemberSearch: (v: string) => void
  setProjectMode: (v: 'view' | 'edit' | 'confirm-delete') => void
  handleEditSave: () => void
}

export const EditProjectForm: React.FC<EditProjectFormProps> = ({
  editProjectForm, setEditProjectForm,
  projectActionLoading,
  setProjectActionError,
  showEditToken, setShowEditToken,
  editMemberSearch, setEditMemberSearch,
  setProjectMode, handleEditSave,
}) => {
  const { subordinates } = useSelector((s: RootState) => s.users)

  return (
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
          <button type="button" onClick={() => setShowEditToken((v: boolean) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 font-medium">{showEditToken ? 'Hide' : 'Show'}</button>
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
              .filter(u => [...EXEC_ROLES, 'pm'].includes(u.primary_role || ''))
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
          onClick={handleEditSave}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50"
        >
          {projectActionLoading ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
          {projectActionLoading ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
