import React, { useEffect } from 'react'
import ReactDOM from 'react-dom'

interface ModalProps {
  onClose: () => void
  children: React.ReactNode
}

/**
 * Renders children into document.body via a React Portal.
 * This bypasses any parent overflow/transform/stacking-context
 * issues so the modal always covers the full viewport.
 */
export const Modal: React.FC<ModalProps> = ({ onClose, children }) => {
  // Close on Escape key + lock body scroll while open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-fade-in"
      onClick={onClose}
    >
      {/* stopPropagation so clicks inside the dialog don't close it */}
      <div onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  )
}
