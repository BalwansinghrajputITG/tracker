import { createSlice, PayloadAction } from '@reduxjs/toolkit'

/* ── Types ───────────────────────────────────────────────────────────────── */

export interface Employee {
  id: string
  user_id: string
  employee_code: string
  full_name: string
  email: string
  avatar_url: string
  primary_role: string
  is_active: boolean
  joining_date: string | null
  designation_id: string | null
  designation_title: string
  department_id: string | null
  department_name: string
  manager_user_id: string | null
  manager_name: string
  employment_type: string
  employment_status: string
  work_mode: string
  work_location: string
  probation_status: string
}

export interface EmployeeDetail extends Employee {
  date_of_birth: string | null
  gender: string
  personal_email: string
  phone: string
  address: string
  emergency_contact: { name: string; relationship: string; phone: string }
  probation_end_date: string | null
  confirmation_date: string | null
  exit_date: string | null
  exit_reason: string
  created_at: string | null
  updated_at: string | null
}

/** Never present unless the caller holds salary.read — the API omits it entirely. */
export interface CompensationRecord {
  id: string
  base_salary: number
  ctc: number
  variable_pay: number
  bonus: number
  currency: string
  pay_frequency: string
  effective_date: string
  reason: string
  notes: string
  approved_by_name: string
  is_current: boolean
}

export interface EmployeeFilters {
  search?: string
  department_id?: string
  designation_id?: string
  employment_status?: string
  employment_type?: string
  page?: number
  limit?: number
}

interface HrEmployeesState {
  items: Employee[]
  total: number
  page: number
  limit: number
  filters: EmployeeFilters
  selected: EmployeeDetail | null
  /** The caller's own record — separate bucket so the self-service view and the
   *  HR directory can be on screen together without clobbering each other. */
  me: EmployeeDetail | null
  compensation: { current: CompensationRecord | null; history: CompensationRecord[] } | null
  isLoading: boolean
  detailLoading: boolean
  meLoading: boolean
  compensationLoading: boolean
  saveLoading: boolean
  error: string | null
  saveError: string | null
}

const initialState: HrEmployeesState = {
  items: [],
  total: 0,
  page: 1,
  limit: 20,
  filters: {},
  selected: null,
  me: null,
  compensation: null,
  isLoading: false,
  detailLoading: false,
  meLoading: false,
  compensationLoading: false,
  saveLoading: false,
  error: null,
  saveError: null,
}

const hrEmployeesSlice = createSlice({
  name: 'hrEmployees',
  initialState,
  reducers: {
    fetchEmployeesRequest: {
      reducer(state, action: PayloadAction<EmployeeFilters | undefined>) {
        state.isLoading = true
        state.error = null
        if (action.payload) state.filters = { ...state.filters, ...action.payload }
      },
      prepare(payload?: EmployeeFilters) {
        return { payload }
      },
    },
    fetchEmployeesSuccess(
      state,
      action: PayloadAction<{ employees: Employee[]; total: number; page: number; limit: number }>,
    ) {
      state.isLoading = false
      state.items = action.payload.employees
      state.total = action.payload.total
      state.page = action.payload.page
      state.limit = action.payload.limit
    },
    fetchEmployeesFailure(state, action: PayloadAction<string>) {
      state.isLoading = false
      state.error = action.payload
    },

    fetchEmployeeRequest(state, _action: PayloadAction<string>) {
      state.detailLoading = true
      state.error = null
    },
    fetchEmployeeSuccess(state, action: PayloadAction<EmployeeDetail>) {
      state.detailLoading = false
      state.selected = action.payload
    },
    fetchEmployeeFailure(state, action: PayloadAction<string>) {
      state.detailLoading = false
      state.error = action.payload
    },

    fetchMyEmployeeRequest(state) {
      state.meLoading = true
    },
    fetchMyEmployeeSuccess(state, action: PayloadAction<EmployeeDetail>) {
      state.meLoading = false
      state.me = action.payload
    },
    fetchMyEmployeeFailure(state) {
      state.meLoading = false
    },

    fetchCompensationRequest(state, _action: PayloadAction<string>) {
      state.compensationLoading = true
      state.compensation = null
    },
    fetchCompensationSuccess(
      state,
      action: PayloadAction<{ current: CompensationRecord | null; history: CompensationRecord[] }>,
    ) {
      state.compensationLoading = false
      state.compensation = action.payload
    },
    fetchCompensationFailure(state) {
      // A 403 here is expected for callers without salary.read — leave
      // compensation null and let the UI render the restricted state.
      state.compensationLoading = false
      state.compensation = null
    },

    updateEmployeeRequest(
      state,
      _action: PayloadAction<{ id: string; updates: Partial<EmployeeDetail> }>,
    ) {
      state.saveLoading = true
      state.saveError = null
    },
    updateEmployeeSuccess(state) {
      state.saveLoading = false
    },
    updateEmployeeFailure(state, action: PayloadAction<string>) {
      state.saveLoading = false
      state.saveError = action.payload
    },
    clearEmployeeSaveError(state) {
      state.saveError = null
    },
  },
})

export const {
  fetchEmployeesRequest, fetchEmployeesSuccess, fetchEmployeesFailure,
  fetchEmployeeRequest, fetchEmployeeSuccess, fetchEmployeeFailure,
  fetchMyEmployeeRequest, fetchMyEmployeeSuccess, fetchMyEmployeeFailure,
  fetchCompensationRequest, fetchCompensationSuccess, fetchCompensationFailure,
  updateEmployeeRequest, updateEmployeeSuccess, updateEmployeeFailure,
  clearEmployeeSaveError,
} = hrEmployeesSlice.actions

export default hrEmployeesSlice.reducer
