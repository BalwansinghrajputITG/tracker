import { call, put, takeLatest } from 'redux-saga/effects'
import {
  fetchDashboardRequest, fetchDashboardSuccess, fetchDashboardFailure,
} from '../slices/digitalMarketingSlice'
import { api } from '../../utils/api'

function* handleFetchDashboard(action: ReturnType<typeof fetchDashboardRequest>) {
  try {
    const response: any = yield call(api.get, '/digital-marketing/dashboard', {
      params: { period: action.payload.period },
    })
    yield put(fetchDashboardSuccess(response.data))
  } catch (err: any) {
    yield put(fetchDashboardFailure(err?.response?.data?.detail || 'Failed to load dashboard'))
  }
}

export function* digitalMarketingSaga() {
  yield takeLatest(fetchDashboardRequest.type, handleFetchDashboard)
}
