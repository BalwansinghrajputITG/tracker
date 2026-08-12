import React, { useCallback, useEffect, useState } from 'react'
import {
  Plug, RefreshCw, ShieldCheck, ShieldAlert, AlertTriangle, PlayCircle, Save, Info,
} from 'lucide-react'
import { api } from '../../utils/api'
import { useToast, DataTable, Column, EmptyState } from '../shared'

/**
 * HRIS integration settings (docs/hr.md §16, §36).
 *
 * The credential form is rendered from the provider's field definitions rather
 * than hardcoded, matching how project_tools.py describes its dozen providers —
 * so adding BambooHR later needs no frontend change.
 *
 * Calls go straight through `api` rather than a saga: this is a one-shot admin
 * surface with no shared state, which the codebase already handles this way
 * (UsersPage.tsx:79).
 */

interface Field {
  key: string; label: string; type: string; secret: boolean
  placeholder?: string; help?: string
}
interface Provider {
  name: string; fields: Field[]; credentials_saved: boolean
  env_configured: boolean; sync_enabled: boolean; ready: boolean
}
interface SyncLog {
  id: string; provider: string; entity: string; dry_run: boolean; status: string
  created: number; updated: number; skipped: number; local_only: number
  conflicts: number; rejected: number; duration_ms: number; started_at: string
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const inputCls =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

export const IntegrationsPanel: React.FC = () => {
  const toast = useToast()
  const [status, setStatus] = useState<any>(null)
  const [creds, setCreds] = useState<Record<string, string>>({})
  const [logs, setLogs] = useState<SyncLog[]>([])
  const [conflicts, setConflicts] = useState<any[]>([])
  const [busy, setBusy] = useState('')
  const [lastRun, setLastRun] = useState<any>(null)

  const load = useCallback(async () => {
    try {
      const [s, c, l, cf] = await Promise.all([
        api.get('/hr/integrations'),
        api.get('/hr/integrations/keka/credentials'),
        api.get('/hr/integrations/sync-logs', { params: { limit: 10 } }),
        api.get('/hr/integrations/conflicts'),
      ])
      setStatus(s.data)
      setCreds(c.data.credentials || {})
      setLogs(l.data.logs)
      setConflicts(cf.data.conflicts)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Could not load integration settings.')
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  const saveCredentials = async () => {
    setBusy('save')
    try {
      await api.post('/hr/integrations/keka/credentials', {
        base_url: creds.base_url || '', client_id: creds.client_id || '',
        client_secret: creds.client_secret || '', api_key: creds.api_key || '',
      })
      toast.success('Credentials saved')
      await load()
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Could not save credentials.')
    } finally { setBusy('') }
  }

  const checkHealth = async (provider: string) => {
    setBusy(`health-${provider}`)
    try {
      const r = await api.get(`/hr/integrations/${provider}/health`)
      r.data.ok ? toast.success(`${provider} reachable`) : toast.error(r.data.error || 'Not reachable')
    } finally { setBusy('') }
  }

  const runSync = async (provider: string, entity: string, dryRun: boolean) => {
    setBusy(`sync-${entity}`)
    try {
      const r = await api.post(
        `/hr/integrations/${provider}/sync/${entity}`, {}, { params: { dry_run: dryRun } },
      )
      setLastRun({ entity, dryRun, ...r.data })
      toast.success(dryRun ? `Dry run complete — nothing written` : `${entity} synced`)
      await load()
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Sync failed.')
    } finally { setBusy('') }
  }

  const keka: Provider | undefined = status?.providers?.find((p: Provider) => p.name === 'keka')

  const logCols: Column<SyncLog>[] = [
    {
      key: 'entity', header: 'Run',
      render: l => (
        <div>
          <p className="text-sm text-gray-900">{l.provider} · {l.entity}</p>
          <p className="text-xs text-gray-400">
            {fmtTime(l.started_at)} · {l.duration_ms}ms
            {l.dry_run && <span className="ml-1 text-blue-600">dry run</span>}
          </p>
        </div>
      ),
    },
    {
      key: 'created', header: 'Result',
      render: l => (
        <span className="text-xs text-gray-600">
          {l.created} created · {l.updated} updated · {l.skipped} skipped
          {l.local_only > 0 && ` · ${l.local_only} unlinked`}
        </span>
      ),
    },
    {
      key: 'conflicts', header: 'Needs review',
      render: l => (
        <span className="flex gap-2 text-xs">
          {l.conflicts > 0 && <span className="text-amber-700">{l.conflicts} conflicts</span>}
          {l.rejected > 0 && <span className="text-rose-700">{l.rejected} rejected</span>}
          {!l.conflicts && !l.rejected && <span className="text-gray-400">—</span>}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 animate-fade-in-up">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <Plug size={16} className="text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Keka</p>
              <p className="text-xs text-gray-500">HRIS employee &amp; department sync</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {keka?.ready ? (
              <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1 flex items-center gap-1">
                <ShieldCheck size={11} /> Live sync enabled
              </span>
            ) : (
              <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 flex items-center gap-1">
                <ShieldAlert size={11} />
                {keka?.credentials_saved || keka?.env_configured ? 'Credentials saved · sync disabled' : 'Not configured'}
              </span>
            )}
            <button onClick={() => checkHealth('keka')} disabled={busy.startsWith('health')}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-gray-50">
              Test connection
            </button>
          </div>
        </div>

        {/* Rendered from the provider's own field definitions. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(keka?.fields || []).map(f => (
            <div key={f.key}>
              <label className="block text-xs text-gray-500 mb-1.5">{f.label}</label>
              <input
                type={f.type === 'password' ? 'password' : 'text'}
                value={creds[f.key] || ''}
                placeholder={f.placeholder}
                onChange={e => setCreds(p => ({ ...p, [f.key]: e.target.value }))}
                className={inputCls}
              />
              {f.help && <p className="text-[11px] text-gray-400 mt-1">{f.help}</p>}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mt-4">
          <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
            <Info size={11} />
            Saved secrets are encrypted and never shown again — leave the dots to keep them.
          </p>
          <button onClick={saveCredentials} disabled={busy === 'save'}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
            <Save size={13} /> {busy === 'save' ? 'Saving…' : 'Save credentials'}
          </button>
        </div>

        {!keka?.sync_enabled && (keka?.credentials_saved || keka?.env_configured) && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800">
            Live sync is off. Set <code>KEKA_SYNC_ENABLED=true</code> once a dry run against
            these credentials looks right — until then no request reaches Keka.
          </div>
        )}
      </div>

      {/* Run a sync */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 animate-fade-in-up">
        <p className="text-sm font-semibold text-gray-800 mb-1">Run a sync</p>
        <p className="text-xs text-gray-500 mb-4">
          A dry run reports exactly what would change and writes nothing. Local values
          always win over the provider for designation, manager and employment status.
        </p>

        <div className="space-y-2">
          {(status?.syncable_entities || []).map((entity: string) => (
            <div key={entity} className="flex items-center justify-between border border-gray-100 rounded-xl px-3 py-2.5">
              <div>
                <p className="text-sm text-gray-900 capitalize">{entity}</p>
                {status?.last_syncs?.[entity] && (
                  <p className="text-xs text-gray-400">
                    last {status.last_syncs[entity].dry_run ? 'dry run' : 'sync'} ·{' '}
                    {fmtTime(status.last_syncs[entity].at)}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {['mock', 'keka'].map(provider => (
                  <React.Fragment key={provider}>
                    <button
                      onClick={() => runSync(provider, entity, true)}
                      disabled={!!busy || (provider === 'keka' && !keka?.ready)}
                      className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-40 flex items-center gap-1">
                      <PlayCircle size={11} /> {provider} dry run
                    </button>
                  </React.Fragment>
                ))}
                <button
                  onClick={() => runSync('mock', entity, false)}
                  disabled={!!busy}
                  className="text-xs bg-blue-600 text-white rounded-lg px-2.5 py-1.5 hover:bg-blue-700 disabled:opacity-40 flex items-center gap-1">
                  <RefreshCw size={11} /> Apply (mock)
                </button>
              </div>
            </div>
          ))}
          {(status?.planned_entities || []).map((entity: string) => (
            <div key={entity} className="flex items-center justify-between border border-gray-100 rounded-xl px-3 py-2.5 opacity-60">
              <p className="text-sm text-gray-600 capitalize">{entity}</p>
              <span className="text-xs text-gray-400">Fetch supported · merge not implemented</span>
            </div>
          ))}
        </div>

        {lastRun && (
          <div className="mt-4 bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs">
            <p className="font-medium text-gray-700 mb-1">
              {lastRun.entity} · {lastRun.dryRun ? 'dry run (nothing written)' : 'applied'}
            </p>
            <p className="text-gray-600">
              fetched {lastRun.fetched} · created {lastRun.created} · updated {lastRun.updated} ·
              skipped {lastRun.skipped} · conflicts {lastRun.conflict_count} · rejected {lastRun.rejected_count}
            </p>
            {(lastRun.rejected || []).slice(0, 4).map((r: any, i: number) => (
              <p key={i} className="text-rose-700 mt-1">
                rejected {r.email || r.external_id}: {r.reason}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Conflicts */}
      {conflicts.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-5 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={15} className="text-amber-600" />
            <p className="text-sm font-semibold text-gray-800">
              {conflicts.length} record{conflicts.length === 1 ? '' : 's'} where the local value was kept
            </p>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            The provider disagreed with a locally-owned field. Nothing was overwritten —
            decide which is right and update it here or in Keka.
          </p>
          <div className="space-y-2">
            {conflicts.map(cf => (
              <div key={cf.employee_id} className="border border-gray-100 rounded-xl px-3 py-2.5">
                <p className="text-sm text-gray-900">{cf.full_name} <span className="text-xs text-gray-400">{cf.employee_code}</span></p>
                {cf.fields.map((f: any, i: number) => (
                  <p key={i} className="text-xs text-gray-500 mt-0.5">
                    <span className="text-gray-700">{f.field.replace(/_/g, ' ')}</span>
                    {' — kept '}<b className="text-emerald-700">{f.local}</b>
                    {', Keka said '}<span className="text-gray-600">{f.remote}</span>
                  </p>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in-up">
        <div className="px-5 pt-5 pb-2">
          <p className="text-sm font-semibold text-gray-800">Sync history</p>
        </div>
        {logs.length ? (
          <DataTable columns={logCols} data={logs} emptyMessage="No syncs yet" />
        ) : (
          <div className="p-5">
            <EmptyState variant="default" title="No syncs yet"
              description="Run a dry run to see what a sync would change." size="compact" />
          </div>
        )}
      </div>
    </div>
  )
}
