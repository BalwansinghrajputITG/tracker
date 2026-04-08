import React, { useEffect, useState, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  FileText, Plus, X, Loader2, Trash2, Save,
  Pin, PinOff, Link2, ExternalLink, FileSpreadsheet,
  CheckCircle2, AlertCircle, History, LayoutTemplate,
  FileBadge, Search, Send, GitCommit, ChevronRight,
  Pencil, ArrowLeft,
} from 'lucide-react'
import { RootState } from '../store'
import { fetchSheetsRequest } from '../store/slices/sheetsSlice'
import { fetchProjectsRequest } from '../store/slices/projectsSlice'
import { api } from '../utils/api'
import { ANALYTICS_ROLES } from '../constants/roles'
import { useToast } from '../components/shared'
import { Modal } from '../components/common/Modal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocumentLink {
  id: string
  name: string
  url: string
  sheet_type: string
  description: string
  creator_name?: string
  created_by: string
  created_at: string
  updated_at: string
  is_pinned: boolean
  entry_count: number
  project_name?: string
}

interface ChangeNote {
  id: string
  data: { note: string; [k: string]: any }
  creator_name?: string
  created_by: string
  created_at: string
  updated_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DOC_TYPES = [
  {
    key: 'docs',
    label: 'Google Docs',
    bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200',
    bar: 'bg-blue-500',
    icon: <FileText className="w-5 h-5" />,
  },
  {
    key: 'sheets',
    label: 'Google Sheets',
    bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200',
    bar: 'bg-emerald-500',
    icon: <FileSpreadsheet className="w-5 h-5" />,
  },
  {
    key: 'slides',
    label: 'Slides / PPT',
    bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200',
    bar: 'bg-orange-500',
    icon: <LayoutTemplate className="w-5 h-5" />,
  },
  {
    key: 'pdf',
    label: 'PDF',
    bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200',
    bar: 'bg-red-500',
    icon: <FileBadge className="w-5 h-5" />,
  },
  {
    key: 'other',
    label: 'Other',
    bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200',
    bar: 'bg-gray-400',
    icon: <Link2 className="w-5 h-5" />,
  },
]

function getDocType(key: string) {
  return DOC_TYPES.find(t => t.key === key) || DOC_TYPES[DOC_TYPES.length - 1]
}

function guessDocType(url: string): string {
  if (!url) return 'other'
  if (url.includes('docs.google.com/document')) return 'docs'
  if (url.includes('docs.google.com/spreadsheets')) return 'sheets'
  if (url.includes('docs.google.com/presentation')) return 'slides'
  if (/\.(pdf)$/i.test(url)) return 'pdf'
  if (/\.(ppt|pptx)$/i.test(url) || url.includes('powerpoint') || url.includes('slides')) return 'slides'
  if (/\.(xlsx|csv|xls)$/i.test(url) || url.includes('sheet')) return 'sheets'
  return 'other'
}

function shortUrl(url: string) {
  try {
    const u = new URL(url)
    const path = u.pathname.length > 1 ? u.pathname.slice(0, 22) : ''
    return u.hostname.replace('www.', '') + (path ? path + (u.pathname.length > 22 ? '…' : '') : '')
  } catch {
    return url.slice(0, 40)
  }
}

function timeAgo(iso: string) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── Add Document Modal ───────────────────────────────────────────────────────

interface AddDocModalProps {
  projects: { id: string; name: string }[]
  onClose: () => void
  onCreated: () => void
}

function AddDocModal({ projects, onClose, onCreated }: AddDocModalProps) {
  const [form, setForm] = useState({ name: '', url: '', sheet_type: 'docs', description: '', project_id: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleUrlChange = (url: string) => {
    setForm(f => ({ ...f, url, sheet_type: guessDocType(url) }))
  }

  const handleSubmit = async () => {
    setError('')
    if (!form.name.trim()) { setError('Name is required'); return }
    if (!form.url.trim()) { setError('URL is required'); return }
    setSaving(true)
    try {
      await api.post('/sheets', {
        name: form.name.trim(),
        url: form.url.trim(),
        sheet_type: form.sheet_type,
        description: form.description.trim(),
        project_id: form.project_id || undefined,
      })
      onCreated()
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to add document')
    } finally {
      setSaving(false)
    }
  }

  const docType = getDocType(form.sheet_type)

  return (
    <Modal onClose={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-scale-in flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-xl ${docType.bg} ${docType.text} flex items-center justify-center shrink-0`}>
              {docType.icon}
            </div>
            <h3 className="text-base font-semibold text-gray-900">Add Document</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}

          {/* URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Document URL <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={form.url}
              onChange={e => handleUrlChange(e.target.value)}
              placeholder="https://docs.google.com/..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
            />
            {form.url && (
              <p className="text-xs text-blue-600 mt-1">
                Detected: <span className="font-semibold">{getDocType(form.sheet_type).label}</span>
              </p>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Q2 Strategy Deck"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
            />
          </div>

          {/* Type selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Document Type</label>
            <div className="flex gap-2 flex-wrap">
              {DOC_TYPES.map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, sheet_type: t.key }))}
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-medium border transition-all ${
                    form.sheet_type === t.key
                      ? `${t.border} ${t.bg} ${t.text}`
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <span className={form.sheet_type === t.key ? t.text : 'text-gray-400'}>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="What is this document about?"
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 resize-none"
            />
          </div>

          {/* Project */}
          {projects.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Link to Project <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <select
                value={form.project_id}
                onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
              >
                <option value="">No project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={saving || !form.name.trim() || !form.url.trim()}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-all"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Document
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Document Card ────────────────────────────────────────────────────────────

interface DocCardProps {
  doc: DocumentLink
  onOpen: () => void
  onPin: () => void
  onDelete: () => void
  onEdit: () => void
  canManage: boolean
}

function DocCard({ doc, onOpen, onPin, onDelete, onEdit, canManage }: DocCardProps) {
  const type = getDocType(doc.sheet_type)

  return (
    <div
      className={`group relative bg-white rounded-2xl border ${doc.is_pinned ? 'border-indigo-200 shadow-md' : 'border-gray-100 shadow-sm'} hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 flex flex-col overflow-hidden cursor-pointer`}
      onClick={onOpen}
    >
      {/* Top colour bar */}
      <div className={`h-1.5 w-full ${type.bar}`} />

      {/* Card body */}
      <div className="p-4 flex-1 flex flex-col gap-3">
        {/* Icon + actions */}
        <div className="flex items-start justify-between">
          <div className={`w-10 h-10 rounded-xl ${type.bg} ${type.text} flex items-center justify-center shrink-0`}>
            {type.icon}
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
            {canManage && (
              <button onClick={onEdit} title="Edit" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {canManage && (
              <button onClick={onPin} title={doc.is_pinned ? 'Unpin' : 'Pin'} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors">
                {doc.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
              </button>
            )}
            {canManage && (
              <button onClick={onDelete} title="Delete" className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Name + description */}
        <div>
          <div className="flex items-center gap-1.5">
            {doc.is_pinned && <Pin className="w-3 h-3 text-indigo-500 shrink-0" />}
            <h3 className="text-sm font-bold text-gray-900 leading-snug line-clamp-2">{doc.name}</h3>
          </div>
          {doc.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{doc.description}</p>}
        </div>

        {/* URL chip */}
        {doc.url && (
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-indigo-600 transition-colors truncate group/link"
          >
            <Link2 className="w-3 h-3 shrink-0" />
            <span className="truncate">{shortUrl(doc.url)}</span>
            <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-0 group-hover/link:opacity-100" />
          </a>
        )}

        {/* Badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${type.bg} ${type.text} ${type.border}`}>
            {type.label}
          </span>
          {doc.project_name && (
            <span className="flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full bg-gray-50 border border-gray-200 text-gray-600">
              <ChevronRight className="w-2.5 h-2.5" />{doc.project_name}
            </span>
          )}
        </div>

        {/* Footer */}
        <div className="mt-auto pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
          <span className="flex items-center gap-1 font-medium text-gray-600">
            <GitCommit className="w-3 h-3" />
            {doc.entry_count} {doc.entry_count === 1 ? 'change' : 'changes'}
          </span>
          <span>{timeAgo(doc.updated_at)}</span>
        </div>
      </div>

      {/* Action bar */}
      <div className="px-4 py-3 border-t border-gray-100 grid grid-cols-2 gap-2" onClick={e => e.stopPropagation()}>
        <a
          href={doc.url || '#'}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => { if (!doc.url) e.preventDefault() }}
          className="flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Open
        </a>
        <button
          onClick={onOpen}
          className="flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
        >
          <History className="w-3.5 h-3.5" /> Changes
        </button>
      </div>
    </div>
  )
}

// ─── Document Detail View ────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-amber-500', 'bg-indigo-500',
]

function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
}

