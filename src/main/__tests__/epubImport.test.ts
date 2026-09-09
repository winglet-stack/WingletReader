/**
 * EP-2b — the ADR-0034 container ladder, driven against real `.epub` archives
 * built at test time (§9, fixtures-as-code; see `epubFixtures.ts`).
 *
 * The cases are the ladder in order — caps, DRM, container, package document,
 * table of contents, extraction — plus the two invariants the whole feature
 * rests on: the publisher's structure survives (TOC flavours, nesting, front
 * matter, `linear="no"`), and the text does (segments join to `content`, offsets
 * stay contiguous, punctuation is never rewritten).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { parseEpubFile, type ParsedEpubFile } from '../epubImport'
import { EPUB_FRONT_MATTER_TITLE, EPUB_TEXT_BYTE_CAP } from '../../shared/epubBook'
import {
  bookEpub,
  makeEpub,
  navXml,
  ncxXml,
  opfXml,
  xhtmlDoc,
  type EpubSpec
} from './epubFixtures'

let tmpDir: string
let fixtureCount = 0

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'wingletreader-epub-'))
})

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

/** Builds a fixture under a unique name and runs the whole ladder over it. */
async function parseSpec(spec: EpubSpec, fileName?: string): Promise<ParsedEpubFile> {
  fixtureCount += 1
  const name = fileName ?? `fixture-${fixtureCount}.epub`
  return parseEpubFile(await makeEpub(tmpDir, name, spec))
}

/** Narrows to acceptance, failing the case with the actual verdict if it is not. */
function expectValid(
  result: ParsedEpubFile
): Extract<ParsedEpubFile, { kind: 'valid' }> {
  if (result.kind !== 'valid') {
    throw new Error(`expected a valid book, got ${result.kind}: ${JSON.stringify(result)}`)
  }
  return result
}

const CHAPTERS = [
  { body: '<h1>The Wreck</h1><p>The lamp had not been lit.</p>' },
  { body: '<h1>The Flare</h1><p>A green flare cut the fog.</p>' },
  { body: '<h1>The Keeper</h1><p>He counted the seconds between waves.</p>' }
]

const NAV_ENTRIES = [
  { label: 'The Wreck', href: 'c1.xhtml' },
  { label: 'The Flare', href: 'c2.xhtml' },
  { label: 'The Keeper', href: 'c3.xhtml' }
]

