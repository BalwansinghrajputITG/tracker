import React from 'react'
import { AlertTriangle, Trash2, Loader2 } from 'lucide-react'
import { Modal } from '../common/Modal'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title?: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'info'
  loading?: boolean
}

const VARIANT_CFG = {
  danger:  { icon: 'bg-red-50',    iconColor: 'text-red-500',    btn: 'bg-red-600 hover:bg-red-700 shadow-red-200' },
  warning: { icon: 'bg-amber-50',  iconColor: 'text-amber-500',  btn: 'bg-amber-600 hover:bg-amber-700 shadow-amber-200' },
  info:    { icon: 'bg-blue-50',   iconColor: 'text-blue-500',   btn: 'bg-blue-600 hover:bg-blue-700 shadow-blue-200' },
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
}: ConfirmDialogProps) {
  if (!open) return null

  const cfg = VARIANT_CFG[variant]

  return (
    <Modal onClose={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-scale-in p-6">
        <div className="flex flex-col items-center text-center">
          <div className={`w-12 h-12 ${cfg.icon} rounded-2xl flex items-center justify-center mb-4`}>
            {variant === 'danger'
              ? <Trash2 size={22} className={cfg.iconColor} />
              : <AlertTriangle size={22} className={cfg.iconColor} />}
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">{title}</h3>
          <p className="text-sm text-gray-500 mb-6 max-w-xs">{message}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors shadow-sm disabled:opacity-50 ${cfg.btn}`}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
