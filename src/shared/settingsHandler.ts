/**
 * Unified Settings handler (ADR-0008) — the single source of truth for turning a
 * mode-scoped {@link SettingsStore} into the effective flat {@link Settings} a
 * reader session consumes.
 *
 * Pure module: no IO, no Electron, no React. Shared by the main process
 * (`rww:getTemporarySession`) and the renderer (`SettingsContext`) so RWW
 * inheritance is defined in exactly one place.
 *
 * RWW override model: `store.rww` persists only the reader fields it overrides.
 * Any reader field absent from `store.rww` inherits the *live* Standard Reader
 * value at read time — there is no copy-on-write of the reader blob.
 */
import { flattenSettingsStore, RWW_OVERRIDE_FLAT_TO_READER } from './settings'
import type { ReaderSettings, Settings, SettingsMode, SettingsStore } from './settings'

export type { SettingsMode, SettingsStore } from './settings'

/** Effective settings are the flat `Settings` shape the reader engine reads. */
export type EffectiveSettings = Settings

/** Reader fields RWW may override in wave 1 (the legacy `rww_*` set). */
const RWW_OVERRIDE_READER_FIELDS = Object.values(
  RWW_OVERRIDE_FLAT_TO_READER
) as (keyof ReaderSettings)[]

/**
 * Resolves the effective flat settings for a given mode.
 *
 * - `global` / `reader` → the Standard Reader projection of the store.
 * - `rww` → Standard Reader values with `store.rww` overrides applied; unset
 *   override fields fall back to the live Standard Reader value. This reproduces
 *   the historical `rww:getTemporarySession` merge (`rww_x ?? x`) exactly.
 */
export function resolveEffectiveSettings(
  mode: SettingsMode,
  store: SettingsStore
): EffectiveSettings {
  const base = flattenSettingsStore(store)
  if (mode !== 'rww') return base

  const rww = store.rww as Partial<ReaderSettings>
  const reader = store.reader as ReaderSettings
  const merged = base as unknown as Record<string, unknown>
  for (const field of RWW_OVERRIDE_READER_FIELDS) {
    merged[field] = rww[field] ?? reader[field]
  }
  return merged as unknown as EffectiveSettings
}

/** Sets an RWW override for a reader field (the RWW value diverges from reader). */
export function setRwwOverride<K extends keyof ReaderSettings>(
  store: SettingsStore,
  field: K,
  value: ReaderSettings[K]
): SettingsStore {
  return { ...store, rww: { ...store.rww, [field]: value } }
}

/**
 * Clears an RWW override so the field inherits the live Standard Reader value
 * again. Clearing deletes the key rather than writing the inherited value, so
 * later changes to Standard Reader continue to flow through.
 */
export function clearRwwOverride(
  store: SettingsStore,
  field: keyof ReaderSettings
): SettingsStore {
  const nextRww = { ...store.rww } as Record<string, unknown>
  delete nextRww[field as string]
  return { ...store, rww: nextRww as SettingsStore['rww'] }
}

/** True when `store.rww` carries an explicit override for `field`. */
export function hasRwwOverride(store: SettingsStore, field: keyof ReaderSettings): boolean {
  return (store.rww as Record<string, unknown>)[field as string] !== undefined
}
