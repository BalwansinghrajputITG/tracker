import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  TrendingUp, TrendingDown, MousePointer, DollarSign,
  Users, Globe, Search, GitCommit, AlertTriangle,
  CheckCircle2, Info, Bell, BellOff, RefreshCw,
  BarChart2, Activity, Target, Zap, ExternalLink,
  ChevronUp, ChevronDown, Minus,
} from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts'
import { RootState } from '../store'
import {
  fetchDashboardRequest, setPeriod, setActiveTab, markAlertsRead,
} from '../store/slices/digitalMarketingSlice'
import { api } from '../utils/api'
import { useToast } from '../components/shared'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000   ? `${(n / 1_000).toFixed(1)}K`
  : String(n)

const fmtCurrency = (n: number) =>
  n >= 1_000 ? `$${(n / 1_000).toFixed(1)}K` : `$${n.toFixed(0)}`

const fmtDate = (d: string, days: number) => {
  const dt = new Date(d)
  if (days <= 7)  return dt.toLocaleDateString([], { weekday: 'short' })
  if (days <= 30) return dt.toLocaleDateString([], { month: 'short', day: 'numeric' })
  return dt.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const SEVERITY_STYLES: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  info:     { bg: 'bg-blue-50 border-blue-100',   text: 'text-blue-700',   icon: <Info size={14} className="text-blue-500" /> },
  warning:  { bg: 'bg-amber-50 border-amber-100', text: 'text-amber-700',  icon: <AlertTriangle size={14} className="text-amber-500" /> },
  critical: { bg: 'bg-red-50 border-red-100',     text: 'text-red-700',    icon: <AlertTriangle size={14} className="text-red-500" /> },
}

const PLATFORM_COLORS = { google: '#4285F4', meta: '#1877F2' }

// ─── Sub-components ───────────────────────────────────────────────────────────

