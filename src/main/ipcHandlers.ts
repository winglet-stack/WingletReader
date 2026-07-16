import { app, dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import fs from 'fs'
import { dirname, join } from 'path'
import { Database } from './database'
import { FileParser } from './fileParser'
import { resolveEffectiveSettings } from '../shared/settingsHandler'
import { createPortableDrive, type PortableProvisioningOptions } from './portableProvisioning'
import {
  normalizeShortcutInput,
  type ReadWhileWorkingStatus,
  type TemporaryReaderSession
} from './readWhileWorkingCore'

export interface IpcMainLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handle(channel: string, listener: (event: any, ...args: any[]) => any): void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(channel: string, listener: (event: any, ...args: any[]) => void): void
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
  ipc.handle('app:getVersion', () => app.getVersion())

  // ── Texts ──────────────────────────────────────────────────────────────────
  ipc.handle('db:getTexts', () => db.getTexts())

  ipc.handle('db:getText', (_e, id: number) => db.getText(id))

  ipc.handle('db:saveText', (_e, text) => db.saveText(text))

  ipc.handle('db:deleteText', (_e, id: number) => db.deleteText(id))

  // ── Categories ─────────────────────────────────────────────────────────────
  ipc.handle('db:getCategories', () => db.getCategories())

  ipc.handle('db:saveCategory', (_e, category) => db.saveCategory(category))

  ipc.handle('db:deleteCategory', (_e, id: number) => db.deleteCategory(id))

  ipc.handle('db:assignTextCategory', (_e, textId: number, categoryId: number) =>
    db.assignTextCategory(textId, categoryId)
  )

  // ── Segments ───────────────────────────────────────────────────────────────
  ipc.handle('db:getSegments', (_e, textId: number) => db.getSegments(textId))

  ipc.handle('db:getSegment', (_e, id: number) => db.getSegment(id))

  ipc.handle('db:saveSegments', (_e, textId: number, drafts) =>
    db.saveSegments(textId, drafts)
  )

  ipc.handle('db:updateSegmentTitle', (_e, id: number, title: string) =>
    db.updateSegmentTitle(id, title)
  )

  ipc.handle('db:deleteSegments', (_e, textId: number) => db.deleteSegments(textId))

  ipc.handle('db:deleteSegment', (_e, id: number) => db.deleteSegment(id))

  ipc.handle('db:appendSegment', (_e, textId: number, draft) =>
    db.appendSegment(textId, draft)
  )

  ipc.handle(
    'db:createChapterFromPassage',
    (_e, textId: number, startWordOffset: number, endWordOffset: number, title: string) =>
      db.createChapterFromPassage(textId, startWordOffset, endWordOffset, title)
  )

  // ── Summaries ──────────────────────────────────────────────────────────────
  ipc.handle('db:getBookmarks', (_e, textId: number) => db.getBookmarks(textId))

  ipc.handle('db:saveBookmark', (_e, textId: number, draft) =>
    db.saveBookmark(textId, draft)
  )

  ipc.handle('db:updateBookmarkLabel', (_e, id: number, label: string) =>
    db.updateBookmarkLabel(id, label)
  )

  ipc.handle('db:deleteBookmark', (_e, id: number) => db.deleteBookmark(id))

  ipc.handle('db:getSummaries', (_e, textId: number) => db.getSummaries(textId))

  ipc.handle('db:saveSummary', (_e, data) => db.saveSummary(data))

  ipc.handle('db:deleteSummary', (_e, id: number) => db.deleteSummary(id))

  // ── SummaryQuestions ───────────────────────────────────────────────────────
  ipc.handle('db:getSummaryQuestionsForText', (_e, textId: number) =>
    db.getSummaryQuestionsForText(textId)
  )

  ipc.handle('db:saveSummaryQuestion', (_e, data) => db.saveSummaryQuestion(data))

  ipc.handle('db:deleteSummaryQuestion', (_e, id: number) => db.deleteSummaryQuestion(id))

  // ── ReadingPositions ───────────────────────────────────────────────────────
  ipc.handle('db:getReadingPosition', (_e, textId: number) => db.getReadingPosition(textId))

  ipc.handle('db:getLatestResumeCandidate', () => db.getLatestResumeCandidate())

  ipc.handle('db:getBookResumeTarget', (_e, bookTextId: number) =>
    db.getBookResumeTarget(bookTextId)
  )

  ipc.handle('db:saveReadingPosition', (_e, textId: number, stackIndex: number, source) =>
    db.saveReadingPosition(textId, stackIndex, source)
  )

  // ── Settings ───────────────────────────────────────────────────────────────
  ipc.handle('db:getSettings', () => db.getSettings())

  ipc.handle('db:saveSettings', (_e, settings) => {
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

  ipc.handle('db:getSettingsStore', () => db.getSettingsStore())

  ipc.handle('db:saveSettingsStore', (_e, store) => {
    const saved = db.saveSettingsStore(store)
    windows.updateReadWhileWorkingRegistration(db.getSettings())
    return saved
  })

  // ── Read while working ─────────────────────────────────────────────────────
  ipc.handle('rww:getStatus', () => windows.updateReadWhileWorkingRegistration())

  ipc.handle('rww:hideToTray', () => {
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
  ipc.handle('rww:enableAndHideToTray', () => windows.enableReadWhileWorkingAndHide())

  ipc.handle('rww:getTemporarySession', () => {
    // Single source of truth for RWW inheritance: the unified Settings handler
    // (ADR-0008). The resolver reproduces the historical `rww_x ?? x` merge.
    const store = db.getSettingsStore()
    const rwwSettings = resolveEffectiveSettings('rww', store)
    return { session: windows.temporaryReaderSession, settings: rwwSettings }
  })

  ipc.handle('rww:finishTemporarySession', () => windows.finishTemporaryReaderSession())

  ipc.handle('rww:exit', () => {
    windows.exitReadWhileWorkingMode('Exited Overlay Reader.')
    return { ok: true }
  })

  // ── File import ────────────────────────────────────────────────────────────
  ipc.handle('file:open', async () => {
    if (!windows.mainWindow) return null

    const result = await dialog.showOpenDialog(windows.mainWindow as BrowserWindow, {
      title: 'Import Text File',
      properties: ['openFile'],
      filters: [
        { name: 'Supported Files', extensions: ['txt', 'docx', 'pdf'] },
        { name: 'Plain Text', extensions: ['txt'] },
        { name: 'Word Document', extensions: ['docx'] },
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) return null

    const filePath = result.filePaths[0]
    const fileName = filePath.split(/[\\/]/).pop() ?? 'Unknown'
    const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : ''

    const parseResult = await FileParser.parse(filePath, ext)
    const title = FileParser.inferTitle(filePath)

    return {
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
  ipc.handle('export:all', async () => {
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
      settings: db.getSettings()
    }

    fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), 'utf-8')
    return { ok: true }
  })

  // ── Import from JSON ───────────────────────────────────────────────────────
  ipc.handle('import:json', async () => {
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

    return { ok: true, imported }
  })

  // ── Portable provisioning ─────────────────────────────────────────────────
  // Native folder picker for the "Create Portable Drive" action. Returns the
  // chosen absolute folder, or `canceled` so the renderer never provisions on a
  // dismissed dialog. `createDirectory` lets the user make a fresh stick folder.
  ipc.handle('portable:selectTarget', async () => {
    if (!windows.mainWindow) return { canceled: true }

    const result = await dialog.showOpenDialog(windows.mainWindow as BrowserWindow, {
      title: 'Choose a destination for the portable copy',
      buttonLabel: 'Use this folder',
      properties: ['openDirectory', 'createDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) return { canceled: true }
    return { canceled: false, targetPath: result.filePaths[0] }
  })

  ipc.handle('portable:createDrive', (_e, targetPath: string) =>
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
