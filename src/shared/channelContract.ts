import type { Settings, SettingsStore } from './settings'
import type {
  Bookmark,
  BookResumeTarget,
  CategoryRecord,
  DayStatsRecord,
  ReadingPosition,
  ReadWhileWorkingStatus,
  ResumeCandidate,
  SessionStatsRecord,
  StatsOverview,
  Summary,
  SummaryQuestion,
  TemporaryReaderSession,
  TextRecord,
  TextSegment
} from './domainRecords'
import type { ImportDiagnostics, ImportedBlock, ImportedPage } from './importTypes'

/** What the Import confirm card shows for an accepted Winglet Book. */
export interface WingletBookConfirmation {
  seedId: string
  title: string
  chapterCount: number
  categoryName: string
}

export type WingletBookParseResult =
  | { status: 'accepted'; filePath: string; confirmation: WingletBookConfirmation }
  | { status: 'duplicate'; filePath: string; seedId: string; title: string }
  | { status: 'foreign'; filePath: string }
  | { status: 'unsupported-version'; filePath: string; schemaVersion: number; newer: boolean }
  | { status: 'malformed'; filePath: string; reason: string }

/** Every `.wbook` ladder outcome short of acceptance; shared by both halves. */
export type WingletBookRefusal = Exclude<WingletBookParseResult, { status: 'accepted' }>

/**
 * How **every** book-intake channel reports a successful commit: it committed,
 * and here is the row it wrote (ADR-0033 amendment; ADR-0034 §2 for the shape's
 * origin). Carrying the id is what lets one landing path open the new book's
 * Contents view without knowing the format or re-finding the row by identity.
 *
 * Refusals stay per format — they are the one place the formats genuinely
 * differ — so only success is shared.
 */
export interface BookCommitted {
  status: 'committed'
  filePath: string
  textId: number
}

export type WingletBookCommitResult = BookCommitted | WingletBookRefusal

/** What the Import confirm card shows for an accepted EPUB. */
export interface EpubConfirmation {
  title: string
  author: string | null
  chapterCount: number
  wordCount: number
  imagesOmitted: number
}

export type EpubImportRefusal =
  | { status: 'drm-protected'; filePath: string }
  | {
      status: 'oversized'
      filePath: string
      cap: 'container' | 'text'
      limitBytes: number
      observedBytes?: number
    }
  | { status: 'malformed'; filePath: string; reason: string }

export type EpubParseResult =
  | { status: 'accepted'; filePath: string; confirmation: EpubConfirmation }
  | EpubImportRefusal

export type EpubCommitResult = BookCommitted | EpubImportRefusal

export type PortableProvisioningErrorCode =
  | 'invalid-target'
  | 'target-not-writable'
  | 'insufficient-space'
  | 'portable-exists'
  | 'target-has-conflicts'
  | 'source-missing'
  | 'copy-failed'

export interface PortableProvisioningError {
  code: PortableProvisioningErrorCode
  message: string
  detail?: string
  requiredBytes?: number
  availableBytes?: number
}

export type PortableProvisioningResult =
  | {
      ok: true
      targetPath: string
      launcherPath: string
      dataPath: string
    }
  | {
      ok: false
      error: PortableProvisioningError
    }

/**
 * What `file:open` answers with. A `.wbook` or `.epub` extension sends the path
 * down its own door **unparsed** (ADR-0033 §4; ADR-0034 §8) — recognition is
 * the `format` marker's / container ladder's job, decided by
 * `data.parseWingletBook` and `data.parseEpub` — so the three arms carry
 * genuinely different payloads and callers must branch on `kind` before
 * touching any of them.
 */
// fallow-ignore-next-line unused-type -- contract-shaped: file:open's declared result type, consumed structurally through WingletApi, not imported by name.
export type FileOpenResult =
  | {
      kind: 'text-file'
      fileName: string
      title: string
      content: string
      warnings: string[]
      ext: string
      pageCount?: number
      html?: string | null
      diagnostics?: ImportDiagnostics
      blocks?: ImportedBlock[]
      pages?: ImportedPage[]
    }
  | { kind: 'winglet-book'; fileName: string; filePath: string }
  | { kind: 'epub-book'; fileName: string; filePath: string }
  | null

