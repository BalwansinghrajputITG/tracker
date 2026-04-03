import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface Project {
  id: string
  name: string
  description: string
  status: string
  priority: string
  pm_id: string
  team_ids: string[]
  member_ids: string[]
  start_date: string
  due_date: string
  progress_percentage: number
  is_delayed: boolean
  delay_reason?: string
  milestones: any[]
  tags: string[]
}

interface ProjectsState {
  items: Project[]
  delayed: Project[]
  selected: Project | null
  total: number
  page: number
  limit: number
  isLoading: boolean
  error: string | null
}

const initialState: ProjectsState = {
  items: [],
  delayed: [],
  selected: null,
  total: 0,
  page: 1,
  limit: 12,
  isLoading: false,
  error: null,
}

const projectsSlice = createSlice({
  name: 'projects',
  initialState,
  reducers: {
    fetchProjectsRequest(state, _: PayloadAction<{ page?: number; limit?: number; status?: string; is_delayed?: boolean }>) {
      state.isLoading = true
    },
    fetchProjectsSuccess(state, action: PayloadAction<{ projects: Project[]; total: number; page: number; limit: number }>) {
      state.isLoading = false
      state.items  = action.payload.projects
      state.total  = action.payload.total
      state.page   = action.payload.page
      state.limit  = action.payload.limit
    },
    fetchDelayedSuccess(state, action: PayloadAction<Project[]>) {
      state.delayed = action.payload
    },
    selectProject(state, action: PayloadAction<Project>) {
      state.selected = action.payload
    },
    createProjectRequest(state, _: PayloadAction<any>) {
      state.isLoading = true
    },
    createProjectSuccess(state, action: PayloadAction<Project>) {
      state.items.unshift(action.payload)
      state.isLoading = false
    },
    updateProjectLocal(state, action: PayloadAction<{ id: string; updates: Partial<Project> }>) {
      const idx = state.items.findIndex(p => p.id === action.payload.id)
      if (idx !== -1) state.items[idx] = { ...state.items[idx], ...action.payload.updates }
    },
    setError(state, action: PayloadAction<string>) {
      state.error = action.payload
      state.isLoading = false
    },
  },
})

export const {
  fetchProjectsRequest, fetchProjectsSuccess, fetchDelayedSuccess,
  selectProject, createProjectRequest, createProjectSuccess,
  updateProjectLocal, setError,
} = projectsSlice.actions
export default projectsSlice.reducer
