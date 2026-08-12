import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface HrDocument {
  id: string
  doc_group_id: string
  version: number
  is_current: boolean
  user_id: string | null
  subject_name: string
  doc_type: string
  title: string
  description: string
  file_name: string
  mime_type: string
  size_bytes: number
  expires_at: string | null
  expiry_state: 'none' | 'valid' | 'expiring_soon' | 'expired'
  is_confidential: boolean
  scan_status: string
  uploaded_by_name: string
  created_at: string | null
}

interface HrDocumentsState {
  items: HrDocument[]
  total: number
  versions: HrDocument[]
  isLoading: boolean
  versionsLoading: boolean
  deleteLoading: boolean
  error: string | null
}

const initialState: HrDocumentsState = {
  items: [],
  total: 0,
  versions: [],
  isLoading: false,
  versionsLoading: false,
  deleteLoading: false,
  error: null,
}

const hrDocumentsSlice = createSlice({
  name: 'hrDocuments',
  initialState,
  reducers: {
    fetchDocumentsRequest: {
      reducer(state, _action: PayloadAction<{ user_id?: string; include_versions?: boolean } | undefined>) {
        state.isLoading = true
        state.error = null
      },
      prepare(payload?: { user_id?: string; include_versions?: boolean }) {
        return { payload }
      },
    },
    fetchDocumentsSuccess(state, action: PayloadAction<{ documents: HrDocument[]; total: number }>) {
      state.isLoading = false
      state.items = action.payload.documents
      state.total = action.payload.total
    },
    fetchDocumentsFailure(state, action: PayloadAction<string>) {
      state.isLoading = false
      state.error = action.payload
    },

    fetchVersionsRequest(state, _action: PayloadAction<string>) {
      state.versionsLoading = true
    },
    fetchVersionsSuccess(state, action: PayloadAction<HrDocument[]>) {
      state.versionsLoading = false
      state.versions = action.payload
    },
    fetchVersionsFailure(state) {
      state.versionsLoading = false
    },

    /** Marker dispatched by the uploader, which posts directly for progress events. */
    documentUploaded(_state, _action: PayloadAction<{ user_id: string }>) {},

    deleteDocumentRequest(state, _action: PayloadAction<{ id: string; user_id: string }>) {
      state.deleteLoading = true
    },
    deleteDocumentSuccess(state) {
      state.deleteLoading = false
    },
    deleteDocumentFailure(state, action: PayloadAction<string>) {
      state.deleteLoading = false
      state.error = action.payload
    },
  },
})

export const {
  fetchDocumentsRequest, fetchDocumentsSuccess, fetchDocumentsFailure,
  fetchVersionsRequest, fetchVersionsSuccess, fetchVersionsFailure,
  documentUploaded,
  deleteDocumentRequest, deleteDocumentSuccess, deleteDocumentFailure,
} = hrDocumentsSlice.actions

export default hrDocumentsSlice.reducer
