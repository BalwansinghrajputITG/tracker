import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { v4 as uuidv4 } from 'uuid'

export interface BotMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  command?: string
  action_taken?: boolean
  structured_data?: { type: string; items: any[] } | null
}

export interface MonitorUser {
  user_id: string
  full_name: string
  department: string
  role: string
  session_count: number
  last_active: string | null
}

export interface MonitorSession {
  session_id: string
  updated_at: string | null
  last_message: string
  last_role: string
}

export interface MonitorMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  command?: string
}

interface ChatbotState {
  // Own chat
  sessionId: string
  messages: BotMessage[]
  isLoading: boolean
  isOpen: boolean
  error: string | null

  // CEO/COO monitoring
  monitorTab: 'own' | 'monitor'
  monitorUsers: MonitorUser[]
  monitorUsersLoading: boolean
  selectedMonitorUser: MonitorUser | null
  monitorSessions: MonitorSession[]
  monitorSessionsLoading: boolean
  selectedMonitorSession: string | null
  monitorMessages: MonitorMessage[]
  monitorMessagesLoading: boolean
}

const initialState: ChatbotState = {
  sessionId: uuidv4(),
  messages: [],
  isLoading: false,
  isOpen: false,
  error: null,

  monitorTab: 'own',
  monitorUsers: [],
  monitorUsersLoading: false,
  selectedMonitorUser: null,
  monitorSessions: [],
  monitorSessionsLoading: false,
  selectedMonitorSession: null,
  monitorMessages: [],
  monitorMessagesLoading: false,
}

const chatbotSlice = createSlice({
  name: 'chatbot',
  initialState,
  reducers: {
    // ── Own chat ───────────────────────────────────────────────────────────
    toggleChatbot(state) {
      state.isOpen = !state.isOpen
    },
    openChatbot(state) {
      state.isOpen = true
    },
    sendMessageRequest(state, action: PayloadAction<string>) {
      state.isLoading = true
      state.error = null
      state.messages.push({
        id: uuidv4(),
        role: 'user',
        content: action.payload,
        timestamp: new Date().toISOString(),
      })
    },
    receiveResponse(state, action: PayloadAction<{ content: string; command?: string; action_taken?: boolean; structured_data?: { type: string; items: any[] } | null }>) {
      state.isLoading = false
      state.messages.push({
        id: uuidv4(),
        role: 'assistant',
        content: action.payload.content,
        timestamp: new Date().toISOString(),
        command: action.payload.command,
        action_taken: action.payload.action_taken,
        structured_data: action.payload.structured_data ?? null,
      })
    },
    setError(state, action: PayloadAction<string>) {
      state.isLoading = false
      state.error = action.payload
      state.messages.push({
        id: uuidv4(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date().toISOString(),
      })
    },
    clearHistory(state) {
      state.messages = []
      state.sessionId = uuidv4()
    },
    // Called on every loginSuccess — guarantees a clean slate for the new user
    resetSession(state) {
      state.messages = []
      state.sessionId = uuidv4()
      state.isLoading = false
      state.error = null
      state.isOpen = false
      state.monitorTab = 'own'
      state.monitorUsers = []
      state.selectedMonitorUser = null
      state.monitorSessions = []
      state.selectedMonitorSession = null
      state.monitorMessages = []
    },

    // ── Monitor tab ────────────────────────────────────────────────────────
    setMonitorTab(state, action: PayloadAction<'own' | 'monitor'>) {
      state.monitorTab = action.payload
    },

    // Fetch users with sessions
    fetchMonitorUsersRequest(state) {
      state.monitorUsersLoading = true
    },
    fetchMonitorUsersSuccess(state, action: PayloadAction<MonitorUser[]>) {
      state.monitorUsersLoading = false
      state.monitorUsers = action.payload
    },
    fetchMonitorUsersFailure(state) {
      state.monitorUsersLoading = false
    },

    // Select a user → fetch their sessions
    selectMonitorUser(state, action: PayloadAction<MonitorUser>) {
      state.selectedMonitorUser = action.payload
      state.monitorSessions = []
      state.selectedMonitorSession = null
      state.monitorMessages = []
      state.monitorSessionsLoading = true
    },
    fetchMonitorSessionsSuccess(state, action: PayloadAction<MonitorSession[]>) {
      state.monitorSessionsLoading = false
      state.monitorSessions = action.payload
    },
    fetchMonitorSessionsFailure(state) {
      state.monitorSessionsLoading = false
    },

    // Select a session → fetch its messages
    selectMonitorSession(state, action: PayloadAction<string>) {
      state.selectedMonitorSession = action.payload
      state.monitorMessages = []
      state.monitorMessagesLoading = true
    },
    fetchMonitorMessagesSuccess(state, action: PayloadAction<MonitorMessage[]>) {
      state.monitorMessagesLoading = false
      state.monitorMessages = action.payload
    },
    fetchMonitorMessagesFailure(state) {
      state.monitorMessagesLoading = false
    },

    clearMonitorSelection(state) {
      state.selectedMonitorUser = null
      state.monitorSessions = []
      state.selectedMonitorSession = null
      state.monitorMessages = []
    },
  },
})

export const {
  toggleChatbot, openChatbot, sendMessageRequest, receiveResponse, setError, clearHistory, resetSession,
  setMonitorTab, fetchMonitorUsersRequest, fetchMonitorUsersSuccess, fetchMonitorUsersFailure,
  selectMonitorUser, fetchMonitorSessionsSuccess, fetchMonitorSessionsFailure,
  selectMonitorSession, fetchMonitorMessagesSuccess, fetchMonitorMessagesFailure,
  clearMonitorSelection,
} = chatbotSlice.actions

export default chatbotSlice.reducer
