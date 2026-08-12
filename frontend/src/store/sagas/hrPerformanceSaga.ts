import { call, put, takeLatest, all } from 'redux-saga/effects'
import {
  fetchGoalsRequest, fetchGoalsSuccess, fetchGoalsFailure,
  saveGoalRequest, saveGoalSuccess, saveGoalFailure,
  updateGoalRequest, updateGoalSuccess, updateGoalFailure,
  fetchCyclesRequest, fetchCyclesSuccess, fetchCyclesFailure,
  fetchReviewsRequest, fetchReviewsSuccess, fetchReviewsFailure,
  fetchReviewRequest, fetchReviewSuccess, fetchReviewFailure,
  submitReviewRequest, submitReviewSuccess, submitReviewFailure,
} from '../slices/hrPerformanceSlice'
import {
  fetchTicketsRequest, fetchTicketsSuccess, fetchTicketsFailure,
  fetchTicketRequest, fetchTicketSuccess, fetchTicketFailure,
  createTicketRequest, createTicketSuccess, createTicketFailure,
  replyTicketRequest, replyTicketSuccess, replyTicketFailure,
  updateTicketRequest, updateTicketSuccess, updateTicketFailure,
} from '../slices/hrTicketsSlice'
import { api } from '../../utils/api'

/* ── Performance ──────────────────────────────────────────────────────────── */

function* handleFetchGoals(action: ReturnType<typeof fetchGoalsRequest>) {
  try {
    const res: any = yield call(api.get, '/hr/performance/goals', { params: action.payload ?? {} })
    yield put(fetchGoalsSuccess({
      goals: res.data.goals, weighted_completion: res.data.weighted_completion,
    }))
  } catch (err: any) {
    yield put(fetchGoalsFailure(err?.response?.data?.detail || 'Failed to load goals.'))
  }
}

function* handleSaveGoal(action: ReturnType<typeof saveGoalRequest>) {
  const userId = (action.payload as Record<string, any>).user_id as string | undefined
  try {
    yield call(api.post, '/hr/performance/goals', action.payload)
    yield put(saveGoalSuccess())
    yield put(fetchGoalsRequest(userId ? { user_id: userId } : undefined))
  } catch (err: any) {
    yield put(saveGoalFailure(err?.response?.data?.detail || 'Could not assign the goal.'))
  }
}

function* handleUpdateGoal(action: ReturnType<typeof updateGoalRequest>) {
  try {
    yield call(api.put, `/hr/performance/goals/${action.payload.id}`, action.payload.updates)
    yield put(updateGoalSuccess())
    yield put(fetchGoalsRequest())
  } catch (err: any) {
    yield put(updateGoalFailure(err?.response?.data?.detail || 'Could not update the goal.'))
  }
}

function* handleFetchCycles() {
  try {
    const res: any = yield call(api.get, '/hr/performance/cycles')
    yield put(fetchCyclesSuccess(res.data.cycles))
  } catch {
    yield put(fetchCyclesFailure())
  }
}

function* handleFetchReviews(action: ReturnType<typeof fetchReviewsRequest>) {
  try {
    const res: any = yield call(api.get, '/hr/performance/reviews', { params: action.payload ?? {} })
    yield put(fetchReviewsSuccess(res.data.reviews))
  } catch (err: any) {
    yield put(fetchReviewsFailure(err?.response?.data?.detail || 'Failed to load reviews.'))
  }
}

function* handleFetchReview(action: ReturnType<typeof fetchReviewRequest>) {
  try {
    const res: any = yield call(api.get, `/hr/performance/reviews/${action.payload}`)
    yield put(fetchReviewSuccess(res.data))
  } catch {
    yield put(fetchReviewFailure())
  }
}

function* handleSubmitReview(action: ReturnType<typeof submitReviewRequest>) {
  try {
    yield call(api.post, `/hr/performance/reviews/${action.payload.id}/submit`, action.payload.payload)
    yield put(submitReviewSuccess())
    // Both the row and the detail change (status, composite), so refresh both.
    yield all([
      put(fetchReviewsRequest()),
      put(fetchReviewRequest(action.payload.id)),
    ])
  } catch (err: any) {
    yield put(submitReviewFailure(err?.response?.data?.detail || 'Could not submit the review.'))
  }
}

/* ── Helpdesk ─────────────────────────────────────────────────────────────── */

function* handleFetchTickets(action: ReturnType<typeof fetchTicketsRequest>) {
  try {
    const res: any = yield call(api.get, '/hr/tickets', { params: action.payload ?? {} })
    yield put(fetchTicketsSuccess(res.data))
  } catch (err: any) {
    yield put(fetchTicketsFailure(err?.response?.data?.detail || 'Failed to load tickets.'))
  }
}

function* handleFetchTicket(action: ReturnType<typeof fetchTicketRequest>) {
  try {
    const res: any = yield call(api.get, `/hr/tickets/${action.payload}`)
    yield put(fetchTicketSuccess(res.data))
  } catch (err: any) {
    yield put(fetchTicketFailure(err?.response?.data?.detail || 'Could not open the ticket.'))
  }
}

function* handleCreateTicket(action: ReturnType<typeof createTicketRequest>) {
  try {
    yield call(api.post, '/hr/tickets', action.payload)
    yield put(createTicketSuccess())
    yield put(fetchTicketsRequest())
  } catch (err: any) {
    yield put(createTicketFailure(err?.response?.data?.detail || 'Could not raise the ticket.'))
  }
}

function* handleReplyTicket(action: ReturnType<typeof replyTicketRequest>) {
  try {
    yield call(api.post, `/hr/tickets/${action.payload.id}/reply`, {
      body: action.payload.body, is_internal: action.payload.is_internal,
    })
    yield put(replyTicketSuccess())
    yield all([put(fetchTicketRequest(action.payload.id)), put(fetchTicketsRequest())])
  } catch (err: any) {
    yield put(replyTicketFailure(err?.response?.data?.detail || 'Could not send the reply.'))
  }
}

function* handleUpdateTicket(action: ReturnType<typeof updateTicketRequest>) {
  try {
    yield call(api.put, `/hr/tickets/${action.payload.id}`, action.payload.updates)
    yield put(updateTicketSuccess())
    yield all([put(fetchTicketRequest(action.payload.id)), put(fetchTicketsRequest())])
  } catch (err: any) {
    yield put(updateTicketFailure(err?.response?.data?.detail || 'Could not update the ticket.'))
  }
}

export function* hrPerformanceSaga() {
  yield takeLatest(fetchGoalsRequest.type, handleFetchGoals)
  yield takeLatest(saveGoalRequest.type, handleSaveGoal)
  yield takeLatest(updateGoalRequest.type, handleUpdateGoal)
  yield takeLatest(fetchCyclesRequest.type, handleFetchCycles)
  yield takeLatest(fetchReviewsRequest.type, handleFetchReviews)
  yield takeLatest(fetchReviewRequest.type, handleFetchReview)
  yield takeLatest(submitReviewRequest.type, handleSubmitReview)

  yield takeLatest(fetchTicketsRequest.type, handleFetchTickets)
  yield takeLatest(fetchTicketRequest.type, handleFetchTicket)
  yield takeLatest(createTicketRequest.type, handleCreateTicket)
  yield takeLatest(replyTicketRequest.type, handleReplyTicket)
  yield takeLatest(updateTicketRequest.type, handleUpdateTicket)
}
