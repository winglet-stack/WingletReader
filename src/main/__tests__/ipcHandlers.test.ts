import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { IpcMainLike, WindowRefs } from '../ipcHandlers'
import type { Database } from '../database'
import type { ReadWhileWorkingStatus } from '../readWhileWorkingCore'
import type { PortableProvisioningResult } from '../portableProvisioning'
import { PORTABLE_MARKER_FILENAME } from '../portableMode'
import { bookEpub, makeEpub } from './epubFixtures'
import {
  invokeChannelNames,
  readWhileWorkingChannelContract
} from '../../shared/channelContract'

vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '0.1.0-alpha.test'),
    getAppPath: vi.fn(() => process.cwd())
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn()
  }
}))

import { dialog } from 'electron'
import { registerHandlers } from '../ipcHandlers'
import { settingsStoreFromFlat } from '../../shared/settings'

// ── Exhaustive channel list ────────────────────────────────────────────────
// Derived, not re-typed (issue 03). The list still earns its place: types
// cannot see that `registerHandlers` actually *called* `ipc.handle` for a
// channel, so this catches a contract channel with no registration behind it
// (renderer would reject at runtime) and a registration for a channel the
// contract never declared (nothing can call it).
const EXPECTED_CHANNELS = invokeChannelNames

// ── Test factories ─────────────────────────────────────────────────────────

type HandlerMap = Map<string, (event: unknown, ...args: unknown[]) => unknown>

function makeIpc(): { ipc: IpcMainLike; handlers: HandlerMap } {
  const handlers: HandlerMap = new Map()
  const ipc: IpcMainLike = {
    handle(channel, listener) { handlers.set(channel, listener) },
    on() {}
  }
  return { ipc, handlers }
}

function makeDb(overrides: Partial<Record<string, unknown>> = {}): Database {
  const db = {
    getTexts: vi.fn(() => []),
    getText: vi.fn(() => null),
    saveText: vi.fn((t: unknown) => ({ ...(t as object), id: 1 })),
    deleteText: vi.fn(() => ({ ok: true })),
    getCategories: vi.fn(() => []),
    saveCategory: vi.fn((c: unknown) => ({ ...(c as object), id: 1 })),
    deleteCategory: vi.fn(() => ({ ok: true })),
    assignTextCategory: vi.fn(() => ({ id: 1 })),
    getSegments: vi.fn(() => []),
    getSegment: vi.fn(() => null),
    saveSegments: vi.fn(() => []),
    updateSegmentTitle: vi.fn(() => null),
    deleteSegments: vi.fn(() => ({ ok: true })),
    deleteSegment: vi.fn(() => ({ ok: true })),
    appendSegment: vi.fn(() => null),
    createChapterFromPassage: vi.fn(() => null),
    getBookmarks: vi.fn(() => []),
    saveBookmark: vi.fn((textId: number, draft: unknown) => ({ ...(draft as object), id: 1, textId })),
    updateBookmarkLabel: vi.fn(() => null),
    deleteBookmark: vi.fn(() => ({ ok: true })),
    getSummaries: vi.fn(() => []),
    saveSummary: vi.fn((d: unknown) => ({ ...(d as object), id: 1 })),
    deleteSummary: vi.fn(() => ({ ok: true })),
    getSummaryQuestionsForText: vi.fn(() => []),
    saveSummaryQuestion: vi.fn((d: unknown) => ({ ...(d as object), id: 1 })),
    deleteSummaryQuestion: vi.fn(() => ({ ok: true })),
    getReadingPosition: vi.fn(() => null),
    getLatestResumeCandidate: vi.fn(() => null),
    getBookResumeTarget: vi.fn(() => null),
    saveReadingPosition: vi.fn(() => null),
    importCategories: vi.fn(() => new Map<number, number>()),
    recordSessionStats: vi.fn(() => undefined),
    getStatsOverview: vi.fn(() => ({ overview: 'stats' })),
    getStatsDays: vi.fn(() => []),
    getTodaySessionStats: vi.fn(() => []),
    getStatsCollection: vi.fn(() => ({ days: [], sessions: [] })),
    replaceStats: vi.fn(() => undefined),
    getStorePath: vi.fn(() => join(process.cwd(), 'fasttrack-data.json')),
    getSettings: vi.fn(() => ({
      bpm: 300,
      words_per_stack: 3,
      stacks_visible: 2,
      lines_count: 1
    })),
    saveSettings: vi.fn((s: unknown) => s),
    ...overrides
  } as unknown as Database
  // The RWW handler reads the native store; derive it from the (possibly
  // overridden) flat getSettings mock unless a test supplies its own.
  if (!('getSettingsStore' in overrides)) {
    ;(db as unknown as Record<string, unknown>).getSettingsStore = vi.fn(() =>
      settingsStoreFromFlat((db as unknown as { getSettings: () => unknown }).getSettings())
    )
  }
  return db
}

interface PortableFixture {
  root: string
  sourceAppDir: string
  sourceDataFile: string
  iconSource: string
  targetPath: string
}

const tempRoots: string[] = []

