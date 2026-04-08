import React from 'react'
import { navigate } from '../../pages/AppLayout'
import { Users, Calendar, AlertTriangle } from 'lucide-react'
import { STATUS_COLORS, PRIORITY_COLORS } from './projectsConstants'

interface ProjectCardProps {
  project: any
  index: number
  progressColor: (pct: number) => string
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project, index, progressColor }) => {
  return (
    <div
      onClick={() => navigate('/projects/' + project.id)}
      className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 card-hover cursor-pointer animate-fade-in-up"
      style={{ animationDelay: `${index * 0.04}s` }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-800 truncate">{project.name}</h3>
          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{project.description}</p>
        </div>
        <div className="flex flex-col gap-1 ml-2 shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${STATUS_COLORS[project.status] || 'bg-gray-100 text-gray-600'}`}>
            {project.status.replace('_', ' ')}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${PRIORITY_COLORS[project.priority] || 'bg-gray-100'}`}>
            {project.priority}
          </span>
        </div>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
          <span>Progress</span>
          <span className="font-semibold">{project.progress_percentage}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${progressColor(project.progress_percentage)}`}
            style={{ width: `${project.progress_percentage}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-400">
        <div className="flex items-center gap-1">
          <Users size={12} />
          <span>{project.member_ids?.length || 0}</span>
        </div>
        {project.due_date && (
          <div className={`flex items-center gap-1 ${project.is_delayed ? 'text-red-500 font-medium' : ''}`}>
            {project.is_delayed && <AlertTriangle size={11} />}
            <Calendar size={11} />
            <span>{new Date(project.due_date).toLocaleDateString()}</span>
          </div>
        )}
      </div>
    </div>
  )
}
