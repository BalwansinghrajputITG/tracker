import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface SheetColumn {
  key: string
  label: string
  type: string // text | number | date
}

export interface SheetEntry {
  id: string
  sheet_id: string
  data: Record<string, any>
  created_by: string
  creator_name?: string
  created_at: string
  updated_at: string
}

export interface Sheet {
  id: string
  name: string
  sheet_type: string
  project_id?: string
  project_name?: string
  description: string
  columns: SheetColumn[]
  created_by: string
  creator_name?: string
  creator_role?: string
  is_pinned: boolean
  entry_count?: number
  entries?: SheetEntry[]
  created_at: string
  updated_at: string
}

interface SheetsState {
  items: Sheet[]
  total: number
  isLoading: boolean
  error: string | null
}

const initialState: SheetsState = {
  items: [],
  total: 0,
  isLoading: false,
  error: null,
}

const sheetsSlice = createSlice({
  name: 'sheets',
  initialState,
  reducers: {
    fetchSheetsRequest(state, _: PayloadAction<any>) {
      state.isLoading = true
      state.error = null
    },
    fetchSheetsSuccess(state, action: PayloadAction<{ sheets: Sheet[]; total: number }>) {
      state.isLoading = false
      state.items = action.payload.sheets
      state.total = action.payload.total
    },
    setError(state, action: PayloadAction<string>) {
      state.isLoading = false
      state.error = action.payload
    },
  },
})

export const { fetchSheetsRequest, fetchSheetsSuccess, setError } = sheetsSlice.actions
export default sheetsSlice.reducer
