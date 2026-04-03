import { call, put, takeLatest } from 'redux-saga/effects'
import {
  fetchReportsRequest, fetchReportsSuccess,
  fetchMissingRequest, fetchMissingSuccess,
  submitReportRequest, submitReportSuccess, submitReportFailure, setError,
} from '../slices/reportsSlice'
import { api } from '../../utils/api'

function* handleFetchReports(action: ReturnType<typeof fetchReportsRequest>) {
  try {
    const response: any = yield call(api.get, '/reports', { params: action.payload })
    yield put(fetchReportsSuccess(response.data))
  } catch (err: any) {
    yield put(setError('Failed to load reports'))
  }
}

function* handleFetchMissing() {
  try {
    const response: any = yield call(api.get, '/reports/missing')
    yield put(fetchMissingSuccess(response.data.missing))
  } catch {
    yield put(fetchMissingSuccess([]))
  }
}

function* handleSubmitReport(action: ReturnType<typeof submitReportRequest>) {
  try {
    yield call(api.post, '/reports', action.payload)
    yield put(submitReportSuccess())
  } catch (err: any) {
    const detail = err?.response?.data?.detail
    const msg = Array.isArray(detail)
      ? detail.map((e: any) => e.msg || e.message || JSON.stringify(e)).join('; ')
      : detail || 'Failed to submit report'
    yield put(submitReportFailure(msg))
  }
}

export function* reportsSaga() {
  yield takeLatest(fetchReportsRequest.type, handleFetchReports)
  yield takeLatest(fetchMissingRequest.type, handleFetchMissing)
  yield takeLatest(submitReportRequest.type, handleSubmitReport)
}
