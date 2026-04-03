import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface Task {
  id: string
  project_id: string
  title: string
  description: string
  status: string
  priority: string
  assignee_ids: string[]
  due_date?: string
  estimated_hours: number
  logged_hours: number
  is_blocked: boolean
  blocked_reason?: string
}

interface TasksState {
  items: Task[]
  total: number
  page: number
  limit: number
  isLoading: boolean
  error: string | null
}

const initialState: TasksState = {
  items: [],
  total: 0,
  page: 1,
  limit: 20,
  isLoading: false,
  error: null,
}

const tasksSlice = createSlice({
  name: 'tasks',
  initialState,
  reducers: {
    fetchTasksRequest(state, _: PayloadAction<any>) {
      state.isLoading = true
    },
    fetchTasksSuccess(state, action: PayloadAction<{ tasks: Task[]; total: number; page?: number; limit?: number }>) {
      state.isLoading = false
      state.items = action.payload.tasks
      state.total = action.payload.total
      if (action.payload.page  !== undefined) state.page  = action.payload.page
      if (action.payload.limit !== undefined) state.limit = action.payload.limit
    },
    createTaskRequest(state, _: PayloadAction<any>) {
      state.isLoading = true
    },
    createTaskSuccess(state, action: PayloadAction<Task>) {
      state.isLoading = false
      state.items.unshift(action.payload)
    },
    updateTaskLocal(state, action: PayloadAction<{ id: string; updates: Partial<Task> }>) {
      const idx = state.items.findIndex(t => t.id === action.payload.id)
      if (idx !== -1) state.items[idx] = { ...state.items[idx], ...action.payload.updates }
    },
    setError(state, action: PayloadAction<string>) {
      state.isLoading = false
      state.error = action.payload
    },
  },
})

export const {
  fetchTasksRequest, fetchTasksSuccess, createTaskRequest,
  createTaskSuccess, updateTaskLocal, setError,
} = tasksSlice.actions
export default tasksSlice.reducer