function makePortableFixture(): PortableFixture {
  const root = mkdtempSync(join(tmpdir(), 'wingletreader-portable-ipc-'))
  tempRoots.push(root)
  const sourceAppDir = join(root, 'source-app')
  mkdirSync(sourceAppDir, { recursive: true })
  writeFileSync(join(sourceAppDir, 'WingletReader.exe'), 'exe', 'utf-8')
  writeFileSync(join(sourceAppDir, 'runtime.dll'), 'runtime', 'utf-8')
  mkdirSync(join(sourceAppDir, 'data'), { recursive: true })
  writeFileSync(join(sourceAppDir, 'data', 'fasttrack-data.json'), '{"old":"portable"}', 'utf-8')

  const sourceDataFile = join(root, 'userData', 'fasttrack-data.json')
  mkdirSync(join(root, 'userData'), { recursive: true })
  writeFileSync(sourceDataFile, '{"texts":[{"title":"Installed library"}]}', 'utf-8')

  const iconSource = join(root, 'icon.ico')
  writeFileSync(iconSource, 'icon-bytes', 'utf-8')

  return {
    root,
    sourceAppDir,
    sourceDataFile,
    iconSource,
    targetPath: join(root, 'WingletReader-Portable')
  }
}

function portableOptions(fixture: PortableFixture, availableBytes = 1024 * 1024 * 1024) {
  return {
    sourceAppDir: fixture.sourceAppDir,
    sourceDataFile: fixture.sourceDataFile,
    iconSourceCandidates: [fixture.iconSource],
    getAvailableBytes: vi.fn(() => availableBytes)
  }
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function mockStatus(): ReadWhileWorkingStatus {
  return {
    enabled: false,
    supported: true,
    registered: false,
    shortcut: 'Control+Space',
    exitShortcut: 'Control+Space',
    exitRegistered: false,
    error: null,
    exitError: null
  }
}

function makeWindows(overrides: Partial<WindowRefs> = {}): WindowRefs {
  return {
    mainWindow: null,
    temporaryReaderWindow: null,
    temporaryReaderSession: null,
    updateReadWhileWorkingRegistration: vi.fn(() => mockStatus()),
    ensureTray: vi.fn(),
    enableReadWhileWorkingAndHide: vi.fn(() => mockStatus()),
    finishTemporaryReaderSession: vi.fn(() => ({ ok: true })),
    exitReadWhileWorkingMode: vi.fn(),
    ...overrides
  }
}

// ── Channel registration ───────────────────────────────────────────────────

describe('registerHandlers — channel registration', () => {
  it('registers exactly the expected set of IPC channels', () => {
    const { ipc, handlers } = makeIpc()
    registerHandlers(ipc, makeDb(), makeWindows())
    const registered = [...handlers.keys()].sort()
    expect(registered).toEqual([...EXPECTED_CHANNELS].sort())
  })
})

describe('app:* handlers', () => {
  it('app:getVersion returns the Electron app version', () => {
    const { ipc, handlers } = makeIpc()
    registerHandlers(ipc, makeDb(), makeWindows())
    expect(handlers.get('app:getVersion')!(null)).toBe('0.1.0-alpha.test')
  })
})

// ── db:* delegation ────────────────────────────────────────────────────────

describe('portable:createDrive handler', () => {
  it('provisions the portable layout and clones the installed data JSON', () => {
    const fixture = makePortableFixture()
    const { ipc, handlers } = makeIpc()
    const db = makeDb({ getStorePath: vi.fn(() => fixture.sourceDataFile) })
    registerHandlers(ipc, db, makeWindows(), {
      portableProvisioning: portableOptions(fixture)
    })

    const result = handlers.get('portable:createDrive')!(
      null,
      fixture.targetPath
    ) as PortableProvisioningResult

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)
    expect(result.targetPath).toBe(fixture.targetPath)
    expect(existsSync(join(fixture.targetPath, 'WingletReader.cmd'))).toBe(true)
    expect(existsSync(join(fixture.targetPath, 'README.txt'))).toBe(true)
    expect(existsSync(join(fixture.targetPath, 'autorun.inf'))).toBe(true)
    expect(readFileSync(join(fixture.targetPath, 'WingletReader.ico'), 'utf-8')).toBe('icon-bytes')
    expect(existsSync(join(fixture.targetPath, 'app', 'WingletReader.exe'))).toBe(true)
    expect(existsSync(join(fixture.targetPath, 'app', PORTABLE_MARKER_FILENAME))).toBe(true)

    const clonedData = readFileSync(
      join(fixture.targetPath, 'app', 'data', 'fasttrack-data.json'),
      'utf-8'
    )
    expect(clonedData).toBe(readFileSync(fixture.sourceDataFile, 'utf-8'))
    expect(clonedData).not.toContain('portable')
    expect(readFileSync(fixture.sourceDataFile, 'utf-8')).toContain('Installed library')

    const autorun = readFileSync(join(fixture.targetPath, 'autorun.inf'), 'utf-8')
    expect(autorun).toContain('Label=WingletReader')
    expect(autorun).toContain('Icon=WingletReader.ico')
    expect(
      autorun
        .toLowerCase()
        .split(/\r?\n/)
        .some((line) => /^(open|shellexecute|run)\s*=/.test(line))
    ).toBe(false)
  })

  it('returns a typed insufficient-space error before creating the target', () => {
    const fixture = makePortableFixture()
    const { ipc, handlers } = makeIpc()
    registerHandlers(ipc, makeDb({ getStorePath: vi.fn(() => fixture.sourceDataFile) }), makeWindows(), {
      portableProvisioning: portableOptions(fixture, 1)
    })

    const result = handlers.get('portable:createDrive')!(
      null,
      fixture.targetPath
    ) as PortableProvisioningResult

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'insufficient-space' }
    })
    expect(existsSync(fixture.targetPath)).toBe(false)
  })

  it('returns a typed writable error when the target is not a directory', () => {
    const fixture = makePortableFixture()
    writeFileSync(fixture.targetPath, 'not a folder', 'utf-8')
    const { ipc, handlers } = makeIpc()
    registerHandlers(ipc, makeDb({ getStorePath: vi.fn(() => fixture.sourceDataFile) }), makeWindows(), {
      portableProvisioning: portableOptions(fixture)
    })

    const result = handlers.get('portable:createDrive')!(
      null,
      fixture.targetPath
    ) as PortableProvisioningResult

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'target-not-writable' }
    })
    expect(readFileSync(fixture.targetPath, 'utf-8')).toBe('not a folder')
  })

  it('returns a typed error for an existing portable install', () => {
    const fixture = makePortableFixture()
    mkdirSync(join(fixture.targetPath, 'app'), { recursive: true })
    writeFileSync(join(fixture.targetPath, 'app', PORTABLE_MARKER_FILENAME), 'existing', 'utf-8')
    const { ipc, handlers } = makeIpc()
    registerHandlers(ipc, makeDb({ getStorePath: vi.fn(() => fixture.sourceDataFile) }), makeWindows(), {
      portableProvisioning: portableOptions(fixture)
    })

    const result = handlers.get('portable:createDrive')!(
      null,
      fixture.targetPath
    ) as PortableProvisioningResult

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'portable-exists' }
    })
    expect(readFileSync(join(fixture.targetPath, 'app', PORTABLE_MARKER_FILENAME), 'utf-8')).toBe(
      'existing'
    )
  })
})

