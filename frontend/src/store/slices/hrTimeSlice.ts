import { createSlice, PayloadAction } from '@reduxjs/toolkit'

/* ── Types ───────────────────────────────────────────────────────────────── */

export interface AttendanceRecord {
  id: string
  user_id: string
  full_name: string
  date: string
  status: string
  check_in: string | null
  check_out: string | null
  worked_minutes: number
  overtime_minutes: number
  late_minutes: number
  source: string
  notes: string
}

export interface TodayStatus {
  date: string
  is_weekend: boolean
  is_holiday: boolean
  checked_in: boolean
  checked_out: boolean
  record: AttendanceRecord | null
  server_local_time: string
}

export interface LeaveBalance {
  leave_type_id: string
  leave_type_name: string
  leave_type_code: string
  year: number
  allocated: number
  used: number
  pending: number
  available: number
  is_paid: boolean
}

export interface LeaveRequest {
  id: string
  user_id: string
  full_name: string
  leave_type_id: string
  leave_type_name: string
  start_date: string
  end_date: string
  days: number
  is_half_day: boolean
  reason: string
  status: string
  manager_name: string
  manager_comment: string
  hr_comment: string
  rejection_reason: string
  created_at: string | null
  /** Computed server-side — the UI must not re-derive the approval rules. */
  can_approve_manager: boolean
  can_approve_hr: boolean
  can_cancel: boolean
}

export interface LeaveType {
  id: string
  name: string
  code: string
  days_per_year: number
  is_paid: boolean
  allow_half_day: boolean
  max_consecutive_days: number | null
}

export interface Holiday {
  id: string
  name: string
  date: string
  holiday_type: string
  department_name: string
  is_optional: boolean
  weekday: string
}

export interface CalendarDay {
  date: string
  weekday: string
  kind: 'working' | 'weekend' | 'holiday' | 'leave'
  holiday_name: string | null
  holiday_optional: boolean
  attendance_status: string | null
}

interface HrTimeState {
  /** Everyone's records (HR view). */
  attendance: AttendanceRecord[]
  attendanceTotal: number
  today: TodayStatus | null
  balances: LeaveBalance[]
  /** Separate buckets: a manager views their own requests and their team's at
   *  the same time, and one array would have the two fetches clobber each other. */
  requests: LeaveRequest[]
  myRequests: LeaveRequest[]
  approvals: LeaveRequest[]
  leaveTypes: LeaveType[]
  holidays: Holiday[]
  calendar: { days: CalendarDay[]; summary: Record<string, number> } | null

  attendanceLoading: boolean
  todayLoading: boolean
  punchLoading: boolean
  balancesLoading: boolean
  requestsLoading: boolean
  approvalsLoading: boolean
  holidaysLoading: boolean
  calendarLoading: boolean
  submitLoading: boolean
  decisionLoading: boolean
  error: string | null
  submitError: string | null
}

const initialState: HrTimeState = {
  attendance: [], attendanceTotal: 0, today: null,
  balances: [], requests: [], myRequests: [], approvals: [],
  leaveTypes: [], holidays: [], calendar: null,
  attendanceLoading: false, todayLoading: false, punchLoading: false,
  balancesLoading: false, requestsLoading: false, approvalsLoading: false,
  holidaysLoading: false, calendarLoading: false,
  submitLoading: false, decisionLoading: false,
  error: null, submitError: null,
}

