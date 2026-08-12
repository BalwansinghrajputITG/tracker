import { call, put, takeLatest, all } from 'redux-saga/effects'
import {
  fetchJobsRequest, fetchJobsSuccess, fetchJobsFailure,
  saveJobRequest, saveJobSuccess, saveJobFailure,
  fetchCandidatesRequest, fetchCandidatesSuccess, fetchCandidatesFailure,
  fetchCandidateRequest, fetchCandidateSuccess, fetchCandidateFailure,
  saveCandidateRequest, saveCandidateSuccess, saveCandidateFailure,
  fetchApplicationsRequest, fetchApplicationsSuccess, fetchApplicationsFailure,
  moveStageRequest, moveStageSuccess, moveStageFailure,
  fetchInterviewsRequest, fetchInterviewsSuccess, fetchInterviewsFailure,
  scheduleInterviewRequest, scheduleInterviewSuccess, scheduleInterviewFailure,
  submitFeedbackRequest, submitFeedbackSuccess, submitFeedbackFailure,
  fetchOffersRequest, fetchOffersSuccess, fetchOffersFailure,
  createOfferRequest, createOfferSuccess, createOfferFailure,
  offerActionRequest, offerActionSuccess, offerActionFailure,
} from '../slices/hrRecruitmentSlice'
import { api } from '../../utils/api'

function* handleFetchJobs(action: ReturnType<typeof fetchJobsRequest>) {
  try {
    const res: any = yield call(api.get, '/hr/recruitment/jobs', { params: action.payload ?? {} })
    yield put(fetchJobsSuccess({ jobs: res.data.jobs, open_positions: res.data.open_positions }))
  } catch (err: any) {
    yield put(fetchJobsFailure(err?.response?.data?.detail || 'Failed to load job openings.'))
  }
}

function* handleSaveJob(action: ReturnType<typeof saveJobRequest>) {
  try {
    yield call(api.post, '/hr/recruitment/jobs', action.payload)
    yield put(saveJobSuccess())
    yield put(fetchJobsRequest())
  } catch (err: any) {
    yield put(saveJobFailure(err?.response?.data?.detail || 'Could not save the job opening.'))
  }
}

function* handleFetchCandidates(action: ReturnType<typeof fetchCandidatesRequest>) {
  try {
    const res: any = yield call(api.get, '/hr/recruitment/candidates', { params: action.payload ?? {} })
    yield put(fetchCandidatesSuccess(res.data.candidates))
  } catch (err: any) {
    yield put(fetchCandidatesFailure(err?.response?.data?.detail || 'Failed to load candidates.'))
  }
}

function* handleFetchCandidate(action: ReturnType<typeof fetchCandidateRequest>) {
  try {
    const res: any = yield call(api.get, `/hr/recruitment/candidates/${action.payload}`)
    yield put(fetchCandidateSuccess(res.data))
  } catch {
    yield put(fetchCandidateFailure())
  }
}

function* handleSaveCandidate(action: ReturnType<typeof saveCandidateRequest>) {
  try {
    yield call(api.post, '/hr/recruitment/candidates', action.payload)
    yield put(saveCandidateSuccess())
    // A new candidate may also have created an application, so refresh both.
    yield all([put(fetchCandidatesRequest()), put(fetchApplicationsRequest())])
  } catch (err: any) {
    yield put(saveCandidateFailure(err?.response?.data?.detail || 'Could not add the candidate.'))
  }
}

function* handleFetchApplications(action: ReturnType<typeof fetchApplicationsRequest>) {
  try {
    const res: any = yield call(api.get, '/hr/recruitment/applications', { params: action.payload ?? {} })
    yield put(fetchApplicationsSuccess({
      applications: res.data.applications,
      by_stage: res.data.by_stage,
      stages: res.data.stages,
    }))
  } catch (err: any) {
    yield put(fetchApplicationsFailure(err?.response?.data?.detail || 'Failed to load the pipeline.'))
  }
}

function* handleMoveStage(action: ReturnType<typeof moveStageRequest>) {
  try {
    yield call(api.post, `/hr/recruitment/applications/${action.payload.id}/stage`, {
      stage: action.payload.stage, note: action.payload.note || '',
    })
    yield put(moveStageSuccess())
    yield put(fetchApplicationsRequest())
  } catch (err: any) {
    yield put(moveStageFailure(err?.response?.data?.detail || 'Could not move the candidate.'))
    // Re-fetch on failure too: the board optimistically moved the card and must
    // snap back to the server's actual state.
    yield put(fetchApplicationsRequest())
  }
}

