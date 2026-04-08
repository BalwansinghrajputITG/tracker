import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  ExternalLink, RefreshCw, Plus, CheckSquare, Square, MessageSquare,
  Calendar, Users, FolderOpen, Link2, LogOut, Loader2, Send, X,
  Clock, User, FileText, Upload, Flame, HelpCircle, Layout,
  ChevronRight, ChevronDown, Eye,
} from 'lucide-react'
import { api } from '../utils/api'
import { sanitizeHtml } from '../utils/sanitize'
import { useToast, ConfirmDialog } from '../components/shared'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BCStatus {
  connected: boolean; account_id?: string; account_name?: string
  identity?: { name?: string; email_address?: string; avatar_url?: string }
  connected_at?: string
}
interface BCProject {
  id: number; name: string; description: string; status: string
  created_at: string; updated_at: string; purpose: string
  dock: { name: string; id: number; title: string; enabled: boolean }[]
}
interface BCTodoList { id: number; title: string; description: string; todos_count: number; completed_ratio: string }
interface BCTodo {
  id: number; content: string; description: string; completed: boolean
  due_on: string | null; assignees: { name: string; avatar_url?: string }[]
  creator: { name: string }; created_at: string
}
interface BCMessage {
  id: number; subject: string; content: string
  creator: { name: string; avatar_url?: string }; created_at: string; comments_count: number
}
interface BCEntry {
  id: number; title: string; starts_at: string; ends_at: string
  all_day: boolean; description: string; creator: { name: string }
}
interface BCPerson {
  id: number; name: string; email_address: string; title: string
  avatar_url?: string; company: { name?: string }
}
interface BCLine {
  id: number; content: string; creator: { name: string; avatar_url?: string }; created_at: string
}
interface BCDocument {
  id: number; title: string; content: string
  creator: { name: string; avatar_url?: string }; created_at: string; updated_at: string
}
interface BCUpload {
  id: number; filename: string; content_type: string; byte_size: number
  download_url: string; creator: { name: string }; created_at: string
}
interface BCComment {
  id: number; content: string; creator: { name: string; avatar_url?: string }; created_at: string
}
interface BCQuestion {
  id: number; title: string; schedule: { frequency: string }
  creator: { name: string }; created_at: string
}
interface BCAnswer {
  id: number; content: string; creator: { name: string; avatar_url?: string }; created_at: string
}
interface BCCardColumn {
  id: number; title: string; color: string
  cards: { id: number; title: string; due_on?: string; assignees?: { name: string }[] }[]
}

type TabKey = 'todos' | 'campfire' | 'messages' | 'documents' | 'files' | 'schedule' | 'checkins' | 'kanban' | 'people'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (s: string) => !s ? '' : new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const fmtTime = (s: string) => !s ? '' : new Date(s).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
const fmtBytes = (n: number) => n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n > 1e3 ? `${(n / 1e3).toFixed(0)} KB` : `${n} B`

function stripHtml(html: string) {
  const d = document.createElement('div'); d.innerHTML = html; return d.textContent || ''
}

const BC_GREEN = 'linear-gradient(135deg, #0a9a45, #1db954)'
const Spinner = () => <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-green-500" /></div>
const Empty = ({ text }: { text: string }) => (
  <div className="text-center py-12 text-gray-400">
    <FolderOpen size={24} className="mx-auto mb-2 text-gray-200" />
    <p className="text-sm">{text}</p>
  </div>
)
const SectionHead = ({ title, count, action }: { title: string; count?: number; action?: React.ReactNode }) => (
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-center gap-2">
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      {count !== undefined && <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">{count}</span>}
    </div>
    {action}
  </div>
)
const Avatar = ({ name, url, size = 7 }: { name: string; url?: string; size?: number }) =>
  url
    ? <img src={url} alt={name} className={`w-${size} h-${size} rounded-lg object-cover shrink-0`} />
    : <div className={`w-${size} h-${size} rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0`} style={{ background: BC_GREEN }}>{name?.[0]?.toUpperCase()}</div>

const AddBtn = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button onClick={onClick} className="flex items-center gap-1.5 text-xs font-semibold text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-xl transition-all">
    <Plus size={13} /> {label}
  </button>
)

// ─── Todos Tab ────────────────────────────────────────────────────────────────

