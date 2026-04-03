import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface Notification {
  id: string
  type: string
  title: string
  body: string
  link?: string
  is_read: boolean
  created_at: string
  reference_id?: string
  reference_type?: string
}

interface NotificationsState {
  items: Notification[]
  unread_count: number
  isLoading: boolean
}

const initialState: NotificationsState = {
  items: [],
  unread_count: 0,
  isLoading: false,
}

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    fetchNotificationsRequest(state) { state.isLoading = true },
    fetchNotificationsSuccess(state, action: PayloadAction<{ notifications: Notification[]; unread_count: number }>) {
      state.isLoading = false
      state.items = action.payload.notifications
      state.unread_count = action.payload.unread_count
    },
    addNotification(state, action: PayloadAction<Notification>) {
      // Avoid duplicates (WS push then refetch may overlap)
      if (!state.items.find(n => n.id === action.payload.id)) {
        state.items.unshift(action.payload)
        state.unread_count += 1
      }
    },
    markReadRequest(state, _: PayloadAction<string>) {},
    markReadLocal(state, action: PayloadAction<string>) {
      const n = state.items.find(n => n.id === action.payload)
      if (n && !n.is_read) {
        n.is_read = true
        state.unread_count = Math.max(0, state.unread_count - 1)
      }
    },
    markAllReadRequest(state) {},
    markAllReadLocal(state) {
      state.items.forEach(n => { n.is_read = true })
      state.unread_count = 0
    },
    deleteNotificationRequest(state, _: PayloadAction<string>) {},
    deleteNotificationLocal(state, action: PayloadAction<string>) {
      const n = state.items.find(n => n.id === action.payload)
      if (n && !n.is_read) state.unread_count = Math.max(0, state.unread_count - 1)
      state.items = state.items.filter(n => n.id !== action.payload)
    },
    clearAllRequest(state) {},
    clearAllLocal(state) {
      state.items = []
      state.unread_count = 0
    },
  },
})

export const {
  fetchNotificationsRequest, fetchNotificationsSuccess, addNotification,
  markReadRequest, markReadLocal, markAllReadRequest, markAllReadLocal,
  deleteNotificationRequest, deleteNotificationLocal, clearAllRequest, clearAllLocal,
} = notificationsSlice.actions
export default notificationsSlice.reducer
