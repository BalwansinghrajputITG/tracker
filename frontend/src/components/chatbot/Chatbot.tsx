import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Bot, Trash2, Send, Sparkles, ChevronDown, Database,
  AlertCircle, Eye, ChevronLeft, Users, Clock, MessageSquare, Loader2,
  Maximize2, Minimize2, Search, Zap, BookOpen, Command,
  CheckCircle2, X, ChevronRight, TrendingUp, FileText,
  FolderOpen, BarChart3, HelpCircle, Plus, ArrowUp,
} from 'lucide-react'
import { RootState } from '../../store'
import {
  sendMessageRequest, toggleChatbot, clearHistory, BotMessage,
  setMonitorTab, fetchMonitorUsersRequest, selectMonitorUser,
  selectMonitorSession, clearMonitorSelection, MonitorUser,
} from '../../store/slices/chatbotSlice'
import { EntityCards } from './ChatbotEntityCards'

/* ─── Quick commands ────────────────────────────────────────────── */

const QUICK_COMMANDS = [
  { label: 'Delayed', cmd: '/delayed',  icon: <AlertCircle size={11} />,  color: 'text-red-500 bg-red-50 border-red-100 hover:bg-red-100' },
  { label: 'Blockers', cmd: '/blockers', icon: <Zap size={11} />,          color: 'text-amber-600 bg-amber-50 border-amber-100 hover:bg-amber-100' },
  { label: 'My Tasks', cmd: '/tasks',    icon: <CheckCircle2 size={11} />, color: 'text-blue-600 bg-blue-50 border-blue-100 hover:bg-blue-100' },
  { label: 'Reports',  cmd: '/reports',  icon: <FileText size={11} />,     color: 'text-violet-600 bg-violet-50 border-violet-100 hover:bg-violet-100' },
  { label: 'Stats',    cmd: '/stats',    icon: <BarChart3 size={11} />,    color: 'text-emerald-600 bg-emerald-50 border-emerald-100 hover:bg-emerald-100' },
  { label: 'Projects', cmd: '/project',  icon: <FolderOpen size={11} />,   color: 'text-indigo-600 bg-indigo-50 border-indigo-100 hover:bg-indigo-100' },
  { label: 'Team',     cmd: '/team',     icon: <Users size={11} />,        color: 'text-teal-600 bg-teal-50 border-teal-100 hover:bg-teal-100' },
  { label: 'Help',     cmd: '/help',     icon: <HelpCircle size={11} />,   color: 'text-gray-600 bg-gray-50 border-gray-200 hover:bg-gray-100' },
]

/* ─── Slash command palette ─────────────────────────────────────── */

interface SlashCommand { cmd: string; description: string; example?: string; category: 'read' | 'action' }

