import React from 'react'

interface PerformanceRingProps {
  score: number
  color: string
}

export const PerformanceRing: React.FC<PerformanceRingProps> = ({ score, color }) => {
  const r = 26
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const ringColor =
    color === 'green' ? '#10b981' :
    color === 'amber' ? '#f59e0b' :
    color === 'red'   ? '#ef4444' :
    '#3b82f6'

  return (
    <div className="relative w-[68px] h-[68px] flex items-center justify-center shrink-0">
      <svg width="68" height="68" className="-rotate-90">
        <circle cx="34" cy="34" r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="5" />
        <circle
          cx="34" cy="34" r={r} fill="none" stroke={ringColor} strokeWidth="5"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{
            transition: 'stroke-dasharray 1.2s cubic-bezier(.4,0,.2,1)',
            filter: `drop-shadow(0 0 4px ${ringColor}80)`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-white text-base font-bold leading-none">{score}</span>
        <span className="text-white/60 text-[9px] font-medium">score</span>
      </div>
    </div>
  )
}
