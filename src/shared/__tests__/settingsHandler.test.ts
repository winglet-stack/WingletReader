import { describe, it, expect } from 'vitest'
import {
  copyReaderDefaultsToRww,
  DEFAULT_SETTINGS,
  defaultSettingsStore,
  flattenSettingsStore,
  parseSettings,
  RWW_OVERRIDE_FLAT_TO_READER,
  settingsStoreFromFlat
} from '../settings'
import type { Settings, SettingsStore } from '../settings'

// The five Standard Reader fields RWW carries as its independent config (frozen
// `rww_*` projection set; ADR-0008 / ADR-0014 §5).
const RWW_READER_FIELDS = [
  'bpm',
  'words_per_stack',
  'stacks_visible',
  'lines_count',
  'font_size'
] as const
import {
  clearRwwOverride,
  hasRwwOverride,
  resolveEffectiveSettings,
  setRwwOverride
} from '../settingsHandler'

// A legacy flat settings object as it would appear on disk before ADR-0008.
// Start from `parseSettings({})` so unset `rww_*` override keys are absent
// (their inherit semantics), exactly as a real stored flat object would be.
function legacyFlat(overrides: Partial<Settings> = {}): Record<string, unknown> {
  return {
    ...parseSettings({}),
    bpm: 60,
    words_per_stack: 3,
    font_size: 36,
    read_while_working_enabled: true,
    read_while_working_shortcut: 'Control+Alt+R',
    read_while_working_window_width: 720,
    ...overrides
  }
}

describe('settingsStoreFromFlat — legacy flat migration', () => {
  it('migrates reader fields into the reader scope', () => {
    const store = settingsStoreFromFlat(legacyFlat({ bpm: 120, font_size: 48 }))
    expect(store.reader.bpm).toBe(120)
    expect(store.reader.font_size).toBe(48)
    expect(store.reader.words_per_stack).toBe(3)
  })

  it('classifies read_while_working_enabled as Global and overlay fields as RWW-only', () => {
    const store = settingsStoreFromFlat(legacyFlat())
    expect(store.global.read_while_working_enabled).toBe(true)
    expect(store.rww.read_while_working_shortcut).toBe('Control+Alt+R')
    expect(store.rww.read_while_working_window_width).toBe(720)
    // read_while_working_enabled is NOT an RWW-only field
    expect('read_while_working_enabled' in store.rww).toBe(false)
  })

  it('keeps standby control settings RWW-scoped and round-trips them losslessly', () => {
    const defaults = defaultSettingsStore().rww as Record<string, unknown>
    expect(defaults.read_while_working_show_standby_control).toBe(true)
    expect(defaults.read_while_working_standby_x).toBeNull()
    expect(defaults.read_while_working_standby_y).toBeNull()

    const store = settingsStoreFromFlat(
      legacyFlat({
        read_while_working_show_standby_control: false,
        read_while_working_standby_x: 120,
        read_while_working_standby_y: 240
      } as Partial<Settings>)
    )
    const rww = store.rww as Record<string, unknown>
    const global = store.global as Record<string, unknown>

    expect(rww.read_while_working_show_standby_control).toBe(false)
    expect(rww.read_while_working_standby_x).toBe(120)
    expect(rww.read_while_working_standby_y).toBe(240)
    expect('read_while_working_show_standby_control' in global).toBe(false)
    expect('read_while_working_standby_x' in global).toBe(false)
    expect('read_while_working_standby_y' in global).toBe(false)

    expect(settingsStoreFromFlat(flattenSettingsStore(store))).toEqual(store)
  })

  it('preserves explicit legacy rww_* keys and seeds the rest from reader (ADR-0014 §5)', () => {
    // reader carries default stacks_visible and lines_count values.
    const store = settingsStoreFromFlat(legacyFlat({ rww_bpm: 400, rww_words_per_stack: 5 }))
    // explicit overrides win (lossless)
    expect(store.rww.bpm).toBe(400)
    expect(store.rww.words_per_stack).toBe(5)
    // every other RWW reader field is now seeded from the live reader value, so
    // the resolver's `?? reader` fallback never fires for RWW.
    expect(store.rww.stacks_visible).toBe(store.reader.stacks_visible)
    expect(store.rww.lines_count).toBe(store.reader.lines_count)
    expect(store.rww.font_size).toBe(store.reader.font_size)
  })

  it('seeds a complete independent rww set from reader when no rww_* keys are stored', () => {
    const store = settingsStoreFromFlat(legacyFlat({ bpm: 88, font_size: 50 }))
    // never-overridden RWW now owns explicit copies of every reader field
    expect(store.rww.bpm).toBe(88)
    expect(store.rww.font_size).toBe(50)
    expect(store.rww.words_per_stack).toBe(store.reader.words_per_stack)
    expect(store.rww.stacks_visible).toBe(store.reader.stacks_visible)
    expect(store.rww.lines_count).toBe(store.reader.lines_count)
  })

  it('round-trips losslessly: re-migrating the flat projection yields an equal store', () => {
    // The pre-§5 identity flatten∘migrate === parse no longer holds (migrate now
    // seeds), so the lossless invariant is now: projecting a migrated store to
    // flat and re-migrating it reproduces the same store.
    const flat = legacyFlat({ rww_bpm: 400, lock_at_wpm: true, target_wpm: 350, theme: 'light' })
    const store = settingsStoreFromFlat(flat)
    expect(settingsStoreFromFlat(flattenSettingsStore(store))).toEqual(store)
  })

  it('is idempotent: migrating an already-nested store yields an equal store', () => {
    const flat = legacyFlat({ rww_bpm: 222, rww_lines_count: 4 })
    const once = settingsStoreFromFlat(flat)
    const twice = settingsStoreFromFlat(once)
    expect(twice).toEqual(once)
  })

  it('handles an empty object by producing the default store', () => {
    expect(settingsStoreFromFlat({})).toEqual(defaultSettingsStore())
  })
})

