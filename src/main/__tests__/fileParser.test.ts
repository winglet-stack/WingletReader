import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { FileParser } from '../fileParser'

const createdDirs: string[] = []

function tempFile(name: string, data: string | Buffer): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'winglet-parser-'))
  createdDirs.push(dir)
  const filePath = path.join(dir, name)
  fs.writeFileSync(filePath, data)
  return filePath
}

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('FileParser text imports', () => {
  it('parses UTF-8 text with BOM and CRLF cleanup diagnostics', async () => {
    const filePath = tempFile('sample.txt', Buffer.from('\uFEFFAlpha\r\nbeta gamma', 'utf8'))
    const result = await FileParser.parse(filePath, 'txt')

    // parseTxt preserves layout \u2014 single newlines are not collapsed to spaces
    expect(result.content).toBe('Alpha\nbeta gamma')
    expect(result.diagnostics.sourceExtension).toBe('txt')
    expect(result.diagnostics.parser).toBe('node:utf8')
    expect(result.diagnostics.cleanupActions.map((a) => a.type)).toEqual(['bom', 'lineEndings'])
  })

  it('preserves intra-paragraph newlines in hard-wrapped .txt files', async () => {
    const filePath = tempFile(
      'poem.txt',
      'Roses are red,\nViolets are blue,\n\nSugar is sweet.'
    )
    const result = await FileParser.parse(filePath, 'txt')

    // Single newlines must survive \u2014 they must not be collapsed to spaces
    expect(result.content).toBe('Roses are red,\nViolets are blue,\n\nSugar is sweet.')
    expect(result.diagnostics.cleanupActions.map((a) => a.type)).not.toContain('softLineWraps')
  })

  it('parses UTF-16LE text files', async () => {
    const body = Buffer.from('Alpha beta gamma', 'utf16le')
    const filePath = tempFile('utf16.txt', Buffer.concat([Buffer.from([0xff, 0xfe]), body]))
    const result = await FileParser.parse(filePath, 'txt')

    expect(result.content).toBe('Alpha beta gamma')
    expect(result.diagnostics.parser).toBe('node:utf16le')
  })
})
