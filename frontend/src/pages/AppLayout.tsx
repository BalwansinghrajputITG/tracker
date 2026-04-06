import React, { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { Search, RefreshCw } from 'lucide-react'
import { RootState } from '../store'
import { Sidebar } from '../components/common/Sidebar'
import { NotificationBell } from '../components/common/NotificationBell'
import { Chatbot } from '../components/chatbot/Chatbot'
import { CursorEffect } from '../components/common/CursorEffect'
import { CEODashboard } from '../components/dashboards/CEODashboard'
import { EmployeeDashboard } from '../components/dashboards/EmployeeDashboard'
import { TeamLeadDashboard } from '../components/dashboards/TeamLeadDashboard'
import { ChatPanel } from '../components/chat/ChatPanel'
import { ProjectsPage } from './ProjectsPage'
import { TasksPage } from './TasksPage'
import { ReportsPage } from './ReportsPage'
import { AnalyticsPage } from './AnalyticsPage'
import { DigitalMarketingPage } from './DigitalMarketingPage'
import { SettingsPage } from './SettingsPage'
import { UsersPage } from './UsersPage'
import { ProjectDetailPage } from './ProjectDetailPage'
import { UserProfilePage } from './UserProfilePage'
import { CreateProjectPage } from './CreateProjectPage'
import SheetsPage from './SheetsPage'
import PersonalPage from './PersonalPage'

function useCurrentPath() {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return path
}

export function navigate(to: string) {
  window.history.pushState({}, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

const ROLE_DASHBOARDS: Record<string, React.ReactNode> = {
  ceo:       <CEODashboard />,
  coo:       <CEODashboard />,
  admin:     <CEODashboard />,
  pm:        <EmployeeDashboard />,
  team_lead: <TeamLeadDashboard />,
  employee:  <EmployeeDashboard />,
}

const PAGE_META: Record<string, { title: string; sub: string }> = {
  '/':          { title: 'Dashboard',  sub: 'Your command center'              },
  '/dashboard': { title: 'Dashboard',  sub: 'Your command center'              },
  '/projects':     { title: 'Projects',       sub: 'Manage & track all projects'           },
  '/projects/new': { title: 'New Project',    sub: 'Create a project and assign members'   },
  '/projects/:id': { title: 'Project Detail', sub: 'Full project overview & analytics'     },
  '/tasks':     { title: 'Tasks',      sub: 'View and update task statuses'    },
  '/reports':   { title: 'Reports',    sub: 'Daily work reports & compliance'  },
  '/users':     { title: 'Users',      sub: 'Workforce management'             },
  '/chat':      { title: 'Messages',   sub: 'Direct messages & conversations'  },
  '/sheets':             { title: 'Document Hub',        sub: 'Links to Docs, Sheets, Slides & PDFs'             },
  '/personal':           { title: 'My Workspace',       sub: 'Links, notes, targets, performance & documents'    },
  '/analytics':          { title: 'Analytics',          sub: 'Company-wide performance data'                     },
  '/digital-marketing':  { title: 'Digital Marketing',  sub: 'Marketing performance & campaign insights'         },
  '/settings':  { title: 'Settings',   sub: 'Account & preferences'            },
}

export const AppLayout: React.FC = () => {
  const { user } = useSelector((s: RootState) => s.auth)
  const themeMode = useSelector((s: RootState) => s.theme?.mode || 'light')
  const currentPath = useCurrentPath()
  const role = user?.primary_role || 'employee'
  const isCreateProject = currentPath === '/projects/new'
  const isProjectDetail = currentPath.startsWith('/projects/') && currentPath !== '/projects' && currentPath !== '/projects/new'
  const isUserProfile   = currentPath.startsWith('/users/') && currentPath !== '/users'
  const pageMeta = PAGE_META[currentPath] || (isProjectDetail ? PAGE_META['/projects/:id'] : isUserProfile ? { title: 'User Profile', sub: 'Full user overview' } : { title: 'Dashboard', sub: '' })
  const [contentKey, setContentKey] = useState(0)

  // Apply theme class to <html>
  useEffect(() => {
    const html = document.documentElement
    html.classList.remove('dark', 'midnight')
    if (themeMode !== 'light') html.classList.add(themeMode)
  }, [themeMode])

  const refresh = () => setContentKey(k => k + 1)

  const renderContent = () => {
    if (currentPath === '/chat')      return <ChatPanel />
    if (isCreateProject) return <CreateProjectPage />
    if (isProjectDetail) {
      const projectId = currentPath.split('/')[2]
      return <ProjectDetailPage projectId={projectId} />
    }
    if (isUserProfile) {
      const userId = currentPath.split('/')[2]
      return <UserProfilePage userId={userId} />
    }
    if (currentPath === '/projects')  return <ProjectsPage />
    if (currentPath === '/tasks')     return role === 'employee' ? (ROLE_DASHBOARDS[role] || <EmployeeDashboard />) : <TasksPage />
    if (currentPath === '/reports')   return <ReportsPage />
    if (currentPath === '/teams')     return <UsersPage />
    if (currentPath === '/users')     return <UsersPage />
    if (currentPath === '/sheets')            return <SheetsPage />
    if (currentPath === '/personal')          return <PersonalPage />
    if (currentPath === '/analytics')         return <AnalyticsPage />
    if (currentPath === '/digital-marketing') return <DigitalMarketingPage />
    if (currentPath === '/settings')  return <SettingsPage />
    if (currentPath === '/' || currentPath === '/dashboard') {
      return ROLE_DASHBOARDS[role] || <EmployeeDashboard />
    }
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 animate-fade-in">
        <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
          <Search size={20} className="text-gray-300" />
        </div>
        <p className="text-sm font-medium">Page not found</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar currentPath={currentPath} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 bg-white border-b border-slate-100 px-6 flex items-center justify-between shrink-0 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-gray-900 leading-tight">{pageMeta.title}</h2>
              </div>
              <p className="text-xs text-gray-400 font-medium">{pageMeta.sub}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden md:block text-xs text-gray-400 font-medium mr-1">
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
            <button
              onClick={refresh}
              title="Refresh page"
              className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all duration-150"
            >
              <RefreshCw size={14} />
            </button>
            <NotificationBell />
            <div
              className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white text-sm font-bold cursor-pointer shadow-sm hover:shadow-md transition-shadow"
              title={user?.full_name}
              onClick={() => navigate('/settings')}
            >
              {user?.full_name?.[0]?.toUpperCase()}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main
          className={`flex-1 min-h-0 ${currentPath === '/chat' ? 'overflow-hidden p-4' : 'overflow-y-auto p-6'}`}
          key={`${currentPath}-${contentKey}`}
        >
          <div className={currentPath === '/chat'
            ? 'h-full max-w-[1400px] mx-auto'
            : 'animate-fade-in-up max-w-[1400px] mx-auto'
          }>
            {renderContent()}
          </div>
        </main>
      </div>

      {['ceo', 'coo', 'pm', 'team_lead'].includes(role) && <Chatbot />}
      <CursorEffect />
    </div>
  )
}
