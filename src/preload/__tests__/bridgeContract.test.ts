import { readFileSync } from 'fs'
import { resolve } from 'path'
import ts from 'typescript'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  channelContract,
  channelDescriptors,
  type ChannelContract,
  type ChannelDescriptor,
  type ChannelNamespace
} from '../../shared/channelContract'

const electronMocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  send: vi.fn()
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electronMocks.exposeInMainWorld },
  ipcRenderer: {
    invoke: electronMocks.invoke,
    on: electronMocks.on,
    removeListener: electronMocks.removeListener,
    send: electronMocks.send
  }
}))

import { dbApi } from '../dbApi'
import { appApi, dataApi, fileApi, videoApi } from '../miscApi'
import { readWhileWorkingApi } from '../readWhileWorkingApi'
import '../index'

/**
 * Sample traffic for one channel. Names, arities and transports are *derived*
 * from the contract — restating them here would just re-mint the drift the
 * contract exists to prevent. What is hand-written is the part types cannot
 * supply: representative arguments, and for subscriptions the raw event payload
 * plus the callback arguments preload must turn it into.
 */
interface ChannelFixture {
  args?: unknown[]
  eventArgs?: unknown[]
  callbackArgs?: unknown[]
}

const objectArg = { marker: 'object-argument' }
const arrayArg = [{ marker: 'array-element' }]
const bufferArg = new Uint8Array([1, 2, 3]).buffer

const FIXTURES: Record<ChannelNamespace, Record<string, ChannelFixture>> = {
  app: {
    getVersion: {},
    splashReady: {}
  },
  db: {
    getTexts: {},
    getText: { args: [11] },
    saveText: { args: [objectArg] },
    deleteText: { args: [11] },
    getCategories: {},
    saveCategory: { args: [objectArg] },
    deleteCategory: { args: [12] },
    assignTextCategory: { args: [11, 12] },
    getSettings: {},
    saveSettings: { args: [objectArg] },
    getSettingsStore: {},
    saveSettingsStore: { args: [objectArg] },
    getSegments: { args: [11] },
    getSegment: { args: [13] },
    saveSegments: { args: [11, arrayArg] },
    updateSegmentTitle: { args: [13, 'Chapter'] },
    deleteSegments: { args: [11] },
    deleteSegment: { args: [13] },
    appendSegment: { args: [11, objectArg] },
    createChapterFromPassage: { args: [11, 20, 40, 'Passage'] },
    getBookmarks: { args: [11] },
    saveBookmark: { args: [11, objectArg] },
    updateBookmarkLabel: { args: [14, 'Marker'] },
    deleteBookmark: { args: [14] },
    getSummaries: { args: [11] },
    saveSummary: { args: [objectArg] },
    deleteSummary: { args: [15] },
    getSummaryQuestionsForText: { args: [11] },
    saveSummaryQuestion: { args: [objectArg] },
    deleteSummaryQuestion: { args: [16] },
    getReadingPosition: { args: [11] },
    getLatestResumeCandidate: {},
    getBookResumeTarget: { args: [11] },
    saveReadingPosition: { args: [11, 9, 'segment'] },
    recordSessionStats: { args: [objectArg] },
    getStatsOverview: {},
    getStatsDays: {},
    getTodaySessionStats: {}
  },
  file: {
    open: {}
  },
  data: {
    exportAll: {},
    importJson: {},
    parseWingletBook: { args: ['C:\\books\\book.wbook'] },
    commitWingletBook: { args: ['C:\\books\\book.wbook'] },
    parseEpub: { args: ['C:\\books\\book.epub'] },
    commitEpub: { args: ['C:\\books\\book.epub'] },
    selectPortableTarget: {},
    createPortableDrive: { args: ['E:\\WingletReader'] }
  },
  video: {
    save: { args: [bufferArg, 'reading.mp4'] }
  },
  readWhileWorking: {
    getStatus: {},
    hideToTray: {},
    enableAndHideToTray: {},
    getTemporarySession: {},
    // No argument: the resolved `finishTemporarySession(reason)` mismatch.
    finishTemporarySession: {},
    exit: {},
    onExited: { eventArgs: [{}], callbackArgs: [] },
    onEnableFailed: {
      eventArgs: [{}, { error: 'Shortcut unavailable' }],
      callbackArgs: ['Shortcut unavailable']
    }
  }
}

interface ContractRow extends ChannelDescriptor, ChannelFixture {}

