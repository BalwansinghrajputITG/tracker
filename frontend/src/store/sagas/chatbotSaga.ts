import { call, put, take, takeLatest, select, cancelled } from 'redux-saga/effects'
import { eventChannel, END } from 'redux-saga'
import {
  sendMessageRequest, streamStart, streamToken, streamEnd, streamError,
  fetchMonitorUsersRequest, fetchMonitorUsersSuccess, fetchMonitorUsersFailure,
  selectMonitorUser, fetchMonitorSessionsSuccess, fetchMonitorSessionsFailure,
  selectMonitorSession, fetchMonitorMessagesSuccess, fetchMonitorMessagesFailure,
} from '../slices/chatbotSlice'
import { api } from '../../utils/api'
import { store } from '../index'
import { RootState } from '../index'

// ── SSE stream channel ────────────────────────────────────────────────────────

type StreamEvent =
  | { type: 'token'; token: string }
  | { type: 'done'; command?: string; action_taken?: boolean; structured_data?: any; session_id?: string }
  | { type: 'error'; message: string }

function createStreamChannel(message: string, sessionId: string) {
  return eventChannel<StreamEvent>((emit) => {
    const controller = new AbortController()
    const token = store.getState().auth.token
    const baseUrl = (process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1')

    fetch(`${baseUrl}/chatbot/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({ message, session_id: sessionId }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const err = await response.json().catch(() => ({ detail: 'Stream failed' }))
          emit({ type: 'error', message: err.detail || `HTTP ${response.status}` })
          emit(END)
          return
        }

        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) { emit(END); break }

          buffer += decoder.decode(value, { stream: true })

          // SSE events are separated by \n\n; the last segment may be incomplete
          const parts = buffer.split('\n\n')
          buffer = parts.pop()!          // keep incomplete trailing chunk

          for (const part of parts) {
            for (const line of part.split('\n')) {
              if (!line.startsWith('data: ')) continue
              const raw = line.slice(6).trim()
              if (!raw) continue
              try {
                const parsed = JSON.parse(raw)
                if (parsed.error) {
                  emit({ type: 'error', message: parsed.error })
                } else if (parsed.done) {
                  emit({ type: 'done', ...parsed })
                } else if (parsed.token !== undefined) {
                  emit({ type: 'token', token: parsed.token })
                }
              } catch {
                // Ignore malformed SSE lines
              }
            }
          }
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          emit({ type: 'error', message: err.message || 'Connection error' })
        }
        emit(END)
      })

    // Cleanup: abort fetch when saga is cancelled
    return () => controller.abort()
  })
}

// ── Own chat ──────────────────────────────────────────────────────────────────

function* handleSendMessage(action: ReturnType<typeof sendMessageRequest>) {
  const sessionId: string = yield select((s: RootState) => s.chatbot.sessionId)

  // Insert empty placeholder — typing indicator hidden once streaming starts
  yield put(streamStart())

  const channel: ReturnType<typeof createStreamChannel> = yield call(
    createStreamChannel,
    action.payload,
    sessionId,
  )

  try {
    while (true) {
      const event: StreamEvent = yield take(channel)

      if (event.type === 'token') {
        yield put(streamToken(event.token))
      } else if (event.type === 'done') {
        yield put(streamEnd({
          command: event.command,
          action_taken: event.action_taken,
          structured_data: event.structured_data ?? null,
        }))
        break
      } else if (event.type === 'error') {
        const status = undefined  // SSE errors carry text, not HTTP status
        const msg = event.message.includes('403') || event.message.includes('Access restricted')
          ? 'Access denied. You do not have permission to use the chatbot.'
          : event.message || 'Chatbot error. Please try again.'
        yield put(streamError(msg))
        break
      }
    }
  } finally {
    // If the saga was cancelled mid-stream (e.g. user logs out), close the channel
    if (yield cancelled()) {
      channel.close()
    }
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
