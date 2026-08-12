import React, { lazy, useEffect } from 'react'
import { Provider, useSelector, useDispatch } from 'react-redux'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary } from 'react-error-boundary'
import { store } from './store'
import { RootState } from './store'
import { permissionsRehydrated } from './store/slices/authSlice'
import { api } from './utils/api'
import { LoginPage } from './pages/LoginPage'
import { AppLayout } from './pages/AppLayout'
import { GlobalErrorFallback } from './components/common/ErrorFallback'
import { ToastProvider } from './components/shared'

// Lazy-loaded pages — each becomes a separate JS chunk
const CEODashboard       = lazy(() => import('./components/dashboards/CEODashboard').then(m => ({ default: m.CEODashboard })))
const EmployeeDashboard  = lazy(() => import('./components/dashboards/EmployeeDashboard').then(m => ({ default: m.EmployeeDashboard })))
const TeamLeadDashboard  = lazy(() => import('./components/dashboards/TeamLeadDashboard').then(m => ({ default: m.TeamLeadDashboard })))
const ChatPanel          = lazy(() => import('./components/chat/ChatPanel').then(m => ({ default: m.ChatPanel })))
const ProjectsPage       = lazy(() => import('./pages/ProjectsPage').then(m => ({ default: m.ProjectsPage })))
const TasksPage          = lazy(() => import('./pages/TasksPage').then(m => ({ default: m.TasksPage })))
const ReportsPage        = lazy(() => import('./pages/ReportsPage').then(m => ({ default: m.ReportsPage })))
const AnalyticsPage      = lazy(() => import('./pages/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })))
const DigitalMarketingPage = lazy(() => import('./pages/DigitalMarketingPage').then(m => ({ default: m.DigitalMarketingPage })))
const SettingsPage       = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })))
const UsersPage          = lazy(() => import('./pages/UsersPage').then(m => ({ default: m.UsersPage })))
const ProjectDetailPage  = lazy(() => import('./pages/ProjectDetailPage').then(m => ({ default: m.ProjectDetailPage })))
const UserProfilePage    = lazy(() => import('./pages/UserProfilePage').then(m => ({ default: m.UserProfilePage })))
const CreateProjectPage  = lazy(() => import('./pages/CreateProjectPage').then(m => ({ default: m.CreateProjectPage })))
const SheetsPage         = lazy(() => import('./pages/SheetsPage'))
const PersonalPage       = lazy(() => import('./pages/PersonalPage'))
const BasecampPage       = lazy(() => import('./pages/BasecampPage').then(m => ({ default: m.BasecampPage })))
const BasecampCallbackPage = lazy(() => import('./pages/BasecampCallbackPage').then(m => ({ default: m.BasecampCallbackPage })))
const HrOverviewPage     = lazy(() => import('./pages/hr/HrOverviewPage').then(m => ({ default: m.HrOverviewPage })))
const HrEmployeesPage    = lazy(() => import('./pages/hr/HrEmployeesPage').then(m => ({ default: m.HrEmployeesPage })))
const HrTimePage         = lazy(() => import('./pages/hr/HrTimePage').then(m => ({ default: m.HrTimePage })))
const HrRecruitmentPage  = lazy(() => import('./pages/hr/HrRecruitmentPage').then(m => ({ default: m.HrRecruitmentPage })))
const HrPerformancePage  = lazy(() => import('./pages/hr/HrPerformancePage').then(m => ({ default: m.HrPerformancePage })))
const HrHelpdeskPage     = lazy(() => import('./pages/hr/HrHelpdeskPage').then(m => ({ default: m.HrHelpdeskPage })))
const HrEmployeeDetailPage = lazy(() => import('./pages/hr/HrEmployeeDetailPage').then(m => ({ default: m.HrEmployeeDetailPage })))


function RoleDashboard() {
  const { user } = useSelector((s: RootState) => s.auth)
  const role = user?.primary_role || 'employee'
  if (role === 'ceo' || role === 'coo' || role === 'admin') return <CEODashboard />
  if (role === 'team_lead') return <TeamLeadDashboard />
  return <EmployeeDashboard />
}

function RoleTasksPage() {
  const { user } = useSelector((s: RootState) => s.auth)
  const role = user?.primary_role || 'employee'
  if (role === 'employee') return <EmployeeDashboard />
  return <TasksPage />
}

function ProjectDetailWrapper() {
  // useParams is used inside ProjectDetailPage itself — pass via URL
  const id = window.location.pathname.split('/')[2]
  return <ProjectDetailPage projectId={id} />
}

function UserProfileWrapper() {
  const id = window.location.pathname.split('/')[2]
  return <UserProfilePage userId={id} />
}

const AppRoutes: React.FC = () => {
  const dispatch = useDispatch()
  const { user, token } = useSelector((s: RootState) => s.auth)
  const isLoggedIn = Boolean(user && token)

  // Sessions created before permissions were issued at login carry no permission
  // set in localStorage, which would make every can() check fail silently. Fetch
  // it once on boot for those; new logins already have it and skip this.
  useEffect(() => {
    if (!isLoggedIn || user?.permissions) return
    api.get('/users/me')
      .then(res => dispatch(permissionsRehydrated(res.data.permissions || [])))
      .catch(() => { /* 401 is already handled by the api interceptor */ })
  }, [isLoggedIn, user?.permissions, dispatch])

  if (!isLoggedIn) return <LoginPage />

  return (
    <Routes>
      {/* OAuth callback — outside AppLayout so no sidebar */}
      <Route path="callback" element={<BasecampCallbackPage />} />

      <Route element={<AppLayout />}>
        <Route index element={<RoleDashboard />} />
        <Route path="dashboard" element={<RoleDashboard />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/new" element={<CreateProjectPage />} />
        <Route path="projects/:id" element={<ProjectDetailWrapper />} />
        <Route path="tasks" element={<RoleTasksPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="users/:id" element={<UserProfileWrapper />} />
        <Route path="teams" element={<UsersPage />} />
        <Route path="chat" element={<ChatPanel />} />
        <Route path="sheets" element={<SheetsPage />} />
        <Route path="personal" element={<PersonalPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="digital-marketing" element={<DigitalMarketingPage />} />
        <Route path="basecamp" element={<BasecampPage />} />
        {/* HR Controller (docs/hr.md) */}
        <Route path="hr" element={<HrOverviewPage />} />
        <Route path="hr/employees" element={<HrEmployeesPage />} />
        <Route path="hr/employees/:id" element={<HrEmployeeDetailPage />} />
        <Route path="hr/time" element={<HrTimePage />} />
        <Route path="hr/recruitment" element={<HrRecruitmentPage />} />
        <Route path="hr/performance" element={<HrPerformancePage />} />
        <Route path="hr/helpdesk" element={<HrHelpdeskPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

const App: React.FC = () => (
  <Provider store={store}>
    <ErrorBoundary FallbackComponent={GlobalErrorFallback}>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  </Provider>
)

export default App