describe('parseEpubFile — table of contents', () => {
  it('chapters an EPUB 3 book from its navigation document', async () => {
    const result = expectValid(await parseSpec(bookEpub({ chapters: CHAPTERS, nav: NAV_ENTRIES })))

    expect(result.book.segments.map((segment) => segment.title)).toEqual([
      'The Wreck',
      'The Flare',
      'The Keeper'
    ])
    expect(result.book.segment_count).toBe(3)
    expect(result.book.segments[1].content).toBe('The Flare\n\nA green flare cut the fog.')
  })

  it('chapters an EPUB 2 book from the NCX the spine points at', async () => {
    const result = expectValid(
      await parseSpec(
        bookEpub({
          chapters: CHAPTERS,
          ncx: [
            { label: 'First', href: 'c1.xhtml' },
            { label: 'Second', href: 'c2.xhtml#start' },
            { label: 'Third', href: 'c3.xhtml' }
          ],
          spineToc: true
        })
      )
    )

    expect(result.book.segments.map((segment) => segment.title)).toEqual([
      'First',
      'Second',
      'Third'
    ])
  })

  it('finds the NCX by media type when the spine carries no toc pointer', async () => {
    const result = expectValid(
      await parseSpec(
        bookEpub({
          chapters: CHAPTERS,
          ncx: [
            { label: 'First', href: 'c1.xhtml' },
            { label: 'Second', href: 'c2.xhtml' }
          ]
        })
      )
    )

    expect(result.book.segments.map((segment) => segment.title)).toEqual(['First', 'Second'])
  })

  it('prefers the navigation document when both flavours are present', async () => {
    const result = expectValid(
      await parseSpec(
        bookEpub({
          chapters: CHAPTERS,
          nav: [
            { label: 'Nav One', href: 'c1.xhtml' },
            { label: 'Nav Two', href: 'c2.xhtml' }
          ],
          ncx: [
            { label: 'Ncx One', href: 'c1.xhtml' },
            { label: 'Ncx Two', href: 'c2.xhtml' },
            { label: 'Ncx Three', href: 'c3.xhtml' }
          ],
          spineToc: true
        })
      )
    )

    expect(result.book.segments.map((segment) => segment.title)).toEqual(['Nav One', 'Nav Two'])
  })

  it('falls back to the NCX when the navigation document yields no entries', async () => {
    const spec = bookEpub({
      chapters: CHAPTERS,
      nav: [{ label: 'Unlinked' }],
      ncx: [
        { label: 'Ncx One', href: 'c1.xhtml' },
        { label: 'Ncx Two', href: 'c2.xhtml' }
      ]
    })
    const result = expectValid(await parseSpec(spec))

    expect(result.book.segments.map((segment) => segment.title)).toEqual(['Ncx One', 'Ncx Two'])
  })

  it('flattens a nested table of contents depth-first, in document order', async () => {
    const result = expectValid(
      await parseSpec(
        bookEpub({
          chapters: CHAPTERS,
          nav: [
            {
              label: 'Part I',
              href: 'c1.xhtml',
              children: [
                { label: 'Chapter One', href: 'c2.xhtml' },
                { label: 'Chapter Two', href: 'c3.xhtml' }
              ]
            }
          ]
        })
      )
    )

    expect(result.book.segments.map((segment) => segment.title)).toEqual([
      'Part I',
      'Chapter One',
      'Chapter Two'
    ])
  })

  it('flattens nested NCX navPoints without a child borrowing its parent label', async () => {
    const result = expectValid(
      await parseSpec(
        bookEpub({
          chapters: CHAPTERS,
          ncx: [
            {
              label: 'Book One',
              href: 'c1.xhtml',
              children: [
                { label: 'Inner A', href: 'c2.xhtml' },
                { label: 'Inner B', href: 'c3.xhtml' }
              ]
            }
          ],
          spineToc: true
        })
      )
    )

    expect(result.book.segments.map((segment) => segment.title)).toEqual([
      'Book One',
      'Inner A',
      'Inner B'
    ])
  })

  it('keeps spine text ahead of the first entry as Front Matter', async () => {
    const result = expectValid(
      await parseSpec(
        bookEpub({
          chapters: CHAPTERS,
          nav: [
            { label: 'The Flare', href: 'c2.xhtml' },
            { label: 'The Keeper', href: 'c3.xhtml' }
          ]
        })
      )
    )

    expect(result.book.segments.map((segment) => segment.title)).toEqual([
      EPUB_FRONT_MATTER_TITLE,
      'The Flare',
      'The Keeper'
    ])
    expect(result.book.segments[0].content).toContain('The lamp had not been lit.')
  })

  it('resolves navigation hrefs relative to the navigation document itself', async () => {
    const result = expectValid(
      await parseSpec(
        bookEpub({
          chapters: CHAPTERS.slice(0, 2),
          navHref: 'nav/toc.xhtml',
          nav: [
            { label: 'Away One', href: '../c1.xhtml' },
            { label: 'Away Two', href: '../c2.xhtml' }
          ]
        })
      )
    )

    expect(result.book.segments.map((segment) => segment.title)).toEqual(['Away One', 'Away Two'])
  })

  it('resolves percent-encoded hrefs', async () => {
    const result = expectValid(
      await parseSpec(
        bookEpub({
          chapters: [
            { id: 'c1', href: 'chapter one.xhtml', body: '<p>Spaced filename.</p>' },
            { id: 'c2', href: 'c2.xhtml', body: '<p>Ordinary filename.</p>' }
          ],
          nav: [
            { label: 'Spaced', href: 'chapter%20one.xhtml' },
            { label: 'Ordinary', href: 'c2.xhtml' }
          ]
        })
      )
    )

    expect(result.book.segments.map((segment) => segment.title)).toEqual(['Spaced', 'Ordinary'])
  })

  it('drops entries that name nothing in the linear spine, including absolute URLs', async () => {
    const result = expectValid(
      await parseSpec(
        bookEpub({
          chapters: CHAPTERS.slice(0, 2),
          nav: [
            { label: 'Publisher site', href: 'https://example.invalid/buy' },
            { label: 'Missing page', href: 'nowhere.xhtml' },
            { label: 'The Flare', href: 'c2.xhtml' }
          ]
        })
      )
    )

    // Only the resolvable entry survives, so everything before it is Front Matter.
    expect(result.book.segments.map((segment) => segment.title)).toEqual([
      EPUB_FRONT_MATTER_TITLE,
      'The Flare'
    ])
  })
})

