import { call, put, takeLatest } from 'redux-saga/effects'
import {
  fetchEmployeesRequest, fetchEmployeesSuccess, fetchEmployeesFailure,
  fetchEmployeeRequest, fetchEmployeeSuccess, fetchEmployeeFailure,
  fetchMyEmployeeRequest, fetchMyEmployeeSuccess, fetchMyEmployeeFailure,
  fetchCompensationRequest, fetchCompensationSuccess, fetchCompensationFailure,
  updateEmployeeRequest, updateEmployeeSuccess, updateEmployeeFailure,
} from '../slices/hrEmployeesSlice'
import { api } from '../../utils/api'

function* handleFetchEmployees(action: ReturnType<typeof fetchEmployeesRequest>) {
  try {
    const res: any = yield call(api.get, '/hr/employees', { params: action.payload ?? {} })
    yield put(fetchEmployeesSuccess({
      employees: res.data.employees,
      total: res.data.total,
      page: res.data.page,
      limit: res.data.limit,
    }))
  } catch (err: any) {
    yield put(fetchEmployeesFailure(err?.response?.data?.detail || 'Failed to load employees.'))
  }
}

function* handleFetchEmployee(action: ReturnType<typeof fetchEmployeeRequest>) {
  try {
    const res: any = yield call(api.get, `/hr/employees/${action.payload}`)
    yield put(fetchEmployeeSuccess(res.data))
  } catch (err: any) {
    yield put(fetchEmployeeFailure(err?.response?.data?.detail || 'Failed to load employee.'))
  }
}

function* handleFetchMyEmployee() {
  try {
    const res: any = yield call(api.get, '/hr/employees/me')
    yield put(fetchMyEmployeeSuccess(res.data))
  } catch {
    // 404 simply means this user has no HR profile yet — not an error worth surfacing.
    yield put(fetchMyEmployeeFailure())
  }
}

function* handleFetchCompensation(action: ReturnType<typeof fetchCompensationRequest>) {
  try {
    const res: any = yield call(api.get, `/hr/compensation/${action.payload}`)
    yield put(fetchCompensationSuccess({ current: res.data.current, history: res.data.history }))
  } catch {
    // 403 without salary.read is the expected path, not a failure to report.
    yield put(fetchCompensationFailure())
  }
}

function* handleUpdateEmployee(action: ReturnType<typeof updateEmployeeRequest>) {
  try {
    yield call(api.put, `/hr/employees/${action.payload.id}`, action.payload.updates)
    yield put(updateEmployeeSuccess())
    // Re-fetch rather than patching locally: the server derives designation_title,
    // manager_name and department_name, so a local merge would show stale labels.
    yield put(fetchEmployeeRequest(action.payload.id))
  } catch (err: any) {
    yield put(updateEmployeeFailure(err?.response?.data?.detail || 'Failed to update employee.'))
  }
}

export function* hrEmployeesSaga() {
  yield takeLatest(fetchEmployeesRequest.type, handleFetchEmployees)
  yield takeLatest(fetchEmployeeRequest.type, handleFetchEmployee)
  yield takeLatest(fetchMyEmployeeRequest.type, handleFetchMyEmployee)
  yield takeLatest(fetchCompensationRequest.type, handleFetchCompensation)
  yield takeLatest(updateEmployeeRequest.type, handleUpdateEmployee)
}
