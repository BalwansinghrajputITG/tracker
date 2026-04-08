import React from 'react'

interface SkeletonProps {
  className?: string
}

/** Single skeleton bar — pass width/height via className */
export function Skeleton({ className = 'h-4 w-full' }: SkeletonProps) {
  return <div className={`animate-pulse rounded-xl bg-gray-200 ${className}`} />
}

/** Card-shaped skeleton with header + body lines */
export function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gray-200" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 bg-gray-200 rounded-lg w-2/3" />
          <div className="h-3 bg-gray-200 rounded-lg w-1/3" />
        </div>
      </div>
      <div className="h-3 bg-gray-200 rounded-lg w-full" />
      <div className="h-3 bg-gray-200 rounded-lg w-4/5" />
    </div>
  )
}

/** Table skeleton with header row + N body rows */
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-10 bg-gray-100 rounded-xl" />
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 h-14 px-4">
          {[...Array(cols)].map((_, j) => (
            <div key={j} className="flex-1 h-3.5 bg-gray-200 rounded-lg" style={{ maxWidth: j === 0 ? '40%' : '20%' }} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Grid of skeleton cards */
export function SkeletonGrid({ count = 6, cols = 3 }: { count?: number; cols?: number }) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-${cols} gap-4`}>
      {[...Array(count)].map((_, i) => <SkeletonCard key={i} />)}
    </div>
  )
}

/** List of skeleton rows */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-10 bg-gray-100 rounded-xl" />
      {[...Array(rows)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl" />)}
    </div>
  )
}