describe('parseEpubFile — reading order', () => {
  it('excludes linear="no" spine items and any entry pointing at one', async () => {
    const result = expectValid(
      await parseSpec(
        bookEpub({
          chapters: [
            { body: '<h1>The Wreck</h1><p>The lamp had not been lit.</p>' },
            { body: '<p>Copyright notice nobody reads.</p>', linear: false },
            { body: '<h1>The Keeper</h1><p>He counted the seconds between waves.</p>' }
          ],
          nav: [
            { label: 'The Wreck', href: 'c1.xhtml' },
            { label: 'Colophon', href: 'c2.xhtml' },
            { label: 'The Keeper', href: 'c3.xhtml' }
          ]
        })
      )
    )

    expect(result.book.segments.map((segment) => segment.title)).toEqual([
      'The Wreck',
      'The Keeper'
    ])
    expect(result.book.content).not.toContain('Copyright notice')
  })

  it('chapters per spine file when there is no usable table of contents', async () => {
    const result = expectValid(
      await parseSpec(
        bookEpub({
          chapters: [
            { body: '<h1>The Wreck</h1><p>The lamp had not been lit.</p>' },
            { body: '<p>An untitled interlude.</p>' },
            { body: '<h2>The Keeper</h2><p>He counted the seconds.</p>' }
          ]
        })
      )
    )

    expect(result.book.segments.map((segment) => segment.title)).toEqual([
      'The Wreck',
      'Section 2',
      'The Keeper'
    ])
  })

  it('leaves a single-file book unsegmented', async () => {
    const result = expectValid(
      await parseSpec(
        bookEpub({
          chapters: [{ body: '<h1>All Of It</h1><p>One file, one story.</p>' }]
        })
      )
    )

    expect(result.book.segments).toEqual([])
    expect(result.book.segment_count).toBe(0)
    expect(result.book.content).toBe('All Of It\n\nOne file, one story.')
  })
})

describe('parseEpubFile — metadata', () => {
  it('carries the first title, creator, and identifier', async () => {
    const result = expectValid(
      await parseSpec(
        bookEpub({
          title: 'The Lighthouse Keeper',
          creator: 'A. Keeper',
          identifier: 'urn:uuid:8f1c',
          chapters: CHAPTERS,
          nav: NAV_ENTRIES
        })
      )
    )

    expect(result.book.title).toBe('The Lighthouse Keeper')
    expect(result.book.author).toBe('A. Keeper')
    expect(result.book.identifier).toBe('urn:uuid:8f1c')
  })

  it('falls back to the filename sans extension when there is no dc:title', async () => {
    const result = expectValid(
      await parseSpec(
        bookEpub({ title: null, chapters: CHAPTERS, nav: NAV_ENTRIES }),
        'A Book Without A Title.epub'
      )
    )

    expect(result.book.title).toBe('A Book Without A Title')
    expect(result.book.author).toBeNull()
    expect(result.book.identifier).toBeNull()
  })
})

