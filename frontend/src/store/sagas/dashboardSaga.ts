import { call, put, takeLatest } from 'redux-saga/effects'
import { fetchDashboardRequest, fetchDashboardSuccess, fetchDashboardFailure } from '../slices/dashboardSlice'
import { api } from '../../utils/api'

function* handleFetchDashboard(action: ReturnType<typeof fetchDashboardRequest>) {
  try {
    const role = action.payload
    const response: any = yield call(api.get, `/dashboard/${role}`)
    yield put(fetchDashboardSuccess(response.data))
  } catch (err: any) {
    yield put(fetchDashboardFailure(err?.response?.data?.detail || 'Dashboard error'))
  }
}

export function* dashboardSaga() {
  yield takeLatest(fetchDashboardRequest.type, handleFetchDashboard)
}
