import { createSlice, PayloadAction } from '@reduxjs/toolkit'

/* ── Types ───────────────────────────────────────────────────────────────── */

export interface Job {
  id: string
  title: string
  department_name: string
  location: string
  employment_type: string
  experience_min: number
  experience_max: number
  skills: string[]
  hiring_manager_name: string
  openings_count: number
  filled_count: number
  status: string
  applicant_count: number
  posted_at: string | null
  /** Absent without salary.read. */
  salary_min?: number
  salary_max?: number
  currency?: string
}

export interface Candidate {
  id: string
  full_name: string
  email: string
  phone: string
  current_company: string
  current_title: string
  total_experience_years: number
  notice_period_days: number | null
  skills: string[]
  source: string
  notes: string
  converted_user_id: string | null
  expected_salary?: number
}

export interface StageHistoryEntry {
  stage: string
  at: string
  by: string
  note: string
}

export interface Application {
  id: string
  candidate_id: string
  candidate_name: string
  candidate_email: string
  current_title: string
  job_id: string
  job_title: string
  stage: string
  stage_index: number
  status: string
  rejection_reason: string
  applied_at: string
  stage_history: StageHistoryEntry[]
  days_in_pipeline: number
}

export interface Interview {
  id: string
  application_id: string
  candidate_id: string
  candidate_name: string
  job_title: string
  round: string
  round_number: number
  interviewers: { user_id: string; full_name: string; submitted: boolean }[]
  scheduled_at: string
  duration_minutes: number
  mode: string
  meeting_url: string
  status: string
  feedback_submitted: number
  feedback_expected: number
  is_interviewer: boolean
}

export interface Offer {
  id: string
  candidate_name: string
  candidate_email: string
  job_title: string
  joining_date: string
  status: string
  expires_at: string
  allowed_transitions: string[]
  converted_user_id: string | null
  base_salary?: number
  ctc?: number
  currency?: string
}

interface State {
  jobs: Job[]
  openPositions: number
  candidates: Candidate[]
  applications: Application[]
  byStage: Record<string, number>
  stages: string[]
  interviews: Interview[]
  offers: Offer[]
  pendingOffers: number
  selectedCandidate: (Candidate & { applications: Application[] }) | null

  // Per-operation flags, so one tab loading never blanks another.
  jobsLoading: boolean
  candidatesLoading: boolean
  applicationsLoading: boolean
  interviewsLoading: boolean
  offersLoading: boolean
  detailLoading: boolean
  saveLoading: boolean
  stageLoading: boolean
  error: string | null
  saveError: string | null
}

const initialState: State = {
  jobs: [], openPositions: 0, candidates: [], applications: [],
  byStage: {}, stages: [], interviews: [], offers: [], pendingOffers: 0,
  selectedCandidate: null,
  jobsLoading: false, candidatesLoading: false, applicationsLoading: false,
  interviewsLoading: false, offersLoading: false, detailLoading: false,
  saveLoading: false, stageLoading: false,
  error: null, saveError: null,
}

