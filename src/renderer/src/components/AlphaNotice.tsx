import React from 'react'

interface AlphaNoticeProps {
  /** The surface's own `alphaChrome.*Enabled` flag. Renders nothing when false, so
   *  call sites do not each repeat an `{enabled && ...}` conditional. */
  enabled: boolean
  /** aria-label for the `role="status"` region — distinct per surface. */
  label: string
  /** Notice copy — one of the `alphaChrome.*Copy` constants. */
  children: React.ReactNode
  /** Call-site spacing only; the component carries no layout opinion of its own. */
  style?: React.CSSProperties
}

/**
 * Shared alpha warning banner (ADR-0022 `.warnings-box`; PRD D6).
 *
 * One presentation for every "this surface is rough" notice in the release —
 * Transmute, RWW, EPUB import, Portable drive creation — instead of four
 * hand-rolled copies. Non-dismissible by design: it renders the flag's copy
 * as-is, with no close affordance.
 */
export default function AlphaNotice({ enabled, label, children, style }: AlphaNoticeProps) {
  if (!enabled) return null
  return (
    <div className="warnings-box" role="status" aria-label={label} style={style}>
      {children}
    </div>
  )
}
