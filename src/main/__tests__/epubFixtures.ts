/**
 * EPUB fixtures as code (ADR-0034 §9) — **zero binary files in the repo.**
 *
 * A real `.epub` is a zip of XML manifests, which as a checked-in binary would
 * be an unreviewable diff sitting in a public repository. So every fixture is
 * built here at test time: {@link makeEpub} takes a declarative spec, assembles
 * the archive with the same `jszip` the parser reads it with, and writes it to
 * the caller's temp directory so `parseEpubFile` can meet it as an ordinary file
 * on disk.
 *
 * Two levels are offered on purpose. {@link makeEpub} is the primitive — raw XML
 * strings for the container, package document, navigation, and content files —
 * so a test can hand the parser something deliberately broken. {@link bookEpub}
 * composes that primitive from a chapter list for the ordinary cases, keeping the
 * matrix readable as a list of books rather than a wall of markup.
 *
 * Not a test file itself (vitest collects `*.test.ts` only); EP-3 reuses it.
 */
import JSZip from 'jszip'
import { writeFileSync } from 'fs'
import { join } from 'path'

/** Where {@link bookEpub} puts the package document; hrefs are relative to it. */
export const DEFAULT_OPF_PATH = 'OEBPS/content.opf'

const DEFAULT_CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="${DEFAULT_OPF_PATH}" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`

/** The literal archive contents, before any convenience is applied. */
export interface EpubSpec {
  /** `META-INF/container.xml`; `null` omits it, `undefined` uses the default. */
  container?: string | null
  /** `META-INF/encryption.xml`; omitted unless given. */
  encryption?: string
  /** The package document, written at {@link opfPath}. */
  opf?: string
  /** Where the package document goes, when it is not the default. */
  opfPath?: string
  /** Every other entry, keyed by archive path. */
  files?: Record<string, string>
  /** The uncompressed OCF marker; `null` omits it. */
  mimetype?: string | null
}

function addOptionalTextFile(
  zip: JSZip,
  path: string,
  contents: string | null | undefined,
  options?: { compression: 'STORE' }
): void {
  if (contents !== null && contents !== undefined) zip.file(path, contents, options)
}

function addTextFiles(zip: JSZip, files: Record<string, string> | undefined): void {
  if (!files) return
  for (const [path, contents] of Object.entries(files)) zip.file(path, contents)
}

/** Builds the archive bytes without touching the filesystem. */
export async function buildEpubArchive(spec: EpubSpec): Promise<Buffer> {
  const zip = new JSZip()

  const mimetype = spec.mimetype === null ? null : spec.mimetype ?? 'application/epub+zip'
  addOptionalTextFile(zip, 'mimetype', mimetype, { compression: 'STORE' })
  const container = spec.container === undefined ? DEFAULT_CONTAINER : spec.container
  addOptionalTextFile(zip, 'META-INF/container.xml', container)
  addOptionalTextFile(zip, 'META-INF/encryption.xml', spec.encryption)
  addOptionalTextFile(zip, spec.opfPath ?? DEFAULT_OPF_PATH, spec.opf)
  addTextFiles(zip, spec.files)

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

/** Writes the archive into `directory` and returns the path the parser is given. */
export async function makeEpub(
  directory: string,
  fileName: string,
  spec: EpubSpec
): Promise<string> {
  const filePath = join(directory, fileName)
  writeFileSync(filePath, await buildEpubArchive(spec))
  return filePath
}

// ---------------------------------------------------------------------------
// XML builders
// ---------------------------------------------------------------------------

/** An XHTML content document wrapping the given body markup. */
export function xhtmlDoc(body: string, title = 'Chapter'): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>${title}</title></head>
  <body>
${body}
  </body>
</html>`
}

export interface ManifestEntry {
  id: string
  href: string
  mediaType?: string
  properties?: string
}

export interface SpineEntry {
  idref: string
  linear?: 'yes' | 'no'
}

export interface OpfSpec {
  title?: string | null
  creator?: string | null
  identifier?: string | null
  manifest: ManifestEntry[]
  spine: SpineEntry[]
  /** The EPUB 2 `<spine toc="...">` pointer. */
  spineToc?: string
}

