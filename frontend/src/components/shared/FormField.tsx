import React from 'react'
import { AlertCircle } from 'lucide-react'
import { FieldError } from 'react-hook-form'

/* ── FormField ────────────────────────────────────────────── */

interface FormFieldProps {
  label: string
  htmlFor?: string
  error?: FieldError
  required?: boolean
  hint?: string
  children: React.ReactNode
  className?: string
}

export function FormField({ label, htmlFor, error, required, hint, children, className = '' }: FormFieldProps) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-gray-700 mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && (
        <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1 animate-fade-in">
          <AlertCircle size={12} className="shrink-0" />
          {error.message}
        </p>
      )}
      {hint && !error && (
        <p className="mt-1 text-xs text-gray-400">{hint}</p>
      )}
    </div>
  )
}

/* ── Input ─────────────────────────────────────────────────── */

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode
  hasError?: boolean
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ icon, hasError, className = '', ...props }, ref) => {
    return (
      <div className="relative">
        {icon && (
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          className={`w-full border rounded-xl ${icon ? 'pl-10' : 'pl-4'} pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent bg-gray-50 focus:bg-white transition-all ${
            hasError
              ? 'border-red-300 focus:ring-red-500'
              : 'border-gray-200 focus:ring-blue-500'
          } ${className}`}
          {...props}
        />
      </div>
    )
  }
)
Input.displayName = 'Input'

/* ── Select ────────────────────────────────────────────────── */

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ hasError, className = '', children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent bg-gray-50 focus:bg-white transition-all ${
          hasError
            ? 'border-red-300 focus:ring-red-500'
            : 'border-gray-200 focus:ring-blue-500'
        } ${className}`}
        {...props}
      >
        {children}
      </select>
    )
  }
)
Select.displayName = 'Select'

/* ── Textarea ──────────────────────────────────────────────── */

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ hasError, className = '', ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent bg-gray-50 focus:bg-white transition-all resize-none ${
          hasError
            ? 'border-red-300 focus:ring-red-500'
            : 'border-gray-200 focus:ring-blue-500'
        } ${className}`}
        {...props}
      />
    )
  }
)
Textarea.displayName = 'Textarea'
