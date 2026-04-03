import { call, put, takeLatest, all } from 'redux-saga/effects'
import {
  fetchUsersRequest, fetchUsersSuccess, fetchUsersFailure,
  fetchSubordinatesSuccess, createUserRequest, createUserSuccess, createUserFailure,
} from '../slices/usersSlice'
import { api } from '../../utils/api'

function* handleFetchUsers(action: ReturnType<typeof fetchUsersRequest>) {
  try {
    const [usersRes, subRes]: any[] = yield all([
      call(api.get, '/users', { params: action.payload ?? {} }),
      call(api.get, '/users/subordinates'),
    ])
    yield put(fetchUsersSuccess({ users: usersRes.data.users, total: usersRes.data.total }))
    yield put(fetchSubordinatesSuccess(subRes.data.subordinates))
  } catch {
    yield put(fetchUsersFailure())
    try {
      const subRes: any = yield call(api.get, '/users/subordinates')
      yield put(fetchSubordinatesSuccess(subRes.data.subordinates))
    } catch {}
  }
}

function* handleCreateUser(action: ReturnType<typeof createUserRequest>) {
  try {
    yield call(api.post, '/users', action.payload)
    yield put(createUserSuccess())
    yield put(fetchUsersRequest())
  } catch (err: any) {
    const msg = err?.response?.data?.detail || 'Failed to create user.'
    yield put(createUserFailure(msg))
  }
}

export function* usersSaga() {
  yield takeLatest(fetchUsersRequest.type, handleFetchUsers)
  yield takeLatest(createUserRequest.type, handleCreateUser)
}
