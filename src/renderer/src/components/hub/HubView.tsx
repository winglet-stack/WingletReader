import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import readIconIdle from '../../assets/hub-tiles/read.png'
import readIconHover from '../../assets/hub-tiles/read-hover.gif'
import libraryIconIdle from '../../assets/hub-tiles/library.png'
import libraryIconHover from '../../assets/hub-tiles/library-hover.png'
import importIconIdle from '../../assets/hub-tiles/import.png'
import importIconHover from '../../assets/hub-tiles/import-hover.png'
import makeVideoIconIdle from '../../assets/hub-tiles/make-video.png'
import makeVideoIconHover from '../../assets/hub-tiles/make-video-hover.png'
import settingsIconIdle from '../../assets/hub-tiles/settings.png'
import settingsIconHover from '../../assets/hub-tiles/settings-hover.gif'
import overlayReaderIconIdle from '../../assets/hub-tiles/overlay-reader.png'
import overlayReaderIconHover from '../../assets/hub-tiles/overlay-reader-hover.gif'
import { useNavigation } from '../../contexts/NavigationContext'
import { useLibrary } from '../../contexts/LibraryContext'
import { useReader } from '../../contexts/ReaderContext'
import { useSettings } from '../../contexts/SettingsContext'
import HubStatsBanner from './HubStatsBanner'

/**
 * Console hub (ADR-0011 / ADR-0012 §3 / ADR-0013 §2-3 — compact 3×2 grid).
 *
 * One flat surface holding a 3×2 grid of ~190px square cards. Read and RWW —
 * the two starred reading features — wear the red VIP accent; the remaining four
 * take the cobalt/gray treatment. Thematic rows:
 *   Read · Library · RWW    (reading / consume row)
 *   Import · Make Video · Settings  (manage / produce row)
 *
 * Interaction is mouse-first (hover focuses + highlights a card, a click
 * anywhere on it activates) with a secondary roving-`tabindex` keyboard model:
 * a full 2-D grid nav (left/right move a column within a row, up/down move a
 * row, wrapping at edges), Enter/Space activate, Esc returns focus to Read.
 * Motion is opt-in only and honours `prefers-reduced-motion` via the stylesheet.
 *
 * Library opens the standalone management screen. Import opens its own top-level
 * view. Make Video opens the dedicated launchpad which routes into TransmuteView.
 */

// 3×2 grid; the 2-D keyboard nav assumes this width.
const HUB_COLS = 3

interface HubViewProps {
  appVersion: string | null
}

interface HubTile {
  id: string
  label: string
  glyph: string
  /** Optional DisplayKit sprite pair (idle + hover); same art in light and dark. Hover may be GIF. */
  glyphIdleSrc?: string
  glyphHoverSrc?: string
  /** Description caption shown in place beneath the card's label. */
  lcd: string
  /** Visual loading flag while an async destination resolves. */
  busy?: boolean
  onActivate: () => void
}

