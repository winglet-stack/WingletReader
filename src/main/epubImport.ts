/**
 * EPUB import — the bytes-on-disk container ladder (ADR-0034 §1, §3, §6; EP-2b).
 *
 * Sibling of `wingletBookImport.ts`. The bulk of the module is the *parse* half:
 * turning a picked `.epub` path into an EP-1 verdict while writing nothing. The
 * parse-then-commit envelope the IPC pair speaks, and the store insert behind
 * the commit half, sit at the bottom of the file (EP-3).
 *
 * The ladder is caps → DRM → container → package document → table of contents →
 * per-file extraction, in that order, because each rung is cheaper than the one
 * after it and a refusal should cost as little as possible. DRM in particular is
 * checked *before any parse effort* (§1) so a protected book is named as such
 * rather than surfacing as damage further down.
 *
 * **Security posture (§6).** Reads are in-memory only — no archive entry is ever
 * written to disk, so zip-slip is structurally impossible; archive paths are
 * normalized with `..` unable to climb past the root anyway. No href is resolved
 * outside the archive: an absolute URL in a TOC is dropped, never fetched, which
 * is what makes XXE and network access inert by rule rather than by accident.
 * Two byte caps bound hostile input: the container file itself, and the running
 * total of everything decompressed out of it (the zip-bomb backstop, enforced as
 * entries are read rather than tallied afterwards).
 *
 * All chapter judgement comes from `../shared/epubBook` (EP-1) and all XHTML
 * projection from `./epubExtract` (EP-2a); neither is re-implemented here. This
 * module owns exactly the three things they cannot see: the zip, the XML
 * manifests, and the caps.
 */
import fs from 'fs'
import path from 'path'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { extractXhtmlText } from './epubExtract'
import { buildImportDiagnostics, cleanupExtractedMarkupText } from '../shared/importTextCleanup'
import type { ImportDiagnostics } from '../shared/importTypes'
import type { Database } from './database'
import {
  createBookIntake,
  type BookIntakeAdapter,
  type IntakeOutcome,
  type IntakeTextFields
} from './bookIntake'
import {
  EPUB_CONTAINER_BYTE_CAP,
  EPUB_TEXT_BYTE_CAP,
  deriveEpubBook,
  type DerivedEpubBook,
  type EpubParseInput,
  type EpubSpineItem,
  type EpubTocEntry,
  type EpubVerdict
} from '../shared/epubBook'
import type {
  EpubCommitResult,
  EpubConfirmation,
  EpubImportRefusal,
  EpubParseResult
} from '../shared/channelContract'
export type {
  EpubCommitResult,
  EpubConfirmation,
  EpubImportRefusal,
  EpubParseResult
} from '../shared/channelContract'

/** Advisory extension — routing only; the container's own contents decide. */
export const EPUB_EXTENSION = 'epub'

/** Every EP-1 verdict short of acceptance. */
export type EpubRefusal = Exclude<EpubVerdict, { kind: 'valid' }>

/**
 * An EP-1 verdict, with one addition acceptance carries: the images-omitted
 * count. It is not part of the derived book — `DerivedEpubBook` describes the
 * text that landed, and this describes what did not — but the confirm card and
 * `import_diagnostics` both need it, and re-deriving it would mean re-parsing
 * every content document (ADR-0034 §4).
 */
export type ParsedEpubFile =
  | EpubRefusal
  | { kind: 'valid'; book: DerivedEpubBook; imageCount: number }

/** The one OCF path fixed by the spec; everything else is discovered from it. */
const CONTAINER_PATH = 'META-INF/container.xml'
const ENCRYPTION_PATH = 'META-INF/encryption.xml'

const NCX_MEDIA_TYPE = 'application/x-dtbncx+xml'

/** Content documents worth projecting to text; anything else contributes none. */
const XHTML_MEDIA_TYPES = new Set(['application/xhtml+xml', 'text/html', 'application/xhtml'])
const XHTML_EXTENSIONS = new Set(['xhtml', 'xhtm', 'html', 'htm'])

/**
 * Font containers. An `encryption.xml` covering only these is Adobe/IDPF font
 * obfuscation — common in perfectly legitimate DRM-free books — and must not be
 * mistaken for protection (§1).
 */
