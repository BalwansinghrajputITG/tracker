import { call, put, takeLatest, all, select } from 'redux-saga/effects'
import { RootState } from '../index'
import {
  fetchAttendanceRequest, fetchAttendanceSuccess, fetchAttendanceFailure,
  fetchTodayRequest, fetchTodaySuccess, fetchTodayFailure,
  punchRequest, punchSuccess, punchFailure,
  fetchBalancesRequest, fetchBalancesSuccess, fetchBalancesFailure,
  fetchLeaveTypesRequest, fetchLeaveTypesSuccess, fetchLeaveTypesFailure,
  fetchLeaveRequestsRequest, fetchLeaveRequestsSuccess, fetchLeaveRequestsFailure,
  fetchApprovalsRequest, fetchApprovalsSuccess, fetchApprovalsFailure,
  submitLeaveRequest, submitLeaveSuccess, submitLeaveFailure,
  decideLeaveRequest, decideLeaveSuccess, decideLeaveFailure,
  cancelLeaveRequest,
  fetchHolidaysRequest, fetchHolidaysSuccess, fetchHolidaysFailure,
  fetchCalendarRequest, fetchCalendarSuccess, fetchCalendarFailure,
} from '../slices/hrTimeSlice'
import { api } from '../../utils/api'

function* handleFetchAttendance(action: ReturnType<typeof fetchAttendanceRequest>) {
  try {
    const res: any = yield call(api.get, '/hr/attendance', { params: action.payload ?? {} })
    yield put(fetchAttendanceSuccess({ attendance: res.data.attendance, total: res.data.total }))
  } catch (err: any) {
    yield put(fetchAttendanceFailure(err?.response?.data?.detail || 'Failed to load attendance.'))
  }
}

function* handleFetchToday() {
  try {
    const res: any = yield call(api.get, '/hr/attendance/today')
    yield put(fetchTodaySuccess(res.data))
  } catch {
    yield put(fetchTodayFailure())
  }
}

function* handlePunch(action: ReturnType<typeof punchRequest>) {
  try {
    yield call(api.post, `/hr/attendance/punch-${action.payload}`, {})
    yield put(punchSuccess())
    yield put(fetchTodayRequest())
  } catch (err: any) {
    yield put(punchFailure(err?.response?.data?.detail || 'Could not record attendance.'))
  }
}

function* handleFetchBalances(action: ReturnType<typeof fetchBalancesRequest>) {
  try {
    const res: any = yield call(api.get, '/hr/leave/balances', { params: action.payload ?? {} })
    yield put(fetchBalancesSuccess(res.data.balances))
  } catch {
    yield put(fetchBalancesFailure())
  }
}

function* handleFetchLeaveTypes() {
  try {
    const res: any = yield call(api.get, '/hr/leave/types')
    yield put(fetchLeaveTypesSuccess(res.data.leave_types))
  } catch {
    yield put(fetchLeaveTypesFailure())
  }
}

function* handleFetchLeaveRequests(action: ReturnType<typeof fetchLeaveRequestsRequest>) {
  const scope = action.payload?.scope ?? 'all'
  try {
    const params: any = {}
    if (action.payload?.status) params.status = action.payload.status
    if (scope === 'me') {
      // Must be explicit. Without user_id the endpoint returns everything the
      // caller may see, so an HR user's "My leave" tab would list the whole
      // company's requests as if they were their own.
      const userId: string | undefined = yield select((s: RootState) => s.auth.user?.user_id)
      if (!userId) return
      params.user_id = userId
    }
    const res: any = yield call(api.get, '/hr/leave/requests', { params })
    yield put(fetchLeaveRequestsSuccess({ requests: res.data.requests, scope }))
  } catch (err: any) {
    yield put(fetchLeaveRequestsFailure(err?.response?.data?.detail || 'Failed to load leave requests.'))
  }
}

function* handleFetchApprovals() {
  try {
    const res: any = yield call(api.get, '/hr/leave/requests', { params: { pending_my_action: true } })
    yield put(fetchApprovalsSuccess(res.data.requests))
  } catch {
    yield put(fetchApprovalsFailure())
  }
}

function* handleSubmitLeave(action: ReturnType<typeof submitLeaveRequest>) {
  try {
    yield call(api.post, '/hr/leave/requests', action.payload)
    yield put(submitLeaveSuccess())
    // Balance and list both move — refresh together rather than patching locally.
    yield all([
      put(fetchLeaveRequestsRequest({ scope: 'me' })),
      put(fetchBalancesRequest()),
    ])
  } catch (err: any) {
    yield put(submitLeaveFailure(err?.response?.data?.detail || 'Could not submit the request.'))
  }
}

function* handleDecide(action: ReturnType<typeof decideLeaveRequest>) {
  try {
    yield call(api.post, `/hr/leave/requests/${action.payload.id}/decision`, {
      approve: action.payload.approve,
      comment: action.payload.comment || '',
    })
    yield put(decideLeaveSuccess())
    yield all([put(fetchApprovalsRequest()), put(fetchLeaveRequestsRequest({ scope: 'all' }))])
  } catch (err: any) {
    // A 409 here means someone else actioned it first — surface the server's
    // wording rather than a generic failure.
    yield put(decideLeaveFailure(err?.response?.data?.detail || 'Could not action the request.'))
    yield put(fetchApprovalsRequest())
  }
}

function* handleCancel(action: ReturnType<typeof cancelLeaveRequest>) {
  try {
    yield call(api.post, `/hr/leave/requests/${action.payload}/cancel`, {})
    yield put(decideLeaveSuccess())
    yield all([
      put(fetchLeaveRequestsRequest({ scope: 'me' })),
      put(fetchBalancesRequest()),
    ])
  } catch (err: any) {
    yield put(decideLeaveFailure(err?.response?.data?.detail || 'Could not cancel the request.'))
  }
}

function* handleFetchHolidays() {
  try {
    const res: any = yield call(api.get, '/hr/holidays')
    yield put(fetchHolidaysSuccess(res.data.holidays))
  } catch {
    yield put(fetchHolidaysFailure())
  }
}

function* handleFetchCalendar(action: ReturnType<typeof fetchCalendarRequest>) {
  try {
    const res: any = yield call(api.get, '/hr/holidays/calendar', { params: action.payload ?? {} })
    yield put(fetchCalendarSuccess({ days: res.data.days, summary: res.data.summary }))
  } catch {
    yield put(fetchCalendarFailure())
  }
}

export function* hrTimeSaga() {
  yield takeLatest(fetchAttendanceRequest.type, handleFetchAttendance)
  yield takeLatest(fetchTodayRequest.type, handleFetchToday)
  yield takeLatest(punchRequest.type, handlePunch)
  yield takeLatest(fetchBalancesRequest.type, handleFetchBalances)
  yield takeLatest(fetchLeaveTypesRequest.type, handleFetchLeaveTypes)
  yield takeLatest(fetchLeaveRequestsRequest.type, handleFetchLeaveRequests)
  yield takeLatest(fetchApprovalsRequest.type, handleFetchApprovals)
  yield takeLatest(submitLeaveRequest.type, handleSubmitLeave)
  yield takeLatest(decideLeaveRequest.type, handleDecide)
  yield takeLatest(cancelLeaveRequest.type, handleCancel)
  yield takeLatest(fetchHolidaysRequest.type, handleFetchHolidays)
  yield takeLatest(fetchCalendarRequest.type, handleFetchCalendar)
}