const SLASH_COMMANDS: SlashCommand[] = [
  { cmd: '/project',              description: 'All projects or full details of a specific one', example: '/project Alpha', category: 'read' },
  { cmd: '/tasks',                description: 'List tasks, filter by project or status', example: '/tasks in_progress', category: 'read' },
  { cmd: '/team',                 description: 'All teams or full details of a specific team', example: '/team Backend', category: 'read' },
  { cmd: '/employee',             description: "View an employee's profile, tasks and reports", example: '/employee John', category: 'read' },
  { cmd: '/employees',            description: 'List all active employees', category: 'read' },
  { cmd: '/delayed',              description: 'Show all delayed / overdue projects', category: 'read' },
  { cmd: '/blockers',             description: 'Show all blocked tasks across projects', category: 'read' },
  { cmd: '/reports',              description: 'View daily reports (last 7 days)', example: '/reports John', category: 'read' },
  { cmd: '/stats',                description: 'Company-wide KPIs — quick summary', category: 'read' },
  { cmd: '/analytics',            description: 'Full company analytics: projects, tasks, departments', category: 'read' },
  { cmd: '/contributor-stats',    description: 'Per-contributor commit counts for a repo', example: '/contributor-stats Alpha', category: 'read' },
  { cmd: '/commits',              description: 'Show repository commits for a project', example: '/commits Alpha', category: 'read' },
  { cmd: '/dashboard',            description: 'Your role-specific dashboard summary', category: 'read' },
  { cmd: '/notifications',        description: 'View your notifications', category: 'read' },
  { cmd: '/missing-reports',      description: "List employees who haven't submitted today's report", category: 'read' },
  { cmd: '/message',              description: 'Send a direct message to an employee', example: '/message John Hey!', category: 'read' },
  { cmd: '/help',                 description: 'Show all available commands with examples', category: 'read' },
  { cmd: '/create-project',       description: 'Create a new project', example: '/create-project Portal --priority high', category: 'action' },
  { cmd: '/edit-project',         description: 'Update a project — status, priority, progress, members', example: '/edit-project Alpha --status active --progress 60', category: 'action' },
  { cmd: '/cancel-project',       description: 'Cancel / close a project', example: '/cancel-project Alpha', category: 'action' },
  { cmd: '/update-progress',      description: "Set a project's completion percentage", example: '/update-progress Alpha 75', category: 'action' },
  { cmd: '/add-project-member',   description: 'Add a user to a project', example: '/add-project-member Alpha John', category: 'action' },
  { cmd: '/remove-project-member',description: 'Remove a user from a project', example: '/remove-project-member Alpha John', category: 'action' },
  { cmd: '/create-task',          description: 'Create a new task', example: '/create-task Fix login Alpha', category: 'action' },
  { cmd: '/update-task',          description: "Change a task's status", example: '/update-task Fix login in_progress', category: 'action' },
  { cmd: '/edit-task',            description: 'Update task priority, due date or assignees', example: '/edit-task Fix login --priority high', category: 'action' },
  { cmd: '/assign-task',          description: 'Assign a task to a user', example: '/assign-task Fix login John', category: 'action' },
  { cmd: '/mark-blocked',         description: 'Mark a task as blocked', example: '/mark-blocked Fix login waiting on API', category: 'action' },
  { cmd: '/mark-unblocked',       description: 'Remove the block from a task', example: '/mark-unblocked Fix login', category: 'action' },
  { cmd: '/log-hours',            description: 'Log hours worked on a task', example: '/log-hours Fix login 3', category: 'action' },
  { cmd: '/comment-task',         description: 'Add a comment to a task', example: '/comment-task Fix login -- Looks good', category: 'action' },
  { cmd: '/create-team',          description: 'Create a new team', example: '/create-team Backend --lead John', category: 'action' },
  { cmd: '/edit-team',            description: "Update a team's details", example: '/edit-team Backend --dept Engineering', category: 'action' },
  { cmd: '/delete-team',          description: 'Delete / disband a team', example: '/delete-team Backend', category: 'action' },
  { cmd: '/add-member',           description: 'Add a member to a team', example: '/add-member Backend John', category: 'action' },
  { cmd: '/remove-member',        description: 'Remove a member from a team', example: '/remove-member Backend John', category: 'action' },
  { cmd: '/create-user',          description: 'Create a new user account', example: '/create-user "John Smith" john@co.com pass123 Engineering employee', category: 'action' },
  { cmd: '/update-user',          description: "Update a user's profile", example: '/update-user John --dept Engineering', category: 'action' },
  { cmd: '/delete-user',          description: 'Deactivate a user account', example: '/delete-user John', category: 'action' },
  { cmd: '/activate-user',        description: 'Reactivate a deactivated user', example: '/activate-user John', category: 'action' },
  { cmd: '/submit-report',        description: "Submit today's daily report", example: '/submit-report --hours 8 --project Alpha --mood good', category: 'action' },
  { cmd: '/review-report',        description: "Mark an employee's report as reviewed", example: '/review-report John -- Great work', category: 'action' },
  { cmd: '/delete-report',        description: "Delete your own daily report", example: '/delete-report', category: 'action' },
  { cmd: '/change-password',      description: 'Change your account password', example: '/change-password oldPass newPass123', category: 'action' },
  { cmd: '/mark-read',            description: 'Mark all notifications as read', category: 'action' },
]

/* ─── Draggable position helpers ───────────────────────────────── */

export const CHATBOT_POS_KEY  = 'workAI_pos'
export const CHATBOT_LOCK_KEY = 'workAI_locked'

function getDefaultPos() {
  return { x: window.innerWidth - 200, y: window.innerHeight - 90 }
}

function loadPos(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(CHATBOT_POS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return getDefaultPos()
}

function clampPos(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(window.innerWidth  - 170, x)),
    y: Math.max(0, Math.min(window.innerHeight - 60,  y)),
  }
}

const DATA_COMMANDS = new Set([
  '/delayed','/blockers','/tasks','/stats','/analytics','/contributor-stats',
  '/reports','/project','/team','/employee','/employees','/message',
  '/commits','/missing-reports','/dashboard','/notifications',
])

function isDataCommand(msg: string) {
  const w = msg.toLowerCase().trim().split(' ')[0]
  if (DATA_COMMANDS.has(w)) return true
  return ['delayed','blocker','report','stats','task','project','employee','team','analytics','commit','notification','dashboard','missing']
    .some(k => msg.toLowerCase().includes(k))
}

