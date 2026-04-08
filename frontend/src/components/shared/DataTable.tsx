import React from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { SkeletonTable } from './SkeletonLoader'

/* ── Types ────────────────────────────────────────────────── */

export interface Column<T> {
  key: string
  header: string
  render?: (row: T, index: number) => React.ReactNode
  sortable?: boolean
  className?: string
  headerClassName?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  emptyMessage?: string
  emptyIcon?: React.ReactNode
  sortKey?: string
  sortDir?: 'asc' | 'desc'
  onSort?: (key: string) => void
  onRowClick?: (row: T, index: number) => void
  rowClassName?: string | ((row: T, index: number) => string)
  skeletonRows?: number
}

/* ── Component ────────────────────────────────────────────── */

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  loading = false,
  emptyMessage = 'No data found',
  emptyIcon,
  sortKey,
  sortDir,
  onSort,
  onRowClick,
  rowClassName,
  skeletonRows = 5,
}: DataTableProps<T>) {
  if (loading) return <SkeletonTable rows={skeletonRows} cols={columns.length} />

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        {emptyIcon && <div className="mb-3">{emptyIcon}</div>}
        <p className="text-sm font-medium">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            {columns.map(col => (
              <th
                key={col.key}
                className={`text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider ${
                  col.sortable ? 'cursor-pointer select-none hover:text-gray-700 transition-colors' : ''
                } ${col.headerClassName || ''}`}
                onClick={col.sortable && onSort ? () => onSort(col.key) : undefined}
              >
                <span className="flex items-center gap-1.5">
                  {col.header}
                  {col.sortable && (
                    <SortIcon active={sortKey === col.key} dir={sortKey === col.key ? sortDir : undefined} />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {data.map((row, i) => {
            const cls = typeof rowClassName === 'function' ? rowClassName(row, i) : rowClassName || ''
            return (
              <tr
                key={(row as any).id ?? i}
                onClick={onRowClick ? () => onRowClick(row, i) : undefined}
                className={`transition-colors hover:bg-gray-50 ${onRowClick ? 'cursor-pointer' : ''} ${cls}`}
              >
                {columns.map(col => (
                  <td key={col.key} className={`py-3 px-4 ${col.className || ''}`}>
                    {col.render ? col.render(row, i) : row[col.key]}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ── Sort icon ────────────────────────────────────────────── */

function SortIcon({ active, dir }: { active: boolean; dir?: 'asc' | 'desc' }) {
  if (!active) return <ChevronsUpDown size={12} className="text-gray-300" />
  if (dir === 'asc') return <ChevronUp size={12} className="text-blue-600" />
  return <ChevronDown size={12} className="text-blue-600" />
}
