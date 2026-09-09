import { app, dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import fs from 'fs'
import { dirname, join } from 'path'
import { Database } from './database'
import { FileParser } from './fileParser'
import { resolveEffectiveSettings } from '../shared/settingsHandler'
import {
  appChannelContract,
  dataChannelContract,
  dbChannelContract,
  fileChannelContract,
  readWhileWorkingChannelContract,
  videoChannelContract,
  type ChannelDefinition,
  type ChannelHandler
} from '../shared/channelContract'
import { createPortableDrive, type PortableProvisioningOptions } from './portableProvisioning'
import {
  normalizeShortcutInput,
  type ReadWhileWorkingStatus,
  type TemporaryReaderSession
} from './readWhileWorkingCore'
import {
  WINGLET_BOOK_EXTENSION,
  commitWingletBookFile,
  parseWingletBookFile
} from './wingletBookImport'
import { EPUB_EXTENSION, commitEpubImport, parseEpubImport } from './epubImport'

export interface IpcMainLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handle(channel: string, listener: (event: any, ...args: any[]) => any): void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(channel: string, listener: (event: any, ...args: any[]) => void): void
}

/**
 * Registers one contract channel. The definition carries the name; the handler
 * is checked against the contract's argument tuple and result type, so a
 * registration that contradicts the contract is a compile error rather than a
 * runtime surprise.
 */
function registerHandler<Definition extends ChannelDefinition<unknown[], unknown>>(
  ipc: IpcMainLike,
  definition: Definition,
  handler: ChannelHandler<Definition>
): void {
  ipc.handle(definition.channel, handler)
}

export interface BrowserWindowLike {
  hide(): void
}

type StoredSettings = ReturnType<Database['getSettings']>

interface ImportJsonText {
  title: string
  content: string
  content_display?: string
  source_type?: 'text' | 'pdf' | 'docx'
  page_count?: number
  content_html?: string
  import_diagnostics?: object
  import_blocks?: object[]
  category_id?: number
}

interface ImportJsonData {
  texts?: ImportJsonText[]
  categories?: Array<{ id: number; name: string; is_system?: boolean; is_locked?: boolean }>
  settings?: object
  /** Unread here: the store normalizes the collection (ADR-0035 §4). */
  stats?: object
}

/**
 * Persists imported texts, remapping each text's source category id through the
 * id map produced by `importCategories`. Returns the count actually saved. Kept
 * out of the IPC handler so the loop + per-text guards don't inflate its
 * cognitive complexity.
 */
function importTextRecords(
  db: Database,
  texts: ImportJsonText[] | undefined,
  categoryMap: Map<number, number>
): number {
  if (!Array.isArray(texts)) return 0
  let imported = 0
  for (const t of texts) {
    if (!t.title || !t.content) continue
    const importedCategoryId = Number(t.category_id)
    const resolvedCategoryId =
      Number.isInteger(importedCategoryId) && categoryMap.has(importedCategoryId)
        ? categoryMap.get(importedCategoryId)!
        : undefined
    db.saveText({
      title: t.title,
      content: t.content,
      content_display: t.content_display,
      source_type: t.source_type,
      page_count: t.page_count,
      content_html: t.content_html,
      import_diagnostics: t.import_diagnostics as never,
      import_blocks: t.import_blocks as never,
      category_id: resolvedCategoryId
    })
    imported++
  }
  return imported
}

export interface WindowRefs {
  mainWindow: BrowserWindowLike | null
  temporaryReaderWindow: BrowserWindowLike | null
  temporaryReaderSession: TemporaryReaderSession | null
  updateReadWhileWorkingRegistration(settings?: StoredSettings): ReadWhileWorkingStatus
  ensureTray(): void
  enableReadWhileWorkingAndHide(): ReadWhileWorkingStatus
  finishTemporaryReaderSession(): { ok: boolean }
  exitReadWhileWorkingMode(notification?: string): void
}

export interface RegisterHandlerOptions {
  portableProvisioning?: Partial<PortableProvisioningOptions>
}

