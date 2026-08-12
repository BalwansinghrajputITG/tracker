import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useSearchParams } from 'react-router-dom'
import { Target, Star, Lock, Plus, X, Check } from 'lucide-react'
import { RootState } from '../../store'
import {
  fetchGoalsRequest, saveGoalRequest, updateGoalRequest,
  fetchCyclesRequest, fetchReviewsRequest, fetchReviewRequest,
  submitReviewRequest, clearSelectedReview,
  Goal, ReviewRow,
} from '../../store/slices/hrPerformanceSlice'
import { usePermissions } from '../../hooks/usePermissions'
import { DataTable, Column, StatusBadge, EmptyState, useToast } from '../../components/shared'
import { Modal } from '../../components/common/Modal'
import { api } from '../../utils/api'

type Tab = 'goals' | 'reviews'

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const inputCls =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

const ProgressBar: React.FC<{ value: number }> = ({ value }) => (
  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
    <div
      className={`h-full rounded-full transition-all ${
        value >= 100 ? 'bg-emerald-500' : value >= 60 ? 'bg-blue-500' : value >= 30 ? 'bg-amber-500' : 'bg-rose-400'
      }`}
      style={{ width: `${Math.min(100, value)}%` }}
    />
  </div>
)

/* ── Review modal ─────────────────────────────────────────────────────────── */

