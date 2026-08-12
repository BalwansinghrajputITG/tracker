import { call, put, takeLatest } from 'redux-saga/effects'
import {
  fetchDesignationsRequest, fetchDesignationsSuccess, fetchDesignationsFailure,
  fetchHrDepartmentsRequest, fetchHrDepartmentsSuccess, fetchHrDepartmentsFailure,
  fetchOrgChartRequest, fetchOrgChartSuccess, fetchOrgChartFailure,
} from '../slices/hrOrgSlice'
import { api } from '../../utils/api'

function* handleFetchDesignations() {
  try {
    const res: any = yield call(api.get, '/hr/designations')
    yield put(fetchDesignationsSuccess(res.data.designations))
  } catch (err: any) {
    yield put(fetchDesignationsFailure(err?.response?.data?.detail || 'Failed to load designations.'))
  }
}

function* handleFetchDepartments() {
  try {
    const res: any = yield call(api.get, '/departments')
    yield put(fetchHrDepartmentsSuccess(res.data.departments || res.data))
  } catch {
    yield put(fetchHrDepartmentsFailure())
  }
}

function* handleFetchOrgChart() {
  try {
    const res: any = yield call(api.get, '/hr/employees/org-chart')
    yield put(fetchOrgChartSuccess({
      roots: res.data.roots,
      total: res.data.total,
      orphaned: res.data.orphaned,
    }))
  } catch (err: any) {
    yield put(fetchOrgChartFailure(err?.response?.data?.detail || 'Failed to load the org chart.'))
  }
}

export function* hrOrgSaga() {
  yield takeLatest(fetchDesignationsRequest.type, handleFetchDesignations)
  yield takeLatest(fetchHrDepartmentsRequest.type, handleFetchDepartments)
  yield takeLatest(fetchOrgChartRequest.type, handleFetchOrgChart)
}