describe('portable:selectTarget handler', () => {
  beforeEach(() => {
    vi.mocked(dialog.showOpenDialog).mockReset()
  })

  it('returns the chosen folder from the native picker', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
      canceled: false,
      filePaths: ['E:\\WingletReaderStick']
    })
    const { ipc, handlers } = makeIpc()
    registerHandlers(ipc, makeDb(), makeWindows({ mainWindow: { hide: vi.fn() } }))

    const result = await handlers.get('portable:selectTarget')!(null)

    expect(result).toEqual({ canceled: false, targetPath: 'E:\\WingletReaderStick' })
    const call = vi.mocked(dialog.showOpenDialog).mock.calls[0] as unknown as [
      unknown,
      { properties?: string[] }
    ]
    expect(call[1].properties).toContain('openDirectory')
  })

  it('reports cancellation when the picker is dismissed', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({ canceled: true, filePaths: [] })
    const { ipc, handlers } = makeIpc()
    registerHandlers(ipc, makeDb(), makeWindows({ mainWindow: { hide: vi.fn() } }))

    const result = await handlers.get('portable:selectTarget')!(null)

    expect(result).toEqual({ canceled: true })
  })

  it('reports cancellation when there is no main window', async () => {
    const { ipc, handlers } = makeIpc()
    registerHandlers(ipc, makeDb(), makeWindows())

    const result = await handlers.get('portable:selectTarget')!(null)

    expect(result).toEqual({ canceled: true })
    expect(dialog.showOpenDialog).not.toHaveBeenCalled()
  })
})

// ── Winglet Book import (WB-2a) ────────────────────────────────────────────

