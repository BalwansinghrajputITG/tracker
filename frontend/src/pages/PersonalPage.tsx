import React, { useEffect, useState, useRef } from 'react'
import { useSelector } from 'react-redux'
import {
  FileText, Sheet, Link2, Plus, X, Trash2, Pencil, Save,
  Pin, PinOff, Target, TrendingUp, CheckCircle2, Clock,
  AlertTriangle, Loader2, ExternalLink, BarChart3,
  ThumbsUp, Smile, Meh, Frown, ThumbsDown, Flame, Github,
  Zap,
} from 'lucide-react'
import { Modal } from '../components/common/Modal'
import { RootState } from '../store'
import { api } from '../utils/api'
import SheetsPage from './SheetsPage'
import { useToast } from '../components/shared'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PersonalLink {
  id: string
  title: string
  url: string
  link_type: 'docs' | 'sheets' | 'github' | 'other'
  created_at: string
}

interface StickyNote {
  id: string
  content: string
  color: string
  pinned: boolean
  created_at: string
  updated_at: string
}

interface PersonalTarget {
  id: string
  title: string
  description: string
  target_value: number
  current_value: number
  unit: string
  deadline?: string
  completed: boolean
  created_at: string
}

interface Performance {
  tasks: {
    total: number
    done: number
    in_progress: number
    blocked: number
    overdue: number
    done_this_month: number
    completion_rate: number
    total_hours: number
  }
  reports: {
    total: number
    this_month: number
    this_week: number
    avg_hours_day: number
  }
  tracking_tools: {
    docs: number
    sheets: number
    github: number
    other: number
    total_tracking: number
  }
  evaluation: {
    score: number
    label: string
    color: string
    breakdown: {
      hours: number
      tasks: number
      compliance: number
      tools: number
      reliability: number
    }
  }
  mood_trend: Array<{ date: string; mood: string }>
  recent_completed: Array<{ id: string; title: string; priority: string; updated_at: string }>
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NOTE_COLORS: Record<string, { bg: string; border: string; text: string; btn: string }> = {
  yellow: { bg: 'bg-yellow-50',  border: 'border-yellow-200', text: 'text-yellow-900', btn: 'bg-yellow-400' },
  blue:   { bg: 'bg-blue-50',    border: 'border-blue-200',   text: 'text-blue-900',   btn: 'bg-blue-400' },
  green:  { bg: 'bg-emerald-50', border: 'border-emerald-200',text: 'text-emerald-900',btn: 'bg-emerald-400' },
  pink:   { bg: 'bg-pink-50',    border: 'border-pink-200',   text: 'text-pink-900',   btn: 'bg-pink-400' },
  purple: { bg: 'bg-purple-50',  border: 'border-purple-200', text: 'text-purple-900', btn: 'bg-purple-400' },
}

const MOOD_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  great:     { icon: <ThumbsUp size={13} />,   color: 'text-emerald-600', label: 'Great' },
  good:      { icon: <Smile size={13} />,       color: 'text-blue-600',    label: 'Good' },
  neutral:   { icon: <Meh size={13} />,         color: 'text-amber-600',   label: 'Neutral' },
  stressed:  { icon: <Frown size={13} />,       color: 'text-orange-600',  label: 'Stressed' },
  burned_out:{ icon: <ThumbsDown size={13} />,  color: 'text-red-600',     label: 'Burned out' },
}

const PRIORITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  high:     'bg-orange-500',
  medium:   'bg-amber-500',
  low:      'bg-gray-400',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function linkIcon(type: string) {
  if (type === 'docs')   return <FileText size={16} className="text-blue-600" />
  if (type === 'sheets') return <Sheet size={16} className="text-emerald-600" />
  if (type === 'github') return <Github size={16} className="text-gray-800" />
  return <Link2 size={16} className="text-gray-500" />
}

