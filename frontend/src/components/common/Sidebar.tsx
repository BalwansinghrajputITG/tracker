import React from 'react'
import { useSelector, useDispatch } from 'react-redux'
import {
  LayoutDashboard, FolderKanban, ListChecks, FileText,
  Users, UserPlus, MessageSquare, BarChart3, Settings, LogOut,
  Zap, ChevronRight, BookOpen, Link2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { RootState } from '../../store'
import { logout } from '../../store/slices/authSlice'
import {
  ROLE_LABELS, ROLE_AVATAR_GRADIENT, ROLE_BADGE_SIMPLE, NAV_ROLES,
} from '../../constants/roles'

interface NavItem {
  label: string
  icon: React.ReactNode
  href: string
  roles?: string[]
}

const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', icon: <LayoutDashboard size={16} />, href: '/' },
    ],
  },
  {
    title: 'Work',
    items: [
      { label: 'Projects', icon: <FolderKanban size={16} />,  href: '/projects',  roles: NAV_ROLES['/projects']  },
      { label: 'Tasks',    icon: <ListChecks size={16} />,    href: '/tasks',     roles: NAV_ROLES['/tasks']     },
      { label: 'Reports',  icon: <FileText size={16} />,      href: '/reports',   roles: NAV_ROLES['/reports']   },
      { label: 'Messages', icon: <MessageSquare size={16} />, href: '/chat',      roles: NAV_ROLES['/chat']      },
      { label: 'Basecamp', icon: <Link2 size={16} />,         href: '/basecamp',  roles: NAV_ROLES['/basecamp']  },
    ],
  },
  {
    title: 'Management',
    items: [
      { label: 'Control Center', icon: <UserPlus size={16} />,  href: '/users',     roles: NAV_ROLES['/users']     },
      { label: 'Analytics',      icon: <BarChart3 size={16} />, href: '/analytics', roles: NAV_ROLES['/analytics'] },
    ],
  },
  {
    title: 'Personal',
    items: [
      { label: 'My Workspace', icon: <BookOpen size={16} />, href: '/personal' },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Settings', icon: <Settings size={16} />, href: '/settings' },
    ],
  },
]

export const Sidebar: React.FC<{ currentPath: string }> = ({ currentPath }) => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { user } = useSelector((s: RootState) => s.auth)
  const unreadCount = useSelector((s: RootState) => (s as RootState).notifications?.chat_unread_count ?? 0)
  const userRoles = new Set(user?.roles || [])
  const role = user?.primary_role || 'employee'

  const isVisible = (item: NavItem) => !item.roles || item.roles.some(r => userRoles.has(r))

  return (
    <div className="w-60 bg-white border-r border-slate-100 h-screen flex flex-col shadow-sm animate-slide-in-left">

      {/* Logo */}
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-sm shadow-blue-200/60">
            <Zap size={17} className="text-white" />
          </div>
          <div>
            <p className="font-black text-gray-900 text-sm leading-tight tracking-tight">Enterprise PM</p>
            <p className="text-xs text-gray-400 font-medium">Management Platform</p>
          </div>
        </div>
      </div>

      {/* User Profile Card */}
      <div className="mx-3 mt-3 mb-1">
        <div
          className="rounded-2xl border border-slate-200/80 p-3 cursor-pointer hover:border-blue-200 hover:bg-blue-50/30 transition-all duration-150"
          onClick={() => navigate('/settings')}
        >
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${ROLE_AVATAR_GRADIENT[role as keyof typeof ROLE_AVATAR_GRADIENT] || ROLE_AVATAR_GRADIENT.employee} flex items-center justify-center text-white text-sm font-bold shadow-sm shrink-0`}>
              {user?.full_name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate leading-tight">{user?.full_name}</p>
              <span className={`text-xs px-1.5 py-0.5 rounded-md font-semibold ${ROLE_BADGE_SIMPLE[role as keyof typeof ROLE_BADGE_SIMPLE] || ROLE_BADGE_SIMPLE.employee}`}>
                {ROLE_LABELS[role as keyof typeof ROLE_LABELS] || role}
              </span>
            </div>
            <ChevronRight size={13} className="text-gray-300 shrink-0" />
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-1 overflow-y-auto space-y-1">
        {NAV_GROUPS.map(group => {
          const visible = group.items.filter(isVisible)
          if (visible.length === 0) return null
          return (
            <div key={group.title}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 py-2 mt-1">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {visible.map(item => {
                  const isActive = currentPath === item.href ||
                    (item.href !== '/' && currentPath.startsWith(item.href))
                  const notifBadge = item.href === '/chat' ? unreadCount : 0

                  return (
                    <button
                      key={item.href}
                      onClick={() => navigate(item.href)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group relative"
                      style={{
                        background: isActive ? 'linear-gradient(135deg, #eff6ff, #eef2ff)' : undefined,
                        color: isActive ? '#2563eb' : '#64748b',
                      }}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-600 rounded-r-full" />
                      )}
                      <span className={`transition-all duration-150 shrink-0 ${
                        isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600 group-hover:scale-110'
                      }`}>
                        {item.icon}
                      </span>
                      <span className={`flex-1 text-left ${isActive ? 'text-blue-700 font-semibold' : 'text-gray-600 group-hover:text-gray-800'}`}>
                        {item.label}
                      </span>
                      {notifBadge > 0 && (
                        <span className="w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center font-bold shrink-0">
                          {notifBadge > 9 ? '9+' : notifBadge}
                        </span>
                      )}
                      {isActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-slate-100">
        <div className="px-3 mb-2">
          <p className="text-xs text-gray-300 font-medium">v2.0 · Enterprise Edition</p>
        </div>
        <button
          onClick={() => dispatch(logout())}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all duration-150 group"
        >
          <LogOut size={15} className="group-hover:scale-110 transition-transform shrink-0" />
          <span className="font-medium">Sign Out</span>
        </button>
      </div>
    </div>
  )
}
