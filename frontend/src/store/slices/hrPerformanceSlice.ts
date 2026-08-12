import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface Goal {
  id: string
  user_id: string
  employee_name: string
  title: string
  description: string
  kpi: string
  target_value: number
  current_value: number
  unit: string
  progress: number
  weight: number
  deadline: string | null
  completed: boolean
  assigned_by: string
  visibility: string
}

export interface ReviewCycle {
  id: string
  name: string
  cycle_type: string
  period_start: string
  period_end: string
  status: string
}

export interface ReviewRow {
  id: string
  cycle_name: string
  user_id: string
  employee_name: string
  manager_name: string
  status: string
  objective_score: number | null
  goal_completion: number | null
  composite_score: number | null
  submitted: { self: boolean; manager: boolean; hr: boolean; peer: number }
  /** Server-computed — the UI never re-derives who may write which section. */
  can_submit_self: boolean
  can_submit_manager: boolean
  can_submit_hr: boolean
}

export interface ReviewSection {
  by_name: string
  submitted_at: string | null
  ratings: Record<string, number>
  overall: number | null
  strengths: string
  improvements: string
  comments: string
}

export interface ReviewDetail extends ReviewRow {
  sections: {
    self: ReviewSection | null
    manager: ReviewSection | null
    hr: ReviewSection | null
    peer: ReviewSection[]
  }
  dimensions: string[]
}

interface State {
  goals: Goal[]
  weightedCompletion: number | null
  cycles: ReviewCycle[]
  reviews: ReviewRow[]
  selectedReview: ReviewDetail | null
  goalsLoading: boolean
  cyclesLoading: boolean
  reviewsLoading: boolean
  detailLoading: boolean
  saveLoading: boolean
  error: string | null
  saveError: string | null
}

const initialState: State = {
  goals: [], weightedCompletion: null, cycles: [], reviews: [], selectedReview: null,
  goalsLoading: false, cyclesLoading: false, reviewsLoading: false,
  detailLoading: false, saveLoading: false, error: null, saveError: null,
}

const slice = createSlice({
  name: 'hrPerformance',
  initialState,
  reducers: {
    fetchGoalsRequest: {
      reducer(state, _a: PayloadAction<{ user_id?: string } | undefined>) { state.goalsLoading = true },
      prepare(payload?: { user_id?: string }) { return { payload } },
    },
    fetchGoalsSuccess(state, a: PayloadAction<{ goals: Goal[]; weighted_completion: number | null }>) {
      state.goalsLoading = false
      state.goals = a.payload.goals
      state.weightedCompletion = a.payload.weighted_completion
    },
    fetchGoalsFailure(state, a: PayloadAction<string>) {
      state.goalsLoading = false; state.error = a.payload
    },

    saveGoalRequest(state, _a: PayloadAction<Record<string, any>>) {
      state.saveLoading = true; state.saveError = null
    },
    saveGoalSuccess(state) { state.saveLoading = false },
    saveGoalFailure(state, a: PayloadAction<string>) {
      state.saveLoading = false; state.saveError = a.payload
    },

    updateGoalRequest(state, _a: PayloadAction<{ id: string; updates: Record<string, any> }>) {
      state.saveLoading = true
    },
    updateGoalSuccess(state) { state.saveLoading = false },
    updateGoalFailure(state, a: PayloadAction<string>) {
      state.saveLoading = false; state.error = a.payload
    },

    fetchCyclesRequest(state) { state.cyclesLoading = true },
    fetchCyclesSuccess(state, a: PayloadAction<ReviewCycle[]>) {
      state.cyclesLoading = false; state.cycles = a.payload
    },
    fetchCyclesFailure(state) { state.cyclesLoading = false },

    fetchReviewsRequest: {
      reducer(state, _a: PayloadAction<Record<string, any> | undefined>) { state.reviewsLoading = true },
      prepare(payload?: Record<string, any>) { return { payload } },
    },
    fetchReviewsSuccess(state, a: PayloadAction<ReviewRow[]>) {
      state.reviewsLoading = false; state.reviews = a.payload
    },
    fetchReviewsFailure(state, a: PayloadAction<string>) {
      state.reviewsLoading = false; state.error = a.payload
    },

    fetchReviewRequest(state, _a: PayloadAction<string>) { state.detailLoading = true },
    fetchReviewSuccess(state, a: PayloadAction<ReviewDetail>) {
      state.detailLoading = false; state.selectedReview = a.payload
    },
    fetchReviewFailure(state) { state.detailLoading = false },
    clearSelectedReview(state) { state.selectedReview = null },

    submitReviewRequest(state, _a: PayloadAction<{ id: string; payload: Record<string, any> }>) {
      state.saveLoading = true; state.saveError = null
    },
    submitReviewSuccess(state) { state.saveLoading = false },
    submitReviewFailure(state, a: PayloadAction<string>) {
      state.saveLoading = false; state.saveError = a.payload
    },
  },
})

export const {
  fetchGoalsRequest, fetchGoalsSuccess, fetchGoalsFailure,
  saveGoalRequest, saveGoalSuccess, saveGoalFailure,
  updateGoalRequest, updateGoalSuccess, updateGoalFailure,
  fetchCyclesRequest, fetchCyclesSuccess, fetchCyclesFailure,
  fetchReviewsRequest, fetchReviewsSuccess, fetchReviewsFailure,
  fetchReviewRequest, fetchReviewSuccess, fetchReviewFailure, clearSelectedReview,
  submitReviewRequest, submitReviewSuccess, submitReviewFailure,
} = slice.actions

export default slice.reducer