function linkBg(type: string) {
  if (type === 'docs')   return 'bg-blue-50 border-blue-200'
  if (type === 'sheets') return 'bg-emerald-50 border-emerald-200'
  if (type === 'github') return 'bg-gray-100 border-gray-300'
  return 'bg-gray-50 border-gray-200'
}

function daysLeft(deadline?: string) {
  if (!deadline) return null
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)
  return diff
}

// ─── Main Page ────────────────────────────────────────────────────────────────

interface PersonalPageProps {
  embedded?: boolean
}

export const PersonalPage: React.FC<PersonalPageProps> = ({ embedded = false }) => {
  const toast = useToast()
  const { user } = useSelector((s: RootState) => s.auth)
  const [tab, setTab] = useState<'workspace' | 'targets' | 'performance' | 'sheets'>('workspace')

  // ── Data ──────────────────────────────────────────────────────────────────
  const [links, setLinks]       = useState<PersonalLink[]>([])
  const [notes, setNotes]       = useState<StickyNote[]>([])
  const [targets, setTargets]   = useState<PersonalTarget[]>([])
  const [perf, setPerf]         = useState<Performance | null>(null)
  const [loading, setLoading]   = useState(true)
  const [perfLoading, setPerfLoading] = useState(false)

  // ── Link modal ────────────────────────────────────────────────────────────
  const [linkModal, setLinkModal] = useState(false)
  const [linkEdit, setLinkEdit]   = useState<PersonalLink | null>(null)
  const [linkForm, setLinkForm]   = useState<{ title: string; url: string; link_type: PersonalLink['link_type'] }>({ title: '', url: '', link_type: 'github' })
  const [linkSaving, setLinkSaving] = useState(false)

  // ── Note state ────────────────────────────────────────────────────────────
  const [noteModal, setNoteModal]   = useState(false)
  const [noteEdit, setNoteEdit]     = useState<StickyNote | null>(null)
  const [noteForm, setNoteForm]     = useState({ content: '', color: 'yellow' })
  const [noteSaving, setNoteSaving] = useState(false)

  // ── Target modal ──────────────────────────────────────────────────────────
  const [targetModal, setTargetModal]   = useState(false)
  const [targetEdit, setTargetEdit]     = useState<PersonalTarget | null>(null)
  const [targetForm, setTargetForm]     = useState({
    title: '', description: '', target_value: 10, unit: 'tasks', deadline: '',
  })
  const [progressEdit, setProgressEdit] = useState<{ id: string; val: string } | null>(null)
  const [targetSaving, setTargetSaving] = useState(false)

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadWorkspace()
  }, [])

  useEffect(() => {
    if (tab === 'performance' && !perf) loadPerformance()
  }, [tab])

  const loadWorkspace = async () => {
    setLoading(true)
    try {
      const [l, n, t] = await Promise.all([
        api.get('/personal/links'),
        api.get('/personal/notes'),
        api.get('/personal/targets'),
      ])
      setLinks(l.data.links)
      setNotes(n.data.notes)
      setTargets(t.data.targets)
    } catch (_) {}
    setLoading(false)
  }

  const loadPerformance = async () => {
    setPerfLoading(true)
    try {
      const res = await api.get('/personal/performance')
      setPerf(res.data)
    } catch (_) {}
    setPerfLoading(false)
  }

  // ── Links ─────────────────────────────────────────────────────────────────
  const openLinkModal = (link?: PersonalLink) => {
    setLinkEdit(link || null)
    setLinkForm(link ? { title: link.title, url: link.url, link_type: link.link_type } : { title: '', url: '', link_type: 'docs' })
    setLinkModal(true)
  }

  const saveLink = async () => {
    if (!linkForm.title.trim() || !linkForm.url.trim()) return
    setLinkSaving(true)
    try {
      if (linkEdit) {
        await api.put(`/personal/links/${linkEdit.id}`, linkForm)
        setLinks(prev => prev.map(l => l.id === linkEdit.id ? { ...l, ...linkForm } : l))
        toast.success('Link updated')
      } else {
        const res = await api.post('/personal/links', linkForm)
        setLinks(prev => [{ id: res.data.link_id, ...linkForm, created_at: new Date().toISOString() }, ...prev])
        toast.success('Link added')
      }
      setLinkModal(false)
    } catch (_) {
      toast.error('Failed to save link')
    }
    setLinkSaving(false)
  }

  const deleteLink = async (id: string) => {
    try {
      await api.delete(`/personal/links/${id}`)
      setLinks(prev => prev.filter(l => l.id !== id))
      toast.success('Link deleted')
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to delete link')
    }
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  const openNoteModal = (note?: StickyNote) => {
    setNoteEdit(note || null)
    setNoteForm(note ? { content: note.content, color: note.color } : { content: '', color: 'yellow' })
    setNoteModal(true)
  }

  const saveNote = async () => {
    if (!noteForm.content.trim()) return
    setNoteSaving(true)
    try {
      if (noteEdit) {
        await api.put(`/personal/notes/${noteEdit.id}`, noteForm)
        setNotes(prev => prev.map(n => n.id === noteEdit.id ? { ...n, ...noteForm, updated_at: new Date().toISOString() } : n))
        toast.success('Note updated')
      } else {
        const res = await api.post('/personal/notes', noteForm)
        setNotes(prev => [{
          id: res.data.note_id, ...noteForm, pinned: false,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }, ...prev])
        toast.success('Note created')
      }
      setNoteModal(false)
    } catch (_) {
      toast.error('Failed to save note')
    }
    setNoteSaving(false)
  }

  const togglePin = async (note: StickyNote) => {
    try {
      await api.put(`/personal/notes/${note.id}`, { pinned: !note.pinned })
      setNotes(prev => prev.map(n => n.id === note.id ? { ...n, pinned: !n.pinned } : n)
        .sort((a, b) => Number(b.pinned) - Number(a.pinned)))
      toast.success(note.pinned ? 'Note unpinned' : 'Note pinned')
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to update pin')
    }
  }

  const deleteNote = async (id: string) => {
    try {
      await api.delete(`/personal/notes/${id}`)
      setNotes(prev => prev.filter(n => n.id !== id))
      toast.success('Note deleted')
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to delete note')
    }
  }

  // ── Targets ───────────────────────────────────────────────────────────────
  const openTargetModal = (t?: PersonalTarget) => {
    setTargetEdit(t || null)
    setTargetForm(t ? {
      title: t.title, description: t.description,
      target_value: t.target_value, unit: t.unit,
      deadline: t.deadline ? t.deadline.split('T')[0] : '',
    } : { title: '', description: '', target_value: 10, unit: 'tasks', deadline: '' })
    setTargetModal(true)
  }

  const saveTarget = async () => {
    if (!targetForm.title.trim() || targetForm.target_value <= 0) return
    setTargetSaving(true)
    try {
      const payload: any = {
        ...targetForm,
        deadline: targetForm.deadline ? new Date(targetForm.deadline).toISOString() : null,
      }
      if (targetEdit) {
        await api.put(`/personal/targets/${targetEdit.id}`, payload)
        setTargets(prev => prev.map(t => t.id === targetEdit.id ? { ...t, ...payload } : t))
        toast.success('Target updated')
      } else {
        const res = await api.post('/personal/targets', payload)
        setTargets(prev => [{
          id: res.data.target_id, ...payload, current_value: 0, completed: false,
          created_at: new Date().toISOString(),
        }, ...prev])
        toast.success('Target created')
      }
      setTargetModal(false)
    } catch (_) {
      toast.error('Failed to save target')
    }
    setTargetSaving(false)
  }

  const saveProgress = async (id: string, val: string) => {
    const v = parseFloat(val)
    if (isNaN(v) || v < 0) return
    try {
      await api.put(`/personal/targets/${id}`, { current_value: v })
      setTargets(prev => prev.map(t => {
        if (t.id !== id) return t
        const completed = v >= t.target_value
        return { ...t, current_value: v, completed }
      }))
      setProgressEdit(null)
      toast.success('Progress updated')
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to update progress')
    }
  }

  const deleteTarget = async (id: string) => {
    try {
      await api.delete(`/personal/targets/${id}`)
      setTargets(prev => prev.filter(t => t.id !== id))
      toast.success('Target deleted')
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to delete target')
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header — hidden when embedded inside dashboard */}
      {!embedded && (
        <div className="flex items-center justify-between animate-fade-in-up">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Workspace</h1>
            <p className="text-gray-500 text-sm mt-1">Private · only visible to you</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { key: 'workspace',   label: 'Workspace' },
          { key: 'targets',     label: 'Targets' },
          { key: 'performance', label: 'Performance' },
          { key: 'sheets',      label: 'Sheets' },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
              tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400">
          <Loader2 size={22} className="animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <>
          {/* ── WORKSPACE TAB ───────────────────────────────────────────── */}
          {tab === 'workspace' && (
            <div className="space-y-8 animate-fade-in-up">

              {/* Quick Links */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-semibold text-gray-800">Quick Links</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Your Google Docs, Sheets and other private links</p>
                  </div>
                  <button
                    onClick={() => openLinkModal()}
                    className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-blue-700 transition-all"
                  >
                    <Plus size={13} /> Add Link
                  </button>
                </div>

                {links.length === 0 ? (
                  <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center">
                    <Link2 size={24} className="text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-400 font-medium">No links yet</p>
                    <p className="text-xs text-gray-300 mt-1">Add your Google Docs, Sheets, or any private URL</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {links.map(link => (
                      <div key={link.id} className={`flex items-center gap-3 p-3.5 rounded-2xl border ${linkBg(link.link_type)} group`}>
                        <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0">
                          {linkIcon(link.link_type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{link.title}</p>
                          <p className="text-xs text-gray-400 truncate">{link.url}</p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <a
                            href={link.url} target="_blank" rel="noreferrer"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-white transition-all"
                          >
                            <ExternalLink size={13} />
                          </a>
                          <button
                            onClick={() => openLinkModal(link)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-white transition-all"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => deleteLink(link.id)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-white transition-all"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Sticky Notes */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-semibold text-gray-800">Sticky Notes</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Private reminders and jot-downs</p>
                  </div>
                  <button
                    onClick={() => openNoteModal()}
                    className="flex items-center gap-1.5 bg-amber-500 text-white px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-amber-600 transition-all"
                  >
                    <Plus size={13} /> Add Note
                  </button>
                </div>

                {notes.length === 0 ? (
                  <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center">
                    <FileText size={24} className="text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-400 font-medium">No notes yet</p>
                    <p className="text-xs text-gray-300 mt-1">Create sticky notes for quick reminders</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {notes.map(note => {
                      const c = NOTE_COLORS[note.color] || NOTE_COLORS.yellow
                      return (
                        <div
                          key={note.id}
                          className={`relative p-4 rounded-2xl border ${c.bg} ${c.border} group flex flex-col min-h-[120px]`}
                        >
                          {note.pinned && (
                            <span className="absolute -top-1.5 left-4 w-3 h-3 rounded-full bg-gray-500" />
                          )}
                          <p className={`text-sm leading-relaxed flex-1 whitespace-pre-wrap ${c.text}`}>{note.content}</p>
                          <div className="flex items-center justify-between mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-xs text-gray-400">
                              {new Date(note.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                            <div className="flex items-center gap-1">
                              <button onClick={() => togglePin(note)} className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 transition-colors">
                                {note.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                              </button>
                              <button onClick={() => openNoteModal(note)} className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 transition-colors">
                                <Pencil size={12} />
                              </button>
                              <button onClick={() => deleteNote(note.id)} className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 transition-colors">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ── TARGETS TAB ─────────────────────────────────────────────── */}
          {tab === 'targets' && (
            <div className="space-y-4 animate-fade-in-up">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-800">Personal Targets</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Set goals, track progress, celebrate wins</p>
                </div>
                <button
                  onClick={() => openTargetModal()}
                  className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-blue-700 transition-all"
                >
                  <Plus size={13} /> New Target
                </button>
              </div>

              {targets.length === 0 ? (
                <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center">
                  <Target size={28} className="text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-400 font-medium">No targets yet</p>
                  <p className="text-xs text-gray-300 mt-1">Set personal goals to stay focused and motivated</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {targets.map(t => {
                    const pct = Math.min(100, t.target_value > 0 ? Math.round(t.current_value / t.target_value * 100) : 0)
                    const days = daysLeft(t.deadline)
                    return (
                      <div
                        key={t.id}
                        className={`bg-white rounded-2xl border p-5 shadow-sm ${t.completed ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-100'}`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-sm font-semibold ${t.completed ? 'text-emerald-700 line-through' : 'text-gray-800'}`}>
                                {t.title}
                              </span>
                              {t.completed && (
                                <span className="flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-lg font-semibold">
                                  <CheckCircle2 size={10} /> Done
                                </span>
                              )}
                              {!t.completed && days !== null && days <= 3 && days >= 0 && (
                                <span className="flex items-center gap-1 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-lg font-semibold">
                                  <Flame size={10} /> {days === 0 ? 'Due today' : `${days}d left`}
                                </span>
                              )}
                              {!t.completed && days !== null && days < 0 && (
                                <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-lg font-semibold">Overdue</span>
                              )}
                            </div>
                            {t.description && <p className="text-xs text-gray-400 mt-0.5">{t.description}</p>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => openTargetModal(t)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
                              <Pencil size={12} />
                            </button>
                            <button onClick={() => deleteTarget(t.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="mb-2">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs text-gray-500">
                              {t.current_value} / {t.target_value} {t.unit}
                            </span>
                            <span className={`text-xs font-bold ${pct >= 100 ? 'text-emerald-600' : pct >= 60 ? 'text-blue-600' : 'text-gray-500'}`}>
                              {pct}%
                            </span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-blue-500' : 'bg-amber-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>

                        {/* Inline progress update */}
                        {!t.completed && (
                          progressEdit?.id === t.id ? (
                            <div className="flex items-center gap-2 mt-2">
                              <input
                                type="number"
                                value={progressEdit.val}
                                onChange={e => setProgressEdit({ id: t.id, val: e.target.value })}
                                onKeyDown={e => { if (e.key === 'Enter') saveProgress(t.id, progressEdit.val); if (e.key === 'Escape') setProgressEdit(null) }}
                                className="w-28 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                                autoFocus
                                min={0}
                                max={t.target_value}
                              />
                              <button
                                onClick={() => saveProgress(t.id, progressEdit.val)}
                                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setProgressEdit(null)}
                                className="px-3 py-1.5 text-gray-500 text-xs font-medium hover:text-gray-700"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setProgressEdit({ id: t.id, val: String(t.current_value) })}
                              className="text-xs text-blue-600 hover:text-blue-700 font-medium mt-1"
                            >
                              Update progress
                            </button>
                          )
                        )}

                        {t.deadline && (
                          <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                            <Clock size={10} />
                            Deadline: {new Date(t.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── PERFORMANCE TAB ─────────────────────────────────────────── */}
          {tab === 'performance' && (
            <div className="space-y-6 animate-fade-in-up">
              {perfLoading || !perf ? (
                <div className="flex items-center justify-center h-48 text-gray-400">
                  <Loader2 size={22} className="animate-spin mr-2" /> Loading performance data…
                </div>
              ) : (
                <>
                  {/* ── Evaluation Mode Card ─────────────────────────────── */}
                  {(() => {
                    const ev = perf.evaluation
                    const colorMap: Record<string, { ring: string; bg: string; text: string; bar: string; badge: string }> = {
                      green: { ring: 'ring-emerald-200', bg: 'bg-emerald-50',  text: 'text-emerald-700', bar: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700' },
                      blue:  { ring: 'ring-blue-200',    bg: 'bg-blue-50',     text: 'text-blue-700',    bar: 'bg-blue-500',    badge: 'bg-blue-100 text-blue-700' },
                      amber: { ring: 'ring-amber-200',   bg: 'bg-amber-50',    text: 'text-amber-700',   bar: 'bg-amber-500',   badge: 'bg-amber-100 text-amber-700' },
                      red:   { ring: 'ring-red-200',     bg: 'bg-red-50',      text: 'text-red-700',     bar: 'bg-red-500',     badge: 'bg-red-100 text-red-700' },
                    }
                    const c = colorMap[ev.color] || colorMap.blue
                    const breakdown = [
                      { label: 'Work Hours',    score: ev.breakdown.hours,       max: 25 },
                      { label: 'Task Completion', score: ev.breakdown.tasks,     max: 25 },
                      { label: 'Report Compliance', score: ev.breakdown.compliance, max: 20 },
                      { label: 'Tracking Tools', score: ev.breakdown.tools,      max: 15 },
                      { label: 'Reliability',   score: ev.breakdown.reliability, max: 15 },
                    ]
                    return (
                      <div className={`bg-white rounded-2xl border shadow-sm ring-1 ${c.ring} p-5`}>
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${c.bg}`}>
                              <Zap size={17} className={c.text} />
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Evaluation Mode</p>
                              <p className={`text-lg font-bold ${c.text}`}>{ev.label}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`text-3xl font-black ${c.text}`}>{ev.score}</p>
                            <p className="text-xs text-gray-400 font-medium">/ 100</p>
                          </div>
                        </div>
                        {/* Score bar */}
                        <div className="w-full h-2 bg-gray-100 rounded-full mb-4 overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-700 ${c.bar}`} style={{ width: `${ev.score}%` }} />
                        </div>
                        {/* Breakdown */}
                        <div className="grid grid-cols-5 gap-2">
                          {breakdown.map(b => (
                            <div key={b.label} className="text-center">
                              <p className={`text-sm font-bold ${c.text}`}>{b.score}<span className="text-xs font-normal text-gray-400">/{b.max}</span></p>
                              <p className="text-xs text-gray-400 leading-tight mt-0.5">{b.label}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}

                  {/* ── Tracking Tools Coverage ──────────────────────────── */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-800">Tracking Tools Linked</h3>
                      <span className="text-xs text-gray-400">{perf.tracking_tools.total_tracking}/3 tracked types</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { key: 'github', label: 'GitHub',       icon: <Github size={18} />,   count: perf.tracking_tools.github,  color: 'text-gray-800 bg-gray-100',    active: 'ring-2 ring-gray-400' },
                        { key: 'sheets', label: 'Google Sheets', icon: <Sheet size={18} />,    count: perf.tracking_tools.sheets,  color: 'text-emerald-700 bg-emerald-50', active: 'ring-2 ring-emerald-400' },
                        { key: 'docs',   label: 'Google Docs',  icon: <FileText size={18} />, count: perf.tracking_tools.docs,    color: 'text-blue-700 bg-blue-50',     active: 'ring-2 ring-blue-400' },
                      ].map(tool => {
                        const linked = tool.count > 0
                        return (
                          <div key={tool.key} className={`flex flex-col items-center gap-2 p-3 rounded-xl border ${linked ? tool.active + ' border-transparent' : 'border-gray-100 opacity-40'}`}>
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tool.color}`}>{tool.icon}</div>
                            <p className="text-xs font-semibold text-gray-700 text-center leading-tight">{tool.label}</p>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${linked ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                              {linked ? `${tool.count} linked` : 'None'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    {perf.tracking_tools.total_tracking < 3 && (
                      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mt-3 flex items-center gap-1.5">
                        <AlertTriangle size={12} />
                        Add more tracking tools in the Workspace tab to improve your evaluation score.
                      </p>
                    )}
                  </div>

                  {/* ── Stat cards ───────────────────────────────────────── */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: 'Tasks Done',        value: perf.tasks.done,              sub: `${perf.tasks.completion_rate}% completion`,  icon: <CheckCircle2 size={16} />, color: 'bg-emerald-50 text-emerald-600' },
                      { label: 'Done This Month',   value: perf.tasks.done_this_month,   sub: `${perf.tasks.in_progress} in progress`,       icon: <TrendingUp size={16} />,   color: 'bg-blue-50 text-blue-600' },
                      { label: 'Hours Logged',      value: `${perf.tasks.total_hours}h`, sub: `${perf.reports.avg_hours_day}h avg/day`,      icon: <Clock size={16} />,        color: 'bg-purple-50 text-purple-600' },
                      { label: 'Reports This Month',value: perf.reports.this_month,      sub: `${perf.reports.this_week} this week`,          icon: <BarChart3 size={16} />,    color: 'bg-amber-50 text-amber-600' },
                    ].map(card => (
                      <div key={card.label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-3 ${card.color}`}>{card.icon}</div>
                        <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                        <p className="text-xs font-semibold text-gray-500 mt-0.5">{card.label}</p>
                        <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
                      </div>
                    ))}
                  </div>

                  {/* Alert row */}
                  {(perf.tasks.overdue > 0 || perf.tasks.blocked > 0) && (
                    <div className="flex flex-wrap gap-3">
                      {perf.tasks.overdue > 0 && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-2.5 rounded-xl font-medium">
                          <AlertTriangle size={14} />
                          {perf.tasks.overdue} overdue task{perf.tasks.overdue > 1 ? 's' : ''}
                        </div>
                      )}
                      {perf.tasks.blocked > 0 && (
                        <div className="flex items-center gap-2 bg-orange-50 border border-orange-100 text-orange-700 text-sm px-4 py-2.5 rounded-xl font-medium">
                          <AlertTriangle size={14} />
                          {perf.tasks.blocked} blocked task{perf.tasks.blocked > 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Mood trend */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                      <h3 className="text-sm font-semibold text-gray-800 mb-4">Mood — Last 30 Days</h3>
                      {perf.mood_trend.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-8">No report data yet</p>
                      ) : (
                        <div className="space-y-2">
                          {perf.mood_trend.slice(-14).reverse().map((m, i) => {
                            const meta = MOOD_META[m.mood]
                            return (
                              <div key={i} className="flex items-center gap-3">
                                <span className="text-xs text-gray-400 w-16 shrink-0">
                                  {new Date(m.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                                {meta ? (
                                  <span className={`flex items-center gap-1.5 text-xs font-medium ${meta.color}`}>
                                    {meta.icon} {meta.label}
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-300">—</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Recent completed tasks */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                      <h3 className="text-sm font-semibold text-gray-800 mb-4">Recently Completed Tasks</h3>
                      {perf.recent_completed.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-8">No completed tasks yet</p>
                      ) : (
                        <div className="space-y-2.5">
                          {perf.recent_completed.map(t => (
                            <div key={t.id} className="flex items-center gap-3">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[t.priority] || 'bg-gray-300'}`} />
                              <span className="text-sm text-gray-700 flex-1 truncate">{t.title}</span>
                              <span className="text-xs text-gray-400 shrink-0">
                                {new Date(t.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── SHEETS TAB ──────────────────────────────────────────────── */}
          {tab === 'sheets' && (
            <div className="animate-fade-in-up">
              <SheetsPage />
            </div>
          )}
        </>
      )}

      {/* ── Link Modal ──────────────────────────────────────────────────────── */}
      {linkModal && (
        <Modal onClose={() => setLinkModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">{linkEdit ? 'Edit Link' : 'Add Link'}</h3>
              <button onClick={() => setLinkModal(false)} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  value={linkForm.title}
                  onChange={e => setLinkForm({ ...linkForm, title: e.target.value })}
                  placeholder="e.g. Project Spec Doc"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                <input
                  value={linkForm.url}
                  onChange={e => setLinkForm({ ...linkForm, url: e.target.value })}
                  placeholder="https://docs.google.com/..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                <div className="flex gap-2">
                  {([
                    { value: 'github', label: 'GitHub',        icon: <Github size={13} /> },
                    { value: 'docs',   label: 'Google Docs',   icon: <FileText size={13} /> },
                    { value: 'sheets', label: 'Google Sheets', icon: <Sheet size={13} /> },
                    { value: 'other',  label: 'Other',         icon: <Link2 size={13} /> },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setLinkForm({ ...linkForm, link_type: opt.value })}
                      className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-medium border transition-all ${
                        linkForm.link_type === opt.value
                          ? 'border-blue-300 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {opt.icon}{opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setLinkModal(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
              <button
                onClick={saveLink}
                disabled={!linkForm.title.trim() || !linkForm.url.trim() || linkSaving}
                className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-all"
              >
                {linkSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                {linkEdit ? 'Save' : 'Add Link'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Note Modal ──────────────────────────────────────────────────────── */}
      {noteModal && (
        <Modal onClose={() => setNoteModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">{noteEdit ? 'Edit Note' : 'New Note'}</h3>
              <button onClick={() => setNoteModal(false)} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                <textarea
                  value={noteForm.content}
                  onChange={e => setNoteForm({ ...noteForm, content: e.target.value })}
                  placeholder="Write your note here…"
                  rows={5}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 resize-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
                <div className="flex gap-2">
                  {Object.entries(NOTE_COLORS).map(([key, c]) => (
                    <button
                      key={key}
                      onClick={() => setNoteForm({ ...noteForm, color: key })}
                      className={`w-7 h-7 rounded-full ${c.btn} transition-transform ${noteForm.color === key ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : 'hover:scale-110'}`}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setNoteModal(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
              <button
                onClick={saveNote}
                disabled={!noteForm.content.trim() || noteSaving}
                className="flex items-center gap-2 bg-amber-500 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 transition-all"
              >
                {noteSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                {noteEdit ? 'Save' : 'Add Note'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Target Modal ────────────────────────────────────────────────────── */}
      {targetModal && (
        <Modal onClose={() => setTargetModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">{targetEdit ? 'Edit Target' : 'New Target'}</h3>
              <button onClick={() => setTargetModal(false)} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  value={targetForm.title}
                  onChange={e => setTargetForm({ ...targetForm, title: e.target.value })}
                  placeholder="e.g. Complete 20 tasks this month"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  value={targetForm.description}
                  onChange={e => setTargetForm({ ...targetForm, description: e.target.value })}
                  placeholder="Any extra details…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Value</label>
                  <input
                    type="number"
                    value={targetForm.target_value}
                    min={1}
                    onChange={e => setTargetForm({ ...targetForm, target_value: Number(e.target.value) })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                  <select
                    value={targetForm.unit}
                    onChange={e => setTargetForm({ ...targetForm, unit: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  >
                    <option value="tasks">tasks</option>
                    <option value="hours">hours</option>
                    <option value="reports">reports</option>
                    <option value="%">%</option>
                    <option value="custom">custom</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Deadline <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="date"
                  value={targetForm.deadline}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setTargetForm({ ...targetForm, deadline: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setTargetModal(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
              <button
                onClick={saveTarget}
                disabled={!targetForm.title.trim() || targetForm.target_value <= 0 || targetSaving}
                className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-all"
              >
                {targetSaving ? <Loader2 size={13} className="animate-spin" /> : <Target size={13} />}
                {targetEdit ? 'Save' : 'Create Target'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default PersonalPage
