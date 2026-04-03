import { call, put, takeLatest } from 'redux-saga/effects'
import { fetchSheetsRequest, fetchSheetsSuccess, setError } from '../slices/sheetsSlice'
import { api } from '../../utils/api'

function* handleFetchSheets(action: ReturnType<typeof fetchSheetsRequest>) {
  try {
    const response: any = yield call(api.get, '/sheets', { params: action.payload })
    yield put(fetchSheetsSuccess(response.data))
  } catch (err: any) {
    yield put(setError(err?.response?.data?.detail || 'Failed to load sheets'))
  }
}

export function* sheetsSaga() {
  yield takeLatest(fetchSheetsRequest.type, handleFetchSheets)
}