describe('file:open handler — Winglet Book routing', () => {
  let dir: string

  beforeEach(() => {
    vi.mocked(dialog.showOpenDialog).mockReset()
    dir = mkdtempSync(join(tmpdir(), 'wingletreader-fileopen-'))
    tempRoots.push(dir)
  })

  function pick(filePath: string): void {
    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({ canceled: false, filePaths: [filePath] })
  }

  it('offers .wbook and .epub in the picker filters alongside txt/docx/pdf', async () => {
    const filePath = join(dir, 'notes.txt')
    writeFileSync(filePath, 'Alpha beta gamma.', 'utf-8')
    pick(filePath)
    const { ipc, handlers } = makeIpc()
    registerHandlers(ipc, makeDb(), makeWindows({ mainWindow: { hide: vi.fn() } }))

    await handlers.get('file:open')!(null)

    const call = vi.mocked(dialog.showOpenDialog).mock.calls[0] as unknown as [
      unknown,
      { filters?: Array<{ name: string; extensions: string[] }> }
    ]
    const filters = call[1].filters ?? []
    expect(filters[0].extensions).toEqual(['txt', 'docx', 'pdf', 'wbook', 'epub'])
    expect(filters.map((f) => f.name)).toContain('Winglet Book')
    expect(filters.map((f) => f.name)).toContain('EPUB Book')
  })

  it('routes a picked .epub to the EPUB door without parsing it (EP-4a)', async () => {
    // Deliberately not an archive at all: routing is extension-only, so the
    // picker must hand the path over unread and let `import:epubParse` judge it.
    const filePath = join(dir, 'middlemarch.epub')
    writeFileSync(filePath, 'not really a zip', 'utf-8')
    pick(filePath)
    const { ipc, handlers } = makeIpc()
    registerHandlers(ipc, makeDb(), makeWindows({ mainWindow: { hide: vi.fn() } }))

    expect(await handlers.get('file:open')!(null)).toEqual({
      kind: 'epub-book',
      fileName: 'middlemarch.epub',
      filePath
    })
  })

  it('routes a picked .wbook to the Winglet Book door instead of the text parser', async () => {
    const filePath = join(dir, 'the-lighthouse-keeper.wbook')
    writeFileSync(filePath, '{"format":"winglet-book"}', 'utf-8')
    pick(filePath)
    const { ipc, handlers } = makeIpc()
    registerHandlers(ipc, makeDb(), makeWindows({ mainWindow: { hide: vi.fn() } }))

    expect(await handlers.get('file:open')!(null)).toEqual({
      kind: 'winglet-book',
      fileName: 'the-lighthouse-keeper.wbook',
      filePath
    })
  })

  it('leaves the txt flow intact', async () => {
    const filePath = join(dir, 'notes.txt')
    writeFileSync(filePath, 'Alpha beta gamma.', 'utf-8')
    pick(filePath)
    const { ipc, handlers } = makeIpc()
    registerHandlers(ipc, makeDb(), makeWindows({ mainWindow: { hide: vi.fn() } }))

    const result = (await handlers.get('file:open')!(null)) as {
      kind: string
      fileName: string
      content: string
      ext: string
    }

    expect(result.kind).toBe('text-file')
    expect(result.fileName).toBe('notes.txt')
    expect(result.ext).toBe('txt')
    expect(result.content).toContain('Alpha beta gamma.')
  })
})

describe('import:wbook* handlers', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wingletreader-wbook-ipc-'))
    tempRoots.push(dir)
  })

  function makeStoreDb() {
    return makeDb({
      hasSeedId: vi.fn(() => false),
      getCategories: vi.fn(() => [{ id: 1, name: 'Uncategorized', is_system: true }]),
      importCategories: vi.fn(() => new Map()),
      saveSegments: vi.fn(() => [])
    })
  }

  function validWbook() {
    return {
      format: 'winglet-book',
      schemaVersion: 2,
      book: {
        seedId: 'the-lighthouse-keeper',
        title: 'The Lighthouse Keeper',
        categoryRef: 'Fiction',
        segments: [{ title: 'The Wreck', content: 'The lamp had not been lit.' }]
      }
    }
  }

  it('returns the confirm-card envelope without writing anything', async () => {
    const filePath = join(dir, 'book.wbook')
    writeFileSync(filePath, JSON.stringify(validWbook()), 'utf-8')
    const { ipc, handlers } = makeIpc()
    const db = makeStoreDb()
    registerHandlers(ipc, db, makeWindows())

    expect(await handlers.get('import:wbookParse')!(null, filePath)).toEqual({
      status: 'accepted',
      filePath,
      confirmation: {
        seedId: 'the-lighthouse-keeper',
        title: 'The Lighthouse Keeper',
        chapterCount: 1,
        categoryName: 'Fiction'
      }
    })
    expect(db.saveText).not.toHaveBeenCalled()
    expect(db.saveSegments).not.toHaveBeenCalled()
    expect(db.saveCategory).not.toHaveBeenCalled()
    expect(db.importCategories).not.toHaveBeenCalled()
  })

  it('never rejects across IPC — a foreign file comes back as a verdict', async () => {
    const filePath = join(dir, 'backup.wbook')
    writeFileSync(filePath, JSON.stringify({ texts: [] }), 'utf-8')
    const { ipc, handlers } = makeIpc()
    registerHandlers(ipc, makeStoreDb(), makeWindows())

    expect(await handlers.get('import:wbookParse')!(null, filePath)).toEqual({
      status: 'foreign',
      filePath
    })
    expect(await handlers.get('import:wbookParse')!(null, undefined)).toMatchObject({
      status: 'malformed'
    })
  })

  it('commits through the ordinary store paths and answers with the new id', async () => {
    const filePath = join(dir, 'book.wbook')
    writeFileSync(filePath, JSON.stringify(validWbook()), 'utf-8')
    const { ipc, handlers } = makeIpc()
    const db = makeStoreDb()
    registerHandlers(ipc, db, makeWindows())

    // The shared book-intake success envelope, same as `import:epubCommit`.
    expect(await handlers.get('import:wbookCommit')!(null, filePath)).toEqual({
      status: 'committed',
      filePath,
      textId: 1
    })
    expect(db.importCategories).toHaveBeenCalledWith([{ id: 1, name: 'Fiction' }])
    expect(db.saveText).toHaveBeenCalledWith({
      title: 'The Lighthouse Keeper',
      content: 'The lamp had not been lit.',
      seed_id: 'the-lighthouse-keeper',
      category_id: undefined
    })
    expect(db.saveSegments).toHaveBeenCalledWith(1, [
      {
        title: 'The Wreck',
        content: 'The lamp had not been lit.',
        order: 0,
        sourceType: 'detected_heading',
        word_count: 6,
        startWordOffset: 0,
        endWordOffset: 6
      }
    ])
  })

  it('never rejects across IPC on commit either, and writes nothing when it refuses', async () => {
    const filePath = join(dir, 'backup.wbook')
    writeFileSync(filePath, JSON.stringify({ texts: [] }), 'utf-8')
    const { ipc, handlers } = makeIpc()
    const db = makeStoreDb()
    registerHandlers(ipc, db, makeWindows())

    expect(await handlers.get('import:wbookCommit')!(null, filePath)).toEqual({
      status: 'foreign',
      filePath
    })
    expect(await handlers.get('import:wbookCommit')!(null, undefined)).toMatchObject({
      status: 'malformed'
    })
    expect(db.saveText).not.toHaveBeenCalled()
    expect(db.saveSegments).not.toHaveBeenCalled()
  })
})