const FONT_EXTENSIONS = new Set([
  'ttf',
  'otf',
  'ttc',
  'otc',
  'woff',
  'woff2',
  'eot',
  'pfb',
  'pfa',
  'dfont'
])

/** See `epubExtract.ts`: recoverable XML complaints are swallowed, fatals throw. */
const QUIET_ERROR_HANDLER = {
  warning: (): void => {},
  error: (): void => {}
}

/**
 * A refusal raised from wherever it is discovered, so no rung has to thread a
 * verdict back up through the ones above it. {@link parseEpubFile} is the only
 * catcher; anything else that escapes becomes `malformed` there.
 */
class EpubRefusalSignal extends Error {
  constructor(readonly verdict: EpubRefusal) {
    super(verdict.kind)
    this.name = 'EpubRefusalSignal'
  }
}

function refuse(verdict: EpubRefusal): never {
  throw new EpubRefusalSignal(verdict)
}

function refuseMalformed(reason: string): never {
  refuse({ kind: 'malformed', reason })
}

// ---------------------------------------------------------------------------
// Archive paths
// ---------------------------------------------------------------------------

/**
 * An archive path in canonical form: `/`-separated, no empty or `.` segments,
 * `..` resolved. A `..` with nothing to pop is simply dropped, which is why a
 * crafted href cannot name anything outside the archive even in principle.
 */