export function opfXml(spec: OpfSpec): string {
  const metadata = [
    spec.title === null ? '' : `<dc:title>${spec.title ?? 'Untitled Fixture'}</dc:title>`,
    spec.creator === null || spec.creator === undefined
      ? ''
      : `<dc:creator>${spec.creator}</dc:creator>`,
    spec.identifier === null || spec.identifier === undefined
      ? ''
      : `<dc:identifier id="pub-id">${spec.identifier}</dc:identifier>`
  ]
    .filter(Boolean)
    .map((line) => `    ${line}`)
    .join('\n')

  const manifest = spec.manifest
    .map((item) => {
      const properties = item.properties ? ` properties="${item.properties}"` : ''
      const mediaType = item.mediaType ?? 'application/xhtml+xml'
      return `    <item id="${item.id}" href="${item.href}" media-type="${mediaType}"${properties}/>`
    })
    .join('\n')

  const spine = spec.spine
    .map((ref) => {
      const linear = ref.linear ? ` linear="${ref.linear}"` : ''
      return `    <itemref idref="${ref.idref}"${linear}/>`
    })
    .join('\n')

  const spineToc = spec.spineToc ? ` toc="${spec.spineToc}"` : ''

  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
${metadata}
  </metadata>
  <manifest>
${manifest}
  </manifest>
  <spine${spineToc}>
${spine}
  </spine>
</package>`
}

/** One table-of-contents entry; `children` nest exactly as a publisher's would. */
export interface TocEntry {
  label: string
  href?: string
  children?: TocEntry[]
}

/** The EPUB 3 navigation document. */
export function navXml(entries: TocEntry[]): string {
  const renderList = (list: TocEntry[], depth: number): string => {
    const pad = '  '.repeat(depth)
    const items = list
      .map((entry) => {
        const anchor =
          entry.href === undefined
            ? `<span>${entry.label}</span>`
            : `<a href="${entry.href}">${entry.label}</a>`
        const nested = entry.children?.length ? `\n${renderList(entry.children, depth + 2)}\n${pad}  ` : ''
        return `${pad}  <li>${anchor}${nested}</li>`
      })
      .join('\n')
    return `${pad}<ol>\n${items}\n${pad}</ol>`
  }

  return xhtmlDoc(
    `    <nav epub:type="toc" id="toc">
${renderList(entries, 3)}
    </nav>`,
    'Contents'
  )
}

/** The EPUB 2 NCX. */
export function ncxXml(entries: TocEntry[]): string {
  let order = 0
  const renderPoints = (list: TocEntry[], depth: number): string => {
    const pad = '  '.repeat(depth)
    return list
      .map((entry) => {
        order += 1
        const src = entry.href === undefined ? '' : ` src="${entry.href}"`
        const nested = entry.children?.length ? `\n${renderPoints(entry.children, depth + 1)}` : ''
        return `${pad}<navPoint id="np-${order}" playOrder="${order}">
${pad}  <navLabel><text>${entry.label}</text></navLabel>
${pad}  <content${src}/>${nested}
${pad}</navPoint>`
      })
      .join('\n')
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head/>
  <docTitle><text>Contents</text></docTitle>
  <navMap>
${renderPoints(entries, 2)}
  </navMap>
</ncx>`
}

// ---------------------------------------------------------------------------
// The composed, ordinary case
// ---------------------------------------------------------------------------

export interface ChapterSpec {
  /** Manifest id; defaults to `c1`, `c2`, … by position. */
  id?: string
  /** Href relative to the package document; defaults to `<id>.xhtml`. */
  href?: string
  /** Body markup, wrapped in a content document. */
  body: string
  /** `false` writes `linear="no"` — content outside the reading flow (§3). */
  linear?: boolean
}

export interface BookSpec {
  title?: string | null
  creator?: string | null
  identifier?: string | null
  chapters: ChapterSpec[]
  /** EPUB 3 navigation document entries. */
  nav?: TocEntry[]
  /** EPUB 2 NCX entries. */
  ncx?: TocEntry[]
  /** Set `<spine toc="ncx">` — the EPUB 2 pointer at the NCX item. */
  spineToc?: boolean
  /** Where the navigation document goes, relative to the package document. */
  navHref?: string
}

/**
 * A whole book from a chapter list: manifest, spine, content documents, and
 * whichever table-of-contents flavours the case needs. Passing both `nav` and
 * `ncx` is how the "nav wins" precedence case is set up.
 */
export function bookEpub(spec: BookSpec): EpubSpec {
  const chapters = spec.chapters.map((chapter, index) => {
    const id = chapter.id ?? `c${index + 1}`
    return { ...chapter, id, href: chapter.href ?? `${id}.xhtml` }
  })

  const manifest: ManifestEntry[] = chapters.map((chapter) => ({
    id: chapter.id,
    href: chapter.href
  }))
  const files: Record<string, string> = {}
  for (const chapter of chapters) files[`OEBPS/${chapter.href}`] = xhtmlDoc(chapter.body)

  if (spec.nav) {
    const navHref = spec.navHref ?? 'nav.xhtml'
    manifest.push({ id: 'nav', href: navHref, properties: 'nav' })
    files[`OEBPS/${navHref}`] = navXml(spec.nav)
  }
  if (spec.ncx) {
    manifest.push({ id: 'ncx', href: 'toc.ncx', mediaType: 'application/x-dtbncx+xml' })
    files['OEBPS/toc.ncx'] = ncxXml(spec.ncx)
  }

  return {
    opf: opfXml({
      title: spec.title,
      creator: spec.creator,
      identifier: spec.identifier,
      manifest,
      spine: chapters.map((chapter) => ({
        idref: chapter.id,
        linear: chapter.linear === false ? 'no' : undefined
      })),
      spineToc: spec.spineToc ? 'ncx' : undefined
    }),
    files
  }
}
