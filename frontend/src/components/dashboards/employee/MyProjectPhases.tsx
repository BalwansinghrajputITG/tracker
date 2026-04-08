import React from 'react'
import { ListChecks, AlertTriangle, ChevronDown, Loader2, Check } from 'lucide-react'

interface MyProjectPhasesProps {
  projects: any[]
  expandedProjectId: string | null
  projectPhaseCache: Record<string, any>
  phaseLoadingId: string | null
  stageToggling: string | null
  phaseError: string
  onToggleProject: (id: string) => void
  onToggleStage: (projectId: string, phase: string, stageId: string, current: boolean) => void
}

export const MyProjectPhases: React.FC<MyProjectPhasesProps> = ({
  projects,
  expandedProjectId,
  projectPhaseCache,
  phaseLoadingId,
  stageToggling,
  phaseError,
  onToggleProject,
  onToggleStage,
}) => {
  if (projects.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 bg-indigo-50 rounded-lg flex items-center justify-center">
          <ListChecks size={13} className="text-indigo-600" />
        </div>
        <h4 className="text-sm font-semibold text-gray-800">My Project Phases</h4>
      </div>

      {phaseError && (
        <p className="text-xs text-red-500 mb-2 flex items-center gap-1">
          <AlertTriangle size={11} /> {phaseError}
        </p>
      )}

      <div className="space-y-1.5">
        {projects.map((proj: any) => {
          const isOpen = expandedProjectId === proj.id
          const cached = projectPhaseCache[proj.id]
          const currentPhase = proj.status || 'planning'
          const stages: any[] = cached?.phase_stages?.[currentPhase] || []
          const doneCnt = stages.filter((s: any) => s.completed).length
          const isLoading = phaseLoadingId === proj.id

          return (
            <div key={proj.id} className="rounded-xl border border-gray-100 overflow-hidden">
              {/* Project row */}
              <button
                onClick={() => onToggleProject(proj.id)}
                className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
              >
                <span className="flex-1 text-xs font-semibold text-gray-700 truncate">{proj.name}</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md capitalize shrink-0 ${
                  currentPhase === 'active'    ? 'bg-emerald-50 text-emerald-600' :
                  currentPhase === 'planning'  ? 'bg-blue-50 text-blue-600' :
                  currentPhase === 'completed' ? 'bg-gray-100 text-gray-500' :
                  'bg-amber-50 text-amber-600'
                }`}>
                  {currentPhase.replace('_', ' ')}
                </span>
                {isLoading
                  ? <Loader2 size={12} className="text-gray-400 animate-spin shrink-0" />
                  : <ChevronDown size={12} className={`text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                }
              </button>

              {/* Stages */}
              {isOpen && cached && (
                <div className="border-t border-gray-100 px-3 py-2 space-y-1.5 bg-gray-50/50">
                  {stages.length === 0 ? (
                    <p className="text-xs text-gray-400 py-1 text-center">No stages for this phase yet</p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-gray-400 font-medium">{doneCnt}/{stages.length} done</span>
                        <div className="flex-1 mx-2 h-1 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                            style={{ width: `${stages.length > 0 ? Math.round((doneCnt / stages.length) * 100) : 0}%` }}
                          />
                        </div>
                      </div>
                      {stages.map((stage: any) => (
                        <button
                          key={stage.id}
                          onClick={() => onToggleStage(proj.id, currentPhase, stage.id, stage.completed)}
                          disabled={!!stageToggling}
                          className="w-full flex items-center gap-2 text-left hover:bg-white rounded-lg px-1.5 py-1 transition-colors group disabled:opacity-60"
                        >
                          <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                            stage.completed
                              ? 'bg-indigo-500 border-indigo-500'
                              : 'border-gray-300 group-hover:border-indigo-400'
                          }`}>
                            {stageToggling === stage.id
                              ? <Loader2 size={9} className="animate-spin text-white" />
                              : stage.completed
                              ? <Check size={9} className="text-white" />
                              : null}
                          </span>
                          <span className={`text-xs flex-1 truncate ${stage.completed ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                            {stage.name}
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                  <button
                    onClick={() => {
                      window.history.pushState({}, '', `/projects/${proj.id}`)
                      window.dispatchEvent(new PopStateEvent('popstate'))
                    }}
                    className="w-full text-center text-[10px] text-indigo-500 hover:text-indigo-700 font-medium pt-1"
                  >
                    View all phases →
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
