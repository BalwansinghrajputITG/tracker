import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  FolderOpen, Plus, X, ArrowLeft, GitBranch, Layout, Link2,
  Users, Search, UserCheck, ChevronDown, ChevronRight,
  Loader2, AlertCircle, Tag, ListChecks, Calendar,
} from 'lucide-react'
import { RootState } from '../store'
import { createProjectRequest } from '../store/slices/projectsSlice'
import { fetchTeamsRequest } from '../store/slices/teamsSlice'
import { ToolsPicker, ProjectTool } from '../components/common/ToolsPicker'
import { navigate } from './AppLayout'
import { api } from '../utils/api'

// ─── phase constants ──────────────────────────────────────────────────────────

const PHASE_ORDER = ['planning', 'active', 'on_hold', 'completed', 'cancelled']
const PHASE_LABELS: Record<string, string> = {
  planning: 'Planning', active: 'Active', on_hold: 'On Hold',
  completed: 'Completed', cancelled: 'Cancelled',
}
const PHASE_COLORS: Record<string, { badge: string; dot: string }> = {
  planning:  { badge: 'bg-blue-100 text-blue-700 border-blue-200',    dot: 'bg-blue-500'   },
  active:    { badge: 'bg-green-100 text-green-700 border-green-200',  dot: 'bg-green-500'  },
  on_hold:   { badge: 'bg-amber-100 text-amber-700 border-amber-200',  dot: 'bg-amber-500'  },
  completed: { badge: 'bg-violet-100 text-violet-700 border-violet-200', dot: 'bg-violet-500' },
  cancelled: { badge: 'bg-red-100 text-red-700 border-red-200',        dot: 'bg-red-500'    },
}

interface PhaseStageInput { name: string; description: string; due_date: string }

// ─── constants ────────────────────────────────────────────────────────────────