const TodosTab: React.FC<{ project: BCProject }> = ({ project }) => {
  const toast = useToast()
  const [lists, setLists] = useState<BCTodoList[]>([])
  const [activeList, setActiveList] = useState<BCTodoList | null>(null)
  const [todos, setTodos] = useState<BCTodo[]>([])
  const [loadingLists, setLoadingLists] = useState(true)
  const [loadingTodos, setLoadingTodos] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [newDue, setNewDue] = useState('')
  const [creating, setCreating] = useState(false)
  const [expandedTodo, setExpandedTodo] = useState<number | null>(null)
  const [comments, setComments] = useState<Record<number, BCComment[]>>({})
  const [newComment, setNewComment] = useState<Record<number, string>>({})
  const [postingComment, setPostingComment] = useState<number | null>(null)

  useEffect(() => {
    setLoadingLists(true)
    api.get(`/basecamp/projects/${project.id}/todolists`)
      .then(r => {
        const lst: BCTodoList[] = r.data.todolists || []
        setLists(lst)
        if (lst[0]) { setActiveList(lst[0]); loadTodos(lst[0].id) }
      })
      .catch(() => toast.error('Failed to load todo lists'))
      .finally(() => setLoadingLists(false))
  }, [project.id])

  const loadTodos = (listId: number) => {
    setLoadingTodos(true)
    api.get(`/basecamp/projects/${project.id}/todolists/${listId}/todos`)
      .then(r => setTodos(r.data.todos || []))
      .catch(() => toast.error('Failed to load todos'))
      .finally(() => setLoadingTodos(false))
  }

  const toggleTodo = async (todo: BCTodo) => {
    try {
      if (todo.completed) await api.delete(`/basecamp/projects/${project.id}/todos/${todo.id}/complete`)
      else await api.post(`/basecamp/projects/${project.id}/todos/${todo.id}/complete`)
      setTodos(p => p.map(t => t.id === todo.id ? { ...t, completed: !t.completed } : t))
    } catch { toast.error('Failed to update todo') }
  }

  const createTodo = async () => {
    if (!newContent.trim() || !activeList) return
    setCreating(true)
    try {
      const r = await api.post(`/basecamp/projects/${project.id}/todolists/${activeList.id}/todos`, { content: newContent.trim(), due_on: newDue || null })
      setTodos(p => [r.data, ...p])
      setNewContent(''); setNewDue(''); setShowNew(false)
      toast.success('Todo created')
    } catch { toast.error('Failed to create todo') } finally { setCreating(false) }
  }

  const loadComments = (todoId: number) => {
    if (comments[todoId]) return
    api.get(`/basecamp/projects/${project.id}/recordings/${todoId}/comments`)
      .then(r => setComments(p => ({ ...p, [todoId]: r.data.comments || [] })))
      .catch(() => toast.error('Failed to load comments'))
  }

  const postComment = async (todoId: number) => {
    const text = newComment[todoId]?.trim()
    if (!text) return
    setPostingComment(todoId)
    try {
      const r = await api.post(`/basecamp/projects/${project.id}/recordings/${todoId}/comments`, { content: text })
      setComments(p => ({ ...p, [todoId]: [...(p[todoId] || []), r.data] }))
      setNewComment(p => ({ ...p, [todoId]: '' }))
      toast.success('Comment posted')
    } catch { toast.error('Failed to post comment') } finally { setPostingComment(null) }
  }

  if (loadingLists) return <Spinner />

  return (
    <div className="space-y-4">
      {lists.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {lists.map(l => (
            <button key={l.id} onClick={() => { setActiveList(l); loadTodos(l.id) }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${activeList?.id === l.id ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {l.title} {l.completed_ratio && <span className="opacity-60">({l.completed_ratio})</span>}
            </button>
          ))}
        </div>
      )}
      <SectionHead title={activeList?.title || 'Todos'} count={todos.length} action={<AddBtn label="New Todo" onClick={() => setShowNew(v => !v)} />} />
      {showNew && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 space-y-3 animate-fade-in">
          <input autoFocus value={newContent} onChange={e => setNewContent(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createTodo()} placeholder="What needs to be done?"
            className="w-full bg-white border border-green-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
          <div className="flex gap-2">
            <input type="date" value={newDue} onChange={e => setNewDue(e.target.value)}
              className="flex-1 bg-white border border-green-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            <button onClick={createTodo} disabled={!newContent.trim() || creating}
              className="px-4 py-2 text-white rounded-xl text-sm font-semibold disabled:opacity-40 flex items-center gap-1.5 transition-all" style={{ background: BC_GREEN }}>
              {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add
            </button>
            <button onClick={() => setShowNew(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-white transition-all"><X size={14} /></button>
          </div>
        </div>
      )}
      {loadingTodos ? <Spinner /> : todos.length === 0 ? <Empty text="No todos in this list" /> : (
        <div className="space-y-2">
          {todos.map(todo => (
            <div key={todo.id} className={`rounded-2xl border transition-all ${todo.completed ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-white border-gray-100 hover:border-green-200'}`}>
              <div className="flex items-start gap-3 p-3.5">
                <button onClick={() => toggleTodo(todo)} className="mt-0.5 shrink-0 text-gray-300 hover:text-green-500 transition-colors">
                  {todo.completed ? <CheckSquare size={18} className="text-green-500" /> : <Square size={18} />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${todo.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>{todo.content}</p>
                  {todo.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{stripHtml(todo.description)}</p>}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {todo.due_on && <span className="flex items-center gap-1 text-xs text-orange-500 font-medium"><Clock size={10} /> {fmtDate(todo.due_on)}</span>}
                    {todo.assignees?.map(a => <span key={a.name} className="flex items-center gap-1 text-xs text-gray-400"><User size={10} /> {a.name}</span>)}
                    <span className="text-xs text-gray-400">{todo.creator?.name}</span>
                  </div>
                </div>
                <button onClick={() => { const next = expandedTodo === todo.id ? null : todo.id; setExpandedTodo(next); if (next) loadComments(todo.id) }}
                  className="shrink-0 text-gray-300 hover:text-gray-500 transition-colors p-1">
                  <MessageSquare size={14} />
                </button>
              </div>
              {expandedTodo === todo.id && (
                <div className="px-4 pb-4 pt-0 border-t border-gray-50">
                  <div className="space-y-2 mt-3">
                    {(comments[todo.id] || []).map(c => (
                      <div key={c.id} className="flex gap-2">
                        <Avatar name={c.creator.name} url={c.creator.avatar_url} size={6} />
                        <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2">
                          <p className="text-xs font-semibold text-gray-700">{c.creator.name}</p>
                          <p className="text-xs text-gray-600 mt-0.5">{stripHtml(c.content)}</p>
                        </div>
                      </div>
                    ))}
                    <div className="flex gap-2 mt-2">
                      <input value={newComment[todo.id] || ''} onChange={e => setNewComment(p => ({ ...p, [todo.id]: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && postComment(todo.id)} placeholder="Add a comment…"
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-green-400 bg-gray-50" />
                      <button onClick={() => postComment(todo.id)} disabled={!newComment[todo.id]?.trim() || postingComment === todo.id}
                        className="p-2 rounded-xl text-white disabled:opacity-40 transition-all" style={{ background: BC_GREEN }}>
                        {postingComment === todo.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Campfire Tab ─────────────────────────────────────────────────────────────

const CampfireTab: React.FC<{ project: BCProject }> = ({ project }) => {
  const toast = useToast()
  const [lines, setLines] = useState<BCLine[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [posting, setPosting] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.get(`/basecamp/projects/${project.id}/campfire/lines`)
      .then(r => setLines(r.data.lines || []))
      .catch(() => toast.error('Failed to load Campfire'))
      .finally(() => setLoading(false))
  }, [project.id])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [lines])

  const postLine = async () => {
    if (!input.trim()) return
    setPosting(true)
    try {
      const r = await api.post(`/basecamp/projects/${project.id}/campfire/lines`, { content: input.trim() })
      setLines(p => [...p, r.data])
      setInput('')
    } catch { toast.error('Failed to post message') } finally { setPosting(false) }
  }

  if (loading) return <Spinner />

  const hasCampfire = project.dock?.some(d => d.name === 'chat')
  if (!hasCampfire) return (
    <div className="text-center py-12 text-gray-400">
      <Flame size={24} className="mx-auto mb-2 text-gray-200" />
      <p className="text-sm">Campfire chat is not enabled for this project</p>
    </div>
  )

  return (
    <div className="flex flex-col gap-3" style={{ height: '440px' }}>
      <SectionHead title="Campfire" count={lines.length} />
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {lines.length === 0 ? <Empty text="No messages yet — say hello!" /> : lines.map(l => (
          <div key={l.id} className="flex items-start gap-2.5">
            <Avatar name={l.creator.name} url={l.creator.avatar_url} />
            <div className="flex-1 bg-gray-50 rounded-2xl rounded-tl-sm px-3.5 py-2.5">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold text-gray-700">{l.creator.name}</span>
                <span className="text-xs text-gray-400">{fmtTime(l.created_at)}</span>
              </div>
              <p className="text-sm text-gray-700 mt-0.5">{stripHtml(l.content)}</p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2 shrink-0">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && postLine()}
          placeholder="Say something…"
          className="flex-1 border border-gray-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 bg-gray-50" />
        <button onClick={postLine} disabled={!input.trim() || posting}
          className="px-4 py-2.5 rounded-2xl text-white font-semibold text-sm disabled:opacity-40 flex items-center gap-1.5 transition-all" style={{ background: BC_GREEN }}>
          {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  )
}

// ─── Messages Tab ─────────────────────────────────────────────────────────────

const MessagesTab: React.FC<{ project: BCProject }> = ({ project }) => {
  const toast = useToast()
  const [messages, setMessages] = useState<BCMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')
  const [posting, setPosting] = useState(false)
  const [expandedMsg, setExpandedMsg] = useState<number | null>(null)
  const [msgComments, setMsgComments] = useState<Record<number, BCComment[]>>({})
  const [newComment, setNewComment] = useState<Record<number, string>>({})
  const [postingComment, setPostingComment] = useState<number | null>(null)

  useEffect(() => {
    api.get(`/basecamp/projects/${project.id}/messages`)
      .then(r => setMessages(r.data.messages || []))
      .catch(() => toast.error('Failed to load messages'))
      .finally(() => setLoading(false))
  }, [project.id])

  const postMessage = async () => {
    if (!subject.trim() || !content.trim()) return
    setPosting(true)
    try {
      const r = await api.post(`/basecamp/projects/${project.id}/messages`, { subject: subject.trim(), content: content.trim() })
      setMessages(p => [r.data, ...p]); setSubject(''); setContent(''); setShowNew(false)
      toast.success('Message posted')
    } catch { toast.error('Failed to post message') } finally { setPosting(false) }
  }

  const loadMsgComments = (msgId: number) => {
    if (msgComments[msgId]) return
    api.get(`/basecamp/projects/${project.id}/recordings/${msgId}/comments`)
      .then(r => setMsgComments(p => ({ ...p, [msgId]: r.data.comments || [] })))
  }

  const postMsgComment = async (msgId: number) => {
    const text = newComment[msgId]?.trim(); if (!text) return
    setPostingComment(msgId)
    try {
      const r = await api.post(`/basecamp/projects/${project.id}/recordings/${msgId}/comments`, { content: text })
      setMsgComments(p => ({ ...p, [msgId]: [...(p[msgId] || []), r.data] }))
      setNewComment(p => ({ ...p, [msgId]: '' }))
    } catch { toast.error('Failed to post comment') } finally { setPostingComment(null) }
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-4">
      <SectionHead title="Message Board" count={messages.length} action={<AddBtn label="New Message" onClick={() => setShowNew(v => !v)} />} />
      {showNew && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 space-y-3 animate-fade-in">
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject"
            className="w-full bg-white border border-green-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-400" />
          <textarea value={content} onChange={e => setContent(e.target.value)} rows={4} placeholder="Write your message…"
            className="w-full bg-white border border-green-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowNew(false)} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-xl hover:bg-white">Cancel</button>
            <button onClick={postMessage} disabled={!subject.trim() || !content.trim() || posting}
              className="px-4 py-2 text-white rounded-xl text-sm font-semibold disabled:opacity-40 flex items-center gap-1.5" style={{ background: BC_GREEN }}>
              {posting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Post
            </button>
          </div>
        </div>
      )}
      {messages.length === 0 ? <Empty text="No messages yet" /> : messages.map(msg => (
        <div key={msg.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <button className="w-full text-left p-4" onClick={() => { const n = expandedMsg === msg.id ? null : msg.id; setExpandedMsg(n); if (n) loadMsgComments(msg.id) }}>
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-sm font-semibold text-gray-800">{msg.subject}</h4>
              <div className="flex items-center gap-2 shrink-0">
                {msg.comments_count > 0 && <span className="flex items-center gap-1 text-xs text-gray-400"><MessageSquare size={11} />{msg.comments_count}</span>}
                {expandedMsg === msg.id ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
              </div>
            </div>
            {msg.content && <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{stripHtml(msg.content)}</p>}
            <div className="flex items-center gap-2 mt-2.5">
              <Avatar name={msg.creator.name} url={msg.creator.avatar_url} size={5} />
              <span className="text-xs text-gray-400">{msg.creator?.name} · {fmtDate(msg.created_at)}</span>
            </div>
          </button>
          {expandedMsg === msg.id && (
            <div className="border-t border-gray-50 px-4 pb-4 pt-3">
              {msg.content && <div className="text-sm text-gray-700 mb-3" dangerouslySetInnerHTML={{ __html: sanitizeHtml(msg.content) }} />}
              <div className="space-y-2">
                {(msgComments[msg.id] || []).map(c => (
                  <div key={c.id} className="flex gap-2">
                    <Avatar name={c.creator.name} url={c.creator.avatar_url} size={6} />
                    <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2">
                      <p className="text-xs font-semibold text-gray-700">{c.creator.name} <span className="font-normal text-gray-400">{fmtDate(c.created_at)}</span></p>
                      <p className="text-xs text-gray-600 mt-0.5">{stripHtml(c.content)}</p>
                    </div>
                  </div>
                ))}
                <div className="flex gap-2 mt-2">
                  <input value={newComment[msg.id] || ''} onChange={e => setNewComment(p => ({ ...p, [msg.id]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && postMsgComment(msg.id)} placeholder="Reply…"
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-green-400 bg-gray-50" />
                  <button onClick={() => postMsgComment(msg.id)} disabled={!newComment[msg.id]?.trim() || postingComment === msg.id}
                    className="p-2 rounded-xl text-white disabled:opacity-40" style={{ background: BC_GREEN }}>
                    {postingComment === msg.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Documents Tab ────────────────────────────────────────────────────────────

const DocumentsTab: React.FC<{ project: BCProject }> = ({ project }) => {
  const toast = useToast()
  const [docs, setDocs] = useState<BCDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [creating, setCreating] = useState(false)
  const [viewing, setViewing] = useState<BCDocument | null>(null)

  useEffect(() => {
    api.get(`/basecamp/projects/${project.id}/documents`)
      .then(r => setDocs(r.data.documents || []))
      .catch(() => toast.error('Failed to load documents'))
      .finally(() => setLoading(false))
  }, [project.id])

  const openDoc = async (doc: BCDocument) => {
    try {
      const r = await api.get(`/basecamp/projects/${project.id}/documents/${doc.id}`)
      setViewing(r.data)
    } catch { toast.error('Failed to load document') }
  }

  const createDoc = async () => {
    if (!title.trim()) return
    setCreating(true)
    try {
      const r = await api.post(`/basecamp/projects/${project.id}/documents`, { title: title.trim(), content })
      setDocs(p => [r.data, ...p]); setTitle(''); setContent(''); setShowNew(false)
      toast.success('Document created')
    } catch { toast.error('Failed to create document') } finally { setCreating(false) }
  }

  if (loading) return <Spinner />
  if (viewing) return (
    <div className="space-y-4">
      <button onClick={() => setViewing(null)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium">← Back to documents</button>
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="text-lg font-bold text-gray-900 mb-1">{viewing.title}</h2>
        <p className="text-xs text-gray-400 mb-4">{viewing.creator?.name} · Updated {fmtDate(viewing.updated_at)}</p>
        <div className="prose prose-sm max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: sanitizeHtml(viewing.content || '<em>No content</em>') }} />
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <SectionHead title="Documents" count={docs.length} action={<AddBtn label="New Doc" onClick={() => setShowNew(v => !v)} />} />
      {showNew && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 space-y-3 animate-fade-in">
          <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Document title"
            className="w-full bg-white border border-green-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-400" />
          <textarea value={content} onChange={e => setContent(e.target.value)} rows={5} placeholder="Content (HTML supported)…"
            className="w-full bg-white border border-green-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowNew(false)} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-xl hover:bg-white">Cancel</button>
            <button onClick={createDoc} disabled={!title.trim() || creating}
              className="px-4 py-2 text-white rounded-xl text-sm font-semibold disabled:opacity-40 flex items-center gap-1.5" style={{ background: BC_GREEN }}>
              {creating ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />} Create
            </button>
          </div>
        </div>
      )}
      {docs.length === 0 ? <Empty text="No documents yet" /> : (
        <div className="space-y-2">
          {docs.map(doc => (
            <button key={doc.id} onClick={() => openDoc(doc)}
              className="w-full text-left bg-white border border-gray-100 rounded-2xl p-4 hover:border-green-200 hover:shadow-sm transition-all">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-green-50 rounded-xl flex items-center justify-center shrink-0"><FileText size={16} className="text-green-600" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{doc.title}</p>
                  <p className="text-xs text-gray-400">{doc.creator?.name} · {fmtDate(doc.updated_at)}</p>
                </div>
                <Eye size={14} className="text-gray-300 shrink-0" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Files / Uploads Tab ──────────────────────────────────────────────────────

const FilesTab: React.FC<{ project: BCProject }> = ({ project }) => {
  const toast = useToast()
  const [uploads, setUploads] = useState<BCUpload[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/basecamp/projects/${project.id}/uploads`)
      .then(r => setUploads(r.data.uploads || []))
      .catch(() => toast.error('Failed to load files'))
      .finally(() => setLoading(false))
  }, [project.id])

  const ext = (filename: string) => filename.split('.').pop()?.toUpperCase() || 'FILE'
  const extColor = (filename: string) => {
    const e = ext(filename).toLowerCase()
    if (['pdf'].includes(e)) return 'bg-red-50 text-red-600'
    if (['doc', 'docx'].includes(e)) return 'bg-blue-50 text-blue-600'
    if (['xls', 'xlsx', 'csv'].includes(e)) return 'bg-green-50 text-green-600'
    if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(e)) return 'bg-purple-50 text-purple-600'
    if (['zip', 'rar', 'tar'].includes(e)) return 'bg-orange-50 text-orange-600'
    return 'bg-gray-50 text-gray-500'
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-4">
      <SectionHead title="Files & Uploads" count={uploads.length} />
      {uploads.length === 0 ? <Empty text="No files uploaded yet" /> : (
        <div className="space-y-2">
          {uploads.map(u => (
            <div key={u.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl p-3.5 hover:border-green-200 transition-all">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${extColor(u.filename)}`}>{ext(u.filename)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{u.filename}</p>
                <p className="text-xs text-gray-400">{u.creator?.name} · {fmtDate(u.created_at)} · {fmtBytes(u.byte_size)}</p>
              </div>
              <a href={u.download_url} target="_blank" rel="noreferrer"
                className="shrink-0 flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-semibold px-2.5 py-1.5 rounded-xl bg-green-50 hover:bg-green-100 transition-all">
                <Upload size={12} /> Download
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Schedule Tab ─────────────────────────────────────────────────────────────

const ScheduleTab: React.FC<{ project: BCProject }> = ({ project }) => {
  const toast = useToast()
  const [entries, setEntries] = useState<BCEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ summary: '', starts_at: '', ends_at: '', all_day: false, description: '' })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    api.get(`/basecamp/projects/${project.id}/schedule`)
      .then(r => setEntries(r.data.entries || []))
      .catch(() => toast.error('Failed to load schedule'))
      .finally(() => setLoading(false))
  }, [project.id])

  const createEntry = async () => {
    if (!form.summary.trim() || !form.starts_at || !form.ends_at) return
    setCreating(true)
    try {
      const r = await api.post(`/basecamp/projects/${project.id}/schedule/entries`, {
        summary: form.summary.trim(), starts_at: form.starts_at, ends_at: form.ends_at,
        all_day: form.all_day, description: form.description,
      })
      setEntries(p => [r.data, ...p]); setShowNew(false); setForm({ summary: '', starts_at: '', ends_at: '', all_day: false, description: '' })
      toast.success('Event created')
    } catch { toast.error('Failed to create event') } finally { setCreating(false) }
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-4">
      <SectionHead title="Schedule" count={entries.length} action={<AddBtn label="New Event" onClick={() => setShowNew(v => !v)} />} />
      {showNew && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 space-y-3 animate-fade-in">
          <input value={form.summary} onChange={e => setForm(p => ({ ...p, summary: e.target.value }))} placeholder="Event title"
            className="w-full bg-white border border-green-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-400" />
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-gray-500 font-medium mb-1 block">Starts</label>
              <input type="datetime-local" value={form.starts_at} onChange={e => setForm(p => ({ ...p, starts_at: e.target.value }))}
                className="w-full bg-white border border-green-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" /></div>
            <div><label className="text-xs text-gray-500 font-medium mb-1 block">Ends</label>
              <input type="datetime-local" value={form.ends_at} onChange={e => setForm(p => ({ ...p, ends_at: e.target.value }))}
                className="w-full bg-white border border-green-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" /></div>
          </div>
          <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Description (optional)"
            className="w-full bg-white border border-green-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none" />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={form.all_day} onChange={e => setForm(p => ({ ...p, all_day: e.target.checked }))} className="rounded" />
              All-day event
            </label>
            <div className="flex gap-2">
              <button onClick={() => setShowNew(false)} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-xl hover:bg-white">Cancel</button>
              <button onClick={createEntry} disabled={!form.summary.trim() || !form.starts_at || !form.ends_at || creating}
                className="px-4 py-2 text-white rounded-xl text-sm font-semibold disabled:opacity-40 flex items-center gap-1.5" style={{ background: BC_GREEN }}>
                {creating ? <Loader2 size={13} className="animate-spin" /> : <Calendar size={13} />} Create
              </button>
            </div>
          </div>
        </div>
      )}
      {entries.length === 0 ? <Empty text="No upcoming events" /> : (
        <div className="space-y-3">
          {entries.map(e => (
            <div key={e.id} className="flex gap-3 bg-white border border-gray-100 rounded-2xl p-4 hover:border-green-200 transition-all">
              <div className="w-11 h-11 bg-green-50 rounded-xl flex flex-col items-center justify-center shrink-0 border border-green-100">
                <span className="text-xs font-bold text-green-600 leading-tight">{new Date(e.starts_at).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</span>
                <span className="text-base font-black text-green-700 leading-tight">{new Date(e.starts_at).getDate()}</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-800">{e.title}</p>
                {e.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{stripHtml(e.description)}</p>}
                <div className="flex items-center gap-3 mt-1.5">
                  {e.all_day ? <span className="text-xs text-gray-400">All day</span> : (
                    <span className="text-xs text-gray-400">{fmtTime(e.starts_at)} – {fmtTime(e.ends_at)}</span>
                  )}
                  <span className="text-xs text-gray-400">· {e.creator?.name}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Check-ins Tab ────────────────────────────────────────────────────────────

const CheckInsTab: React.FC<{ project: BCProject }> = ({ project }) => {
  const toast = useToast()
  const [questions, setQuestions] = useState<BCQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [answers, setAnswers] = useState<Record<number, BCAnswer[]>>({})
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    api.get(`/basecamp/projects/${project.id}/questionnaires`)
      .then(r => setQuestions(r.data.questions || []))
      .catch(() => toast.error('Failed to load check-ins'))
      .finally(() => setLoading(false))
  }, [project.id])

  const loadAnswers = (qId: number) => {
    if (answers[qId]) return
    api.get(`/basecamp/projects/${project.id}/questionnaires/${qId}/answers`)
      .then(r => setAnswers(p => ({ ...p, [qId]: r.data.answers || [] })))
      .catch(() => toast.error('Failed to load answers'))
  }

  const hasCheckins = project.dock?.some(d => d.name === 'questionnaire')
  if (loading) return <Spinner />
  if (!hasCheckins) return (
    <div className="text-center py-12 text-gray-400">
      <HelpCircle size={24} className="mx-auto mb-2 text-gray-200" />
      <p className="text-sm">Automatic check-ins are not enabled for this project</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <SectionHead title="Automatic Check-ins" count={questions.length} />
      {questions.length === 0 ? <Empty text="No check-in questions yet" /> : questions.map(q => (
        <div key={q.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <button className="w-full text-left p-4 flex items-center justify-between"
            onClick={() => { const n = expanded === q.id ? null : q.id; setExpanded(n); if (n) loadAnswers(q.id) }}>
            <div>
              <p className="text-sm font-semibold text-gray-800">{q.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">{q.schedule?.frequency} · by {q.creator?.name}</p>
            </div>
            {expanded === q.id ? <ChevronDown size={16} className="text-gray-400 shrink-0" /> : <ChevronRight size={16} className="text-gray-400 shrink-0" />}
          </button>
          {expanded === q.id && (
            <div className="border-t border-gray-50 px-4 pb-4 pt-3 space-y-3">
              {(answers[q.id] || []).length === 0 ? <p className="text-xs text-gray-400 text-center py-2">No answers yet</p>
                : (answers[q.id] || []).map(a => (
                  <div key={a.id} className="flex gap-2.5">
                    <Avatar name={a.creator.name} url={a.creator.avatar_url} />
                    <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2.5">
                      <p className="text-xs font-semibold text-gray-700">{a.creator.name} <span className="font-normal text-gray-400">· {fmtDate(a.created_at)}</span></p>
                      <p className="text-sm text-gray-700 mt-1">{stripHtml(a.content)}</p>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Kanban / Card Tables Tab ─────────────────────────────────────────────────

const KanbanTab: React.FC<{ project: BCProject }> = ({ project }) => {
  const toast = useToast()
  const [columns, setColumns] = useState<BCCardColumn[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/basecamp/projects/${project.id}/card_tables`)
      .then(r => setColumns(r.data.columns || []))
      .catch(() => toast.error('Failed to load kanban'))
      .finally(() => setLoading(false))
  }, [project.id])

  const hasKanban = project.dock?.some(d => d.name === 'kanban_board')
  if (loading) return <Spinner />
  if (!hasKanban) return (
    <div className="text-center py-12 text-gray-400">
      <Layout size={24} className="mx-auto mb-2 text-gray-200" />
      <p className="text-sm">Card table (Kanban) is not enabled for this project</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <SectionHead title="Card Table" />
      {columns.length === 0 ? <Empty text="No columns in this card table" /> : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map(col => (
            <div key={col.id} className="min-w-[200px] w-52 shrink-0">
              <div className="flex items-center gap-2 mb-2.5 px-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: col.color || '#94a3b8' }} />
                <span className="text-xs font-semibold text-gray-700">{col.title}</span>
                <span className="text-xs text-gray-400 ml-auto">{col.cards?.length || 0}</span>
              </div>
              <div className="space-y-2">
                {(col.cards || []).map(card => (
                  <div key={card.id} className="bg-white border border-gray-100 rounded-xl p-3 hover:border-green-200 transition-all shadow-sm">
                    <p className="text-xs font-medium text-gray-800 leading-snug">{card.title}</p>
                    {card.due_on && <p className="text-xs text-orange-400 mt-1.5 flex items-center gap-1"><Clock size={9} /> {fmtDate(card.due_on)}</p>}
                    {(card.assignees || []).length > 0 && (
                      <div className="flex gap-1 mt-1.5">
                        {card.assignees?.slice(0, 3).map(a => (
                          <div key={a.name} className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: BC_GREEN }}>
                            {a.name[0]?.toUpperCase()}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── People Tab ───────────────────────────────────────────────────────────────

const PeopleTab: React.FC<{ project: BCProject }> = ({ project }) => {
  const toast = useToast()
  const [people, setPeople] = useState<BCPerson[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    // Load project-specific people first, fall back to account people
    api.get(`/basecamp/projects/${project.id}/people`)
      .then(r => setPeople(r.data.people || []))
      .catch(() => api.get('/basecamp/people').then(r => setPeople(r.data.people || [])).catch(() => toast.error('Failed to load people')))
      .finally(() => setLoading(false))
  }, [project.id])

  const filtered = people.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.email_address?.toLowerCase().includes(search.toLowerCase()) ||
    p.title?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <Spinner />

  return (
    <div className="space-y-4">
      <SectionHead title="People" count={people.length}
        action={<button onClick={() => setShowAll(v => !v)} className="text-xs text-gray-400 hover:text-gray-600 font-medium transition-colors">{showAll ? 'Account' : 'Project'}</button>}
      />
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search people…"
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 bg-gray-50" />
      {filtered.length === 0 ? <Empty text="No people found" /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {filtered.map(p => (
            <div key={p.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl p-3.5 hover:border-green-200 transition-all">
              {p.avatar_url
                ? <img src={p.avatar_url} alt={p.name} className="w-10 h-10 rounded-xl object-cover shrink-0" />
                : <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ background: BC_GREEN }}>{p.name?.[0]?.toUpperCase()}</div>}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                {p.title && <p className="text-xs text-gray-500 truncate">{p.title}</p>}
                <p className="text-xs text-gray-400 truncate">{p.email_address}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string; icon: React.ReactNode; dock?: string }[] = [
  { key: 'todos',     label: 'Todos',       icon: <CheckSquare size={14} />,   dock: 'todoset'       },
  { key: 'campfire',  label: 'Campfire',    icon: <Flame size={14} />,         dock: 'chat'          },
  { key: 'messages',  label: 'Messages',    icon: <MessageSquare size={14} />, dock: 'message_board' },
  { key: 'documents', label: 'Documents',   icon: <FileText size={14} />,      dock: 'vault'         },
  { key: 'files',     label: 'Files',       icon: <Upload size={14} />,        dock: 'vault'         },
  { key: 'schedule',  label: 'Schedule',    icon: <Calendar size={14} />,      dock: 'schedule'      },
  { key: 'checkins',  label: 'Check-ins',   icon: <HelpCircle size={14} />,    dock: 'questionnaire' },
  { key: 'kanban',    label: 'Kanban',      icon: <Layout size={14} />,        dock: 'kanban_board'  },
  { key: 'people',    label: 'People',      icon: <Users size={14} /> },
]

export const BasecampPage: React.FC = () => {
  const toast = useToast()
  const [status, setStatus]       = useState<BCStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [projects, setProjects]   = useState<BCProject[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [selectedProject, setSelectedProject] = useState<BCProject | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('todos')
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectDesc, setNewProjectDesc] = useState('')
  const [creatingProject, setCreatingProject] = useState(false)

  useEffect(() => {
    api.get('/basecamp/status')
      .then(r => { setStatus(r.data); if (r.data.connected) loadProjects() })
      .catch(() => setStatus({ connected: false }))
      .finally(() => setStatusLoading(false))
  }, [])

  const loadProjects = useCallback(() => {
    setProjectsLoading(true)
    api.get('/basecamp/projects')
      .then(r => {
        const list: BCProject[] = r.data.projects || []
        setProjects(list)
        if (list[0] && !selectedProject) setSelectedProject(list[0])
      })
      .catch(() => toast.error('Failed to load Basecamp projects'))
      .finally(() => setProjectsLoading(false))
  }, [selectedProject])

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return
    setCreatingProject(true)
    try {
      const r = await api.post('/basecamp/projects', {
        name: newProjectName.trim(),
        description: newProjectDesc.trim(),
      })
      const created: BCProject = r.data
      setProjects(prev => [created, ...prev])
      setSelectedProject(created)
      setActiveTab('todos')
      setNewProjectName('')
      setNewProjectDesc('')
      setShowNewProject(false)
      toast.success(`Project "${created.name}" created!`)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to create project')
    } finally {
      setCreatingProject(false)
    }
  }

  const handleConnect = async () => {
    setConnecting(true)
    try {
      const r = await api.get('/basecamp/auth/url')

      // Open OAuth in a popup — user stays on this page the whole time
      const popup = window.open(
        r.data.url,
        'basecamp_oauth',
        'width=620,height=700,scrollbars=yes,resizable=yes,left=' +
          Math.round(window.screenX + (window.outerWidth - 620) / 2) +
          ',top=' +
          Math.round(window.screenY + (window.outerHeight - 700) / 2),
      )

      if (!popup) {
        // Popup blocked — fall back to full redirect
        window.location.href = r.data.url
        return
      }

      // Listen for postMessage from BasecampCallbackPage inside the popup
      const handler = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return
        if (event.data?.type !== 'basecamp_oauth') return
        window.removeEventListener('message', handler)
        setConnecting(false)

        if (event.data.success) {
          const newStatus: BCStatus = {
            connected: true,
            account_id:   event.data.account_id,
            account_name: event.data.account_name,
            identity:     event.data.identity,
          }
          setStatus(newStatus)
          loadProjects()
          toast.success(`Connected to ${event.data.account_name || 'Basecamp'}!`)
        } else {
          toast.error(event.data.error || 'Basecamp authorization failed.')
        }
      }
      window.addEventListener('message', handler)

      // Clean up if the popup is closed manually before completing
      const pollClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(pollClosed)
          window.removeEventListener('message', handler)
          setConnecting(false)
        }
      }, 500)
    } catch {
      toast.error('Failed to start authorization')
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    try {
      await api.delete('/basecamp/disconnect')
      setStatus({ connected: false }); setProjects([]); setSelectedProject(null)
      toast.success('Basecamp disconnected')
    } catch { toast.error('Failed to disconnect') } finally {
      setDisconnecting(false)
      setShowDisconnectConfirm(false)
    }
  }

  if (statusLoading) return <div className="flex items-center justify-center h-64"><Loader2 size={22} className="animate-spin text-green-500" /></div>

  // ── Not connected ──────────────────────────────────────────────────────────
  if (!status?.connected) {
    return (
      <div className="max-w-lg mx-auto pt-10">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in-up">
          <div className="p-8 text-center" style={{ background: BC_GREEN }}>
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/30">
              <Link2 size={28} className="text-white" />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">Connect Basecamp</h1>
            <p className="text-green-100 text-sm mt-1">Sync todos, messages, campfire, docs, schedule & more</p>
          </div>
          <div className="p-6 space-y-2.5">
            {[
              [<CheckSquare size={15} className="text-green-600" />, 'Todos with comments & assignments'],
              [<Flame size={15} className="text-orange-500" />, 'Campfire real-time project chat'],
              [<MessageSquare size={15} className="text-blue-500" />, 'Message board with threaded replies'],
              [<FileText size={15} className="text-indigo-500" />, 'Documents — view and create'],
              [<Upload size={15} className="text-purple-500" />, 'Files & uploads with downloads'],
              [<Calendar size={15} className="text-teal-500" />, 'Schedule with event creation'],
              [<HelpCircle size={15} className="text-amber-500" />, 'Automatic check-ins & answers'],
              [<Layout size={15} className="text-pink-500" />, 'Card table (Kanban) boards'],
              [<Users size={15} className="text-green-600" />, 'People across projects'],
            ].map(([icon, text], i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center shrink-0">{icon}</div>
                <span className="text-sm text-gray-600">{text as string}</span>
              </div>
            ))}
          </div>
          <div className="px-6 pb-6">
            <button onClick={handleConnect} disabled={connecting}
              className="w-full py-3.5 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] disabled:opacity-60 transition-all"
              style={{ background: BC_GREEN }}>
              {connecting ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}
              {connecting ? 'Waiting for Basecamp…' : 'Connect with Basecamp'}
            </button>
            <p className="text-xs text-center text-gray-400 mt-3">A popup will open for you to sign in to Basecamp.</p>
          </div>
        </div>
      </div>
    )
  }

  // ── Connected ──────────────────────────────────────────────────────────────
  const identity = status.identity || {}

  // Filter tabs to only those whose dock tool is present (or has no dock requirement)
  const visibleTabs = selectedProject
    ? TABS.filter(t => !t.dock || selectedProject.dock?.some(d => d.name === t.dock && d.enabled !== false))
    : TABS

  return (
    <div className="space-y-4 animate-fade-in-up">
      <ConfirmDialog
        open={showDisconnectConfirm}
        onClose={() => setShowDisconnectConfirm(false)}
        onConfirm={handleDisconnect}
        title="Disconnect Basecamp?"
        message="Your Basecamp account will be unlinked. You can reconnect at any time."
        confirmLabel="Disconnect"
        cancelLabel="Cancel"
        variant="danger"
        loading={disconnecting}
      />
      {/* Connection banner */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: BC_GREEN }}>
          <Link2 size={16} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-800">{status.account_name || 'Basecamp'}</p>
            <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">Connected</span>
          </div>
          <p className="text-xs text-gray-400">{identity.name}{identity.email_address ? ` · ${identity.email_address}` : ''}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={loadProjects} title="Refresh" className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
            <RefreshCw size={13} className={projectsLoading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowDisconnectConfirm(true)} disabled={disconnecting}
            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 font-semibold px-2.5 py-1.5 rounded-xl hover:bg-red-50 transition-all disabled:opacity-40">
            <LogOut size={12} /> Disconnect
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
        {/* Project list */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between shrink-0">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Projects</h3>
            <button
              onClick={() => setShowNewProject(v => !v)}
              className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-all"
              title="New project"
            >
              <Plus size={14} />
            </button>
          </div>

          {/* New project inline form */}
          {showNewProject && (
            <div className="px-3 py-3 border-b border-gray-50 bg-green-50/60 space-y-2">
              <input
                autoFocus
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateProject(); if (e.key === 'Escape') setShowNewProject(false) }}
                placeholder="Project name *"
                className="w-full text-xs rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
              />
              <input
                value={newProjectDesc}
                onChange={e => setNewProjectDesc(e.target.value)}
                placeholder="Description (optional)"
                className="w-full text-xs rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreateProject}
                  disabled={!newProjectName.trim() || creatingProject}
                  className="flex-1 py-1.5 rounded-xl text-xs font-bold text-white disabled:opacity-50 flex items-center justify-center gap-1 transition-all hover:opacity-90"
                  style={{ background: BC_GREEN }}
                >
                  {creatingProject ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  {creatingProject ? 'Creating…' : 'Create'}
                </button>
                <button
                  onClick={() => { setShowNewProject(false); setNewProjectName(''); setNewProjectDesc('') }}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-100 transition-all"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          )}

          {projectsLoading
            ? <div className="flex justify-center py-8"><Loader2 size={16} className="animate-spin text-green-500" /></div>
            : projects.length === 0
              ? <p className="text-xs text-center text-gray-400 py-8">No projects</p>
              : <div className="overflow-y-auto flex-1">
                  {projects.map(p => (
                    <button key={p.id} onClick={() => { setSelectedProject(p); setActiveTab('todos') }}
                      className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-0 transition-all ${
                        selectedProject?.id === p.id ? 'bg-green-50 border-l-2 border-l-green-500' : 'hover:bg-gray-50'
                      }`}>
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${selectedProject?.id === p.id ? 'text-white' : 'bg-gray-100 text-gray-500'}`}
                          style={selectedProject?.id === p.id ? { background: BC_GREEN } : {}}>
                          {p.name?.[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold truncate ${selectedProject?.id === p.id ? 'text-green-700' : 'text-gray-700'}`}>{p.name}</p>
                          <span className={`text-xs ${p.status === 'active' ? 'text-green-500' : 'text-gray-400'}`}>{p.status}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
          }
        </div>

        {/* Project content */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          {!selectedProject
            ? <div className="flex items-center justify-center h-64 text-gray-400">
                <div className="text-center"><FolderOpen size={32} className="mx-auto mb-2 text-gray-200" /><p className="text-sm">Select a project</p></div>
              </div>
            : <>
                {/* Project header */}
                <div className="px-5 pt-4 pb-0 shrink-0">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h2 className="text-base font-bold text-gray-900">{selectedProject.name}</h2>
                      {selectedProject.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{stripHtml(selectedProject.description)}</p>}
                    </div>
                    <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-xl ${selectedProject.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {selectedProject.status}
                    </span>
                  </div>
                  {/* Tabs */}
                  <div className="flex gap-0.5 overflow-x-auto scrollbar-hide border-b border-gray-100 -mx-5 px-5">
                    {visibleTabs.map(t => (
                      <button key={t.key} onClick={() => setActiveTab(t.key)}
                        className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 shrink-0 transition-all ${
                          activeTab === t.key ? 'border-green-500 text-green-700' : 'border-transparent text-gray-400 hover:text-gray-600'
                        }`}>
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Tab content */}
                <div className="flex-1 overflow-y-auto p-5">
                  {activeTab === 'todos'     && <TodosTab    key={`${selectedProject.id}-todos`}    project={selectedProject} />}
                  {activeTab === 'campfire'  && <CampfireTab key={`${selectedProject.id}-campfire`} project={selectedProject} />}
                  {activeTab === 'messages'  && <MessagesTab key={`${selectedProject.id}-messages`} project={selectedProject} />}
                  {activeTab === 'documents' && <DocumentsTab key={`${selectedProject.id}-docs`}   project={selectedProject} />}
                  {activeTab === 'files'     && <FilesTab    key={`${selectedProject.id}-files`}   project={selectedProject} />}
                  {activeTab === 'schedule'  && <ScheduleTab key={`${selectedProject.id}-sched`}   project={selectedProject} />}
                  {activeTab === 'checkins'  && <CheckInsTab key={`${selectedProject.id}-ci`}      project={selectedProject} />}
                  {activeTab === 'kanban'    && <KanbanTab   key={`${selectedProject.id}-kb`}      project={selectedProject} />}
                  {activeTab === 'people'    && <PeopleTab   key={`${selectedProject.id}-people`}  project={selectedProject} />}
                </div>
              </>
          }
        </div>
      </div>
    </div>
  )
}
