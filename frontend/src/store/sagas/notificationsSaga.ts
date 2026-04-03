import { call, put, takeLatest, take, fork, select, delay } from 'redux-saga/effects'
import { eventChannel, END } from 'redux-saga'
import {
  fetchNotificationsRequest, fetchNotificationsSuccess,
  markReadRequest, markReadLocal, markAllReadRequest, markAllReadLocal,
  deleteNotificationRequest, deleteNotificationLocal, clearAllRequest, clearAllLocal,
} from '../slices/notificationsSlice'
import { loginSuccess, logout } from '../slices/authSlice'
import { api } from '../../utils/api'
import { RootState } from '../index'

function createNotificationChannel(token: string) {
  const wsUrl = `${process.env.REACT_APP_WS_URL || 'ws://localhost:8000'}/api/v1/notifications/ws?token=${token}&ngrok-skip-browser-warning=true`
  const ws = new WebSocket(wsUrl)
  return eventChannel(emit => {
    ws.onmessage = (e) => {
      try { emit(JSON.parse(e.data)) } catch {}
    }
    ws.onerror = () => emit(END)
    ws.onclose = () => emit(END)
    const interval = setInterval(() => { if (ws.readyState === 1) ws.send('ping') }, 30000)
    return () => { clearInterval(interval); ws.close() }
  })
}

function* runNotificationChannel(token: string) {
  const channel: any = yield call(createNotificationChannel, token)
  try {
    while (true) {
      const event: any = yield take(channel)
      if (event?.type === 'notification') {
        // Refetch to get real IDs, reference fields, and accurate unread count
        yield put(fetchNotificationsRequest())
      }
    }
  } finally {
    channel.close()
  }
}

function* handleFetchNotifications() {
  try {
    const response: any = yield call(api.get, '/notifications')
    yield put(fetchNotificationsSuccess(response.data))
  } catch {}
}

function* handleMarkRead(action: ReturnType<typeof markReadRequest>) {
  try {
    yield call(api.put, `/notifications/${action.payload}/read`)
    yield put(markReadLocal(action.payload))
  } catch {}
}

function* handleMarkAllRead() {
  try {
    yield call(api.put, '/notifications/read-all')
    yield put(markAllReadLocal())
  } catch {}
}

function* handleDeleteNotification(action: ReturnType<typeof deleteNotificationRequest>) {
  try {
    yield call(api.delete, `/notifications/${action.payload}`)
    yield put(deleteNotificationLocal(action.payload))
  } catch {}
}

function* handleClearAll() {
  try {
    yield call(api.delete, '/notifications')
    yield put(clearAllLocal())
  } catch {}
}

// Poll every 60 seconds as WebSocket fallback
function* pollNotifications() {
  while (true) {
    yield delay(60_000)
    yield put(fetchNotificationsRequest())
  }
}

function* watchNotificationWebSocket() {
  const existingToken: string | null = yield select((state: RootState) => state.auth.token)
  if (existingToken) {
    yield fork(runNotificationChannel, existingToken)
    yield fork(pollNotifications)
  }

  while (true) {
    const action: ReturnType<typeof loginSuccess> = yield take(loginSuccess.type)
    yield fork(runNotificationChannel, action.payload.token)
    yield fork(pollNotifications)
    yield take(logout.type)
  }
}

export function* notificationsSaga() {
  yield takeLatest(fetchNotificationsRequest.type, handleFetchNotifications)
  yield takeLatest(markReadRequest.type, handleMarkRead)
  yield takeLatest(markAllReadRequest.type, handleMarkAllRead)
  yield takeLatest(deleteNotificationRequest.type, handleDeleteNotification)
  yield takeLatest(clearAllRequest.type, handleClearAll)
  yield fork(watchNotificationWebSocket)
}