describe('import:epub* handlers', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wingletreader-epub-ipc-'))
    tempRoots.push(dir)
  })

  const CHAPTERS = [
    { body: '<h1>The Wreck</h1><p>The lamp had not been lit.</p>' },
    { body: '<h1>The Flare</h1><p>A green flare cut the fog.</p>' }
  ]

  /** A two-chapter EPUB 3 book on disk, built by the EP-2b fixture helpers. */
  function validEpub(fileName = 'book.epub'): Promise<string> {
    return makeEpub(
      dir,
      fileName,
      bookEpub({
        title: 'The Lighthouse Keeper',
        creator: 'A. Keeper',
        chapters: CHAPTERS,
        nav: [
          { label: 'The Wreck', href: 'c1.xhtml' },
          { label: 'The Flare', href: 'c2.xhtml' }
        ]
      })
    )
  }

  it('returns the confirm-card envelope without writing anything', async () => {
    const filePath = await validEpub()
    const { ipc, handlers } = makeIpc()
    const db = makeDb({ saveSegments: vi.fn(() => []) })
    registerHandlers(ipc, db, makeWindows())

    expect(await handlers.get('import:epubParse')!(null, filePath)).toEqual({
      status: 'accepted',
      filePath,
      confirmation: {
        title: 'The Lighthouse Keeper',
        author: 'A. Keeper',
        chapterCount: 2,
        wordCount: 16,
        imagesOmitted: 0
      }
    })
    expect(db.saveText).not.toHaveBeenCalled()
    expect(db.saveSegments).not.toHaveBeenCalled()
  })

  it('commits through the ordinary store paths and answers with the new textId', async () => {
    const filePath = await validEpub()
    const { ipc, handlers } = makeIpc()
    const db = makeDb({ saveSegments: vi.fn(() => []) })
    registerHandlers(ipc, db, makeWindows())

    expect(await handlers.get('import:epubCommit')!(null, filePath)).toEqual({
      status: 'committed',
      filePath,
      textId: 1
    })
    expect(db.saveText).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'The Lighthouse Keeper',
        author: 'A. Keeper',
        source_type: 'epub',
        content: 'The Wreck\n\nThe lamp had not been lit.\n\nThe Flare\n\nA green flare cut the fog.'
      })
    )
    expect(db.saveSegments).toHaveBeenCalledWith(1, [
      {
        title: 'The Wreck',
        content: 'The Wreck\n\nThe lamp had not been lit.',
        order: 0,
        sourceType: 'detected_heading',
        word_count: 8,
        startWordOffset: 0,
        endWordOffset: 8
      },
      {
        title: 'The Flare',
        content: 'The Flare\n\nA green flare cut the fog.',
        order: 1,
        sourceType: 'detected_heading',
        word_count: 8,
        startWordOffset: 8,
        endWordOffset: 16
      }
    ])
  })

  it('never rejects across IPC — refusals come back as verdicts and write nothing', async () => {
    const damaged = join(dir, 'damaged.epub')
    writeFileSync(damaged, 'not a zip at all', 'utf-8')
    const { ipc, handlers } = makeIpc()
    const db = makeDb({ saveSegments: vi.fn(() => []) })
    registerHandlers(ipc, db, makeWindows())

    expect(await handlers.get('import:epubParse')!(null, damaged)).toMatchObject({
      status: 'malformed',
      filePath: damaged
    })
    expect(await handlers.get('import:epubCommit')!(null, damaged)).toMatchObject({
      status: 'malformed'
    })
    expect(await handlers.get('import:epubCommit')!(null, undefined)).toMatchObject({
      status: 'malformed'
    })
    expect(db.saveText).not.toHaveBeenCalled()
    expect(db.saveSegments).not.toHaveBeenCalled()
  })
})

// ── Export / import of reading history (ADR-0035 §7) ───────────────────────

