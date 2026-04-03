import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface User {
  user_id: string
  full_name: string
  roles: string[]
  primary_role: string
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
    logout(state) {
      state.user = null
      state.token = null
      localStorage.removeItem('auth')
    },
  },
})

export const { loginRequest, loginSuccess, loginFailure, logout } = authSlice.actions
export default authSlice.reducer
