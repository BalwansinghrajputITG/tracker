import axios from 'axios'
import { store } from '../store'
import { logout } from '../store/slices/authSlice'

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1'

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  withCredentials: false,   // token sent via Authorization header, not cookie
  headers: {
    'ngrok-skip-browser-warning': 'true',
  },
})

// Request interceptor: attach JWT
api.interceptors.request.use((config) => {
  const token = store.getState().auth.token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor: handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      store.dispatch(logout())
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