describe('LB-5 line-count migration', () => {
  it('migrates a legacy flat disabled value to one line and drops the key', () => {
    const raw = legacyFlat({ lines_count: 3 } as Partial<Settings>)
    raw.lines_enabled = false

    const store = settingsStoreFromFlat(raw)
    const flat = flattenSettingsStore(store) as Record<string, unknown>

    expect(store.reader.lines_count).toBe(1)
    expect(flat.lines_count).toBe(1)
    expect('lines_enabled' in flat).toBe(false)
  })

  it('preserves a legacy flat enabled count', () => {
    const raw = legacyFlat({ lines_count: 4 } as Partial<Settings>)
    raw.lines_enabled = true

    expect(settingsStoreFromFlat(raw).reader.lines_count).toBe(4)
  })

  it('migrates store.global independently before scope projection', () => {
    const store = settingsStoreFromFlat({
      global: { lines_enabled: false, lines_count: 3 },
      reader: {},
      rww: {},
    })

    expect(store.reader.lines_count).toBe(1)
  })

  it('migrates store.reader independently', () => {
    const store = settingsStoreFromFlat({
      global: {},
      reader: { lines_enabled: false, lines_count: 3 },
      rww: {},
    })

    expect(store.reader.lines_count).toBe(1)
    expect('lines_enabled' in store.reader).toBe(false)
  })

  it('migrates direct and flat-key forms in store.rww to a count override', () => {
    const direct = settingsStoreFromFlat({
      global: {},
      reader: { lines_count: 4 },
      rww: { lines_enabled: false, lines_count: 3 },
    })
    const flatKey = settingsStoreFromFlat({
      global: {},
      reader: { lines_count: 4 },
      rww: { rww_lines_enabled: false, rww_lines_count: 3 },
    })

    expect(direct.rww.lines_count).toBe(1)
    expect(flatKey.rww.lines_count).toBe(1)
    expect((flattenSettingsStore(flatKey) as Record<string, unknown>).rww_lines_count).toBe(1)
  })

  it('migrates every saved Reader config and playback preset entry', () => {
    const raw = legacyFlat() as Record<string, unknown>
    raw.custom_reader_configs = [
      { id: 'reader:one', name: 'One', lines_enabled: false, lines_count: 3 },
      { id: 'reader:four', name: 'Four', lines_enabled: true, lines_count: 4 },
    ]
    raw.custom_playback_presets = [
      { id: 'playback:one', name: 'One', lines_enabled: false, lines_count: 5 },
      { id: 'playback:four', name: 'Four', lines_enabled: true, lines_count: 4 },
    ]
    raw.custom_rww_playback_presets = [
      { id: 'rww:one', name: 'One', lines_enabled: false, lines_count: 6 },
      { id: 'rww:four', name: 'Four', lines_enabled: true, lines_count: 4 },
    ]

    const store = settingsStoreFromFlat(raw)
    const reader = store.reader
    const configs = reader.custom_reader_configs as unknown as Array<Record<string, unknown>>
    const presets = reader.custom_playback_presets as unknown as Array<Record<string, unknown>>
    const rwwPresets = store.rww.custom_rww_playback_presets as unknown as Array<Record<string, unknown>>

    expect(configs.map((entry) => entry.lines_count)).toEqual([1, 4])
    expect(presets.map((entry) => entry.lines_count)).toEqual([1, 4])
    expect(rwwPresets.map((entry) => entry.lines_count)).toEqual([1, 4])
    expect([...configs, ...presets, ...rwwPresets].every((entry) => !('lines_enabled' in entry))).toBe(true)
  })

  it('is idempotent across nested and flattened normalisation', () => {
    const raw = legacyFlat({ lines_count: 3 } as Partial<Settings>)
    raw.lines_enabled = false
    raw.rww_lines_enabled = false
    raw.rww_lines_count = 4

    const once = settingsStoreFromFlat(raw)
    const twice = settingsStoreFromFlat(once)
    const projected = settingsStoreFromFlat(flattenSettingsStore(twice))

    expect(twice).toEqual(once)
    expect(projected).toEqual(once)
  })
})

