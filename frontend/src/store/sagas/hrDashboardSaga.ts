import { call, put, takeLatest, all } from 'redux-saga/effects'
import {
  fetchHrDashboardRequest, fetchHrDashboardSuccess, fetchHrDashboardFailure,
  fetchHrAnalyticsRequest, fetchHrAnalyticsSuccess, fetchHrAnalyticsFailure,
} from '../slices/hrDashboardSlice'
import { api } from '../../utils/api'

function* handleFetchDashboard() {
  try {
    const res: any = yield call(api.get, '/hr/dashboard')
    yield put(fetchHrDashboardSuccess(res.data))
  } catch (err: any) {
    yield put(fetchHrDashboardFailure(err?.response?.data?.detail || 'Failed to load the HR dashboard.'))
  }
}

function* handleFetchAnalytics() {
  try {
    // Six independent endpoints — fetched concurrently rather than in sequence,
    // since each is its own aggregation and none depends on the others.
    const [workforce, recruitment, attendance, leave, performance, attrition]: any[] = yield all([
      call(api.get, '/hr/analytics/workforce'),
      call(api.get, '/hr/analytics/recruitment'),
      call(api.get, '/hr/analytics/attendance'),
      call(api.get, '/hr/analytics/leave'),
      call(api.get, '/hr/analytics/performance'),
      call(api.get, '/hr/analytics/attrition'),
    ])
    yield put(fetchHrAnalyticsSuccess({
      workforce: workforce.data, recruitment: recruitment.data,
      attendance: attendance.data, leave: leave.data,
      performance: performance.data, attrition: attrition.data,
    }))
  } catch (err: any) {
    yield put(fetchHrAnalyticsFailure(err?.response?.data?.detail || 'Failed to load HR analytics.'))
  }
}

export function* hrDashboardSaga() {
  yield takeLatest(fetchHrDashboardRequest.type, handleFetchDashboard)
  yield takeLatest(fetchHrAnalyticsRequest.type, handleFetchAnalytics)
}
