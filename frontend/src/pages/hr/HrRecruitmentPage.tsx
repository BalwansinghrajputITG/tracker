import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useSearchParams } from 'react-router-dom'
import {
  Briefcase, UserPlus, CalendarPlus, Lock, Plus, X, Send, Check,
  Users, FileText, Copy,
} from 'lucide-react'
import { RootState } from '../../store'
import {
  fetchJobsRequest, saveJobRequest,
  fetchCandidatesRequest, saveCandidateRequest, clearRecruitmentSaveError,
  fetchApplicationsRequest, fetchInterviewsRequest, scheduleInterviewRequest,
  fetchOffersRequest, createOfferRequest, offerActionRequest,
  Job, Interview, Offer, Application,
} from '../../store/slices/hrRecruitmentSlice'
import { usePermissions } from '../../hooks/usePermissions'
import { DataTable, Column, StatusBadge, useToast, EmptyState } from '../../components/shared'
import { Modal } from '../../components/common/Modal'
import { CandidatePipeline } from '../../components/hr/CandidatePipeline'
import { api } from '../../utils/api'

type Tab = 'openings' | 'pipeline' | 'interviews' | 'offers'

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
const money = (n?: number, c = 'INR') =>
  n == null ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n)

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-xs text-gray-500 mb-1.5">{label}</label>
    {children}
  </div>
)

const inputCls =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

/* ── Modals ───────────────────────────────────────────────────────────────── */

const JobModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const dispatch = useDispatch()
  const { saveLoading, saveError } = useSelector((s: RootState) => s.hrRecruitment)
  const [form, setForm] = useState({
    title: '', location: '', experience_min: 0, experience_max: 0,
    salary_min: 0, salary_max: 0, skills: '', openings_count: 1, description: '',
  })
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal onClose={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl animate-scale-in">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <Briefcase size={16} className="text-blue-600" />
            </div>
            <p className="font-semibold text-gray-900">New job opening</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <Field label="Title"><input className={inputCls} value={form.title} onChange={e => set('title', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Location"><input className={inputCls} value={form.location} onChange={e => set('location', e.target.value)} /></Field>
            <Field label="Openings"><input type="number" min={1} className={inputCls} value={form.openings_count} onChange={e => set('openings_count', +e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min experience (yrs)"><input type="number" min={0} className={inputCls} value={form.experience_min} onChange={e => set('experience_min', +e.target.value)} /></Field>
            <Field label="Max experience (yrs)"><input type="number" min={0} className={inputCls} value={form.experience_max} onChange={e => set('experience_max', +e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Salary min"><input type="number" min={0} className={inputCls} value={form.salary_min} onChange={e => set('salary_min', +e.target.value)} /></Field>
            <Field label="Salary max"><input type="number" min={0} className={inputCls} value={form.salary_max} onChange={e => set('salary_max', +e.target.value)} /></Field>
          </div>
          <Field label="Skills (comma separated)"><input className={inputCls} value={form.skills} onChange={e => set('skills', e.target.value)} /></Field>
          <Field label="Description"><textarea rows={3} className={inputCls} value={form.description} onChange={e => set('description', e.target.value)} /></Field>
          {saveError && <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-3 py-2 text-sm">{saveError}</div>}
        </div>
        <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
          <button
            onClick={() => dispatch(saveJobRequest(form))}
            disabled={!form.title || saveLoading}
            className="bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >{saveLoading ? 'Saving…' : 'Create opening'}</button>
        </div>
      </div>
    </Modal>
  )
}

const CandidateModal: React.FC<{ jobs: Job[]; onClose: () => void }> = ({ jobs, onClose }) => {
  const dispatch = useDispatch()
  const { saveLoading, saveError } = useSelector((s: RootState) => s.hrRecruitment)
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', current_company: '', current_title: '',
    total_experience_years: 0, expected_salary: 0, notice_period_days: 30,
    skills: '', source: 'linkedin', job_id: '',
  })
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal onClose={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl animate-scale-in">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <UserPlus size={16} className="text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Add candidate</p>
              <p className="text-xs text-gray-500">Optionally apply them to an opening</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Full name"><input className={inputCls} value={form.full_name} onChange={e => set('full_name', e.target.value)} /></Field>
            <Field label="Email"><input type="email" className={inputCls} value={form.email} onChange={e => set('email', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Current company"><input className={inputCls} value={form.current_company} onChange={e => set('current_company', e.target.value)} /></Field>
            <Field label="Current title"><input className={inputCls} value={form.current_title} onChange={e => set('current_title', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Experience (yrs)"><input type="number" min={0} step={0.5} className={inputCls} value={form.total_experience_years} onChange={e => set('total_experience_years', +e.target.value)} /></Field>
            <Field label="Expected salary"><input type="number" min={0} className={inputCls} value={form.expected_salary} onChange={e => set('expected_salary', +e.target.value)} /></Field>
            <Field label="Notice (days)"><input type="number" min={0} className={inputCls} value={form.notice_period_days} onChange={e => set('notice_period_days', +e.target.value)} /></Field>
          </div>
          <Field label="Skills (comma separated)"><input className={inputCls} value={form.skills} onChange={e => set('skills', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Source">
              <select className={inputCls} value={form.source} onChange={e => set('source', e.target.value)}>
                {['linkedin', 'referral', 'job_board', 'careers_page', 'agency', 'walk_in', 'other'].map(s => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </Field>
            <Field label="Apply to opening">
              <select className={inputCls} value={form.job_id} onChange={e => set('job_id', e.target.value)}>
                <option value="">None</option>
                {jobs.filter(j => j.status === 'open').map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
            </Field>
          </div>
          {saveError && <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-3 py-2 text-sm">{saveError}</div>}
        </div>
        <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
          <button
            onClick={() => dispatch(saveCandidateRequest(form))}
            disabled={!form.full_name || !form.email || saveLoading}
            className="bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >{saveLoading ? 'Saving…' : 'Add candidate'}</button>
        </div>
      </div>
    </Modal>
  )
}

/** Shown once after a conversion — the generated password is never retrievable later. */
const HireResultModal: React.FC<{ result: any; onClose: () => void }> = ({ result, onClose }) => {
  const toast = useToast()
  return (
    <Modal onClose={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-scale-in p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
            <Check size={18} className="text-emerald-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">Employee created</p>
            <p className="text-xs text-gray-500">{result.employee_code} · {result.onboarding_tasks} onboarding tasks</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-3">
          Share these credentials with the new employee. The password is shown once
          and cannot be retrieved later — they must change it at first sign-in.
        </p>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-gray-500">Email</span>
            <span className="font-mono text-gray-900 truncate">{result.email}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-gray-500">Password</span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-gray-900">{result.initial_password}</span>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(`${result.email} / ${result.initial_password}`)
                  toast.success('Copied')
                }}
                className="text-gray-400 hover:text-blue-600"
              ><Copy size={13} /></button>
            </span>
          </div>
        </div>
        <button onClick={onClose} className="mt-5 w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700">
          Done
        </button>
      </div>
    </Modal>
  )
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export const HrRecruitmentPage: React.FC = () => {
  const dispatch = useDispatch()
  const toast = useToast()
  const { can } = usePermissions()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'openings'

  const {
    jobs, openPositions, jobsLoading,
    applications, byStage, stages, applicationsLoading,
    interviews, interviewsLoading,
    offers, pendingOffers, offersLoading,
    error, saveLoading,
  } = useSelector((s: RootState) => s.hrRecruitment)

  const [showJob, setShowJob] = useState(false)
  const [showCandidate, setShowCandidate] = useState(false)
  const [hireResult, setHireResult] = useState<any>(null)

  useEffect(() => { dispatch(fetchJobsRequest()) }, [dispatch])
  useEffect(() => {
    if (tab === 'pipeline') dispatch(fetchApplicationsRequest())
    if (tab === 'interviews') dispatch(fetchInterviewsRequest())
    if (tab === 'offers') dispatch(fetchOffersRequest())
  }, [tab, dispatch])
  useEffect(() => { if (error) toast.error(error) }, [error, toast])

  if (!can('job_position.read') && !can('candidate.read')) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 animate-fade-in">
        <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
          <Lock size={24} className="text-gray-300" />
        </div>
        <p className="text-base font-semibold text-gray-600">Access Restricted</p>
        <p className="text-sm mt-1">Recruitment is available to HR and recruiters</p>
      </div>
    )
  }

  const offerAction = async (offer: Offer, verb: 'send' | 'accept' | 'reject' | 'withdraw') => {
    if (verb !== 'accept') {
      dispatch(offerActionRequest({ id: offer.id, action: verb, reason: verb === 'reject' ? 'Declined' : '' }))
      return
    }
    // Accept is handled directly rather than through the saga so the one-time
    // credentials in the response can be shown immediately.
    try {
      const res: any = await api.post(`/hr/offers/${offer.id}/decision`, { accept: true })
      setHireResult(res.data)
      dispatch(fetchOffersRequest())
      dispatch(fetchJobsRequest())
      dispatch(fetchApplicationsRequest())
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Could not accept the offer.')
    }
  }

  const jobCols: Column<Job>[] = [
    {
      key: 'title', header: 'Opening',
      render: j => (
        <div>
          <p className="text-sm font-medium text-gray-900">{j.title}</p>
          <p className="text-xs text-gray-400">{j.department_name || '—'} · {j.location || 'Any'}</p>
        </div>
      ),
    },
    {
      key: 'openings_count', header: 'Filled',
      render: j => <span className="text-sm text-gray-700">{j.filled_count}/{j.openings_count}</span>,
    },
    { key: 'applicant_count', header: 'Applicants', render: j => <span className="text-sm text-gray-700">{j.applicant_count}</span> },
    {
      key: 'salary_min', header: 'Band',
      render: j => (
        j.salary_min != null
          ? <span className="text-sm text-gray-600">{money(j.salary_min, j.currency)} – {money(j.salary_max, j.currency)}</span>
          : <span className="text-xs text-gray-300">Restricted</span>
      ),
    },
    { key: 'status', header: 'Status', render: j => <StatusBadge status={j.status} /> },
  ]

  const interviewCols: Column<Interview>[] = [
    {
      key: 'candidate_name', header: 'Candidate',
      render: i => (
        <div>
          <p className="text-sm font-medium text-gray-900">{i.candidate_name}</p>
          <p className="text-xs text-gray-400">{i.job_title}</p>
        </div>
      ),
    },
    {
      key: 'round', header: 'Round',
      render: i => <span className="text-sm text-gray-600 capitalize">{i.round.replace(/_/g, ' ')} #{i.round_number}</span>,
    },
    { key: 'scheduled_at', header: 'When', render: i => <span className="text-sm text-gray-600">{fmtDateTime(i.scheduled_at)}</span> },
    {
      key: 'interviewers', header: 'Panel',
      render: i => (
        <div className="flex flex-col gap-0.5">
          {i.interviewers.map(p => (
            <span key={p.user_id} className="text-xs text-gray-600 flex items-center gap-1">
              {p.submitted ? <Check size={10} className="text-emerald-600" /> : <span className="w-2.5" />}
              {p.full_name}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'feedback_submitted', header: 'Feedback',
      render: i => (
        <span className={`text-sm ${i.feedback_submitted === i.feedback_expected ? 'text-emerald-700' : 'text-gray-500'}`}>
          {i.feedback_submitted}/{i.feedback_expected}
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: i => <StatusBadge status={i.status} /> },
  ]

  const offerCols: Column<Offer>[] = [
    {
      key: 'candidate_name', header: 'Candidate',
      render: o => (
        <div>
          <p className="text-sm font-medium text-gray-900">{o.candidate_name}</p>
          <p className="text-xs text-gray-400">{o.job_title}</p>
        </div>
      ),
    },
    { key: 'joining_date', header: 'Joining', render: o => <span className="text-sm text-gray-600">{fmtDate(o.joining_date)}</span> },
    {
      key: 'ctc', header: 'CTC',
      render: o => (
        o.ctc != null
          ? <span className="text-sm text-gray-800">{money(o.ctc, o.currency)}</span>
          : <span className="text-xs text-gray-300">Restricted</span>
      ),
    },
    { key: 'expires_at', header: 'Expires', render: o => <span className="text-sm text-gray-600">{fmtDate(o.expires_at)}</span> },
    { key: 'status', header: 'Status', render: o => <StatusBadge status={o.status} /> },
    {
      key: 'actions', header: '', className: 'text-right',
      render: o => (
        <div className="flex items-center justify-end gap-1.5">
          {/* Driven by the server's allowed_transitions, so the UI can never
              offer a move the state machine would refuse. */}
          {o.allowed_transitions.includes('sent') && can('offer.send') && (
            <button onClick={() => offerAction(o, 'send')} disabled={saveLoading}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 flex items-center gap-1">
              <Send size={11} /> Send
            </button>
          )}
          {o.allowed_transitions.includes('accepted') && can('offer.update') && (
            <button onClick={() => offerAction(o, 'accept')} disabled={saveLoading}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center gap-1">
              <Check size={11} /> Accepted
            </button>
          )}
          {o.allowed_transitions.includes('rejected') && can('offer.update') && (
            <button onClick={() => offerAction(o, 'reject')} disabled={saveLoading}
              className="px-2.5 py-1 rounded-lg text-xs text-gray-500 hover:bg-gray-100">Declined</button>
          )}
        </div>
      ),
    },
  ]

  const TABS: { key: Tab; label: string }[] = [
    { key: 'openings', label: `Openings${openPositions ? ` (${openPositions})` : ''}` },
    { key: 'pipeline', label: 'Pipeline' },
    { key: 'interviews', label: 'Interviews' },
    { key: 'offers', label: `Offers${pendingOffers ? ` (${pendingOffers})` : ''}` },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recruitment</h1>
          <p className="text-gray-500 text-sm mt-0.5">Openings, candidates, interviews and offers</p>
        </div>
        <div className="flex gap-2">
          {can('candidate.create') && (
            <button onClick={() => { dispatch(clearRecruitmentSaveError()); setShowCandidate(true) }}
              className="border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 flex items-center gap-2">
              <UserPlus size={14} /> Add candidate
            </button>
          )}
          {can('job_position.create') && (
            <button onClick={() => { dispatch(clearRecruitmentSaveError()); setShowJob(true) }}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-200 transition-all flex items-center gap-2">
              <Plus size={14} /> New opening
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setParams({ tab: t.key })}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              tab === t.key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}>{t.label}</button>
        ))}
      </div>

      {tab === 'openings' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in-up">
          <DataTable columns={jobCols} data={jobs} loading={jobsLoading} emptyMessage="No job openings yet" />
        </div>
      )}

      {tab === 'pipeline' && (
        <div className="animate-fade-in-up">
          <CandidatePipeline
            applications={applications}
            stages={stages}
            byStage={byStage}
            loading={applicationsLoading}
            canMove={can('application.update')}
          />
        </div>
      )}

      {tab === 'interviews' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in-up">
          <DataTable columns={interviewCols} data={interviews} loading={interviewsLoading}
            emptyMessage="No interviews scheduled" />
        </div>
      )}

      {tab === 'offers' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in-up">
          <DataTable columns={offerCols} data={offers} loading={offersLoading}
            emptyMessage="No offers yet" />
        </div>
      )}

      {showJob && <JobModal onClose={() => setShowJob(false)} />}
      {showCandidate && <CandidateModal jobs={jobs} onClose={() => setShowCandidate(false)} />}
      {hireResult && <HireResultModal result={hireResult} onClose={() => setHireResult(null)} />}
    </div>
  )
}
