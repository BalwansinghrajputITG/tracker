import { call, put, takeLatest, select } from 'redux-saga/effects'
import {
  sendMessageRequest, receiveResponse, setError,
  fetchMonitorUsersRequest, fetchMonitorUsersSuccess, fetchMonitorUsersFailure,
  selectMonitorUser, fetchMonitorSessionsSuccess, fetchMonitorSessionsFailure,
  selectMonitorSession, fetchMonitorMessagesSuccess, fetchMonitorMessagesFailure,
} from '../slices/chatbotSlice'
import { api } from '../../utils/api'
import { RootState } from '../index'

// ── Own chat ──────────────────────────────────────────────────────────────────

function* handleSendMessage(action: ReturnType<typeof sendMessageRequest>) {
  try {
    const sessionId: string = yield select((s: RootState) => s.chatbot.sessionId)
    const response: any = yield call(api.post, '/chatbot/message', {
      message: action.payload,
      session_id: sessionId,
    })
    yield put(receiveResponse({
      content: response.data.response,
      command: response.data.command,
      action_taken: response.data.action_taken,
      structured_data: response.data.structured_data ?? null,
    }))
  } catch (err: any) {
    const status = err?.response?.status
    const detail = err?.response?.data?.detail
    const msg = status === 403
      ? 'Access denied. You do not have permission to use the chatbot.'
      : detail || 'Chatbot error. Please try again.'
    yield put(setError(msg))
  }
}

// ── CEO/COO monitoring ────────────────────────────────────────────────────────

function* handleFetchMonitorUsers() {
  try {
    const response: any = yield call(api.get, '/chatbot/monitor/users')
    yield put(fetchMonitorUsersSuccess(response.data.users))
  } catch {
    yield put(fetchMonitorUsersFailure())
  }
}

function* handleSelectMonitorUser(action: ReturnType<typeof selectMonitorUser>) {
  try {
    const userId = action.payload.user_id
    const response: any = yield call(api.get, `/chatbot/monitor/sessions/${userId}`)
    yield put(fetchMonitorSessionsSuccess(response.data.sessions))
  } catch {
    yield put(fetchMonitorSessionsFailure())
  }
}

function* handleSelectMonitorSession(action: ReturnType<typeof selectMonitorSession>) {
  try {
    const sessionId = action.payload
    const userId: string = yield select(
      (s: RootState) => s.chatbot.selectedMonitorUser?.user_id ?? ''
    )
    const response: any = yield call(
      api.get,
      `/chatbot/monitor/messages/${sessionId}`,
      { params: { user_id: userId } }
    )
    yield put(fetchMonitorMessagesSuccess(response.data.messages))
  } catch {
    yield put(fetchMonitorMessagesFailure())
  }
}

// ── Root saga ─────────────────────────────────────────────────────────────────

export function* chatbotSaga() {
  yield takeLatest(sendMessageRequest.type, handleSendMessage)
  yield takeLatest(fetchMonitorUsersRequest.type, handleFetchMonitorUsers)
  yield takeLatest(selectMonitorUser.type, handleSelectMonitorUser)
  yield takeLatest(selectMonitorSession.type, handleSelectMonitorSession)
}
