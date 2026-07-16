import React from 'react'
import type { TransmuteConfig } from '../../types'
import { resolutionDimensions } from '../../engine/videoRenderer'
import {
  chunkRulesLabel,
  contentLimitLabel,
  effectiveBgColor,
  fontLabel,
  highlightLabel,
  layoutLabel,
  maxDurationLabel,
  onOffLabel,
  pausesLabel,
  positionLabel,
  readerColorsLabel,
  resolutionLabel,
  spacingLabel,
  speedLabel,
  stackCountLabel,
  type OverviewSectionKey,
  type TransmuteWizardStep
} from '../../engine/transmuteWizard'

interface Props {
  config: TransmuteConfig
  selectedTitle: string | undefined
  selectedSegmentTitle: string | null
  stackCount: number
  overviewOpen: Record<OverviewSectionKey, boolean>
  onToggleSection: (key: OverviewSectionKey) => void
  onEditStep: (step: TransmuteWizardStep) => void
  onBack: () => void
  onRender: () => void
  renderDisabled: boolean
}

function OverviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="transmute-overview-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

interface OverviewSectionProps {
  title: string
  open: boolean
  onToggle: () => void
  onEdit: () => void
  children: React.ReactNode
}

function OverviewSection({ title, open, onToggle, onEdit, children }: OverviewSectionProps) {
  return (
    <section className="transmute-overview-section">
      <div className="transmute-overview-header">
        <button
          type="button"
          className="transmute-overview-toggle"
          onClick={onToggle}
          aria-expanded={open}
        >
          <span>{open ? 'v' : '>'}</span>
          {title}
        </button>
        <button type="button" className="btn-ghost btn-small" onClick={onEdit}>
          Edit
        </button>
      </div>
      {open && (
        <dl className="transmute-overview-body">
          {children}
        </dl>
      )}
    </section>
  )
}

function BackgroundColorValue({ config }: { config: TransmuteConfig }) {
  if (config.transparentBackground) return <>Transparent</>
  return (
    <span className="transmute-color-summary">
      <span
        className="transmute-color-swatch"
        style={{ background: effectiveBgColor(config) }}
        aria-hidden="true"
      />
      {effectiveBgColor(config)}
    </span>
  )
}

export default function TransmuteOverviewStep({
  config,
  selectedTitle,
  selectedSegmentTitle,
  stackCount,
  overviewOpen,
  onToggleSection,
  onEditStep,
  onBack,
  onRender,
  renderDisabled
}: Props) {
  const { width: vw, height: vh } = resolutionDimensions(config.resolution)

  return (
    <>
      <div className="transmute-overview">
        <OverviewSection
          title="Scope and Content"
          open={overviewOpen.scope}
          onToggle={() => onToggleSection('scope')}
          onEdit={() => onEditStep('scope')}
        >
          <OverviewRow label="Source" value={selectedTitle ?? 'Untitled'} />
          <OverviewRow label="Scope" value={selectedSegmentTitle ?? 'Whole book'} />
          <OverviewRow label="Content amount" value={contentLimitLabel(config)} />
          <OverviewRow label="Max duration" value={maxDurationLabel(config.maxDurationMinutes)} />
          <OverviewRow label="Generated stacks" value={stackCountLabel(stackCount)} />
        </OverviewSection>

        <OverviewSection
          title="Video Output"
          open={overviewOpen.video}
          onToggle={() => onToggleSection('video')}
          onEdit={() => onEditStep('video')}
        >
          <OverviewRow label="Resolution" value={`${resolutionLabel(config.resolution)} (${vw}x${vh})`} />
          <OverviewRow label="Progress overlay" value={onOffLabel(config.showProgressOverlay)} />
          <OverviewRow label="Transparent background" value={onOffLabel(config.transparentBackground)} />
          <OverviewRow label="Background color" value={<BackgroundColorValue config={config} />} />
        </OverviewSection>

        <OverviewSection
          title="Transmute Reader Settings"
          open={overviewOpen.reader}
          onToggle={() => onToggleSection('reader')}
          onEdit={() => onEditStep('reader')}
        >
          <OverviewRow label="Speed" value={speedLabel(config)} />
          <OverviewRow label="Words per stack" value={config.wordsPerStack} />
          <OverviewRow label="Pauses" value={pausesLabel(config)} />
          <OverviewRow label="Font" value={fontLabel(config)} />
          <OverviewRow label="Reader colors" value={readerColorsLabel(config)} />
          <OverviewRow label="Highlight" value={highlightLabel(config)} />
          <OverviewRow label="Layout" value={layoutLabel(config)} />
          <OverviewRow label="Spacing" value={spacingLabel(config)} />
          <OverviewRow label="Position" value={positionLabel(config)} />
          <OverviewRow label="Chunk dividers" value={onOffLabel(config.showChunkDividers)} />
          <OverviewRow label="Chunk rules" value={chunkRulesLabel(config)} />
        </OverviewSection>
      </div>

      <div className="transmute-actions transmute-actions--split transmute-overview-actions">
        <button className="btn-ghost" onClick={onBack}>
          Back to Reader Settings
        </button>
        <button
          className="btn-primary transmute-render-btn"
          onClick={onRender}
          disabled={renderDisabled}
        >
          &#9654; Render Video
        </button>
      </div>
    </>
  )
}
