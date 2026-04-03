import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface User {
  id: string
  email: string
  full_name: string
  department: string
  roles: string[]
  primary_role: string
  team_ids: string[]
  last_seen: string
  phone?: string
  is_active?: boolean
  created_at?: string
}

export interface CreateUserPayload {
  email: string
  password: string
  full_name: string
  department: string
  roles: string[]
  phone?: string
}

interface UsersState {
  items: User[]
  total: number
  page: number
  limit: number
  subordinates: User[]
  isLoading: boolean
  createLoading: boolean
  createError: string | null
}

const initialState: UsersState = {
  items: [],
  total: 0,
  page: 1,
  limit: 12,
  subordinates: [],
  isLoading: false,
  createLoading: false,
  createError: null,
}

const usersSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {
    fetchUsersRequest: {
      reducer(state) { state.isLoading = true },
      prepare(payload?: { page?: number; limit?: number; role?: string }) {
        return { payload }
      },
    },
    fetchUsersSuccess(state, action: PayloadAction<{ users: User[]; total: number }>) {
      state.isLoading = false
      state.items = action.payload.users
      state.total = action.payload.total
    },
    fetchUsersFailure(state) {
      state.isLoading = false
    },
    fetchSubordinatesSuccess(state, action: PayloadAction<User[]>) {
      state.subordinates = action.payload
    },
    createUserRequest(state, _action: PayloadAction<CreateUserPayload>) {
      state.createLoading = true
      state.createError = null
    },
    createUserSuccess(state) {
      state.createLoading = false
    },
    createUserFailure(state, action: PayloadAction<string>) {
      state.createLoading = false
      state.createError = action.payload
    },
    clearCreateError(state) {
      state.createError = null
    },
  },
})

export const {
  fetchUsersRequest, fetchUsersSuccess, fetchUsersFailure,
  fetchSubordinatesSuccess, createUserRequest, createUserSuccess,
  createUserFailure, clearCreateError,
} = usersSlice.actions
export default usersSlice.reducer
