import React from 'react'
import { Mail, Building2, Pencil, ChevronRight } from 'lucide-react'
import { User } from '../../store/slices/usersSlice'
import {
  ROLE_BADGE_CLASSES as ROLE_COLORS,
  ROLE_AVATAR_GRADIENT as AVATAR_COLORS,
} from '../../constants/roles'

interface UserCardProps {
  user: User
  index: number
  onClick: () => void
  canManage?: boolean
  onEdit?: () => void
}

export const UserCard: React.FC<UserCardProps> = ({ user, index, onClick, canManage, onEdit }) => {
  const role = user.primary_role || 'employee'
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-100 transition-all duration-200 animate-fade-in-up cursor-pointer group"
      style={{ animationDelay: `${index * 0.03}s` }}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${AVATAR_COLORS[role as keyof typeof AVATAR_COLORS] || AVATAR_COLORS.employee} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm`}>
          {user.full_name?.[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-800 truncate">{user.full_name}</p>
            <span className={`text-xs px-2 py-0.5 rounded-lg font-medium border ${ROLE_COLORS[role as keyof typeof ROLE_COLORS] || ROLE_COLORS.employee}`}>
              {role.replace('_', ' ')}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 truncate">
            <Mail size={10} className="shrink-0" />
            {user.email}
          </p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Building2 size={10} />
              {user.department || '—'}
            </span>
            {user.is_active !== false ? (
              <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                Active
              </span>
            ) : (
              <span className="text-xs text-gray-400 font-medium">Inactive</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 mt-1">
          {canManage && onEdit && (
            <button
              onClick={e => { e.stopPropagation(); onEdit() }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title="Edit user"
            >
              <Pencil size={13} />
            </button>
          )}
          <ChevronRight size={14} className="text-gray-300 group-hover:text-blue-400 transition-colors" />
        </div>
      </div>
    </div>
  )
}
