import React from 'react'
import { Loader2 } from 'lucide-react'

interface Props {
  size?: number
  className?: string
  text?: string
}

export function LoadingSpinner({ size = 20, className = '', text }: Props) {
  return (
    <div className={`flex items-center justify-center gap-2 ${className}`}>
      <Loader2 size={size} className="animate-spin text-blue-500" />
      {text && <span className="text-sm text-gray-500">{text}</span>}
    </div>
  )
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={28} className="animate-spin text-blue-500" />
    </div>
  )
}