const slice = createSlice({
  name: 'hrRecruitment',
  initialState,
  reducers: {
    fetchJobsRequest: {
      reducer(state, _a: PayloadAction<Record<string, any> | undefined>) { state.jobsLoading = true },
      prepare(payload?: Record<string, any>) { return { payload } },
    },
    fetchJobsSuccess(state, a: PayloadAction<{ jobs: Job[]; open_positions: number }>) {
      state.jobsLoading = false
      state.jobs = a.payload.jobs
      state.openPositions = a.payload.open_positions
    },
    fetchJobsFailure(state, a: PayloadAction<string>) {
      state.jobsLoading = false; state.error = a.payload
    },

    saveJobRequest(state, _a: PayloadAction<Record<string, any>>) {
      state.saveLoading = true; state.saveError = null
    },
    saveJobSuccess(state) { state.saveLoading = false },
    saveJobFailure(state, a: PayloadAction<string>) {
      state.saveLoading = false; state.saveError = a.payload
    },

    fetchCandidatesRequest: {
      reducer(state, _a: PayloadAction<Record<string, any> | undefined>) { state.candidatesLoading = true },
      prepare(payload?: Record<string, any>) { return { payload } },
    },
    fetchCandidatesSuccess(state, a: PayloadAction<Candidate[]>) {
      state.candidatesLoading = false; state.candidates = a.payload
    },
    fetchCandidatesFailure(state, a: PayloadAction<string>) {
      state.candidatesLoading = false; state.error = a.payload
    },

    fetchCandidateRequest(state, _a: PayloadAction<string>) { state.detailLoading = true },
    fetchCandidateSuccess(state, a: PayloadAction<any>) {
      state.detailLoading = false; state.selectedCandidate = a.payload
    },
    fetchCandidateFailure(state) { state.detailLoading = false },
    clearSelectedCandidate(state) { state.selectedCandidate = null },

    saveCandidateRequest(state, _a: PayloadAction<Record<string, any>>) {
      state.saveLoading = true; state.saveError = null
    },
    saveCandidateSuccess(state) { state.saveLoading = false },
    saveCandidateFailure(state, a: PayloadAction<string>) {
      state.saveLoading = false; state.saveError = a.payload
    },
    clearRecruitmentSaveError(state) { state.saveError = null },

    fetchApplicationsRequest: {
      reducer(state, _a: PayloadAction<Record<string, any> | undefined>) { state.applicationsLoading = true },
      prepare(payload?: Record<string, any>) { return { payload } },
    },
    fetchApplicationsSuccess(
      state,
      a: PayloadAction<{ applications: Application[]; by_stage: Record<string, number>; stages: string[] }>,
    ) {
      state.applicationsLoading = false
      state.applications = a.payload.applications
      state.byStage = a.payload.by_stage
      state.stages = a.payload.stages
    },
    fetchApplicationsFailure(state, a: PayloadAction<string>) {
      state.applicationsLoading = false; state.error = a.payload
    },

    moveStageRequest(state, _a: PayloadAction<{ id: string; stage: string; note?: string }>) {
      state.stageLoading = true
    },
    moveStageSuccess(state) { state.stageLoading = false },
    moveStageFailure(state, a: PayloadAction<string>) {
      state.stageLoading = false; state.error = a.payload
    },

    fetchInterviewsRequest: {
      reducer(state, _a: PayloadAction<Record<string, any> | undefined>) { state.interviewsLoading = true },
      prepare(payload?: Record<string, any>) { return { payload } },
    },
    fetchInterviewsSuccess(state, a: PayloadAction<Interview[]>) {
      state.interviewsLoading = false; state.interviews = a.payload
    },
    fetchInterviewsFailure(state, a: PayloadAction<string>) {
      state.interviewsLoading = false; state.error = a.payload
    },

    scheduleInterviewRequest(state, _a: PayloadAction<Record<string, any>>) {
      state.saveLoading = true; state.saveError = null
    },
    scheduleInterviewSuccess(state) { state.saveLoading = false },
    scheduleInterviewFailure(state, a: PayloadAction<string>) {
      state.saveLoading = false; state.saveError = a.payload
    },

    submitFeedbackRequest(state, _a: PayloadAction<{ interviewId: string; feedback: Record<string, any> }>) {
      state.saveLoading = true; state.saveError = null
    },
    submitFeedbackSuccess(state) { state.saveLoading = false },
    submitFeedbackFailure(state, a: PayloadAction<string>) {
      state.saveLoading = false; state.saveError = a.payload
    },

    fetchOffersRequest: {
      reducer(state, _a: PayloadAction<Record<string, any> | undefined>) { state.offersLoading = true },
      prepare(payload?: Record<string, any>) { return { payload } },
    },
    fetchOffersSuccess(state, a: PayloadAction<{ offers: Offer[]; pending_count: number }>) {
      state.offersLoading = false
      state.offers = a.payload.offers
      state.pendingOffers = a.payload.pending_count
    },
    fetchOffersFailure(state, a: PayloadAction<string>) {
      state.offersLoading = false; state.error = a.payload
    },

    createOfferRequest(state, _a: PayloadAction<Record<string, any>>) {
      state.saveLoading = true; state.saveError = null
    },
    createOfferSuccess(state) { state.saveLoading = false },
    createOfferFailure(state, a: PayloadAction<string>) {
      state.saveLoading = false; state.saveError = a.payload
    },

    offerActionRequest(
      state,
      _a: PayloadAction<{ id: string; action: 'send' | 'accept' | 'reject' | 'withdraw'; reason?: string }>,
    ) { state.saveLoading = true },
    offerActionSuccess(state, _a: PayloadAction<any>) { state.saveLoading = false },
    offerActionFailure(state, a: PayloadAction<string>) {
      state.saveLoading = false; state.error = a.payload
    },
  },
})

export const {
  fetchJobsRequest, fetchJobsSuccess, fetchJobsFailure,
  saveJobRequest, saveJobSuccess, saveJobFailure,
  fetchCandidatesRequest, fetchCandidatesSuccess, fetchCandidatesFailure,
  fetchCandidateRequest, fetchCandidateSuccess, fetchCandidateFailure, clearSelectedCandidate,
  saveCandidateRequest, saveCandidateSuccess, saveCandidateFailure, clearRecruitmentSaveError,
  fetchApplicationsRequest, fetchApplicationsSuccess, fetchApplicationsFailure,
  moveStageRequest, moveStageSuccess, moveStageFailure,
  fetchInterviewsRequest, fetchInterviewsSuccess, fetchInterviewsFailure,
  scheduleInterviewRequest, scheduleInterviewSuccess, scheduleInterviewFailure,
  submitFeedbackRequest, submitFeedbackSuccess, submitFeedbackFailure,
  fetchOffersRequest, fetchOffersSuccess, fetchOffersFailure,
  createOfferRequest, createOfferSuccess, createOfferFailure,
  offerActionRequest, offerActionSuccess, offerActionFailure,
} = slice.actions

export default slice.reducer
