import React, { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  User, Lock, Shield, LogOut, Save, Eye, EyeOff,
  CheckCircle2, AlertCircle, Loader2, ChevronRight,
  Palette, Bot, Move, LockKeyhole, LockKeyholeOpen, RotateCcw, MapPin,
} from 'lucide-react'
import { RootState } from '../store'
import { logout } from '../store/slices/authSlice'
import { api } from '../utils/api'
import { CHATBOT_POS_KEY, CHATBOT_LOCK_KEY } from '../components/chatbot/Chatbot'

const ROLE_COLORS: Record<string, string> = {
  ceo:       'from-purple-500 to-violet-600',
  coo:       'from-indigo-500 to-blue-600',
  pm:        'from-blue-500 to-cyan-600',
  team_lead: 'from-teal-500 to-emerald-600',
  employee:  'from-slate-400 to-gray-500',
}
const ROLE_BADGE: Record<string, string> = {
  ceo:       'bg-purple-100 text-purple-700',
  coo:       'bg-indigo-100 text-indigo-700',
  pm:        'bg-blue-100 text-blue-700',
  team_lead: 'bg-teal-100 text-teal-700',
  employee:  'bg-gray-100 text-gray-600',
}

type TabKey = 'profile' | 'password' | 'account' | 'appearance'