describe('parseEpubFile — extraction', () => {
  it('counts omitted images across every spine file without placeholders', async () => {
    const result = expectValid(
      await parseSpec(
        bookEpub({
          chapters: [
            { body: '<h1>Plates</h1><p><img src="a.png" alt="A"/>First.</p>' },
            { body: '<p><img src="b.png"/><img src="c.png"/>Second.</p>' }
          ],
          nav: [
            { label: 'Plates', href: 'c1.xhtml' },
            { label: 'More', href: 'c2.xhtml' }
          ]
        })
      )
    )

    expect(result.imageCount).toBe(3)
    expect(result.book.content).not.toContain('Illustration')
    expect(result.book.content).not.toContain('a.png')
  })

  it('applies the reduced cleanup profile — publisher punctuation stays verbatim', async () => {
    const result = expectValid(
      await parseSpec(
        bookEpub({
          chapters: [
            {
              body:
                '<p>He paused -- then went on ---- and stopped.</p>' +
                '<p>Soft\u00ADhyphen\u00A0and\u2009spacing.</p>'
            },
            { body: '<p>A second file so the book chapters.</p>' }
          ]
        })
      )
    )

    // Not run for EPUB (ADR-0034 §5): the dash normalizer would rewrite these.
    expect(result.book.content).toContain('paused -- then went on ---- and stopped')
    // Character hygiene that *is* run: soft hyphens go, exotic spaces normalize.
    expect(result.book.content).toContain('Softhyphen and spacing.')
    expect(result.book.content).not.toContain('\u00AD')
    expect(result.book.content).not.toContain('\u00A0')
  })

  it('ignores non-XHTML spine items rather than reading them as markup', async () => {
    const spec: EpubSpec = {
      opf: opfXml({
        title: 'Mixed Media',
        manifest: [
          { id: 'c1', href: 'c1.xhtml' },
          { id: 'pic', href: 'plate.svg', mediaType: 'image/svg+xml' },
          { id: 'c2', href: 'c2.xhtml' }
        ],
        spine: [{ idref: 'c1' }, { idref: 'pic' }, { idref: 'c2' }]
      }),
      files: {
        'OEBPS/c1.xhtml': xhtmlDoc('<p>Before the plate.</p>'),
        'OEBPS/plate.svg': '<svg xmlns="http://www.w3.org/2000/svg"><text>caption</text></svg>',
        'OEBPS/c2.xhtml': xhtmlDoc('<p>After the plate.</p>')
      }
    }
    const result = expectValid(await parseSpec(spec))

    expect(result.book.content).toBe('Before the plate.\n\nAfter the plate.')
  })

  it('survives a spine item whose file is missing from the archive', async () => {
    const spec: EpubSpec = {
      opf: opfXml({
        title: 'Damaged',
        manifest: [
          { id: 'c1', href: 'c1.xhtml' },
          { id: 'gone', href: 'gone.xhtml' },
          { id: 'c2', href: 'c2.xhtml' }
        ],
        spine: [{ idref: 'c1' }, { idref: 'gone' }, { idref: 'c2' }]
      }),
      files: {
        'OEBPS/c1.xhtml': xhtmlDoc('<h1>Here</h1><p>Present.</p>'),
        'OEBPS/c2.xhtml': xhtmlDoc('<h1>Also Here</h1><p>Also present.</p>')
      }
    }
    const result = expectValid(await parseSpec(spec))

    expect(result.book.segments.map((segment) => segment.title)).toEqual(['Here', 'Also Here'])
  })
})

