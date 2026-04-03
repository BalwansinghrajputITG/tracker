import { call, put, takeLatest } from 'redux-saga/effects'
import { loginRequest, loginSuccess, loginFailure } from '../slices/authSlice'
import { resetSession } from '../slices/chatbotSlice'
import { api } from '../../utils/api'

function* handleLogin(action: ReturnType<typeof loginRequest>) {
  try {
    const response: any = yield call(api.post, '/auth/login', action.payload)
    // Reset all per-user state before setting the new user — prevents data leaking
    // between accounts when switching users in the same browser tab.
    yield put(resetSession())
    yield put(loginSuccess({
      user: {
        user_id: response.data.user_id,
        full_name: response.data.full_name,
        roles: response.data.roles,
        primary_role: response.data.roles[0] || 'employee',
      },
      token: response.data.access_token,
    }))
  } catch (err: any) {
    yield put(loginFailure(err?.response?.data?.detail || 'Login failed'))
  }
}

export function* authSaga() {
  yield takeLatest(loginRequest.type, handleLogin)
}