describe('resolveEffectiveSettings — RWW inheritance', () => {
  it('inherits the reader-scoped line anchor without adding a seventh rww_* key', () => {
    const store = settingsStoreFromFlat(legacyFlat({ lines_anchor: 'top' }))

    expect(Object.keys(RWW_OVERRIDE_FLAT_TO_READER)).toHaveLength(5)
    expect('lines_anchor' in store.rww).toBe(false)
    expect(resolveEffectiveSettings('rww', store).lines_anchor ?? 'center').toBe('top')
  })

  function storeWith(readerBpm: number, rwwOverride?: Partial<SettingsStore['rww']>): SettingsStore {
    const store = settingsStoreFromFlat(legacyFlat({ bpm: readerBpm }))
    if (rwwOverride) store.rww = { ...store.rww, ...rwwOverride }
    return store
  }

  it('no explicit override → resolves to the seeded reader value', () => {
    // Post-§5 the value is seeded into rww (not live-inherited), but the effective
    // result is identical to the reader value at migration time.
    const store = storeWith(95)
    const effective = resolveEffectiveSettings('rww', store)
    expect(effective.bpm).toBe(95)
  })

  it('set → overrides the Standard Reader value', () => {
    const store = storeWith(95, { bpm: 400 })
    const effective = resolveEffectiveSettings('rww', store)
    expect(effective.bpm).toBe(400)
  })

  it('clear → inherits again', () => {
    let store = storeWith(95, { bpm: 400 })
    expect(resolveEffectiveSettings('rww', store).bpm).toBe(400)
    store = clearRwwOverride(store, 'bpm')
    expect(hasRwwOverride(store, 'bpm')).toBe(false)
    expect(resolveEffectiveSettings('rww', store).bpm).toBe(95)
  })

  it('changing reader BPM does NOT bleed into RWW — RWW is independent (ADR-0014 §5)', () => {
    // Pre-§5 this flowed through (live inheritance); now RWW owns a seeded copy,
    // so editing Standard Reader after migration leaves the RWW value put.
    const store = storeWith(60)
    expect(store.rww.bpm).toBe(60) // seeded at migration
    store.reader.bpm = 250
    expect(resolveEffectiveSettings('rww', store).bpm).toBe(60)
  })

  it('reader mode is unaffected by rww overrides', () => {
    const store = storeWith(95, { bpm: 400, words_per_stack: 9 })
    const reader = resolveEffectiveSettings('reader', store)
    expect(reader.bpm).toBe(95)
    expect(reader.words_per_stack).toBe(3)
  })

  it('reproduces the historical rww_x ?? x merge exactly', () => {
    const flat = legacyFlat({
      bpm: 300,
      rww_bpm: 400,
      words_per_stack: 3,
      rww_words_per_stack: 5,
      stacks_visible: 2,
      lines_count: 1
    })
    const today = {
      ...parseSettings(flat),
      bpm: 400,
      words_per_stack: 5,
      stacks_visible: 2,
      lines_count: 1
    }
    const resolved = resolveEffectiveSettings('rww', settingsStoreFromFlat(flat))
    expect(resolved.bpm).toBe(today.bpm)
    expect(resolved.words_per_stack).toBe(today.words_per_stack)
    expect(resolved.stacks_visible).toBe(today.stacks_visible)
    expect(resolved.lines_count).toBe(today.lines_count)
  })
})

describe('setRwwOverride / clearRwwOverride — purity', () => {
  it('setRwwOverride does not mutate the input store', () => {
    const store = defaultSettingsStore()
    const before = store.rww.bpm // seeded reader default (ADR-0014 §5)
    const next = setRwwOverride(store, 'bpm', 333)
    expect(store.rww.bpm).toBe(before)
    expect(next.rww.bpm).toBe(333)
  })

  it('clearRwwOverride deletes the key rather than writing the inherited value', () => {
    const store = setRwwOverride(defaultSettingsStore(), 'lines_count', 7)
    const cleared = clearRwwOverride(store, 'lines_count')
    expect('lines_count' in cleared.rww).toBe(false)
  })
})

