// Assemble the run-in-place portable folder (ADR-0016, portable-usb slices 03-04).
//
// Input:  dist/win-unpacked  (electron-builder --win dir output)
// Output: dist/WingletReader-Portable/
//
//   WingletReader-Portable\
//     WingletReader.cmd            <- the single launcher the user double-clicks
//     README.txt                   <- first-run portable instructions
//     autorun.inf                  <- cosmetic drive label/icon only
//     WingletReader.ico            <- cosmetic drive icon
//     app\                         <- the real, unpacked Electron app
//       WingletReader.exe          <- the real executable (process.execPath)
//       WingletReader.portable     <- the portable marker, BESIDE the real exe
//       resources\, locales\, *.dll, *.pak, ...
//     app\data\                    <- NOT created here; slice-01 makes it on first run
//
// Marker-location decision (recorded in the slice-03 issue): because the Electron
// executable cannot be split from its sibling runtime files, the "one launcher at
// the root, app tucked into \app\" layout is produced with a launcher shim at the
// root. The real exe therefore lives in \app\, so the marker and the first-run
// \data directory live in \app\ too - beside whatever process.execPath resolves
// to at runtime, which is exactly where slice-01 detection looks.
//
// The layout shape, file contents, marker name, and data dirname all come from
// scripts/portable-layout.mjs (the single source of truth, shared with the
// installer "Portable to USB" mode of slice 08) so the assembly can never drift.

import {
  existsSync,
  rmSync,
  mkdirSync,
  cpSync,
  writeFileSync
} from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  ROOT_FILENAMES,
  APP_DIRNAME,
  readPortableConstants,
  markerContents,
  launcherContents,
  readmeContents,
  autorunContents
} from './portable-layout.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(scriptDir, '..')

function fail(message) {
  console.error(`\n[dist:portable] ${message}\n`)
  process.exit(1)
}

// 1. Pin the marker filename and data dirname from slice-01's source of truth.
let MARKER_FILENAME
let DATA_DIRNAME
try {
  ;({ markerFilename: MARKER_FILENAME, dataDirname: DATA_DIRNAME } =
    readPortableConstants(repoRoot))
} catch (err) {
  fail(err.message)
}

// 2. Locate the electron-builder dir output and the icon source.
const unpackedDir = join(repoRoot, 'dist', 'win-unpacked')
if (!existsSync(unpackedDir)) {
  fail(
    `Missing ${unpackedDir}. Run "electron-builder --win dir" first ` +
      `(npm run dist:portable does this for you).`
  )
}

const realExe = join(unpackedDir, 'WingletReader.exe')
if (!existsSync(realExe)) {
  fail(
    `Expected ${realExe} in the dir output but it is not there. ` +
      `Has productName changed? The launcher shim targets app\\WingletReader.exe.`
  )
}

const driveIconSource = join(repoRoot, 'resources', 'icon.ico')
if (!existsSync(driveIconSource)) {
  fail(
    `Missing ${driveIconSource}. The portable root uses it as WingletReader.ico ` +
      `for the cosmetic drive icon.`
  )
}

// 3. Build the portable layout from scratch.
const portableRoot = join(repoRoot, 'dist', 'WingletReader-Portable')
const appDir = join(portableRoot, APP_DIRNAME)
rmSync(portableRoot, { recursive: true, force: true })
mkdirSync(appDir, { recursive: true })

// 4. The whole unpacked app goes under \app\ (real exe + resources + dlls).
cpSync(unpackedDir, appDir, { recursive: true })

// 5. The marker, beside the real exe (\app\). This is the byte that flips the same
//    .exe into portable mode at runtime.
writeFileSync(join(appDir, MARKER_FILENAME), markerContents(DATA_DIRNAME))

// 6. The single launcher at the root.
writeFileSync(join(portableRoot, ROOT_FILENAMES.launcher), launcherContents())

// 7. First-run instructions at the portable root.
writeFileSync(join(portableRoot, ROOT_FILENAMES.readme), readmeContents())

// 8. Cosmetic drive presentation (label + icon only; not an auto-launch mechanism).
writeFileSync(join(portableRoot, ROOT_FILENAMES.autorun), autorunContents())
cpSync(driveIconSource, join(portableRoot, ROOT_FILENAMES.icon))

// 9. Deliberately do NOT create \app\data; slice-01's redirect makes it on first run.

console.log('[dist:portable] Portable folder assembled:')
console.log(`  root:     ${portableRoot}`)
console.log(`  launcher: ${ROOT_FILENAMES.launcher}  -> app\\WingletReader.exe`)
console.log(`  readme:   ${ROOT_FILENAMES.readme}`)
console.log(`  autorun:  ${ROOT_FILENAMES.autorun}  (label/icon only)`)
console.log(`  icon:     ${ROOT_FILENAMES.icon}`)
console.log(`  marker:   app\\${MARKER_FILENAME}  (beside the real exe)`)
console.log(`  app:      app\\  (unpacked Electron app)`)
console.log(
  `  data:     app\\${DATA_DIRNAME}\\  (created on first run by slice-01 redirect)`
)
console.log('\nCopy the WingletReader-Portable folder to a USB stick to use it.')
