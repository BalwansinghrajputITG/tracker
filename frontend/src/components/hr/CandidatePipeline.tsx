import React, { useState } from 'react'
import { useDispatch } from 'react-redux'
import { GripVertical, Clock, Briefcase } from 'lucide-react'
import { Application, moveStageRequest } from '../../store/slices/hrRecruitmentSlice'
import { EmptyState } from '../shared'

/**
 * Candidate pipeline board (docs/hr.md §6).
 *
 * Drag-and-drop uses the native HTML5 API rather than a library: the board has
 * one interaction, and adding react-dnd or dnd-kit for it would be ~40 KB to
 * replace ~30 lines. The trade-off is no touch support, so every card also has
 * a stage dropdown — which is the accessible path regardless.
 */

const STAGE_LABELS: Record<string, string> = {
  applied: 'Applied',
  screening: 'Screening',
  shortlisted: 'Shortlisted',
  interview: 'Interview',
  technical_interview: 'Technical',
  hr_interview: 'HR Round',
  selected: 'Selected',
  offer: 'Offer',
  hired: 'Hired',
}

// Stage tint. Deliberately from the light-mode vocabulary that index.css
// remaps under html.dark — a colour outside that set would not adapt.
const STAGE_ACCENT: Record<string, string> = {
  applied: 'bg-gray-100 text-gray-600',
  screening: 'bg-blue-50 text-blue-700',
  shortlisted: 'bg-indigo-50 text-indigo-700',
  interview: 'bg-violet-50 text-violet-700',
  technical_interview: 'bg-purple-50 text-purple-700',
  hr_interview: 'bg-cyan-50 text-cyan-700',
  selected: 'bg-teal-50 text-teal-700',
  offer: 'bg-amber-50 text-amber-700',
  hired: 'bg-emerald-50 text-emerald-700',
}

interface Props {
  applications: Application[]
  stages: string[]
  byStage: Record<string, number>
  loading?: boolean
  canMove: boolean
  onSelect?: (application: Application) => void
}

export const CandidatePipeline: React.FC<Props> = ({
  applications, stages, byStage, loading, canMove, onSelect,
}) => {
  const dispatch = useDispatch()
  const [dragging, setDragging] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2 animate-pulse">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="w-64 shrink-0 space-y-2">
            <div className="h-8 skeleton rounded-xl" />
            <div className="h-24 skeleton rounded-xl" />
            <div className="h-24 skeleton rounded-xl" />
          </div>
        ))}
      </div>
    )
  }

  if (!applications.length) {
    return (
      <EmptyState
        variant="default"
        title="No candidates in the pipeline"
        description="Add a candidate and apply them to an opening to get started."
        size="compact"
      />
    )
  }

  // 'hired' is reachable only by accepting an offer, so it is shown but never a
  // valid drop target — mirroring the server rule rather than duplicating it.
  const visibleStages = stages.filter(s => s !== 'hired' || byStage[s] > 0)

  const drop = (stage: string) => {
    if (!dragging || !canMove) return
    const app = applications.find(a => a.id === dragging)
    setDragging(null)
    setOverStage(null)
    if (!app || app.stage === stage) return
    dispatch(moveStageRequest({ id: app.id, stage, note: 'Moved on the pipeline board' }))
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {visibleStages.map(stage => {
        const cards = applications.filter(a => a.stage === stage)
        const isTarget = overStage === stage && stage !== 'hired'
        return (
          <div
            key={stage}
            onDragOver={e => { if (canMove && stage !== 'hired') { e.preventDefault(); setOverStage(stage) } }}
            onDragLeave={() => setOverStage(null)}
            onDrop={() => stage !== 'hired' && drop(stage)}
            className={`w-64 shrink-0 rounded-2xl p-2 transition-colors ${
              isTarget ? 'bg-blue-50 ring-2 ring-blue-200' : 'bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-between px-2 py-2">
              <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${STAGE_ACCENT[stage] || 'bg-gray-100 text-gray-600'}`}>
                {STAGE_LABELS[stage] || stage}
              </span>
              <span className="text-xs text-gray-400">{cards.length}</span>
            </div>

            <div className="space-y-2 min-h-[60px]">
              {cards.map(app => (
                <div
                  key={app.id}
                  draggable={canMove && app.stage !== 'hired'}
                  onDragStart={() => setDragging(app.id)}
                  onDragEnd={() => { setDragging(null); setOverStage(null) }}
                  onClick={() => onSelect?.(app)}
                  className={`bg-white rounded-xl border border-gray-100 p-3 shadow-sm hover:shadow-md hover:border-blue-100 transition-all cursor-pointer group ${
                    dragging === app.id ? 'opacity-40' : ''
                  }`}
                >
                  <div className="flex items-start gap-1.5">
                    {canMove && app.stage !== 'hired' && (
                      <GripVertical size={13} className="text-gray-300 mt-0.5 shrink-0 group-hover:text-gray-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{app.candidate_name}</p>
                      <p className="text-xs text-gray-500 truncate">{app.current_title || '—'}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
                        <span className="flex items-center gap-1 truncate">
                          <Briefcase size={10} className="shrink-0" />
                          <span className="truncate">{app.job_title}</span>
                        </span>
                        <span className="flex items-center gap-1 shrink-0">
                          <Clock size={10} />{app.days_in_pipeline}d
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* The accessible path — and the only one on touch devices. */}
                  {canMove && app.stage !== 'hired' && (
                    <select
                      value={app.stage}
                      onClick={e => e.stopPropagation()}
                      onChange={e => dispatch(moveStageRequest({ id: app.id, stage: e.target.value }))}
                      className="mt-2 w-full text-[11px] border border-gray-200 rounded-lg px-1.5 py-1 bg-gray-50 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    >
                      {stages.filter(s => s !== 'hired').map(s => (
                        <option key={s} value={s}>{STAGE_LABELS[s] || s}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