const ReviewModal: React.FC<{ reviewId: string; onClose: () => void }> = ({ reviewId, onClose }) => {
  const dispatch = useDispatch()
  const toast = useToast()
  const { selectedReview, detailLoading, saveLoading, saveError } =
    useSelector((s: RootState) => s.hrPerformance)
  const [section, setSection] = useState<string>('')
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [strengths, setStrengths] = useState('')
  const [improvements, setImprovements] = useState('')

  useEffect(() => { dispatch(fetchReviewRequest(reviewId)) }, [reviewId, dispatch])
  useEffect(() => () => { dispatch(clearSelectedReview()) }, [dispatch])

  const r = selectedReview
  const available: string[] = []
  if (r?.can_submit_self) available.push('self')
  if (r?.can_submit_manager) available.push('manager')
  if (r?.can_submit_hr) available.push('hr')
  available.push('peer')

  useEffect(() => { if (!section && available.length) setSection(available[0]) }, [available, section])

  const submit = () => {
    if (!Object.keys(ratings).length) { toast.error('Rate at least one dimension.'); return }
    dispatch(submitReviewRequest({
      id: reviewId,
      payload: { section, ratings, strengths, improvements, comments: '' },
    }))
    setRatings({}); setStrengths(''); setImprovements('')
  }

  return (
    <Modal onClose={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl animate-scale-in">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <Star size={16} className="text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">{r?.employee_name || 'Review'}</p>
              <p className="text-xs text-gray-500">{r?.cycle_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {detailLoading || !r ? (
          <div className="p-6 space-y-3 animate-pulse">
            <div className="h-20 skeleton rounded-xl" /><div className="h-40 skeleton rounded-xl" />
          </div>
        ) : (
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Objective', value: r.objective_score, hint: 'Activity signals' },
                { label: 'Goals', value: r.goal_completion, hint: 'Weighted completion' },
                { label: 'Composite', value: r.composite_score, hint: 'Overall' },
              ].map(m => (
                <div key={m.label} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400">{m.label}</p>
                  <p className="text-xl font-bold text-gray-900">{m.value ?? '—'}</p>
                  <p className="text-[11px] text-gray-400">{m.hint}</p>
                </div>
              ))}
            </div>

            {/* Submitted sections. The server withholds manager/HR feedback from
                the subject until the review is complete, so an empty section
                here may mean "not yet visible" rather than "not written". */}
            <div className="space-y-3">
              {(['self', 'manager', 'hr'] as const).map(key => {
                const s = r.sections[key]
                if (!s) return null
                return (
                  <div key={key} className="border border-gray-100 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-gray-800 capitalize">{key} review</p>
                      <span className="text-xs text-gray-400">
                        {s.by_name} · {fmtDate(s.submitted_at)} · overall {s.overall}/5
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {Object.entries(s.ratings).map(([dim, score]) => (
                        <span key={dim} className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-gray-600">
                          {dim.replace(/_/g, ' ')}: {score}/5
                        </span>
                      ))}
                    </div>
                    {s.strengths && <p className="text-sm text-gray-700"><span className="text-gray-400">Strengths: </span>{s.strengths}</p>}
                    {s.improvements && <p className="text-sm text-gray-700"><span className="text-gray-400">Improve: </span>{s.improvements}</p>}
                  </div>
                )
              })}
              {r.sections.peer.map((s, i) => (
                <div key={i} className="border border-gray-100 rounded-xl p-4">
                  <p className="text-sm font-semibold text-gray-800 mb-1">
                    Peer feedback <span className="text-xs font-normal text-gray-400">({s.by_name})</span>
                  </p>
                  {s.comments && <p className="text-sm text-gray-700">{s.comments}</p>}
                </div>
              ))}
            </div>

            {/* Submit */}
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-gray-500">Submit as</span>
                <select value={section} onChange={e => setSection(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-gray-50">
                  {available.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-2 mb-3">
                {r.dimensions.map(dim => (
                  <div key={dim} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 capitalize">{dim.replace(/_/g, ' ')}</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(n => (
                        <button key={n} onClick={() => setRatings(p => ({ ...p, [dim]: n }))}
                          className={`w-7 h-7 rounded-lg text-xs font-medium transition-all ${
                            ratings[dim] === n ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}>{n}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <textarea rows={2} placeholder="Strengths" value={strengths}
                onChange={e => setStrengths(e.target.value)} className={inputCls + ' mb-2'} />
              <textarea rows={2} placeholder="Areas to improve" value={improvements}
                onChange={e => setImprovements(e.target.value)} className={inputCls} />
              {saveError && <div className="mt-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-3 py-2 text-sm">{saveError}</div>}
              <button onClick={submit} disabled={saveLoading}
                className="mt-3 w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {saveLoading ? 'Submitting…' : `Submit ${section} review`}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

/* ── Goal modal ───────────────────────────────────────────────────────────── */

const GoalModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const dispatch = useDispatch()
  const { saveLoading, saveError } = useSelector((s: RootState) => s.hrPerformance)
  const [people, setPeople] = useState<{ id: string; full_name: string }[]>([])
  const [form, setForm] = useState({
    user_id: '', title: '', kpi: '', target_value: 100, unit: '%', weight: 20, deadline: '',
  })
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    api.get('/hr/employees', { params: { limit: 100 } })
      .then(r => setPeople(r.data.employees.map((e: any) => ({ id: e.user_id, full_name: e.full_name }))))
      .catch(() => {})
  }, [])

  return (
    <Modal onClose={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-scale-in">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <Target size={16} className="text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Assign a goal</p>
              <p className="text-xs text-gray-500">Appears in the employee's own workspace too</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Employee</label>
            <select className={inputCls} value={form.user_id} onChange={e => set('user_id', e.target.value)}>
              <option value="">Select…</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Goal</label>
            <input className={inputCls} value={form.title} onChange={e => set('title', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">KPI — how success is measured</label>
            <input className={inputCls} value={form.kpi} onChange={e => set('kpi', e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Target</label>
              <input type="number" className={inputCls} value={form.target_value} onChange={e => set('target_value', +e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Unit</label>
              <input className={inputCls} value={form.unit} onChange={e => set('unit', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Weight %</label>
              <input type="number" min={0} max={100} className={inputCls} value={form.weight} onChange={e => set('weight', +e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Deadline</label>
            <input type="date" className={inputCls} value={form.deadline} onChange={e => set('deadline', e.target.value)} />
          </div>
          {saveError && <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-3 py-2 text-sm">{saveError}</div>}
        </div>
        <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
          <button onClick={() => dispatch(saveGoalRequest(form))}
            disabled={!form.user_id || !form.title || saveLoading}
            className="bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {saveLoading ? 'Saving…' : 'Assign goal'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export const HrPerformancePage: React.FC = () => {
  const dispatch = useDispatch()
  const toast = useToast()
  const { can } = usePermissions()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'goals'
  const [showGoal, setShowGoal] = useState(false)
  const [openReview, setOpenReview] = useState<string | null>(null)

  const { goals, weightedCompletion, goalsLoading, reviews, reviewsLoading, error } =
    useSelector((s: RootState) => s.hrPerformance)

  useEffect(() => {
    if (tab === 'goals') dispatch(fetchGoalsRequest())
    if (tab === 'reviews') { dispatch(fetchReviewsRequest()); dispatch(fetchCyclesRequest()) }
  }, [tab, dispatch])
  useEffect(() => { if (error) toast.error(error) }, [error, toast])

  if (!can('performance.read')) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 animate-fade-in">
        <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
          <Lock size={24} className="text-gray-300" />
        </div>
        <p className="text-base font-semibold text-gray-600">Access Restricted</p>
      </div>
    )
  }

  const goalCols: Column<Goal>[] = [
    {
      key: 'title', header: 'Goal',
      render: g => (
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{g.title}</p>
          <p className="text-xs text-gray-400 truncate">{g.kpi || g.description || '—'}</p>
        </div>
      ),
    },
    { key: 'employee_name', header: 'Owner', render: g => <span className="text-sm text-gray-600">{g.employee_name}</span> },
    {
      key: 'progress', header: 'Progress',
      render: g => (
        <div className="w-32">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-600">{g.current_value}/{g.target_value}{g.unit}</span>
            <span className="text-xs font-medium text-gray-700">{g.progress}%</span>
          </div>
          <ProgressBar value={g.progress} />
        </div>
      ),
    },
    { key: 'weight', header: 'Weight', render: g => <span className="text-sm text-gray-600">{g.weight ? `${g.weight}%` : '—'}</span> },
    { key: 'deadline', header: 'Due', render: g => <span className="text-sm text-gray-600">{fmtDate(g.deadline)}</span> },
    {
      key: 'completed', header: '',
      render: g => g.completed
        ? <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 flex items-center gap-1 w-fit"><Check size={10} />Done</span>
        : null,
    },
  ]

  const reviewCols: Column<ReviewRow>[] = [
    {
      key: 'employee_name', header: 'Employee',
      render: r => (
        <div>
          <p className="text-sm font-medium text-gray-900">{r.employee_name}</p>
          <p className="text-xs text-gray-400">{r.cycle_name}</p>
        </div>
      ),
    },
    {
      key: 'submitted', header: 'Sections',
      render: r => (
        <div className="flex gap-1">
          {(['self', 'manager', 'hr'] as const).map(k => (
            <span key={k} className={`text-[10px] px-1.5 py-0.5 rounded border ${
              r.submitted[k] ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-400 border-gray-200'
            }`}>{k}</span>
          ))}
          {r.submitted.peer > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200">
              {r.submitted.peer} peer
            </span>
          )}
        </div>
      ),
    },
    { key: 'objective_score', header: 'Objective', render: r => <span className="text-sm text-gray-600">{r.objective_score ?? '—'}</span> },
    { key: 'goal_completion', header: 'Goals', render: r => <span className="text-sm text-gray-600">{r.goal_completion != null ? `${r.goal_completion}%` : '—'}</span> },
    {
      key: 'composite_score', header: 'Composite',
      render: r => (
        <span className={`text-sm font-semibold ${
          (r.composite_score ?? 0) >= 80 ? 'text-emerald-700'
            : (r.composite_score ?? 0) >= 60 ? 'text-blue-700' : 'text-gray-700'
        }`}>{r.composite_score ?? '—'}</span>
      ),
    },
    { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Performance</h1>
          <p className="text-gray-500 text-sm mt-0.5">Goals and review cycles</p>
        </div>
        {tab === 'goals' && can('goal.create') && (
          <button onClick={() => setShowGoal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-200 transition-all flex items-center gap-2">
            <Plus size={14} /> Assign goal
          </button>
        )}
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(['goals', 'reviews'] as Tab[]).map(t => (
          <button key={t} onClick={() => setParams({ tab: t })}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${
              tab === t ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}>{t}</button>
        ))}
      </div>

      {tab === 'goals' && (
        <div className="space-y-4 animate-fade-in-up">
          {weightedCompletion != null && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 max-w-sm">
              <p className="text-xs text-gray-400">Weighted goal completion</p>
              <p className="text-3xl font-bold text-gray-900 mb-2">{weightedCompletion}%</p>
              <ProgressBar value={weightedCompletion} />
            </div>
          )}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <DataTable columns={goalCols} data={goals} loading={goalsLoading}
              emptyMessage="No goals set yet" />
          </div>
        </div>
      )}

      {tab === 'reviews' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in-up">
          {!reviewsLoading && !reviews.length ? (
            <div className="p-6">
              <EmptyState variant="default" title="No review cycles open"
                description="Open a review cycle to start collecting self, manager and peer feedback."
                size="compact" />
            </div>
          ) : (
            <DataTable columns={reviewCols} data={reviews} loading={reviewsLoading}
              onRowClick={r => setOpenReview(r.id)} rowClassName="cursor-pointer"
              emptyMessage="No reviews" />
          )}
        </div>
      )}

      {showGoal && <GoalModal onClose={() => setShowGoal(false)} />}
      {openReview && <ReviewModal reviewId={openReview} onClose={() => setOpenReview(null)} />}
    </div>
  )
}