/** Drafts the renderer may hand across the seam, mirroring what the store accepts. */
// fallow-ignore-next-line unused-type -- contract-shaped: db:saveSegments/appendSegment's declared draft argument type, consumed structurally, not imported by name.
export type TextSegmentDraft = Omit<TextSegment, 'id' | 'textId'>
// fallow-ignore-next-line unused-type -- contract-shaped: db:saveBookmark's declared draft argument type, consumed structurally, not imported by name.
export type BookmarkDraft = Omit<Bookmark, 'id' | 'textId' | 'createdAt'>
// fallow-ignore-next-line unused-type -- contract-shaped draft for db:saveSummary; belongs to the post-reading summary flow, disabled but not removed (D2/alphaChrome.postReadingSummaryEnabled) -- do not delete.
export type SummaryDraft = Omit<Summary, 'id' | 'created_at' | 'updated_at'> & { id?: number }
// fallow-ignore-next-line unused-type -- contract-shaped draft for db:saveSummaryQuestion; belongs to the post-reading summary flow, disabled but not removed (D2/alphaChrome.postReadingSummaryEnabled) -- do not delete.
export type SummaryQuestionDraft = Omit<SummaryQuestion, 'id' | 'created_at' | 'updated_at'> & {
  id?: number
}

export type Transport = 'invoke' | 'send' | 'subscribe'

/**
 * One renderer-to-main invocation. The tuple and result markers are erased at
 * runtime; `transport`, `channel` and `arity` are the metadata shared by main,
 * preload and contract tests.
 */
export interface ChannelDefinition<Args extends unknown[], Result> {
  readonly transport: 'invoke'
  readonly channel: string
  readonly arity: Args['length']
  readonly __args?: Args
  readonly __result?: Result
}

/**
 * One renderer-to-main message with no answer. Distinct from an invocation
 * because the binding returns `void`, not a promise, and main *listens* for it
 * rather than handling it.
 */
export interface SendChannelDefinition<Args extends unknown[]> {
  readonly transport: 'send'
  readonly channel: string
  readonly arity: Args['length']
  readonly __args?: Args
}

/**
 * One main-to-renderer event. The binding takes a callback and answers with an
 * unsubscribe function — deliberately not the request/response shape. The type
 * parameter is what the *callback* receives, not what crosses the wire; the
 * raw event payload is adapted in preload, which is where the transport lives.
 */
export interface SubscriptionDefinition<CallbackArgs extends unknown[]> {
  readonly transport: 'subscribe'
  readonly channel: string
  /** The renderer-facing binding takes exactly one argument: the callback. */
  readonly arity: 1
  readonly __callbackArgs?: CallbackArgs
}

export type AnyChannelDefinition =
  | ChannelDefinition<unknown[], unknown>
  | SendChannelDefinition<unknown[]>
  | SubscriptionDefinition<unknown[]>

export type ChannelContract = Record<string, AnyChannelDefinition>

function defineChannel<Args extends unknown[], Result>(
  channel: string,
  arity: Args['length']
): ChannelDefinition<Args, Result> {
  return { transport: 'invoke', channel, arity }
}

function defineSend<Args extends unknown[]>(
  channel: string,
  arity: Args['length']
): SendChannelDefinition<Args> {
  return { transport: 'send', channel, arity }
}

function defineSubscription<CallbackArgs extends unknown[]>(
  channel: string
): SubscriptionDefinition<CallbackArgs> {
  return { transport: 'subscribe', channel, arity: 1 }
}

/** The complete `window.api.app` channel family. */
export const appChannelContract = {
  getVersion: defineChannel<[], string>('app:getVersion', 0),
  splashReady: defineSend<[]>('splash:renderer-ready', 0)
} as const