export default function HubView({ appVersion }: HubViewProps) {
  const { setView, openGlobalSettings, openOverlayReaderSettings } = useNavigation()
  const { texts } = useLibrary()
  const { resumeCandidate, resumeReader } = useReader()
  const { settings } = useSettings()

  const [activeIndex, setActiveIndex] = useState(0)
  const [readBusy, setReadBusy] = useState(false)
  const tileRefs = useRef<Array<HTMLButtonElement | null>>([])
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  // One-time splash→hub settle: play only on the first hub paint of this launch
  // (the hand-off from the splash), not on every in-app return to the hub. The
  // sessionStorage flag resets on app relaunch, which is exactly when the splash
  // shows again. Reduced-motion is owned by the stylesheet, so the class is safe
  // to apply unconditionally.
  const [settle] = useState(() => {
    try {
      return typeof sessionStorage !== 'undefined'
        && sessionStorage.getItem('wr.hub.settled') === null
    } catch {
      return false
    }
  })
  useEffect(() => {
    if (!settle) return
    try { sessionStorage.setItem('wr.hub.settled', '1') } catch { /* non-fatal */ }
  }, [settle])

  // Read's LCD: live resume title + an estimated %, or a no-resume / no-texts
  // hint. The estimate is intentionally coarse (stack index over a words-per-
  // stack approximation of the text length) — exact progress is the Reader's job.
  const readLcd = useMemo(() => {
    if (resumeCandidate) {
      const text = texts.find((t) => t.id === resumeCandidate.textId)
      const perStack = Math.max(1, settings.words_per_stack || 1)
      const totalStacks = text?.word_count
        ? Math.max(1, Math.ceil(text.word_count / perStack))
        : 0
      const pct = totalStacks
        ? Math.min(99, Math.max(1, Math.round((resumeCandidate.stackIndex / totalStacks) * 100)))
        : null
      return pct === null
        ? `Resume "${resumeCandidate.title}"`
        : `Resume "${resumeCandidate.title}" · ${pct}%`
    }
    if (texts.length === 0) return 'No texts yet — Import a text to begin reading'
    return 'No saved place — pick a text to start reading'
  }, [resumeCandidate, texts, settings.words_per_stack])

  // Read always opens the Reader (ADR-0012 §5): resume the saved session when one
  // exists, otherwise enter the Reader's in-place idle picker (no Library detour).
  const handleRead = useCallback(async () => {
    if (!resumeCandidate) {
      setView('reader')
      return
    }
    setReadBusy(true)
    try {
      await resumeReader()
    } finally {
      if (mountedRef.current) setReadBusy(false)
    }
  }, [resumeCandidate, resumeReader, setView])

  const makeVideoLcd = useMemo(() => {
    if (texts.length === 0) return 'Choose a source to render a speed-reading video'
    return `Choose a source — ${texts.length} text${texts.length === 1 ? '' : 's'} in library`
  }, [texts.length])

  const tiles = useMemo<HubTile[]>(() => [
    // Row 1 — reading / consume
    {
      id: 'read',
      label: 'Read',
      glyph: '',
      glyphIdleSrc: readIconIdle,
      glyphHoverSrc: readIconHover,
      lcd: readLcd,
      busy: readBusy,
      onActivate: handleRead,
    },
    {
      id: 'library',
      label: 'Library',
      glyph: '',
      glyphIdleSrc: libraryIconIdle,
      glyphHoverSrc: libraryIconHover,
      lcd: 'Browse and manage your texts',
      onActivate: () => setView('library'),
    },
    {
      id: 'rww',
      label: 'Overlay Reader',
      glyph: '',
      glyphIdleSrc: overlayReaderIconIdle,
      glyphHoverSrc: overlayReaderIconHover,
      lcd: 'Settings for reading while you work',
      onActivate: openOverlayReaderSettings,
    },
    // Row 2 — manage / produce
    {
      id: 'import',
      label: 'Import',
      glyph: '',
      glyphIdleSrc: importIconIdle,
      glyphHoverSrc: importIconHover,
      lcd: 'Drop a .txt, .docx, or .pdf — or paste text',
      onActivate: () => setView('import'),
    },
    {
      id: 'make-video',
      label: 'Make Video',
      glyph: '',
      glyphIdleSrc: makeVideoIconIdle,
      glyphHoverSrc: makeVideoIconHover,
      lcd: makeVideoLcd,
      onActivate: () => setView('make-video'),
    },
    {
      id: 'settings',
      label: 'Settings',
      glyph: '',
      glyphIdleSrc: settingsIconIdle,
      glyphHoverSrc: settingsIconHover,
      lcd: 'App preferences & reader defaults',
      onActivate: openGlobalSettings,
    },
  ], [readLcd, readBusy, handleRead, makeVideoLcd, setView, openGlobalSettings, openOverlayReaderSettings])

  const focusTile = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, tiles.length - 1))
    setActiveIndex(clamped)
    tileRefs.current[clamped]?.focus()
  }, [tiles.length])

  // 2-D roving grid nav over the 3-column grid. Left/right move a column within
  // the row (wrapping at row edges); up/down move a row (wrapping top/bottom).
  // The 3×2 grid is always full; the shorter-row clamp is a harmless no-op.
  const moveFocus = useCallback((index: number, dCol: number, dRow: number) => {
    const total = tiles.length
    const rows = Math.ceil(total / HUB_COLS)
    const row = Math.floor(index / HUB_COLS)
    const col = index % HUB_COLS
    const itemsInRow = (r: number) => Math.min(HUB_COLS, total - r * HUB_COLS)
    if (dCol !== 0) {
      const width = itemsInRow(row)
      const nextCol = (col + dCol + width) % width
      focusTile(row * HUB_COLS + nextCol)
      return
    }
    const nextRow = (row + dRow + rows) % rows
    const nextCol = Math.min(col, itemsInRow(nextRow) - 1)
    focusTile(nextRow * HUB_COLS + nextCol)
  }, [tiles.length, focusTile])

  const handleKeyDown = useCallback((event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault()
        moveFocus(index, 1, 0)
        break
      case 'ArrowLeft':
        event.preventDefault()
        moveFocus(index, -1, 0)
        break
      case 'ArrowDown':
        event.preventDefault()
        moveFocus(index, 0, 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        moveFocus(index, 0, -1)
        break
      case 'Home':
        event.preventDefault()
        focusTile(0)
        break
      case 'End':
        event.preventDefault()
        focusTile(tiles.length - 1)
        break
      case 'Escape':
        event.preventDefault()
        focusTile(0) // Esc returns focus to Read (leftmost).
        break
      default:
        break
    }
  }, [moveFocus, focusTile, tiles.length])

  return (
    <div className={`hub${settle ? ' hub--settle' : ''}`}>
      <div className="hub-face">
        {/* The banner is the header row's middle child, not a row of its own:
            the row is already 96px tall because of the dove, so the banner
            costs the hub face no height and nothing below it moves. */}
        <header className="hub-header">
          <img src="/logo-on-dark.png" alt="" aria-hidden="true" className="hub-identity-dove" />
          <HubStatsBanner />
          <span className="hub-status" aria-label="App version">
            <span className="hub-status-name">Alpha</span>
            {appVersion && <span className="hub-status-version">{appVersion}</span>}
          </span>
        </header>

        <div
          className="hub-tiles"
          role="toolbar"
          aria-label="WingletReader launcher"
        >
          {tiles.map((tile, index) => {
            // Read + RWW are the two starred reading features (the VIP red accent).
            const vip = tile.id === 'read' || tile.id === 'rww'
            return (
              <button
                key={tile.id}
                ref={(el) => { tileRefs.current[index] = el }}
                type="button"
                className={`hub-tile${vip ? ' hub-tile--vip' : ''}${activeIndex === index ? ' hub-tile--active' : ''}`}
                aria-label={tile.label}
                aria-busy={tile.busy || undefined}
                tabIndex={activeIndex === index ? 0 : -1}
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                onClick={tile.onActivate}
              >
                <span
                  className={`hub-tile-glyph${tile.glyphIdleSrc ? ' hub-tile-glyph--img' : ''}`}
                  aria-hidden="true"
                >
                  {tile.glyphIdleSrc ? (
                    <>
                      <img
                        className="hub-tile-glyph-img hub-tile-glyph-img--idle"
                        src={tile.glyphIdleSrc}
                        alt=""
                      />
                      <img
                        className="hub-tile-glyph-img hub-tile-glyph-img--hover"
                        src={tile.glyphHoverSrc}
                        alt=""
                      />
                    </>
                  ) : (
                    tile.glyph
                  )}
                </span>
                <span className="hub-tile-label">{tile.label}</span>
                <span className="hub-tile-desc">{tile.lcd}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
