import React from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

interface Props {
  error: Error
  resetErrorBoundary: () => void
}

/**
 * Full-page fallback — used by the global ErrorBoundary in App.tsx.
 * Shown when the entire app crashes (store corruption, router failure, etc.).
 */
export function GlobalErrorFallback({ error, resetErrorBoundary }: Props) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg border border-red-100 max-w-md w-full p-8 text-center">
        <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={28} className="text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h1>
        <p className="text-sm text-gray-500 mb-4">
          An unexpected error occurred. Your data is safe — try refreshing the page.
        </p>
        <pre className="text-xs text-left bg-red-50 text-red-700 rounded-xl p-3 mb-6 max-h-32 overflow-auto border border-red-100">
          {error.message}
        </pre>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={resetErrorBoundary}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
          >
            <RefreshCw size={14} />
            Try Again
          </button>
          <button
            onClick={() => { window.location.href = '/' }}
            className="flex items-center gap-2 bg-gray-100 text-gray-700 px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors"
          >
            <Home size={14} />
            Go Home
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * In-page fallback — used by the per-route ErrorBoundary in AppLayout.
 * Only the page content area shows the error; sidebar and header remain usable
 * so the user can navigate to a different page.
 */
export function PageErrorFallback({ error, resetErrorBoundary }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-red-100 max-w-lg w-full p-6 text-center">
        <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <AlertTriangle size={22} className="text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">This page crashed</h2>
        <p className="text-sm text-gray-500 mb-3">
          An error occurred while rendering this page. You can try again or navigate to a different page.
        </p>
        <pre className="text-xs text-left bg-red-50 text-red-700 rounded-xl p-3 mb-4 max-h-24 overflow-auto border border-red-100">
          {error.message}
        </pre>
        <button
          onClick={resetErrorBoundary}
          className="flex items-center gap-2 mx-auto bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
        >
          <RefreshCw size={14} />
          Reload Page
        </button>
      </div>
    </div>
  )
}