const KpiCard: React.FC<{
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  iconBg: string
  trend?: number
  delay?: number
}> = ({ label, value, sub, icon, iconBg, trend, delay = 0 }) => (
  <div
    className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 animate-fade-in-up"
    style={{ animationDelay: `${delay}s` }}
  >
    <div className="flex items-start justify-between">
      <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      {trend !== undefined && (
        <span className={`flex items-center gap-0.5 text-xs font-semibold px-2 py-1 rounded-lg ${
          trend > 0 ? 'bg-emerald-50 text-emerald-600' :
          trend < 0 ? 'bg-red-50 text-red-600' :
          'bg-gray-50 text-gray-500'
        }`}>
          {trend > 0 ? <ChevronUp size={11} /> : trend < 0 ? <ChevronDown size={11} /> : <Minus size={11} />}
          {Math.abs(trend)}%
        </span>
      )}
    </div>
    <p className="text-2xl font-bold text-gray-900 mt-3 leading-tight">{value}</p>
    <p className="text-xs font-medium text-gray-500 mt-1">{label}</p>
    {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
  </div>
)

const SectionHeader: React.FC<{ title: string; sub?: string; icon: React.ReactNode }> = ({ title, sub, icon }) => (
  <div className="flex items-center gap-3 mb-5">
    <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center">
      {icon}
    </div>
    <div>
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  </div>
)

const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2.5 text-xs">
      <p className="font-semibold text-gray-700 mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 py-0.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-gray-500 capitalize">{p.name}:</span>
          <span className="font-semibold text-gray-800">{typeof p.value === 'number' && p.value > 1000 ? fmt(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

const OverviewTab: React.FC<{ data: any; period: number }> = ({ data, period }) => {
  const { overview, traffic_trend, traffic_sources } = data

  const trendData = traffic_trend.map((d: any) => ({
    ...d,
    date: fmtDate(d.date, period),
  }))

  return (
    <div className="space-y-6">
      {/* KPI Row 1 — Traffic */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Traffic Overview</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Total Traffic"    value={fmt(overview.total_traffic)}    sub={`${period}d period`} icon={<Globe size={18} className="text-indigo-600" />}   iconBg="bg-indigo-50"  trend={12}  delay={0}    />
          <KpiCard label="Organic Traffic"  value={fmt(overview.organic_traffic)}  sub="From search engines" icon={<Search size={18} className="text-emerald-600" />} iconBg="bg-emerald-50" trend={8}   delay={0.04} />
          <KpiCard label="Paid Traffic"     value={fmt(overview.paid_traffic)}     sub="Google & Meta Ads"   icon={<Target size={18} className="text-blue-600" />}    iconBg="bg-blue-50"    trend={5}   delay={0.08} />
          <KpiCard label="Social Traffic"   value={fmt(overview.social_traffic)}   sub="All social platforms" icon={<Users size={18} className="text-purple-600" />}  iconBg="bg-purple-50"  trend={-3}  delay={0.12} />
        </div>
      </div>

      {/* KPI Row 2 — Conversions */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Conversions & ROI</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Total Leads"   value={fmt(overview.total_leads)}   sub="Qualified leads"    icon={<Zap size={18} className="text-amber-600" />}    iconBg="bg-amber-50"   trend={15}  delay={0.16} />
          <KpiCard label="Conversions"   value={fmt(overview.conversions)}   sub="Completed actions"  icon={<CheckCircle2 size={18} className="text-teal-600" />} iconBg="bg-teal-50" trend={9}   delay={0.20} />
          <KpiCard label="Cost Per Lead" value={`$${overview.cpl}`}          sub="Avg. across all ads" icon={<DollarSign size={18} className="text-rose-600" />}  iconBg="bg-rose-50"    trend={-4}  delay={0.24} />
          <KpiCard label="ROAS"          value={`${overview.roas}x`}         sub="Return on ad spend" icon={<TrendingUp size={18} className="text-green-600" />}  iconBg="bg-green-50"   trend={7}   delay={0.28} />
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Traffic Trend — area chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-5 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <SectionHeader title="Traffic Trend" sub={`Last ${period} days by source`} icon={<Activity size={16} className="text-indigo-600" />} />
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                {[
                  { id: 'organic', color: '#6264A7' },
                  { id: 'paid',    color: '#0078D4' },
                  { id: 'social',  color: '#C239B3' },
                  { id: 'direct',  color: '#038387' },
                ].map(({ id, color }) => (
                  <linearGradient key={id} id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={color} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={color} stopOpacity={0}   />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={fmt} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Area type="monotone" dataKey="organic" stroke="#6264A7" fill="url(#grad-organic)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="paid"    stroke="#0078D4" fill="url(#grad-paid)"    strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="social"  stroke="#C239B3" fill="url(#grad-social)"  strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="direct"  stroke="#038387" fill="url(#grad-direct)"  strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Traffic Sources — donut */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 animate-fade-in-up" style={{ animationDelay: '0.12s' }}>
          <SectionHeader title="Traffic Sources" sub="Breakdown by channel" icon={<BarChart2 size={16} className="text-indigo-600" />} />
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={traffic_sources}
                cx="50%" cy="50%"
                innerRadius={50} outerRadius={72}
                paddingAngle={3}
                dataKey="value"
                strokeWidth={0}
              >
                {traffic_sources.map((entry: any) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any) => fmt(v)} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #f0f0f0' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {traffic_sources.map((s: any) => (
              <div key={s.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-xs text-gray-600">{s.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-800">{fmt(s.value)}</span>
                  <span className="text-xs text-gray-400">{Math.round(s.value / overview.total_traffic * 100)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Engagement KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Bounce Rate',          value: `${overview.bounce_rate}%`,          icon: <TrendingDown size={16} className="text-orange-500" />, bg: 'bg-orange-50' },
          { label: 'Avg. Session Duration', value: overview.avg_session_duration,       icon: <Activity size={16} className="text-blue-500" />,     bg: 'bg-blue-50' },
          { label: 'Pages / Session',       value: String(overview.pages_per_session),  icon: <Globe size={16} className="text-teal-500" />,        bg: 'bg-teal-50' },
        ].map(({ label, value, icon, bg }, i) => (
          <div key={label} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-4 animate-fade-in-up" style={{ animationDelay: `${i * 0.04}s` }}>
            <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center shrink-0`}>{icon}</div>
            <div>
              <p className="text-lg font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Tab: Ads ─────────────────────────────────────────────────────────────────

const AdsTab: React.FC<{ data: any; period: number }> = ({ data, period }) => {
  const { ads, campaigns } = data

  const comparisonData = [
    { metric: 'Spend',       google: ads.google.spend,       meta: ads.meta.spend       },
    { metric: 'Clicks',      google: ads.google.clicks,      meta: ads.meta.clicks      },
    { metric: 'Conversions', google: ads.google.conversions, meta: ads.meta.conversions },
  ]

  const STATUS_COLORS: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700',
    paused: 'bg-amber-100 text-amber-700',
    ended:  'bg-gray-100 text-gray-600',
  }

  return (
    <div className="space-y-6">
      {/* Platform KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Google Ads */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 animate-fade-in-up">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <span className="text-base font-black" style={{ color: '#4285F4' }}>G</span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Google Ads</h3>
              <p className="text-xs text-gray-500">Search & Display campaigns</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Spend',       value: fmtCurrency(ads.google.spend) },
              { label: 'Clicks',      value: fmt(ads.google.clicks) },
              { label: 'Conversions', value: String(ads.google.conversions) },
              { label: 'CTR',         value: `${ads.google.ctr}%` },
              { label: 'Avg. CPC',    value: `$${ads.google.cpc}` },
              { label: 'ROAS',        value: `${ads.google.roas}x` },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-xl p-3">
                <p className="text-base font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Meta Ads */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 animate-fade-in-up" style={{ animationDelay: '0.04s' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#1877F2' }}>
              <span className="text-base font-black text-white">f</span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Meta Ads</h3>
              <p className="text-xs text-gray-500">Facebook & Instagram</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Spend',       value: fmtCurrency(ads.meta.spend) },
              { label: 'Clicks',      value: fmt(ads.meta.clicks) },
              { label: 'Conversions', value: String(ads.meta.conversions) },
              { label: 'CTR',         value: `${ads.meta.ctr}%` },
              { label: 'Avg. CPC',    value: `$${ads.meta.cpc}` },
              { label: 'ROAS',        value: `${ads.meta.roas}x` },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-xl p-3">
                <p className="text-base font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Platform Comparison Chart */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 animate-fade-in-up" style={{ animationDelay: '0.08s' }}>
        <SectionHeader title="Platform Comparison" sub="Google Ads vs Meta Ads" icon={<BarChart2 size={16} className="text-indigo-600" />} />
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={comparisonData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="metric" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={fmt} />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Bar dataKey="google" name="Google Ads" fill="#4285F4" radius={[6, 6, 0, 0]} />
            <Bar dataKey="meta"   name="Meta Ads"   fill="#1877F2" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Campaigns Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
        <SectionHeader title="Campaign Performance" sub={`${campaigns.length} active campaigns`} icon={<Target size={16} className="text-indigo-600" />} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Campaign', 'Platform', 'Status', 'Spend', 'Clicks', 'Conversions', 'CTR', 'CPC', 'ROAS'].map(h => (
                  <th key={h} className="text-left pb-3 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {campaigns.map((c: any, i: number) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="py-3 px-2 font-medium text-gray-800 max-w-[180px] truncate">{c.name}</td>
                  <td className="py-3 px-2">
                    <span className="text-xs font-medium" style={{ color: c.platform === 'Google Ads' ? '#4285F4' : '#1877F2' }}>
                      {c.platform}
                    </span>
                  </td>
                  <td className="py-3 px-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-lg capitalize ${STATUS_COLORS[c.status] || 'bg-gray-100 text-gray-600'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-gray-700">{fmtCurrency(c.spend)}</td>
                  <td className="py-3 px-2 text-gray-700">{fmt(c.clicks)}</td>
                  <td className="py-3 px-2 text-gray-700">{c.conversions}</td>
                  <td className="py-3 px-2 text-gray-700">{c.ctr}%</td>
                  <td className="py-3 px-2 text-gray-700">${c.cpc}</td>
                  <td className="py-3 px-2">
                    <span className={`font-semibold ${c.roas >= 4 ? 'text-emerald-600' : c.roas >= 3 ? 'text-blue-600' : 'text-amber-600'}`}>
                      {c.roas}x
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: SEO ─────────────────────────────────────────────────────────────────

const SeoTab: React.FC<{ data: any; period: number }> = ({ data, period }) => {
  const { seo } = data

  const trendData = seo.trend.map((d: any) => ({
    ...d,
    date: fmtDate(d.date, period),
  }))

  return (
    <div className="space-y-6">
      {/* SEO KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Keywords',     value: fmt(seo.total_keywords),    icon: <Search size={18} className="text-indigo-600" />,  bg: 'bg-indigo-50',  trend: 8  },
          { label: 'Top 10 Rankings',    value: String(seo.top_10),         icon: <TrendingUp size={18} className="text-emerald-600" />, bg: 'bg-emerald-50', trend: 12 },
          { label: 'Avg. Position',      value: String(seo.avg_position),   icon: <Target size={18} className="text-blue-600" />,    bg: 'bg-blue-50',    trend: -5 },
          { label: 'Domain Authority',   value: String(seo.domain_authority), icon: <Zap size={18} className="text-amber-600" />,   bg: 'bg-amber-50',   trend: 2  },
        ].map(({ label, value, icon, bg, trend }, i) => (
          <KpiCard key={label} label={label} value={value} icon={icon} iconBg={bg} trend={trend} delay={i * 0.04} />
        ))}
      </div>

      {/* Keyword Rankings Trend */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 animate-fade-in-up">
        <SectionHeader title="Keyword Rankings Trend" sub="Top 10 & Top 30 keyword positions" icon={<TrendingUp size={16} className="text-indigo-600" />} />
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Line type="monotone" dataKey="top10" name="Top 10" stroke="#6264A7" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="top30" name="Top 30" stroke="#C239B3" strokeWidth={2.5} dot={false} strokeDasharray="4 4" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Search Console metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 animate-fade-in-up">
          <SectionHeader title="Google Search Console" sub="Organic search performance" icon={<Search size={16} className="text-indigo-600" />} />
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Organic Clicks',  value: fmt(seo.clicks),            sub: 'From search results' },
              { label: 'Impressions',     value: fmt(seo.impressions),        sub: 'Total search views' },
              { label: 'Click-Through Rate', value: `${seo.ctr}%`,           sub: 'Clicks / Impressions' },
              { label: 'Avg. Position',   value: String(seo.avg_position),    sub: 'Search result ranking' },
            ].map(({ label, value, sub }) => (
              <div key={label} className="bg-gray-50 rounded-xl p-3">
                <p className="text-xl font-bold text-gray-900">{value}</p>
                <p className="text-xs font-medium text-gray-600 mt-0.5">{label}</p>
                <p className="text-xs text-gray-400">{sub}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 animate-fade-in-up" style={{ animationDelay: '0.04s' }}>
          <SectionHeader title="SEMrush Insights" sub="Backlinks & authority metrics" icon={<ExternalLink size={16} className="text-indigo-600" />} />
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Total Backlinks',     value: fmt(seo.backlinks),         sub: 'Inbound links' },
              { label: 'Referring Domains',   value: String(seo.referring_domains), sub: 'Unique domains' },
              { label: 'Top 30 Keywords',     value: String(seo.top_30),         sub: 'Ranking keywords' },
              { label: 'Domain Authority',    value: String(seo.domain_authority), sub: 'Out of 100' },
            ].map(({ label, value, sub }) => (
              <div key={label} className="bg-gray-50 rounded-xl p-3">
                <p className="text-xl font-bold text-gray-900">{value}</p>
                <p className="text-xs font-medium text-gray-600 mt-0.5">{label}</p>
                <p className="text-xs text-gray-400">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: GitHub ──────────────────────────────────────────────────────────────

const GithubTab: React.FC<{ data: any; period: number }> = ({ data, period }) => {
  const { github } = data

  const activityData = github.activity.map((d: any) => ({
    ...d,
    date: fmtDate(d.date, period),
  }))

  return (
    <div className="space-y-6">
      {/* GitHub KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'Total Commits',    value: String(github.total_commits),     icon: <GitCommit size={18} className="text-gray-700" />,   bg: 'bg-gray-100',   trend: 18 },
          { label: 'Pull Requests',    value: String(github.total_prs),         icon: <Activity size={18} className="text-indigo-600" />,  bg: 'bg-indigo-50',  trend: 10 },
          { label: 'Deployments',      value: String(github.total_deployments), icon: <Zap size={18} className="text-emerald-600" />,      bg: 'bg-emerald-50', trend: 5  },
          { label: 'Contributors',     value: String(github.contributors),      icon: <Users size={18} className="text-blue-600" />,       bg: 'bg-blue-50',    trend: 0  },
          { label: 'Open Issues',      value: String(github.open_issues),       icon: <AlertTriangle size={18} className="text-amber-600" />, bg: 'bg-amber-50', trend: -8 },
          { label: 'Active Repos',     value: String(github.repos),             icon: <Globe size={18} className="text-teal-600" />,       bg: 'bg-teal-50',    trend: 0  },
        ].map(({ label, value, icon, bg, trend }, i) => (
          <KpiCard key={label} label={label} value={value} icon={icon} iconBg={bg} trend={trend} delay={i * 0.04} />
        ))}
      </div>

      {/* Commit Activity Chart */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 animate-fade-in-up">
        <SectionHeader title="Developer Activity" sub="Commits, PRs, and deployments over time" icon={<GitCommit size={16} className="text-indigo-600" />} />
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={activityData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Bar dataKey="commits"     name="Commits"     fill="#6264A7" radius={[3, 3, 0, 0]} />
            <Bar dataKey="prs"         name="Pull Requests" fill="#0078D4" radius={[3, 3, 0, 0]} />
            <Bar dataKey="deployments" name="Deployments"  fill="#038387" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── Tab: Alerts ──────────────────────────────────────────────────────────────

const AlertsTab: React.FC<{ data: any; onMarkAllRead: () => void }> = ({ data, onMarkAllRead }) => {
  const alerts = data.alerts
  const unread = alerts.filter((a: any) => !a.is_read).length

  const relativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const h = Math.floor(diff / 3_600_000)
    const d = Math.floor(diff / 86_400_000)
    if (h < 1) return 'Just now'
    if (h < 24) return `${h}h ago`
    return `${d}d ago`
  }

  const TYPE_LABELS: Record<string, string> = {
    high_performing: 'High Performing',
    performance_drop: 'Performance Drop',
    budget_alert: 'Budget Alert',
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-gray-500" />
          <p className="text-sm font-semibold text-gray-800">
            {unread > 0 ? `${unread} unread alert${unread > 1 ? 's' : ''}` : 'All caught up!'}
          </p>
        </div>
        {unread > 0 && (
          <button
            onClick={onMarkAllRead}
            className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium hover:text-indigo-700 transition-colors"
          >
            <BellOff size={12} />
            Mark all as read
          </button>
        )}
      </div>

      {alerts.map((alert: any, i: number) => {
        const style = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info
        return (
          <div
            key={alert.id || i}
            className={`rounded-2xl border p-4 flex items-start gap-3 transition-opacity animate-fade-in-up ${style.bg} ${alert.is_read ? 'opacity-60' : ''}`}
            style={{ animationDelay: `${i * 0.04}s` }}
          >
            <div className="mt-0.5 shrink-0">{style.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`text-xs font-semibold ${style.text}`}>
                  {TYPE_LABELS[alert.type] || alert.type}
                </span>
                <span className="text-xs text-gray-400">·</span>
                <span className="text-xs text-gray-500 font-medium">{alert.source}</span>
                {!alert.is_read && (
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                )}
              </div>
              <p className={`text-sm leading-relaxed ${style.text}`}>{alert.message}</p>
              <p className="text-xs text-gray-400 mt-1">{relativeTime(alert.created_at)}</p>
            </div>
          </div>
        )
      })}

      {alerts.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
          <CheckCircle2 size={32} className="mb-3 text-emerald-400" />
          <p className="text-sm font-medium">No alerts</p>
          <p className="text-xs mt-1">All systems running normally</p>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type TabKey = 'overview' | 'ads' | 'seo' | 'github' | 'alerts'

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'overview', label: 'Overview',    icon: <BarChart2 size={14} /> },
  { key: 'ads',      label: 'Ads',         icon: <Target size={14} /> },
  { key: 'seo',      label: 'SEO',         icon: <Search size={14} /> },
  { key: 'github',   label: 'GitHub',      icon: <GitCommit size={14} /> },
  { key: 'alerts',   label: 'Alerts',      icon: <Bell size={14} /> },
]

const PERIODS: Array<{ key: '7d' | '30d' | '90d'; label: string }> = [
  { key: '7d',  label: '7 days'  },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
]

export const DigitalMarketingPage: React.FC = () => {
  const dispatch = useDispatch()
  const toast = useToast()
  const { dashboard, period, activeTab, isLoading, error } = useSelector(
    (s: RootState) => s.digitalMarketing
  )

  useEffect(() => {
    dispatch(fetchDashboardRequest({ period }))
  }, [period])

  const handlePeriod = (p: '7d' | '30d' | '90d') => {
    dispatch(setPeriod(p))
  }

  const handleMarkAllRead = async () => {
    try {
      await api.post('/digital-marketing/alerts/read-all')
      toast.success('All alerts marked as read')
    } catch {
      toast.error('Failed to mark alerts as read')
    }
    dispatch(markAlertsRead())
  }

  const unreadAlerts = dashboard?.alerts?.filter(a => !a.is_read).length || 0
  const periodDays   = dashboard?.period_days || 30

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between animate-fade-in-up">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Digital Marketing</h1>
            {dashboard?.is_sample_data && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg font-medium border border-amber-200">
                Demo Data
              </span>
            )}
          </div>
          <p className="text-gray-500 text-sm mt-1">
            Unified dashboard — Google Analytics · Search Console · SEMrush · Google Ads · Meta Ads · GitHub
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Period selector */}
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {PERIODS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handlePeriod(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  period === key
                    ? 'bg-white shadow-sm text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => dispatch(fetchDashboardRequest({ period }))}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => dispatch(setActiveTab(tab.key))}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-150 -mb-px ${
              activeTab === tab.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.key === 'alerts' && unreadAlerts > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                {unreadAlerts}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && !dashboard && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className="h-28 skeleton rounded-2xl" />)}
        </div>
      )}

      {/* Tab content */}
      {dashboard && !isLoading && (
        <div className="animate-fade-in">
          {activeTab === 'overview' && <OverviewTab data={dashboard} period={periodDays} />}
          {activeTab === 'ads'      && <AdsTab      data={dashboard} period={periodDays} />}
          {activeTab === 'seo'      && <SeoTab      data={dashboard} period={periodDays} />}
          {activeTab === 'github'   && <GithubTab   data={dashboard} period={periodDays} />}
          {activeTab === 'alerts'   && <AlertsTab   data={dashboard} onMarkAllRead={handleMarkAllRead} />}
        </div>
      )}
    </div>
  )
}