/** The complete `window.api.db` channel family. */
export const dbChannelContract = {
  // ── Texts ─────────────────────────────────────────────────────────────────
  getTexts: defineChannel<[], TextRecord[]>('db:getTexts', 0),
  getText: defineChannel<[id: number], TextRecord | null>('db:getText', 1),
  saveText: defineChannel<[text: Partial<TextRecord>], TextRecord>('db:saveText', 1),
  deleteText: defineChannel<[id: number], void>('db:deleteText', 1),

  // ── Categories ────────────────────────────────────────────────────────────
  getCategories: defineChannel<[], CategoryRecord[]>('db:getCategories', 0),
  saveCategory: defineChannel<[category: Partial<CategoryRecord>], CategoryRecord>(
    'db:saveCategory',
    1
  ),
  deleteCategory: defineChannel<[id: number], void>('db:deleteCategory', 1),
  assignTextCategory: defineChannel<[textId: number, categoryId: number], TextRecord>(
    'db:assignTextCategory',
    2
  ),

  // ── Settings ──────────────────────────────────────────────────────────────
  getSettings: defineChannel<[], Settings>('db:getSettings', 0),
  saveSettings: defineChannel<[settings: Partial<Settings>], Settings>('db:saveSettings', 1),
  getSettingsStore: defineChannel<[], SettingsStore>('db:getSettingsStore', 0),
  saveSettingsStore: defineChannel<[store: SettingsStore], SettingsStore>(
    'db:saveSettingsStore',
    1
  ),

  // ── Segments ──────────────────────────────────────────────────────────────
  getSegments: defineChannel<[textId: number], TextSegment[]>('db:getSegments', 1),
  getSegment: defineChannel<[id: number], TextSegment | null>('db:getSegment', 1),
  saveSegments: defineChannel<[textId: number, drafts: TextSegmentDraft[]], TextSegment[]>(
    'db:saveSegments',
    2
  ),
  updateSegmentTitle: defineChannel<[id: number, title: string], void>('db:updateSegmentTitle', 2),
  deleteSegments: defineChannel<[textId: number], void>('db:deleteSegments', 1),
  deleteSegment: defineChannel<[id: number], void>('db:deleteSegment', 1),
  appendSegment: defineChannel<[textId: number, draft: TextSegmentDraft], TextSegment>(
    'db:appendSegment',
    2
  ),
  createChapterFromPassage: defineChannel<
    [textId: number, startWordOffset: number, endWordOffset: number, title: string],
    { ok: true; segment: TextSegment } | { ok: false; error: string }
  >('db:createChapterFromPassage', 4),

  // ── Bookmarks ─────────────────────────────────────────────────────────────
  getBookmarks: defineChannel<[textId: number], Bookmark[]>('db:getBookmarks', 1),
  saveBookmark: defineChannel<[textId: number, draft: BookmarkDraft], Bookmark>(
    'db:saveBookmark',
    2
  ),
  updateBookmarkLabel: defineChannel<[id: number, label: string], void>(
    'db:updateBookmarkLabel',
    2
  ),
  deleteBookmark: defineChannel<[id: number], void>('db:deleteBookmark', 1),

  // ── Summaries ─────────────────────────────────────────────────────────────
  getSummaries: defineChannel<[textId: number], Summary[]>('db:getSummaries', 1),
  saveSummary: defineChannel<[data: SummaryDraft], Summary>('db:saveSummary', 1),
  deleteSummary: defineChannel<[id: number], void>('db:deleteSummary', 1),
  getSummaryQuestionsForText: defineChannel<[textId: number], SummaryQuestion[]>(
    'db:getSummaryQuestionsForText',
    1
  ),
  saveSummaryQuestion: defineChannel<[data: SummaryQuestionDraft], SummaryQuestion>(
    'db:saveSummaryQuestion',
    1
  ),
  deleteSummaryQuestion: defineChannel<[id: number], void>('db:deleteSummaryQuestion', 1),

  // ── Reading positions ─────────────────────────────────────────────────────
  getReadingPosition: defineChannel<[textId: number], ReadingPosition | null>(
    'db:getReadingPosition',
    1
  ),
  getLatestResumeCandidate: defineChannel<[], ResumeCandidate | null>(
    'db:getLatestResumeCandidate',
    0
  ),
  getBookResumeTarget: defineChannel<[bookTextId: number], BookResumeTarget | null>(
    'db:getBookResumeTarget',
    1
  ),
  saveReadingPosition: defineChannel<
    [textId: number, stackIndex: number, source?: ReadingPosition['source']],
    ReadingPosition
  >('db:saveReadingPosition', 3),

  // ── Stats (ADR-0035 §4) ───────────────────────────────────────────────────
  // Write once per finished session; read whole. Every day rule — date
  // assignment, folding, the quota verdict — stays in main, so the renderer
  // never sends a day key and never computes one.
  recordSessionStats: defineChannel<[record: SessionStatsRecord], void>(
    'db:recordSessionStats',
    1
  ),
  getStatsOverview: defineChannel<[], StatsOverview>('db:getStatsOverview', 0),
  getStatsDays: defineChannel<[], DayStatsRecord[]>('db:getStatsDays', 0),
  getTodaySessionStats: defineChannel<[], SessionStatsRecord[]>('db:getTodaySessionStats', 0)
} as const

