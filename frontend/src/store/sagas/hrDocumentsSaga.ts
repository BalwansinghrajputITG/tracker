import { call, put, takeLatest } from 'redux-saga/effects'
import {
  fetchDocumentsRequest, fetchDocumentsSuccess, fetchDocumentsFailure,
  fetchVersionsRequest, fetchVersionsSuccess, fetchVersionsFailure,
  documentUploaded,
  deleteDocumentRequest, deleteDocumentSuccess, deleteDocumentFailure,
} from '../slices/hrDocumentsSlice'
import { api } from '../../utils/api'

function* handleFetchDocuments(action: ReturnType<typeof fetchDocumentsRequest>) {
  try {
    const res: any = yield call(api.get, '/hr/documents', { params: action.payload ?? {} })
    yield put(fetchDocumentsSuccess({ documents: res.data.documents, total: res.data.total }))
  } catch (err: any) {
    yield put(fetchDocumentsFailure(err?.response?.data?.detail || 'Failed to load documents.'))
  }
}

function* handleFetchVersions(action: ReturnType<typeof fetchVersionsRequest>) {
  try {
    const res: any = yield call(api.get, `/hr/documents/${action.payload}/versions`)
    yield put(fetchVersionsSuccess(res.data.versions))
  } catch {
    yield put(fetchVersionsFailure())
  }
}

/** The uploader posts directly (for progress events) and dispatches this marker. */
function* handleDocumentUploaded(action: ReturnType<typeof documentUploaded>) {
  yield put(fetchDocumentsRequest({ user_id: action.payload.user_id }))
}

function* handleDeleteDocument(action: ReturnType<typeof deleteDocumentRequest>) {
  try {
    yield call(api.delete, `/hr/documents/${action.payload.id}`)
    yield put(deleteDocumentSuccess())
    yield put(fetchDocumentsRequest({ user_id: action.payload.user_id }))
  } catch (err: any) {
    yield put(deleteDocumentFailure(err?.response?.data?.detail || 'Failed to delete document.'))
  }
}

export function* hrDocumentsSaga() {
  yield takeLatest(fetchDocumentsRequest.type, handleFetchDocuments)
  yield takeLatest(fetchVersionsRequest.type, handleFetchVersions)
  yield takeLatest(documentUploaded.type, handleDocumentUploaded)
  yield takeLatest(deleteDocumentRequest.type, handleDeleteDocument)
}