function timeAgo(iso: string | null) {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/* ─── Bot Markdown ──────────────────────────────────────────────── */

const BotMarkdown: React.FC<{ content: string }> = ({ content }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      h1: ({ children }) => <h1 className="text-sm font-bold text-gray-900 mt-3 mb-1.5 first:mt-0">{children}</h1>,
      h2: ({ children }) => <h2 className="text-sm font-bold text-gray-800 mt-2.5 mb-1 first:mt-0">{children}</h2>,
      h3: ({ children }) => <h3 className="text-xs font-semibold text-gray-700 mt-2 mb-0.5 first:mt-0 uppercase tracking-wide">{children}</h3>,
      p:  ({ children }) => <p className="text-sm text-gray-700 leading-relaxed mb-1.5 last:mb-0">{children}</p>,
      ul: ({ children }) => <ul className="list-none space-y-1 mb-1.5 text-sm text-gray-700 pl-0">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 mb-1.5 text-sm text-gray-700 pl-1">{children}</ol>,
      li: ({ children }) => (
        <li className="flex items-start gap-1.5 leading-relaxed">
          <span className="w-1 h-1 rounded-full bg-indigo-400 mt-2 shrink-0" />
          <span>{children}</span>
        </li>
      ),
      strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
      em: ({ children }) => <em className="italic text-gray-600">{children}</em>,
      code: ({ inline, children }: any) =>
        inline
          ? <code className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-md text-xs font-mono border border-indigo-100">{children}</code>
          : <pre className="bg-gray-900 text-emerald-300 text-xs rounded-xl p-3 overflow-x-auto my-2 font-mono leading-relaxed whitespace-pre-wrap border border-gray-800">{children}</pre>,
      blockquote: ({ children }) => (
        <blockquote className="border-l-[3px] border-indigo-400 bg-indigo-50/60 pl-3 py-1.5 my-2 text-sm text-indigo-800 rounded-r-xl">{children}</blockquote>
      ),
      hr: () => <hr className="border-gray-200 my-3" />,
      a: ({ href, children }) => (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline underline-offset-2 hover:text-indigo-800 text-sm font-medium">
          {children}
        </a>
      ),
      table: ({ children }) => (
        <div className="overflow-x-auto my-2 rounded-xl border border-gray-200 shadow-sm">
          <table className="w-full text-xs border-collapse">{children}</table>
        </div>
      ),
      thead: ({ children }) => <thead className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white">{children}</thead>,
      tbody: ({ children }) => <tbody className="divide-y divide-gray-100 bg-white">{children}</tbody>,
      tr: ({ children }) => <tr className="even:bg-gray-50/50 hover:bg-indigo-50/30 transition-colors">{children}</tr>,
      th: ({ children }) => <th className="px-3 py-2.5 text-left font-semibold text-white text-xs tracking-wide">{children}</th>,
      td: ({ children }) => <td className="px-3 py-2.5 text-gray-700 text-xs">{children}</td>,
    }}
  >
    {content}
  </ReactMarkdown>
)

/* ─── Message Bubble ────────────────────────────────────────────── */

const MessageBubble: React.FC<{ msg: BotMessage | any; isOwn?: boolean; isFullscreen?: boolean; callerRole?: string }> = ({
  msg, isOwn = true, isFullscreen = false, callerRole = '',
}) => {
  const isUser = msg.role === 'user'

  return (
    <div className={`flex flex-col gap-1 group ${isUser ? 'items-end' : 'items-start'}`}>
      <div className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'} ${isFullscreen ? 'max-w-[55%]' : 'max-w-[88%]'}`}>
        {/* Avatar */}
        {!isUser && (
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0 shadow-sm shadow-indigo-200">
            <Bot size={14} className="text-white" />
          </div>
        )}

        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
          {/* Status badges */}
          {!isUser && (msg.action_taken || msg.command) && (
            <div className="flex items-center gap-2">
              {msg.action_taken && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={9} />
                  Action completed
                </span>
              )}
              {msg.command && isOwn && !msg.action_taken && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                  <Database size={9} />
                  Live data
                </span>
              )}
            </div>
          )}

          {/* Bubble */}
          <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed break-words ${
            isUser
              ? 'bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-700 text-white rounded-br-sm shadow-md shadow-indigo-200'
              : 'bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm'
          }`}>
            {isUser
              ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
              : <BotMarkdown content={msg.content} />
            }
          </div>

          {/* Timestamp */}
          <p className={`text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity ${isUser ? 'text-right text-gray-400' : 'text-gray-400'}`}>
            {fmtTime(msg.timestamp)}
          </p>
        </div>
      </div>

      {/* Entity cards */}
      {!isUser && msg.structured_data?.items?.length > 0 && callerRole && (
        <div className={`mt-1 ${isFullscreen ? '' : 'max-w-full'} pl-9 w-full`}>
          <EntityCards data={msg.structured_data} callerRole={callerRole} />
        </div>
      )}
    </div>
  )
}

/* ─── Typing indicator ──────────────────────────────────────────── */

const TypingIndicator: React.FC<{ fetching: boolean }> = ({ fetching }) => (
  <div className="flex items-end gap-2">
    <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0 shadow-sm shadow-indigo-200">
      <Bot size={14} className="text-white" />
    </div>
    <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
      {fetching ? (
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            {[0,1,2].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${i * 0.12}s` }} />
            ))}
          </div>
          <span className="text-xs text-indigo-600 font-medium">Fetching live data…</span>
          <Database size={10} className="text-indigo-400 animate-pulse" />
        </div>
      ) : (
        <div className="flex gap-1 items-center">
          {[0,1,2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      )}
    </div>
  </div>
)

