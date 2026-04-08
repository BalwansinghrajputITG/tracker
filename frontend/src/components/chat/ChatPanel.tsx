import React, { useEffect, useRef, useState, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  Send, Users, Wifi, WifiOff, Plus, X, Search,
  Loader2, Shield, MessageSquare, Phone, Video,
  MoreHorizontal, Smile, Paperclip, Bold, Italic,
  Underline, AtSign, Hash, ChevronDown,
} from 'lucide-react'
import { RootState } from '../../store'
import {
  fetchRoomsRequest, setActiveRoom, fetchMessagesRequest,
  sendMessageRequest, fetchContactsRequest, ChatContact, ChatRoom,
} from '../../store/slices/chatSlice'
import { api } from '../../utils/api'
import { sanitizeMarkdownHtml } from '../../utils/sanitize'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  '#6264A7', '#C239B3', '#0078D4', '#038387',
  '#E3008C', '#107C10', '#8764B8', '#D83B01',
]

const avatarColor = (name: string) =>
  AVATAR_COLORS[(name?.charCodeAt(0) || 0) % AVATAR_COLORS.length]

const formatTime = (dateStr: string) =>
  new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const getInitials = (name: string) =>
  name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

// ─── Avatar ───────────────────────────────────────────────────────────────────

const Avatar: React.FC<{ name: string; size?: 'sm' | 'md' | 'lg'; online?: boolean }> = ({
  name, size = 'md', online,
}) => {
  const s = size === 'sm' ? 'w-7 h-7 text-xs' : size === 'lg' ? 'w-10 h-10 text-sm' : 'w-9 h-9 text-sm'
  return (
    <div className="relative shrink-0">
      <div
        className={`${s} rounded-full flex items-center justify-center text-white font-semibold select-none`}
        style={{ backgroundColor: avatarColor(name) }}
      >
        {getInitials(name)}
      </div>
      {online !== undefined && (
        <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${online ? 'bg-emerald-500' : 'bg-gray-400'}`} />
      )}
    </div>
  )
}

// ─── Contact Picker ───────────────────────────────────────────────────────────

const ContactPicker: React.FC<{
  contacts: ChatContact[]
  onSelect: (c: ChatContact) => void
  onClose: () => void
  loading: boolean
}> = ({ contacts, onSelect, onClose, loading }) => {
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return q
      ? contacts.filter(c =>
          c.full_name.toLowerCase().includes(q) ||
          c.department.toLowerCase().includes(q) ||
          c.primary_role.toLowerCase().includes(q)
        )
      : contacts
  }, [contacts, search])

  return (
    <div className="absolute inset-0 z-30 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">New conversation</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pt-3 pb-2">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search people…"
              className="w-full border border-gray-300 rounded-md pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6264A7] focus:border-transparent"
            />
          </div>
        </div>

        {/* Results */}
        <div className="overflow-y-auto max-h-72 pb-2">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={20} className="animate-spin text-[#6264A7]" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-xs text-gray-400 py-8">
              {contacts.length === 0 ? 'No contacts available' : 'No results found'}
            </p>
          ) : (
            filtered.map(c => (
              <button
                key={c.id}
                onClick={() => onSelect(c)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
              >
                <Avatar name={c.full_name} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.full_name}</p>
                  <p className="text-xs text-gray-500 truncate capitalize">
                    {c.primary_role.replace('_', ' ')} · {c.department}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Conversation Item ────────────────────────────────────────────────────────

const ConversationItem: React.FC<{
  room: ChatRoom
  isActive: boolean
  onClick: () => void
}> = ({ room, isActive, onClick }) => {
  const isGroup = room.type === 'team' || room.type === 'project'
  const displayName = room.name || (isGroup ? 'Group Chat' : 'Direct Message')

  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-100 group ${
        isActive
          ? 'bg-white shadow-sm'
          : 'hover:bg-white/40'
      }`}
    >
      {/* Avatar or group icon */}
      {isGroup ? (
        <div className="w-9 h-9 rounded-full bg-[#6264A7] flex items-center justify-center shrink-0">
          <Hash size={14} className="text-white" />
        </div>
      ) : (
        <Avatar name={displayName} size="md" />
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <p className={`text-sm font-medium truncate ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>
            {displayName}
          </p>
        </div>
        <p className={`text-xs truncate mt-0.5 ${isActive ? 'text-gray-500' : 'text-gray-400'}`}>
          {room.last_message_preview || (isGroup ? `${room.participants?.length || 0} members` : 'Start a conversation')}
        </p>
      </div>
    </button>
  )
}

// ─── Date Divider ─────────────────────────────────────────────────────────────

const DateDivider: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex items-center gap-3 my-4">
    <div className="flex-1 h-px bg-gray-200" />
    <span className="text-xs font-semibold text-gray-500 bg-white px-2">{label}</span>
    <div className="flex-1 h-px bg-gray-200" />
  </div>
)

// ─── Main ChatPanel ───────────────────────────────────────────────────────────

export const ChatPanel: React.FC = () => {
  const dispatch = useDispatch()
  const { rooms, activeRoomId, messages, typingUsers, isConnected, contacts, isLoading: chatLoading } = useSelector(
    (s: RootState) => s.chat
  )
  const currentUser = useSelector((s: RootState) => s.auth.user)

  const [message, setMessage]       = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [dmLoading, setDmLoading]   = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const inputRef           = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    dispatch(fetchRoomsRequest())
    dispatch(fetchContactsRequest())
  }, [])

  // Once rooms load, if a room was pre-selected (e.g. navigated from another page),
  // re-dispatch setActiveRoom so the chat area renders it.
  const roomsLoaded = rooms.length > 0
  useEffect(() => {
    if (roomsLoaded && activeRoomId) {
      const found = rooms.find(r => r.id === activeRoomId)
      if (found) dispatch(setActiveRoom(activeRoomId))
    }
  }, [roomsLoaded])

  useEffect(() => {
    if (activeRoomId) dispatch(fetchMessagesRequest({ roomId: activeRoomId }))
  }, [activeRoomId])

  // Scroll to bottom whenever messages change or room switches
  useEffect(() => {
    const el = scrollContainerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, activeRoomId])

  const handleSend = () => {
    if (!message.trim() || !activeRoomId) return
    dispatch(sendMessageRequest({ roomId: activeRoomId, content: message.trim() }))
    setMessage('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
      return
    }
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') { e.preventDefault(); applyFormat('**', '**') }
      if (e.key === 'i') { e.preventDefault(); applyFormat('*',  '*')  }
      if (e.key === 'u') { e.preventDefault(); applyFormat('__', '__') }
    }
  }

  // Apply markdown formatting around selected text (or insert placeholder)
  const applyFormat = (prefix: string, suffix: string) => {
    const ta = inputRef.current
    if (!ta) return
    const start = ta.selectionStart ?? 0
    const end   = ta.selectionEnd   ?? 0
    const selected = message.substring(start, end)
    const before   = message.substring(0, start)
    const after    = message.substring(end)
    const inner    = selected || 'text'
    const newMsg   = before + prefix + inner + suffix + after
    setMessage(newMsg)
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(start + prefix.length, start + prefix.length + inner.length)
    }, 0)
  }

  // Render message content: convert **bold**, *italic*, __underline__, newlines → HTML.
  // HTML-escape the raw input first so user-supplied tags can never inject markup,
  // then apply markdown substitutions, then run DOMPurify as a final safety net.
  const renderMsgContent = (content: string) => {
    const escaped = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    const html = escaped
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,     '<em>$1</em>')
      .replace(/__(.+?)__/g,     '<u>$1</u>')
      .replace(/\n/g,             '<br>')
    return <span dangerouslySetInnerHTML={{ __html: sanitizeMarkdownHtml(html) }} />
  }

  const handleOpenDm = async (contact: ChatContact) => {
    setShowPicker(false)
    setDmLoading(true)
    try {
      const res = await api.post('/chat/rooms', {
        type: 'direct',
        participant_ids: [contact.id],
        name: contact.full_name,
      })
      dispatch(fetchRoomsRequest())
      dispatch(setActiveRoom(res.data.room_id))
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Cannot start conversation with this user')
    } finally {
      setDmLoading(false)
    }
  }

  const groupRooms  = rooms.filter(r => r.type === 'team' || r.type === 'project')
  const directRooms = rooms.filter(r => r.type === 'direct')

  const activeMessages = activeRoomId ? (messages[activeRoomId] || []) : []
  const activeRoom     = rooms.find(r => r.id === activeRoomId)
  const typing         = activeRoomId ? (typingUsers[activeRoomId] || []) : []
  const isGroupRoom    = activeRoom?.type === 'team' || activeRoom?.type === 'project'

  // Group messages by sender + consecutive
  type MsgGroup = { senderId: string; senderName: string; sentAt: string; msgs: typeof activeMessages }
  const messageGroups: MsgGroup[] = []
  for (const msg of activeMessages) {
    const last = messageGroups[messageGroups.length - 1]
    if (last && last.senderId === msg.sender_id) {
      last.msgs.push(msg)
    } else {
      messageGroups.push({ senderId: msg.sender_id, senderName: msg.sender_name || '?', sentAt: msg.sent_at, msgs: [msg] })
    }
  }

  // Insert date dividers
  let lastDate = ''

  return (
    <div className="flex h-full overflow-hidden rounded-xl shadow-lg border border-gray-200 animate-fade-in relative">

      {showPicker && (
        <ContactPicker
          contacts={contacts}
          loading={dmLoading}
          onSelect={handleOpenDm}
          onClose={() => setShowPicker(false)}
        />
      )}

      {/* ── Left Sidebar ── */}
      <div className="w-64 flex flex-col shrink-0 bg-[#f0f0f7]">

        {/* Sidebar Header */}
        <div className="px-3 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">Chat</span>
              <span className={`flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full ${
                isConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'
              }`}>
                {isConnected
                  ? <><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block" />Live</>
                  : <><WifiOff size={9} />Offline</>
                }
              </span>
            </div>
            <button
              onClick={() => setShowPicker(true)}
              title="New message"
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[#6264A7]/10 text-[#6264A7] transition-colors"
            >
              <Plus size={15} />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              placeholder="Search"
              className="w-full bg-white border border-gray-200 rounded-md pl-7 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#6264A7]/40 focus:border-[#6264A7] transition-all"
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">

          {groupRooms.length > 0 && (
            <div className="mb-1">
              <div className="flex items-center gap-1 px-2 py-1.5">
                <ChevronDown size={11} className="text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Teams & Projects</span>
              </div>
              {groupRooms.map(room => (
                <ConversationItem
                  key={room.id}
                  room={room}
                  isActive={activeRoomId === room.id}
                  onClick={() => dispatch(setActiveRoom(room.id))}
                />
              ))}
            </div>
          )}

          {directRooms.length > 0 && (
            <div>
              <div className="flex items-center gap-1 px-2 py-1.5">
                <ChevronDown size={11} className="text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Direct Messages</span>
              </div>
              {directRooms.map(room => (
                <ConversationItem
                  key={room.id}
                  room={room}
                  isActive={activeRoomId === room.id}
                  onClick={() => dispatch(setActiveRoom(room.id))}
                />
              ))}
            </div>
          )}

          {rooms.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 px-3 text-center">
              <div className="w-12 h-12 bg-[#6264A7]/10 rounded-full flex items-center justify-center mb-3">
                <MessageSquare size={20} className="text-[#6264A7]" />
              </div>
              <p className="text-xs font-medium text-gray-700 mb-1">No conversations yet</p>
              <p className="text-xs text-gray-400 mb-3">Start messaging your team members</p>
              <button
                onClick={() => setShowPicker(true)}
                className="text-xs text-[#6264A7] font-medium hover:underline"
              >
                + New message
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Chat Area ── */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {(activeRoom || (activeRoomId && chatLoading)) ? (
          <>
            {/* Chat Header */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 bg-white shrink-0">
              {!activeRoom ? (
                <div className="w-9 h-9 rounded-full bg-gray-100 animate-pulse shrink-0" />
              ) : isGroupRoom ? (
                <div className="w-9 h-9 rounded-full bg-[#6264A7] flex items-center justify-center shrink-0">
                  <Hash size={15} className="text-white" />
                </div>
              ) : (
                <Avatar name={activeRoom.name || 'User'} size="md" online={isConnected} />
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {activeRoom?.name || (isGroupRoom ? 'Group Chat' : 'Loading…')}
                  </p>
                  {activeRoom?.other_user_role && (
                    <span className="text-xs text-gray-500 capitalize shrink-0">
                      {activeRoom.other_user_role.replace('_', ' ')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  {isGroupRoom
                    ? `${activeRoom?.participants?.length || 0} members`
                    : 'Available'
                  }
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1 shrink-0">
                <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors" title="Video call">
                  <Video size={15} />
                </button>
                <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors" title="Audio call">
                  <Phone size={15} />
                </button>
                <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors">
                  <MoreHorizontal size={15} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-5 py-4">
              {activeMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
                  <div className="w-14 h-14 rounded-full bg-[#6264A7]/10 flex items-center justify-center mb-4">
                    {isGroupRoom
                      ? <Hash size={22} className="text-[#6264A7]" />
                      : <Avatar name={activeRoom?.name || 'User'} size="lg" />
                    }
                  </div>
                  <p className="text-base font-semibold text-gray-800">
                    {activeRoom?.name || 'Direct Message'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1 max-w-xs">
                    {isGroupRoom
                      ? 'This is the beginning of your group conversation.'
                      : `This is the beginning of your conversation with ${activeRoom?.name || 'this user'}.`
                    }
                  </p>
                </div>
              ) : (
                <div className="flex flex-col justify-end min-h-full">
                <div className="space-y-0.5">
                  {messageGroups.map((group, gi) => {
                    const isOwn = group.senderId === currentUser?.user_id
                    const msgDate = formatDate(group.sentAt)
                    const showDivider = msgDate !== lastDate
                    if (showDivider) lastDate = msgDate

                    return (
                      <React.Fragment key={gi}>
                        {showDivider && <DateDivider label={msgDate} />}
                        <div className={`flex gap-3 pt-3 group ${isOwn ? 'flex-row-reverse' : ''}`}>
                          {/* Avatar */}
                          <div className="shrink-0 mt-0.5">
                            <Avatar name={group.senderName} size="md" />
                          </div>

                          {/* Messages */}
                          <div className={`flex flex-col gap-1 max-w-[72%] ${isOwn ? 'items-end' : 'items-start'}`}>
                            {/* Sender + time */}
                            <div className={`flex items-baseline gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
                              <span className="text-sm font-semibold text-gray-900">
                                {isOwn ? 'You' : group.senderName}
                              </span>
                              <span className="text-xs text-gray-400">{formatTime(group.sentAt)}</span>
                            </div>

                            {/* Message bubbles */}
                            {group.msgs.map((msg, mi) => (
                              <div
                                key={msg.id}
                                className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                                  isOwn
                                    ? 'bg-[#6264A7] text-white rounded-tr-sm'
                                    : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                                } ${mi === 0 ? '' : isOwn ? 'rounded-tr-2xl' : 'rounded-tl-2xl'}`}
                              >
                                {renderMsgContent(msg.content)}
                              </div>
                            ))}
                          </div>
                        </div>
                      </React.Fragment>
                    )
                  })}

                  {/* Typing indicator */}
                  {typing.length > 0 && (
                    <div className="flex gap-3 pt-3 animate-fade-in">
                      <div className="w-9 h-9 rounded-full bg-gray-200 shrink-0" />
                      <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                        {[0, 1, 2].map(i => (
                          <div
                            key={i}
                            className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"
                            style={{ animationDelay: `${i * 0.15}s` }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="px-4 py-3 border-t border-gray-200 bg-white shrink-0">
              <div className="border border-gray-300 rounded-lg overflow-hidden focus-within:border-[#6264A7] focus-within:ring-1 focus-within:ring-[#6264A7] transition-all">
                {/* Formatting toolbar */}
                <div className="flex items-center gap-0.5 px-3 pt-2 pb-1 border-b border-gray-100">
                  {[
                    { icon: <Bold size={13} />,      title: 'Bold (Ctrl+B)',      prefix: '**', suffix: '**' },
                    { icon: <Italic size={13} />,    title: 'Italic (Ctrl+I)',    prefix: '*',  suffix: '*'  },
                    { icon: <Underline size={13} />, title: 'Underline (Ctrl+U)', prefix: '__', suffix: '__' },
                  ].map(({ icon, title, prefix, suffix }) => (
                    <button
                      key={title}
                      title={title}
                      onMouseDown={e => { e.preventDefault(); applyFormat(prefix, suffix) }}
                      className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
                    >
                      {icon}
                    </button>
                  ))}
                  <div className="w-px h-4 bg-gray-200 mx-1" />
                  <button
                    title="Insert @mention"
                    onMouseDown={e => { e.preventDefault(); applyFormat('@', '') }}
                    className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
                  >
                    <AtSign size={13} />
                  </button>
                  <button title="Emoji" className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors">
                    <Smile size={13} />
                  </button>
                  <button title="Attach file" className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors">
                    <Paperclip size={13} />
                  </button>
                </div>

                {/* Text input + send */}
                <div className="flex items-end gap-2 px-3 py-2">
                  <textarea
                    ref={inputRef}
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Message ${activeRoom?.name || '…'}`}
                    rows={1}
                    className="flex-1 text-sm text-gray-800 placeholder-gray-400 focus:outline-none resize-none bg-transparent leading-relaxed max-h-28"
                    style={{ minHeight: '24px' }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!message.trim()}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-[#6264A7] text-white disabled:opacity-30 hover:bg-[#5254a0] active:scale-95 transition-all shrink-0"
                    title="Send (Enter)"
                  >
                    <Send size={13} />
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-1.5 text-right">Press Enter to send · Shift+Enter for new line</p>
            </div>
          </>
        ) : (
          /* No room selected */
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8 animate-fade-in">
            <div className="w-20 h-20 rounded-full bg-[#6264A7]/10 flex items-center justify-center mb-5">
              <MessageSquare size={34} className="text-[#6264A7]" />
            </div>
            <p className="text-lg font-semibold text-gray-800">Good day, {currentUser?.full_name?.split(' ')[0] || 'there'}!</p>
            <p className="text-sm text-gray-500 mt-1.5 max-w-xs leading-relaxed">
              Select a conversation from the sidebar to get started, or send a new message.
            </p>
            <button
              onClick={() => setShowPicker(true)}
              className="mt-5 flex items-center gap-2 bg-[#6264A7] text-white px-5 py-2.5 rounded-md text-sm font-medium hover:bg-[#5254a0] transition-colors shadow-sm"
            >
              <Plus size={15} />
              New message
            </button>
            {rooms.length === 0 && (
              <div className="mt-5 flex items-start gap-2 bg-amber-50 border border-amber-100 text-amber-700 text-xs px-4 py-3 rounded-lg max-w-xs text-left">
                <Shield size={13} className="shrink-0 mt-0.5" />
                <span>You can only message team members, your team lead, or CEO/COO.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
