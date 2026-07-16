import { join } from 'path'

/**
 * Portable USB mode (ADR-0016) — pure, filesystem-free decision helpers.
 *
 * A WingletReader copy is "portable" when a marker file sits beside the real
 * executable. When portable, the entire `userData` directory is redirected to a
 * `\data` folder beside the executable so the library JSON, settings, segments,
 * the `fasttrack.transmute.*` localStorage, logs, and Electron caches all live
 * on the stick. The decision is recomputed from the executable's own location
 * every launch, so a changing drive letter (`F:` on one host, `E:` on the next)
 * is irrelevant — no absolute data path is ever stored.
 *
 * These functions take the executable directory and a `fileExists` predicate so
 * they can be unit-tested with no real filesystem, and reused by slice 02
 * (updater skip) and slice 06 (portable-drive creator) without re-deriving the
 * marker name or layout.
 */

/**
 * Marker filename placed beside the real executable to opt a copy into portable
 * mode. Pinned here so the runtime (this slice), the `dist:portable` assembly
 * (slice 03), and the in-app creator (slice 06) all write/read the identical
 * name.
 */
export const PORTABLE_MARKER_FILENAME = 'WingletReader.portable'

/**
 * Subdirectory beside the executable that becomes the portable `userData`
 * parent. Only the parent directory moves — the frozen data filename
 * (`fasttrack-data.json`) and other frozen identifiers are unchanged.
 */
export const PORTABLE_DATA_DIRNAME = 'data'

export type FileExists = (path: string) => boolean

/** Absolute path of the marker file for a given executable directory. */
export function portableMarkerPath(execDir: string): string {
  return join(execDir, PORTABLE_MARKER_FILENAME)
}

/**
 * Portable when the marker file sits beside the real executable. Recomputed from
 * the executable location every launch, so the changing drive letter never
 * matters.
 */
export function isPortable(execDir: string, fileExists: FileExists): boolean {
  return fileExists(portableMarkerPath(execDir))
}

/** The `userData` parent directory for a portable copy: `<execDir>\data`. */
export function resolvePortableUserData(execDir: string): string {
  return join(execDir, PORTABLE_DATA_DIRNAME)
}

export interface PortableUserDataDecision {
  /** Whether the marker was found beside the executable. */
  portable: boolean
  /**
   * The value to pass to `app.setPath('userData', …)`. Set only when portable;
   * `null` when not portable, signalling the caller to leave Electron's default
   * `userData` untouched (today's installed behaviour, byte-for-byte).
   */
  userDataPath: string | null
}

/**
 * Resolve whether to redirect `userData` and where. Pure: the caller passes the
 * directory of the real executable and a `fileExists` predicate. When not
 * portable, `userDataPath` is `null` and the caller must not invoke
 * `app.setPath`.
 */
export function resolveUserDataRedirect(
  execDir: string,
  fileExists: FileExists
): PortableUserDataDecision {
  if (!isPortable(execDir, fileExists)) {
    return { portable: false, userDataPath: null }
  }
  return { portable: true, userDataPath: resolvePortableUserData(execDir) }
}
