import { combineReducers } from '@reduxjs/toolkit'
import authReducer from './slices/authSlice'
import projectsReducer from './slices/projectsSlice'
import tasksReducer from './slices/tasksSlice'
import reportsReducer from './slices/reportsSlice'
import chatReducer from './slices/chatSlice'
import notificationsReducer from './slices/notificationsSlice'
import chatbotReducer from './slices/chatbotSlice'
import dashboardReducer from './slices/dashboardSlice'
import teamsReducer from './slices/teamsSlice'
import usersReducer from './slices/usersSlice'
import digitalMarketingReducer from './slices/digitalMarketingSlice'
import sheetsReducer from './slices/sheetsSlice'
import themeReducer from './slices/themeSlice'

const combinedReducer = combineReducers({
  auth: authReducer,
  projects: projectsReducer,
  tasks: tasksReducer,
  reports: reportsReducer,
  chat: chatReducer,
  notifications: notificationsReducer,
  chatbot: chatbotReducer,
  dashboard: dashboardReducer,
  teams: teamsReducer,
  users: usersReducer,
  digitalMarketing: digitalMarketingReducer,
  sheets: sheetsReducer,
  theme: themeReducer,
})

/**
 * On logout: pass only the `auth` key forward.
 * Every other slice receives `undefined` as state → resets to its own initialState.
 * This ensures user A's data (chatbot messages, projects, tasks, etc.) is never
 * visible to user B after a same-tab login switch.
 */
export const rootReducer = (state: any, action: any) => {
  if (action.type === 'auth/logout') {
    return combinedReducer({ auth: state?.auth }, action)
  }
  return combinedReducer(state, action)
}
