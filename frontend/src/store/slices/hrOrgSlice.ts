import { createSlice, PayloadAction } from '@reduxjs/toolkit'

/* ── Types ───────────────────────────────────────────────────────────────── */

export interface OrgNode {
  user_id: string
  employee_id: string | null
  full_name: string
  avatar_url: string
  designation_title: string
  department_name: string
  reports: OrgNode[]
}

export interface Designation {
  id: string
  title: string
  level: number
  career_level: string
  department_id: string | null
  department_name: string
  description: string
  is_active: boolean
  employee_count: number
  /** Absent unless the caller holds salary.read. */
  salary_band?: { min: number; max: number; currency: string }
}

export interface Department {
  id: string
  name: string
  description: string
  user_count: number
}

interface HrOrgState {
  designations: Designation[]
  departments: Department[]
  chart: { roots: OrgNode[]; total: number; orphaned: number } | null
  designationsLoading: boolean
  departmentsLoading: boolean
  chartLoading: boolean
  error: string | null
}

const initialState: HrOrgState = {
  designations: [],
  departments: [],
  chart: null,
  designationsLoading: false,
  departmentsLoading: false,
  chartLoading: false,
  error: null,
}

const hrOrgSlice = createSlice({
  name: 'hrOrg',
  initialState,
  reducers: {
    fetchDesignationsRequest(state) {
      state.designationsLoading = true
      state.error = null
    },
    fetchDesignationsSuccess(state, action: PayloadAction<Designation[]>) {
      state.designationsLoading = false
      state.designations = action.payload
    },
    fetchDesignationsFailure(state, action: PayloadAction<string>) {
      state.designationsLoading = false
      state.error = action.payload
    },

    fetchHrDepartmentsRequest(state) {
      state.departmentsLoading = true
    },
    fetchHrDepartmentsSuccess(state, action: PayloadAction<Department[]>) {
      state.departmentsLoading = false
      state.departments = action.payload
    },
    fetchHrDepartmentsFailure(state) {
      state.departmentsLoading = false
    },

    fetchOrgChartRequest(state) {
      state.chartLoading = true
      state.error = null
    },
    fetchOrgChartSuccess(
      state,
      action: PayloadAction<{ roots: OrgNode[]; total: number; orphaned: number }>,
    ) {
      state.chartLoading = false
      state.chart = action.payload
    },
    fetchOrgChartFailure(state, action: PayloadAction<string>) {
      state.chartLoading = false
      state.error = action.payload
    },
  },
})

export const {
  fetchDesignationsRequest, fetchDesignationsSuccess, fetchDesignationsFailure,
  fetchHrDepartmentsRequest, fetchHrDepartmentsSuccess, fetchHrDepartmentsFailure,
  fetchOrgChartRequest, fetchOrgChartSuccess, fetchOrgChartFailure,
} = hrOrgSlice.actions

export default hrOrgSlice.reducer
