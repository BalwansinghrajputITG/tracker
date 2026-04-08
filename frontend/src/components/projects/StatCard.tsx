import React from 'react'

// ─── Stat Card ────────────────────────────────────────────────────────────────

export const StatCard: React.FC<{
  label: string; value: string | number; icon: React.ReactNode
  iconBg: string; sub?: string
}> = ({ label, value, icon, iconBg, sub }) => (
  <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-4">
    <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center shrink-0`}>{icon}</div>
    <div>
      <p className="text-xl font-bold text-gray-900 leading-tight">{value}</p>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
    </div>
  </div>
)
