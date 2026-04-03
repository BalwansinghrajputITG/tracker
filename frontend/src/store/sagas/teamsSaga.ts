import { call, put, takeLatest } from 'redux-saga/effects'
import { fetchTeamsRequest, fetchTeamsSuccess, setError } from '../slices/teamsSlice'
import { api } from '../../utils/api'

function* handleFetchTeams(action: ReturnType<typeof fetchTeamsRequest>) {
  try {
    const response: any = yield call(api.get, '/teams', { params: action.payload ?? {} })
    yield put(fetchTeamsSuccess(response.data))
  } catch (err: any) {
    yield put(setError(err?.response?.data?.detail || 'Failed to load teams'))
  }
}

export function* teamsSaga() {
  yield takeLatest(fetchTeamsRequest.type, handleFetchTeams)
}