describe('parseEpubFile — the preservation invariant', () => {
  it('joins segments back to content with contiguous word offsets', async () => {
    const result = expectValid(
      await parseSpec(
        bookEpub({
          title: 'The Lighthouse Keeper',
          creator: 'A. Keeper',
          chapters: [
            { body: '<p>Opening pages nobody indexed.</p>' },
            { body: '<h1>The Wreck</h1><p>The lamp had not been lit.</p>' },
            { body: '<h1>The Flare</h1><p>A green flare cut the fog at last.</p>' }
          ],
          nav: [
            { label: 'The Wreck', href: 'c2.xhtml' },
            { label: 'The Flare', href: 'c3.xhtml' }
          ]
        })
      )
    )

    const { book } = result
    expect(book.segments.map((segment) => segment.content).join('\n\n')).toBe(book.content)
    expect(book.segments.map((segment) => segment.order)).toEqual([0, 1, 2])

    let expectedStart = 0
    for (const segment of book.segments) {
      expect(segment.startWordOffset).toBe(expectedStart)
      expect(segment.endWordOffset).toBe(expectedStart + segment.word_count)
      expect(segment.word_count).toBe(segment.content.trim().split(/\s+/).filter(Boolean).length)
      expectedStart = segment.endWordOffset
    }
    expect(expectedStart).toBe(book.word_count)
    expect(book.segment_count).toBe(book.segments.length)
  })
})

describe('parseEpubFile — DRM', () => {
  const encryptionXml = (uris: string[]): string => `<?xml version="1.0" encoding="UTF-8"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"
            xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
${uris
  .map(
    (uri) => `  <enc:EncryptedData>
    <enc:EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/>
    <enc:CipherData><enc:CipherReference URI="${uri}"/></enc:CipherData>
  </enc:EncryptedData>`
  )
  .join('\n')}
</encryption>`

  it('refuses a book whose encryption covers a content document', async () => {
    const spec = bookEpub({ chapters: CHAPTERS, nav: NAV_ENTRIES })
    const result = await parseSpec({ ...spec, encryption: encryptionXml(['OEBPS/c1.xhtml']) })

    expect(result).toEqual({ kind: 'drm-protected' })
  })

  it('accepts a book whose encryption covers only obfuscated fonts', async () => {
    const spec = bookEpub({ chapters: CHAPTERS, nav: NAV_ENTRIES })
    const result = await parseSpec({
      ...spec,
      encryption: encryptionXml(['OEBPS/fonts/serif.otf', 'OEBPS/fonts/mono.woff2'])
    })

    expect(expectValid(result).book.segment_count).toBe(3)
  })

  it('refuses when the encryption declaration cannot be read at all', async () => {
    const spec = bookEpub({ chapters: CHAPTERS, nav: NAV_ENTRIES })
    const result = await parseSpec({ ...spec, encryption: '<encryption><broken' })

    expect(result).toEqual({ kind: 'drm-protected' })
  })

  it('refuses DRM before the container is even looked at', async () => {
    const result = await parseSpec({
      container: null,
      encryption: encryptionXml(['OEBPS/c1.xhtml'])
    })

    expect(result).toEqual({ kind: 'drm-protected' })
  })
})

describe('parseEpubFile — caps', () => {
  it('refuses once the running decompressed total passes the text cap', async () => {
    // Small file first, then one that alone would fit: only the *cumulative*
    // total trips the cap, and the big entry is refused on its declared size
    // without ever being decompressed.
    const small = 'lorem ipsum '.repeat(350_000)
    const large = 'lorem ipsum '.repeat(Math.floor((EPUB_TEXT_BYTE_CAP - 2 * 1024 * 1024) / 12))
    expect(Buffer.byteLength(large)).toBeLessThan(EPUB_TEXT_BYTE_CAP)
    expect(Buffer.byteLength(small) + Buffer.byteLength(large)).toBeGreaterThan(EPUB_TEXT_BYTE_CAP)
    const spec: EpubSpec = {
      opf: opfXml({
        title: 'Bomb',
        manifest: [
          { id: 'c1', href: 'c1.xhtml' },
          { id: 'c2', href: 'c2.xhtml' }
        ],
        spine: [{ idref: 'c1' }, { idref: 'c2' }]
      }),
      files: {
        'OEBPS/c1.xhtml': xhtmlDoc(`<p>${small}</p>`),
        'OEBPS/c2.xhtml': xhtmlDoc(`<p>${large}</p>`)
      }
    }
    const result = await parseSpec(spec)

    expect(result.kind).toBe('oversized')
    if (result.kind !== 'oversized') return
    expect(result.cap).toBe('text')
    expect(result.limitBytes).toBe(EPUB_TEXT_BYTE_CAP)
    expect(result.observedBytes ?? 0).toBeGreaterThan(EPUB_TEXT_BYTE_CAP)
  }, 60_000)
})