function groupNotesByDate(notes: ChangeNote[]) {
  const groups: { label: string; notes: ChangeNote[] }[] = []
  const map: Record<string, ChangeNote[]> = {}
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)

  for (const note of [...notes].reverse()) {
    const d = new Date(note.created_at)
    const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    let label: string
    if (dDay.getTime() === today.getTime()) label = 'Today'
    else if (dDay.getTime() === yesterday.getTime()) label = 'Yesterday'
    else label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

    if (!map[label]) { map[label] = []; groups.push({ label, notes: map[label] }) }
    map[label].push(note)
  }
  return groups
}

interface DocumentDetailViewProps {
  doc: DocumentLink
  notes: ChangeNote[]
  loading: boolean
  currentUserId: string
  canManage: boolean
  onBack: () => void
  onAddNote: (note: string) => Promise<void>
  onDeleteNote: (noteId: string) => Promise<void>
  onEdit: () => void
  onPin: () => void
  onDelete: () => void
}

function DocumentDetailView({
  doc, notes, loading, currentUserId, canManage,
  onBack, onAddNote, onDeleteNote, onEdit, onPin, onDelete,
}: DocumentDetailViewProps) {
  const [noteText, setNoteText] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const type = getDocType(doc.sheet_type)
  const groups = groupNotesByDate(notes)

  const handleAdd = async () => {
    if (!noteText.trim()) return
    setSaving(true)
    await onAddNote(noteText.trim())
    setNoteText('')
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    await onDeleteNote(id)
    setDeletingId(null)
  }

  return (
    <div className="flex flex-col h-full animate-fade-in-up">
      {/* Breadcrumb */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium mb-5 self-start transition-colors group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        Back to Documents
      </button>

      {/* Hero Card */}
      <div className={`rounded-2xl border ${doc.is_pinned ? 'border-indigo-200' : 'border-gray-100'} bg-white shadow-sm overflow-hidden mb-5 shrink-0`}>
        <div className={`h-1.5 w-full ${type.bar}`} />
        <div className="px-6 py-5">
          <div className="flex items-start gap-4">
            {/* Type icon */}
            <div className={`w-14 h-14 rounded-2xl ${type.bg} ${type.text} flex items-center justify-center shrink-0 shadow-inner`}>
              <span className="scale-[1.4]">{type.icon}</span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {/* Badges row */}
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${type.bg} ${type.text} ${type.border}`}>
                      {type.label}
                    </span>
                    {doc.project_name && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                        {doc.project_name}
                      </span>
                    )}
                    {doc.is_pinned && (
                      <span className="flex items-center gap-1 text-xs text-indigo-600 font-medium">
                        <Pin className="w-3 h-3" /> Pinned
                      </span>
                    )}
                  </div>
                  <h1 className="text-xl font-black text-gray-900 leading-tight truncate">{doc.name}</h1>
                  {doc.description && (
                    <p className="text-sm text-gray-500 mt-1 leading-relaxed">{doc.description}</p>
                  )}
                </div>

                {/* Action buttons */}
                {canManage && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={onEdit}
                      title="Edit"
                      className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={onPin}
                      title={doc.is_pinned ? 'Unpin' : 'Pin'}
                      className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors"
                    >
                      {doc.is_pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={onDelete}
                      title="Delete"
                      className="p-2 rounded-xl hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Stats + Open button */}
              <div className="flex items-center gap-4 mt-3 flex-wrap">
                {doc.url && (
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Open Document
                  </a>
                )}
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <GitCommit className="w-3.5 h-3.5 text-gray-400" />
                  <span className="font-bold text-gray-800">{notes.length}</span>
                  <span>{notes.length === 1 ? 'change' : 'changes'}</span>
                </div>
                {doc.creator_name && (
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <span>by</span>
                    <span className="font-semibold text-gray-700">{doc.creator_name}</span>
                  </div>
                )}
                <div className="text-xs text-gray-400">
                  Updated {timeAgo(doc.updated_at)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Two-column content */}
      <div className="flex gap-5 flex-1 min-h-0 overflow-hidden">

        {/* ── Left: Change timeline ─────────────────────────── */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {/* Section header */}
          <div className="flex items-center gap-2 mb-4 sticky top-0 bg-slate-50 py-1 z-10">
            <History className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-bold text-gray-900">Change History</h2>
            {notes.length > 0 && (
              <span className="text-xs bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">
                {notes.length}
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading changes…
            </div>
          ) : notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
                <GitCommit className="w-7 h-7 text-gray-300" />
              </div>
              <p className="text-sm font-semibold text-gray-500">No changes logged yet</p>
              <p className="text-xs text-gray-400 mt-1">Use the form on the right to log your first change.</p>
            </div>
          ) : (
            <div className="space-y-6 pb-4">
              {groups.map(group => (
                <div key={group.label}>
                  {/* Date divider */}
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      {group.label}
                    </span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>

                  <div className="space-y-3">
                    {group.notes.map(note => {
                      const name = note.creator_name || 'Unknown'
                      const color = avatarColor(name)
                      return (
                        <div key={note.id} className="flex gap-3 group/note">
                          {/* Author avatar */}
                          <div
                            className={`w-8 h-8 rounded-full ${color} flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5 shadow-sm`}
                            title={name}
                          >
                            {initials(name)}
                          </div>

                          {/* Note bubble */}
                          <div className="flex-1 min-w-0">
                            <div className="bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm hover:shadow transition-shadow">
                              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{note.data.note}</p>
                            </div>
                            <div className="flex items-center justify-between mt-1.5 px-1">
                              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                <span className="font-semibold text-gray-700">{name}</span>
                                <span>·</span>
                                <span title={formatDate(note.created_at)}>{timeAgo(note.created_at)}</span>
                              </div>
                              {(canManage || note.created_by === currentUserId) && (
                                <button
                                  onClick={() => handleDelete(note.id)}
                                  disabled={deletingId === note.id}
                                  className="opacity-0 group-hover/note:opacity-100 flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-all"
                                >
                                  {deletingId === note.id
                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                    : <><Trash2 className="w-3 h-3" /><span>Delete</span></>
                                  }
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Log form + Doc info ─────────────────────── */}
        <div className="w-72 shrink-0 flex flex-col gap-4 overflow-y-auto">

          {/* Log a Change card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 shrink-0">
            <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Send className="w-4 h-4 text-indigo-500" />
              Log a Change
            </h3>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd() }}
              placeholder={"Describe what changed…\n\ne.g. Updated Q2 targets in rows 12–15"}
              rows={5}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50 resize-none leading-relaxed"
            />
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-gray-400">Ctrl+Enter to submit</span>
              <button
                onClick={handleAdd}
                disabled={!noteText.trim() || saving}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Log Change
              </button>
            </div>
          </div>

          {/* Document Info card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 shrink-0">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Document Info</h3>
            <dl className="space-y-2.5">
              {[
                { label: 'Type', value: <span className={`font-semibold ${type.text}`}>{type.label}</span> },
                doc.creator_name ? { label: 'Created by', value: doc.creator_name } : null,
                doc.project_name ? { label: 'Project', value: doc.project_name } : null,
                { label: 'Created', value: timeAgo(doc.created_at) },
                { label: 'Last updated', value: timeAgo(doc.updated_at) },
                { label: 'Total changes', value: String(notes.length) },
              ].filter(Boolean).map((row: any) => (
                <div key={row.label} className="flex items-center justify-between gap-2">
                  <dt className="text-xs text-gray-400 shrink-0">{row.label}</dt>
                  <dd className="text-xs font-semibold text-gray-700 text-right truncate">
                    {typeof row.value === 'string' ? row.value : row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* URL card */}
          {doc.url && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 shrink-0">
              <h3 className="text-sm font-bold text-gray-900 mb-2">Link</h3>
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 text-xs text-indigo-600 hover:text-indigo-800 transition-colors break-all"
              >
                <ExternalLink className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{doc.url}</span>
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Edit Document Modal ──────────────────────────────────────────────────────

function EditDocModal({ doc, projects, onClose, onSaved }: { doc: DocumentLink; projects: any[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: doc.name, url: doc.url || '', sheet_type: doc.sheet_type, description: doc.description })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    setError('')
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    try {
      await api.put(`/sheets/${doc.id}`, { name: form.name.trim(), url: form.url.trim(), description: form.description.trim() })
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-5"
      onClick={onClose}
    >
      <div
        className="bg-white w-full md:max-w-lg rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col max-h-[88vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="flex justify-center pt-3 pb-1 md:hidden shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 md:px-7 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">Edit Document</h2>
            <p className="text-xs text-gray-400 mt-0.5">Update name, URL or description</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 md:px-7 py-5 space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Name</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">URL</label>
            <input
              value={form.url}
              onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={4}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 md:px-7 py-4 border-t border-gray-100 shrink-0 bg-gray-50/80 rounded-b-2xl">
          <button
            onClick={onClose}
            className="flex-1 md:flex-none px-5 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 bg-white rounded-xl hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SheetsPage() {
  const dispatch = useDispatch()
  const toast = useToast()
  const rawSheets  = useSelector((s: RootState) => (s as any).sheets?.items ?? [])
  const projects   = useSelector((s: RootState) => s.projects.items)
  const currentUser = useSelector((s: RootState) => s.auth.user)

  const [filter, setFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editDoc, setEditDoc] = useState<DocumentLink | null>(null)
  const [openDoc, setOpenDoc] = useState<DocumentLink | null>(null)
  const [changeNotes, setChangeNotes] = useState<ChangeNote[]>([])
  const [loadingNotes, setLoadingNotes] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const canManage = ANALYTICS_ROLES.includes(currentUser?.primary_role as any)
  const currentUserId = String(currentUser?.user_id || '')

  const loadDocs = useCallback(() => {
    const params: any = {}
    if (filter) params.sheet_type = filter
    dispatch(fetchSheetsRequest(params))
  }, [dispatch, filter])

  useEffect(() => { loadDocs() }, [loadDocs])

  useEffect(() => {
    if (projects.length === 0) dispatch(fetchProjectsRequest({ page: 1, limit: 100 }))
  }, [dispatch, projects.length])

  // Map sheets from redux to DocumentLink shape
  const docs: DocumentLink[] = rawSheets.map((s: any) => ({
    id: s.id,
    name: s.name,
    url: s.url || '',
    sheet_type: s.sheet_type || 'other',
    description: s.description || '',
    creator_name: s.creator_name,
    created_by: s.created_by,
    created_at: s.created_at,
    updated_at: s.updated_at,
    is_pinned: s.is_pinned,
    entry_count: s.entry_count ?? 0,
    project_name: s.project_name,
  }))

  // Keep openDoc in sync with fresh data from redux (e.g. after edit)
  useEffect(() => {
    if (openDoc) {
      const fresh = docs.find(d => d.id === openDoc.id)
      if (fresh) setOpenDoc(fresh)
    }
  }, [docs]) // eslint-disable-next-line -- openDoc intentionally excluded to avoid infinite loop

  // Filter + search
  const filtered = docs.filter(d => {
    if (filter && d.sheet_type !== filter) return false
    if (search && !d.name.toLowerCase().includes(search.toLowerCase()) && !d.description.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Open detail view
  const openDocDetail = async (doc: DocumentLink) => {
    setOpenDoc(doc)
    setLoadingNotes(true)
    try {
      const res = await api.get(`/sheets/${doc.id}`)
      setChangeNotes(res.data.entries || [])
    } catch {
      setChangeNotes([])
    } finally {
      setLoadingNotes(false)
    }
  }

  const handleAddNote = async (note: string) => {
    if (!openDoc) return
    try {
      const res = await api.post(`/sheets/${openDoc.id}/entries`, { data: { note } })
      const now = new Date().toISOString()
      setChangeNotes(prev => [...prev, {
        id: res.data.entry_id,
        data: { note },
        creator_name: currentUser?.full_name,
        created_by: currentUserId,
        created_at: now,
        updated_at: now,
      }])
      loadDocs()
      toast.success('Change logged')
    } catch {
      toast.error('Failed to log change')
    }
  }

  const handleDeleteNote = async (noteId: string) => {
    if (!openDoc) return
    try {
      await api.delete(`/sheets/${openDoc.id}/entries/${noteId}`)
      setChangeNotes(prev => prev.filter(n => n.id !== noteId))
      loadDocs()
    } catch {
      toast.error('Failed to delete note')
    }
  }

  const handlePin = async (doc: DocumentLink) => {
    try {
      await api.put(`/sheets/${doc.id}`, { is_pinned: !doc.is_pinned })
      toast.success(doc.is_pinned ? 'Document unpinned' : 'Document pinned')
      loadDocs()
    } catch {
      toast.error('Failed to update pin')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/sheets/${id}`)
      setDeleteConfirmId(null)
      if (openDoc?.id === id) setOpenDoc(null)
      loadDocs()
      toast.success('Document removed')
    } catch {
      toast.error('Failed to delete')
      setDeleteConfirmId(null)
    }
  }

  const counts = DOC_TYPES.reduce<Record<string, number>>((acc, t) => {
    acc[t.key] = docs.filter(d => d.sheet_type === t.key).length
    return acc
  }, {})

  return (
    <div className="flex flex-col h-full min-h-0">
      {openDoc ? (
        /* ── Detail View ──────────────────────────────────── */
        <DocumentDetailView
          doc={openDoc}
          notes={changeNotes}
          loading={loadingNotes}
          currentUserId={currentUserId}
          canManage={canManage || openDoc.created_by === currentUserId}
          onBack={() => { setOpenDoc(null); loadDocs() }}
          onAddNote={handleAddNote}
          onDeleteNote={handleDeleteNote}
          onEdit={() => setEditDoc(openDoc)}
          onPin={() => handlePin(openDoc)}
          onDelete={() => setDeleteConfirmId(openDoc.id)}
        />
      ) : (
        /* ── Documents Grid ───────────────────────────────── */
        <>
          {/* Page Header */}
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-black text-gray-900">Document Hub</h1>
              <p className="text-sm text-gray-500 mt-0.5">Add links to Docs, Sheets, Slides, PDFs — and track every change.</p>
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" /> Add Document
            </button>
          </div>

          {/* Filter + Search bar */}
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setFilter('')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                  !filter ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                All <span className="ml-1 opacity-60">{docs.length}</span>
              </button>
              {DOC_TYPES.map(t => (
                <button
                  key={t.key}
                  onClick={() => setFilter(f => f === t.key ? '' : t.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                    filter === t.key ? `${t.bg} ${t.text} ${t.border}` : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className={filter === t.key ? t.text : 'text-gray-400'}>{t.icon}</span>
                  {t.label}
                  {counts[t.key] > 0 && <span className="opacity-60">{counts[t.key]}</span>}
                </button>
              ))}
            </div>

            <div className="relative ml-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search documents…"
                className="pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white w-52"
              />
            </div>
          </div>

          {/* Document Grid */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                <FileSpreadsheet className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-sm font-semibold text-gray-500">
                {search ? `No results for "${search}"` : filter ? `No ${getDocType(filter).label} documents yet` : 'No documents added yet'}
              </p>
              <p className="text-xs text-gray-400 mt-1">Click "Add Document" to link your first file.</p>
              <button
                onClick={() => setShowAdd(true)}
                className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-semibold text-indigo-600 border border-indigo-200 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add Document
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(doc => (
                <DocCard
                  key={doc.id}
                  doc={doc}
                  onOpen={() => openDocDetail(doc)}
                  onPin={() => handlePin(doc)}
                  onDelete={() => setDeleteConfirmId(doc.id)}
                  onEdit={() => setEditDoc(doc)}
                  canManage={canManage || doc.created_by === currentUserId}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Delete confirm */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-5">
          <div className="bg-white w-full md:max-w-sm rounded-t-3xl md:rounded-2xl shadow-2xl overflow-hidden">
            {/* Mobile drag handle */}
            <div className="flex justify-center pt-3 pb-1 md:hidden">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>
            <div className="px-6 py-6">
              {/* Icon */}
              <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Remove document?</h3>
              <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                This will permanently delete the document and all its logged changes. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 py-3 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirmId)}
                  className="flex-1 py-3 text-sm font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors shadow-sm"
                >
                  Yes, Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Document Modal */}
      {showAdd && (
        <AddDocModal
          projects={projects as any}
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); loadDocs(); toast.success('Document added') }}
        />
      )}

      {/* Edit Modal */}
      {editDoc && (
        <EditDocModal
          doc={editDoc}
          projects={projects as any}
          onClose={() => setEditDoc(null)}
          onSaved={() => { setEditDoc(null); loadDocs(); toast.success('Document saved') }}
        />
      )}
    </div>
  )
}
