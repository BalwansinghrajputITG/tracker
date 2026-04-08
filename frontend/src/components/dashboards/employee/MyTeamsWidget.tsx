import React from 'react'
import { Users } from 'lucide-react'
import { teamGradient } from './employeeConstants'

interface MyTeamsWidgetProps {
  teams: any[]
  loading: boolean
}

export const MyTeamsWidget: React.FC<MyTeamsWidgetProps> = ({ teams, loading }) => {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-violet-50 rounded-lg flex items-center justify-center">
            <Users size={13} className="text-violet-600" />
          </div>
          <h4 className="text-sm font-semibold text-gray-800">My Teams</h4>
        </div>
        {teams.length > 0 && (
          <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg">{teams.length}</span>
        )}
      </div>

      {loading && teams.length === 0 ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-12 skeleton rounded-xl" />)}
        </div>
      ) : teams.length === 0 ? (
        <div className="py-6 flex flex-col items-center gap-2 text-center">
          <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
            <Users size={18} className="text-gray-300" />
          </div>
          <p className="text-xs text-gray-400 font-medium">Not part of any team yet</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-hide">
          {teams.map((team: any, i: number) => (
            <div
              key={team.id}
              className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors cursor-default animate-fade-in"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${teamGradient(team.name)} flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm`}>
                {team.name?.[0]?.toUpperCase() || 'T'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-800 truncate">{team.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {team.department && (
                    <span className="text-[10px] text-violet-600 font-semibold truncate">{team.department}</span>
                  )}
                  <span className="text-[10px] text-gray-400 flex items-center gap-0.5 shrink-0">
                    <Users size={8} />
                    {team.member_count ?? team.member_ids?.length ?? 0}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