const hrTimeSlice = createSlice({
  name: 'hrTime',
  initialState,
  reducers: {
    // ── Attendance ──────────────────────────────────────────────────────────
    fetchAttendanceRequest: {
      reducer(state, _a: PayloadAction<Record<string, any> | undefined>) {
        state.attendanceLoading = true; state.error = null
      },
      prepare(payload?: Record<string, any>) { return { payload } },
    },
    fetchAttendanceSuccess(state, a: PayloadAction<{ attendance: AttendanceRecord[]; total: number }>) {
      state.attendanceLoading = false
      state.attendance = a.payload.attendance
      state.attendanceTotal = a.payload.total
    },
    fetchAttendanceFailure(state, a: PayloadAction<string>) {
      state.attendanceLoading = false; state.error = a.payload
    },

    fetchTodayRequest(state) { state.todayLoading = true },
    fetchTodaySuccess(state, a: PayloadAction<TodayStatus>) {
      state.todayLoading = false; state.today = a.payload
    },
    fetchTodayFailure(state) { state.todayLoading = false },

    punchRequest(state, _a: PayloadAction<'in' | 'out'>) { state.punchLoading = true },
    punchSuccess(state) { state.punchLoading = false },
    punchFailure(state, a: PayloadAction<string>) {
      state.punchLoading = false; state.error = a.payload
    },

    // ── Leave ───────────────────────────────────────────────────────────────
    fetchBalancesRequest: {
      reducer(state, _a: PayloadAction<{ user_id?: string } | undefined>) { state.balancesLoading = true },
      prepare(payload?: { user_id?: string }) { return { payload } },
    },
    fetchBalancesSuccess(state, a: PayloadAction<LeaveBalance[]>) {
      state.balancesLoading = false; state.balances = a.payload
    },
    fetchBalancesFailure(state) { state.balancesLoading = false },

    fetchLeaveTypesRequest(state) { state.requestsLoading = true },
    fetchLeaveTypesSuccess(state, a: PayloadAction<LeaveType[]>) {
      state.requestsLoading = false; state.leaveTypes = a.payload
    },
    fetchLeaveTypesFailure(state) { state.requestsLoading = false },

    fetchLeaveRequestsRequest: {
      reducer(state, _a: PayloadAction<{ scope?: 'me' | 'all'; status?: string } | undefined>) {
        state.requestsLoading = true
      },
      prepare(payload?: { scope?: 'me' | 'all'; status?: string }) { return { payload } },
    },
    fetchLeaveRequestsSuccess(
      state,
      a: PayloadAction<{ requests: LeaveRequest[]; scope: 'me' | 'all' }>,
    ) {
      state.requestsLoading = false
      if (a.payload.scope === 'me') state.myRequests = a.payload.requests
      else state.requests = a.payload.requests
    },
    fetchLeaveRequestsFailure(state, a: PayloadAction<string>) {
      state.requestsLoading = false; state.error = a.payload
    },

    fetchApprovalsRequest(state) { state.approvalsLoading = true },
    fetchApprovalsSuccess(state, a: PayloadAction<LeaveRequest[]>) {
      state.approvalsLoading = false; state.approvals = a.payload
    },
    fetchApprovalsFailure(state) { state.approvalsLoading = false },

    submitLeaveRequest(state, _a: PayloadAction<Record<string, any>>) {
      state.submitLoading = true; state.submitError = null
    },
    submitLeaveSuccess(state) { state.submitLoading = false },
    submitLeaveFailure(state, a: PayloadAction<string>) {
      state.submitLoading = false; state.submitError = a.payload
    },
    clearLeaveSubmitError(state) { state.submitError = null },

    decideLeaveRequest(state, _a: PayloadAction<{ id: string; approve: boolean; comment?: string }>) {
      state.decisionLoading = true
    },
    decideLeaveSuccess(state) { state.decisionLoading = false },
    decideLeaveFailure(state, a: PayloadAction<string>) {
      state.decisionLoading = false; state.error = a.payload
    },

    cancelLeaveRequest(state, _a: PayloadAction<string>) { state.decisionLoading = true },

    // ── Holidays ────────────────────────────────────────────────────────────
    fetchHolidaysRequest(state) { state.holidaysLoading = true },
    fetchHolidaysSuccess(state, a: PayloadAction<Holiday[]>) {
      state.holidaysLoading = false; state.holidays = a.payload
    },
    fetchHolidaysFailure(state) { state.holidaysLoading = false },

    fetchCalendarRequest: {
      reducer(state, _a: PayloadAction<{ month?: string } | undefined>) { state.calendarLoading = true },
      prepare(payload?: { month?: string }) { return { payload } },
    },
    fetchCalendarSuccess(state, a: PayloadAction<{ days: CalendarDay[]; summary: Record<string, number> }>) {
      state.calendarLoading = false; state.calendar = a.payload
    },
    fetchCalendarFailure(state) { state.calendarLoading = false },
  },
})

export const {
  fetchAttendanceRequest, fetchAttendanceSuccess, fetchAttendanceFailure,
  fetchTodayRequest, fetchTodaySuccess, fetchTodayFailure,
  punchRequest, punchSuccess, punchFailure,
  fetchBalancesRequest, fetchBalancesSuccess, fetchBalancesFailure,
  fetchLeaveTypesRequest, fetchLeaveTypesSuccess, fetchLeaveTypesFailure,
  fetchLeaveRequestsRequest, fetchLeaveRequestsSuccess, fetchLeaveRequestsFailure,
  fetchApprovalsRequest, fetchApprovalsSuccess, fetchApprovalsFailure,
  submitLeaveRequest, submitLeaveSuccess, submitLeaveFailure, clearLeaveSubmitError,
  decideLeaveRequest, decideLeaveSuccess, decideLeaveFailure,
  cancelLeaveRequest,
  fetchHolidaysRequest, fetchHolidaysSuccess, fetchHolidaysFailure,
  fetchCalendarRequest, fetchCalendarSuccess, fetchCalendarFailure,
} = hrTimeSlice.actions

export default hrTimeSlice.reducer
