import { call, put, takeLatest } from 'redux-saga/effects'
import {
  fetchTasksRequest, fetchTasksSuccess,
  createTaskRequest, updateTaskLocal, setError,
} from '../slices/tasksSlice'
import { api } from '../../utils/api'

function* handleFetchTasks(action: ReturnType<typeof fetchTasksRequest>) {
  try {
    const response: any = yield call(api.get, '/tasks', { params: action.payload })
    yield put(fetchTasksSuccess(response.data))
  } catch (err: any) {
    yield put(setError(err?.response?.data?.detail || 'Failed to load tasks'))
  }
}

function* handleCreateTask(action: ReturnType<typeof createTaskRequest>) {
  try {
    yield call(api.post, '/tasks', action.payload)
    yield put(fetchTasksRequest(action.payload.project_id ? { project_id: action.payload.project_id } : {}))
  } catch (err: any) {
    yield put(setError(err?.response?.data?.detail || 'Failed to create task'))
  }
}

export function* tasksSaga() {
  yield takeLatest(fetchTasksRequest.type, handleFetchTasks)
  yield takeLatest(createTaskRequest.type, handleCreateTask)
}