function normalizeArchivePath(raw: string): string {
  const segments: string[] = []
  for (const segment of raw.replace(/\\/g, '/').split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return segments.join('/')
}

function directoryOf(archivePath: string): string {
  const slash = archivePath.lastIndexOf('/')
  return slash < 0 ? '' : archivePath.slice(0, slash)
}

function extensionOf(archivePath: string): string {
  const name = archivePath.slice(archivePath.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase()
}

/** Hrefs are URL-encoded; a malformed escape is kept verbatim rather than thrown. */
function decodeHref(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/**
 * Resolves an href against the directory of the document that carried it, which
 * is what the spec says and what keeps a nav document in a subfolder working.
 * Returns null for anything that does not name an archive entry: a blank href, a
 * bare fragment, or an absolute URL — the last of which is dropped rather than
 * followed, per the no-external-resolution rule (§6).
 */
function resolveHref(baseDir: string, href: string | null): string | null {
  const trimmed = (href ?? '').trim()
  if (trimmed === '') return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null
  const withoutFragment = trimmed.split('#')[0]
  if (withoutFragment === '') return null
  const decoded = decodeHref(withoutFragment)
  return normalizeArchivePath(baseDir === '' ? decoded : `${baseDir}/${decoded}`)
}

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

const ELEMENT_NODE = 1

/** Prefix dropped, lower-cased — `opf:manifest` and `manifest` are one name. */
function localNameOf(element: Element): string {
  const raw = element.localName || element.nodeName || ''
  const colon = raw.lastIndexOf(':')
  return (colon >= 0 ? raw.slice(colon + 1) : raw).toLowerCase()
}

function childElements(node: Node): Element[] {
  const out: Element[] = []
  const children = node.childNodes
  for (let i = 0; i < children.length; i++) {
    const child = children.item(i)
    if (child && child.nodeType === ELEMENT_NODE) out.push(child as Element)
  }
  return out
}

/** Descendants with the given local name, in document order (depth-first). */
function elementsByLocalName(root: Node, name: string): Element[] {
  const wanted = name.toLowerCase()
  const out: Element[] = []
  const visit = (node: Node): void => {
    for (const child of childElements(node)) {
      if (localNameOf(child) === wanted) out.push(child)
      visit(child)
    }
  }
  visit(root)
  return out
}

function firstByLocalName(root: Node, name: string): Element | null {
  return elementsByLocalName(root, name)[0] ?? null
}

/** Direct children only — a nested `navPoint`'s label must not win over its own. */
function childByLocalName(element: Element, name: string): Element | null {
  const wanted = name.toLowerCase()
  return childElements(element).find((child) => localNameOf(child) === wanted) ?? null
}

/**
 * An attribute by local name, prefix-insensitive: `epub:type` and `type` are the
 * same attribute here, and a namespace-declared prefix we never registered would
 * otherwise make `getAttribute` miss.
 */
function attributeOf(element: Element, name: string): string | null {
  const direct = element.getAttribute(name)
  if (direct !== null && direct !== '') return direct
  const wantedColon = name.lastIndexOf(':')
  const wanted = (wantedColon >= 0 ? name.slice(wantedColon + 1) : name).toLowerCase()
  const attributes = element.attributes
  for (let i = 0; i < attributes.length; i++) {
    const attribute = attributes.item(i)
    if (!attribute) continue
    const raw = attribute.name ?? ''
    const colon = raw.lastIndexOf(':')
    const local = (colon >= 0 ? raw.slice(colon + 1) : raw).toLowerCase()
    if (local === wanted) return attribute.value
  }
  return direct
}

/** An element's text, whitespace collapsed — TOC labels, and nothing longer. */
function textContentOf(node: Node): string {
  const parts: string[] = []
  const visit = (current: Node): void => {
    const children = current.childNodes
    for (let i = 0; i < children.length; i++) {
      const child = children.item(i)
      if (!child) continue
      if (child.nodeType === 3 || child.nodeType === 4) parts.push((child as Text).data ?? '')
      else if (child.nodeType === ELEMENT_NODE) visit(child)
    }
  }
  visit(node)
  return parts.join('').replace(/\s+/gu, ' ').trim()
}

/** Parses XML, converting anything unwalkable into a named `malformed` reason. */
function parseXml(source: string, what: string): Document {
  try {
    const document = new DOMParser({ errorHandler: QUIET_ERROR_HANDLER }).parseFromString(
      source,
      'text/xml'
    )
    if (!document) refuseMalformed(`${what} is not readable XML`)
    return document
  } catch (error) {
    if (error instanceof EpubRefusalSignal) throw error
    refuseMalformed(`${what} is not readable XML`)
  }
}

// ---------------------------------------------------------------------------
// The archive, with the decompression cap attached
// ---------------------------------------------------------------------------

/**
 * The slice of jszip's entry surface this module uses, spelled structurally so
 * the module does not depend on how that package chooses to export its types.
 */
interface ArchiveEntry {
  dir: boolean
  async(type: 'string'): Promise<string>
}

/**
 * Reads entries out of a loaded archive while keeping the running decompressed
 * total under the §6 cap.
 *
 * The cap is charged **as entries are read**, not tallied at the end, and an
 * entry whose declared uncompressed size would already blow the budget is
 * refused without being decompressed at all — a bomb should never be inflated
 * just to discover that it is one. The declared size comes from the archive's
 * own central directory, so it is a hint rather than proof; the real byte length
 * is charged afterwards regardless.
 */
class ArchiveReader {
  private extractedBytes = 0
  private lowercaseIndex: Map<string, string> | null = null

  constructor(private readonly zip: JSZip) {}

  /** The entry at an exact path, or the one differing only in case. */
  private entry(archivePath: string): ArchiveEntry | null {
    const direct = this.zip.file(archivePath)
    if (direct && !direct.dir) return direct
    if (this.lowercaseIndex === null) {
      this.lowercaseIndex = new Map()
      for (const name of Object.keys(this.zip.files)) {
        const key = name.toLowerCase()
        if (!this.lowercaseIndex.has(key)) this.lowercaseIndex.set(key, name)
      }
    }
    const matched = this.lowercaseIndex.get(archivePath.toLowerCase())
    if (matched === undefined) return null
    const entry = this.zip.file(matched)
    return entry && !entry.dir ? entry : null
  }

  has(archivePath: string): boolean {
    return this.entry(archivePath) !== null
  }

  /** The entry's text, or null when there is no such entry. */
  async read(archivePath: string): Promise<string | null> {
    const entry = this.entry(archivePath)
    if (!entry) return null

    const declared = declaredSizeOf(entry)
    if (declared !== null && this.extractedBytes + declared > EPUB_TEXT_BYTE_CAP) {
      refuse({
        kind: 'oversized',
        cap: 'text',
        limitBytes: EPUB_TEXT_BYTE_CAP,
        observedBytes: this.extractedBytes + declared
      })
    }

    const raw = await entry.async('string')
    this.extractedBytes += Buffer.byteLength(raw, 'utf-8')
    if (this.extractedBytes > EPUB_TEXT_BYTE_CAP) {
      refuse({
        kind: 'oversized',
        cap: 'text',
        limitBytes: EPUB_TEXT_BYTE_CAP,
        observedBytes: this.extractedBytes
      })
    }
    return raw
  }
}

/** The central directory's uncompressed size, when jszip kept one for us. */
function declaredSizeOf(entry: ArchiveEntry): number | null {
  const data = (entry as unknown as { _data?: { uncompressedSize?: number } })._data
  const size = data?.uncompressedSize
  return typeof size === 'number' && Number.isFinite(size) && size >= 0 ? size : null
}

// ---------------------------------------------------------------------------
// The package document
// ---------------------------------------------------------------------------

interface ManifestItem {
  id: string
  /** Resolved to an archive path against the OPF's own directory. */
  href: string | null
  mediaType: string
  /** The `properties` token list, lower-cased. */
  properties: string[]
}

interface PackageDocument {
  /** Directory of the OPF, the base for every manifest href. */
  baseDir: string
  manifest: Map<string, ManifestItem>
  /** Linear spine items only, in reading order, each resolved to a manifest item. */
  linearSpine: ManifestItem[]
  /** The EPUB 2 `<spine toc="...">` pointer, if the publisher set one. */
  spineTocId: string | null
  title: string | null
  author: string | null
  identifier: string | null
}

function readManifest(packageElement: Element, baseDir: string): Map<string, ManifestItem> {
  const manifestElement = firstByLocalName(packageElement, 'manifest')
  const items = new Map<string, ManifestItem>()
  if (!manifestElement) return items
  for (const element of elementsByLocalName(manifestElement, 'item')) {
    const id = (attributeOf(element, 'id') ?? '').trim()
    if (id === '' || items.has(id)) continue
    items.set(id, {
      id,
      href: resolveHref(baseDir, attributeOf(element, 'href')),
      mediaType: (attributeOf(element, 'media-type') ?? '').trim().toLowerCase(),
      properties: (attributeOf(element, 'properties') ?? '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
    })
  }
  return items
}

function resolveLinearSpineItem(
  element: Element,
  manifest: Map<string, ManifestItem>
): ManifestItem | null {
  const linear = (attributeOf(element, 'linear') ?? '').trim().toLowerCase()
  if (linear === 'no') return null

  const idref = (attributeOf(element, 'idref') ?? '').trim()
  if (idref === '') return null
  return manifest.get(idref) ?? null
}

/**
 * Reading order: spine `itemref`s in document order, `linear="no"` excluded —
 * the publisher marking content as outside the reading flow is the one sanctioned
 * exclusion (§3). An `idref` with no manifest entry names nothing readable and
 * drops out with it.
 */
function readLinearSpine(
  packageElement: Element,
  manifest: Map<string, ManifestItem>
): { items: ManifestItem[]; tocId: string | null } {
  const spineElement = firstByLocalName(packageElement, 'spine')
  if (!spineElement) return { items: [], tocId: null }

  const items = elementsByLocalName(spineElement, 'itemref')
    .map((element) => resolveLinearSpineItem(element, manifest))
    .filter((item): item is ManifestItem => item !== null)

  const tocId = (attributeOf(spineElement, 'toc') ?? '').trim()
  return { items, tocId: tocId === '' ? null : tocId }
}

/** First `dc:*` of a name, blank treated as absent (§7 — three fields, no more). */
function readMetadataField(packageElement: Element, name: string): string | null {
  const scope = firstByLocalName(packageElement, 'metadata') ?? packageElement
  for (const element of elementsByLocalName(scope, name)) {
    const value = textContentOf(element)
    if (value !== '') return value
  }
  return null
}

async function readPackageDocument(
  archive: ArchiveReader,
  opfPath: string
): Promise<PackageDocument> {
  const raw = await archive.read(opfPath)
  if (raw === null) refuseMalformed('the package document named by container.xml is missing')

  const document = parseXml(raw, 'the package document')
  const packageElement = firstByLocalName(document, 'package') ?? document.documentElement
  if (!packageElement) refuseMalformed('the package document has no package element')

  const baseDir = directoryOf(opfPath)
  const manifest = readManifest(packageElement, baseDir)
  const { items, tocId } = readLinearSpine(packageElement, manifest)

  return {
    baseDir,
    manifest,
    linearSpine: items,
    spineTocId: tocId,
    title: readMetadataField(packageElement, 'title'),
    author: readMetadataField(packageElement, 'creator'),
    identifier: readMetadataField(packageElement, 'identifier')
  }
}

// ---------------------------------------------------------------------------
// Table of contents
// ---------------------------------------------------------------------------

/** An href-bearing TOC entry before it is matched against the spine. */
interface RawTocEntry {
  label: string
  /** Archive path, fragment already stripped. */
  target: string
}

/**
 * The EPUB 3 nav document: the `<nav epub:type="toc">` list, or — when a
 * publisher omitted the type — the first nav that actually holds a list.
 *
 * Nesting needs no special handling: every anchor inside the nav, taken in
 * document order, *is* the depth-first flattening the ADR asks for (§3).
 */
function tocFromNavDocument(document: Document, baseDir: string): RawTocEntry[] {
  const navs = elementsByLocalName(document, 'nav')
  const toc =
    navs.find((nav) =>
      (attributeOf(nav, 'epub:type') ?? '')
        .toLowerCase()
        .split(/\s+/)
        .includes('toc')
    ) ??
    navs.find((nav) => elementsByLocalName(nav, 'ol').length > 0) ??
    null
  if (!toc) return []

  const entries: RawTocEntry[] = []
  for (const anchor of elementsByLocalName(toc, 'a')) {
    const target = resolveHref(baseDir, attributeOf(anchor, 'href'))
    if (target === null || target === '') continue
    entries.push({ label: textContentOf(anchor), target })
  }
  return entries
}

/**
 * The EPUB 2 NCX `navMap`. Document order over all `navPoint`s is again the
 * depth-first flattening; each point's own label and target are read from its
 * direct children so a nested point cannot borrow its parent's.
 */
function tocFromNcx(document: Document, baseDir: string): RawTocEntry[] {
  const navMap = firstByLocalName(document, 'navMap')
  if (!navMap) return []

  const entries: RawTocEntry[] = []
  for (const point of elementsByLocalName(navMap, 'navPoint')) {
    const content = childByLocalName(point, 'content')
    const target = resolveHref(baseDir, content ? attributeOf(content, 'src') : null)
    if (target === null || target === '') continue
    const labelElement = childByLocalName(point, 'navLabel')
    const textElement = labelElement ? firstByLocalName(labelElement, 'text') : null
    entries.push({ label: textElement ? textContentOf(textElement) : '', target })
  }
  return entries
}

/** The NCX item: the spine's own pointer first, else the one by media type. */
function findNcxItem(opf: PackageDocument): ManifestItem | null {
  if (opf.spineTocId !== null) {
    const byPointer = opf.manifest.get(opf.spineTocId)
    if (byPointer) return byPointer
  }
  for (const item of opf.manifest.values()) {
    if (item.mediaType === NCX_MEDIA_TYPE) return item
  }
  return null
}

/**
 * TOC resolution, EPUB 3 first (§3): the nav document when it yields usable
 * entries, else the EPUB 2 NCX, else nothing — at which point EP-1's own ladder
 * takes over and chapters the book per spine file instead.
 *
 * Entries are mapped to positions in the *linear* spine; one that names a file
 * outside it (a `linear="no"` page, a stray resource, an absolute URL) is
 * dropped rather than guessed at.
 */
async function resolveToc(archive: ArchiveReader, opf: PackageDocument): Promise<EpubTocEntry[]> {
  const spineIndexByPath = new Map<string, number>()
  opf.linearSpine.forEach((item, index) => {
    if (item.href !== null && !spineIndexByPath.has(item.href)) spineIndexByPath.set(item.href, index)
  })

  const readEntries = async (
    item: ManifestItem | null,
    what: string,
    parse: (document: Document, baseDir: string) => RawTocEntry[]
  ): Promise<RawTocEntry[]> => {
    if (!item || item.href === null) return []
    const raw = await archive.read(item.href)
    if (raw === null) return []
    try {
      // Hrefs inside a TOC are relative to the TOC document, which is the OPF's
      // own directory in the overwhelmingly common co-located case.
      return parse(parseXml(raw, what), directoryOf(item.href))
    } catch (error) {
      // A table of contents too broken to read is *unusable*, not fatal: the
      // book still has a spine, and EP-1's ladder chapters it per file. Import
      // never fails because chapters could not be resolved (§3).
      if (error instanceof EpubRefusalSignal && error.verdict.kind === 'malformed') return []
      throw error
    }
  }

  const navItem =
    [...opf.manifest.values()].find((item) => item.properties.includes('nav')) ?? null
  let raw = await readEntries(navItem, 'the navigation document', tocFromNavDocument)
  if (raw.length === 0) raw = await readEntries(findNcxItem(opf), 'the NCX document', tocFromNcx)

  const entries: EpubTocEntry[] = []
  for (const entry of raw) {
    const spineIndex = spineIndexByPath.get(entry.target)
    if (spineIndex === undefined) continue
    entries.push({ label: entry.label, spineIndex })
  }
  return entries
}

// ---------------------------------------------------------------------------
// Content extraction
// ---------------------------------------------------------------------------

function isXhtmlLike(item: ManifestItem): boolean {
  if (item.mediaType !== '') return XHTML_MEDIA_TYPES.has(item.mediaType)
  return item.href !== null && XHTML_EXTENSIONS.has(extensionOf(item.href))
}

/**
 * Every linear spine file's source, read up front.
 *
 * Reading the whole spine before projecting any of it is what keeps the zip-bomb
 * cap ahead of the expensive work: a bomb is refused on the read that trips the
 * budget, never after an XML parse has already been spent on the entries before
 * it. The cap bounds what is held here, which is exactly what it is for.
 */
async function readSpineSources(
  archive: ArchiveReader,
  opf: PackageDocument
): Promise<(string | null)[]> {
  const sources: (string | null)[] = []
  for (const item of opf.linearSpine) {
    if (item.href === null || !isXhtmlLike(item)) {
      sources.push(null)
      continue
    }
    // A spine item whose file is missing is damage in one chapter, not grounds
    // to refuse the book; it contributes no text and EP-1 drops the empty slot.
    sources.push(await archive.read(item.href))
  }
  return sources
}

/**
 * Source → the EP-1 spine shape: XHTML projected to text (EP-2a), then run
 * through the reduced cleanup profile (§5) — character hygiene only, so a
 * publisher's `--` survives verbatim.
 */
function extractSpine(sources: (string | null)[]): { spine: EpubSpineItem[]; imageCount: number } {
  const spine: EpubSpineItem[] = []
  let imageCount = 0
  for (const source of sources) {
    if (source === null) {
      spine.push({ text: '', firstHeading: null })
      continue
    }
    const extracted = extractXhtmlText(source)
    imageCount += extracted.imageCount
    spine.push({
      text: cleanupExtractedMarkupText(extracted.text).content,
      firstHeading: extracted.firstHeading
    })
  }
  return { spine, imageCount }
}

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------

/** Rung 1a: the container file itself, before a single byte is decompressed. */
function readContainerFile(filePath: string): Buffer {
  let stat: fs.Stats
  try {
    stat = fs.statSync(filePath)
  } catch {
    refuseMalformed('file could not be read')
  }
  if (!stat.isFile()) refuseMalformed('not a file')
  if (stat.size > EPUB_CONTAINER_BYTE_CAP) {
    refuse({
      kind: 'oversized',
      cap: 'container',
      limitBytes: EPUB_CONTAINER_BYTE_CAP,
      observedBytes: stat.size
    })
  }
  try {
    return fs.readFileSync(filePath)
  } catch {
    refuseMalformed('file could not be read')
  }
}

async function loadArchive(buffer: Buffer): Promise<JSZip> {
  try {
    return await JSZip.loadAsync(buffer)
  } catch {
    refuseMalformed('not a readable EPUB archive')
  }
}

/**
 * Rung 2: DRM, before any parse effort (§1).
 *
 * `encryption.xml` covering only font files is the Adobe/IDPF obfuscation scheme
 * and says nothing about protection, so it is ignored. Anything else — a content
 * document, or an encryption declaration we cannot read well enough to tell —
 * is refused by name, because "this book is protected" is the honest thing to
 * say and guessing the other way would import a chapter of ciphertext.
 */
async function assertNotProtected(archive: ArchiveReader): Promise<void> {
  if (!archive.has(ENCRYPTION_PATH)) return
  const raw = await archive.read(ENCRYPTION_PATH)
  if (raw === null) return

  let references: Element[]
  try {
    references = elementsByLocalName(parseXml(raw, 'the encryption declaration'), 'CipherReference')
  } catch {
    refuse({ kind: 'drm-protected' })
  }

  const targets = references
    .map((reference) => resolveHref('', attributeOf(reference, 'URI')))
    .filter((target): target is string => target !== null && target !== '')

  if (targets.length === 0) refuse({ kind: 'drm-protected' })
  if (targets.some((target) => !FONT_EXTENSIONS.has(extensionOf(target)))) {
    refuse({ kind: 'drm-protected' })
  }
}

/** Rung 3: `container.xml` → the first rootfile's path. */
async function findPackagePath(archive: ArchiveReader): Promise<string> {
  const raw = await archive.read(CONTAINER_PATH)
  if (raw === null) refuseMalformed('META-INF/container.xml is missing')

  const document = parseXml(raw, 'META-INF/container.xml')
  for (const rootfile of elementsByLocalName(document, 'rootfile')) {
    const fullPath = (attributeOf(rootfile, 'full-path') ?? '').trim()
    if (fullPath === '') continue
    const resolved = normalizeArchivePath(decodeHref(fullPath))
    if (resolved !== '') return resolved
  }
  refuseMalformed('META-INF/container.xml names no package document')
}

/** The `dc:title`, else the filename sans extension (§4). */
function resolveTitle(opf: PackageDocument, filePath: string): string {
  if (opf.title !== null) return opf.title
  const base = path.basename(filePath, path.extname(filePath)).trim()
  return base === '' ? 'Untitled' : base
}

async function runLadder(filePath: string): Promise<ParsedEpubFile> {
  const archive = new ArchiveReader(await loadArchive(readContainerFile(filePath)))

  await assertNotProtected(archive)
  const opf = await readPackageDocument(archive, await findPackagePath(archive))
  if (opf.linearSpine.length === 0) refuseMalformed('the spine declares no readable content')

  const toc = await resolveToc(archive, opf)
  const { spine, imageCount } = extractSpine(await readSpineSources(archive, opf))

  const input: EpubParseInput = {
    title: resolveTitle(opf, filePath),
    author: opf.author,
    identifier: opf.identifier,
    spine,
    toc
  }

  const book = deriveEpubBook(input)
  // Structure resolved, but nothing to read: importing an empty book would put a
  // text in the library that can never be played. Chapters degrade gracefully;
  // words are the one thing the ladder cannot manufacture.
  if (book.word_count === 0) refuseMalformed('the book contains no readable text')

  return { kind: 'valid', book, imageCount }
}

/**
 * Parse-only: turns a `.epub` path into a verdict and writes nothing.
 *
 * Total by construction — every input, including a non-string path, a hostile
 * archive, or an unexpected library failure, resolves to a typed verdict, so the
 * IPC boundary EP-3 puts in front of this can never reject.
 */
export async function parseEpubFile(filePath: unknown): Promise<ParsedEpubFile> {
  const resolvedPath = typeof filePath === 'string' ? filePath : ''
  if (resolvedPath === '') return { kind: 'malformed', reason: 'no file path' }
  try {
    return await runLadder(resolvedPath)
  } catch (error) {
    if (error instanceof EpubRefusalSignal) return error.verdict
    return {
      kind: 'malformed',
      reason: `unexpected failure: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

// ---------------------------------------------------------------------------
// EP-3 — the EPUB adapter behind the shared book-intake door (ADR-0034 §2, §7)
// ---------------------------------------------------------------------------
//
// The parse-then-commit pair itself is `./bookIntake` and is shared with every
// other format (`architecture-depth/05`); ADR-0034 §2's clone of the `.wbook`
// skeleton folded once there was a second format to fold it with. What is EPUB's
// below is only what differs: the ladder above, the three named refusals, the
// confirm card, and the row fields a publisher e-book lands with. Commit answers
// `committed` with the new `textId` — the shape §2 granted here first, now the
// shared success envelope (ADR-0033 amendment) — and the pair stays stateless:
// nothing is stashed between the two calls but the path, so a file edited or
// replaced after the confirm card was drawn is re-judged from disk, not trusted.

function refusalEnvelope(verdict: EpubRefusal, filePath: string): EpubImportRefusal {
  switch (verdict.kind) {
    case 'drm-protected':
      return { status: 'drm-protected', filePath }
    case 'oversized':
      return {
        status: 'oversized',
        filePath,
        cap: verdict.cap,
        limitBytes: verdict.limitBytes,
        observedBytes: verdict.observedBytes
      }
    case 'malformed':
      return { status: 'malformed', filePath, reason: verdict.reason }
  }
}

function confirmationFor(book: DerivedEpubBook, imageCount: number): EpubConfirmation {
  return {
    title: book.title,
    author: book.author,
    chapterCount: book.segment_count,
    wordCount: book.word_count,
    imagesOmitted: imageCount
  }
}

/**
 * The import evidence this channel records (§7). The identifier is kept as a
 * fact about the file, **not** as a key: re-importing the same EPUB creates a
 * second text, deliberately, until the library-API design says what identity
 * should mean.
 */
function epubDiagnostics(book: DerivedEpubBook, imageCount: number): ImportDiagnostics {
  return {
    ...buildImportDiagnostics({
      parser: 'epub',
      sourceExtension: 'epub',
      content: book.content
    }),
    ...(book.identifier !== null && { epubIdentifier: book.identifier }),
    imagesOmitted: imageCount
  }
}

/**
 * What a publisher e-book adds to the text row.
 *
 * No `seed_id` (an EPUB is not a curated Winglet Book — §2) and no category
 * (it lands in Uncategorized — §8). `word_count` is left to `saveText` and
 * `segment_count` to the segment rows, both of which count with the same
 * tokenization the derivation used, so the numbers cannot disagree.
 */
function storeFields(book: DerivedEpubBook, imageCount: number): IntakeTextFields {
  return {
    author: book.author ?? undefined,
    // Paragraph structure comes from markup, not from wrap heuristics, so the
    // plain-text view and the RSVP engine read the same string (§5).
    content_display: book.content,
    source_type: 'epub',
    import_diagnostics: epubDiagnostics(book, imageCount)
  }
}

/**
 * The `.epub` adapter. Its differences from `.wbook` are supplied as data —
 * three named refusals instead of five, a confirm card carrying author/words/
 * images, no identity check at all (dedupe is deliberately absent, §7) — so the
 * intake it plugs into never asks which format is running.
 */
const epubAdapter: BookIntakeAdapter<EpubConfirmation, EpubImportRefusal> = {
  format: 'epub',

  // `malformed` is the ladder's catch-all rung, reused for what the intake meets
  // and the ladder never sees: an unusable path, or a store failure.
  refuse: (filePath, reason) => ({ status: 'malformed', filePath, reason }),

  derive: async (
    _db,
    filePath
  ): Promise<IntakeOutcome<EpubConfirmation, EpubImportRefusal>> => {
    const parsed = await parseEpubFile(filePath)
    if (parsed.kind !== 'valid') {
      return { accepted: false, refusal: refusalEnvelope(parsed, filePath) }
    }
    const { book, imageCount } = parsed
    return {
      accepted: true,
      confirmation: confirmationFor(book, imageCount),
      prepare: () => ({ book, fields: storeFields(book, imageCount) })
    }
  }
}

const epubIntake = createBookIntake(epubAdapter)

/** Parse half: reports what the confirm card should say. Writes nothing. */
export function parseEpubImport(db: Database, filePath: unknown): Promise<EpubParseResult> {
  return epubIntake.parse(db, filePath)
}

/**
 * Commit half: re-runs the whole ladder from disk and, only on a still-valid
 * book, lands it complete — text with its chapters in order and contiguous
 * offsets. Any other outcome leaves the store exactly as it was.
 */
export function commitEpubImport(db: Database, filePath: unknown): Promise<EpubCommitResult> {
  return epubIntake.commit(db, filePath)
}
