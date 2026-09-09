/**
 * Route table — the one module where a destination declares what renders it,
 * what chrome it carries, and whether it is live.
 *
 * These are pure-data assertions over the table plus its resolver; the shell's
 * consumption of them is covered by readWhileWorking.test.tsx (corner chrome),
 * appShellReaderRouting.test.tsx and shellDeadRouteFallback.test.tsx.
 *
 * Environment: happy-dom (the module imports the view components).
 */
import React from 'react'
import { describe, expect, it } from 'vitest'
import {
  APP_VIEWS,
  FALLBACK_VIEW,
  ROUTE_TABLE,
  resolveRoute,
  type AppView,
  type RouteDefinition,
  type RouteRenderContext,
  type RouteState,
  type RouteTable,
} from '../appShell/routeTable'

function state(overrides: Partial<RouteState> = {}): RouteState {
  return {
    libraryTab: 'list',
    settingsSubview: null,
    settingsSubviewOrigin: 'settings',
    rwwSettingsTab: 'overlay',
    ...overrides,
  }
}

const RETIRED_TOKENS = ['showcase', 'mode-choice', 'summaries', 'primer', 'trailer']

describe('route table — the destination set', () => {
  it('declares exactly the nine destinations the app has', () => {
    expect([...APP_VIEWS]).toEqual([
      'hub',
      'library',
      'import',
      'make-video',
      'add-chapter',
      'reader',
      'settings',
      'transmute',
      'stats',
    ])
  })

  it('has one entry per declared destination and no others', () => {
    expect(Object.keys(ROUTE_TABLE).sort()).toEqual([...APP_VIEWS].sort())
  })

  it('carries no entry for the retired alpha tokens', () => {
    for (const token of RETIRED_TOKENS) {
      expect(Object.keys(ROUTE_TABLE)).not.toContain(token)
    }
  })

  it('gives every destination a renderer, a chrome policy and a liveness flag', () => {
    for (const view of APP_VIEWS) {
      const definition = ROUTE_TABLE[view]
      expect(typeof definition.render).toBe('function')
      expect(typeof definition.chrome).toBe('function')
      expect(typeof definition.live).toBe('boolean')
    }
  })

  it('mounts only the hub as a whole-window destination', () => {
    const windowRoutes = APP_VIEWS.filter((view) => ROUTE_TABLE[view].layout === 'window')
    expect(windowRoutes).toEqual(['hub'])
  })
})

describe('route table — resolution is the single dead-route enforcement point', () => {
  it('resolves every live destination to itself', () => {
    for (const view of APP_VIEWS) {
      const route = resolveRoute<AppView>(view, ROUTE_TABLE, FALLBACK_VIEW)
      expect(route.id).toBe(view)
      expect(route.definition).toBe(ROUTE_TABLE[view])
    }
  })

  it('falls back for a retired or otherwise unknown token', () => {
    for (const token of [...RETIRED_TOKENS, '', 'nonsense']) {
      const route = resolveRoute<AppView>(token, ROUTE_TABLE, FALLBACK_VIEW)
      expect(route.id).toBe(FALLBACK_VIEW)
      expect(route.definition).toBe(ROUTE_TABLE[FALLBACK_VIEW])
    }
  })

  it('does not resolve inherited object keys as destinations', () => {
    expect(resolveRoute<AppView>('toString', ROUTE_TABLE, FALLBACK_VIEW).id).toBe(FALLBACK_VIEW)
  })

  it('keeps the fallback itself live, so resolution always lands somewhere real', () => {
    expect(ROUTE_TABLE[FALLBACK_VIEW].live).toBe(true)
  })
})

