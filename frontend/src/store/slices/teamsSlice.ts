import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface Team {
  id: string
  name: string
  description: string
  department: string
  lead_id: string
  pm_id?: string
  member_ids: string[]
  project_ids: string[]
  chat_room_id: string
}

interface TeamsState {
  items: Team[]
  total: number
  page: number
  limit: number
  isLoading: boolean
  error: string | null
}

const initialState: TeamsState = {
  items: [],
  total: 0,
  page: 1,
  limit: 12,
  isLoading: false,
  error: null,
}

const teamsSlice = createSlice({
  name: 'teams',
  initialState,
  reducers: {
    fetchTeamsRequest: {
      reducer(state) { state.isLoading = true },
      prepare(payload?: { page?: number; limit?: number }) {
        return { payload }
      },
    },
    fetchTeamsSuccess(state, action: PayloadAction<{ teams: Team[]; total: number; page: number; limit: number }>) {
      state.isLoading = false
      state.items = action.payload.teams
      state.total = action.payload.total
      state.page  = action.payload.page
      state.limit = action.payload.limit
    },
    setError(state, action: PayloadAction<string>) {
      state.isLoading = false
      state.error = action.payload
    },
  },
})

export const { fetchTeamsRequest, fetchTeamsSuccess, setError } = teamsSlice.actions
export default teamsSlice.reducer
