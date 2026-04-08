import React from 'react'
import { OverviewTab } from './tabs/OverviewTab'
import { MembersTab } from './tabs/MembersTab'
import { TasksTab } from './tabs/TasksTab'
import { RepoTab } from './tabs/RepoTab'
import { LinksTab } from './tabs/LinksTab'

interface TabsProps {
  selectedProject: any
  detailProject: any
  detailLoading: boolean
  activeDetailTab: string
  commits: any[]
  commitsTotal: number
  commitsLoading: boolean
  commitsError: string
  contributorStats: any[]
  contributorStatsLoading: boolean
  contributorStatsError: string
  commitEmailFilter: string
  commitDayFilter: string
  setCommitEmailFilter: (v: string) => void
  setCommitDayFilter: (v: string) => void
  showInlineTokenForm: boolean
  setShowInlineTokenForm: (v: boolean | ((prev: boolean) => boolean)) => void
  inlineToken: string
  setInlineToken: (v: string) => void
  showInlineTokenValue: boolean
  setShowInlineTokenValue: (v: boolean | ((prev: boolean) => boolean)) => void
  tokenSaving: boolean
  tokenSaveError: string
  setTokenSaveError: (v: string) => void
  handleUpdateToken: () => void
}

export const ProjectDetailTabs: React.FC<TabsProps> = ({
  selectedProject, detailProject, detailLoading, activeDetailTab,
  commits, commitsTotal, commitsLoading, commitsError,
  contributorStats, contributorStatsLoading, contributorStatsError,
  commitEmailFilter, commitDayFilter, setCommitEmailFilter, setCommitDayFilter,
  showInlineTokenForm, setShowInlineTokenForm, inlineToken, setInlineToken,
  showInlineTokenValue, setShowInlineTokenValue, tokenSaving, tokenSaveError, setTokenSaveError,
  handleUpdateToken,
}) => {
  return (
    <div className="p-6">
      {activeDetailTab === 'overview' && (
        <OverviewTab
          selectedProject={selectedProject}
          detailProject={detailProject}
          detailLoading={detailLoading}
          contributorStats={contributorStats}
          contributorStatsLoading={contributorStatsLoading}
          contributorStatsError={contributorStatsError}
        />
      )}

      {activeDetailTab === 'members' && (
        <MembersTab
          detailProject={detailProject}
          detailLoading={detailLoading}
        />
      )}

      {activeDetailTab === 'tasks' && (
        <TasksTab
          detailProject={detailProject}
          detailLoading={detailLoading}
        />
      )}

      {activeDetailTab === 'repo' && (
        <RepoTab
          selectedProject={selectedProject}
          commits={commits}
          commitsTotal={commitsTotal}
          commitsLoading={commitsLoading}
          commitsError={commitsError}
          commitEmailFilter={commitEmailFilter}
          commitDayFilter={commitDayFilter}
          setCommitEmailFilter={setCommitEmailFilter}
          setCommitDayFilter={setCommitDayFilter}
          showInlineTokenForm={showInlineTokenForm}
          setShowInlineTokenForm={setShowInlineTokenForm}
          inlineToken={inlineToken}
          setInlineToken={setInlineToken}
          showInlineTokenValue={showInlineTokenValue}
          setShowInlineTokenValue={setShowInlineTokenValue}
          tokenSaving={tokenSaving}
          tokenSaveError={tokenSaveError}
          setTokenSaveError={setTokenSaveError}
          handleUpdateToken={handleUpdateToken}
        />
      )}

      {activeDetailTab === 'links' && (
        <LinksTab
          selectedProject={selectedProject}
          detailProject={detailProject}
        />
      )}
    </div>
  )
}
