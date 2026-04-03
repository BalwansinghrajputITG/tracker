import React, { useState, useMemo, useRef, useEffect } from 'react'
import { Plus, X, Search, ChevronDown, ExternalLink } from 'lucide-react'

// ─── Catalog ──────────────────────────────────────────────────────────────────

export interface CatalogTool {
  id: string
  name: string
  category: string
  abbr: string
  color: string
}

export interface ProjectTool {
  id: string
  name: string
  category: string
  abbr: string
  color: string
  url?: string
}

const CATALOG: CatalogTool[] = [
  // Marketing
  { id: 'google_analytics',     name: 'Google Analytics',     category: 'Marketing',    abbr: 'GA',   color: '#E37400' },
  { id: 'search_console',       name: 'Search Console',       category: 'Marketing',    abbr: 'GSC',  color: '#4285F4' },
  { id: 'google_ads',           name: 'Google Ads',           category: 'Marketing',    abbr: 'GAds', color: '#34A853' },
  { id: 'meta_ads',             name: 'Meta Ads',             category: 'Marketing',    abbr: 'Meta', color: '#1877F2' },
  { id: 'semrush',              name: 'SEMrush',              category: 'Marketing',    abbr: 'SEM',  color: '#FF6243' },
  { id: 'hubspot',              name: 'HubSpot',              category: 'Marketing',    abbr: 'HS',   color: '#FF7A59' },
  { id: 'mailchimp',            name: 'Mailchimp',            category: 'Marketing',    abbr: 'MC',   color: '#FFE01B' },
  { id: 'klaviyo',              name: 'Klaviyo',              category: 'Marketing',    abbr: 'KV',   color: '#00B08D' },
  { id: 'hotjar',               name: 'Hotjar',               category: 'Marketing',    abbr: 'HJ',   color: '#FD3A5C' },
  { id: 'linkedin_ads',         name: 'LinkedIn Ads',         category: 'Marketing',    abbr: 'LI',   color: '#0A66C2' },

  // Development
  { id: 'github',               name: 'GitHub',               category: 'Development',  abbr: 'GH',   color: '#181717' },
  { id: 'gitlab',               name: 'GitLab',               category: 'Development',  abbr: 'GL',   color: '#FC6D26' },
  { id: 'jira',                 name: 'Jira',                 category: 'Development',  abbr: 'JR',   color: '#0052CC' },
  { id: 'linear',               name: 'Linear',               category: 'Development',  abbr: 'LN',   color: '#5E6AD2' },
  { id: 'sentry',               name: 'Sentry',               category: 'Development',  abbr: 'SN',   color: '#362D59' },
  { id: 'vercel',               name: 'Vercel',               category: 'Development',  abbr: 'VC',   color: '#000000' },
  { id: 'netlify',              name: 'Netlify',              category: 'Development',  abbr: 'NT',   color: '#00C7B7' },
  { id: 'aws',                  name: 'AWS',                  category: 'Development',  abbr: 'AWS',  color: '#FF9900' },
  { id: 'gcp',                  name: 'Google Cloud',         category: 'Development',  abbr: 'GCP',  color: '#4285F4' },
  { id: 'docker',               name: 'Docker',               category: 'Development',  abbr: 'DK',   color: '#2496ED' },

  // Design
  { id: 'figma',                name: 'Figma',                category: 'Design',       abbr: 'FG',   color: '#F24E1E' },
  { id: 'adobe_xd',             name: 'Adobe XD',             category: 'Design',       abbr: 'XD',   color: '#FF61F6' },
  { id: 'canva',                name: 'Canva',                category: 'Design',       abbr: 'CV',   color: '#00C4CC' },
  { id: 'invision',             name: 'InVision',             category: 'Design',       abbr: 'IV',   color: '#FF3366' },
  { id: 'sketch',               name: 'Sketch',               category: 'Design',       abbr: 'SK',   color: '#F7B500' },
  { id: 'zeplin',               name: 'Zeplin',               category: 'Design',       abbr: 'ZP',   color: '#FFBE00' },

  // Analytics
  { id: 'mixpanel',             name: 'Mixpanel',             category: 'Analytics',    abbr: 'MX',   color: '#7856FF' },
  { id: 'amplitude',            name: 'Amplitude',            category: 'Analytics',    abbr: 'AM',   color: '#0099FF' },
  { id: 'hotjar_analytics',     name: 'Hotjar',               category: 'Analytics',    abbr: 'HJ',   color: '#FD3A5C' },
  { id: 'segment',              name: 'Segment',              category: 'Analytics',    abbr: 'SG',   color: '#52BD94' },
  { id: 'heap',                 name: 'Heap',                 category: 'Analytics',    abbr: 'HP',   color: '#8C33FF' },

  // Productivity
  { id: 'slack',                name: 'Slack',                category: 'Productivity', abbr: 'SL',   color: '#4A154B' },
  { id: 'notion',               name: 'Notion',               category: 'Productivity', abbr: 'NO',   color: '#000000' },
  { id: 'confluence',           name: 'Confluence',           category: 'Productivity', abbr: 'CF',   color: '#0052CC' },
  { id: 'asana',                name: 'Asana',                category: 'Productivity', abbr: 'AS',   color: '#F06A6A' },
  { id: 'trello',               name: 'Trello',               category: 'Productivity', abbr: 'TR',   color: '#0079BF' },
  { id: 'monday',               name: 'Monday.com',           category: 'Productivity', abbr: 'MN',   color: '#FF3D57' },

  // E-commerce
  { id: 'shopify',              name: 'Shopify',              category: 'E-commerce',   abbr: 'SH',   color: '#96BF48' },
  { id: 'woocommerce',          name: 'WooCommerce',          category: 'E-commerce',   abbr: 'WC',   color: '#96588A' },
  { id: 'stripe',               name: 'Stripe',               category: 'E-commerce',   abbr: 'ST',   color: '#635BFF' },
  { id: 'paypal',               name: 'PayPal',               category: 'E-commerce',   abbr: 'PP',   color: '#00457C' },
  { id: 'magento',              name: 'Magento',              category: 'E-commerce',   abbr: 'MG',   color: '#EE672F' },
]

