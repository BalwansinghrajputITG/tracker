import React, { useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import { RootState } from '../../store'
import gsap from 'gsap'

export const CursorEffect: React.FC = () => {
  const cursor = useSelector((s: RootState) => s.theme?.cursor || 'default')
  const dotRef  = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const hoverRef = useRef(false)

  useEffect(() => {
    if (cursor === 'default') {
      document.documentElement.classList.remove('cursor-active')
      return
    }

    document.documentElement.classList.add('cursor-active')

    const dotEl  = dotRef.current
    const ringEl = ringRef.current
    if (!dotEl || !ringEl) return

    // GSAP quickTo — ultra-smooth cursor follow with different latencies
    const xDot  = gsap.quickTo(dotEl,  'x', { duration: 0.08, ease: 'power3.out' })
    const yDot  = gsap.quickTo(dotEl,  'y', { duration: 0.08, ease: 'power3.out' })
    const xRing = gsap.quickTo(ringEl, 'x', { duration: 0.40, ease: 'power2.out' })
    const yRing = gsap.quickTo(ringEl, 'y', { duration: 0.40, ease: 'power2.out' })

    // Set initial position off-screen
    gsap.set([dotEl, ringEl], { x: -300, y: -300, xPercent: -50, yPercent: -50 })

    const onMove = (e: MouseEvent) => {
      xDot(e.clientX); yDot(e.clientY)
      xRing(e.clientX); yRing(e.clientY)
    }

    const onDown = () => {
      gsap.to(dotEl,  { scale: 0.45, duration: 0.12 })
      gsap.to(ringEl, { scale: 0.75, duration: 0.12 })
    }

    const onUp = () => {
      gsap.to(dotEl,  { scale: 1, duration: 0.55, ease: 'elastic.out(1.8, 0.5)' })
      gsap.to(ringEl, { scale: 1, duration: 0.55, ease: 'elastic.out(1.5, 0.5)' })
    }

    const onOver = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('button') || t.closest('a') || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') {
        if (!hoverRef.current) {
          hoverRef.current = true
          gsap.to(ringEl, { scale: 1.6, duration: 0.25, ease: 'power2.out' })
        }
      }
    }

    const onOut = (e: MouseEvent) => {
      const t = e.relatedTarget as HTMLElement | null
      if (!t || (!t.closest('button') && !t.closest('a') && t.tagName !== 'INPUT')) {
        if (hoverRef.current) {
          hoverRef.current = false
          gsap.to(ringEl, { scale: 1, duration: 0.3, ease: 'power2.out' })
        }
      }
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup',   onUp)
    window.addEventListener('mouseover', onOver)
    window.addEventListener('mouseout',  onOut)

    return () => {
      document.documentElement.classList.remove('cursor-active')
      gsap.killTweensOf([dotEl, ringEl])
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup',   onUp)
      window.removeEventListener('mouseover', onOver)
      window.removeEventListener('mouseout',  onOut)
    }
  }, [cursor])

  if (cursor === 'default') return null

  return (
    <>
      <div ref={dotRef}  className={`cursor-dot  cursor-${cursor}`} />
      <div ref={ringRef} className={`cursor-ring cursor-ring-${cursor}`} />
    </>
  )
}
