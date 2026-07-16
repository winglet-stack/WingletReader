import React, { useCallback, useEffect, useState } from 'react'
import type { Settings } from '../types'

type Theme = Settings['theme']
type AppRegionStyle = React.CSSProperties & {
  WebkitAppRegion?: 'drag' | 'no-drag'
}
type StandbyPillApiWindow = Window & {
  api: {
    db: {
      getSettings(): Promise<Settings>
    }
    readWhileWorking: {
      exit(): Promise<{ ok: boolean }>
    }
  }
}

function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light'
}

function getApi() {
  return (window as unknown as StandbyPillApiWindow).api
}

const transparentDocumentStyle = {
  background: 'transparent',
  overflow: 'hidden',
  width: '100%',
  height: '100%'
}

function applyTransparentStyle(element: HTMLElement): Partial<CSSStyleDeclaration> {
  const previous = {
    background: element.style.background,
    overflow: element.style.overflow,
    width: element.style.width,
    height: element.style.height
  }
  Object.assign(element.style, transparentDocumentStyle)
  return previous
}

function restoreStyle(element: HTMLElement, previous: Partial<CSSStyleDeclaration>): void {
  Object.assign(element.style, previous)
}

function pillStyle(theme: Theme): AppRegionStyle {
  const light = theme === 'light'
  return {
    WebkitAppRegion: 'drag',
    width: '100vw',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: '8px 10px 8px 12px',
    border: light ? '1px solid #b9c0df' : '1px solid #48548b',
    borderRadius: 'var(--radius)',
    background: light ? 'rgba(255, 255, 255, 0.96)' : 'rgba(26, 26, 26, 0.96)',
    color: light ? '#1a1a1a' : '#ececec',
    boxShadow: light ? '0 6px 20px rgba(20, 20, 20, 0.18)' : '0 6px 22px rgba(7, 9, 18, 0.34)',
    userSelect: 'none'
  }
}

const statusStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 9
}

const markStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  objectFit: 'cover',
  borderRadius: '50%',
  flex: '0 0 auto'
}

const copyStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  lineHeight: 1.05
}

const titleStyle: React.CSSProperties = {
  fontSize: '0.82rem',
  fontWeight: 700,
  whiteSpace: 'nowrap'
}

function stateStyle(theme: Theme): React.CSSProperties {
  return {
    marginTop: 3,
    fontSize: '0.66rem',
    color: theme === 'light' ? '#5f5f5f' : '#8a8a8a',
    whiteSpace: 'nowrap'
  }
}

const exitStyle: AppRegionStyle = {
  WebkitAppRegion: 'no-drag',
  flex: '0 0 auto',
  width: 34,
  height: 34,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid #a74747',
  borderRadius: 'var(--radius)',
  background: 'rgba(224, 82, 82, 0.18)',
  color: 'inherit',
  fontSize: '0.78rem',
  fontWeight: 800,
  cursor: 'pointer'
}

export default function StandbyPill() {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const htmlStyle = applyTransparentStyle(document.documentElement)
    const bodyStyle = applyTransparentStyle(document.body)
    const root = document.getElementById('root')
    const rootStyle = root ? applyTransparentStyle(root) : null
    getApi().db.getSettings()
      .then((settings) => {
        if (isTheme(settings.theme)) setTheme(settings.theme)
      })
      .catch(() => {})

    return () => {
      restoreStyle(document.documentElement, htmlStyle)
      restoreStyle(document.body, bodyStyle)
      if (root && rootStyle) restoreStyle(root, rootStyle)
    }
  }, [])

  const handleExit = useCallback(() => {
    getApi().readWhileWorking.exit().catch(() => {})
  }, [])

  return (
    <main
      className="standby-pill"
      data-theme={theme}
      aria-label="Overlay Reader standby control"
      style={pillStyle(theme)}
    >
      <div className="standby-pill__status" aria-hidden="true" style={statusStyle}>
        <img
          className="standby-pill__mark"
          src={theme === 'light' ? '/logo-on-light.png' : '/logo-on-dark.png'}
          alt=""
          style={markStyle}
        />
        <span className="standby-pill__copy" style={copyStyle}>
          <span className="standby-pill__title" style={titleStyle}>Overlay Reader</span>
          <span className="standby-pill__state" style={stateStyle(theme)}>On standby</span>
        </span>
      </div>
      <button
        type="button"
        className="standby-pill__exit"
        aria-label="Exit Overlay Reader"
        title="Exit Overlay Reader"
        onClick={handleExit}
        style={exitStyle}
      >
        X
      </button>
    </main>
  )
}