const CONTRACT: ContractRow[] = channelDescriptors.map((descriptor) => {
  const fixture = FIXTURES[descriptor.namespace]?.[descriptor.method]
  if (!fixture) {
    throw new Error(
      `No bridge fixture for ${descriptor.namespace}.${descriptor.method} — every contract channel must be exercised`
    )
  }
  return { ...descriptor, ...fixture, args: fixture.args ?? [] }
})

type RuntimeMethod = (...args: unknown[]) => unknown
type RuntimeApis = Record<ChannelNamespace, Record<string, RuntimeMethod>>

const runtimeApis = {
  app: appApi,
  db: dbApi,
  file: fileApi,
  data: dataApi,
  video: videoApi,
  readWhileWorking: readWhileWorkingApi
} as unknown as RuntimeApis

function contractShape(): Record<string, Record<string, number>> {
  const shape: Record<string, Record<string, number>> = {}
  for (const row of CONTRACT) {
    ;(shape[row.namespace] ??= {})[row.method] = row.arity
  }
  return shape
}

function runtimeShape(): Record<string, Record<string, number>> {
  return Object.fromEntries(
    Object.entries(runtimeApis).map(([namespace, api]) => [
      namespace,
      Object.fromEntries(
        Object.entries(api).map(([method, implementation]) => [method, implementation.length])
      )
    ])
  )
}

function propertyName(node: ts.PropertyName | undefined): string {
  if (node && (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node))) {
    return node.text
  }
  throw new Error('The bridge contract only supports statically named properties')
}

function findWindowInterface(sourceFile: ts.SourceFile): ts.InterfaceDeclaration {
  let match: ts.InterfaceDeclaration | undefined
  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === 'Window') match = node
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  if (!match) throw new Error('env.d.ts does not declare Window')
  return match
}

/**
 * `env.d.ts` no longer restates channels; it binds `window.api` to the
 * contract-derived `WingletApi`. So the check is that the binding is still that
 * type reference — a hand-written type literal creeping back in is the drift
 * this catches.
 */
function rendererApiTypeName(): string {
  const sourceText = readFileSync(resolve(process.cwd(), 'src/renderer/src/env.d.ts'), 'utf8')
  const sourceFile = ts.createSourceFile(
    'env.d.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  const windowDeclaration = findWindowInterface(sourceFile)
  const apiProperty = windowDeclaration.members.find(
    (member): member is ts.PropertySignature =>
      ts.isPropertySignature(member) && propertyName(member.name) === 'api'
  )
  if (!apiProperty) throw new Error('env.d.ts does not declare Window.api')
  if (
    !apiProperty.type ||
    !ts.isTypeReferenceNode(apiProperty.type) ||
    !ts.isIdentifier(apiProperty.type.typeName)
  ) {
    throw new Error('Window.api must be a type reference, not a hand-written declaration')
  }
  return apiProperty.type.typeName.text
}

interface MainSignals {
  handled: Set<string>
  listened: Set<string>
  emitted: Set<string>
}

const contractsByIdentifier: Record<string, ChannelContract> = Object.fromEntries(
  Object.entries(channelContract).map(([namespace, contract]) => [
    `${namespace}ChannelContract`,
    contract as ChannelContract
  ])
)

/**
 * Resolves a channel out of main-process source: either a bare string literal
 * (nothing left uses one) or the contract reference that replaced them, in
 * either the `<family>ChannelContract.method` or `.channel` form.
 */
function resolveChannel(node: ts.Expression | undefined): string | undefined {
  if (!node) return undefined
  if (ts.isStringLiteral(node)) return node.text
  if (ts.isPropertyAccessExpression(node) && node.name.text === 'channel') {
    return resolveChannel(node.expression)
  }
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
    return contractsByIdentifier[node.expression.text]?.[node.name.text]?.channel
  }
  return undefined
}

function recordMainSignal(call: ts.CallExpression, signals: MainSignals): void {
  if (ts.isPropertyAccessExpression(call.expression)) {
    const targets: Record<string, Set<string>> = {
      handle: signals.handled,
      on: signals.listened,
      once: signals.listened,
      send: signals.emitted
    }
    const channel = resolveChannel(call.arguments[0])
    if (channel) targets[call.expression.name.text]?.add(channel)
    return
  }
  if (ts.isIdentifier(call.expression) && call.expression.text === 'registerHandler') {
    const channel = resolveChannel(call.arguments[1])
    if (channel) signals.handled.add(channel)
    return
  }
  if (ts.isIdentifier(call.expression) && call.expression.text === 'sendRendererEvent') {
    const channel = resolveChannel(call.arguments[1])
    if (channel) signals.emitted.add(channel)
  }
}

