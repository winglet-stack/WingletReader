import React from 'react'

/** Settings landing and other single-ink chrome icons (ADR-0022). */
export type ChromeIconName =
  | 'appearance'
  | 'reader-defaults'
  | 'overlay-reader'
  | 'import'
  | 'data'

interface Props {
  name: ChromeIconName
  className?: string
}

const PATHS: Record<ChromeIconName, React.ReactNode> = {
  appearance: (
    <>
      <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" />
      <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round">
        <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </g>
    </>
  ),
  'reader-defaults': (
    <>
      <rect x="4" y="5" width="16" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 9h8M8 12h8M8 15h5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </>
  ),
  'overlay-reader': (
    <>
      <rect x="3" y="7" width="13" height="9" fill="currentColor" opacity="0.35" stroke="none" />
      <rect x="8" y="4" width="13" height="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  import: (
    <>
      <path d="M12 4v10M8 10l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 18h14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  data: (
    <>
      <ellipse cx="12" cy="7" rx="7" ry="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 7v5c0 1.66 3.13 3 7 3s7-1.34 7-3V7M5 12v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
}

/** 24×24 single-ink SVG; colour inherited via `currentColor` (ADR-0022 §5.2). */
export default function ChromeIcon({ name, className }: Props) {
  return (
    <svg
      className={className ?? 'chrome-icon'}
      viewBox="0 0 24 24"
      width="32"
      height="32"
      aria-hidden="true"
      fill="currentColor"
      stroke="none"
    >
      {PATHS[name]}
    </svg>
  )
}
