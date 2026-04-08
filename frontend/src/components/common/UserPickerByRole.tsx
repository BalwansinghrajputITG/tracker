import React, { useMemo, useState } from 'react'
import { Search, UserCheck, X, ChevronDown, ChevronRight } from 'lucide-react'
import { ROLE_ORDER, ROLE_LABELS, ROLE_AVATAR_GRADIENT, Role } from '../../constants/roles'

export interface PickerUser {
  id: string
  full_name: string
  primary_role?: string
  department?: string
}

interface Props {
  users: PickerUser[]
  selected: string[]
  onChange: (ids: string[]) => void
  label?: string
  maxHeight?: string
}

// Picker uses the same colour palette as the global role constants
const ROLE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  ceo:       { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-400' },
  coo:       { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-400' },
  admin:     { bg: 'bg-rose-50',   text: 'text-rose-700',   dot: 'bg-rose-400'   },
  pm:        { bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-400'   },
  team_lead: { bg: 'bg-teal-50',   text: 'text-teal-700',   dot: 'bg-teal-400'   },
  employee:  { bg: 'bg-gray-50',   text: 'text-gray-600',   dot: 'bg-gray-400'   },
}

const getGradient = (role: string) =>
  ROLE_AVATAR_GRADIENT[role as keyof typeof ROLE_AVATAR_GRADIENT] || ROLE_AVATAR_GRADIENT.employee

export const UserPickerByRole: React.FC<Props> = ({
  users,
  selected,
  onChange,
  label = 'Members',
  maxHeight = 'max-h-56',
}) => {
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])

  const toggleCategory = (role: string) =>
    setCollapsed(c => ({ ...c, [role]: !c[role] }))

  const selectAll = (ids: string[]) => {
    const merged = selected.concat(ids.filter(id => !selected.includes(id)))
    onChange(merged)
  }

  const clearAll = (ids: string[]) =>
    onChange(selected.filter(id => !ids.includes(id)))

  const q = search.toLowerCase()
  const filtered = q
    ? users.filter(u =>
        u.full_name.toLowerCase().includes(q) ||
        (u.department || '').toLowerCase().includes(q) ||
        (u.primary_role || '').toLowerCase().includes(q)
      )
    : users

  // Group by primary_role
  const groups = useMemo(() => {
    const map: Record<string, PickerUser[]> = {}
    for (const u of filtered) {
      const role = u.primary_role || 'employee'
      if (!map[role]) map[role] = []
      map[role].push(u)
    }
    // Sort groups by defined order, unknown roles go last
    return ROLE_ORDER
      .filter(r => map[r]?.length)
      .map(r => ({ role: r, users: map[r] }))
      .concat(
        (Object.keys(map) as Role[])
          .filter(r => !ROLE_ORDER.includes(r))
          .map(r => ({ role: r, users: map[r] }))
      )
  }, [filtered])

  const selectedUsers = users.filter(u => selected.includes(u.id))

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        {selected.length > 0 && (
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
            {selected.length} selected
          </span>
        )}
      </div>

      {/* Selected chips */}
      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2 p-2 bg-blue-50 rounded-xl border border-blue-100">
          {selectedUsers.map(u => (
            <span
              key={u.id}
              className="flex items-center gap-1.5 bg-white border border-blue-200 text-blue-700 text-xs px-2 py-0.5 rounded-lg font-medium shadow-sm"
            >
              <span className={`w-4 h-4 bg-gradient-to-br ${getGradient(u.primary_role || 'employee')} rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0`}>
                {u.full_name[0]}
              </span>
              {u.full_name.split(' ')[0]}
              <button type="button" onClick={() => toggle(u.id)} className="text-blue-300 hover:text-red-500 ml-0.5">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-1.5">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, role, department…"
          className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all"
        />
      </div>

      {/* Grouped list */}
      <div className={`${maxHeight} overflow-y-auto border border-gray-200 rounded-xl bg-white`}>
        {groups.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-5">No users found</p>
        ) : (
          groups.map(({ role, users: groupUsers }) => {
            const colors = ROLE_COLORS[role] || { bg: 'bg-gray-50', text: 'text-gray-600', dot: 'bg-gray-400' }
            const isCollapsed = collapsed[role]
            const groupIds = groupUsers.map(u => u.id)
            const allChecked = groupIds.every(id => selected.includes(id))
            const someChecked = groupIds.some(id => selected.includes(id))

            return (
              <div key={role}>
                {/* Category header */}
                <div className={`flex items-center gap-2 px-3 py-2 ${colors.bg} border-b border-gray-100 sticky top-0`}>
                  <button
                    type="button"
                    onClick={() => toggleCategory(role)}
                    className="flex items-center gap-2 flex-1 min-w-0"
                  >
                    {isCollapsed
                      ? <ChevronRight size={11} className={colors.text} />
                      : <ChevronDown size={11} className={colors.text} />
                    }
                    <span className={`w-2 h-2 rounded-full ${colors.dot} shrink-0`} />
                    <span className={`text-xs font-semibold ${colors.text} truncate`}>
                      {ROLE_LABELS[role] || role.replace('_', ' ')}
                    </span>
                    <span className={`ml-1 text-[10px] ${colors.text} opacity-70`}>
                      ({groupUsers.length})
                    </span>
                  </button>

                  {/* Select / clear all in category */}
                  <button
                    type="button"
                    onClick={() => allChecked ? clearAll(groupIds) : selectAll(groupIds)}
                    className={`text-[10px] font-medium shrink-0 ${colors.text} hover:underline`}
                  >
                    {allChecked ? 'Deselect all' : someChecked ? 'Select rest' : 'Select all'}
                  </button>
                </div>

                {/* Users in this category */}
                {!isCollapsed && groupUsers.map(u => {
                  const checked = selected.includes(u.id)
                  return (
                    <label
                      key={u.id}
                      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b border-gray-50 transition-colors ${
                        checked ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(u.id)}
                        className="rounded accent-blue-600 shrink-0"
                      />
                      <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0 bg-gradient-to-br ${
                        checked ? getGradient(u.primary_role || 'employee') : 'from-gray-300 to-gray-400'
                      }`}>
                        {u.full_name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{u.full_name}</p>
                        <p className="text-xs text-gray-400 capitalize truncate">
                          {u.department || '—'}
                        </p>
                      </div>
                      {checked && <UserCheck size={13} className="text-blue-500 shrink-0" />}
                    </label>
                  )
                })}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
