import { call, put, takeLatest } from 'redux-saga/effects'
import {
  fetchProjectsRequest, fetchProjectsSuccess, fetchDelayedSuccess,
  createProjectRequest, createProjectSuccess, setError,
} from '../slices/projectsSlice'
import { api } from '../../utils/api'

function* handleFetchProjects(action: ReturnType<typeof fetchProjectsRequest>) {
  try {
    const params = action.payload
    const response: any = yield call(api.get, '/projects', { params })
    yield put(fetchProjectsSuccess(response.data))
  } catch (err: any) {
    yield put(setError(err?.response?.data?.detail || 'Failed to load projects'))
  }
}

function* handleCreateProject(action: ReturnType<typeof createProjectRequest>) {
  try {
    const response: any = yield call(api.post, '/projects', action.payload)
    // Fetch newly created project
    const projectResponse: any = yield call(api.get, `/projects/${response.data.project_id}`)
    yield put(createProjectSuccess(projectResponse.data))
  } catch (err: any) {
    yield put(setError(err?.response?.data?.detail || 'Failed to create project'))
  }
}

export function* projectsSaga() {
  yield takeLatest(fetchProjectsRequest.type, handleFetchProjects)
  yield takeLatest(createProjectRequest.type, handleCreateProject)
}