describe('parseEpubFile — malformed', () => {
  it('refuses an archive with no container.xml', async () => {
    const spec = bookEpub({ chapters: CHAPTERS, nav: NAV_ENTRIES })
    const result = await parseSpec({ ...spec, container: null })

    expect(result.kind).toBe('malformed')
    if (result.kind !== 'malformed') return
    expect(result.reason).toContain('container.xml')
  })

  it('refuses a container.xml that names no rootfile', async () => {
    const spec = bookEpub({ chapters: CHAPTERS, nav: NAV_ENTRIES })
    const result = await parseSpec({
      ...spec,
      container: '<?xml version="1.0"?><container><rootfiles/></container>'
    })

    expect(result.kind).toBe('malformed')
  })

  it('refuses when the package document the container names is absent', async () => {
    const result = await parseSpec({ files: { 'OEBPS/c1.xhtml': xhtmlDoc('<p>Orphan.</p>') } })

    expect(result.kind).toBe('malformed')
  })

  it('refuses a package document with an empty spine', async () => {
    const result = await parseSpec({
      opf: opfXml({ title: 'Spineless', manifest: [{ id: 'c1', href: 'c1.xhtml' }], spine: [] }),
      files: { 'OEBPS/c1.xhtml': xhtmlDoc('<p>Unreachable.</p>') }
    })

    expect(result.kind).toBe('malformed')
  })

  it('refuses a book whose spine holds no readable text', async () => {
    const result = await parseSpec(
      bookEpub({ chapters: [{ body: '<p><img src="only-a-picture.png"/></p>' }] })
    )

    expect(result.kind).toBe('malformed')
    if (result.kind !== 'malformed') return
    expect(result.reason).toContain('no readable text')
  })

  it('refuses a file that is not a zip at all', async () => {
    const filePath = join(tmpDir, 'not-an-archive.epub')
    writeFileSync(filePath, 'This is a plain text file wearing an epub extension.')

    const result = await parseEpubFile(filePath)

    expect(result.kind).toBe('malformed')
  })

  it('refuses a missing path, a directory, and a non-string path', async () => {
    await expect(parseEpubFile(join(tmpDir, 'absent.epub'))).resolves.toMatchObject({
      kind: 'malformed'
    })
    await expect(parseEpubFile(tmpDir)).resolves.toMatchObject({ kind: 'malformed' })
    await expect(parseEpubFile(undefined)).resolves.toEqual({
      kind: 'malformed',
      reason: 'no file path'
    })
    await expect(parseEpubFile(42)).resolves.toEqual({
      kind: 'malformed',
      reason: 'no file path'
    })
  })

  it('never lets an unreadable navigation document sink the whole book', async () => {
    const spec = bookEpub({ chapters: CHAPTERS })
    const result = await parseSpec({
      ...spec,
      files: { ...spec.files, 'OEBPS/nav.xhtml': navXml(NAV_ENTRIES) }
    })

    // The nav is present but unlisted in the manifest, so the TOC rung finds
    // nothing and the per-spine-file rung chapters the book instead.
    expect(expectValid(result).book.segments.map((segment) => segment.title)).toEqual([
      'The Wreck',
      'The Flare',
      'The Keeper'
    ])
  })

  it('degrades to the per-file rung when the NCX is unreadable XML', async () => {
    const spec = bookEpub({ chapters: CHAPTERS, ncx: [], spineToc: true })
    const result = await parseSpec({
      ...spec,
      files: { ...spec.files, 'OEBPS/toc.ncx': '<ncx><navMap><navPoint' }
    })

    // A table of contents too broken to read is unusable, not fatal (§3).
    expect(expectValid(result).book.segments.map((segment) => segment.title)).toEqual([
      'The Wreck',
      'The Flare',
      'The Keeper'
    ])
  })
})
