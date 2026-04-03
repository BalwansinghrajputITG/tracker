import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface DashboardData {
  period_days: number
  is_sample_data?: boolean
  overview: {
    total_traffic: number
    organic_traffic: number
    paid_traffic: number
    social_traffic: number
    direct_traffic: number
    total_leads: number
    conversions: number
    total_spend: number
    cpl: number
    roas: number
    bounce_rate: number
    avg_session_duration: string
    pages_per_session: number
  }
  traffic_trend: Array<{ date: string; organic: number; paid: number; social: number; direct: number }>
  traffic_sources: Array<{ name: string; value: number; color: string }>
  ads: {
    google: { spend: number; clicks: number; conversions: number; impressions: number; ctr: number; cpc: number; roas: number }
    meta:   { spend: number; clicks: number; conversions: number; impressions: number; ctr: number; cpc: number; roas: number }
  }
  campaigns: Array<{
    name: string; platform: string; status: string
    spend: number; clicks: number; impressions: number
    conversions: number; ctr: number; cpc: number; roas: number
  }>
  seo: {
    total_keywords: number; top_10: number; top_30: number
    avg_position: number; clicks: number; impressions: number
    ctr: number; domain_authority: number; backlinks: number
    referring_domains: number
    trend: Array<{ date: string; top10: number; top30: number }>
  }
  github: {
    total_commits: number; total_prs: number; total_deployments: number
    contributors: number; open_issues: number; repos: number
    activity: Array<{ date: string; commits: number; prs: number; deployments: number }>
  }
  alerts: Array<{
    id: string; type: string; source: string
    message: string; severity: string; is_read: boolean; created_at: string
  }>
}

interface DigitalMarketingState {
  dashboard: DashboardData | null
  period: '7d' | '30d' | '90d'
  activeTab: string
  isLoading: boolean
  error: string | null
}

const initialState: DigitalMarketingState = {
  dashboard: null,
  period: '30d',
  activeTab: 'overview',
  isLoading: false,
  error: null,
}

const digitalMarketingSlice = createSlice({
  name: 'digitalMarketing',
  initialState,
  reducers: {
    fetchDashboardRequest(state, _: PayloadAction<{ period: string }>) {
      state.isLoading = true
      state.error = null
    },
    fetchDashboardSuccess(state, action: PayloadAction<DashboardData>) {
      state.isLoading = false
      state.dashboard = action.payload
    },
    fetchDashboardFailure(state, action: PayloadAction<string>) {
      state.isLoading = false
      state.error = action.payload
    },
    setPeriod(state, action: PayloadAction<'7d' | '30d' | '90d'>) {
      state.period = action.payload
    },
    setActiveTab(state, action: PayloadAction<string>) {
      state.activeTab = action.payload
    },
    markAlertsRead(state) {
      if (state.dashboard) {
        state.dashboard.alerts = state.dashboard.alerts.map(a => ({ ...a, is_read: true }))
      }
    },
  },
})

export const {
  fetchDashboardRequest, fetchDashboardSuccess, fetchDashboardFailure,
  setPeriod, setActiveTab, markAlertsRead,
} = digitalMarketingSlice.actions
export default digitalMarketingSlice.reducer
