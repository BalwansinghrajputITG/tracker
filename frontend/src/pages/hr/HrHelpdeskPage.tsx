import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { LifeBuoy, Plus, X, Send, AlertTriangle, Clock, Lock, EyeOff } from 'lucide-react'
import { RootState } from '../../store'
import {
  fetchTicketsRequest, fetchTicketRequest, createTicketRequest,
  replyTicketRequest, updateTicketRequest, clearSelectedTicket, Ticket,
} from '../../store/slices/hrTicketsSlice'
import { usePermissions } from '../../hooks/usePermissions'
import { DataTable, Column, StatusBadge, useToast } from '../../components/shared'
import { Modal } from '../../components/common/Modal'

const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

const inputCls =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

const SlaChip: React.FC<{ state: Ticket['sla_state'] }> = ({ state }) => {
  const cfg = {
    breached: { cls: 'bg-rose-50 text-rose-700 border-rose-200', icon: <AlertTriangle size={10} />, label: 'Breached' },
    due_soon: { cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: <Clock size={10} />, label: 'Due soon' },
    on_track: { cls: 'bg-gray-50 text-gray-500 border-gray-200', icon: null, label: 'On track' },
    met:      { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: null, label: 'Met' },
  }[state]
  return (
    <span className={`inline-flex items-center gap-1 text-xs border rounded-md px-1.5 py-0.5 ${cfg.cls}`}>
      {cfg.icon}{cfg.label}
    </span>
  )
}

/* ── New ticket ───────────────────────────────────────────────────────────── */