const ROLE_ORDER = ['ceo', 'coo', 'pm', 'team_lead', 'employee']
const ROLE_LABELS: Record<string, string> = {
  ceo: 'CEO', coo: 'COO', pm: 'Project Managers',
  team_lead: 'Team Leads', employee: 'Employees',
}
const ROLE_COLORS: Record<string, { bg: string; text: string; dot: string; badge: string }> = {
  ceo:       { bg: 'bg-yellow-50',  text: 'text-yellow-700',  dot: 'bg-yellow-400',  badge: 'bg-yellow-100 text-yellow-700'  },
  coo:       { bg: 'bg-orange-50',  text: 'text-orange-700',  dot: 'bg-orange-400',  badge: 'bg-orange-100 text-orange-700'  },
  pm:        { bg: 'bg-indigo-50',  text: 'text-indigo-700',  dot: 'bg-indigo-400',  badge: 'bg-indigo-100 text-indigo-700'  },
  team_lead: { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-400',    badge: 'bg-blue-100 text-blue-700'      },
  employee:  { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400', badge: 'bg-emerald-100 text-emerald-700'},
}
const AVATAR_GRADIENTS = [
  'from-blue-400 to-indigo-500', 'from-purple-400 to-pink-500',
  'from-emerald-400 to-teal-500', 'from-orange-400 to-red-500',
  'from-cyan-400 to-blue-500', 'from-rose-400 to-pink-500',
]
const getGradient = (name: string) =>
  AVATAR_GRADIENTS[(name || 'A').charCodeAt(0) % AVATAR_GRADIENTS.length]

const emptyForm = {
  name: '', description: '', priority: 'medium',
  repo_url: '', repo_token: '', figma_url: '',
  start_date: new Date().toISOString().split('T')[0],
  due_date: '', team_ids: [] as string[], member_ids: [] as string[],
  tags: [] as string[], links: [] as { title: string; url: string }[],
  tools: [] as ProjectTool[],
  initial_phase_stages: {} as Record<string, PhaseStageInput[]>,
}

const PAGE_SIZE = 20

// ─── member picker ─────────────────────────────────────────────────────────────

interface PickerUser {
  id: string; full_name: string; primary_role?: string; department?: string; email?: string
}

const MemberPanel: React.FC<{
  selected: string[]
  onChange: (ids: string[]) => void
}> = ({ selected, onChange }) => {
  const [search, setSearch]       = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [page, setPage]           = useState(1)
  const [users, setUsers]         = useState<PickerUser[]>([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const load = useCallback(async (p: number, q: string, role: string) => {
    setLoading(true)
    try {
      const params: any = { page: p, limit: PAGE_SIZE }
      if (q.trim()) params.search = q.trim()
      if (role) params.role = role
      const res = await api.get('/users/for-project', { params })
      setUsers(res.data.users)
      setTotal(res.data.total)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load(1, search, roleFilter) }, 300)
    return () => clearTimeout(t)
  }, [search, roleFilter, load])

  useEffect(() => { load(page, search, roleFilter) }, [page])

  // Group current page by role
  const groups = useMemo(() => {
    const map: Record<string, PickerUser[]> = {}
    for (const u of users) {
      const r = u.primary_role || 'employee'
      if (!map[r]) map[r] = []
      map[r].push(u)
    }
    return ROLE_ORDER
      .filter(r => map[r]?.length)
      .map(r => ({ role: r, users: map[r] }))
      .concat(
        Object.keys(map)
          .filter(r => !ROLE_ORDER.includes(r))
          .map(r => ({ role: r, users: map[r] }))
      )
  }, [users])

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])

  const selectGroup = (ids: string[]) => {
    const merged = selected.concat(ids.filter(id => !selected.includes(id)))
    onChange(merged)
  }
  const clearGroup = (ids: string[]) => onChange(selected.filter(id => !ids.includes(id)))

  return (
    <div className="flex flex-col h-full">
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="mb-3 p-2.5 bg-blue-50 border border-blue-100 rounded-xl flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
          {users
            .filter(u => selected.includes(u.id))
            .map(u => (
              <span key={u.id} className="flex items-center gap-1.5 bg-white border border-blue-200 text-blue-700 text-xs px-2 py-0.5 rounded-lg font-medium">
                <span className={`w-4 h-4 bg-gradient-to-br ${getGradient(u.full_name)} rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0`}>
                  {u.full_name[0]}
                </span>
                {u.full_name.split(' ')[0]}
                <button type="button" onClick={() => toggle(u.id)} className="text-blue-300 hover:text-red-500 ml-0.5">
                  <X size={10} />
                </button>
              </span>
            ))}
          {/* show count for off-page selected users */}
          {selected.filter(id => !users.find(u => u.id === id)).length > 0 && (
            <span className="text-xs text-blue-500 self-center ml-1">
              +{selected.filter(id => !users.find(u => u.id === id)).length} more
            </span>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-2">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, department…"
            className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
          />
        </div>
        <select
          value={roleFilter}
          onChange={e => { setRoleFilter(e.target.value); setPage(1) }}
          className="border border-gray-200 rounded-xl px-2 py-2 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
        >
          <option value="">All roles</option>
          {ROLE_ORDER.map(r => (
            <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
          ))}
        </select>
      </div>

      {/* Grouped list */}
      <div className="flex-1 overflow-y-auto border border-gray-200 rounded-xl bg-white min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-gray-400">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-xs">Loading users…</span>
          </div>
        ) : groups.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-8">No users found</p>
        ) : (
          groups.map(({ role, users: gUsers }) => {
            const c = ROLE_COLORS[role] || { bg: 'bg-gray-50', text: 'text-gray-600', dot: 'bg-gray-400', badge: '' }
            const isCollapsed = collapsed[role]
            const gIds = gUsers.map(u => u.id)
            const allChecked = gIds.every(id => selected.includes(id))

            return (
              <div key={role}>
                {/* Category header */}
                <div className={`flex items-center gap-2 px-3 py-1.5 ${c.bg} border-b border-gray-100 sticky top-0 z-10`}>
                  <button type="button" onClick={() => setCollapsed(prev => ({ ...prev, [role]: !prev[role] }))} className="flex items-center gap-1.5 flex-1 min-w-0">
                    {isCollapsed ? <ChevronRight size={11} className={c.text} /> : <ChevronDown size={11} className={c.text} />}
                    <span className={`w-2 h-2 rounded-full ${c.dot} shrink-0`} />
                    <span className={`text-xs font-semibold ${c.text}`}>
                      {ROLE_LABELS[role] || role.replace('_', ' ')}
                    </span>
                    <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${c.badge}`}>
                      {gUsers.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => allChecked ? clearGroup(gIds) : selectGroup(gIds)}
                    className={`text-[10px] font-medium shrink-0 ${c.text} hover:underline`}
                  >
                    {allChecked ? 'Deselect all' : 'Select all'}
                  </button>
                </div>

                {!isCollapsed && gUsers.map(u => {
                  const checked = selected.includes(u.id)
                  return (
                    <label
                      key={u.id}
                      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b border-gray-50 transition-colors ${
                        checked ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(u.id)}
                        className="rounded accent-blue-600 shrink-0"
                      />
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0 bg-gradient-to-br ${
                        checked ? getGradient(u.full_name) : 'from-gray-300 to-gray-400'
                      }`}>
                        {u.full_name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{u.full_name}</p>
                        <p className="text-xs text-gray-400 truncate">{u.department || '—'} · {u.email}</p>
                      </div>
                      {checked && <UserCheck size={13} className="text-blue-500 shrink-0" />}
                    </label>
                  )
                })}
              </div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
          <span className="text-xs text-gray-400">{total} total users</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 py-1 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
            >
              Prev
            </button>
            <span className="text-xs text-gray-500 px-2">{page} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2 py-1 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── main page ─────────────────────────────────────────────────────────────────

export const CreateProjectPage: React.FC = () => {
  const dispatch = useDispatch()
  const { isLoading, error } = useSelector((s: RootState) => s.projects)
  const { items: teams } = useSelector((s: RootState) => s.teams)

  const [form, setForm]           = useState(emptyForm)
  const [isPrivateRepo, setIsPrivateRepo] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [tagInput, setTagInput]   = useState('')
  const [teamSearch, setTeamSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [rightTab, setRightTab]   = useState<'members' | 'phases'>('members')
  const [selectedPhase, setSelectedPhase] = useState('planning')
  const [newStageName, setNewStageName]   = useState('')
  const [newStageDesc, setNewStageDesc]   = useState('')
  const [newStageDue, setNewStageDue]     = useState('')

  useEffect(() => {
    dispatch(fetchTeamsRequest({ page: 1, limit: 100 }))
  }, [dispatch])

  const availableTeams = useMemo(() => {
    if (!teamSearch.trim()) return teams
    const q = teamSearch.toLowerCase()
    return teams.filter(t => t.name.toLowerCase().includes(q) || (t.department || '').toLowerCase().includes(q))
  }, [teams, teamSearch])

  const handleSubmit = async () => {
    if (!form.name || !form.due_date || !form.repo_url) return
    setSubmitting(true)
    setSubmitError('')
    try {
      await api.post('/projects', form)
      navigate('/projects')
    } catch (err: any) {
      const d = err?.response?.data?.detail
      setSubmitError(typeof d === 'string' ? d : Array.isArray(d) ? d.map((e: any) => e.msg).join(' · ') : 'Failed to create project')
      setSubmitting(false)
    }
  }

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !form.tags.includes(t)) setForm(f => ({ ...f, tags: [...f.tags, t] }))
    setTagInput('')
  }

  const addPhaseStage = () => {
    const name = newStageName.trim()
    if (!name) return
    const stage: PhaseStageInput = { name, description: newStageDesc.trim(), due_date: newStageDue }
    setForm(f => ({
      ...f,
      initial_phase_stages: {
        ...f.initial_phase_stages,
        [selectedPhase]: [...(f.initial_phase_stages[selectedPhase] || []), stage],
      },
    }))
    setNewStageName('')
    setNewStageDesc('')
    setNewStageDue('')
  }

  const removePhaseStage = (phase: string, idx: number) => {
    setForm(f => ({
      ...f,
      initial_phase_stages: {
        ...f.initial_phase_stages,
        [phase]: (f.initial_phase_stages[phase] || []).filter((_, i) => i !== idx),
      },
    }))
  }

  const totalPhaseStages = Object.values(form.initial_phase_stages).reduce((acc, arr) => acc + arr.length, 0)

  return (
    <div className="min-h-full bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate('/projects')}
          className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center">
            <FolderOpen size={15} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900">New Project</h1>
            <p className="text-xs text-gray-400">Fill in details and assign team members</p>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-0 h-[calc(100vh-8.5rem)]">

        {/* ── Left: project details ── */}
        <div className="w-[45%] border-r border-gray-200 overflow-y-auto bg-white">
          <div className="p-6 space-y-5">

            {submitError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-700 text-sm px-3 py-2.5 rounded-xl">
                <AlertCircle size={14} className="shrink-0" />
                {submitError}
              </div>
            )}

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Website Redesign"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief description of the project…"
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all resize-none"
              />
            </div>

            {/* Priority + Due Date */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select
                  value={form.priority}
                  onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
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
                  onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                />
              </div>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
              />
            </div>

            {/* Git Repo URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                <GitBranch size={14} className="text-gray-500" /> Git Repository URL *
              </label>
              <input
                type="url"
                value={form.repo_url}
                onChange={e => setForm(f => ({ ...f, repo_url: e.target.value }))}
                placeholder="https://github.com/org/repo"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all"
              />
              <p className="text-xs text-gray-400 mt-1">GitHub or GitLab URL required to track commits</p>
            </div>

            {/* Private repo toggle */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isPrivateRepo}
                onChange={e => { setIsPrivateRepo(e.target.checked); if (!e.target.checked) setForm(f => ({ ...f, repo_token: '' })) }}
                className="w-4 h-4 rounded accent-blue-600"
              />
              <span className="text-sm text-gray-700 font-medium">This is a private repository</span>
            </label>

            {isPrivateRepo && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2">
                <p className="text-sm font-medium text-blue-800">Personal Access Token</p>
                <p className="text-xs text-blue-500">Required for private repos. Generate at GitHub → Settings → Developer Settings → Personal Access Tokens with <code className="bg-blue-100 px-1 rounded">repo</code> scope.</p>
                <div className="relative">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={form.repo_token}
                    onChange={e => setForm(f => ({ ...f, repo_token: e.target.value }))}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    className="w-full border border-blue-200 rounded-xl px-3 py-2.5 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-mono"
                  />
                  <button type="button" onClick={() => setShowToken(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-blue-400 hover:text-blue-600 font-medium">
                    {showToken ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
            )}

            {/* Figma URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                <Layout size={14} className="text-purple-500" /> Figma Design URL
              </label>
              <input
                type="url"
                value={form.figma_url}
                onChange={e => setForm(f => ({ ...f, figma_url: e.target.value }))}
                placeholder="https://www.figma.com/file/…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50 focus:bg-white transition-all"
              />
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                <Tag size={14} className="text-gray-500" /> Tags
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                  placeholder="Add tag…"
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                />
                <button type="button" onClick={addTag} className="px-3 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm hover:bg-gray-200 transition-colors">Add</button>
              </div>
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {form.tags.map(t => (
                    <span key={t} className="flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-lg font-medium">
                      {t}
                      <button type="button" onClick={() => setForm(f => ({ ...f, tags: f.tags.filter(x => x !== t) }))} className="text-blue-400 hover:text-red-500">
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Additional Links */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <Link2 size={14} className="text-gray-500" /> Additional Links
                </label>
                <button type="button" onClick={() => setForm(f => ({ ...f, links: [...f.links, { title: '', url: '' }] }))} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                  <Plus size={12} /> Add Link
                </button>
              </div>
              {form.links.length === 0 ? (
                <p className="text-xs text-gray-400">No links — click "Add Link" to add one.</p>
              ) : (
                <div className="space-y-2">
                  {form.links.map((link, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={link.title}
                        onChange={e => setForm(f => ({ ...f, links: f.links.map((l, j) => j === i ? { ...l, title: e.target.value } : l) }))}
                        placeholder="Title"
                        className="w-24 shrink-0 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                      />
                      <input
                        type="url"
                        value={link.url}
                        onChange={e => setForm(f => ({ ...f, links: f.links.map((l, j) => j === i ? { ...l, url: e.target.value } : l) }))}
                        placeholder="https://…"
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                      />
                      <button type="button" onClick={() => setForm(f => ({ ...f, links: f.links.filter((_, j) => j !== i) }))} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 shrink-0">
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tools */}
            <ToolsPicker value={form.tools} onChange={tools => setForm(f => ({ ...f, tools }))} />
          </div>
        </div>

        {/* ── Right: tabs (Members | Phases) ── */}
        <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">

          {/* Tab bar */}
          <div className="shrink-0 border-b border-gray-200 bg-white px-6 flex gap-1 pt-3">
            <button
              onClick={() => setRightTab('members')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${rightTab === 'members' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              <Users size={13} /> Members
              {form.member_ids.length > 0 && (
                <span className="ml-1 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">{form.member_ids.length}</span>
              )}
            </button>
            <button
              onClick={() => setRightTab('phases')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${rightTab === 'phases' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              <ListChecks size={13} /> Phases
              {totalPhaseStages > 0 && (
                <span className="ml-1 text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-semibold">{totalPhaseStages}</span>
              )}
            </button>
          </div>

          {rightTab === 'members' ? (
            <div className="flex-1 overflow-hidden flex flex-col p-6 gap-5 min-h-0">

              {/* Teams */}
              {teams.length > 0 && (
                <div className="shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                      <Users size={14} className="text-indigo-500" /> Teams
                    </label>
                    {form.team_ids.length > 0 && (
                      <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">
                        {form.team_ids.length} selected
                      </span>
                    )}
                  </div>
                  <div className="relative mb-1.5">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={teamSearch}
                      onChange={e => setTeamSearch(e.target.value)}
                      placeholder="Search teams…"
                      className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                  </div>
                  <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100 bg-white">
                    {availableTeams.length === 0 ? (
                      <p className="text-center text-xs text-gray-400 py-3">No teams found</p>
                    ) : availableTeams.map(t => {
                      const checked = form.team_ids.includes(t.id)
                      return (
                        <label key={t.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${checked ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                          <input type="checkbox" checked={checked} onChange={() => setForm(f => ({ ...f, team_ids: checked ? f.team_ids.filter(x => x !== t.id) : [...f.team_ids, t.id] }))} className="rounded accent-indigo-600 shrink-0" />
                          <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0 bg-gradient-to-br ${checked ? 'from-indigo-500 to-purple-600' : 'from-gray-300 to-gray-400'}`}>
                            {t.name[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{t.name}</p>
                            {t.department && <p className="text-xs text-gray-400 truncate">{t.department}</p>}
                          </div>
                          {checked && <UserCheck size={13} className="text-indigo-500 shrink-0" />}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Members — paginated, all users */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-2 shrink-0">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                    <Users size={14} className="text-blue-500" /> Team Members
                    <span className="text-xs text-gray-400 font-normal">— all company users</span>
                  </label>
                  {form.member_ids.length > 0 && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
                      {form.member_ids.length} selected
                    </span>
                  )}
                </div>
                <MemberPanel
                  selected={form.member_ids}
                  onChange={ids => setForm(f => ({ ...f, member_ids: ids }))}
                />
              </div>
            </div>
          ) : (
            /* ── Phases tab ── */
            <div className="flex-1 overflow-hidden flex flex-col p-6 gap-4 min-h-0">
              <p className="text-xs text-gray-400 shrink-0">
                Pre-configure stages for each phase. You can also add stages later from the project detail page.
              </p>

              {/* Phase selector */}
              <div className="flex flex-wrap gap-1.5 shrink-0">
                {PHASE_ORDER.map(ph => {
                  const c = PHASE_COLORS[ph]
                  const count = (form.initial_phase_stages[ph] || []).length
                  const active = selectedPhase === ph
                  return (
                    <button
                      key={ph}
                      type="button"
                      onClick={() => setSelectedPhase(ph)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${active ? c.badge + ' ring-2 ring-offset-1 ' + c.dot.replace('bg-', 'ring-') : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${c.dot} shrink-0`} />
                      {PHASE_LABELS[ph]}
                      {count > 0 && <span className="ml-0.5 bg-white/70 text-current px-1 rounded-md">{count}</span>}
                    </button>
                  )
                })}
              </div>

              {/* Stage list for selected phase */}
              <div className="flex-1 overflow-y-auto min-h-0 space-y-2">
                {(form.initial_phase_stages[selectedPhase] || []).length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-6">No stages yet — add one below</p>
                ) : (
                  (form.initial_phase_stages[selectedPhase] || []).map((s, i) => {
                    const c = PHASE_COLORS[selectedPhase]
                    const overdue = s.due_date && new Date(s.due_date) < new Date()
                    return (
                      <div key={i} className="flex items-start gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 group">
                        <span className={`w-5 h-5 rounded-md ${c.dot} flex items-center justify-center text-white text-[10px] font-bold mt-0.5 shrink-0`}>{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                          {s.description && <p className="text-xs text-gray-400 mt-0.5">{s.description}</p>}
                          {s.due_date && (
                            <p className={`text-[10px] mt-1 font-medium flex items-center gap-1 ${overdue ? 'text-red-400' : 'text-gray-400'}`}>
                              <Calendar size={10} /> Due {new Date(s.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removePhaseStage(selectedPhase, i)}
                          className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Add stage form */}
              <div className="shrink-0 bg-white border border-gray-200 rounded-xl p-4 space-y-2.5">
                <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                  <Plus size={12} className="text-indigo-500" /> Add stage to <span className="capitalize text-indigo-600">{PHASE_LABELS[selectedPhase]}</span>
                </p>
                <input
                  value={newStageName}
                  onChange={e => setNewStageName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPhaseStage() } }}
                  placeholder="Stage name…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 focus:bg-white"
                />
                <input
                  value={newStageDesc}
                  onChange={e => setNewStageDesc(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 focus:bg-white"
                />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 font-medium shrink-0 flex items-center gap-1"><Calendar size={11} /> Due Date</label>
                  <input
                    type="date"
                    value={newStageDue}
                    onChange={e => setNewStageDue(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 focus:bg-white"
                  />
                  {newStageDue && (
                    <button type="button" onClick={() => setNewStageDue('')} className="text-gray-300 hover:text-red-400">
                      <X size={13} />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={addPhaseStage}
                  disabled={!newStageName.trim()}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                >
                  <Plus size={13} /> Add Stage
                </button>
              </div>
            </div>
          )}

          {/* Action bar */}
          <div className="shrink-0 px-6 py-4 bg-white border-t border-gray-100 flex items-center justify-between gap-4">
            <div className="text-xs text-gray-400">
              {form.member_ids.length} member{form.member_ids.length !== 1 ? 's' : ''} selected
              {form.team_ids.length > 0 && ` · ${form.team_ids.length} team${form.team_ids.length !== 1 ? 's' : ''}`}
              {totalPhaseStages > 0 && ` · ${totalPhaseStages} stage${totalPhaseStages !== 1 ? 's' : ''}`}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/projects')}
                className="px-5 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!form.name || !form.due_date || !form.repo_url || submitting}
                className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm hover:shadow-blue-200 hover:shadow-md"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {submitting ? 'Creating…' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