/** The complete `window.api.file` channel family. */
export const fileChannelContract = {
  open: defineChannel<[], FileOpenResult>('file:open', 0)
} as const

/** The complete `window.api.data` channel family. */
export const dataChannelContract = {
  exportAll: defineChannel<[], { ok: boolean; error?: string }>('export:all', 0),
  importJson: defineChannel<[], { ok: boolean; imported?: number; error?: string }>(
    'import:json',
    0
  ),
  parseWingletBook: defineChannel<[filePath: string], WingletBookParseResult>(
    'import:wbookParse',
    1
  ),
  commitWingletBook: defineChannel<[filePath: string], WingletBookCommitResult>(
    'import:wbookCommit',
    1
  ),
  parseEpub: defineChannel<[filePath: string], EpubParseResult>('import:epubParse', 1),
  commitEpub: defineChannel<[filePath: string], EpubCommitResult>('import:epubCommit', 1),
  selectPortableTarget: defineChannel<[], { canceled: boolean; targetPath?: string }>(
    'portable:selectTarget',
    0
  ),
  createPortableDrive: defineChannel<[targetPath: string], PortableProvisioningResult>(
    'portable:createDrive',
    1
  )
} as const

/** The complete `window.api.video` channel family. */
export const videoChannelContract = {
  save: defineChannel<
    [buffer: ArrayBuffer, suggestedName: string],
    { ok: boolean; error?: string }
  >('video:save', 2)
} as const

/** The complete `window.api.readWhileWorking` channel family. */
export const readWhileWorkingChannelContract = {
  getStatus: defineChannel<[], ReadWhileWorkingStatus>('rww:getStatus', 0),
  hideToTray: defineChannel<[], ReadWhileWorkingStatus>('rww:hideToTray', 0),
  enableAndHideToTray: defineChannel<[], ReadWhileWorkingStatus>('rww:enableAndHideToTray', 0),
  getTemporarySession: defineChannel<
    [],
    { session: TemporaryReaderSession | null; settings: Settings }
  >('rww:getTemporarySession', 0),
  // Takes no argument: finishing an overlay session is reason-independent in
  // main, which also finishes it internally on the exit path (issue 03).
  finishTemporarySession: defineChannel<[], { ok: boolean }>('rww:finishTemporarySession', 0),
  exit: defineChannel<[], { ok: boolean }>('rww:exit', 0),
  /** Subscribe to RWW-exit. Fires on the main window. */
  onExited: defineSubscription<[]>('rww:exited'),
  /** Subscribe to tray-initiated enable failures. Fires on the main window. */
  onEnableFailed: defineSubscription<[error: string]>('rww:enableFailed')
} as const

