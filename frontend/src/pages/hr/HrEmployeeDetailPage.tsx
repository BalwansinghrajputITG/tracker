import React, { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Lock, Mail, Phone, MapPin, Calendar, Briefcase, ShieldAlert } from 'lucide-react'
import { RootState } from '../../store'
import {
  fetchEmployeeRequest, fetchCompensationRequest, CompensationRecord,
} from '../../store/slices/hrEmployeesSlice'
import { usePermissions } from '../../hooks/usePermissions'
import { Avatar, StatusBadge, EmptyState, DataTable, Column } from '../../components/shared'
import { DocumentsPanel } from '../../components/hr/DocumentsPanel'

type Tab = 'profile' | 'employment' | 'compensation' | 'documents'

const TABS: { key: Tab; label: string }[] = [
  { key: 'profile', label: 'Profile' },
  { key: 'employment', label: 'Employment' },
  { key: 'compensation', label: 'Compensation' },
  { key: 'documents', label: 'Documents' },
]

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const fmtMoney = (amount: number, currency: string) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency', currency: currency || 'INR', maximumFractionDigits: 0,
  }).format(amount)

const Field: React.FC<{ label: string; value?: React.ReactNode; icon?: React.ReactNode }> = ({
  label, value, icon,
}) => (
  <div>
    <p className="text-xs text-gray-400 mb-1 flex items-center gap-1.5">{icon}{label}</p>
    <p className="text-sm text-gray-800">{value || '—'}</p>
  </div>
)

export const HrEmployeeDetailPage: React.FC = () => {
  // useParams, not the window.location.pathname.split() hack in App.tsx:48-57 —
  // that returns "employees" for /hr/employees/:id.
  const { id = '' } = useParams()
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { can } = usePermissions()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'profile'

  const { selected, detailLoading, compensation, compensationLoading } =
    useSelector((s: RootState) => s.hrEmployees)

  useEffect(() => {
    if (id) dispatch(fetchEmployeeRequest(id))
  }, [id, dispatch])

  // Fetched only when the tab is opened AND the caller may see pay — no point
  // firing a request that the server will refuse.
  useEffect(() => {
    if (tab === 'compensation' && id && can('salary.read')) {
      dispatch(fetchCompensationRequest(id))
    }
  }, [tab, id, can, dispatch])

  if (!can('employee.read')) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 animate-fade-in">
        <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
          <Lock size={24} className="text-gray-300" />
        </div>
        <p className="text-base font-semibold text-gray-600">Access Restricted</p>
        <p className="text-sm mt-1">Employee records are available to HR and managers</p>
      </div>
    )
  }

  if (detailLoading || !selected) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-32 skeleton rounded-2xl" />
        <div className="h-64 skeleton rounded-2xl" />
      </div>
    )
  }

  const e = selected

  const compColumns: Column<CompensationRecord>[] = [
    {
      key: 'effective_date',
      header: 'Effective',
      render: (r) => (
        <span className="text-sm text-gray-700">
          {fmtDate(r.effective_date)}
          {r.is_current && (
            <span className="ml-2 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
              CURRENT
            </span>
          )}
        </span>
      ),
    },
    { key: 'base_salary', header: 'Base', render: (r) => <span className="text-sm text-gray-800">{fmtMoney(r.base_salary, r.currency)}</span> },
    { key: 'ctc', header: 'CTC', render: (r) => <span className="text-sm text-gray-800">{fmtMoney(r.ctc, r.currency)}</span> },
    { key: 'reason', header: 'Reason', render: (r) => <StatusBadge status={r.reason} /> },
    { key: 'approved_by_name', header: 'Approved by', render: (r) => <span className="text-sm text-gray-600">{r.approved_by_name || '—'}</span> },
  ]

  return (
    <div className="space-y-5">
      <button
        onClick={() => navigate('/hr/employees')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <ArrowLeft size={15} /> Back to employees
      </button>

      {/* Header card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 animate-fade-in-up">
        <div className="flex items-start gap-4">
          <Avatar name={e.full_name} src={e.avatar_url} size="xl" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{e.full_name}</h1>
              <StatusBadge status={e.employment_status} />
            </div>
            <p className="text-sm text-gray-600 mt-0.5">
              {e.designation_title || 'No designation'}
              {e.department_name && ` · ${e.department_name}`}
            </p>
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 flex-wrap">
              <span className="flex items-center gap-1"><Briefcase size={12} />{e.employee_code}</span>
              <span className="flex items-center gap-1"><Mail size={12} />{e.email}</span>
              {e.manager_name && <span>Reports to {e.manager_name}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setParams({ tab: t.key })}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              tab === t.key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 animate-fade-in-up">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <Field label="Personal email" value={e.personal_email} icon={<Mail size={11} />} />
            <Field label="Phone" value={e.phone} icon={<Phone size={11} />} />
            <Field label="Date of birth" value={fmtDate(e.date_of_birth)} icon={<Calendar size={11} />} />
            <Field label="Gender" value={e.gender} />
            <Field label="Address" value={e.address} icon={<MapPin size={11} />} />
            <Field
              label="Emergency contact"
              value={e.emergency_contact?.name
                ? `${e.emergency_contact.name} (${e.emergency_contact.relationship}) · ${e.emergency_contact.phone}`
                : ''}
            />
          </div>
        </div>
      )}

      {tab === 'employment' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 animate-fade-in-up">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <Field label="Employee code" value={e.employee_code} />
            <Field label="Joining date" value={fmtDate(e.joining_date)} />
            <Field label="Designation" value={e.designation_title} />
            <Field label="Department" value={e.department_name} />
            <Field label="Reports to" value={e.manager_name} />
            <Field label="Employment type" value={e.employment_type?.replace('_', ' ')} />
            <Field label="Work mode" value={e.work_mode} />
            <Field label="Work location" value={e.work_location} />
            <Field label="Probation" value={e.probation_status?.replace('_', ' ')} />
            <Field label="Probation ends" value={fmtDate(e.probation_end_date)} />
            <Field label="Confirmed on" value={fmtDate(e.confirmation_date)} />
            <Field label="Exit date" value={fmtDate(e.exit_date)} />
          </div>
        </div>
      )}

      {tab === 'documents' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 animate-fade-in-up">
          <DocumentsPanel userId={e.user_id} />
        </div>
      )}

      {tab === 'compensation' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 animate-fade-in-up">
          {/* The server omits compensation entirely without salary.read; this
              panel explains the absence rather than rendering an empty table. */}
          {!can('salary.read') ? (
            <EmptyState
              icon={<ShieldAlert size={22} className="text-amber-500" />}
              title="Compensation is restricted"
              description="Viewing pay requires the salary.read permission. Every access is recorded in the audit log."
              size="compact"
            />
          ) : compensationLoading ? (
            <div className="h-32 skeleton rounded-xl animate-pulse" />
          ) : !compensation?.history?.length ? (
            <EmptyState
              variant="default"
              title="No compensation records"
              description="This employee has no compensation history yet."
              size="compact"
            />
          ) : (
            <>
              {compensation.current && (
                <div className="mb-5 flex flex-wrap gap-6">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Current base</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {fmtMoney(compensation.current.base_salary, compensation.current.currency)}
                      <span className="text-sm font-normal text-gray-500">
                        {' '}/ {compensation.current.pay_frequency}
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">CTC</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {fmtMoney(compensation.current.ctc, compensation.current.currency)}
                    </p>
                  </div>
                </div>
              )}
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                History
              </p>
              <DataTable columns={compColumns} data={compensation.history} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