describe('route table — chrome policy (ADR-0020, ADR-0027)', () => {
  it('gives the hub and the Reader no shell chrome at all', () => {
    for (const view of ['hub', 'reader'] as const) {
      const chrome = ROUTE_TABLE[view].chrome(state())
      expect(chrome.corner).toEqual({ kind: 'none' })
      expect(chrome.gear).toBe(false)
      expect(chrome.rwwStartControl).toBe(false)
    }
  })

  it('shows the dove plus the gear on the plain inner screens', () => {
    for (const view of ['import', 'make-video', 'add-chapter', 'transmute', 'stats'] as const) {
      const chrome = ROUTE_TABLE[view].chrome(state())
      expect(chrome.corner).toEqual({ kind: 'home' })
      expect(chrome.gear).toBe(true)
    }
  })

  it('shows the dove and hides the gear on the Library list', () => {
    const chrome = ROUTE_TABLE.library.chrome(state({ libraryTab: 'list' }))
    expect(chrome.corner).toEqual({ kind: 'home' })
    expect(chrome.gear).toBe(false)
  })

  it('swaps the dove for the up-level control on the Library Contents view', () => {
    const chrome = ROUTE_TABLE.library.chrome(state({ libraryTab: 'chapters' }))
    expect(chrome.corner).toEqual({
      kind: 'up-level',
      label: 'Back to library',
      up: 'library-list',
    })
    expect(chrome.gear).toBe(false)
  })

  it('shows the dove on the Settings landing and hides the gear', () => {
    const chrome = ROUTE_TABLE.settings.chrome(state({ settingsSubview: null }))
    expect(chrome.corner).toEqual({ kind: 'home' })
    expect(chrome.gear).toBe(false)
  })

  it.each(['reader-defaults', 'import', 'data'] as const)(
    'sends the %s sub-page up one level to the Settings landing',
    (settingsSubview) => {
      const chrome = ROUTE_TABLE.settings.chrome(state({ settingsSubview }))
      expect(chrome.corner).toEqual({
        kind: 'up-level',
        label: 'Back to Settings',
        up: 'settings-landing',
      })
    }
  )

  it('keeps the Overlay Reader subview origin-aware', () => {
    const fromHub = ROUTE_TABLE.settings.chrome(
      state({ settingsSubview: 'overlay-reader', settingsSubviewOrigin: 'hub' })
    )
    expect(fromHub.corner).toEqual({ kind: 'up-level', label: 'Back to home', up: 'hub' })

    const fromSettings = ROUTE_TABLE.settings.chrome(
      state({ settingsSubview: 'overlay-reader', settingsSubviewOrigin: 'settings' })
    )
    expect(fromSettings.corner).toEqual({
      kind: 'up-level',
      label: 'Back to Settings',
      up: 'settings-landing',
    })
  })

  it('raises the Overlay Reader host control only on its Reader-configuration tab', () => {
    expect(
      ROUTE_TABLE.settings.chrome(
        state({ settingsSubview: 'overlay-reader', rwwSettingsTab: 'playback-grid' })
      ).rwwStartControl
    ).toBe(true)
    expect(
      ROUTE_TABLE.settings.chrome(
        state({ settingsSubview: 'overlay-reader', rwwSettingsTab: 'overlay' })
      ).rwwStartControl
    ).toBe(false)
    expect(
      ROUTE_TABLE.settings.chrome(
        state({ settingsSubview: 'reader-defaults', rwwSettingsTab: 'playback-grid' })
      ).rwwStartControl
    ).toBe(false)
  })
})

describe('route table — adding a destination costs one table entry', () => {
  // Nothing outside this block is touched: no view union to widen, no switch
  // case to add, no chrome predicate to remember. The table is the edit point.
  type TestView = AppView | 'test-destination' | 'retired-destination'

  const TEST_DESTINATION: RouteDefinition = {
    live: true,
    layout: 'shell',
    chrome: () => ({
      corner: { kind: 'up-level', label: 'Back to test', up: 'library-list' },
      gear: true,
      rwwStartControl: false,
    }),
    render: () => <div data-testid="test-destination">test destination body</div>,
  }

  const TEST_TABLE: RouteTable<TestView> = {
    ...ROUTE_TABLE,
    'test-destination': TEST_DESTINATION,
    'retired-destination': { ...TEST_DESTINATION, live: false },
  }

  it('resolves, renders and dresses the new destination through the same seams', () => {
    const route = resolveRoute<TestView>('test-destination', TEST_TABLE, 'library')
    expect(route.id).toBe('test-destination')
    expect(route.definition.layout).toBe('shell')
    expect(route.definition.chrome(state()).corner).toEqual({
      kind: 'up-level',
      label: 'Back to test',
      up: 'library-list',
    })

    const body = route.definition.render({} as RouteRenderContext) as React.ReactElement
    expect(body.props['data-testid']).toBe('test-destination')
  })

  it('redirects a declared destination that is not live', () => {
    const route = resolveRoute<TestView>('retired-destination', TEST_TABLE, 'library')
    expect(route.id).toBe('library')
    expect(route.definition).toBe(ROUTE_TABLE.library)
  })

  it('leaves the shipped table untouched', () => {
    expect(Object.keys(ROUTE_TABLE)).not.toContain('test-destination')
  })
})
