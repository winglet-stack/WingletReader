// Generate the portable-layout artifacts the NSIS installer embeds (ADR-0016, slice 08).
//
// The installer "Portable to USB" mode (build/installer.nsh) writes the same
// run-in-place layout as `npm run dist:portable`, but NSIS cannot run JavaScript
// at install time. So this script renders the layout's text files from the shared
// single source of truth (scripts/portable-layout.mjs) into build/portable-layout/,
// and the installer `File`s them onto the chosen USB drive. This keeps the
// installer's layout from drifting from the slice-03 assembly.
//
// Output: build/portable-layout/
//   WingletReader.cmd
//   README.txt
//   autorun.inf
//   WingletReader.ico            (copied from resources/icon.ico)
//   <marker filename>            (e.g. WingletReader.portable, beside-the-exe marker)
//
// Run before `electron-builder --win nsis` (wired into the dist:win script).

import { existsSync, mkdirSync, rmSync, writeFileSync, cpSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  ROOT_FILENAMES,
  readPortableConstants,
  markerContents,
  launcherContents,
  readmeContents,
  autorunContents
} from './portable-layout.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(scriptDir, '..')

function fail(message) {
  console.error(`\n[generate-portable-layout] ${message}\n`)
  process.exit(1)
}

let markerFilename
let dataDirname
try {
  ;({ markerFilename, dataDirname } = readPortableConstants(repoRoot))
} catch (err) {
  fail(err.message)
}

const iconSource = join(repoRoot, 'resources', 'icon.ico')
if (!existsSync(iconSource)) {
  fail(
    `Missing ${iconSource}. The installer needs it as ${ROOT_FILENAMES.icon} ` +
      `for the cosmetic drive icon.`
  )
}

const outDir = join(repoRoot, 'build', 'portable-layout')
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

writeFileSync(join(outDir, markerFilename), markerContents(dataDirname))
writeFileSync(join(outDir, ROOT_FILENAMES.launcher), launcherContents())
writeFileSync(join(outDir, ROOT_FILENAMES.readme), readmeContents())
writeFileSync(join(outDir, ROOT_FILENAMES.autorun), autorunContents())
cpSync(iconSource, join(outDir, ROOT_FILENAMES.icon))

// The installer references the marker by its literal filename; surface it so a
// rename in portableMode.ts that isn't mirrored in build/installer.nsh fails the
// NSIS compile loudly (File: file not found) rather than shipping a dead marker.
console.log('[generate-portable-layout] wrote build/portable-layout/:')
console.log(`  ${markerFilename}  (marker; must match build/installer.nsh)`)
console.log(`  ${ROOT_FILENAMES.launcher}`)
console.log(`  ${ROOT_FILENAMES.readme}`)
console.log(`  ${ROOT_FILENAMES.autorun}`)
console.log(`  ${ROOT_FILENAMES.icon}`)