function defaultPortableProvisioningOptions(db: Database): PortableProvisioningOptions {
  const sourceAppDir = dirname(process.execPath)
  const appPath = typeof app.getAppPath === 'function' ? app.getAppPath() : process.cwd()
  const resourcesPath = process.resourcesPath ?? ''
  const iconSourceCandidates = [
    join(appPath, 'resources', 'icon.ico'),
    join(process.cwd(), 'resources', 'icon.ico')
  ]
  if (resourcesPath) {
    iconSourceCandidates.splice(
      1,
      0,
      join(resourcesPath, 'resources', 'icon.ico'),
      join(resourcesPath, 'icon.ico')
    )
  }
  return {
    sourceAppDir,
    sourceDataFile: db.getStorePath(),
    iconSourceCandidates
  }
}

export function registerHandlers(
  ipc: IpcMainLike,
  db: Database,
  windows: WindowRefs,
  options: RegisterHandlerOptions = {}
): void {
  // ── App metadata ────────────────────────────────────────────────────────────
  registerHandler(ipc, appChannelContract.getVersion, () => app.getVersion())

  // ── Texts ──────────────────────────────────────────────────────────────────
  registerHandler(ipc, dbChannelContract.getTexts, () => db.getTexts())

  registerHandler(ipc, dbChannelContract.getText, (_e, id) => db.getText(id))

  registerHandler(ipc, dbChannelContract.saveText, (_e, text) => db.saveText(text))

  registerHandler(ipc, dbChannelContract.deleteText, (_e, id) => db.deleteText(id))

  // ── Categories ─────────────────────────────────────────────────────────────
  registerHandler(ipc, dbChannelContract.getCategories, () => db.getCategories())

  registerHandler(ipc, dbChannelContract.saveCategory, (_e, category) =>
    db.saveCategory(category)
  )

  registerHandler(ipc, dbChannelContract.deleteCategory, (_e, id) => db.deleteCategory(id))

  registerHandler(ipc, dbChannelContract.assignTextCategory, (_e, textId, categoryId) =>
    db.assignTextCategory(textId, categoryId)
  )

  // ── Segments ───────────────────────────────────────────────────────────────
  registerHandler(ipc, dbChannelContract.getSegments, (_e, textId) => db.getSegments(textId))

  registerHandler(ipc, dbChannelContract.getSegment, (_e, id) => db.getSegment(id))

  registerHandler(ipc, dbChannelContract.saveSegments, (_e, textId, drafts) =>
    db.saveSegments(textId, drafts)
  )

  registerHandler(ipc, dbChannelContract.updateSegmentTitle, (_e, id, title) =>
    db.updateSegmentTitle(id, title)
  )

  registerHandler(ipc, dbChannelContract.deleteSegments, (_e, textId) =>
    db.deleteSegments(textId)
  )

  registerHandler(ipc, dbChannelContract.deleteSegment, (_e, id) => db.deleteSegment(id))

  registerHandler(ipc, dbChannelContract.appendSegment, (_e, textId, draft) =>
    db.appendSegment(textId, draft)
  )

  registerHandler(
    ipc,
    dbChannelContract.createChapterFromPassage,
    (_e, textId, startWordOffset, endWordOffset, title) =>
      db.createChapterFromPassage(textId, startWordOffset, endWordOffset, title)
  )

  // ── Summaries ──────────────────────────────────────────────────────────────
  registerHandler(ipc, dbChannelContract.getBookmarks, (_e, textId) => db.getBookmarks(textId))

  registerHandler(ipc, dbChannelContract.saveBookmark, (_e, textId, draft) =>
    db.saveBookmark(textId, draft)
  )

  registerHandler(ipc, dbChannelContract.updateBookmarkLabel, (_e, id, label) =>
    db.updateBookmarkLabel(id, label)
  )

  registerHandler(ipc, dbChannelContract.deleteBookmark, (_e, id) => db.deleteBookmark(id))

  registerHandler(ipc, dbChannelContract.getSummaries, (_e, textId) => db.getSummaries(textId))

  registerHandler(ipc, dbChannelContract.saveSummary, (_e, data) => db.saveSummary(data))

  registerHandler(ipc, dbChannelContract.deleteSummary, (_e, id) => db.deleteSummary(id))

  // ── SummaryQuestions ───────────────────────────────────────────────────────
  registerHandler(ipc, dbChannelContract.getSummaryQuestionsForText, (_e, textId) =>
    db.getSummaryQuestionsForText(textId)
  )

  registerHandler(ipc, dbChannelContract.saveSummaryQuestion, (_e, data) =>
    db.saveSummaryQuestion(data)
  )

  registerHandler(ipc, dbChannelContract.deleteSummaryQuestion, (_e, id) =>
    db.deleteSummaryQuestion(id)
  )

  // ── ReadingPositions ───────────────────────────────────────────────────────
  registerHandler(ipc, dbChannelContract.getReadingPosition, (_e, textId) =>
    db.getReadingPosition(textId)
  )

  registerHandler(ipc, dbChannelContract.getLatestResumeCandidate, () =>
    db.getLatestResumeCandidate()
  )

  registerHandler(ipc, dbChannelContract.getBookResumeTarget, (_e, bookTextId) =>
    db.getBookResumeTarget(bookTextId)
  )

  registerHandler(ipc, dbChannelContract.saveReadingPosition, (_e, textId, stackIndex, source) =>
    db.saveReadingPosition(textId, stackIndex, source)
  )

  // ── Stats ──────────────────────────────────────────────────────────────────
  // Pure plumbing: the store owns date assignment, folding and the quota
  // verdict (ADR-0035 §4), so no rule lives on this seam.
  registerHandler(ipc, dbChannelContract.recordSessionStats, (_e, record) =>
    db.recordSessionStats(record)
  )

  registerHandler(ipc, dbChannelContract.getStatsOverview, () => db.getStatsOverview())

  registerHandler(ipc, dbChannelContract.getStatsDays, () => db.getStatsDays())

  registerHandler(ipc, dbChannelContract.getTodaySessionStats, () => db.getTodaySessionStats())

  // ── Settings ───────────────────────────────────────────────────────────────
  registerHandler(ipc, dbChannelContract.getSettings, () => db.getSettings())

  registerHandler(ipc, dbChannelContract.saveSettings, (_e, settings) => {
    const patch =
      settings && typeof settings === 'object'
        ? {
            ...settings,
            ...('read_while_working_shortcut' in settings
              ? {
                  read_while_working_shortcut: normalizeShortcutInput(
                    String(settings.read_while_working_shortcut ?? 'Control+Space')
                  )
                }
              : {}),
            ...('read_while_working_exit_shortcut' in settings
              ? {
                  read_while_working_exit_shortcut: normalizeShortcutInput(
                    String(settings.read_while_working_exit_shortcut ?? 'Control+Space')
                  )
                }
              : {})
          }
        : settings
    const saved = db.saveSettings(patch)
    windows.updateReadWhileWorkingRegistration(saved)
    return saved
  })

  registerHandler(ipc, dbChannelContract.getSettingsStore, () => db.getSettingsStore())

  registerHandler(ipc, dbChannelContract.saveSettingsStore, (_e, store) => {
    const saved = db.saveSettingsStore(store)
    windows.updateReadWhileWorkingRegistration(db.getSettings())
    return saved
  })

  // ── Read while working ─────────────────────────────────────────────────────
  registerHandler(ipc, readWhileWorkingChannelContract.getStatus, () =>
    windows.updateReadWhileWorkingRegistration()
  )

  registerHandler(ipc, readWhileWorkingChannelContract.hideToTray, () => {
    const status = windows.updateReadWhileWorkingRegistration()
    if (status.enabled && status.registered) {
      windows.ensureTray()
      windows.mainWindow?.hide()
    }
    return status
  })

  // Single enable path shared with the tray "Start Read While Working" item:
  // persist the flag, register shortcuts and hide on success (or re-show on
  // failure) in the main process. The Library header button calls this instead
  // of issuing separate saveSettings + hideToTray calls.
  registerHandler(ipc, readWhileWorkingChannelContract.enableAndHideToTray, () =>
    windows.enableReadWhileWorkingAndHide()
  )

  registerHandler(ipc, readWhileWorkingChannelContract.getTemporarySession, () => {
    // Single source of truth for RWW inheritance: the unified Settings handler
    // (ADR-0008). The resolver reproduces the historical `rww_x ?? x` merge.
    const store = db.getSettingsStore()
    const rwwSettings = resolveEffectiveSettings('rww', store)
    return { session: windows.temporaryReaderSession, settings: rwwSettings }
  })

  // Takes no argument. Overlay sessions end the same way whatever prompted it,
  // and main ends one itself on the exit path, so there is no reason for a
  // "reason" to be part of this channel (issue 03).
  registerHandler(ipc, readWhileWorkingChannelContract.finishTemporarySession, () =>
    windows.finishTemporaryReaderSession()
  )

  registerHandler(ipc, readWhileWorkingChannelContract.exit, () => {
    windows.exitReadWhileWorkingMode('Exited Overlay Reader.')
    return { ok: true }
  })

  // ── File import ────────────────────────────────────────────────────────────
  registerHandler(ipc, fileChannelContract.open, async () => {
    if (!windows.mainWindow) return null

    const result = await dialog.showOpenDialog(windows.mainWindow as BrowserWindow, {
      title: 'Import Text File',
      properties: ['openFile'],
      filters: [
        {
          name: 'Supported Files',
          extensions: ['txt', 'docx', 'pdf', WINGLET_BOOK_EXTENSION, EPUB_EXTENSION]
        },
        { name: 'Plain Text', extensions: ['txt'] },
        { name: 'Word Document', extensions: ['docx'] },
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'Winglet Book', extensions: [WINGLET_BOOK_EXTENSION] },
        { name: 'EPUB Book', extensions: [EPUB_EXTENSION] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) return null

    const filePath = result.filePaths[0]
    const fileName = filePath.split(/[\\/]/).pop() ?? 'Unknown'
    const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : ''

    // Routing only (ADR-0033 §4): the extension is advisory, so this branch just
    // sends the file down the Winglet Book door instead of the txt/docx/pdf
    // parser. Whether it really IS a Winglet Book is decided by the `format`
    // marker in `import:wbookParse`, which the renderer calls next (WB-3).
    if (ext === WINGLET_BOOK_EXTENSION) {
      return { kind: 'winglet-book' as const, fileName, filePath }
    }

    // Same rule for EPUB (ADR-0034 §8; EP-4a): the extension only chooses the
    // door. Nothing is unzipped here — whether the file really is an EPUB (and
    // whether it is DRM-free, sane, readable) is decided by the container
    // ladder in `import:epubParse`, which the renderer calls next.
    if (ext === EPUB_EXTENSION) {
      return { kind: 'epub-book' as const, fileName, filePath }
    }

    const parseResult = await FileParser.parse(filePath, ext)
    const title = FileParser.inferTitle(filePath)

    return {
      kind: 'text-file' as const,
      fileName,
      title,
      content: parseResult.content,
      warnings: parseResult.warnings,
      ext,
      pageCount: parseResult.pageCount,
      html: parseResult.html ?? null,
      diagnostics: parseResult.diagnostics,
      blocks: parseResult.blocks,
      pages: parseResult.pages
    }
  })

  // ── Export ─────────────────────────────────────────────────────────────────
  registerHandler(ipc, dataChannelContract.exportAll, async () => {
    if (!windows.mainWindow) return { ok: false, error: 'No window' }

    const result = await dialog.showSaveDialog(windows.mainWindow as BrowserWindow, {
      title: 'Export WingletReader Data',
      defaultPath: `wingletreader-export-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })

    if (result.canceled || !result.filePath) return { ok: false, error: 'Cancelled' }

    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      texts: db.getTexts().map((t) => {
        const full = db.getText(t.id!)
        return {
          title: full!.title,
          content: full!.content,
          content_display: full!.content_display,
          word_count: full!.word_count,
          source_type: full!.source_type,
          page_count: full!.page_count,
          content_html: full!.content_html,
          import_diagnostics: full!.import_diagnostics,
          import_blocks: full!.import_blocks,
          category_id: full!.category_id
        }
      }),
      categories: db.getCategories(),
      settings: db.getSettings(),
      // Reading history travels with the library (ADR-0035 §7) — day records
      // plus today's un-folded sessions, exactly as the store holds them.
      stats: db.getStatsCollection()
    }

    fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), 'utf-8')
    return { ok: true }
  })

  // ── Import from JSON ───────────────────────────────────────────────────────
  registerHandler(ipc, dataChannelContract.importJson, async () => {
    if (!windows.mainWindow) return { ok: false, error: 'No window' }

    const result = await dialog.showOpenDialog(windows.mainWindow as BrowserWindow, {
      title: 'Import WingletReader Data',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })

    if (result.canceled || result.filePaths.length === 0) return { ok: false, error: 'Cancelled' }

    let data: ImportJsonData
    try {
      const raw = fs.readFileSync(result.filePaths[0], 'utf-8')
      data = JSON.parse(raw)
    } catch {
      return { ok: false, error: 'Invalid or unreadable JSON file' }
    }

    const importedCategoryMap = db.importCategories(data.categories)
    const imported = importTextRecords(db, data.texts, importedCategoryMap)

    if (data.settings && typeof data.settings === 'object') {
      db.saveSettings(data.settings as never)
      windows.updateReadWhileWorkingRegistration()
    }

    // Replace-on-import, unlike texts, which accumulate: two reading histories
    // cannot be merged day-by-day without inventing words that were never read.
    // A payload without `stats` (every export before ADR-0035) leaves the
    // existing history alone.
    if (data.stats && typeof data.stats === 'object') db.replaceStats(data.stats)

    return { ok: true, imported }
  })

  // ── Book intake (parse then commit, one door per format) ──────────────────
  // Both pairs below are the same ladder — `bookIntake.ts` — behind two format
  // adapters (`architecture-depth/05`). Parse recognizes the picked file and
  // returns the confirm-card / refusal envelope without writing; commit re-reads
  // and re-judges the same path from disk rather than trusting anything from the
  // parse call, so a duplicate that raced in, or a file edited since, is refused
  // instead of inserted. Success is one envelope for every format: `committed`
  // with the new text's id, so the renderer opens the book directly instead of
  // re-finding it by identity.
  //
  // Winglet Book (ADR-0033; WB-2a/WB-2b).
  registerHandler(ipc, dataChannelContract.parseWingletBook, (_e, filePath) => parseWingletBookFile(db, filePath))

  registerHandler(ipc, dataChannelContract.commitWingletBook, (_e, filePath) => commitWingletBookFile(db, filePath))

  // Publisher e-books (ADR-0034 §2; EP-3). Its adapter walks the container
  // ladder and names its own refusals, DRM included.
  registerHandler(ipc, dataChannelContract.parseEpub, (_e, filePath) => parseEpubImport(db, filePath))
  registerHandler(ipc, dataChannelContract.commitEpub, (_e, filePath) => commitEpubImport(db, filePath))

  // ── Portable provisioning ─────────────────────────────────────────────────
  // Native folder picker for the "Create Portable Drive" action. Returns the
  // chosen absolute folder, or `canceled` so the renderer never provisions on a
  // dismissed dialog. `createDirectory` lets the user make a fresh stick folder.
  registerHandler(ipc, dataChannelContract.selectPortableTarget, async () => {
    if (!windows.mainWindow) return { canceled: true }

    const result = await dialog.showOpenDialog(windows.mainWindow as BrowserWindow, {
      title: 'Choose a destination for the portable copy',
      buttonLabel: 'Use this folder',
      properties: ['openDirectory', 'createDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) return { canceled: true }
    return { canceled: false, targetPath: result.filePaths[0] }
  })

  registerHandler(ipc, dataChannelContract.createPortableDrive, (_e, targetPath) =>
    createPortableDrive(targetPath, {
      ...defaultPortableProvisioningOptions(db),
      ...options.portableProvisioning
    })
  )

  // ── Video save ─────────────────────────────────────────────────────────────
  ipc.handle('video:save', async (_e, buffer: ArrayBuffer, suggestedName: string) => {
    if (!windows.mainWindow) return { ok: false, error: 'No window' }

    const result = await dialog.showSaveDialog(windows.mainWindow as BrowserWindow, {
      title: 'Save Video',
      defaultPath: suggestedName,
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
    })

    if (result.canceled || !result.filePath) return { ok: false, error: 'Cancelled' }

    try {
      fs.writeFileSync(result.filePath, Buffer.from(buffer))
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
}
