import React, { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  Bell, CheckCheck, ClipboardList, Clock, MessageSquare,
  FolderOpen, AtSign, Trash2, X, RefreshCw,
} from 'lucide-react'
import { RootState } from '../../store'
import {
  fetchNotificationsRequest, markReadRequest, markAllReadRequest,
  deleteNotificationRequest, clearAllRequest,
} from '../../store/slices/notificationsSlice'
import { navigate } from '../../pages/AppLayout'

// ─── Type config ──────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, React.ReactNode> = {
  task_assigned:  <ClipboardList size={14} className="text-blue-500" />,
  report_due:     <Clock size={14} className="text-orange-500" />,
  message:        <MessageSquare size={14} className="text-purple-500" />,
  project_update: <FolderOpen size={14} className="text-green-500" />,
  mention:        <AtSign size={14} className="text-indigo-500" />,
  system:         <Bell size={14} className="text-gray-400" />,
}

const TYPE_BG: Record<string, string> = {
  task_assigned:  'bg-blue-50',
  report_due:     'bg-orange-50',
  message:        'bg-purple-50',
  project_update: 'bg-green-50',
  mention:        'bg-indigo-50',
  system:         'bg-gray-50',
}

// Navigate to the relevant page when a notification is clicked
function resolveLink(n: { reference_type?: string; reference_id?: string; type: string }): string | null {
  const { reference_type, reference_id } = n
  if (reference_type === 'project' && reference_id) return `/projects/${reference_id}`
  if (reference_type === 'task'    && reference_id) return `/tasks`
  if (reference_type === 'report'  && reference_id) return `/reports`
  if (n.type === 'message')                          return `/chat`
  if (n.type === 'report_due')                       return `/reports`
  return null
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  if (h < 48) return 'yesterday'
  return `${Math.floor(h / 24)}d ago`
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.setHours(0,0,0,0) - d.setHours(0,0,0,0)
  if (diff === 0) return 'Today'
  if (diff === 86_400_000) return 'Yesterday'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ─── Component ────────────────────────────────────────────────────────────────

export const NotificationBell: React.FC = () => {
  const dispatch   = useDispatch()
  const { items, unread_count, isLoading } = useSelector((s: RootState) => s.notifications)
  const [isOpen, setIsOpen]       = useState(false)
  const [ringing, setRinging]     = useState(false)
  const [filter, setFilter]       = useState<'all' | 'unread'>('all')
  const [clearing, setClearing]   = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const prevUnread = useRef(unread_count)

  // Initial load
  useEffect(() => { dispatch(fetchNotificationsRequest()) }, [])

  // Bell ring animation on new notification
  useEffect(() => {
    if (unread_count > prevUnread.current) {
      setRinging(true)
      setTimeout(() => setRinging(false), 700)
    }
    prevUnread.current = unread_count
  }, [unread_count])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleOpen = () => {
    const opening = !isOpen
    setIsOpen(opening)
    if (opening) {
      // Refresh every time the panel opens
      dispatch(fetchNotificationsRequest())
    }
  }

  const handleClick = (n: any) => {
    if (!n.is_read) dispatch(markReadRequest(n.id))
    const link = resolveLink(n)
    if (link) {
      setIsOpen(false)
      navigate(link)
    }
  }

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    dispatch(deleteNotificationRequest(id))
  }

  const handleClearAll = async () => {
    setClearing(true)
    dispatch(clearAllRequest())
    setTimeout(() => setClearing(false), 600)
  }

  // Filter + group by day
  const visible = filter === 'unread' ? items.filter(n => !n.is_read) : items

  const grouped: { label: string; items: typeof visible }[] = []
  let lastLabel = ''
  for (const n of visible) {
    const label = dayLabel(n.created_at)
    if (label !== lastLabel) {
      grouped.push({ label, items: [] })
      lastLabel = label
    }
    grouped[grouped.length - 1].items.push(n)
  }

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className={`relative p-2 rounded-xl transition-all duration-150 ${
          isOpen ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
        }`}
      >
        <Bell
          size={20}
          className={ringing ? 'animate-bell-ring' : ''}
          strokeWidth={isOpen ? 2.5 : 2}
        />
        {unread_count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center leading-none font-bold animate-scale-in">
            {unread_count > 9 ? '9+' : unread_count}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden animate-scale-in">

          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <Bell size={15} className="text-gray-600" />
                <h3 className="font-bold text-gray-800 text-sm">Notifications</h3>
                {unread_count > 0 && (
                  <span className="bg-red-100 text-red-600 text-xs px-1.5 py-0.5 rounded-full font-semibold">
                    {unread_count} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => dispatch(fetchNotificationsRequest())}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
                  title="Refresh"
                >
                  <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                </button>
                {items.length > 0 && (
                  <button
                    onClick={handleClearAll}
                    disabled={clearing}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Clear all"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
                {unread_count > 0 && (
                  <button
                    onClick={() => dispatch(markAllReadRequest())}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    <CheckCheck size={12} /> All read
                  </button>
                )}
              </div>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
              {(['all', 'unread'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`flex-1 py-1 text-xs font-semibold rounded-md transition-all capitalize ${
                    filter === f ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {f === 'unread' ? `Unread${unread_count > 0 ? ` (${unread_count})` : ''}` : 'All'}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto">
            {visible.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Bell size={32} className="text-gray-150 mx-auto mb-2 text-gray-200" />
                <p className="text-sm font-medium text-gray-400">
                  {filter === 'unread' ? 'All caught up!' : 'No notifications yet'}
                </p>
                <p className="text-xs text-gray-300 mt-1">
                  {filter === 'unread' ? 'No unread notifications' : "You'll see project, task & report alerts here"}
                </p>
              </div>
            ) : (
              grouped.map(group => (
                <div key={group.label}>
                  {/* Day label */}
                  <div className="sticky top-0 px-4 py-1.5 bg-gray-50 border-b border-gray-100 z-10">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{group.label}</p>
                  </div>

                  {group.items.map((n, i) => {
                    const link = resolveLink(n)
                    const isClickable = !!link
                    return (
                      <div
                        key={n.id}
                        onClick={() => handleClick(n)}
                        className={`flex gap-3 px-4 py-3 border-b border-gray-50 transition-colors group animate-fade-in ${
                          isClickable ? 'cursor-pointer' : 'cursor-default'
                        } ${!n.is_read ? 'bg-blue-50/40 hover:bg-blue-50' : 'hover:bg-gray-50'}`}
                        style={{ animationDelay: `${i * 0.025}s` }}
                      >
                        {/* Icon */}
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${TYPE_BG[n.type] || 'bg-gray-50'}`}>
                          {TYPE_ICONS[n.type] || <Bell size={14} className="text-gray-400" />}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm leading-snug ${!n.is_read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                            {n.title}
                          </p>
                          {n.body && (
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">{n.body}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-[10px] text-gray-400">{timeAgo(n.created_at)}</p>
                            {isClickable && (
                              <p className="text-[10px] text-blue-400 font-medium">
                                {n.reference_type === 'project' ? '→ View project'
                                  : n.type === 'message' ? '→ Open chat'
                                  : n.type === 'report_due' ? '→ Submit report'
                                  : '→ View'}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Right side */}
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          {!n.is_read && (
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse mt-1.5" />
                          )}
                          <button
                            onClick={(e) => handleDelete(e, n.id)}
                            className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                            title="Dismiss"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {visible.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-center">
              <p className="text-xs text-gray-400">
                {items.length} notification{items.length !== 1 ? 's' : ''}
                {unread_count > 0 ? ` · ${unread_count} unread` : ' · all read'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
