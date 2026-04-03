import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface Report {
  id: string
  user_id: string
  project_id: string
  report_date: string
  structured_data: {
    tasks_completed: any[]
    tasks_planned: string[]
    blockers: string[]
    hours_worked: number
  }
  unstructured_notes: string
  mood: string
  is_late_submission: boolean
  submitted_at: string
  review_comment?: string
  user_name?: string
  user_department?: string
  user_role?: string
}

interface ReportsState {
  items: Report[]
  missing: any[]
  total: number
  page: number
  limit: number
  isLoading: boolean
  submitLoading: boolean
  submitSuccess: boolean
  error: string | null
  submitError: string | null
}

const initialState: ReportsState = {
  items: [],
  missing: [],
  total: 0,
  page: 1,
  limit: 10,
  isLoading: false,
  submitLoading: false,
  submitSuccess: false,
  error: null,
  submitError: null,
}

const reportsSlice = createSlice({
  name: 'reports',
  initialState,
  reducers: {
    fetchReportsRequest(state, _: PayloadAction<any>) { state.isLoading = true },
    fetchReportsSuccess(state, action: PayloadAction<{ reports: Report[]; total: number; page?: number; limit?: number }>) {
      state.isLoading = false
      state.items = action.payload.reports
      state.total = action.payload.total
      if (action.payload.page  !== undefined) state.page  = action.payload.page
      if (action.payload.limit !== undefined) state.limit = action.payload.limit
    },
    fetchMissingRequest(state) { state.missing = [] },
    fetchMissingSuccess(state, action: PayloadAction<any[]>) {
      state.missing = action.payload
    },
    submitReportRequest(state, _: PayloadAction<any>) {
      state.submitLoading = true
      state.submitSuccess = false
      state.submitError = null
    },
    submitReportSuccess(state) {
      state.submitLoading = false
      state.submitSuccess = true
      state.submitError = null
    },
    submitReportFailure(state, action: PayloadAction<string>) {
      state.submitLoading = false
      state.submitError = action.payload
    },
    setError(state, action: PayloadAction<string>) {
      state.isLoading = false
      state.error = action.payload
    },
    resetSubmitStatus(state) {
      state.submitSuccess = false
      state.submitError = null
    },
  },
})

export const {
  fetchReportsRequest, fetchReportsSuccess, fetchMissingRequest, fetchMissingSuccess,
  submitReportRequest, submitReportSuccess, submitReportFailure, setError, resetSubmitStatus,
} = reportsSlice.actions
export default reportsSlice.reducer
