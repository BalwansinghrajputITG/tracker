import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useSearchParams } from 'react-router-dom'
import {
  Clock, LogIn, LogOut, CalendarDays, Check, X, Plus, Lock, Plane, Download,
} from 'lucide-react'
import { RootState } from '../../store'
import {
  fetchAttendanceRequest, fetchTodayRequest, punchRequest,
  fetchBalancesRequest, fetchLeaveTypesRequest, fetchLeaveRequestsRequest,
  fetchApprovalsRequest, submitLeaveRequest, decideLeaveRequest, cancelLeaveRequest,
  fetchHolidaysRequest, fetchCalendarRequest,
  AttendanceRecord, LeaveRequest, Holiday,
} from '../../store/slices/hrTimeSlice'
import { usePermissions } from '../../hooks/usePermissions'
import { DataTable, Column, StatusBadge, EmptyState, useToast } from '../../components/shared'
import { Modal } from '../../components/common/Modal'
import { api } from '../../utils/api'

type Tab = 'attendance' | 'leave' | 'approvals' | 'holidays'

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—'

const hours = (min: number) => (min ? `${(min / 60).toFixed(1)}h` : '—')

/* ── Apply-for-leave modal ────────────────────────────────────────────────── */

const ApplyLeaveModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const dispatch = useDispatch()
  const toast = useToast()
  const { leaveTypes, balances, submitLoading, submitError } =
    useSelector((s: RootState) => s.hrTime)

  const [typeId, setTypeId] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [halfDay, setHalfDay] = useState(false)
  const [reason, setReason] = useState('')
  const [wasSubmitting, setWasSubmitting] = useState(false)

  useEffect(() => {
    if (!typeId && leaveTypes.length) setTypeId(leaveTypes[0].id)
  }, [leaveTypes, typeId])

  // Close on the falling edge of submitLoading with no error — the established
  // pattern from CreateUserModal for detecting saga completion.
  useEffect(() => {
    if (submitLoading) setWasSubmitting(true)
    else if (wasSubmitting) {
      if (!submitError) { toast.success('Leave request submitted'); onClose() }
      setWasSubmitting(false)
    }
  }, [submitLoading, submitError, wasSubmitting, toast, onClose])

  const balance = balances.find(b => b.leave_type_id === typeId)

  return (
    <Modal onClose={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-scale-in">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <Plane size={16} className="text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Apply for leave</p>
              <p className="text-xs text-gray-500">Weekends and holidays are not deducted</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Leave type</label>
            <select
              value={typeId}
              onChange={e => setTypeId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {leaveTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {balance && (
              <p className="text-xs text-gray-400 mt-1">
                {balance.available} of {balance.allocated} days available
                {balance.pending > 0 && ` · ${balance.pending} pending approval`}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">From</label>
              <input type="date" value={start} onChange={e => { setStart(e.target.value); if (halfDay) setEnd(e.target.value) }}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">To</label>
              <input type="date" value={end} disabled={halfDay} onChange={e => setEnd(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={halfDay}
              onChange={e => { setHalfDay(e.target.checked); if (e.target.checked) setEnd(start) }} />
            Half day
          </label>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Reason</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional" />
          </div>

          {submitError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-3 py-2 text-sm">
              {submitError}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
          <button
            onClick={() => dispatch(submitLeaveRequest({
              leave_type_id: typeId, start_date: start, end_date: halfDay ? start : end,
              is_half_day: halfDay, reason,
            }))}
            disabled={!typeId || !start || (!halfDay && !end) || submitLoading}
            className="bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-all"
          >
            {submitLoading ? 'Submitting…' : 'Submit request'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export const HrTimePage: React.FC = () => {
  const dispatch = useDispatch()
  const toast = useToast()
  const { can } = usePermissions()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'attendance'
  const [showApply, setShowApply] = useState(false)

  const {
    attendance, attendanceLoading, today, punchLoading,
    balances, myRequests, approvals, approvalsLoading, requestsLoading,
    holidays, holidaysLoading, error,
  } = useSelector((s: RootState) => s.hrTime)

  useEffect(() => { dispatch(fetchTodayRequest()); dispatch(fetchLeaveTypesRequest()) }, [dispatch])

  useEffect(() => {
    if (tab === 'attendance') dispatch(fetchAttendanceRequest({ limit: 50 }))
    if (tab === 'leave') { dispatch(fetchBalancesRequest()); dispatch(fetchLeaveRequestsRequest({ scope: 'me' })) }
    if (tab === 'approvals') dispatch(fetchApprovalsRequest())
    if (tab === 'holidays') { dispatch(fetchHolidaysRequest()); dispatch(fetchCalendarRequest()) }
  }, [tab, dispatch])

  useEffect(() => { if (error) toast.error(error) }, [error, toast])

  const TABS: { key: Tab; label: string; show: boolean }[] = [
    { key: 'attendance', label: 'Attendance', show: can('attendance.read') },
    { key: 'leave', label: 'My leave', show: can('leave.read') },
    { key: 'approvals', label: `Approvals${approvals.length ? ` (${approvals.length})` : ''}`, show: can('leave.approve') },
    { key: 'holidays', label: 'Holidays', show: can('holiday.read') },
  ]

  const attendanceCols: Column<AttendanceRecord>[] = [
    { key: 'date', header: 'Date', render: r => <span className="text-sm text-gray-700">{fmtDate(r.date)}</span> },
    { key: 'full_name', header: 'Employee', render: r => <span className="text-sm text-gray-900">{r.full_name || '—'}</span> },
    { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
    { key: 'check_in', header: 'In', render: r => <span className="text-sm text-gray-600">{fmtTime(r.check_in)}</span> },
    { key: 'check_out', header: 'Out', render: r => <span className="text-sm text-gray-600">{fmtTime(r.check_out)}</span> },
    { key: 'worked_minutes', header: 'Worked', render: r => <span className="text-sm text-gray-600">{hours(r.worked_minutes)}</span> },
  ]

  const leaveCols = (showEmployee: boolean, showActions: boolean): Column<LeaveRequest>[] => [
    ...(showEmployee ? [{
      key: 'full_name', header: 'Employee',
      render: (r: LeaveRequest) => <span className="text-sm text-gray-900">{r.full_name}</span>,
    }] : []),
    {
      key: 'leave_type_name', header: 'Type',
      render: r => (
        <div>
          <p className="text-sm text-gray-900">{r.leave_type_name}</p>
          <p className="text-xs text-gray-400">{r.days} day{r.days === 1 ? '' : 's'}{r.is_half_day && ' (half)'}</p>
        </div>
      ),
    },
    {
      key: 'start_date', header: 'Dates',
      render: r => <span className="text-sm text-gray-600">{fmtDate(r.start_date)} → {fmtDate(r.end_date)}</span>,
    },
    { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
    ...(showActions ? [{
      key: 'actions', header: '', className: 'text-right',
      render: (r: LeaveRequest) => (
        <div className="flex items-center justify-end gap-1.5">
          {/* Capability flags come from the server — the UI never re-derives
              who may approve at which stage. */}
          {(r.can_approve_manager || r.can_approve_hr) && (
            <>
              <button onClick={() => dispatch(decideLeaveRequest({ id: r.id, approve: true, comment: '' }))}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center gap-1">
                <Check size={12} /> Approve
              </button>
              <button onClick={() => dispatch(decideLeaveRequest({ id: r.id, approve: false, comment: 'Rejected' }))}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-50 text-rose-700 hover:bg-rose-100 flex items-center gap-1">
                <X size={12} /> Reject
              </button>
            </>
          )}
          {r.can_cancel && !r.can_approve_manager && !r.can_approve_hr && (
            <button onClick={() => dispatch(cancelLeaveRequest(r.id))}
              className="px-2.5 py-1 rounded-lg text-xs text-gray-500 hover:bg-gray-100">Cancel</button>
          )}
        </div>
      ),
    }] : []),
  ]

  const holidayCols: Column<Holiday>[] = [
    { key: 'date', header: 'Date', render: h => <span className="text-sm text-gray-700">{fmtDate(h.date)}</span> },
    { key: 'weekday', header: 'Day', render: h => <span className="text-sm text-gray-500">{h.weekday}</span> },
    {
      key: 'name', header: 'Holiday',
      render: h => (
        <span className="text-sm text-gray-900">
          {h.name}
          {h.is_optional && <span className="ml-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">Optional</span>}
        </span>
      ),
    },
    { key: 'holiday_type', header: 'Type', render: h => <span className="text-sm text-gray-500 capitalize">{h.holiday_type}</span> },
  ]

  if (!can('attendance.read') && !can('leave.read')) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 animate-fade-in">
        <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
          <Lock size={24} className="text-gray-300" />
        </div>
        <p className="text-base font-semibold text-gray-600">Access Restricted</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Time &amp; Leave</h1>
          <p className="text-gray-500 text-sm mt-0.5">Attendance, leave and the company calendar</p>
        </div>

        {/* Check in / out */}
        {today && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3 flex items-center gap-4">
            <div>
              <p className="text-xs text-gray-400">Today</p>
              <p className="text-sm font-medium text-gray-900">
                {today.is_holiday ? 'Holiday' : today.is_weekend ? 'Weekend'
                  : today.checked_out ? `Worked ${hours(today.record?.worked_minutes || 0)}`
                    : today.checked_in ? `In at ${fmtTime(today.record?.check_in || null)}` : 'Not checked in'}
              </p>
            </div>
            {!today.checked_in ? (
              <button onClick={() => dispatch(punchRequest('in'))} disabled={punchLoading}
                className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                <LogIn size={14} /> Check in
              </button>
            ) : !today.checked_out ? (
              <button onClick={() => dispatch(punchRequest('out'))} disabled={punchLoading}
                className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2">
                <LogOut size={14} /> Check out
              </button>
            ) : (
              <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1">
                <Check size={12} /> Done for today
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.filter(t => t.show).map(t => (
          <button key={t.key} onClick={() => setParams({ tab: t.key })}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              tab === t.key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'attendance' && (
        <div className="space-y-3 animate-fade-in-up">
          <div className="flex justify-end">
            <button
              onClick={async () => {
                try {
                  const res = await api.get('/hr/attendance/export.csv', { responseType: 'blob' })
                  const url = URL.createObjectURL(res.data as Blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = 'attendance.csv'; a.click()
                  URL.revokeObjectURL(url)
                } catch { toast.error('Export failed.') }
              }}
              className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-gray-100"
            >
              <Download size={14} /> Export CSV
            </button>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <DataTable columns={attendanceCols} data={attendance} loading={attendanceLoading}
              emptyMessage="No attendance records yet" />
          </div>
        </div>
      )}

      {tab === 'leave' && (
        <div className="space-y-4 animate-fade-in-up">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {balances.map(b => (
              <div key={b.leave_type_id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <p className="text-xs text-gray-400">{b.leave_type_code}</p>
                <p className="text-2xl font-bold text-gray-900">{b.available}</p>
                <p className="text-xs text-gray-500 truncate">{b.leave_type_name}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {b.used} used{b.pending > 0 && ` · ${b.pending} pending`}
                </p>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            {can('leave.request') && (
              <button onClick={() => setShowApply(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-200 transition-all flex items-center gap-2">
                <Plus size={14} /> Apply for leave
              </button>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <DataTable columns={leaveCols(false, true)} data={myRequests} loading={requestsLoading}
              emptyMessage="You have no leave requests" />
          </div>
        </div>
      )}

      {tab === 'approvals' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in-up">
          {!approvalsLoading && !approvals.length ? (
            <div className="p-6">
              <EmptyState variant="default" title="Nothing awaiting you"
                description="Leave requests needing your approval appear here." size="compact" />
            </div>
          ) : (
            <DataTable columns={leaveCols(true, true)} data={approvals} loading={approvalsLoading}
              emptyMessage="Nothing awaiting your approval" />
          )}
        </div>
      )}

      {tab === 'holidays' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in-up">
          <DataTable columns={holidayCols} data={holidays} loading={holidaysLoading}
            emptyMessage="No holidays configured" />
        </div>
      )}

      {showApply && <ApplyLeaveModal onClose={() => setShowApply(false)} />}
    </div>
  )
}
