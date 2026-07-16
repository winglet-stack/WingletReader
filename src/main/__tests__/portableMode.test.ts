import { describe, expect, it } from 'vitest'
import { join } from 'path'
import {
  PORTABLE_DATA_DIRNAME,
  PORTABLE_MARKER_FILENAME,
  isPortable,
  portableMarkerPath,
  resolvePortableUserData,
  resolveUserDataRedirect,
} from '../portableMode'

/** A fileExists predicate that matches an exact set of present paths. */
function fakeFs(...present: string[]): (path: string) => boolean {
  const set = new Set(present)
  return (path) => set.has(path)
}

describe('isPortable', () => {
  it('is portable when the marker sits beside the executable', () => {
    const execDir = join('F:', 'app')
    const present = portableMarkerPath(execDir)
    expect(isPortable(execDir, fakeFs(present))).toBe(true)
  })

  it('is not portable when no marker is present (installed behaviour)', () => {
    const execDir = join('C:', 'Users', 'me', 'AppData', 'Local', 'Programs', 'WingletReader')
    expect(isPortable(execDir, fakeFs())).toBe(false)
  })

  it('only matches the marker beside the exe, not a marker elsewhere', () => {
    const execDir = join('F:', 'app')
    const elsewhere = join('F:', PORTABLE_MARKER_FILENAME)
    expect(isPortable(execDir, fakeFs(elsewhere))).toBe(false)
  })
})

describe('resolvePortableUserData', () => {
  it('targets <exe dir>\\data as the userData parent', () => {
    const execDir = join('F:', 'app')
    expect(resolvePortableUserData(execDir)).toBe(join(execDir, PORTABLE_DATA_DIRNAME))
  })

  it('handles a nested-exe layout (launcher app under \\app\\)', () => {
    const execDir = join('E:', 'WingletReader', 'app')
    expect(resolvePortableUserData(execDir)).toBe(join('E:', 'WingletReader', 'app', 'data'))
  })
})

describe('resolveUserDataRedirect', () => {
  it('returns a redirect target when the marker is present', () => {
    const execDir = join('F:', 'app')
    const decision = resolveUserDataRedirect(execDir, fakeFs(portableMarkerPath(execDir)))
    expect(decision).toEqual({
      portable: true,
      userDataPath: join(execDir, PORTABLE_DATA_DIRNAME),
    })
  })

  it('returns no redirect (null userDataPath) when no marker is present', () => {
    const execDir = join('C:', 'Program Files', 'WingletReader')
    expect(resolveUserDataRedirect(execDir, fakeFs())).toEqual({
      portable: false,
      userDataPath: null,
    })
  })

  it('is drive-letter independent: same \\data resolves under a new drive letter', () => {
    // Same stick layout, plugged in as F: on one PC and E: on the next.
    const onF = join('F:', 'app')
    const onE = join('E:', 'app')
    const dataOnF = resolveUserDataRedirect(onF, fakeFs(portableMarkerPath(onF)))
    const dataOnE = resolveUserDataRedirect(onE, fakeFs(portableMarkerPath(onE)))

    expect(dataOnF.userDataPath).toBe(join('F:', 'app', 'data'))
    expect(dataOnE.userDataPath).toBe(join('E:', 'app', 'data'))
    // The path is recomputed from the exe location, never stored, so the only
    // difference between hosts is the drive letter the OS assigned.
    expect(dataOnF.userDataPath?.replace(/^F:/, '')).toBe(dataOnE.userDataPath?.replace(/^E:/, ''))
  })
})