const CATEGORIES = ['All', ...Array.from(new Set(CATALOG.map(t => t.category)))]

// ─── Component ────────────────────────────────────────────────────────────────

interface ToolsPickerProps {
  value: ProjectTool[]
  onChange: (tools: ProjectTool[]) => void
  compact?: boolean   // smaller variant for edit form
}

export const ToolsPicker: React.FC<ToolsPickerProps> = ({ value, onChange, compact = false }) => {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Close panel on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selectedIds = new Set(value.map(t => t.id))

  const filtered = useMemo(() => {
    let list = CATALOG
    if (category !== 'All') list = list.filter(t => t.category === category)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.abbr.toLowerCase().includes(q)
      )
    }
    return list
  }, [category, search])

  const toggleTool = (tool: CatalogTool) => {
    if (selectedIds.has(tool.id)) {
      onChange(value.filter(t => t.id !== tool.id))
      if (expandedId === tool.id) setExpandedId(null)
    } else {
      onChange([...value, { ...tool, url: '' }])
    }
  }

  const updateUrl = (id: string, url: string) => {
    onChange(value.map(t => t.id === id ? { ...t, url } : t))
  }

  const removeTool = (id: string) => {
    onChange(value.filter(t => t.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  const labelClass = compact
    ? 'text-xs font-medium text-gray-600 mb-1.5 flex items-center gap-1'
    : 'text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5'

  return (
    <div className="relative" ref={panelRef}>
      {/* Label */}
      <div className={`flex items-center justify-between mb-2`}>
        <label className={labelClass}>
          <span className={`${compact ? 'text-xs' : 'text-sm'} font-medium text-gray-${compact ? '600' : '700'}`}>
            Tools & Integrations
          </span>
          {value.length > 0 && (
            <span className={`ml-1 ${compact ? 'text-[10px]' : 'text-xs'} bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-semibold`}>
              {value.length}
            </span>
          )}
        </label>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className={`flex items-center gap-1 ${compact ? 'text-xs' : 'text-xs'} text-indigo-600 hover:text-indigo-700 font-medium transition-colors`}
        >
          <Plus size={compact ? 11 : 12} />
          Add Tool
        </button>
      </div>

      {/* Selected tools chips */}
      {value.length === 0 ? (
        <p className={`${compact ? 'text-[11px]' : 'text-xs'} text-gray-400`}>
          No tools added — click "Add Tool" to connect your stack.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2 mb-1">
          {value.map(tool => (
            <div key={tool.id} className="flex flex-col">
              {/* Tool chip */}
              <div
                className={`flex items-center gap-1.5 px-2.5 ${compact ? 'py-1' : 'py-1.5'} rounded-xl border cursor-pointer select-none group transition-all ${
                  expandedId === tool.id
                    ? 'border-indigo-300 bg-indigo-50 shadow-sm'
                    : 'border-gray-200 bg-gray-50 hover:border-indigo-200 hover:bg-indigo-50/50'
                }`}
                onClick={() => setExpandedId(expandedId === tool.id ? null : tool.id)}
              >
                {/* Color swatch / abbr */}
                <span
                  className={`${compact ? 'w-4 h-4 text-[8px]' : 'w-5 h-5 text-[9px]'} rounded-md flex items-center justify-center text-white font-bold shrink-0`}
                  style={{ backgroundColor: tool.color }}
                >
                  {tool.abbr.slice(0, 2)}
                </span>
                <span className={`${compact ? 'text-[11px]' : 'text-xs'} font-medium text-gray-700`}>{tool.name}</span>
                {tool.url && (
                  <ExternalLink size={9} className="text-indigo-400 shrink-0" />
                )}
                <ChevronDown
                  size={10}
                  className={`text-gray-400 shrink-0 transition-transform ${expandedId === tool.id ? 'rotate-180' : ''}`}
                />
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); removeTool(tool.id) }}
                  className="ml-0.5 text-gray-300 hover:text-red-400 transition-colors shrink-0"
                >
                  <X size={10} />
                </button>
              </div>

              {/* URL input (expanded) */}
              {expandedId === tool.id && (
                <div className="mt-1 flex items-center gap-1.5 animate-fade-in">
                  <input
                    type="url"
                    value={tool.url || ''}
                    onChange={e => updateUrl(tool.id, e.target.value)}
                    placeholder={`${tool.name} dashboard URL (optional)`}
                    className="flex-1 border border-indigo-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white min-w-0"
                    autoFocus
                    onClick={e => e.stopPropagation()}
                  />
                  {tool.url && (
                    <a
                      href={tool.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-indigo-400 hover:text-indigo-600 transition-colors shrink-0"
                    >
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Dropdown panel ── */}
      {open && (
        <div className="absolute left-0 z-50 mt-2 w-full min-w-[340px] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-scale-in">
          {/* Search */}
          <div className="px-3 pt-3 pb-2">
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search tools…"
                className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-gray-50"
              />
            </div>
          </div>

          {/* Category tabs */}
          <div className="px-3 pb-2 flex gap-1 overflow-x-auto no-scrollbar">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`shrink-0 px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
                  category === cat
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Tool grid */}
          <div className="overflow-y-auto max-h-52 px-3 pb-3">
            {filtered.length === 0 ? (
              <p className="text-center text-xs text-gray-400 py-6">No tools found</p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {filtered.map(tool => {
                  const isSelected = selectedIds.has(tool.id)
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => toggleTool(tool)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all border ${
                        isSelected
                          ? 'border-indigo-200 bg-indigo-50 shadow-sm'
                          : 'border-transparent hover:bg-gray-50 hover:border-gray-200'
                      }`}
                    >
                      {/* Logo swatch */}
                      <span
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-[9px] shrink-0"
                        style={{ backgroundColor: tool.color }}
                      >
                        {tool.abbr.slice(0, 2)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate">{tool.name}</p>
                        <p className="text-[10px] text-gray-400 truncate">{tool.category}</p>
                      </div>
                      {isSelected && (
                        <span className="w-4 h-4 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                            <path d="M1.5 4L3.5 6L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-2.5 border-t border-gray-100 flex items-center justify-between">
            <p className="text-[10px] text-gray-400">{value.length} tool{value.length !== 1 ? 's' : ''} selected</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-indigo-600 font-medium hover:text-indigo-700"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
