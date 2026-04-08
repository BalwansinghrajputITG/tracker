import React, { useState, useEffect, Suspense, lazy } from 'react'
import { useSelector } from 'react-redux'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ErrorBoundary } from 'react-error-boundary'
import { RefreshCw } from 'lucide-react'
import { RootState } from '../store'
import { ANALYTICS_ROLES } from '../constants/roles'
import { Sidebar } from '../components/common/Sidebar'
import { NotificationBell } from '../components/common/NotificationBell'
import { CursorEffect } from '../components/common/CursorEffect'
import { PageErrorFallback } from '../components/common/ErrorFallback'

const Chatbot = lazy(() => import('../components/chatbot/Chatbot').then(m => ({ default: m.Chatbot })))

function PageSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

/**
 * Backwards-compatible navigate shim.
 * Existing code that imports { navigate } from './AppLayout' will still work.
 * New code should use react-router's useNavigate() hook instead.
 */
export function navigate(to: string) {
  window.history.pushState({}, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

const PAGE_META: Record<string, { title: string; sub: string }> = {
  '/':          { title: 'Dashboard',  sub: 'Your command center'              },
  '/dashboard': { title: 'Dashboard',  sub: 'Your command center'              },
  '/projects':     { title: 'Projects',       sub: 'Manage & track all projects'           },
  '/projects/new': { title: 'New Project',    sub: 'Create a project and assign members'   },
  '/tasks':     { title: 'Tasks',      sub: 'View and update task statuses'    },
  '/reports':   { title: 'Reports',    sub: 'Daily work reports & compliance'  },
  '/users':     { title: 'Users',      sub: 'Workforce management'             },
  '/chat':      { title: 'Messages',   sub: 'Direct messages & conversations'  },
  '/sheets':             { title: 'Document Hub',        sub: 'Links to Docs, Sheets, Slides & PDFs'             },
  '/personal':           { title: 'My Workspace',       sub: 'Links, notes, targets, performance & documents'    },
  '/analytics':          { title: 'Analytics',          sub: 'Company-wide performance data'                     },
  '/digital-marketing':  { title: 'Digital Marketing',  sub: 'Marketing performance & campaign insights'         },
  '/basecamp':  { title: 'Basecamp',    sub: 'Projects, todos, messages & more' },
  '/settings':  { title: 'Settings',   sub: 'Account & preferences'            },
}

function resolvePageMeta(pathname: string) {
  if (PAGE_META[pathname]) return PAGE_META[pathname]
  if (pathname.startsWith('/projects/')) return { title: 'Project Detail', sub: 'Full project overview & analytics' }
  if (pathname.startsWith('/users/'))    return { title: 'User Profile', sub: 'Full user overview' }
  return { title: 'Dashboard', sub: '' }
}

export const AppLayout: React.FC = () => {
  const { user } = useSelector((s: RootState) => s.auth)
  const themeMode = useSelector((s: RootState) => s.theme?.mode || 'light')
  const location = useLocation()
  const nav = useNavigate()
  const currentPath = location.pathname
  const role = user?.primary_role || 'employee'
  const pageMeta = resolvePageMeta(currentPath)
  const [contentKey, setContentKey] = useState(0)

  useEffect(() => {
    const html = document.documentElement
    const applyTheme = (mode: string) => {
      html.classList.remove('dark')
      if (mode === 'dark') html.classList.add('dark')
    }

    if (themeMode === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      applyTheme(mq.matches ? 'dark' : 'light')
      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches ? 'dark' : 'light')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    } else {
      applyTheme(themeMode)
    }
  }, [themeMode])

  const refresh = () => setContentKey(k => k + 1)

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
              onClick={() => nav('/settings')}
            >
              {user?.full_name?.[0]?.toUpperCase()}
            </div>
          </div>
        </header>

        {/* Main Content — React Router renders matched route here */}
        <main
          className={`flex-1 min-h-0 ${currentPath === '/chat' ? 'overflow-hidden p-4' : 'overflow-y-auto p-6'}`}
          key={`${currentPath}-${contentKey}`}
        >
          <div className={currentPath === '/chat'
            ? 'h-full max-w-[1400px] mx-auto'
            : 'animate-fade-in-up max-w-[1400px] mx-auto'
          }>
            <ErrorBoundary
              FallbackComponent={PageErrorFallback}
              resetKeys={[currentPath]}
            >
              <Suspense fallback={<PageSpinner />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {ANALYTICS_ROLES.includes(role as any) && (
        <Suspense fallback={null}>
          <Chatbot />
        </Suspense>
      )}
      <CursorEffect />
    </div>
  )
}
