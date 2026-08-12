import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface DashboardSummary {
  total_employees: number
  active_employees: number
  on_probation: number
  new_employees: number
  employees_on_leave: number
  absent_today: number
  present_today: number
  working_remotely: number
  open_positions: number
  candidates_in_interview: number
  offers_pending: number
  joining_this_month: number
  leaving_this_month: number
  pending_leave_approvals: number
  pending_hr_approvals: number
  open_tickets: number
  sla_breached_tickets: number
  attendance_anomalies: number
  /** null, not 0 — the expenses module does not exist yet (§21). */
  pending_expense_approvals: number | null
  payroll_status: string
}

export interface DepartmentRow {
  id: string
  name: string
  headcount: number
  present_today: number
  attendance_rate: number | null
}

export interface PersonDate {
  user_id: string
  full_name: string
  date: string
  years?: number | null
}

export interface HrDashboard {
  generated_at: string
  summary: DashboardSummary
  attendance_today: { by_status: Record<string, number>; is_weekend: boolean; date: string }
  departments: DepartmentRow[]
  upcoming_birthdays: PersonDate[]
  upcoming_anniversaries: PersonDate[]
  cached: boolean
}

interface State {
  dashboard: HrDashboard | null
  workforce: any | null
  recruitment: any | null
  attendance: any | null
  leave: any | null
  performance: any | null
  attrition: any | null
  isLoading: boolean
  analyticsLoading: boolean
  error: string | null
}

const initialState: State = {
  dashboard: null, workforce: null, recruitment: null, attendance: null,
  leave: null, performance: null, attrition: null,
  isLoading: false, analyticsLoading: false, error: null,
}

const slice = createSlice({
  name: 'hrDashboard',
  initialState,
  reducers: {
    fetchHrDashboardRequest(state) { state.isLoading = true; state.error = null },
    fetchHrDashboardSuccess(state, a: PayloadAction<HrDashboard>) {
      state.isLoading = false; state.dashboard = a.payload
    },
    fetchHrDashboardFailure(state, a: PayloadAction<string>) {
      state.isLoading = false; state.error = a.payload
    },

    fetchHrAnalyticsRequest(state) { state.analyticsLoading = true },
    fetchHrAnalyticsSuccess(state, a: PayloadAction<Record<string, any>>) {
      state.analyticsLoading = false
      Object.assign(state, a.payload)
    },
    fetchHrAnalyticsFailure(state, a: PayloadAction<string>) {
      state.analyticsLoading = false; state.error = a.payload
    },
  },
})

export const {
  fetchHrDashboardRequest, fetchHrDashboardSuccess, fetchHrDashboardFailure,
  fetchHrAnalyticsRequest, fetchHrAnalyticsSuccess, fetchHrAnalyticsFailure,
} = slice.actions

export default slice.reducer
