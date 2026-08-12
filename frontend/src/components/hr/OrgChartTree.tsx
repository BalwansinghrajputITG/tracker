import React, { useState } from 'react'
import { ChevronDown, ChevronRight, Users } from 'lucide-react'
import { Avatar, EmptyState } from '../shared'
import { OrgNode } from '../../store/slices/hrOrgSlice'

/**
 * Reporting hierarchy (docs/hr.md §5).
 *
 * Rendered as an indented, collapsible tree rather than the classic boxes-and-
 * connectors chart: an org chart is a *deep* structure, and a horizontal layout
 * either overflows the viewport or shrinks names to illegibility past ~3 levels.
 * Indentation degrades gracefully to any depth and stays readable on mobile.
 */

interface NodeProps {
  node: OrgNode
  depth: number
  onSelect?: (node: OrgNode) => void
}

const OrgNodeRow: React.FC<NodeProps> = ({ node, depth, onSelect }) => {
  // Collapse below the third level so a large org opens to a readable overview
  // instead of a wall of names.
  const [open, setOpen] = useState(depth < 2)
  const hasReports = node.reports.length > 0

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 group"
        style={{ paddingLeft: `${depth * 24}px` }}
      >
        {hasReports ? (
          <button
            onClick={() => setOpen(o => !o)}
            className="w-5 h-5 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors shrink-0"
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}

        <button
          onClick={() => onSelect?.(node)}
          className="flex items-center gap-2.5 flex-1 min-w-0 text-left px-2.5 py-1.5 rounded-xl hover:bg-blue-50 transition-colors"
        >
          <Avatar name={node.full_name} src={node.avatar_url} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-gray-900 truncate">
              {node.full_name}
            </span>
            <span className="block text-xs text-gray-500 truncate">
              {node.designation_title || '—'}
              {node.department_name && ` · ${node.department_name}`}
            </span>
          </span>
          {hasReports && (
            <span className="text-xs text-gray-400 shrink-0 flex items-center gap-1">
              <Users size={11} />
              {node.reports.length}
            </span>
          )}
        </button>
      </div>

      {open && hasReports && (
        <div className="border-l border-gray-100" style={{ marginLeft: `${depth * 24 + 10}px` }}>
          {node.reports.map(child => (
            <div key={child.user_id} style={{ marginLeft: '-' + (depth * 24 + 10) + 'px' }}>
              <OrgNodeRow node={child} depth={depth + 1} onSelect={onSelect} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface OrgChartTreeProps {
  roots: OrgNode[]
  total: number
  orphaned: number
  loading?: boolean
  onSelect?: (node: OrgNode) => void
}

export const OrgChartTree: React.FC<OrgChartTreeProps> = ({
  roots, total, orphaned, loading, onSelect,
}) => {
  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="h-10 skeleton rounded-xl" style={{ marginLeft: `${(i % 3) * 24}px` }} />
        ))}
      </div>
    )
  }

  if (!roots.length) {
    return (
      <EmptyState
        variant="default"
        title="No reporting structure yet"
        description="Set a manager on employee records to build the org chart."
      />
    )
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 text-xs text-gray-500">
        <span>{total} people</span>
        {roots.length > 1 && <span>· {roots.length} top-level</span>}
        {/* Surfaced rather than hidden: an orphan means a reporting cycle or a
            manager outside the tree, and silently dropping them would make the
            headcount here disagree with the directory. */}
        {orphaned > 0 && (
          <span className="text-amber-600">
            · {orphaned} unlinked (check their reporting line)
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        {roots.map(root => (
          <OrgNodeRow key={root.user_id} node={root} depth={0} onSelect={onSelect} />
        ))}
      </div>
    </div>
  )
}