function mainProcessSignals(): MainSignals {
  const signals: MainSignals = { handled: new Set(), listened: new Set(), emitted: new Set() }
  const sourcePaths = ['src/main/ipcHandlers.ts', 'src/main/index.ts', 'src/main/rwwNavigation.ts']

  for (const sourcePath of sourcePaths) {
    const sourceText = readFileSync(resolve(process.cwd(), sourcePath), 'utf8')
    const sourceFile = ts.createSourceFile(
      sourcePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    )
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) recordMainSignal(node, signals)
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }

  return signals
}

beforeEach(() => {
  electronMocks.invoke.mockReset()
  electronMocks.on.mockReset()
  electronMocks.removeListener.mockReset()
  electronMocks.send.mockReset()
})

describe('preload bridge contract', () => {
  it('exposes exactly the namespaces the renderer expects', () => {
    expect(electronMocks.exposeInMainWorld).toHaveBeenCalledOnce()
    expect(electronMocks.exposeInMainWorld).toHaveBeenCalledWith('api', runtimeApis)
  })

  it('gives every family, and every channel in it, at least one exercised fixture', () => {
    const covered = new Set(CONTRACT.map((row) => `${row.namespace}.${row.method}`))
    expect(covered.size).toBe(channelDescriptors.length)
    expect(new Set(CONTRACT.map((row) => row.namespace))).toEqual(
      new Set(Object.keys(channelContract))
    )
  })

  it('keeps the exposed runtime surface equal to the contract in keys and arity', () => {
    expect(runtimeShape()).toEqual(contractShape())
  })

  it('binds window.api to the contract-derived surface in env.d.ts', () => {
    expect(rendererApiTypeName()).toBe('WingletApi')
  })

  it('backs every renderer-to-main channel with the matching main registration', () => {
    const signals = mainProcessSignals()
    for (const row of CONTRACT) {
      if (row.transport === 'invoke') expect(signals.handled, row.channel).toContain(row.channel)
      if (row.transport === 'send') expect(signals.listened, row.channel).toContain(row.channel)
    }
  })

  it('backs every main-to-renderer subscription with a main emitter', () => {
    const signals = mainProcessSignals()
    for (const row of CONTRACT.filter(({ transport }) => transport === 'subscribe')) {
      expect(signals.emitted, row.channel).toContain(row.channel)
    }
  })

  it.each(CONTRACT.filter(({ transport }) => transport === 'invoke'))(
    'marshals $namespace.$method arguments and its resolved return value',
    async (row) => {
      const returnValue = { channel: row.channel, shape: 'return-value' }
      electronMocks.invoke.mockResolvedValueOnce(returnValue)

      const result = await runtimeApis[row.namespace][row.method](...(row.args ?? []))

      expect(electronMocks.invoke).toHaveBeenCalledOnce()
      expect(electronMocks.invoke).toHaveBeenCalledWith(row.channel, ...(row.args ?? []))
      expect(result).toBe(returnValue)
    }
  )

  it.each(CONTRACT.filter(({ transport }) => transport === 'send'))(
    'marshals $namespace.$method as a one-way message',
    (row) => {
      const result = runtimeApis[row.namespace][row.method](...(row.args ?? []))

      expect(electronMocks.send).toHaveBeenCalledOnce()
      expect(electronMocks.send).toHaveBeenCalledWith(row.channel, ...(row.args ?? []))
      expect(result).toBeUndefined()
    }
  )

  it.each(CONTRACT.filter(({ transport }) => transport === 'subscribe'))(
    'marshals $namespace.$method events and removes the exact listener',
    (row) => {
      const callback = vi.fn()
      const unsubscribe = runtimeApis[row.namespace][row.method](callback) as () => void
      const listener = electronMocks.on.mock.calls[0]?.[1] as (...args: unknown[]) => void

      expect(electronMocks.on).toHaveBeenCalledOnce()
      expect(electronMocks.on).toHaveBeenCalledWith(row.channel, listener)

      listener(...(row.eventArgs ?? []))
      expect(callback).toHaveBeenCalledWith(...(row.callbackArgs ?? []))

      unsubscribe()
      expect(electronMocks.removeListener).toHaveBeenCalledOnce()
      expect(electronMocks.removeListener).toHaveBeenCalledWith(row.channel, listener)
    }
  )
})
