import React, { useEffect, useState, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  Table2, Plus, X, Loader2, Pencil, Trash2, Save,
  Pin, PinOff, ArrowLeft, Phone, CalendarDays, LayoutGrid,
  ChevronRight, AlertCircle, CheckCircle2, ExternalLink,
  FileSpreadsheet,
} from 'lucide-react'
import { RootState } from '../store'
import { fetchSheetsRequest } from '../store/slices/sheetsSlice'
import { fetchProjectsRequest } from '../store/slices/projectsSlice'
import { api } from '../utils/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SheetColumn {
  key: string
  label: string
  type: string
}

interface SheetEntry {
  id: string
  sheet_id: string
  data: Record<string, any>
  created_by: string
  creator_name?: string
  created_at: string
  updated_at: string
}

interface SheetDetail {
  id: string
  name: string
  sheet_type: string
  project_id?: string
  project_name?: string
  description: string
  columns: SheetColumn[]
  created_by: string
  creator_name?: string
  creator_role?: string
  is_pinned: boolean
  entry_count?: number
  entries: SheetEntry[]
  created_at: string
  updated_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  project_overview: {
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    label: 'Project Overview',
  },
  call_log: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    label: 'Call Log',
  },
  daily_update: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    label: 'Daily Update',
  },
  custom: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    label: 'Custom Sheet',
  },
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  project_overview: <LayoutGrid className="w-5 h-5" />,
  call_log: <Phone className="w-5 h-5" />,
  daily_update: <CalendarDays className="w-5 h-5" />,
  custom: <Table2 className="w-5 h-5" />,
}

const FILTER_TABS = [
  { key: '', label: 'All' },
  { key: 'project_overview', label: 'Project Overview' },
  { key: 'call_log', label: 'Call Log' },
  { key: 'daily_update', label: 'Daily Update' },
  { key: 'custom', label: 'Custom' },
]

const SHEET_TYPE_OPTIONS = [
  { key: 'project_overview', label: 'Project Overview', icon: <LayoutGrid className="w-5 h-5" />, desc: 'Track team members, roles and responsibilities' },
  { key: 'call_log', label: 'Call Log', icon: <Phone className="w-5 h-5" />, desc: 'Log calls with contacts, duration and outcomes' },
  { key: 'daily_update', label: 'Daily Update', icon: <CalendarDays className="w-5 h-5" />, desc: 'Record daily tasks, plans and blockers' },
  { key: 'custom', label: 'Custom Sheet', icon: <Table2 className="w-5 h-5" />, desc: 'Build your own columns from scratch' },
]

const PRESET_COLUMNS: Record<string, SheetColumn[]> = {
  project_overview: [
    { key: 'person', label: 'Person', type: 'text' },
    { key: 'role', label: 'Role', type: 'text' },
    { key: 'responsibility', label: 'Responsibility', type: 'text' },
    { key: 'status', label: 'Status', type: 'text' },
    { key: 'notes', label: 'Notes', type: 'text' },
  ],
  call_log: [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'contact', label: 'Contact', type: 'text' },
    { key: 'duration_min', label: 'Duration (min)', type: 'number' },
    { key: 'purpose', label: 'Purpose', type: 'text' },
    { key: 'outcome', label: 'Outcome', type: 'text' },
    { key: 'follow_up', label: 'Follow-up', type: 'text' },
  ],
  daily_update: [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'tasks_done', label: 'Tasks Done', type: 'text' },
    { key: 'planned', label: 'Planned Tomorrow', type: 'text' },
    { key: 'blockers', label: 'Blockers', type: 'text' },
    { key: 'progress_pct', label: 'Progress %', type: 'number' },
  ],
  custom: [],
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

function formatDateShort(iso: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

function timeAgo(iso: string): string {
  if (!iso) return ''
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  } catch {
    return ''
  }
}