describe('export:all / import:json — stats', () => {
  let dir: string

  const statsFixture = {
    days: [
      {
        date: '2026-08-11',
        wordsRead: 1400,
        wallMs: 900_000,
        activeMs: 780_000,
        pauses: 3,
        rewinds: 1,
        sessionCount: 2,
        longestSessionMs: 540_000,
        bestSessionFluency: 82,
        quotaTargetWords: 1000,
        weeklyTargetDays: 5,
        quotaMet: true,
        points: 12
      }
    ],
    sessions: [
      {
        textId: 4,
        title: 'Today’s book',
        startedAt: 1_700_000_000_000,
        endedAt: 1_700_000_600_000,
        activeMs: 540_000,
        wordsRead: 900,
        pauses: 1,
        rewinds: 0
      }
    ]
  }

  beforeEach(() => {
    vi.mocked(dialog.showOpenDialog).mockReset()
    vi.mocked(dialog.showSaveDialog).mockReset()
    dir = mkdtempSync(join(tmpdir(), 'wingletreader-export-'))
    tempRoots.push(dir)
  })

  function importing(payload: unknown): { handlers: HandlerMap; db: Database } {
    const filePath = join(dir, 'import.json')
    writeFileSync(filePath, JSON.stringify(payload), 'utf-8')
    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({ canceled: false, filePaths: [filePath] })
    const { ipc, handlers } = makeIpc()
    const db = makeDb()
    registerHandlers(ipc, db, makeWindows({ mainWindow: { hide: vi.fn() } }))
    return { handlers, db }
  }

  it('export:all writes the stats collection alongside texts, categories and settings', async () => {
    const filePath = join(dir, 'export.json')
    vi.mocked(dialog.showSaveDialog).mockResolvedValueOnce({ canceled: false, filePath })
    const { ipc, handlers } = makeIpc()
    const db = makeDb({ getStatsCollection: vi.fn(() => statsFixture) })
    registerHandlers(ipc, db, makeWindows({ mainWindow: { hide: vi.fn() } }))

    const result = await handlers.get('export:all')!(null)

    expect(result).toEqual({ ok: true })
    const written = JSON.parse(readFileSync(filePath, 'utf-8'))
    expect(written.stats).toEqual(statsFixture)
    expect(Object.keys(written)).toEqual(
      expect.arrayContaining(['texts', 'categories', 'settings', 'stats'])
    )
  })

  it('import:json replaces the whole collection when the payload carries stats', async () => {
    const { handlers, db } = importing({ texts: [], categories: [], stats: statsFixture })

    const result = await handlers.get('import:json')!(null)

    expect(result).toEqual({ ok: true, imported: 0 })
    expect(db.replaceStats).toHaveBeenCalledWith(statsFixture)
  })

  it('import:json leaves existing stats alone when the payload has none', async () => {
    const { handlers, db } = importing({ texts: [], categories: [] })

    await handlers.get('import:json')!(null)

    expect(db.replaceStats).not.toHaveBeenCalled()
  })
})

