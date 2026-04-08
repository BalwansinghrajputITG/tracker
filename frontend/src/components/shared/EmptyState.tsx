import React from 'react'
import { Search } from 'lucide-react'

interface Props {
  icon?: React.ReactNode
  title?: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({
  icon = <Search size={24} className="text-gray-300" />,
  title = 'Nothing here',
  description,
  action,
  className = '',
}: Props) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 text-center ${className}`}>
      <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
        {icon}
      </div>
      <p className="text-sm font-semibold text-gray-600">{title}</p>
      {description && <p className="text-xs text-gray-400 mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
