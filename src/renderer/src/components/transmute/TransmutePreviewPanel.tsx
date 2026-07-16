import React, { useEffect, useMemo, useRef } from 'react'
import type { TransmuteConfig } from '../../types'
import {
  buildStacksForTransmute,
  drawFrame,
  frameBatchSize,
  resolutionDimensions
} from '../../engine/videoRenderer'
import { resolutionLabel } from '../../engine/transmuteWizard'

const PREVIEW_TEXT =
  'Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet. Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet.'

const MAX_PW = 300
const MAX_PH = 380

interface Props {
  config: TransmuteConfig
  estimate: React.ReactNode
}

export default function TransmutePreviewPanel({ config, estimate }: Props) {
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)

  // Preview stacks from Lorem Ipsum, rebuilt whenever word-chunking-relevant config changes
  const previewStacks = useMemo(
    () => buildStacksForTransmute(PREVIEW_TEXT, config),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.wordsPerStack, config.chunkRuleLongWord, config.chunkRuleEnumerations,
      config.chunkRuleBullets, config.chunkRuleCommas, config.chunkRuleNames]
  )

  // Build the batch of stacks to show in a single preview frame
  const previewBatchSize = frameBatchSize(config)
  const previewBatch = useMemo(
    () =>
      previewStacks
        .slice(0, previewBatchSize)
        .map((s) => ({ words: s.words, isHeadline: s.type === 'headline' })),
    [previewStacks, previewBatchSize]
  )

  // Compute preview frame dimensions
  const { width: vw, height: vh } = useMemo(
    () => resolutionDimensions(config.resolution),
    [config.resolution]
  )
  const previewScale = Math.min(MAX_PW / vw, MAX_PH / vh)
  const previewW = Math.round(vw * previewScale)
  const previewH = Math.round(vh * previewScale)

  // Redraw the preview canvas whenever visually-relevant config or preview batch changes
  useEffect(() => {
    const canvas = previewCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const batch =
      previewBatch.length > 0
        ? previewBatch
        : [{ words: ['Lorem', 'ipsum'], isHeadline: false }]
    drawFrame(ctx, batch, config, vw, vh, config.showProgressOverlay ? 0.5 : undefined)
  }, [
    config,
    previewBatch,
    vw,
    vh
  ])

  return (
    <div className="transmute-preview-panel">
      <p className="transmute-preview-title">Preview</p>
      <div
        className="transmute-preview-outer"
        style={{ width: previewW, height: previewH }}
      >
        <canvas
          ref={previewCanvasRef}
          width={vw}
          height={vh}
          style={{
            width: previewW,
            height: previewH,
            display: 'block'
          }}
        />
      </div>
      <p className="transmute-preview-hint">
        {resolutionLabel(config.resolution)} &ensp;&middot;&ensp;{vw}x{vh}
      </p>
      {estimate}
    </div>
  )
}