describe('flattenSettingsStore — RWW-only and override projection', () => {
  it('omits absent override keys from the flat projection', () => {
    // The default store is now fully seeded (ADR-0014 §5), so to exercise the
    // projection's omit branch we clear a couple of fields back out of `rww`.
    let store = clearRwwOverride(defaultSettingsStore(), 'bpm')
    store = clearRwwOverride(store, 'lines_count')
    const flat = flattenSettingsStore(store) as Record<string, unknown>
    expect('rww_bpm' in flat).toBe(false)
    expect('rww_lines_count' in flat).toBe(false)
  })

  it('projects a fully-seeded default store with every rww_* key present', () => {
    const flat = flattenSettingsStore(defaultSettingsStore()) as Record<string, unknown>
    expect(flat.rww_bpm).toBe(DEFAULT_SETTINGS.bpm)
    expect(flat.rww_words_per_stack).toBe(DEFAULT_SETTINGS.words_per_stack)
    expect(flat.rww_font_size).toBe(DEFAULT_SETTINGS.font_size)
  })

  it('emits rww_* keys for overrides that are set', () => {
    const store = setRwwOverride(defaultSettingsStore(), 'bpm', 410)
    const flat = flattenSettingsStore(store) as Record<string, unknown>
    expect(flat.rww_bpm).toBe(410)
  })
})

// ── ADR-0014 §5: RWW independent-config seed (migration) ─────────────────────
describe('RWW independent-config seed', () => {
  it('seeds every RWW reader field so the resolver fallback never fires for RWW', () => {
    const store = settingsStoreFromFlat(legacyFlat({ bpm: 130, font_size: 44 }))
    for (const field of RWW_READER_FIELDS) {
      expect(store.rww[field]).not.toBeUndefined()
    }
    // resolveEffectiveSettings would `?? reader` only on absent fields; with all
    // present, the effective RWW values equal the explicitly-seeded rww values.
    const effective = resolveEffectiveSettings('rww', store)
    for (const field of RWW_READER_FIELDS) {
      expect(effective[field]).toBe(store.rww[field])
    }
  })

  it('is lossless — an explicit RWW value survives the seed (never overwritten)', () => {
    // rww_bpm diverges from reader bpm; the seed must keep the explicit 400.
    const store = settingsStoreFromFlat(legacyFlat({ bpm: 130, rww_bpm: 400 }))
    expect(store.rww.bpm).toBe(400)
    expect(store.reader.bpm).toBe(130)
  })

  it('is idempotent — re-seeding an already-migrated store is a no-op', () => {
    const flat = legacyFlat({ bpm: 130, rww_bpm: 400, rww_lines_count: 5 })
    const once = settingsStoreFromFlat(flat)
    const twice = settingsStoreFromFlat(once)
    expect(twice).toEqual(once)
    // and a third pass through the flat projection is still stable
    expect(settingsStoreFromFlat(flattenSettingsStore(twice))).toEqual(once)
  })

  it('a fresh store and an empty-object migration both yield the same seeded store', () => {
    expect(settingsStoreFromFlat({})).toEqual(defaultSettingsStore())
  })
})

describe('copyReaderDefaultsToRww', () => {
  it('overwrites the complete RWW reader set from the current reader config', () => {
    // Start with RWW diverged from reader on several fields.
    const store = settingsStoreFromFlat(
      legacyFlat({ bpm: 130, rww_bpm: 400, rww_words_per_stack: 5, rww_lines_count: 6 })
    )
    const copied = copyReaderDefaultsToRww(store)
    for (const field of RWW_READER_FIELDS) {
      expect(copied.rww[field]).toBe(store.reader[field])
    }
    // after the copy, RWW resolves identically to the reader config
    const effective = resolveEffectiveSettings('rww', copied)
    expect(effective.bpm).toBe(store.reader.bpm)
    expect(effective.words_per_stack).toBe(store.reader.words_per_stack)
    expect(effective.lines_count).toBe(store.reader.lines_count)
  })

  it('is pure — the input store is not mutated', () => {
    const store = settingsStoreFromFlat(legacyFlat({ bpm: 130, rww_bpm: 400 }))
    const copied = copyReaderDefaultsToRww(store)
    expect(store.rww.bpm).toBe(400) // input untouched
    expect(copied.rww.bpm).toBe(130) // copy took the reader value
    expect(copied).not.toBe(store)
  })
})
