import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface Ticket {
  id: string
  ticket_number: string
  raised_by: string
  raised_by_name: string
  subject: string
  description: string
  category: string
  priority: string
  status: string
  assigned_to_name: string
  sla_due_at: string | null
  /** Derived server-side each read, never a stale stored value. */
  sla_state: 'breached' | 'due_soon' | 'on_track' | 'met'
  resolution: string
  message_count: number
  created_at: string | null
}

export interface TicketMessage {
  id: string
  author_name: string
  body: string
  is_internal: boolean
  created_at: string | null
}

interface State {
  items: Ticket[]
  total: number
  openCount: number
  breachedCount: number
  categories: string[]
  selected: (Ticket & { messages: TicketMessage[] }) | null
  isLoading: boolean
  detailLoading: boolean
  saveLoading: boolean
  error: string | null
  saveError: string | null
}

const initialState: State = {
  items: [], total: 0, openCount: 0, breachedCount: 0, categories: [],
  selected: null, isLoading: false, detailLoading: false, saveLoading: false,
  error: null, saveError: null,
}

const slice = createSlice({
  name: 'hrTickets',
  initialState,
  reducers: {
    fetchTicketsRequest: {
      reducer(state, _a: PayloadAction<Record<string, any> | undefined>) { state.isLoading = true },
      prepare(payload?: Record<string, any>) { return { payload } },
    },
    fetchTicketsSuccess(
      state,
      a: PayloadAction<{ tickets: Ticket[]; total: number; open_count: number; breached_count: number; categories: string[] }>,
    ) {
      state.isLoading = false
      state.items = a.payload.tickets
      state.total = a.payload.total
      state.openCount = a.payload.open_count
      state.breachedCount = a.payload.breached_count
      state.categories = a.payload.categories
    },
    fetchTicketsFailure(state, a: PayloadAction<string>) {
      state.isLoading = false; state.error = a.payload
    },

    fetchTicketRequest(state, _a: PayloadAction<string>) { state.detailLoading = true },
    fetchTicketSuccess(state, a: PayloadAction<any>) {
      state.detailLoading = false; state.selected = a.payload
    },
    fetchTicketFailure(state, a: PayloadAction<string>) {
      state.detailLoading = false; state.error = a.payload
    },
    clearSelectedTicket(state) { state.selected = null },

    createTicketRequest(state, _a: PayloadAction<Record<string, any>>) {
      state.saveLoading = true; state.saveError = null
    },
    createTicketSuccess(state) { state.saveLoading = false },
    createTicketFailure(state, a: PayloadAction<string>) {
      state.saveLoading = false; state.saveError = a.payload
    },

    replyTicketRequest(state, _a: PayloadAction<{ id: string; body: string; is_internal: boolean }>) {
      state.saveLoading = true
    },
    replyTicketSuccess(state) { state.saveLoading = false },
    replyTicketFailure(state, a: PayloadAction<string>) {
      state.saveLoading = false; state.error = a.payload
    },

    updateTicketRequest(state, _a: PayloadAction<{ id: string; updates: Record<string, any> }>) {
      state.saveLoading = true
    },
    updateTicketSuccess(state) { state.saveLoading = false },
    updateTicketFailure(state, a: PayloadAction<string>) {
      state.saveLoading = false; state.error = a.payload
    },
  },
})

export const {
  fetchTicketsRequest, fetchTicketsSuccess, fetchTicketsFailure,
  fetchTicketRequest, fetchTicketSuccess, fetchTicketFailure, clearSelectedTicket,
  createTicketRequest, createTicketSuccess, createTicketFailure,
  replyTicketRequest, replyTicketSuccess, replyTicketFailure,
  updateTicketRequest, updateTicketSuccess, updateTicketFailure,
} = slice.actions

export default slice.reducer
