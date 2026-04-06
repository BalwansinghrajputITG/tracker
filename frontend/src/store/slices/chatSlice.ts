import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface ChatMessage {
  id: string
  room_id: string
  sender_id: string
  sender_name?: string
  content: string
  message_type: string
  sent_at: string
  read_by: string[]
  reply_to?: string
  mentions: string[]
}

export interface ChatRoom {
  id: string
  type: string
  name?: string
  participants: string[]
  last_message_at: string
  last_message_preview: string
  team_id?: string
  other_user_id?: string
  other_user_role?: string
}

export interface ChatContact {
  id: string
  full_name: string
  primary_role: string
  department: string
}

interface ChatState {
  rooms: ChatRoom[]
  activeRoomId: string | null
  messages: Record<string, ChatMessage[]>
  typingUsers: Record<string, string[]>
  contacts: ChatContact[]
  isConnected: boolean
  isLoading: boolean
  error: string | null
}

const initialState: ChatState = {
  rooms: [],
  activeRoomId: null,
  messages: {},
  typingUsers: {},
  contacts: [],
  isConnected: false,
  isLoading: false,
  error: null,
}

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    fetchRoomsRequest(state) { state.isLoading = true; state.error = null },
    fetchRoomsSuccess(state, action: PayloadAction<ChatRoom[]>) {
      state.rooms = action.payload
      state.isLoading = false
    },
    fetchRoomsFailure(state, action: PayloadAction<string>) {
      state.isLoading = false
      state.error = action.payload
    },
    setActiveRoom(state, action: PayloadAction<string>) {
      state.activeRoomId = action.payload
    },
    fetchMessagesRequest(state, _: PayloadAction<{ roomId: string; before?: string }>) {
      state.isLoading = true
      state.error = null
    },
    fetchMessagesFailure(state, action: PayloadAction<string>) {
      state.isLoading = false
      state.error = action.payload
    },
    fetchMessagesSuccess(state, action: PayloadAction<{ roomId: string; messages: ChatMessage[] }>) {
      state.isLoading = false
      const existing = state.messages[action.payload.roomId] || []
      const existingIds = new Set(existing.map(m => m.id))
      const newMsgs = action.payload.messages.filter(m => !existingIds.has(m.id))
      state.messages[action.payload.roomId] = [...newMsgs, ...existing]
    },
    receiveMessage(state, action: PayloadAction<ChatMessage>) {
      const { room_id } = action.payload
      if (!state.messages[room_id]) state.messages[room_id] = []
      const exists = state.messages[room_id].some(m => m.id === action.payload.id)
      if (!exists) state.messages[room_id].push(action.payload)
      const room = state.rooms.find(r => r.id === room_id)
      if (room) {
        room.last_message_preview = action.payload.content.slice(0, 80)
        room.last_message_at = action.payload.sent_at
      }
    },
    sendMessageRequest(state, _: PayloadAction<{ roomId: string; content: string; mentions?: string[] }>) {
      state.error = null
    },
    sendMessageFailure(state, action: PayloadAction<string>) {
      state.error = action.payload
    },
    setTyping(state, action: PayloadAction<{ roomId: string; userId: string; userName: string }>) {
      const { roomId, userId } = action.payload
      if (!state.typingUsers[roomId]) state.typingUsers[roomId] = []
      if (!state.typingUsers[roomId].includes(userId)) {
        state.typingUsers[roomId].push(userId)
      }
    },
    clearTyping(state, action: PayloadAction<{ roomId: string; userId: string }>) {
      const { roomId, userId } = action.payload
      state.typingUsers[roomId] = (state.typingUsers[roomId] || []).filter(u => u !== userId)
    },
    setConnected(state, action: PayloadAction<boolean>) {
      state.isConnected = action.payload
    },
    fetchContactsRequest(state) { state.isLoading = true },
    fetchContactsSuccess(state, action: PayloadAction<ChatContact[]>) {
      state.isLoading = false
      state.contacts = action.payload
    },
    addRoom(state, action: PayloadAction<ChatRoom>) {
      if (!state.rooms.find(r => r.id === action.payload.id)) {
        state.rooms.unshift(action.payload)
      }
    },
  },
})

export const {
  fetchRoomsRequest, fetchRoomsSuccess, fetchRoomsFailure,
  setActiveRoom,
  fetchMessagesRequest, fetchMessagesSuccess, fetchMessagesFailure,
  receiveMessage,
  sendMessageRequest, sendMessageFailure,
  setTyping, clearTyping, setConnected,
  fetchContactsRequest, fetchContactsSuccess, addRoom,
} = chatSlice.actions
export default chatSlice.reducer
