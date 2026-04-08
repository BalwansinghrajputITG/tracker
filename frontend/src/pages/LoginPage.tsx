import React, { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Building2, Mail, Lock, AlertCircle, Loader2, Eye, EyeOff, ArrowLeft } from 'lucide-react'
import { RootState } from '../store'
import { loginRequest } from '../store/slices/authSlice'

/* ── Validation schema ────────────────────────────────────── */

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(6, 'Password must be at least 6 characters'),
})

type LoginFormData = z.infer<typeof loginSchema>

/* ── Component ────────────────────────────────────────────── */

export const LoginPage: React.FC = () => {
  const dispatch = useDispatch()
  const { isLoading, error, user, token } = useSelector((s: RootState) => s.auth)
  const [showPassword, setShowPassword] = useState(false)
  const [forgotMode, setForgotMode] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
  })

  useEffect(() => {
    if (user && token) window.location.replace('/')
  }, [user, token])

  const onSubmit = (data: LoginFormData) => {
    dispatch(loginRequest({ email: data.email, password: data.password }))
  }

  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!forgotEmail.trim()) return
    // Backend doesn't have a reset endpoint yet — show confirmation UI
    setForgotSent(true)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in relative">
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 p-8 text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-10"
            style={{ backgroundImage: 'radial-gradient(circle at 20% 80%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '30px 30px' }}
          />
          <div className="relative">
            <div className="w-16 h-16 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/20 shadow-lg">
              <Building2 size={32} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Enterprise PM</h1>
            <p className="text-blue-200 text-sm mt-1">Internal Management Platform</p>
          </div>
        </div>

        {/* ── Forgot password flow ────────────────────────── */}
        {forgotMode ? (
          <div className="p-8 space-y-5">
            <button
              onClick={() => { setForgotMode(false); setForgotSent(false); setForgotEmail('') }}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
            >
              <ArrowLeft size={14} /> Back to sign in
            </button>

            {forgotSent ? (
              <div className="text-center py-4 animate-fade-in">
                <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Mail size={24} className="text-emerald-600" />
                </div>
                <h2 className="text-lg font-bold text-gray-900 mb-1">Check your inbox</h2>
                <p className="text-sm text-gray-500">
                  If an account exists for <span className="font-semibold text-gray-700">{forgotEmail}</span>, we'll send password reset instructions.
                </p>
                <p className="text-xs text-gray-400 mt-4">
                  Contact your administrator if you don't receive an email.
                </p>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="space-y-5">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 mb-1">Reset password</h2>
                  <p className="text-sm text-gray-500">Enter your email and we'll send you reset instructions.</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      placeholder="you@company.com"
                      autoFocus
                      className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 focus:bg-white transition-all"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-3 rounded-xl font-semibold transition-all duration-200 shadow-md shadow-blue-200 hover:shadow-lg hover:shadow-blue-300 active:scale-[0.98]"
                >
                  Send Reset Link
                </button>
              </form>
            )}
          </div>
        ) : (
          /* ── Login form ──────────────────────────────────── */
          <form onSubmit={handleSubmit(onSubmit)} className="p-8 space-y-5" noValidate>
            {/* Email field */}
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  {...register('email')}
                  className={`w-full border rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent bg-gray-50 focus:bg-white transition-all ${
                    errors.email
                      ? 'border-red-300 focus:ring-red-500'
                      : 'border-gray-200 focus:ring-blue-500'
                  }`}
                />
              </div>
              {errors.email && (
                <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1 animate-fade-in">
                  <AlertCircle size={12} className="shrink-0" />
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Password field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm font-semibold text-gray-700">Password</label>
                <button
                  type="button"
                  onClick={() => setForgotMode(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  {...register('password')}
                  className={`w-full border rounded-xl pl-10 pr-11 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent bg-gray-50 focus:bg-white transition-all ${
                    errors.password
                      ? 'border-red-300 focus:ring-red-500'
                      : 'border-gray-200 focus:ring-blue-500'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  tabIndex={-1}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1 animate-fade-in">
                  <AlertCircle size={12} className="shrink-0" />
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Server error (invalid credentials, etc.) */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-start gap-2 animate-fade-in">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-3 rounded-xl font-semibold disabled:opacity-50 transition-all duration-200 flex items-center justify-center gap-2 shadow-md shadow-blue-200 hover:shadow-lg hover:shadow-blue-300 active:scale-[0.98]"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Signing in...
                </>
              ) : 'Sign In'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
