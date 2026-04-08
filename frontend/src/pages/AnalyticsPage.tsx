import React, { useState } from 'react'
import { useSelector } from 'react-redux'
import { Lock, BarChart3, FolderOpen, Users } from 'lucide-react'
import { RootState } from '../store'
import { ANALYTICS_ROLES } from '../constants/roles'
import type { Tab } from '../components/analytics/analyticsTypes'
import { OverviewTab } from '../components/analytics/OverviewTab'
import { ProjectsTab } from '../components/analytics/ProjectsTab'
import { EmployeesTab } from '../components/analytics/EmployeesTab'

export const AnalyticsPage: React.FC = () => {
  const { user } = useSelector((s: RootState) => s.auth)
  const [tab, setTab] = useState<Tab>('overview')
  const [range, setRange] = useState(30)
  const isManager = ANALYTICS_ROLES.includes(user?.primary_role as any)

  if (!isManager) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 animate-fade-in">
        <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
          <Lock size={24} className="text-gray-300" />
        </div>
        <p className="text-base font-semibold text-gray-600">Access Restricted</p>
        <p className="text-sm mt-1">Analytics are available to managers only</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-500 text-sm mt-0.5">Deep insights across your organisation</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-xl p-1">
            {[7, 30, 90].map(d => (
              <button key={d} onClick={() => setRange(d)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${range === d ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {d}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
        {([
          { id: 'overview',  label: 'Overview',  icon: <BarChart3 size={14} /> },
          { id: 'projects',  label: 'Projects',  icon: <FolderOpen size={14} /> },
          { id: 'employees', label: 'Employees', icon: <Users size={14} /> },
        ] as { id: Tab; label: string; icon: React.ReactNode }[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'overview'  && <OverviewTab range={range} />}
      {tab === 'projects'  && <ProjectsTab range={range} />}
      {tab === 'employees' && <EmployeesTab range={range} />}
    </div>
  )
}
