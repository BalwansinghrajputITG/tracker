import { call, put, takeLatest, take, fork, cancel, select } from 'redux-saga/effects'
import { Task } from '@redux-saga/types'
import { eventChannel, END } from 'redux-saga'
import {
  fetchRoomsRequest, fetchRoomsSuccess, fetchMessagesRequest,
  fetchMessagesSuccess, sendMessageRequest, receiveMessage,
  setTyping, clearTyping, setConnected, setActiveRoom,
  fetchContactsRequest, fetchContactsSuccess,
} from '../slices/chatSlice'
import { api } from '../../utils/api'
import { RootState } from '../index'

function createWebSocketChannel(ws: WebSocket) {
  return eventChannel(emit => {
    ws.onmessage = (e) => emit(JSON.parse(e.data))
    ws.onerror = () => emit(END)
    ws.onclose = () => emit(END)
    return () => ws.close()
  })
}

function* handleFetchRooms() {
  try {
    const response: any = yield call(api.get, '/chat/rooms')
    yield put(fetchRoomsSuccess(response.data.rooms))
  } catch {}
}

function* handleFetchContacts() {
  try {
    const response: any = yield call(api.get, '/chat/contacts')
    yield put(fetchContactsSuccess(response.data.contacts))
  } catch {}
}

function* handleFetchMessages(action: ReturnType<typeof fetchMessagesRequest>) {
  try {
    const { roomId, before } = action.payload
    const params = before ? { before, limit: 50 } : { limit: 50 }
    const response: any = yield call(api.get, `/chat/rooms/${roomId}/messages`, { params })
    yield put(fetchMessagesSuccess({ roomId, messages: response.data.messages }))
  } catch {}
}

function* handleSendMessage(action: ReturnType<typeof sendMessageRequest>) {
  try {
    const { roomId, content, mentions = [] } = action.payload
    const currentUser: any = yield select((state: RootState) => state.auth.user)
    const response: any = yield call(api.post, `/chat/rooms/${roomId}/messages`, { content, mentions })
    // Add message to store immediately so sender sees it without waiting for WebSocket
    yield put(receiveMessage({
      id: response.data.message_id,
      room_id: roomId,
      sender_id: currentUser?.user_id || '',
      sender_name: currentUser?.full_name || '',
      content,
      message_type: 'text',
      sent_at: new Date().toISOString(),
      read_by: [],
      mentions,
    }))
  } catch {}
}

function* watchWebSocket(roomId: string, token: string) {
  const wsUrl = `${process.env.REACT_APP_WS_URL || 'ws://localhost:8000'}/api/v1/chat/ws/${roomId}?token=${token}&ngrok-skip-browser-warning=true`
  const ws = new WebSocket(wsUrl)
  const channel: any = yield call(createWebSocketChannel, ws)

  yield put(setConnected(true))

  try {
    while (true) {
      const event: any = yield take(channel)
      if (event.type === 'new_message') {
        yield put(receiveMessage({
          id: event.message_id,
          room_id: event.room_id,
          sender_id: event.sender_id,
          sender_name: event.sender_name,
          content: event.content,
          message_type: 'text',
          sent_at: event.sent_at,
          read_by: [],
          mentions: [],
        }))
      } else if (event.type === 'typing') {
        yield put(setTyping({ roomId, userId: event.user_id, userName: event.user_name }))
        yield call(delay, 3000)
        yield put(clearTyping({ roomId, userId: event.user_id }))
      }
    }
  } finally {
    yield put(setConnected(false))
  }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export function* chatSaga() {
  yield takeLatest(fetchRoomsRequest.type, handleFetchRooms)
  yield takeLatest(fetchContactsRequest.type, handleFetchContacts)
  yield takeLatest(fetchMessagesRequest.type, handleFetchMessages)
  yield takeLatest(sendMessageRequest.type, handleSendMessage)

  let wsTask: Task | null = null
  while (true) {
    const action: ReturnType<typeof setActiveRoom> = yield take(setActiveRoom.type)
    if (wsTask) {
      yield cancel(wsTask)
      wsTask = null
    }
    const token: string | null = yield select((state: RootState) => state.auth.token)
    if (token) {
      wsTask = yield fork(watchWebSocket, action.payload, token)
    }
  }
}
