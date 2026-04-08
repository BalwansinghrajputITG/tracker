import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { api } from '../utils/api'

/**
 * Handles the Basecamp OAuth 2 redirect.
 *
 * When opened as a popup (window.opener exists):
 *   - Exchanges the code with the backend
 *   - Posts a message to the parent window with the result
 *   - Closes itself — the user never leaves the main app
 *
 * When opened as a full page (popup blocked fallback):
 *   - Same exchange, then navigates to /basecamp
 */
export const BasecampCallbackPage: React.FC = () => {
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('Connecting your Basecamp account…')
  const isPopup = Boolean(window.opener && window.opener !== window)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code  = params.get('code')
    const error = params.get('error')

    const finish = (success: boolean, payload: Record<string, unknown>) => {
      if (isPopup) {
        window.opener.postMessage(
          { type: 'basecamp_oauth', success, ...payload },
          window.location.origin,
        )
        // Small delay so the success state renders before the popup closes
        setTimeout(() => window.close(), 1200)
      } else {
        setTimeout(() => navigate('/basecamp'), success ? 1500 : 3000)
      }
    }

    if (error) {
      setStatus('error')
      setMessage('Basecamp authorization was denied.')
      finish(false, { error: 'Authorization denied.' })
      return
    }

    if (!code) {
      setStatus('error')
      setMessage('No authorization code received.')
      finish(false, { error: 'No authorization code received.' })
      return
    }

    api.post('/basecamp/auth/callback', { code })
      .then(res => {
        setStatus('success')
        setMessage(`Connected to ${res.data.account_name || 'Basecamp'}!`)
        finish(true, {
          account_id:   res.data.account_id,
          account_name: res.data.account_name,
          identity:     res.data.identity,
        })
      })
      .catch(err => {
        const msg = err?.response?.data?.detail || 'Failed to connect Basecamp.'
        setStatus('error')
        setMessage(msg)
        finish(false, { error: msg })
      })
  }, [navigate, isPopup])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-green-950 to-teal-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center animate-scale-in">
        <div
          className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #1db954, #0a9a45)' }}
        >
          {status === 'loading' && <Loader2 size={28} className="text-white animate-spin" />}
          {status === 'success' && <CheckCircle2 size={28} className="text-white" />}
          {status === 'error'   && <AlertCircle  size={28} className="text-white" />}
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">
          {status === 'loading' ? 'Connecting…' : status === 'success' ? 'Connected!' : 'Connection Failed'}
        </h2>
        <p className="text-sm text-gray-500">{message}</p>
        {status !== 'loading' && (
          <p className="text-xs text-gray-400 mt-3">
            {isPopup ? 'This window will close automatically…' : 'Redirecting you back…'}
          </p>
        )}
      </div>
    </div>
  )
}