describe('db:* handlers', () => {
  let handlers: HandlerMap
  let db: Database

  beforeEach(() => {
    const r = makeIpc()
    db = makeDb()
    registerHandlers(r.ipc, db, makeWindows())
    handlers = r.handlers
  })

  it('db:getTexts delegates to db.getTexts()', () => {
    handlers.get('db:getTexts')!(null)
    expect(db.getTexts).toHaveBeenCalledOnce()
  })

  it('db:getText passes id', () => {
    handlers.get('db:getText')!(null, 42)
    expect(db.getText).toHaveBeenCalledWith(42)
  })

  it('db:deleteText passes id', () => {
    handlers.get('db:deleteText')!(null, 7)
    expect(db.deleteText).toHaveBeenCalledWith(7)
  })

  it('db:getCategories delegates to db.getCategories()', () => {
    handlers.get('db:getCategories')!(null)
    expect(db.getCategories).toHaveBeenCalledOnce()
  })

  it('db:saveCategory passes category payload', () => {
    handlers.get('db:saveCategory')!(null, { name: 'Research' })
    expect(db.saveCategory).toHaveBeenCalledWith({ name: 'Research' })
  })

  it('db:deleteCategory passes id', () => {
    handlers.get('db:deleteCategory')!(null, 5)
    expect(db.deleteCategory).toHaveBeenCalledWith(5)
  })

  it('db:assignTextCategory passes text and category ids', () => {
    handlers.get('db:assignTextCategory')!(null, 2, 3)
    expect(db.assignTextCategory).toHaveBeenCalledWith(2, 3)
  })

  it('db:getSegments passes textId', () => {
    handlers.get('db:getSegments')!(null, 3)
    expect(db.getSegments).toHaveBeenCalledWith(3)
  })

  it('db:deleteSegment passes id', () => {
    handlers.get('db:deleteSegment')!(null, 9)
    expect(db.deleteSegment).toHaveBeenCalledWith(9)
  })

  it('db:updateSegmentTitle passes id and title', () => {
    handlers.get('db:updateSegmentTitle')!(null, 5, 'New Title')
    expect(db.updateSegmentTitle).toHaveBeenCalledWith(5, 'New Title')
  })

  it('db:createChapterFromPassage passes all args', () => {
    handlers.get('db:createChapterFromPassage')!(null, 1, 10, 50, 'Ch 1')
    expect(db.createChapterFromPassage).toHaveBeenCalledWith(1, 10, 50, 'Ch 1')
  })

  it('db:getBookmarks passes textId', () => {
    handlers.get('db:getBookmarks')!(null, 3)
    expect(db.getBookmarks).toHaveBeenCalledWith(3)
  })

  it('db:saveBookmark passes textId and draft', () => {
    const draft = { kind: 'normal', wordOffset: 4, label: 'Start here' }
    handlers.get('db:saveBookmark')!(null, 3, draft)
    expect(db.saveBookmark).toHaveBeenCalledWith(3, draft)
  })

  it('db:updateBookmarkLabel passes id and label', () => {
    handlers.get('db:updateBookmarkLabel')!(null, 8, 'Renamed')
    expect(db.updateBookmarkLabel).toHaveBeenCalledWith(8, 'Renamed')
  })

  it('db:deleteBookmark passes id', () => {
    handlers.get('db:deleteBookmark')!(null, 8)
    expect(db.deleteBookmark).toHaveBeenCalledWith(8)
  })

  it('db:getSettings delegates to db.getSettings()', () => {
    handlers.get('db:getSettings')!(null)
    expect(db.getSettings).toHaveBeenCalledOnce()
  })

  it('db:getReadingPosition passes textId', () => {
    handlers.get('db:getReadingPosition')!(null, 5)
    expect(db.getReadingPosition).toHaveBeenCalledWith(5)
  })

  it('db:getLatestResumeCandidate delegates to db.getLatestResumeCandidate()', () => {
    handlers.get('db:getLatestResumeCandidate')!(null)
    expect(db.getLatestResumeCandidate).toHaveBeenCalledOnce()
  })

  it('db:getBookResumeTarget passes bookTextId', () => {
    handlers.get('db:getBookResumeTarget')!(null, 7)
    expect(db.getBookResumeTarget).toHaveBeenCalledWith(7)
  })

  it('db:saveReadingPosition passes textId, stackIndex, and source', () => {
    handlers.get('db:saveReadingPosition')!(null, 2, 7, 'segment')
    expect(db.saveReadingPosition).toHaveBeenCalledWith(2, 7, 'segment')
  })

  it('db:recordSessionStats passes the session record through untouched', () => {
    const record = {
      textId: 3,
      title: 'Chapter One',
      startedAt: 1_700_000_000_000,
      endedAt: 1_700_000_600_000,
      activeMs: 540_000,
      wordsRead: 1200,
      pauses: 2,
      rewinds: 1
    }
    handlers.get('db:recordSessionStats')!(null, record)
    expect(db.recordSessionStats).toHaveBeenCalledWith(record)
  })

  it('db:getStatsOverview delegates to db.getStatsOverview()', () => {
    const result = handlers.get('db:getStatsOverview')!(null)
    expect(db.getStatsOverview).toHaveBeenCalledOnce()
    expect(result).toEqual({ overview: 'stats' })
  })

  it('db:getStatsDays delegates to db.getStatsDays()', () => {
    handlers.get('db:getStatsDays')!(null)
    expect(db.getStatsDays).toHaveBeenCalledOnce()
  })

  it('db:getTodaySessionStats delegates to db.getTodaySessionStats()', () => {
    handlers.get('db:getTodaySessionStats')!(null)
    expect(db.getTodaySessionStats).toHaveBeenCalledOnce()
  })

  it('db:deleteSummary passes id', () => {
    handlers.get('db:deleteSummary')!(null, 11)
    expect(db.deleteSummary).toHaveBeenCalledWith(11)
  })

  it('db:getSummaryQuestionsForText passes textId', () => {
    handlers.get('db:getSummaryQuestionsForText')!(null, 4)
    expect(db.getSummaryQuestionsForText).toHaveBeenCalledWith(4)
  })

  it('db:saveSettings normalizes read_while_working_shortcut', () => {
    const windows = makeWindows()
    const { ipc, handlers: h } = makeIpc()
    const mockDb = makeDb({ saveSettings: vi.fn((s: unknown) => s) })
    registerHandlers(ipc, mockDb, windows)

    h.get('db:saveSettings')!(null, { read_while_working_shortcut: 'ctrl + space' })

    expect(mockDb.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ read_while_working_shortcut: 'Control+Space' })
    )
    expect(windows.updateReadWhileWorkingRegistration).toHaveBeenCalledOnce()
  })

  it('db:saveSettings normalizes read_while_working_exit_shortcut', () => {
    const windows = makeWindows()
    const { ipc, handlers: h } = makeIpc()
    const mockDb = makeDb({ saveSettings: vi.fn((s: unknown) => s) })
    registerHandlers(ipc, mockDb, windows)

    h.get('db:saveSettings')!(null, { read_while_working_exit_shortcut: 'ctrl+alt+r' })

    expect(mockDb.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ read_while_working_exit_shortcut: 'Control+Alt+R' })
    )
  })

  it('db:saveSettings passes non-shortcut settings through unchanged', () => {
    const windows = makeWindows()
    const { ipc, handlers: h } = makeIpc()
    const mockDb = makeDb({ saveSettings: vi.fn((s: unknown) => s) })
    registerHandlers(ipc, mockDb, windows)

    h.get('db:saveSettings')!(null, { bpm: 400 })

    expect(mockDb.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ bpm: 400 }))
  })
})

// ── rww:* handlers ─────────────────────────────────────────────────────────

