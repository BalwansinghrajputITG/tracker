import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface User {
  user_id: string
  full_name: string
  email?: string
  roles: string[]
  primary_role: string
  department?: string
  team_ids?: string[]
  id?: string   // alias used in some legacy components
  /** Effective permission set from the backend. Presentational only — see usePermissions. */
  permissions?: string[]
}

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  error: string | null
}

const stored = localStorage.getItem('auth')
const initial: AuthState = stored
  ? { ...JSON.parse(stored), isLoading: false, error: null }
  : { user: null, token: null, isLoading: false, error: null }

const authSlice = createSlice({
  name: 'auth',
  initialState: initial,
  reducers: {
    loginRequest(state, _action: PayloadAction<{ email: string; password: string }>) {
      state.isLoading = true
      state.error = null
    },
    loginSuccess(state, action: PayloadAction<{ user: User; token: string }>) {
      state.isLoading = false
      state.user = action.payload.user
      state.token = action.payload.token
      localStorage.setItem('auth', JSON.stringify({ user: action.payload.user, token: action.payload.token }))
    },
    loginFailure(state, action: PayloadAction<string>) {
      state.isLoading = false
      state.error = action.payload
    },
    /**
     * Backfill the permission set for a session that predates permissions being
     * issued at login. Without this, an already-logged-in user would silently
     * fail every can() check until they logged out and back in.
     */
    permissionsRehydrated(state, action: PayloadAction<string[]>) {
      if (!state.user) return
      state.user.permissions = action.payload
      localStorage.setItem('auth', JSON.stringify({ user: state.user, token: state.token }))
    },
    logout(state) {
      state.user = null
      state.token = null
      localStorage.removeItem('auth')
    },
  },
})

export const {
  loginRequest, loginSuccess, loginFailure, permissionsRehydrated, logout,
} = authSlice.actions
export default authSlice.reducer
