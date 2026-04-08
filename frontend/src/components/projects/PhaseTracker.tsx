import React, { useEffect, useState } from 'react'
import {
  AlertTriangle, Loader2, CheckCircle2, Pencil, Trash2, Plus,
  Save, Activity, ListChecks, CheckCheck, RotateCcw, X,
} from 'lucide-react'
import { api } from '../../utils/api'
import { useToast } from '../shared'
import { PHASE_META, PHASE_ORDER, STAGE_SUGGESTIONS, PhaseTrackerProps } from './projectTypes'

// ─── Phase Tracker ───────────────────────────────────────────────────────────

export const PhaseTracker: React.FC<PhaseTrackerProps> = ({ project, canManage, canToggleStage, projectId, onUpdate }) => {
  const toast = useToast()
  const [selectedPhase, setSelectedPhase] = useState<string>(project.status || 'planning')
  const [toggling, setToggling]           = useState<string | null>(null)
  const [deletingId, setDeletingId]       = useState<string | null>(null)
  const [addingStage, setAddingStage]     = useState(false)
  const [newName, setNewName]             = useState('')
  const [newDesc, setNewDesc]             = useState('')
  const [newDueDate, setNewDueDate]       = useState('')
  const [addLoading, setAddLoading]       = useState(false)
  const [actionError, setActionError]     = useState('')
  const [bulkLoading, setBulkLoading]     = useState(false)
  // Inline edit state
  const [editingStageId, setEditingStageId] = useState<string | null>(null)
  const [editName, setEditName]           = useState('')
  const [editDesc, setEditDesc]           = useState('')
  const [editDue, setEditDue]             = useState('')
  const [editSaving, setEditSaving]       = useState(false)

  // Reset add-form when phase changes
  useEffect(() => {
    setAddingStage(false)
    setNewName('')
    setNewDesc('')
    setNewDueDate('')
    setEditingStageId(null)
    setActionError('')
  }, [selectedPhase])

  const phaseStages: Record<string, any[]> = project.phase_stages || {}
  const stages       = phaseStages[selectedPhase] || []
  const completedCount = stages.filter((s: any) => s.completed).length
  const totalCount     = stages.length
  const progressPct    = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
  const meta           = PHASE_META[selectedPhase]
  const suggestions    = (STAGE_SUGGESTIONS[selectedPhase] || []).filter(
    s => !stages.some((st: any) => st.name.toLowerCase() === s.toLowerCase())
  )

  // Overall project progress across all phases
  const allStages      = Object.values(phaseStages).flat()
  const allDone        = allStages.filter((s: any) => s.completed).length
  const allTotal       = allStages.length
  const overallPct     = allTotal > 0 ? Math.round((allDone / allTotal) * 100) : (project.progress_percentage || 0)

  const handleToggle = async (stageId: string, current: boolean) => {
    if (!canToggleStage || toggling) return
    setToggling(stageId)
    setActionError('')
    try {
      await api.patch(`/projects/${projectId}/stages`, { phase: selectedPhase, stage_id: stageId, completed: !current })
      toast.success(!current ? 'Stage completed' : 'Stage reopened')
      onUpdate()
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Failed to update stage'
      toast.error(msg)
      setActionError(msg)
    } finally {
      setToggling(null)
    }
  }

  const handleAddStage = async (nameOverride?: string) => {
    const name = (nameOverride ?? newName).trim()
    if (!name) return
    setAddLoading(true)
    setActionError('')
    try {
      await api.post(`/projects/${projectId}/stages`, { phase: selectedPhase, name, description: newDesc.trim(), due_date: newDueDate || null })
      setNewName('')
      setNewDesc('')
      setNewDueDate('')
      setAddingStage(false)
      toast.success('Stage added')
      onUpdate()
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Failed to add stage'
      toast.error(msg)
      setActionError(msg)
    } finally {
      setAddLoading(false)
    }
  }

  const handleDelete = async (stageId: string) => {
    if (deletingId) return
    setDeletingId(stageId)
    setActionError('')
    try {
      await api.delete(`/projects/${projectId}/stages/${stageId}?phase=${selectedPhase}`)
      toast.success('Stage deleted')
      onUpdate()
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Failed to delete stage'
      toast.error(msg)
      setActionError(msg)
    } finally {
      setDeletingId(null)
    }
  }

  const handleBulkToggle = async (completed: boolean) => {
    if (bulkLoading || stages.length === 0) return
    setBulkLoading(true)
    setActionError('')
    try {
      await api.patch(`/projects/${projectId}/stages/bulk`, { phase: selectedPhase, completed })
      toast.success(completed ? 'All stages completed' : 'All stages reset')
      onUpdate()
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Bulk action failed'
      toast.error(msg)
      setActionError(msg)
    } finally {
      setBulkLoading(false)
    }
  }

  const startEditStage = (stage: any) => {
    setEditingStageId(stage.id)
    setEditName(stage.name)
    setEditDesc(stage.description || '')
    setEditDue(stage.due_date ? stage.due_date.split('T')[0] : '')
  }

  const saveEditStage = async () => {
    if (!editingStageId || !editName.trim()) return
    setEditSaving(true)
    setActionError('')
    try {
      const originalDue = stages.find((s: any) => s.id === editingStageId)?.due_date
      await api.put(`/projects/${projectId}/stages`, {
        phase: selectedPhase,
        stage_id: editingStageId,
        name: editName.trim(),
        description: editDesc.trim(),
        ...(editDue ? { due_date: editDue } : originalDue ? { clear_due_date: true } : {}),
      })
      setEditingStageId(null)
      toast.success('Stage updated')
      onUpdate()
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Failed to save'
      toast.error(msg)
      setActionError(msg)
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Overall Progress Banner ── */}
      {allTotal > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4 flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5"><Activity size={12} className="text-indigo-500" /> Overall Project Progress</p>
              <span className="text-sm font-bold text-gray-800">{overallPct}%</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-700" style={{ width: `${overallPct}%` }} /></div>
            <p className="text-[10px] text-gray-400 mt-1">{allDone} of {allTotal} stages completed across all phases</p>
          </div>
        </div>
      )}

      {/* ── Phase Journey Stepper ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-5 flex items-center gap-2"><ListChecks size={14} className="text-indigo-500" /> Project Journey</h3>
        <div className="flex items-start">
          {PHASE_ORDER.map((phase, idx) => {
            const pm = PHASE_META[phase]; const ps = phaseStages[phase] || []; const done = ps.filter((s: any) => s.completed).length; const total = ps.length
            const isCurrent = project.status === phase; const isSelected = selectedPhase === phase
            return (
              <React.Fragment key={phase}>
                <button onClick={() => setSelectedPhase(phase)} className={`flex flex-col items-center gap-1.5 transition-all duration-150 min-w-0 flex-1 ${isSelected ? '' : 'opacity-50 hover:opacity-80'}`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold transition-all ${isCurrent ? `${pm.dot} ring-4 ${pm.ring} ring-offset-2 scale-110` : isSelected ? pm.dot : 'bg-gray-200'}`}>{idx + 1}</div>
                  <p className={`text-xs font-semibold text-center leading-tight ${isCurrent ? pm.textColor : isSelected ? 'text-gray-700' : 'text-gray-400'}`}>{pm.label}</p>
                  <p className="text-[10px] text-gray-400">{total > 0 ? `${done}/${total}` : canManage ? 'no stages' : '—'}</p>
                  {isCurrent && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${pm.badge}`}>Current</span>}
                </button>
                {idx < PHASE_ORDER.length - 1 && <div className="flex-1 h-px bg-gray-200 mt-4 mx-1 max-w-[40px]" />}
              </React.Fragment>
            )
          })}
        </div>
      </div>

      {/* ── Stage List ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${meta.badge}`}>{meta.label}{project.status === selectedPhase ? ' · Current' : ''}</span>
            {totalCount > 0 && <span className="text-xs text-gray-400">{completedCount}/{totalCount} stages done</span>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {totalCount > 0 && <span className="text-sm font-bold text-gray-700">{progressPct}%</span>}
            {canToggleStage && totalCount > 0 && !addingStage && (
              <>
                <button onClick={() => handleBulkToggle(true)} disabled={bulkLoading || completedCount === totalCount} title="Mark all complete" className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl hover:bg-emerald-100 disabled:opacity-40 transition-colors">{bulkLoading ? <Loader2 size={11} className="animate-spin" /> : <CheckCheck size={11} />} All done</button>
                <button onClick={() => handleBulkToggle(false)} disabled={bulkLoading || completedCount === 0} title="Reset all stages" className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 bg-gray-50 text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-100 disabled:opacity-40 transition-colors"><RotateCcw size={11} /> Reset</button>
              </>
            )}
            {canManage && !addingStage && <button onClick={() => setAddingStage(true)} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"><Plus size={12} /> Add Stage</button>}
          </div>
        </div>

        {/* Progress bar */}
        {totalCount > 0 && (
          <div className="h-1.5 bg-gray-100">
            <div className={`h-full ${meta.bar} transition-all duration-500`} style={{ width: `${progressPct}%` }} />
          </div>
        )}

        {/* Error */}
        {actionError && (
          <div className="flex items-center gap-2 bg-red-50 text-red-700 text-xs px-5 py-2.5 border-b border-red-100">
            <AlertTriangle size={11} className="shrink-0" /> {actionError}
          </div>
        )}

        {/* Add stage form */}
        {addingStage && (
          <div className="px-5 py-4 border-b border-blue-100 bg-blue-50/40 space-y-3">
            <p className="text-xs font-semibold text-gray-700">New Stage for <span className="capitalize">{meta.label}</span></p>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddStage(); if (e.key === 'Escape') setAddingStage(false) }} placeholder="Stage name..." className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 font-medium shrink-0">Due Date</label>
              <input type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
              {newDueDate && <button type="button" onClick={() => setNewDueDate('')} className="text-gray-300 hover:text-red-400"><X size={13} /></button>}
            </div>
            {suggestions.length > 0 && (
              <div>
                <p className="text-[10px] text-gray-400 mb-1.5 font-medium">Quick add:</p>
                <div className="flex flex-wrap gap-1.5">{suggestions.map(s => <button key={s} onClick={() => handleAddStage(s)} disabled={addLoading} className="text-xs px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">+ {s}</button>)}</div>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setAddingStage(false); setNewName(''); setNewDesc('') }} className="px-4 py-1.5 text-sm text-gray-500 font-medium border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleAddStage()} disabled={!newName.trim() || addLoading} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50">{addLoading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}{addLoading ? 'Adding…' : 'Add Stage'}</button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {stages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-gray-300 gap-2">
            <ListChecks size={36} />
            <p className="text-sm text-gray-400 font-medium">No stages added yet</p>
            {canManage
              ? <p className="text-xs text-gray-400">Click <strong>Add Stage</strong> to define the steps for the <span className="capitalize">{meta.label}</span> phase.</p>
              : <p className="text-xs text-gray-400">The project manager hasn't added stages for this phase yet.</p>}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {stages.map((stage: any, i: number) => (
              <div key={stage.id} className={`flex items-start gap-4 px-5 py-4 group transition-colors ${stage.completed ? 'bg-gray-50/50' : 'hover:bg-gray-50/30'}`}>
                <button disabled={!canToggleStage || !!toggling} onClick={() => handleToggle(stage.id, stage.completed)} className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${stage.completed ? `${meta.dot} border-transparent` : 'border-gray-300 hover:border-blue-400 bg-white'} ${canToggleStage ? 'cursor-pointer' : 'cursor-default'}`}>
                  {toggling === stage.id ? <Loader2 size={10} className="animate-spin text-white" /> : stage.completed ? <CheckCircle2 size={11} className="text-white" /> : null}
                </button>
                <div className="flex-1 min-w-0">
                  {editingStageId === stage.id ? (
                    <div className="space-y-1.5" onClick={e => e.stopPropagation()}>
                      <input autoFocus value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEditStage(); if (e.key === 'Escape') setEditingStageId(null) }} className="w-full border border-blue-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                      <input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Description" className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] text-gray-400 shrink-0">Due</label>
                        <input type="date" value={editDue} onChange={e => setEditDue(e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                        {editDue && <button type="button" onClick={() => setEditDue('')} className="text-gray-300 hover:text-red-400"><X size={11} /></button>}
                      </div>
                      <div className="flex gap-1.5 pt-0.5">
                        <button onClick={() => setEditingStageId(null)} className="px-2 py-1 text-[11px] text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                        <button onClick={saveEditStage} disabled={!editName.trim() || editSaving} className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white text-[11px] rounded-lg hover:bg-blue-700 disabled:opacity-50">{editSaving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />} Save</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className={`text-sm font-semibold ${stage.completed ? 'text-gray-400 line-through decoration-gray-300' : 'text-gray-800'}`}>{stage.name}</p>
                      {stage.description && <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{stage.description}</p>}
                      {stage.completed && stage.completed_at && <p className="text-[10px] text-gray-300 mt-1 font-medium">✓ {new Date(stage.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
                      {stage.due_date && (() => { const due = new Date(stage.due_date); const overdue = !stage.completed && due < new Date(); return <p className={`text-[10px] mt-1 font-medium flex items-center gap-1 ${overdue ? 'text-red-400' : 'text-gray-400'}`}>{overdue ? '⚠ Overdue · ' : '📅 Due '}{due.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p> })()}
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${stage.completed ? `${meta.badge} border` : 'bg-gray-100 text-gray-400'}`}>#{i + 1}</span>
                  {canManage && editingStageId !== stage.id && (
                    <>
                      <button onClick={() => startEditStage(stage)} className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg flex items-center justify-center text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-all" title="Edit stage"><Pencil size={10} /></button>
                      <button disabled={!!deletingId} onClick={() => handleDelete(stage.id)} className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">{deletingId === stage.id ? <Loader2 size={11} className="animate-spin text-red-400" /> : <Trash2 size={11} />}</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