export const SettingsPage: React.FC = () => {
  const dispatch = useDispatch()
  const { user } = useSelector((s: RootState) => s.auth)

  const [tab, setTab] = useState<TabKey>('profile')
  const [profileForm, setProfileForm] = useState({ full_name: user?.full_name || '' })
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [showPw, setShowPw] = useState({ current: false, new: false, confirm: false })
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  // ── Appearance / chatbot position ────────────────────────────
  const [posLocked, setPosLocked] = useState(
    () => localStorage.getItem(CHATBOT_LOCK_KEY) === 'true'
  )
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(() => {
    try { const r = localStorage.getItem(CHATBOT_POS_KEY); return r ? JSON.parse(r) : null } catch { return null }
  })

  const toggleLock = () => {
    const next = !posLocked
    setPosLocked(next)
    localStorage.setItem(CHATBOT_LOCK_KEY, String(next))
    window.dispatchEvent(new Event('storage'))
  }

  const resetPos = () => {
    localStorage.removeItem(CHATBOT_POS_KEY)
    setCurrentPos(null)
    window.dispatchEvent(new Event('storage'))
    flash('success', 'AI button position reset to default')
  }

  const presetPos = (x: number, y: number) => {
    const pos = { x, y }
    localStorage.setItem(CHATBOT_POS_KEY, JSON.stringify(pos))
    setCurrentPos(pos)
    window.dispatchEvent(new Event('storage'))
    flash('success', 'AI button moved')
  }

  const role = user?.primary_role || 'employee'
  const roleLabel = (r: string) => r.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())

  const flash = (type: 'success' | 'error', msg: string) => {
    if (type === 'success') { setSuccess(msg); setError('') }
    else { setError(msg); setSuccess('') }
    setTimeout(() => { setSuccess(''); setError('') }, 4000)
  }

  const handleSaveProfile = async () => {
    if (!profileForm.full_name.trim()) return
    setSaving(true)
    try {
      await api.patch('/users/me', profileForm)
      flash('success', 'Profile updated successfully')
    } catch (err: any) {
      flash('error', err?.response?.data?.detail || 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async () => {
    if (!passwordForm.current_password || !passwordForm.new_password) return
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      flash('error', 'New passwords do not match')
      return
    }
    if (passwordForm.new_password.length < 8) {
      flash('error', 'Password must be at least 8 characters')
      return
    }
    setSaving(true)
    try {
      await api.post('/auth/change-password', {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      })
      flash('success', 'Password changed successfully')
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' })
    } catch (err: any) {
      flash('error', err?.response?.data?.detail || 'Failed to change password')
    } finally {
      setSaving(false)
    }
  }

  const tabs: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
    { key: 'profile',    label: 'Profile',    icon: <User size={15} />    },
    { key: 'password',   label: 'Password',   icon: <Lock size={15} />    },
    { key: 'account',    label: 'Account',    icon: <Shield size={15} />  },
    { key: 'appearance', label: 'Appearance', icon: <Palette size={15} /> },
  ]

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your account and preferences</p>
      </div>

      {/* Profile Card */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4 animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
        <div className={`w-16 h-16 bg-gradient-to-br ${ROLE_COLORS[role]} rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-md`}>
          {user?.full_name?.[0]?.toUpperCase()}
        </div>
        <div>
          <p className="font-bold text-gray-900 text-lg leading-tight">{user?.full_name}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${ROLE_BADGE[role]}`}>
              {roleLabel(role)}
            </span>
            {user?.roles && user.roles.length > 1 && user.roles
              .filter(r => r !== role)
              .map(r => (
                <span key={r} className="text-xs px-2 py-0.5 rounded-lg font-medium bg-gray-100 text-gray-600">
                  {roleLabel(r)}
                </span>
              ))}
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl animate-fade-in-up" style={{ animationDelay: '0.10s' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setError(''); setSuccess('') }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
              tab === t.key
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Feedback */}
      {success && (
        <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 text-sm px-4 py-3 rounded-xl border border-emerald-100 animate-scale-in">
          <CheckCircle2 size={15} />
          {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-100 animate-scale-in">
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {/* Profile Tab */}
      {tab === 'profile' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-5 animate-fade-in">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center">
              <User size={15} className="text-blue-600" />
            </div>
            <h2 className="text-base font-semibold text-gray-800">Profile Information</h2>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
            <input
              type="text"
              value={profileForm.full_name}
              onChange={e => setProfileForm({ ...profileForm, full_name: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">User ID</label>
            <input
              type="text"
              value={user?.user_id || ''}
              disabled
              className="w-full border border-gray-100 rounded-xl px-3.5 py-2.5 text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Primary Role</label>
            <input
              type="text"
              value={roleLabel(role)}
              disabled
              className="w-full border border-gray-100 rounded-xl px-3.5 py-2.5 text-sm bg-gray-50 text-gray-400 cursor-not-allowed capitalize"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              onClick={handleSaveProfile}
              disabled={saving || !profileForm.full_name.trim()}
              className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 hover:scale-105 transition-all"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Password Tab */}
      {tab === 'password' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-5 animate-fade-in">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-amber-50 rounded-xl flex items-center justify-center">
              <Lock size={15} className="text-amber-600" />
            </div>
            <h2 className="text-base font-semibold text-gray-800">Change Password</h2>
          </div>

          {[
            { label: 'Current Password', key: 'current_password' as const, show: showPw.current, toggle: () => setShowPw(s => ({ ...s, current: !s.current })) },
            { label: 'New Password',     key: 'new_password'     as const, show: showPw.new,     toggle: () => setShowPw(s => ({ ...s, new: !s.new })) },
            { label: 'Confirm Password', key: 'confirm_password' as const, show: showPw.confirm,  toggle: () => setShowPw(s => ({ ...s, confirm: !s.confirm })) },
          ].map(({ label, key, show, toggle }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  value={passwordForm[key]}
                  onChange={e => setPasswordForm({ ...passwordForm, [key]: e.target.value })}
                  placeholder="••••••••"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all"
                />
                <button
                  type="button"
                  onClick={toggle}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          ))}

          <p className="text-xs text-gray-400">Password must be at least 8 characters long.</p>

          <div className="flex justify-end pt-1">
            <button
              onClick={handleChangePassword}
              disabled={saving || !passwordForm.current_password || !passwordForm.new_password || !passwordForm.confirm_password}
              className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 hover:scale-105 transition-all"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
              {saving ? 'Changing...' : 'Change Password'}
            </button>
          </div>
        </div>
      )}

      {/* Appearance Tab */}
      {tab === 'appearance' && (
        <div className="space-y-4 animate-fade-in">

          {/* AI Button Position Card */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center">
                <Bot size={15} className="text-indigo-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-800">AI Assistant Button</h2>
                <p className="text-xs text-gray-400 mt-0.5">Control where the Work AI button appears on screen</p>
              </div>
            </div>

            {/* Current position readout */}
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 flex items-center gap-3">
              <MapPin size={14} className="text-indigo-500 shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-medium text-gray-700">Current position</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {currentPos
                    ? `X: ${Math.round(currentPos.x)}px · Y: ${Math.round(currentPos.y)}px`
                    : 'Default — bottom right corner'}
                </p>
              </div>
            </div>

            {/* Lock / unlock dragging */}
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                {posLocked
                  ? <LockKeyhole size={16} className="text-amber-500" />
                  : <LockKeyholeOpen size={16} className="text-emerald-500" />
                }
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {posLocked ? 'Position locked' : 'Position unlocked'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {posLocked
                      ? 'Button is fixed — click to allow dragging'
                      : 'Drag the AI button anywhere on screen'}
                  </p>
                </div>
              </div>
              <button
                onClick={toggleLock}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${posLocked ? 'bg-amber-400' : 'bg-emerald-400'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${posLocked ? 'translate-x-0.5' : 'translate-x-5'}`} />
              </button>
            </div>

            {/* Drag hint */}
            {!posLocked && (
              <div className="flex items-start gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
                <Move size={14} className="text-indigo-500 shrink-0 mt-0.5" />
                <p className="text-xs text-indigo-700">
                  Hold and drag the <strong>Work AI</strong> button on the screen to place it anywhere you like. The position is saved automatically.
                </p>
              </div>
            )}

            {/* Quick presets */}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Quick presets</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Top Left',     x: 24,                                y: 24 },
                  { label: 'Top Right',    x: window.innerWidth  - 196,          y: 24 },
                  { label: 'Center Left',  x: 24,                                y: Math.round(window.innerHeight / 2 - 30) },
                  { label: 'Center Right', x: window.innerWidth  - 196,          y: Math.round(window.innerHeight / 2 - 30) },
                  { label: 'Bottom Left',  x: 24,                                y: window.innerHeight - 90 },
                  { label: 'Bottom Right', x: window.innerWidth  - 196,          y: window.innerHeight - 90 },
                ].map(({ label, x, y }) => (
                  <button
                    key={label}
                    onClick={() => presetPos(x, y)}
                    className="py-2 px-3 text-xs font-medium bg-gray-50 border border-gray-200 rounded-xl hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-all text-gray-600"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reset */}
            <div className="flex justify-end pt-1">
              <button
                onClick={resetPos}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-red-600 font-medium border border-gray-200 hover:border-red-200 px-4 py-2 rounded-xl hover:bg-red-50 transition-all"
              >
                <RotateCcw size={13} />
                Reset to default
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Account Tab */}
      {tab === 'account' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-4 animate-fade-in">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gray-100 rounded-xl flex items-center justify-center">
              <Shield size={15} className="text-gray-600" />
            </div>
            <h2 className="text-base font-semibold text-gray-800">Account</h2>
          </div>

          <div className="rounded-xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-semibold text-gray-800">Sign Out</p>
                <p className="text-xs text-gray-400 mt-0.5">End your current session</p>
              </div>
              <button
                onClick={() => dispatch(logout())}
                className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700 font-medium px-4 py-2 rounded-xl border border-red-200 hover:bg-red-50 transition-all hover:scale-105"
              >
                <LogOut size={14} />
                Sign Out
              </button>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Account Details</p>
            </div>
            {[
              ['Full Name',  user?.full_name || '—'],
              ['User ID',    user?.user_id || '—'],
              ['Role',       roleLabel(role)],
              ['All Roles',  user?.roles?.map(r => roleLabel(r)).join(', ') || '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-white transition-colors">
                <span className="text-xs text-gray-500 font-medium">{label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-700 font-semibold">{value}</span>
                  <ChevronRight size={12} className="text-gray-300" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