/**
 * Every channel family, keyed by the `window.api` namespace it becomes. This is
 * the single declaration site: main registration, preload binding and renderer
 * type all derive from here.
 */
export const channelContract = {
  app: appChannelContract,
  db: dbChannelContract,
  file: fileChannelContract,
  data: dataChannelContract,
  video: videoChannelContract,
  readWhileWorking: readWhileWorkingChannelContract
} as const

export type ChannelNamespace = keyof typeof channelContract

export type ChannelArgs<Definition> =
  Definition extends ChannelDefinition<infer Args, unknown>
    ? Args
    : Definition extends SendChannelDefinition<infer Args>
      ? Args
      : never

export type ChannelResult<Definition> =
  Definition extends ChannelDefinition<unknown[], infer Result> ? Result : never

export type ChannelCallbackArgs<Definition> =
  Definition extends SubscriptionDefinition<infer CallbackArgs> ? CallbackArgs : never

export type ChannelHandler<Definition> = (
  event: unknown,
  ...args: ChannelArgs<Definition>
) => ChannelResult<Definition> | Promise<ChannelResult<Definition>>

/** The renderer-facing shape of one channel, chosen by its transport. */
export type ChannelBinding<Definition> =
  Definition extends ChannelDefinition<infer Args, infer Result>
    ? (...args: Args) => Promise<Result>
    : Definition extends SendChannelDefinition<infer Args>
      ? (...args: Args) => void
      : Definition extends SubscriptionDefinition<infer CallbackArgs>
        ? (callback: (...args: CallbackArgs) => void) => () => void
        : never

export type ChannelApi<Contract extends ChannelContract> = {
  [Method in keyof Contract]: ChannelBinding<Contract[Method]>
}

// fallow-ignore-next-line unused-type -- contract-shaped: per-namespace API surface mirroring WingletApi's declared shape, kept for a consumer that wants one namespace's binding type without the aggregate; no current importer.
export type AppApi = ChannelApi<typeof appChannelContract>
// fallow-ignore-next-line unused-type -- contract-shaped: per-namespace API surface mirroring WingletApi's declared shape, kept for a consumer that wants one namespace's binding type without the aggregate; no current importer.
export type DbApi = ChannelApi<typeof dbChannelContract>
// fallow-ignore-next-line unused-type -- contract-shaped: per-namespace API surface mirroring WingletApi's declared shape, kept for a consumer that wants one namespace's binding type without the aggregate; no current importer.
export type FileApi = ChannelApi<typeof fileChannelContract>
// fallow-ignore-next-line unused-type -- contract-shaped: per-namespace API surface mirroring WingletApi's declared shape, kept for a consumer that wants one namespace's binding type without the aggregate; no current importer.
export type DataApi = ChannelApi<typeof dataChannelContract>
// fallow-ignore-next-line unused-type -- contract-shaped: per-namespace API surface mirroring WingletApi's declared shape, kept for a consumer that wants one namespace's binding type without the aggregate; no current importer.
export type VideoApi = ChannelApi<typeof videoChannelContract>
// fallow-ignore-next-line unused-type -- contract-shaped: per-namespace API surface mirroring WingletApi's declared shape, kept for a consumer that wants one namespace's binding type without the aggregate; no current importer.
export type ReadWhileWorkingApi = ChannelApi<typeof readWhileWorkingChannelContract>

/** The whole isolated-world surface: exactly what `window.api` is. */
export type WingletApi = {
  [Namespace in ChannelNamespace]: ChannelApi<(typeof channelContract)[Namespace]>
}

/** One row of the flattened contract, for registries and contract tests. */
export interface ChannelDescriptor {
  namespace: ChannelNamespace
  method: string
  transport: Transport
  channel: string
  arity: number
}

export const channelDescriptors: ChannelDescriptor[] = Object.entries(channelContract).flatMap(
  ([namespace, contract]) =>
    Object.entries(contract as ChannelContract).map(([method, definition]) => ({
      namespace: namespace as ChannelNamespace,
      method,
      transport: definition.transport,
      channel: definition.channel,
      arity: definition.arity
    }))
)