describe('rww:* handlers', () => {
  it('rww:getStatus calls updateReadWhileWorkingRegistration', () => {
    const { ipc, handlers } = makeIpc()
    const windows = makeWindows()
    registerHandlers(ipc, makeDb(), windows)
    handlers.get('rww:getStatus')!(null)
    expect(windows.updateReadWhileWorkingRegistration).toHaveBeenCalledOnce()
  })

  it('rww:finishTemporarySession calls finishTemporaryReaderSession and returns { ok: true }', () => {
    const { ipc, handlers } = makeIpc()
    const windows = makeWindows()
    registerHandlers(ipc, makeDb(), windows)
    const result = handlers.get('rww:finishTemporarySession')!(null)
    expect(windows.finishTemporaryReaderSession).toHaveBeenCalledOnce()
    expect(result).toEqual({ ok: true })
  })

  // The resolved `finishTemporarySession` mismatch (issue 03): preload used to
  // forward a `reason` the handler never declared. The channel now carries no
  // argument, and finishing stays reason-independent — main ends the session the
  // same way however it was prompted.
  it('rww:finishTemporarySession takes no argument and forwards none', () => {
    const { ipc, handlers } = makeIpc()
    const windows = makeWindows()
    registerHandlers(ipc, makeDb(), windows)

    expect(readWhileWorkingChannelContract.finishTemporarySession.arity).toBe(0)

    const handler = handlers.get('rww:finishTemporarySession')!
    // A stray extra argument cannot change what finishing does.
    const result = handler(null, 'cancelled')

    expect(windows.finishTemporaryReaderSession).toHaveBeenCalledWith()
    expect(result).toEqual({ ok: true })
  })

  it('rww:exit calls the shared exit-mode helper and returns { ok: true }', () => {
    const { ipc, handlers } = makeIpc()
    const windows = makeWindows()
    registerHandlers(ipc, makeDb(), windows)

    const result = handlers.get('rww:exit')!(null)

    expect(windows.exitReadWhileWorkingMode).toHaveBeenCalledWith('Exited Overlay Reader.')
    expect(result).toEqual({ ok: true })
  })

  it('rww:getTemporarySession returns session and merges rww_* settings', () => {
    const { ipc, handlers } = makeIpc()
    const session = { id: 'abc', title: 'Test', content: 'hello world', createdAt: '2025-01-01' }
    const windows = makeWindows({ temporaryReaderSession: session })
    const db = makeDb({
      getSettings: vi.fn(() => ({
        bpm: 300,
        rww_bpm: 400,
        words_per_stack: 3,
        rww_words_per_stack: 5,
        stacks_visible: 2,
        lines_count: 1
      }))
    })
    registerHandlers(ipc, db, windows)

    const result = handlers.get('rww:getTemporarySession')!(null) as {
      session: unknown
      settings: Record<string, unknown>
    }

    expect(result.session).toEqual(session)
    expect(result.settings.bpm).toBe(400)
    expect(result.settings.words_per_stack).toBe(5)
  })

  it('rww:getTemporarySession falls back to base settings when rww_* fields absent', () => {
    const { ipc, handlers } = makeIpc()
    const windows = makeWindows({ temporaryReaderSession: null })
    const db = makeDb({
      getSettings: vi.fn(() => ({ bpm: 300, words_per_stack: 3, stacks_visible: 2, lines_count: 2 }))
    })
    registerHandlers(ipc, db, windows)

    const result = handlers.get('rww:getTemporarySession')!(null) as {
      settings: Record<string, unknown>
    }
    expect(result.settings.bpm).toBe(300)
  })

  it('rww:hideToTray hides mainWindow and calls ensureTray when enabled+registered', () => {
    const { ipc, handlers } = makeIpc()
    const mockHide = vi.fn()
    const windows = makeWindows({
      mainWindow: { hide: mockHide },
      updateReadWhileWorkingRegistration: vi.fn(() => ({
        ...mockStatus(),
        enabled: true,
        registered: true
      }))
    })
    registerHandlers(ipc, makeDb(), windows)

    handlers.get('rww:hideToTray')!(null)

    expect(mockHide).toHaveBeenCalledOnce()
    expect(windows.ensureTray).toHaveBeenCalledOnce()
  })

  it('rww:enableAndHideToTray delegates to the shared enable helper and returns its status', () => {
    const { ipc, handlers } = makeIpc()
    const enabledStatus = { ...mockStatus(), enabled: true, registered: true }
    const windows = makeWindows({
      enableReadWhileWorkingAndHide: vi.fn(() => enabledStatus)
    })
    registerHandlers(ipc, makeDb(), windows)

    const result = handlers.get('rww:enableAndHideToTray')!(null)

    expect(windows.enableReadWhileWorkingAndHide).toHaveBeenCalledOnce()
    expect(result).toBe(enabledStatus)
  })

  it('rww:hideToTray does not hide window when not enabled', () => {
    const { ipc, handlers } = makeIpc()
    const mockHide = vi.fn()
    const windows = makeWindows({
      mainWindow: { hide: mockHide },
      updateReadWhileWorkingRegistration: vi.fn(() => ({
        ...mockStatus(),
        enabled: false,
        registered: false
      }))
    })
    registerHandlers(ipc, makeDb(), windows)

    handlers.get('rww:hideToTray')!(null)

    expect(mockHide).not.toHaveBeenCalled()
    expect(windows.ensureTray).not.toHaveBeenCalled()
  })
})
