import React from 'react'
import { Users, Loader2 } from 'lucide-react'
import { getGradient } from '../projectsConstants'

interface MembersTabProps {
  detailProject: any
  detailLoading: boolean
}

export const MembersTab: React.FC<MembersTabProps> = ({ detailProject, detailLoading }) => {
  return (
    <div className="space-y-3">
      {detailLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-blue-500" /></div>
      ) : !detailProject?.members?.length ? (
        <div className="text-center py-12 text-gray-400">
          <Users size={28} className="mx-auto mb-2 text-gray-200" />
          <p className="text-sm">No members added yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {detailProject.members.map((m: any) => (
            <div key={m.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getGradient(m.name)} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                {m.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{m.name}</p>
                <p className="text-xs text-gray-400 capitalize truncate">{m.role?.replace('_', ' ')}{m.department ? ` · ${m.department}` : ''}</p>
                {m.email && <p className="text-xs text-blue-400 truncate">{m.email}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
