import React, { useState, useMemo } from 'react'
import {
  FolderOpen, Plus, X, Users, Search, UserCheck,
  GitBranch, Layout, Link2, Loader2,
} from 'lucide-react'
import { Modal } from '../common/Modal'
import { ToolsPicker, ProjectTool } from '../common/ToolsPicker'
import { UserPickerByRole } from '../common/UserPickerByRole'

interface CreateProjectModalProps {
  show: boolean
  onClose: () => void
  form: any
  setForm: React.Dispatch<React.SetStateAction<any>>
  onSubmit: () => void
  creating: boolean
  error: string | null
  callerRole: string
  teams: any[]
  subordinates: any[]
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  show, onClose, form, setForm, onSubmit, creating, error, callerRole, teams, subordinates,
}) => {
  const [teamSearch, setTeamSearch] = useState('')
  const [isPrivateRepo, setIsPrivateRepo] = useState(false)
  const [showToken, setShowToken] = useState(false)

  const availableTeams = useMemo(() => {
    if (!teamSearch.trim()) return teams
    const q = teamSearch.toLowerCase()
    return teams.filter((t: any) =>
      t.name.toLowerCase().includes(q) ||
      t.department?.toLowerCase().includes(q)
    )
  }, [teams, teamSearch])

  const toggleTeam = (id: string) => {
    setForm((f: any) => ({
      ...f,
      team_ids: f.team_ids.includes(id)
        ? f.team_ids.filter((x: string) => x !== id)
        : [...f.team_ids, id],
    }))
  }

  const handleClose = () => {
    setTeamSearch('')
    setIsPrivateRepo(false)
    setShowToken(false)
    onClose()
  }

  if (!show) return null

  return (
    <Modal onClose={handleClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl animate-scale-in">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center">
              <FolderOpen size={15} className="text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-800">New Project</h2>
          </div>
          <button onClick={handleClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
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
                  setForm((f: any) => ({ ...f, repo_token: '' }))
                  setShowToken(false)
                }
              }}
              className="w-4 h-4 rounded accent-blue-600"
            />
            <span className="text-sm text-gray-700 font-medium">This is a private repository</span>
          </label>

          {/* Personal Access Token -- only shown for private repos */}
          {isPrivateRepo && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2">
              <div className="flex items-start gap-2">
                <GitBranch size={14} className="text-blue-500 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-800">Personal Access Token</p>
                  <p className="text-xs text-blue-500 mt-0.5">
                    Required to read commits from a private repo. Generate one at <strong>GitHub &rarr; Settings &rarr; Developer Settings &rarr; Personal Access Tokens</strong> with <code className="bg-blue-100 px-1 rounded">repo</code> scope.
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
                onClick={() => setForm((f: any) => ({ ...f, links: [...f.links, { title: '', url: '' }] }))}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                <Plus size={12} /> Add Link
              </button>
            </div>
            {form.links.length === 0 ? (
              <p className="text-xs text-gray-400">No additional links — click "Add Link" to add one.</p>
            ) : (
              <div className="space-y-2">
                {form.links.map((link: any, i: number) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={link.title}
                      onChange={e => setForm((f: any) => ({ ...f, links: f.links.map((l: any, j: number) => j === i ? { ...l, title: e.target.value } : l) }))}
                      placeholder="Title"
                      className="w-28 shrink-0 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                    />
                    <input
                      type="url"
                      value={link.url}
                      onChange={e => setForm((f: any) => ({ ...f, links: f.links.map((l: any, j: number) => j === i ? { ...l, url: e.target.value } : l) }))}
                      placeholder="https://…"
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                    />
                    <button
                      type="button"
                      onClick={() => setForm((f: any) => ({ ...f, links: f.links.filter((_: any, j: number) => j !== i) }))}
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
              onChange={(tools: ProjectTool[]) => setForm((f: any) => ({ ...f, tools }))}
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
                ) : availableTeams.map((t: any) => {
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
            onChange={(ids: string[]) => setForm((f: any) => ({ ...f, member_ids: ids }))}
            label="Team Members"
            maxHeight="max-h-52"
          />
        </div>
        <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={handleClose} className="px-5 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={!form.name || !form.due_date || !form.repo_url}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-all"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Create Project
          </button>
        </div>
      </div>
    </Modal>
  )
}
