// Single source of truth for the run-in-place portable layout (ADR-0016).
//
// The portable folder that ends up on a USB stick has a fixed shape:
//
//   <root>\
//     WingletReader.cmd            <- the single launcher the user double-clicks
//     README.txt                   <- first-run portable instructions
//     autorun.inf                  <- cosmetic drive label/icon only
//     WingletReader.ico            <- cosmetic drive icon
//     app\                         <- the real, unpacked Electron app
//       WingletReader.exe          <- the real executable (process.execPath)
//       <marker>                   <- the portable marker, BESIDE the real exe
//     app\data\                    <- created on first run by the slice-01 redirect
//
// Three front-ends produce this layout (ADR-0016 §1, §3):
//   1. `npm run dist:portable`  -> scripts/assemble-portable.mjs (maintainer assembly)
//   2. the in-app "Create Portable Drive" creator -> src/main/portableProvisioning.ts
//   3. the installer "Portable to USB" mode -> build/installer.nsh (slice 08), which
//      cannot run JS at install time, so it `File`s in the artifacts that
//      scripts/generate-portable-layout.mjs writes from THIS module.
//
// (1) and (3) share this module so they can never drift. The marker name and
// data dirname are pinned from src/main/portableMode.ts (the slice-01 source of
// truth for runtime detection) so the assembled layout always matches what the
// app looks for at launch.

import { readFileSync } from 'fs'
import { join } from 'path'

/** Fixed names of the four files written at the portable root (beside `app\`). */
export const ROOT_FILENAMES = {
  launcher: 'WingletReader.cmd',
  readme: 'README.txt',
  autorun: 'autorun.inf',
  icon: 'WingletReader.ico'
}

/** Subdirectory holding the unpacked Electron app, beside the root launcher. */
export const APP_DIRNAME = 'app'

/**
 * Pin the marker filename and data dirname from src/main/portableMode.ts so the
 * assembly can never drift from slice-01 runtime detection. Throws loudly if the
 * source no longer matches the expected shape — a drift here is a real bug.
 */
export function readPortableConstants(repoRoot) {
  const portableModeSrc = readFileSync(
    join(repoRoot, 'src', 'main', 'portableMode.ts'),
    'utf8'
  )

  function pin(constName) {
    const match = portableModeSrc.match(
      new RegExp(`${constName}\\s*=\\s*'([^']+)'`)
    )
    if (!match) {
      throw new Error(
        `Could not read ${constName} from src/main/portableMode.ts. ` +
          `The portable layout must not drift from slice-01 detection — ` +
          `fix the regex or the source.`
      )
    }
    return match[1]
  }

  return {
    markerFilename: pin('PORTABLE_MARKER_FILENAME'),
    dataDirname: pin('PORTABLE_DATA_DIRNAME')
  }
}

/** Contents of the portable marker (placed beside the real exe, inside `app\`). */
export function markerContents(dataDirname) {
  return [
    'WingletReader portable-mode marker (ADR-0016).',
    '',
    'While this file sits beside the WingletReader executable, the app runs in',
    'portable mode: its entire data directory is redirected to the "' +
      dataDirname +
      '" folder',
    'beside the executable instead of C:\\Users\\<you>\\AppData, so the library,',
    'settings, and segments live on the stick and follow you between machines.',
    '',
    'Delete this file to make this copy behave like a normal installed app.',
    ''
  ].join('\r\n')
}

/**
 * Contents of WingletReader.cmd, the single launcher at the root. `%~dp0`
 * resolves to this folder at runtime including the current drive letter, so it
 * is immune to the stick mounting as F: on one PC and E: on the next.
 */
export function launcherContents() {
  return ['@echo off', 'start "" "%~dp0app\\WingletReader.exe"', ''].join('\r\n')
}

/** Contents of README.txt, the first-run instructions at the portable root. */
export function readmeContents() {
  return [
    'WingletReader Portable',
    '======================',
    '',
    'What this is',
    '------------',
    'WingletReader Portable is the Windows x64 run-in-place copy of WingletReader.',
    'It keeps its library, settings, segments, and app data beside the app on this',
    'drive instead of in the host PC user profile, so your reading setup can move',
    'between eligible Windows PCs.',
    '',
    'How to launch',
    '-------------',
    '1. Open this drive or folder in File Explorer.',
    '2. Double-click WingletReader.cmd.',
    '3. Keep the app folder in place; the launcher starts app\\WingletReader.exe.',
    '',
    'Windows SmartScreen',
    '-------------------',
    'This alpha build is unsigned. On a new PC, Windows may show a one-time',
    'SmartScreen warning. Choose "More info", then "Run anyway" if you trust this',
    'copy.',
    '',
    'Safe eject',
    '----------',
    'Close WingletReader before pulling out or ejecting the USB stick. The app saves',
    'library and settings data on this drive, and removing the drive while the app is',
    'running can interrupt a save.',
    '',
    'Eligible device',
    '---------------',
    '- Windows 10 or Windows 11, x64',
    '- USB storage allowed by the PC',
    '- Roughly 500 MB free on the drive',
    '- No administrator access required',
    '',
    'Note',
    '----',
    'Windows does not auto-launch portable apps from removable drives. The reliable',
    'flow is: plug in the drive, open it, then double-click WingletReader.cmd.',
    ''
  ].join('\r\n')
}

/**
 * Contents of autorun.inf. Cosmetic drive presentation only (label + icon); this
 * is intentionally NOT an auto-launch mechanism (ADR-0016 rejects AutoRun-for-exe).
 */
export function autorunContents() {
  return ['[Autorun]', 'Label=WingletReader', 'Icon=WingletReader.ico', ''].join(
    '\r\n'
  )
}