/** Every channel main must answer with `ipcMain.handle`. */
export const invokeChannelNames = channelDescriptors
  .filter(({ transport }) => transport === 'invoke')
  .map(({ channel }) => channel)

export interface IpcBridge {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  send(channel: string, ...args: unknown[]): void
  on(channel: string, listener: (...eventArgs: unknown[]) => void): void
  removeListener(channel: string, listener: (...eventArgs: unknown[]) => void): void
}

type SubscriptionMethods<Contract extends ChannelContract> = {
  [Method in keyof Contract]: Contract[Method] extends SubscriptionDefinition<unknown[]>
    ? Method
    : never
}[keyof Contract]

/**
 * Per-subscription translation from raw `ipcRenderer` event arguments to the
 * callback arguments the contract promises. Only subscription channels need
 * one, and every one of them must supply it.
 */
// fallow-ignore-next-line unused-type -- contract-shaped: the generic adapter-map shape createChannelApi's AdapterArgument constrains against; consumed structurally, not imported by name.
export type SubscriptionAdapters<Contract extends ChannelContract> = {
  [Method in SubscriptionMethods<Contract>]: (
    ...eventArgs: unknown[]
  ) => ChannelCallbackArgs<Contract[Method]>
}

type AdapterArgument<Contract extends ChannelContract> = [SubscriptionMethods<Contract>] extends [
  never
]
  ? []
  : [SubscriptionAdapters<Contract>]

type AnyBinding = (...args: never[]) => unknown

/**
 * Rebuilds a fixed-arity forwarder so the exposed binding reports the same
 * `Function.length` the contract declares — `contextBridge` copies functions,
 * and the bridge tests read arity off the exposed surface.
 */
function forwarder(arity: number, dispatch: (args: unknown[]) => unknown): AnyBinding {
  switch (arity) {
    case 0:
      return () => dispatch([])
    case 1:
      return (first: unknown) => dispatch([first])
    case 2:
      return (first: unknown, second: unknown) => dispatch([first, second])
    case 3:
      return (first: unknown, second: unknown, third: unknown) => dispatch([first, second, third])
    case 4:
      return (first: unknown, second: unknown, third: unknown, fourth: unknown) =>
        dispatch([first, second, third, fourth])
    default:
      throw new Error(`Unsupported IPC channel arity: ${String(arity)}`)
  }
}

function binding(
  bridge: IpcBridge,
  definition: AnyChannelDefinition,
  adapt?: (...eventArgs: unknown[]) => unknown[]
): AnyBinding {
  if (definition.transport === 'invoke') {
    return forwarder(definition.arity, (args) => bridge.invoke(definition.channel, ...args))
  }
  if (definition.transport === 'send') {
    return forwarder(definition.arity, (args) => {
      bridge.send(definition.channel, ...args)
    })
  }
  if (!adapt) {
    throw new Error(`Subscription channel without an adapter: ${definition.channel}`)
  }
  return (callback: (...eventArgs: unknown[]) => void) => {
    const listener = (...eventArgs: unknown[]): void => {
      callback(...adapt(...eventArgs))
    }
    bridge.on(definition.channel, listener)
    return () => bridge.removeListener(definition.channel, listener)
  }
}

/** Builds one isolated-world namespace without importing Electron here. */
export function createChannelApi<Contract extends ChannelContract>(
  bridge: IpcBridge,
  contract: Contract,
  ...adapters: AdapterArgument<Contract>
): ChannelApi<Contract> {
  const subscriptionAdapters = (adapters[0] ?? {}) as Record<
    string,
    (...eventArgs: unknown[]) => unknown[]
  >
  return Object.fromEntries(
    Object.entries(contract).map(([method, definition]) => [
      method,
      binding(bridge, definition, subscriptionAdapters[method])
    ])
  ) as ChannelApi<Contract>
}
