import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { Search, Lock, Building2, Filter } from 'lucide-react'
import { RootState } from '../../store'
import { fetchEmployeesRequest, Employee } from '../../store/slices/hrEmployeesSlice'
import { fetchHrDepartmentsRequest, fetchDesignationsRequest } from '../../store/slices/hrOrgSlice'
import { usePermissions } from '../../hooks/usePermissions'
import { Avatar, DataTable, Column, StatusBadge } from '../../components/shared'
import { Pagination } from '../../components/common/Pagination'

const EMPLOYMENT_STATUSES = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'probation', label: 'Probation' },
  { value: 'notice_period', label: 'Notice period' },
  { value: 'resigned', label: 'Resigned' },
  { value: 'terminated', label: 'Terminated' },
  { value: 'on_leave', label: 'On leave' },
]

const WORK_MODE_LABELS: Record<string, string> = {
  onsite: 'On-site', remote: 'Remote', hybrid: 'Hybrid',
}

export const HrEmployeesPage: React.FC = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { can } = usePermissions()
  const { items, total, page, limit, isLoading, error } =
    useSelector((s: RootState) => s.hrEmployees)
  const { departments } = useSelector((s: RootState) => s.hrOrg)

  const [search, setSearch] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [status, setStatus] = useState('')

  // Server-side filtering, so debounce rather than firing per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      dispatch(fetchEmployeesRequest({
        search: search || undefined,
        department_id: departmentId || undefined,
        employment_status: status || undefined,
        page: 1,
      }))
    }, 300)
    return () => clearTimeout(t)
  }, [search, departmentId, status, dispatch])

  useEffect(() => {
    dispatch(fetchHrDepartmentsRequest())
    dispatch(fetchDesignationsRequest())
  }, [dispatch])

  // The in-page guard is the house convention (AnalyticsPage.tsx:15-27) — there
  // is no route-level protection. The server enforces this regardless.
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

  const columns: Column<Employee>[] = [
    {
      key: 'full_name',
      header: 'Employee',
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={row.full_name} src={row.avatar_url} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{row.full_name}</p>
            <p className="text-xs text-gray-500 truncate">{row.employee_code}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'designation_title',
      header: 'Designation',
      render: (row) => (
        <div className="min-w-0">
          <p className="text-sm text-gray-700 truncate">{row.designation_title || '—'}</p>
          <p className="text-xs text-gray-400 truncate">{row.department_name || '—'}</p>
        </div>
      ),
    },
    {
      key: 'manager_name',
      header: 'Reports to',
      render: (row) => (
        <span className="text-sm text-gray-600">{row.manager_name || '—'}</span>
      ),
    },
    {
      key: 'work_mode',
      header: 'Work mode',
      render: (row) => (
        <span className="text-sm text-gray-600">
          {WORK_MODE_LABELS[row.work_mode] || row.work_mode}
        </span>
      ),
    },
    {
      key: 'employment_status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.employment_status} />,
    },
  ]

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {total} {total === 1 ? 'record' : 'records'} you can access
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3 items-center animate-fade-in-up">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email or employee code…"
            className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all"
          />
        </div>
        <div className="relative">
          <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <select
            value={departmentId}
            onChange={e => setDepartmentId(e.target.value)}
            className="border border-gray-200 rounded-xl pl-9 pr-8 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all"
          >
            <option value="">All departments</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div className="relative">
          <Filter size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="border border-gray-200 rounded-xl pl-9 pr-8 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all"
          >
            {EMPLOYMENT_STATUSES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in-up" style={{ animationDelay: '0.04s' }}>
        <DataTable
          columns={columns}
          data={items}
          loading={isLoading}
          emptyMessage="No employees match these filters"
          onRowClick={(row) => navigate(`/hr/employees/${row.id}`)}
          rowClassName="cursor-pointer"
        />
      </div>

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={(p) => dispatch(fetchEmployeesRequest({ page: p }))}
        />
      )}
    </div>
  )
}
