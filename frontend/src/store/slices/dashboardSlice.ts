import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface DashboardState {
  data: Record<string, any>
  isLoading: boolean
  error: string | null
  lastFetched: string | null
}

const initialState: DashboardState = {
  data: {},
  isLoading: false,
  error: null,
  lastFetched: null,
}

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    fetchDashboardRequest(state, _: PayloadAction<string>) {
      state.isLoading = true
      state.error = null
    },
    fetchDashboardSuccess(state, action: PayloadAction<any>) {
      state.isLoading = false
      state.data = action.payload
      state.lastFetched = new Date().toISOString()
    },
    fetchDashboardFailure(state, action: PayloadAction<string>) {
      state.isLoading = false
      state.error = action.payload
    },
  },
})

export const { fetchDashboardRequest, fetchDashboardSuccess, fetchDashboardFailure } = dashboardSlice.actions
export default dashboardSlice.reducer