/* ─── Empty state ───────────────────────────────────────────────── */

const EmptyState: React.FC<{ onPrompt: (msg: string) => void; isFullscreen: boolean; userName: string }> = ({
  onPrompt, isFullscreen, userName,
}) => {
  const suggestions = [
    { icon: <AlertCircle size={14} />, text: 'Show delayed projects', color: 'text-red-500', bg: 'bg-red-50 border-red-100 hover:bg-red-100' },
    { icon: <Zap size={14} />,         text: 'Any blocked tasks?',     color: 'text-amber-500', bg: 'bg-amber-50 border-amber-100 hover:bg-amber-100' },
    { icon: <TrendingUp size={14} />,  text: 'Company stats overview', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100 hover:bg-emerald-100' },
    { icon: <BarChart3 size={14} />,   text: 'Full analytics report',  color: 'text-violet-600', bg: 'bg-violet-50 border-violet-100 hover:bg-violet-100' },
    { icon: <Users size={14} />,       text: 'List all employees',     color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100 hover:bg-blue-100' },
    { icon: <Plus size={14} />,        text: 'Create a new project',   color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-100 hover:bg-indigo-100' },
  ]

  return (
    <div className="flex flex-col items-center justify-center h-full px-5 text-center select-none">
      {/* AI avatar */}
      <div className="relative mb-5">
        <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
          <Bot size={30} className="text-white" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-400 rounded-full border-2 border-white flex items-center justify-center">
          <Sparkles size={9} className="text-white" />
        </div>
      </div>

      <h3 className="text-base font-bold text-gray-900 mb-1">
        Hi{userName ? `, ${userName.split(' ')[0]}` : ''}! I'm your Work AI
      </h3>
      <p className="text-xs text-gray-500 leading-relaxed max-w-[260px] mb-6">
        I have live access to your workspace — projects, tasks, teams, reports, and analytics. Ask me anything.
      </p>

      {/* Capability chips */}
      <div className={`grid gap-2 w-full ${isFullscreen ? 'grid-cols-3 max-w-md' : 'grid-cols-2'}`}>
        {suggestions.slice(0, isFullscreen ? 6 : 4).map(s => (
          <button
            key={s.text}
            onClick={() => onPrompt(s.text)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left text-xs font-medium transition-all duration-150 ${s.bg} ${s.color}`}
          >
            <span className={`shrink-0 ${s.color}`}>{s.icon}</span>
            {s.text}
          </button>
        ))}
      </div>

      <p className="mt-5 text-[11px] text-gray-400 flex items-center gap-1.5">
        <Command size={10} />
        Type <span className="font-mono font-bold text-indigo-500 mx-0.5">/</span> to browse all commands
      </p>
    </div>
  )
}

/* ─── Slash command palette ─────────────────────────────────────── */

const CATEGORY_META = {
  read:   { label: 'Read & Query', icon: <BookOpen size={11} />, color: 'text-blue-600', bg: 'bg-blue-50' },
  action: { label: 'Actions',      icon: <Zap size={11} />,      color: 'text-violet-600', bg: 'bg-violet-50' },
}

const SlashPalette: React.FC<{
  filtered: SlashCommand[]
  activeIndex: number
  onSelect: (cmd: SlashCommand) => void
  onHover: (idx: number) => void
  paletteRef: React.RefObject<HTMLDivElement>
  filter: string
}> = ({ filtered, activeIndex, onSelect, onHover, paletteRef, filter }) => {
  const readCmds   = filtered.filter(c => c.category === 'read')
  const actionCmds = filtered.filter(c => c.category === 'action')

  const renderGroup = (cmds: SlashCommand[], category: 'read' | 'action') => {
    if (!cmds.length) return null
    const meta = CATEGORY_META[category]
    return (
      <div key={category}>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${meta.color} sticky top-9 ${meta.bg}`}>
          {meta.icon}{meta.label}
        </div>
        {cmds.map(cmd => {
          const isActive = filtered[activeIndex]?.cmd === cmd.cmd
          return (
            <button
              key={cmd.cmd}
              data-active={isActive ? 'true' : 'false'}
              onMouseEnter={() => onHover(filtered.findIndex(c => c.cmd === cmd.cmd))}
              onClick={() => onSelect(cmd)}
              className={`w-full text-left px-3 py-2.5 flex items-start gap-3 transition-colors ${isActive ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
            >
              <code className={`text-[11px] font-mono font-bold shrink-0 mt-0.5 px-2 py-0.5 rounded-lg min-w-[7rem] ${
                isActive ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}>
                {cmd.cmd}
              </code>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-700 leading-snug">{cmd.description}</p>
                {cmd.example && (
                  <p className="text-[10px] text-gray-400 font-mono mt-0.5 truncate opacity-80">{cmd.example}</p>
                )}
              </div>
              {isActive && <ChevronRight size={12} className="text-indigo-400 shrink-0 mt-0.5" />}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div
      ref={paletteRef}
      className="mb-2.5 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden max-h-72 overflow-y-auto"
      style={{ boxShadow: '0 8px 32px rgba(99,102,241,0.12), 0 2px 8px rgba(0,0,0,0.06)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-indigo-50/30 sticky top-0">
        <div className="w-4 h-4 bg-indigo-100 rounded flex items-center justify-center">
          <Search size={9} className="text-indigo-600" />
        </div>
        <p className="text-[11px] text-gray-500 font-medium flex-1">
          <span className="text-gray-800 font-bold">{filtered.length}</span> command{filtered.length !== 1 ? 's' : ''}
          {filter && <span className="text-indigo-600"> · <em>/{filter}</em></span>}
        </p>
        <span className="text-[10px] text-gray-300 hidden sm:block">↑↓ · Tab/Enter · Esc</span>
      </div>

      {filtered.length === 0
        ? <p className="text-xs text-gray-400 text-center py-6">No commands match <em>/{filter}</em></p>
        : (
          <>
            {renderGroup(readCmds, 'read')}
            {renderGroup(actionCmds, 'action')}
          </>
        )
      }
    </div>
  )
}

/* ─── Monitor panel ─────────────────────────────────────────────── */

const MonitorPanel: React.FC = () => {
  const dispatch = useDispatch()
  const {
    monitorUsers, monitorUsersLoading,
    selectedMonitorUser,
    monitorSessions, monitorSessionsLoading,
    selectedMonitorSession,
    monitorMessages, monitorMessagesLoading,
  } = useSelector((s: RootState) => s.chatbot)

  const [search, setSearch] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { dispatch(fetchMonitorUsersRequest()) }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [monitorMessages])

  const filtered = monitorUsers.filter(u =>
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.department.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  )

  if (selectedMonitorSession) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 shrink-0 bg-gray-50/80">
          <button onClick={() => dispatch(selectMonitorSession(''))}
            className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-gray-200 transition-colors">
            <ChevronLeft size={15} className="text-gray-600" />
          </button>
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-800 truncate">{selectedMonitorUser?.full_name}</p>
            <p className="text-[10px] text-gray-400">Session history</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {monitorMessagesLoading
            ? <div className="flex justify-center pt-8"><Loader2 size={20} className="animate-spin text-indigo-500" /></div>
            : monitorMessages.length === 0
              ? <p className="text-center text-xs text-gray-400 pt-8">No messages in this session</p>
              : monitorMessages.map((m, i) => (
                  <MessageBubble key={i} msg={{ ...m, id: String(i) }} isOwn={false} />
                ))
          }
          <div ref={endRef} />
        </div>
      </div>
    )
  }

  if (selectedMonitorUser) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 shrink-0 bg-gray-50/80">
          <button onClick={() => dispatch(clearMonitorSelection())}
            className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-gray-200 transition-colors">
            <ChevronLeft size={15} className="text-gray-600" />
          </button>
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm">
            {selectedMonitorUser.full_name[0]}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-800 truncate">{selectedMonitorUser.full_name}</p>
            <p className="text-[10px] text-gray-400 capitalize">{selectedMonitorUser.role.replace('_', ' ')} · {selectedMonitorUser.department}</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {monitorSessionsLoading
            ? <div className="flex justify-center pt-8"><Loader2 size={20} className="animate-spin text-indigo-500" /></div>
            : monitorSessions.length === 0
              ? <p className="text-center text-xs text-gray-400 pt-8">No sessions found</p>
              : monitorSessions.map(s => (
                  <button key={s.session_id} onClick={() => dispatch(selectMonitorSession(s.session_id))}
                    className="w-full text-left px-3.5 py-3 rounded-xl hover:bg-indigo-50 border border-gray-100 hover:border-indigo-200 transition-all bg-white shadow-sm">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-lg bg-indigo-100 flex items-center justify-center">
                          <MessageSquare size={10} className="text-indigo-500" />
                        </div>
                        <span className="text-xs font-semibold text-gray-700">Session</span>
                      </div>
                      <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">{timeAgo(s.updated_at)}</span>
                    </div>
                    {s.last_message && (
                      <p className="text-xs text-gray-500 truncate">
                        <span className={s.last_role === 'user' ? 'text-indigo-600 font-medium' : 'text-gray-500'}>
                          {s.last_role === 'user' ? 'User: ' : 'AI: '}
                        </span>
                        {s.last_message}
                      </p>
                    )}
                  </button>
                ))
          }
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-2 shrink-0">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employees…"
            className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 focus:bg-white transition-all" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
        {monitorUsersLoading ? (
          <div className="flex justify-center pt-8"><Loader2 size={20} className="animate-spin text-indigo-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-10 text-gray-400">
            <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
              <Users size={22} className="text-gray-300" />
            </div>
            <p className="text-xs font-medium text-gray-500">No chat history found</p>
          </div>
        ) : (
          filtered.map(u => (
            <button key={u.user_id} onClick={() => dispatch(selectMonitorUser(u))}
              className="w-full text-left px-3.5 py-3 rounded-xl hover:bg-indigo-50/60 border border-gray-100 hover:border-indigo-200 transition-all bg-white shadow-sm group">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-br from-indigo-400 to-violet-500 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm shadow-indigo-200">
                  {u.full_name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-indigo-700 transition-colors">{u.full_name}</p>
                  <p className="text-[10px] text-gray-400 capitalize">{u.role.replace('_', ' ')} · {u.department}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold text-indigo-600">{u.session_count}</p>
                  <div className="flex items-center gap-0.5 text-[10px] text-gray-400 justify-end mt-0.5">
                    <Clock size={9} /><span>{timeAgo(u.last_active)}</span>
                  </div>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

/* ─── Main Chatbot ──────────────────────────────────────────────── */

export const Chatbot: React.FC = () => {
  const dispatch = useDispatch()
  const { messages, isLoading, isOpen, monitorTab } = useSelector((s: RootState) => s.chatbot)
  const { user } = useSelector((s: RootState) => s.auth)

  const [input, setInput]               = useState('')
  const [fetchingData, setFetchingData] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [slashOpen, setSlashOpen]       = useState(false)
  const [slashFilter, setSlashFilter]   = useState('')
  const [slashIndex, setSlashIndex]     = useState(0)

  // ── draggable FAB position ──────────────────────────────────────
  const [pos, setPos]         = useState<{ x: number; y: number }>(loadPos)
  const [dragging, setDragging] = useState(false)
  const dragOffset   = useRef({ x: 0, y: 0 })
  const dragStartPos = useRef({ x: 0, y: 0 })
  const didDrag      = useRef(false)
  const isLocked     = localStorage.getItem(CHATBOT_LOCK_KEY) === 'true'

  // Sync position when localStorage changes (e.g. reset from Settings)
  useEffect(() => {
    const onStorage = () => setPos(loadPos())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Global drag handlers
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartPos.current.x
      const dy = e.clientY - dragStartPos.current.y
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) didDrag.current = true
      const next = clampPos(e.clientX - dragOffset.current.x, e.clientY - dragOffset.current.y)
      setPos(next)
      localStorage.setItem(CHATBOT_POS_KEY, JSON.stringify(next))
    }
    const onUp = () => setDragging(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [dragging])

  const onFabMouseDown = (e: React.MouseEvent) => {
    if (isLocked) return
    didDrag.current = false
    dragStartPos.current = { x: e.clientX, y: e.clientY }
    dragOffset.current   = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    setDragging(true)
    e.preventDefault()
  }

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const paletteRef     = useRef<HTMLDivElement>(null)
  const textareaRef    = useRef<HTMLTextAreaElement>(null)

  const isExec     = ['ceo', 'coo'].includes(user?.primary_role || '')
  const callerRole = user?.primary_role || ''
  const userName   = user?.full_name || ''

  const filteredSlash = slashFilter
    ? SLASH_COMMANDS.filter(c =>
        c.cmd.toLowerCase().includes(slashFilter.toLowerCase()) ||
        c.description.toLowerCase().includes(slashFilter.toLowerCase())
      )
    : SLASH_COMMANDS

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (isLoading) {
      const last = messages[messages.length - 1]
      if (last?.role === 'user' && isDataCommand(last.content)) { setFetchingData(true); return }
    }
    setFetchingData(false)
  }, [isLoading, messages])

  useEffect(() => {
    if (!slashOpen || !paletteRef.current) return
    const active = paletteRef.current.querySelector('[data-active="true"]')
    active?.scrollIntoView({ block: 'nearest' })
  }, [slashIndex, slashOpen])

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInput(val)
    if (val.startsWith('/')) {
      setSlashFilter(val.slice(1))
      setSlashOpen(true)
      setSlashIndex(0)
    } else {
      setSlashOpen(false)
      setSlashFilter('')
    }
    // Auto-resize
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 96)}px`
  }

  const applySlashCommand = useCallback((cmd: SlashCommand) => {
    setInput(cmd.cmd + ' ')
    setSlashOpen(false)
    setSlashFilter('')
    setSlashIndex(0)
    textareaRef.current?.focus()
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [])

  const handleSend = () => {
    if (!input.trim() || isLoading) return
    setSlashOpen(false)
    dispatch(sendMessageRequest(input.trim()))
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (slashOpen && filteredSlash.length > 0) {
      if (e.key === 'ArrowDown')   { e.preventDefault(); setSlashIndex(i => (i + 1) % filteredSlash.length); return }
      if (e.key === 'ArrowUp')     { e.preventDefault(); setSlashIndex(i => (i - 1 + filteredSlash.length) % filteredSlash.length); return }
      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); applySlashCommand(filteredSlash[slashIndex]); return }
      if (e.key === 'Escape')      { setSlashOpen(false); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  /* ── FAB (closed state) ─────────────────────────────────────── */
  if (!isOpen) {
    return (
      <button
        onMouseDown={onFabMouseDown}
        onClick={() => { if (!didDrag.current) dispatch(toggleChatbot()) }}
        style={{ position: 'fixed', left: pos.x, top: pos.y, cursor: isLocked ? 'pointer' : dragging ? 'grabbing' : 'grab' }}
        className="z-50 group select-none"
        title={isLocked ? 'Open AI Assistant' : 'Drag to reposition · Click to open'}
      >
        {/* Pulse ring */}
        <span className="absolute inset-0 rounded-2xl bg-indigo-400 animate-ping opacity-20 group-hover:opacity-0 transition-opacity" />
        <span className="relative flex items-center gap-3 bg-gradient-to-br from-indigo-600 to-violet-700 text-white pl-4 pr-5 py-3.5 rounded-2xl shadow-xl shadow-indigo-300/50 hover:shadow-2xl hover:shadow-indigo-400/60 transition-all duration-200">
          <div className="relative">
            <Bot size={20} />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-white/80" />
          </div>
          <div className="text-left leading-tight">
            <p className="text-xs font-bold tracking-wide">Work AI</p>
            <p className="text-[10px] text-indigo-200 font-medium">{isLocked ? 'Ask me anything' : 'Drag or click'}</p>
          </div>
          <Sparkles size={13} className="text-yellow-300 ml-1" />
        </span>
      </button>
    )
  }

  /* ── Container ──────────────────────────────────────────────── */
  const PANEL_W = 400
  const PANEL_H = 660
  const panelLeft = Math.max(8, Math.min(window.innerWidth - PANEL_W - 8, pos.x - PANEL_W + 170))
  const panelTop  = Math.max(8, pos.y - PANEL_H - 10) > 8
    ? pos.y - PANEL_H - 10
    : Math.min(window.innerHeight - PANEL_H - 8, pos.y + 66)

  const containerClass = isFullscreen
    ? 'fixed inset-0 w-full h-full bg-[#f8f9ff] flex flex-col z-50 animate-fade-in overflow-hidden'
    : 'w-[400px] h-[660px] max-w-[calc(100vw-1rem)] max-h-[calc(100vh-1rem)] bg-[#f8f9ff] rounded-3xl shadow-2xl flex flex-col z-50 border border-indigo-100/60 animate-scale-in overflow-hidden'

  const containerStyle: React.CSSProperties = isFullscreen
    ? {}
    : { position: 'fixed', left: panelLeft, top: panelTop, boxShadow: '0 24px 80px rgba(99,102,241,0.18), 0 4px 20px rgba(0,0,0,0.08)' }

  return (
    <div className={containerClass} style={containerStyle}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-violet-700 px-5 py-4 flex items-center justify-between shrink-0 relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute top-2 right-20 w-12 h-12 rounded-full bg-white/5 pointer-events-none" />

        <div className="flex items-center gap-3 relative">
          <div className="relative">
            <div className="w-10 h-10 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/20">
              <Bot size={20} className="text-white" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-indigo-700" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-white font-bold text-sm tracking-tight">Work AI</p>
              <Sparkles size={11} className="text-yellow-300" />
            </div>
            <p className="text-indigo-200 text-[11px] font-medium">
              {isExec ? 'Full access · CEO/COO' : 'Private · Your workspace'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 relative">
          {monitorTab === 'own' && (
            <button onClick={() => dispatch(clearHistory())}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition-all"
              title="Clear chat">
              <Trash2 size={14} />
            </button>
          )}
          <button onClick={() => setIsFullscreen(f => !f)}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition-all"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button onClick={() => dispatch(toggleChatbot())}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition-all"
            title="Minimize">
            <X size={15} />
          </button>
        </div>
      </div>

      {/* ── Tab bar (exec only) ─────────────────────────────────── */}
      {isExec && (
        <div className="flex border-b border-indigo-100 bg-white shrink-0">
          {([
            { key: 'own',     label: 'My Chat',      icon: <Bot size={13} /> },
            { key: 'monitor', label: 'Monitor',       icon: <Eye size={13} /> },
          ] as const).map(tab => (
            <button key={tab.key} onClick={() => dispatch(setMonitorTab(tab.key))}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-all ${
                monitorTab === tab.key
                  ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50'
                  : 'text-gray-400 hover:text-gray-600 border-b-2 border-transparent'
              }`}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Scope notice ─────────────────────────────────────────── */}
      {monitorTab === 'own' && (
        <div className="px-4 py-2 bg-amber-50/80 border-b border-amber-100 flex items-center gap-2 shrink-0">
          <div className="w-4 h-4 rounded bg-amber-100 flex items-center justify-center shrink-0">
            <AlertCircle size={9} className="text-amber-600" />
          </div>
          <p className="text-[11px] text-amber-700 font-medium">Work topics only · private session</p>
        </div>
      )}

      {/* ── Monitor panel ────────────────────────────────────────── */}
      {monitorTab === 'monitor' && isExec && (
        <div className="flex-1 overflow-hidden bg-white"><MonitorPanel /></div>
      )}

      {/* ── Own chat panel ───────────────────────────────────────── */}
      {monitorTab === 'own' && (
        <>
          {/* Quick commands strip */}
          <div className="px-3 py-2.5 border-b border-gray-100 bg-white shrink-0">
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {QUICK_COMMANDS.map(({ label, cmd, icon, color }) => (
                <button key={cmd} onClick={() => dispatch(sendMessageRequest(cmd))} disabled={isLoading}
                  className={`shrink-0 flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-xl border transition-all disabled:opacity-40 ${color}`}>
                  {icon}{label}
                </button>
              ))}
            </div>
          </div>

          {/* Messages */}
          <div className={`flex-1 overflow-y-auto py-5 space-y-4 ${
            isFullscreen ? 'px-8 md:px-20 lg:px-40 xl:px-60' : 'px-4'
          }`}>
            {messages.length === 0 ? (
              <EmptyState
                onPrompt={msg => dispatch(sendMessageRequest(msg))}
                isFullscreen={isFullscreen}
                userName={userName}
              />
            ) : (
              <>
                {messages.map((msg: BotMessage) => (
                  <MessageBubble key={msg.id} msg={msg} isOwn isFullscreen={isFullscreen} callerRole={callerRole} />
                ))}
                {isLoading && <TypingIndicator fetching={fetchingData} />}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* ── Input area ────────────────────────────────────────── */}
          <div className={`px-4 pb-4 pt-3 bg-white border-t border-gray-100 shrink-0 ${
            isFullscreen ? 'px-8 md:px-20 lg:px-40 xl:px-60' : ''
          }`}>
            {/* Slash palette */}
            {slashOpen && (
              <SlashPalette
                filtered={filteredSlash}
                activeIndex={slashIndex}
                onSelect={applySlashCommand}
                onHover={setSlashIndex}
                paletteRef={paletteRef}
                filter={slashFilter}
              />
            )}

            {/* Input box */}
            <div className="flex items-end gap-2.5 bg-gray-50 rounded-2xl border border-gray-200 px-4 py-2.5 focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-200 transition-all duration-200">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKey}
                placeholder="Ask anything or type / for commands…"
                rows={1}
                className="flex-1 resize-none text-sm focus:outline-none bg-transparent py-0.5 max-h-24 text-gray-800 placeholder-gray-400 leading-relaxed"
                style={{ minHeight: '24px' }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="w-9 h-9 bg-gradient-to-br from-indigo-600 to-violet-700 text-white rounded-xl flex items-center justify-center disabled:opacity-30 hover:scale-105 active:scale-95 transition-all shadow-md shadow-indigo-200 shrink-0 mb-0.5"
              >
                {isLoading ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={15} />}
              </button>
            </div>

            <p className="text-[10px] text-gray-400 mt-2 text-center font-medium tracking-wide">
              <span className="font-mono font-bold text-indigo-500">/</span> for commands
              &nbsp;·&nbsp; <kbd className="bg-gray-100 px-1 rounded text-gray-500">Enter</kbd> to send
              &nbsp;·&nbsp; <kbd className="bg-gray-100 px-1 rounded text-gray-500">Shift+Enter</kbd> new line
            </p>
          </div>
        </>
      )}
    </div>
  )
}
