import React from 'react'
import {
  GitBranch, ExternalLink, Link2, Layout,
} from 'lucide-react'

interface LinksTabProps {
  selectedProject: any
  detailProject: any
}

export const LinksTab: React.FC<LinksTabProps> = ({ selectedProject, detailProject }) => {
  return (
    <div className="space-y-3">
      {selectedProject.repo_url && (
        <a
          href={selectedProject.repo_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors group"
        >
          <div className="w-10 h-10 bg-gray-800 rounded-xl flex items-center justify-center shrink-0">
            <GitBranch size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800">Git Repository</p>
            <p className="text-xs text-gray-400 truncate">{selectedProject.repo_url}</p>
          </div>
          <ExternalLink size={15} className="text-gray-300 group-hover:text-blue-500 shrink-0 transition-colors" />
        </a>
      )}

      {detailProject?.figma_url ? (
        <a
          href={detailProject.figma_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100 hover:border-purple-200 hover:bg-purple-50/30 transition-colors group"
        >
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shrink-0">
            <Layout size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800">Figma Design</p>
            <p className="text-xs text-gray-400 truncate">{detailProject.figma_url}</p>
          </div>
          <ExternalLink size={15} className="text-gray-300 group-hover:text-purple-500 shrink-0 transition-colors" />
        </a>
      ) : (
        <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
          <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center shrink-0">
            <Layout size={18} className="text-gray-300" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">No Figma link</p>
            <p className="text-xs text-gray-400">Edit the project to add a Figma design URL</p>
          </div>
        </div>
      )}

      {detailProject?.links?.filter((l: any) => l.url).map((l: any, idx: number) => (
        <a
          key={idx}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors group"
        >
          <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center shrink-0">
            <Link2 size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800">{l.title || 'Link'}</p>
            <p className="text-xs text-gray-400 truncate">{l.url}</p>
          </div>
          <ExternalLink size={15} className="text-gray-300 group-hover:text-blue-500 shrink-0 transition-colors" />
        </a>
      ))}

      {detailProject?.tools?.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 bg-indigo-500 rounded-sm inline-block" />
            Tools & Integrations
          </p>
          <div className="grid grid-cols-2 gap-2">
            {detailProject.tools.map((tool: any) => (
              tool.url ? (
                <a
                  key={tool.id}
                  href={tool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors group"
                >
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-[10px] shrink-0"
                    style={{ backgroundColor: tool.color || '#6264A7' }}
                  >
                    {(tool.abbr || tool.name || '?').slice(0, 2)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{tool.name}</p>
                    <p className="text-[10px] text-gray-400 truncate">{tool.url}</p>
                  </div>
                  <ExternalLink size={12} className="text-gray-300 group-hover:text-indigo-500 shrink-0 transition-colors" />
                </a>
              ) : (
                <div
                  key={tool.id}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100"
                >
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-[10px] shrink-0"
                    style={{ backgroundColor: tool.color || '#6264A7' }}
                  >
                    {(tool.abbr || tool.name || '?').slice(0, 2)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{tool.name}</p>
                    <p className="text-[10px] text-gray-400">{tool.category}</p>
                  </div>
                </div>
              )
            ))}
          </div>
        </div>
      )}

      {(!selectedProject.repo_url && !detailProject?.figma_url && !detailProject?.links?.filter((l: any) => l.url)?.length && !detailProject?.tools?.length) && (
        <div className="text-center py-12 text-gray-400">
          <Link2 size={28} className="mx-auto mb-2 text-gray-200" />
          <p className="text-sm">No links added yet</p>
          <p className="text-xs mt-1">Edit the project to add repository or Figma links</p>
        </div>
      )}
    </div>
  )
}