function* handleFetchInterviews(action: ReturnType<typeof fetchInterviewsRequest>) {
  try {
    const res: any = yield call(api.get, '/hr/interviews', { params: action.payload ?? {} })
    yield put(fetchInterviewsSuccess(res.data.interviews))
  } catch (err: any) {
    yield put(fetchInterviewsFailure(err?.response?.data?.detail || 'Failed to load interviews.'))
  }
}

function* handleScheduleInterview(action: ReturnType<typeof scheduleInterviewRequest>) {
  try {
    yield call(api.post, '/hr/interviews', action.payload)
    yield put(scheduleInterviewSuccess())
    yield all([put(fetchInterviewsRequest()), put(fetchApplicationsRequest())])
  } catch (err: any) {
    yield put(scheduleInterviewFailure(err?.response?.data?.detail || 'Could not schedule the interview.'))
  }
}

function* handleSubmitFeedback(action: ReturnType<typeof submitFeedbackRequest>) {
  try {
    yield call(api.post, `/hr/interviews/${action.payload.interviewId}/feedback`, action.payload.feedback)
    yield put(submitFeedbackSuccess())
    yield put(fetchInterviewsRequest())
  } catch (err: any) {
    yield put(submitFeedbackFailure(err?.response?.data?.detail || 'Could not submit feedback.'))
  }
}

function* handleFetchOffers(action: ReturnType<typeof fetchOffersRequest>) {
  try {
    const res: any = yield call(api.get, '/hr/offers', { params: action.payload ?? {} })
    yield put(fetchOffersSuccess({ offers: res.data.offers, pending_count: res.data.pending_count }))
  } catch (err: any) {
    yield put(fetchOffersFailure(err?.response?.data?.detail || 'Failed to load offers.'))
  }
}

function* handleCreateOffer(action: ReturnType<typeof createOfferRequest>) {
  try {
    yield call(api.post, '/hr/offers', action.payload)
    yield put(createOfferSuccess())
    yield all([put(fetchOffersRequest()), put(fetchApplicationsRequest())])
  } catch (err: any) {
    yield put(createOfferFailure(err?.response?.data?.detail || 'Could not create the offer.'))
  }
}

function* handleOfferAction(action: ReturnType<typeof offerActionRequest>) {
  const { id, action: verb, reason } = action.payload
  try {
    let res: any
    if (verb === 'send') res = yield call(api.post, `/hr/offers/${id}/send`, {})
    else if (verb === 'withdraw') res = yield call(api.post, `/hr/offers/${id}/withdraw`, {})
    else {
      res = yield call(api.post, `/hr/offers/${id}/decision`, {
        accept: verb === 'accept', reason: reason || '',
      })
    }
    // The accept response carries the new login's credentials — surfaced once
    // by the page, never stored.
    yield put(offerActionSuccess(res.data))
    yield all([
      put(fetchOffersRequest()),
      put(fetchApplicationsRequest()),
      put(fetchJobsRequest()),
    ])
  } catch (err: any) {
    yield put(offerActionFailure(err?.response?.data?.detail || 'Could not action the offer.'))
  }
}

export function* hrRecruitmentSaga() {
  yield takeLatest(fetchJobsRequest.type, handleFetchJobs)
  yield takeLatest(saveJobRequest.type, handleSaveJob)
  yield takeLatest(fetchCandidatesRequest.type, handleFetchCandidates)
  yield takeLatest(fetchCandidateRequest.type, handleFetchCandidate)
  yield takeLatest(saveCandidateRequest.type, handleSaveCandidate)
  yield takeLatest(fetchApplicationsRequest.type, handleFetchApplications)
  yield takeLatest(moveStageRequest.type, handleMoveStage)
  yield takeLatest(fetchInterviewsRequest.type, handleFetchInterviews)
  yield takeLatest(scheduleInterviewRequest.type, handleScheduleInterview)
  yield takeLatest(submitFeedbackRequest.type, handleSubmitFeedback)
  yield takeLatest(fetchOffersRequest.type, handleFetchOffers)
  yield takeLatest(createOfferRequest.type, handleCreateOffer)
  yield takeLatest(offerActionRequest.type, handleOfferAction)
}