function renderCellValue(value: any, type: string): string {
  if (value === undefined || value === null || value === '') return '—'
  if (type === 'date') return formatDate(String(value))
  return String(value)
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

interface CreateModalProps {
  projects: { id: string; name: string }[]
  onClose: () => void
  onCreated: () => void
}

function CreateModal({ projects, onClose, onCreated }: CreateModalProps) {
  const [name, setName] = useState('')
  const [sheetType, setSheetType] = useState('project_overview')
  const [projectId, setProjectId] = useState('')
  const [description, setDescription] = useState('')
  const [customColumns, setCustomColumns] = useState<SheetColumn[]>([
    { key: '', label: '', type: 'text' },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const addCustomColumn = () => {
    setCustomColumns(prev => [...prev, { key: '', label: '', type: 'text' }])
  }

  const removeCustomColumn = (idx: number) => {
    setCustomColumns(prev => prev.filter((_, i) => i !== idx))
  }

  const updateCustomColumn = (idx: number, field: keyof SheetColumn, value: string) => {
    setCustomColumns(prev =>
      prev.map((col, i) => (i === idx ? { ...col, [field]: value } : col))
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('Sheet name is required'); return }
    if (sheetType === 'custom') {
      for (const col of customColumns) {
        if (!col.key.trim() || !col.label.trim()) {
          setError('All custom columns must have a key and label'); return
        }
      }
    }
    setSaving(true)
    try {
      const payload: any = {
        name: name.trim(),
        sheet_type: sheetType,
        description: description.trim(),
        project_id: projectId || undefined,
      }
      if (sheetType === 'custom') {
        payload.columns = customColumns.map(c => ({
          key: c.key.trim().replace(/\s+/g, '_').toLowerCase(),
          label: c.label.trim(),
          type: c.type,
        }))
      }
      await api.post('/sheets', payload)
      onCreated()
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to create sheet')
    } finally {
      setSaving(false)
    }
  }

  const previewColumns = PRESET_COLUMNS[sheetType] || []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">New Sheet</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Sheet Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Q2 Project Overview"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Type selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Sheet Type</label>
            <div className="grid grid-cols-2 gap-2">
              {SHEET_TYPE_OPTIONS.map(opt => {
                const style = TYPE_STYLES[opt.key]
                const selected = sheetType === opt.key
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setSheetType(opt.key)}
                    className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                      selected
                        ? `${style.border} ${style.bg} border-2`
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <span className={`mt-0.5 flex-shrink-0 ${selected ? style.text : 'text-gray-400'}`}>
                      {opt.icon}
                    </span>
                    <div>
                      <div className={`text-sm font-medium ${selected ? style.text : 'text-gray-700'}`}>
                        {opt.label}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 leading-snug">{opt.desc}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Project */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Link to Project <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
            >
              <option value="">No project</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="What is this sheet for?"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Columns section */}
          {sheetType === 'custom' ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Columns</label>
                <button
                  type="button"
                  onClick={addCustomColumn}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Column
                </button>
              </div>
              <div className="space-y-2">
                {customColumns.map((col, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={col.label}
                      onChange={e => updateCustomColumn(idx, 'label', e.target.value)}
                      placeholder="Column label"
                      className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <input
                      type="text"
                      value={col.key}
                      onChange={e => updateCustomColumn(idx, 'key', e.target.value)}
                      placeholder="key (no spaces)"
                      className="w-36 px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono"
                    />
                    <select
                      value={col.type}
                      onChange={e => updateCustomColumn(idx, 'type', e.target.value)}
                      className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    >
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="date">Date</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => removeCustomColumn(idx)}
                      disabled={customColumns.length === 1}
                      className="p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Pre-built Columns
              </label>
              <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100 border-b border-gray-200">
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Label</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Key</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewColumns.map((col, i) => (
                      <tr key={col.key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-1.5 text-gray-800">{col.label}</td>
                        <td className="px-3 py-1.5 text-gray-500 font-mono text-xs">{col.key}</td>
                        <td className="px-3 py-1.5 text-gray-500 capitalize">{col.type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit as any}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create Sheet
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Sheet Card ───────────────────────────────────────────────────────────────

interface SheetCardProps {
  sheet: any
  onOpen: () => void
  onPin: () => void
  onDelete: () => void
  canManage: boolean
}

function SheetCard({ sheet, onOpen, onPin, onDelete, canManage }: SheetCardProps) {
  const style = TYPE_STYLES[sheet.sheet_type] || TYPE_STYLES.custom
  const icon = TYPE_ICONS[sheet.sheet_type] || <Table2 className="w-5 h-5" />

  return (
    <div
      className={`group relative bg-white rounded-2xl border ${
        sheet.is_pinned ? 'border-indigo-300 shadow-md' : 'border-gray-200 shadow-sm'
      } hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col overflow-hidden`}
      onClick={onOpen}
    >
      {/* Top color bar */}
      <div className={`h-1 w-full ${style.bg}`} />

      {/* Card body */}
      <div className="p-4 flex-1 flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className={`p-2 rounded-xl ${style.bg} ${style.text} flex-shrink-0`}>
            {icon}
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {canManage && (
              <button
                onClick={e => { e.stopPropagation(); onPin() }}
                title={sheet.is_pinned ? 'Unpin' : 'Pin'}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors"
              >
                {sheet.is_pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
              </button>
            )}
            {canManage && (
              <button
                onClick={e => { e.stopPropagation(); onDelete() }}
                title="Delete sheet"
                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Name + pin indicator */}
        <div>
          <div className="flex items-center gap-1.5">
            {sheet.is_pinned && <Pin className="w-3 h-3 text-indigo-500 flex-shrink-0" />}
            <h3 className="text-sm font-semibold text-gray-900 line-clamp-1">{sheet.name}</h3>
          </div>
          {sheet.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{sheet.description}</p>
          )}
        </div>

        {/* Type badge */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${style.bg} ${style.text} ${style.border}`}>
            {style.label}
          </span>
          {sheet.project_name && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-gray-600 bg-gray-100 border border-gray-200">
              <ChevronRight className="w-3 h-3" />
              {sheet.project_name}
            </span>
          )}
        </div>

        {/* Footer stats */}
        <div className="mt-auto pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-3">
            <span className="font-medium text-gray-700">
              {sheet.entry_count ?? 0} {sheet.entry_count === 1 ? 'row' : 'rows'}
            </span>
            {sheet.creator_name && (
              <span>by {sheet.creator_name}</span>
            )}
          </div>
          <span>{timeAgo(sheet.updated_at)}</span>
        </div>
      </div>

      {/* Open arrow */}
      <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <ExternalLink className="w-4 h-4 text-gray-400" />
      </div>
    </div>
  )
}

// ─── Spreadsheet View ─────────────────────────────────────────────────────────

interface SpreadsheetViewProps {
  sheet: SheetDetail
  currentUserId: string
  currentUserRole: string
  onBack: () => void
  onRefreshList: () => void
}

function SpreadsheetView({ sheet, currentUserId, currentUserRole, onBack, onRefreshList }: SpreadsheetViewProps) {
  const [entries, setEntries] = useState<SheetEntry[]>(sheet.entries || [])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Record<string, any>>({})
  const [addingRow, setAddingRow] = useState(false)
  const [newRowData, setNewRowData] = useState<Record<string, any>>({})
  const [savingEntry, setSavingEntry] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [entryError, setEntryError] = useState('')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const isManager = ['ceo', 'coo', 'pm', 'team_lead'].includes(currentUserRole)
  const isExec = ['ceo', 'coo'].includes(currentUserRole)
  const isPm = currentUserRole === 'pm'

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3000)
  }

  const startEdit = (entry: SheetEntry) => {
    setEditingId(entry.id)
    setEditData({ ...entry.data })
    setAddingRow(false)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditData({})
  }

  const saveEdit = async () => {
    if (!editingId) return
    setSavingEntry(true)
    setEntryError('')
    try {
      await api.put(`/sheets/${sheet.id}/entries/${editingId}`, { data: editData })
      setEntries(prev =>
        prev.map(e => e.id === editingId ? { ...e, data: editData, updated_at: new Date().toISOString() } : e)
      )
      setEditingId(null)
      setEditData({})
      showToast('success', 'Row updated')
      onRefreshList()
    } catch (err: any) {
      setEntryError(err?.response?.data?.detail || 'Failed to update entry')
    } finally {
      setSavingEntry(false)
    }
  }

  const deleteEntry = async (entryId: string) => {
    setDeletingId(entryId)
    try {
      await api.delete(`/sheets/${sheet.id}/entries/${entryId}`)
      setEntries(prev => prev.filter(e => e.id !== entryId))
      showToast('success', 'Row deleted')
      onRefreshList()
    } catch (err: any) {
      showToast('error', err?.response?.data?.detail || 'Failed to delete entry')
    } finally {
      setDeletingId(null)
    }
  }

  const startAddRow = () => {
    const blank: Record<string, any> = {}
    sheet.columns.forEach(col => { blank[col.key] = '' })
    setNewRowData(blank)
    setAddingRow(true)
    setEditingId(null)
  }

  const cancelAddRow = () => {
    setAddingRow(false)
    setNewRowData({})
  }

  const saveNewRow = async () => {
    setSavingEntry(true)
    setEntryError('')
    try {
      const res = await api.post(`/sheets/${sheet.id}/entries`, { data: newRowData })
      const newEntry: SheetEntry = {
        id: res.data.entry_id,
        sheet_id: sheet.id,
        data: newRowData,
        created_by: currentUserId,
        creator_name: 'You',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setEntries(prev => [...prev, newEntry])
      setAddingRow(false)
      setNewRowData({})
      showToast('success', 'Row added')
      onRefreshList()
    } catch (err: any) {
      setEntryError(err?.response?.data?.detail || 'Failed to add entry')
    } finally {
      setSavingEntry(false)
    }
  }

  const canEditEntry = (entry: SheetEntry) => {
    return isExec || isPm || entry.created_by === currentUserId
  }

  const canDeleteEntry = (entry: SheetEntry) => {
    return isExec || isPm || entry.created_by === currentUserId
  }

  const style = TYPE_STYLES[sheet.sheet_type] || TYPE_STYLES.custom
  const icon = TYPE_ICONS[sheet.sheet_type] || <Table2 className="w-5 h-5" />

  const renderInput = (col: SheetColumn, value: any, onChange: (val: any) => void) => {
    const baseClass = "w-full px-2 py-1 border border-indigo-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
    if (col.type === 'date') {
      return (
        <input
          type="date"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          className={baseClass}
        />
      )
    }
    if (col.type === 'number') {
      return (
        <input
          type="number"
          value={value || ''}
          onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className={baseClass}
        />
      )
    }
    return (
      <input
        type="text"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        className={baseClass}
      />
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.type === 'success'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {toast.type === 'success'
            ? <CheckCircle2 className="w-4 h-4" />
            : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="h-5 w-px bg-gray-300" />
          <div className={`p-1.5 rounded-lg ${style.bg} ${style.text}`}>{icon}</div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-gray-900">{sheet.name}</h1>
              {sheet.is_pinned && <Pin className="w-4 h-4 text-indigo-500" />}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className={`px-1.5 py-0.5 rounded-full font-medium border ${style.bg} ${style.text} ${style.border}`}>
                {style.label}
              </span>
              {sheet.project_name && (
                <>
                  <ChevronRight className="w-3 h-3" />
                  <span>{sheet.project_name}</span>
                </>
              )}
              {sheet.creator_name && (
                <>
                  <span>•</span>
                  <span>Created by {sheet.creator_name}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={startAddRow}
          disabled={addingRow}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add Row
        </button>
      </div>

      {/* Description */}
      {sheet.description && (
        <p className="text-sm text-gray-600 mb-3">{sheet.description}</p>
      )}

      {/* Error */}
      {entryError && (
        <div className="flex items-center gap-2 p-3 mb-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {entryError}
          <button onClick={() => setEntryError('')} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full text-sm border-collapse min-w-max">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
              {sheet.columns.map(col => (
                <th
                  key={col.key}
                  className="text-left px-3 py-2.5 font-semibold text-gray-600 whitespace-nowrap border-r border-gray-200 last:border-r-0"
                >
                  {col.label}
                  {col.type !== 'text' && (
                    <span className="ml-1 text-xs font-normal text-gray-400 capitalize">({col.type})</span>
                  )}
                </th>
              ))}
              <th className="text-left px-3 py-2.5 font-semibold text-gray-600 whitespace-nowrap border-r border-gray-200">
                Added By
              </th>
              <th className="text-left px-3 py-2.5 font-semibold text-gray-600 whitespace-nowrap border-r border-gray-200">
                Date
              </th>
              <th className="text-left px-3 py-2.5 font-semibold text-gray-600 whitespace-nowrap w-20">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && !addingRow && (
              <tr>
                <td
                  colSpan={sheet.columns.length + 3}
                  className="px-4 py-12 text-center text-gray-400"
                >
                  <div className="flex flex-col items-center gap-2">
                    <FileSpreadsheet className="w-10 h-10 text-gray-300" />
                    <span className="text-sm font-medium text-gray-500">No entries yet.</span>
                    <span className="text-xs text-gray-400">Click 'Add Row' to get started.</span>
                  </div>
                </td>
              </tr>
            )}

            {entries.map((entry, rowIdx) => {
              const isEditing = editingId === entry.id
              const isDeleting = deletingId === entry.id
              const rowBg = rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'

              return (
                <tr
                  key={entry.id}
                  className={`${isEditing ? 'bg-indigo-50' : rowBg} border-b border-gray-100 last:border-b-0 hover:bg-indigo-50/30 transition-colors`}
                >
                  {sheet.columns.map(col => (
                    <td key={col.key} className="px-3 py-2 border-r border-gray-100 last:border-r-0 max-w-xs">
                      {isEditing ? (
                        renderInput(col, editData[col.key], val =>
                          setEditData(prev => ({ ...prev, [col.key]: val }))
                        )
                      ) : (
                        <span className={`block truncate ${!entry.data[col.key] ? 'text-gray-300' : 'text-gray-800'}`}>
                          {renderCellValue(entry.data[col.key], col.type)}
                        </span>
                      )}
                    </td>
                  ))}

                  {/* Added By */}
                  <td className="px-3 py-2 border-r border-gray-100 whitespace-nowrap text-gray-500 text-xs">
                    {entry.creator_name || '—'}
                  </td>

                  {/* Date */}
                  <td className="px-3 py-2 border-r border-gray-100 whitespace-nowrap text-gray-500 text-xs">
                    {formatDateShort(entry.created_at)}
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-2 w-20">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={saveEdit}
                          disabled={savingEntry}
                          title="Save"
                          className="p-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                        >
                          {savingEntry ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={cancelEdit}
                          title="Cancel"
                          className="p-1.5 rounded-md text-gray-500 hover:bg-gray-200 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        {canEditEntry(entry) && (
                          <button
                            onClick={() => startEdit(entry)}
                            title="Edit row"
                            className="p-1.5 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDeleteEntry(entry) && (
                          <button
                            onClick={() => deleteEntry(entry.id)}
                            disabled={isDeleting}
                            title="Delete row"
                            className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                          >
                            {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}

            {/* New Row Form */}
            {addingRow && (
              <tr className="bg-indigo-50 border-b border-indigo-200">
                {sheet.columns.map(col => (
                  <td key={col.key} className="px-3 py-2 border-r border-indigo-100 last:border-r-0">
                    {renderInput(col, newRowData[col.key], val =>
                      setNewRowData(prev => ({ ...prev, [col.key]: val }))
                    )}
                  </td>
                ))}
                {/* Added By */}
                <td className="px-3 py-2 border-r border-indigo-100 text-xs text-gray-400 italic">you</td>
                {/* Date */}
                <td className="px-3 py-2 border-r border-indigo-100 text-xs text-gray-400 italic">now</td>
                {/* Actions */}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={saveNewRow}
                      disabled={savingEntry}
                      title="Save row"
                      className="p-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                    >
                      {savingEntry ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={cancelAddRow}
                      title="Cancel"
                      className="p-1.5 rounded-md text-gray-500 hover:bg-gray-200 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Entry count footer */}
      <div className="mt-2 text-xs text-gray-400 text-right">
        {entries.length} {entries.length === 1 ? 'row' : 'rows'}
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function SheetsPage() {
  const dispatch = useDispatch()
  const sheets = useSelector((s: RootState) => (s as any).sheets?.items ?? [])
  const sheetsLoading = useSelector((s: RootState) => (s as any).sheets?.isLoading ?? false)
  const projects = useSelector((s: RootState) => s.projects.items)
  const currentUser = useSelector((s: RootState) => s.auth.user)

  const [activeFilter, setActiveFilter] = useState('')
  const [openSheet, setOpenSheet] = useState<SheetDetail | null>(null)
  const [loadingSheetId, setLoadingSheetId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const currentUserRole = currentUser?.primary_role ?? ''
  const isManager = ['ceo', 'coo', 'pm', 'team_lead'].includes(currentUserRole)

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3500)
  }

  const loadSheets = useCallback(() => {
    const params: any = {}
    if (activeFilter) params.sheet_type = activeFilter
    dispatch(fetchSheetsRequest(params))
  }, [dispatch, activeFilter])

  useEffect(() => {
    loadSheets()
  }, [loadSheets])

  useEffect(() => {
    if (projects.length === 0) {
      dispatch(fetchProjectsRequest({ page: 1, limit: 100 }))
    }
  }, [dispatch, projects.length])

  const openSheetDetail = async (sheetId: string) => {
    setLoadingSheetId(sheetId)
    try {
      const res = await api.get(`/sheets/${sheetId}`)
      setOpenSheet(res.data)
    } catch (err: any) {
      showToast('error', err?.response?.data?.detail || 'Failed to load sheet')
    } finally {
      setLoadingSheetId(null)
    }
  }

  const handlePin = async (sheet: any) => {
    try {
      await api.put(`/sheets/${sheet.id}`, { is_pinned: !sheet.is_pinned })
      showToast('success', sheet.is_pinned ? 'Sheet unpinned' : 'Sheet pinned')
      loadSheets()
    } catch (err: any) {
      showToast('error', err?.response?.data?.detail || 'Failed to update pin')
    }
  }

  const handleDelete = async (sheetId: string) => {
    try {
      await api.delete(`/sheets/${sheetId}`)
      showToast('success', 'Sheet deleted')
      setDeleteConfirmId(null)
      loadSheets()
    } catch (err: any) {
      showToast('error', err?.response?.data?.detail || 'Failed to delete sheet')
      setDeleteConfirmId(null)
    }
  }

  const handleCreated = () => {
    setShowCreateModal(false)
    showToast('success', 'Sheet created successfully')
    loadSheets()
  }

  // ── Delete Confirm Dialog ──────────────────────────────────────────────────
  const deleteTarget = sheets.find((s: any) => s.id === deleteConfirmId)

  return (
    <div className="flex flex-col h-full min-h-0 p-4 md:p-6">
      {/* Global Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.type === 'success'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {toast.type === 'success'
            ? <CheckCircle2 className="w-4 h-4" />
            : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirmId && deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-red-100 rounded-xl">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="font-semibold text-gray-900">Delete Sheet</h3>
            </div>
            <p className="text-sm text-gray-600 mb-5">
              Are you sure you want to delete <span className="font-medium text-gray-900">"{deleteTarget.name}"</span>?
              This will also delete all {deleteTarget.entry_count ?? 0} entries. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateModal
          projects={projects}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}

      {/* ── Sheet Detail View ── */}
      {openSheet ? (
        <div className="flex-1 flex flex-col min-h-0">
          <SpreadsheetView
            sheet={openSheet}
            currentUserId={currentUser?.user_id ?? ''}
            currentUserRole={currentUserRole}
            onBack={() => { setOpenSheet(null); loadSheets() }}
            onRefreshList={loadSheets}
          />
        </div>
      ) : (
        /* ── Grid View ── */
        <div className="flex flex-col gap-5 flex-1 min-h-0">
          {/* Page Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <FileSpreadsheet className="w-6 h-6 text-indigo-600" />
                Sheets
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Spreadsheet-style data tracking for your team and projects
              </p>
            </div>
            {isManager && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                New Sheet
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                  activeFilter === tab.key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Loading */}
          {sheetsLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
          )}

          {/* Empty state */}
          {!sheetsLoading && sheets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="p-4 bg-gray-100 rounded-2xl mb-4">
                <FileSpreadsheet className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-base font-semibold text-gray-700 mb-1">No sheets yet</h3>
              <p className="text-sm text-gray-500 mb-4 max-w-xs">
                {activeFilter
                  ? `No ${TYPE_STYLES[activeFilter]?.label ?? activeFilter} sheets found.`
                  : 'Create your first sheet to start tracking structured data.'}
              </p>
              {isManager && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Create Sheet
                </button>
              )}
            </div>
          )}

          {/* Sheet Grid */}
          {!sheetsLoading && sheets.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto flex-1 pb-2">
              {sheets.map((sheet: any) => (
                <div key={sheet.id} className="relative">
                  {loadingSheetId === sheet.id && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 rounded-2xl">
                      <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                    </div>
                  )}
                  <SheetCard
                    sheet={sheet}
                    onOpen={() => openSheetDetail(sheet.id)}
                    onPin={() => handlePin(sheet)}
                    onDelete={() => setDeleteConfirmId(sheet.id)}
                    canManage={
                      isManager &&
                      (
                        ['ceo', 'coo'].includes(currentUserRole) ||
                        sheet.created_by === currentUser?.user_id
                      )
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