const NewTicketModal: React.FC<{ categories: string[]; onClose: () => void }> = ({ categories, onClose }) => {
  const dispatch = useDispatch()
  const toast = useToast()
  const { saveLoading, saveError } = useSelector((s: RootState) => s.hrTickets)
  const [form, setForm] = useState({ subject: '', description: '', category: 'other', priority: 'medium' })
  const [wasSaving, setWasSaving] = useState(false)

  useEffect(() => {
    if (saveLoading) setWasSaving(true)
    else if (wasSaving) {
      if (!saveError) { toast.success('Ticket raised'); onClose() }
      setWasSaving(false)
    }
  }, [saveLoading, saveError, wasSaving, toast, onClose])

  return (
    <Modal onClose={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-scale-in">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <LifeBuoy size={16} className="text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Raise an HR ticket</p>
              <p className="text-xs text-gray-500">Response time depends on priority</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Subject</label>
            <input className={inputCls} value={form.subject}
              onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Category</label>
              <select className={inputCls} value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {(categories.length ? categories : ['other']).map(c => (
                  <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Priority</label>
              <select className={inputCls} value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                {['low', 'medium', 'high', 'urgent'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Description</label>
            <textarea rows={4} className={inputCls} value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          {saveError && <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-3 py-2 text-sm">{saveError}</div>}
        </div>
        <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
          <button onClick={() => dispatch(createTicketRequest(form))}
            disabled={!form.subject || saveLoading}
            className="bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {saveLoading ? 'Raising…' : 'Raise ticket'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Thread ───────────────────────────────────────────────────────────────── */

const TicketThread: React.FC<{ ticketId: string; onClose: () => void }> = ({ ticketId, onClose }) => {
  const dispatch = useDispatch()
  const { can } = usePermissions()
  const { selected, detailLoading, saveLoading } = useSelector((s: RootState) => s.hrTickets)
  const [reply, setReply] = useState('')
  const [internal, setInternal] = useState(false)

  useEffect(() => { dispatch(fetchTicketRequest(ticketId)) }, [ticketId, dispatch])
  useEffect(() => () => { dispatch(clearSelectedTicket()) }, [dispatch])

  const t = selected
  const canManage = can('ticket.assign')

  return (
    <Modal onClose={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl animate-scale-in">
        <div className="p-6 border-b border-gray-100 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{t?.subject || 'Ticket'}</p>
            <p className="text-xs text-gray-500">
              {t?.ticket_number} · {t?.raised_by_name} · {t?.category?.replace(/_/g, ' ')}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0"><X size={18} /></button>
        </div>

        {detailLoading || !t ? (
          <div className="p-6 space-y-3 animate-pulse"><div className="h-24 skeleton rounded-xl" /><div className="h-32 skeleton rounded-xl" /></div>
        ) : (
          <>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={t.status} />
                <SlaChip state={t.sla_state} />
                <span className="text-xs text-gray-400">Due {fmtDateTime(t.sla_due_at)}</span>
                {t.assigned_to_name && <span className="text-xs text-gray-500">· {t.assigned_to_name}</span>}
              </div>

              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{t.description}</p>
              </div>

              <div className="space-y-3">
                {t.messages.map(m => (
                  <div key={m.id}
                    className={`rounded-xl p-3 border ${
                      m.is_internal ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'
                    }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                        {m.author_name}
                        {m.is_internal && (
                          <span className="text-[10px] text-amber-700 flex items-center gap-1">
                            <EyeOff size={9} /> internal
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] text-gray-400">{fmtDateTime(m.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))}
              </div>

              {t.resolution && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <p className="text-xs font-medium text-emerald-800 mb-0.5">Resolution</p>
                  <p className="text-sm text-emerald-900">{t.resolution}</p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-100 space-y-3">
              {t.status !== 'closed' && (
                <>
                  <textarea rows={2} placeholder="Write a reply…" value={reply}
                    onChange={e => setReply(e.target.value)} className={inputCls} />
                  <div className="flex items-center justify-between gap-3">
                    {canManage ? (
                      <label className="flex items-center gap-2 text-xs text-gray-500">
                        <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} />
                        Internal note (hidden from {t.raised_by_name})
                      </label>
                    ) : <span />}
                    <button
                      onClick={() => {
                        dispatch(replyTicketRequest({ id: ticketId, body: reply, is_internal: internal }))
                        setReply(''); setInternal(false)
                      }}
                      disabled={!reply.trim() || saveLoading}
                      className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                      <Send size={13} /> Reply
                    </button>
                  </div>
                </>
              )}

              {canManage && (
                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                  <span className="text-xs text-gray-500">Set status</span>
                  <select value={t.status}
                    onChange={e => dispatch(updateTicketRequest({ id: ticketId, updates: { status: e.target.value } }))}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-gray-50">
                    {['open', 'in_progress', 'waiting', 'resolved', 'closed'].map(s => (
                      <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export const HrHelpdeskPage: React.FC = () => {
  const dispatch = useDispatch()
  const toast = useToast()
  const { can } = usePermissions()
  const { items, total, openCount, breachedCount, categories, isLoading, error } =
    useSelector((s: RootState) => s.hrTickets)
  const [showNew, setShowNew] = useState(false)
  const [openTicket, setOpenTicket] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'mine' | 'breached'>('all')

  useEffect(() => {
    const params: Record<string, any> = {}
    if (filter === 'mine') params.mine = true
    if (filter === 'breached') params.sla = 'breached'
    dispatch(fetchTicketsRequest(params))
  }, [filter, dispatch])
  useEffect(() => { if (error) toast.error(error) }, [error, toast])

  if (!can('ticket.read')) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 animate-fade-in">
        <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
          <Lock size={24} className="text-gray-300" />
        </div>
        <p className="text-base font-semibold text-gray-600">Access Restricted</p>
      </div>
    )
  }

  const cols: Column<Ticket>[] = [
    {
      key: 'ticket_number', header: 'Ticket',
      render: t => (
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{t.subject}</p>
          <p className="text-xs text-gray-400">{t.ticket_number} · {t.raised_by_name}</p>
        </div>
      ),
    },
    { key: 'category', header: 'Category', render: t => <span className="text-sm text-gray-600 capitalize">{t.category.replace(/_/g, ' ')}</span> },
    { key: 'priority', header: 'Priority', render: t => <StatusBadge status={t.priority} /> },
    { key: 'status', header: 'Status', render: t => <StatusBadge status={t.status} /> },
    { key: 'sla_state', header: 'SLA', render: t => <SlaChip state={t.sla_state} /> },
    { key: 'message_count', header: 'Replies', render: t => <span className="text-sm text-gray-500">{t.message_count}</span> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">HR Helpdesk</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {total} ticket{total === 1 ? '' : 's'} · {openCount} open
            {breachedCount > 0 && <span className="text-rose-600"> · {breachedCount} SLA breached</span>}
          </p>
        </div>
        {can('ticket.create') && (
          <button onClick={() => setShowNew(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-200 transition-all flex items-center gap-2">
            <Plus size={14} /> Raise ticket
          </button>
        )}
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([
          { key: 'all', label: 'All' },
          { key: 'mine', label: 'Raised by me' },
          { key: 'breached', label: `Breached${breachedCount ? ` (${breachedCount})` : ''}` },
        ] as const).map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              filter === f.key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}>{f.label}</button>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in-up">
        <DataTable columns={cols} data={items} loading={isLoading}
          onRowClick={t => setOpenTicket(t.id)} rowClassName="cursor-pointer"
          emptyMessage="No tickets" />
      </div>

      {showNew && <NewTicketModal categories={categories} onClose={() => setShowNew(false)} />}
      {openTicket && <TicketThread ticketId={openTicket} onClose={() => setOpenTicket(null)} />}
    </div>
  )
}
