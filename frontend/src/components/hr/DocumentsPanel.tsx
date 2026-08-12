import React, { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  Upload, Download, Trash2, FileText, AlertTriangle, Clock, History, Lock, X,
} from 'lucide-react'
import { RootState } from '../../store'
import {
  fetchDocumentsRequest, documentUploaded, deleteDocumentRequest, HrDocument,
} from '../../store/slices/hrDocumentsSlice'
import { usePermissions } from '../../hooks/usePermissions'
import { api } from '../../utils/api'
import {
  DataTable, Column, EmptyState, ConfirmDialog, useToast,
} from '../shared'
import { Modal } from '../common/Modal'

const DOC_TYPES = [
  'resume', 'offer_letter', 'contract', 'nda', 'id_proof', 'address_proof',
  'tax_document', 'bank_document', 'certificate', 'payslip', 'appraisal',
  'experience_letter', 'relieving_letter', 'other',
]

const label = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

const fmtSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B`
    : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const ExpiryChip: React.FC<{ doc: HrDocument }> = ({ doc }) => {
  if (doc.expiry_state === 'none') return <span className="text-xs text-gray-400">—</span>
  const cfg = {
    expired:       { cls: 'bg-rose-50 text-rose-700 border-rose-200',     icon: <AlertTriangle size={11} /> },
    expiring_soon: { cls: 'bg-amber-50 text-amber-700 border-amber-200',  icon: <Clock size={11} /> },
    valid:         { cls: 'bg-gray-50 text-gray-600 border-gray-200',     icon: null },
  }[doc.expiry_state]!
  return (
    <span className={`inline-flex items-center gap-1 text-xs border rounded-md px-1.5 py-0.5 ${cfg.cls}`}>
      {cfg.icon}{fmtDate(doc.expires_at)}
    </span>
  )
}

/* ── Upload modal ─────────────────────────────────────────────────────────── */

const UploadModal: React.FC<{
  userId: string
  docGroupId?: string
  onClose: () => void
  onDone: () => void
}> = ({ userId, docGroupId, onClose, onDone }) => {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [docType, setDocType] = useState('other')
  const [title, setTitle] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [confidential, setConfidential] = useState(false)
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!file) return
    setBusy(true); setError(''); setProgress(0)
    const form = new FormData()
    form.append('file', file)
    form.append('user_id', userId)
    form.append('doc_type', docType)
    form.append('title', title || file.name)
    form.append('expires_at', expiresAt)
    form.append('is_confidential', String(confidential))
    if (docGroupId) form.append('doc_group_id', docGroupId)

    try {
      // Posted directly rather than through a saga: onUploadProgress fires
      // continuously, and routing that through Redux would dispatch on every
      // chunk. The codebase already accepts direct api.* calls for one-shot work.
      await api.post('/hr/documents', form, {
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100))
        },
      })
      toast.success(docGroupId ? 'New version uploaded' : 'Document uploaded')
      onDone()
      onClose()
    } catch (err: any) {
      // The server rejects on magic bytes and size — surface its reason verbatim
      // rather than a generic failure, since it tells the user what to fix.
      setError(err?.response?.data?.detail || 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl animate-scale-in">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <Upload size={16} className="text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                {docGroupId ? 'Upload new version' : 'Upload document'}
              </p>
              <p className="text-xs text-gray-500">PDF, image, Word, Excel or CSV — max 8 MB</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">File</label>
            <input
              ref={fileRef}
              type="file"
              onChange={e => { setFile(e.target.files?.[0] || null); setError('') }}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700"
            />
            {file && <p className="text-xs text-gray-400 mt-1">{fmtSize(file.size)}</p>}
          </div>

          {!docGroupId && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Type</label>
                <select
                  value={docType}
                  onChange={e => setDocType(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {DOC_TYPES.map(t => <option key={t} value={t}>{label(t)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Expires on (optional)</label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={e => setExpiresAt(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={file?.name || 'Document title'}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {!docGroupId && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={confidential} onChange={e => setConfidential(e.target.checked)} />
              Confidential — hidden from the employee themselves
            </label>
          )}

          {busy && (
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-3 py-2 text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!file || busy}
            className="bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2"
          >
            <Upload size={13} />
            {busy ? `Uploading ${progress}%` : 'Upload'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Panel ────────────────────────────────────────────────────────────────── */

export const DocumentsPanel: React.FC<{ userId: string }> = ({ userId }) => {
  const dispatch = useDispatch()
  const toast = useToast()
  const { can } = usePermissions()
  const { items, isLoading } = useSelector((s: RootState) => s.hrDocuments)

  const [showUpload, setShowUpload] = useState(false)
  const [versionOf, setVersionOf] = useState<HrDocument | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<HrDocument | null>(null)
  const [showAllVersions, setShowAllVersions] = useState(false)

  useEffect(() => {
    if (userId) dispatch(fetchDocumentsRequest({ user_id: userId, include_versions: showAllVersions }))
  }, [userId, showAllVersions, dispatch])

  const download = async (doc: HrDocument) => {
    try {
      // Two steps by design: this call is authenticated, permission-checked and
      // audited, and returns a short-lived signed URL. The raw storage key is
      // never sent to the browser.
      const res: any = await api.get(`/hr/documents/${doc.id}/download`)
      window.open(res.data.url, '_blank', 'noopener,noreferrer')
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Could not get a download link.')
    }
  }

  const columns: Column<HrDocument>[] = [
    {
      key: 'title',
      header: 'Document',
      render: (d) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center shrink-0">
            <FileText size={14} className="text-gray-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate flex items-center gap-1.5">
              {d.title}
              {d.is_confidential && <Lock size={11} className="text-amber-500 shrink-0" />}
            </p>
            <p className="text-xs text-gray-400 truncate">
              {label(d.doc_type)} · v{d.version} · {fmtSize(d.size_bytes)}
              {!d.is_current && ' · superseded'}
            </p>
          </div>
        </div>
      ),
    },
    { key: 'expires_at', header: 'Expires', render: (d) => <ExpiryChip doc={d} /> },
    {
      key: 'uploaded_by_name',
      header: 'Uploaded',
      render: (d) => (
        <div>
          <p className="text-sm text-gray-600">{fmtDate(d.created_at)}</p>
          <p className="text-xs text-gray-400 truncate">{d.uploaded_by_name}</p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (d) => (
        <div className="flex items-center justify-end gap-1">
          {can('document.download') && (
            <button onClick={() => download(d)} title="Download"
              className="p-1.5 rounded-lg text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors">
              <Download size={14} />
            </button>
          )}
          {can('document.upload') && d.is_current && (
            <button onClick={() => setVersionOf(d)} title="Upload new version"
              className="p-1.5 rounded-lg text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors">
              <History size={14} />
            </button>
          )}
          {can('document.delete') && (
            <button onClick={() => setConfirmDelete(d)} title="Delete"
              className="p-1.5 rounded-lg text-gray-400 hover:bg-rose-50 hover:text-rose-600 transition-colors">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ),
    },
  ]

  if (!can('document.read')) {
    return (
      <EmptyState
        icon={<Lock size={22} className="text-gray-300" />}
        title="Documents are restricted"
        description="You do not have permission to view documents."
        size="compact"
      />
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <label className="flex items-center gap-2 text-xs text-gray-500">
          <input
            type="checkbox"
            checked={showAllVersions}
            onChange={e => setShowAllVersions(e.target.checked)}
          />
          Show superseded versions
        </label>
        {can('document.upload') && (
          <button
            onClick={() => setShowUpload(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-200 transition-all flex items-center gap-2"
          >
            <Upload size={13} /> Upload
          </button>
        )}
      </div>

      {!isLoading && !items.length ? (
        <EmptyState
          variant="default"
          title="No documents yet"
          description="Contracts, ID proofs and certificates uploaded here are stored securely and expire-tracked."
          size="compact"
        />
      ) : (
        <DataTable columns={columns} data={items} loading={isLoading} emptyMessage="No documents" />
      )}

      {showUpload && (
        <UploadModal
          userId={userId}
          onClose={() => setShowUpload(false)}
          onDone={() => dispatch(documentUploaded({ user_id: userId }))}
        />
      )}
      {versionOf && (
        <UploadModal
          userId={userId}
          docGroupId={versionOf.doc_group_id}
          onClose={() => setVersionOf(null)}
          onDone={() => dispatch(documentUploaded({ user_id: userId }))}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          open
          title="Delete this document?"
          message={`"${confirmDelete.title}" will be removed from storage. The audit record is kept.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => {
            dispatch(deleteDocumentRequest({ id: confirmDelete.id, user_id: userId }))
            setConfirmDelete(null)
          }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
