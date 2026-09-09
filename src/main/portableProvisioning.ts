import fs from 'fs'
import { basename, dirname, isAbsolute, join, resolve } from 'path'
import {
  PORTABLE_DATA_DIRNAME,
  PORTABLE_MARKER_FILENAME
} from './portableMode'

import type {
  PortableProvisioningErrorCode,
  PortableProvisioningResult
} from '../shared/channelContract'
export type {
  PortableProvisioningError,
  PortableProvisioningErrorCode,
  PortableProvisioningResult
} from '../shared/channelContract'

const PRODUCT_EXE_FILENAME = 'WingletReader.exe'
const ROOT_LAUNCHER_FILENAME = 'WingletReader.cmd'
const ROOT_README_FILENAME = 'README.txt'
const ROOT_AUTORUN_FILENAME = 'autorun.inf'
const ROOT_ICON_FILENAME = 'WingletReader.ico'
const DATA_FILENAME = 'fasttrack-data.json'
const STAGING_PREFIX = '.wingletreader-portable-staging-'
const SPACE_SAFETY_BYTES = 10 * 1024 * 1024

export interface PortableProvisioningOptions {
  sourceAppDir: string
  sourceDataFile: string
  iconSourceCandidates?: string[]
  getAvailableBytes?: (path: string) => number | null
}

function error(
  code: PortableProvisioningErrorCode,
  message: string,
  extra: {
    detail?: string
    requiredBytes?: number
    availableBytes?: number
  } = {}
): PortableProvisioningResult {
  return { ok: false, error: { code, message, ...extra } }
}

function exists(path: string): boolean {
  return fs.existsSync(path)
}

function isDirectory(path: string): boolean {
  try {
    return fs.statSync(path).isDirectory()
  } catch {
    return false
  }
}

function fileSize(path: string): number {
  try {
    return fs.statSync(path).size
  } catch {
    return 0
  }
}

function directorySize(path: string, excludedDirName?: string): number {
  let total = 0
  for (const entry of fs.readdirSync(path, { withFileTypes: true })) {
    if (excludedDirName && entry.isDirectory() && entry.name === excludedDirName) continue
    const full = join(path, entry.name)
    if (entry.isDirectory()) total += directorySize(full, excludedDirName)
    else if (entry.isFile()) total += fileSize(full)
  }
  return total
}

function defaultAvailableBytes(path: string): number | null {
  if (!('statfsSync' in fs)) return null
  try {
    const stat = fs.statfsSync(path)
    return Number(stat.bavail) * Number(stat.bsize)
  } catch {
    return null
  }
}

function findIconSource(candidates: string[] | undefined): string | null {
  for (const candidate of candidates ?? []) {
    if (exists(candidate)) return candidate
  }
  return null
}

function hasPortableInstall(targetPath: string): boolean {
  return exists(join(targetPath, 'app', PORTABLE_MARKER_FILENAME))
}

function conflictedPortableEntries(targetPath: string): string[] {
  return [
    ROOT_LAUNCHER_FILENAME,
    ROOT_README_FILENAME,
    ROOT_AUTORUN_FILENAME,
    ROOT_ICON_FILENAME,
    'app'
  ].filter((entry) => exists(join(targetPath, entry)))
}

function ensureWritableProbe(path: string): boolean {
  const probe = join(path, `.wingletreader-write-test-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  try {
    fs.writeFileSync(probe, 'ok', 'utf-8')
    fs.rmSync(probe, { force: true })
    return true
  } catch {
    try {
      fs.rmSync(probe, { force: true })
    } catch {
      // ignore cleanup failure for a file that probably was not created
    }
    return false
  }
}

function requiredBytes(sourceAppDir: string, sourceDataFile: string, iconSource: string | null): number {
  return (
    directorySize(sourceAppDir, PORTABLE_DATA_DIRNAME) +
    fileSize(sourceDataFile) +
    (iconSource ? fileSize(iconSource) : 0) +
    SPACE_SAFETY_BYTES
  )
}

function writeMarker(appDir: string): void {
  fs.writeFileSync(
    join(appDir, PORTABLE_MARKER_FILENAME),
    [
      'WingletReader portable-mode marker (ADR-0016).',
      '',
      'While this file sits beside the WingletReader executable, the app runs in',
      `portable mode: its entire data directory is redirected to the "${PORTABLE_DATA_DIRNAME}" folder`,
      'beside the executable instead of C:\\Users\\<you>\\AppData.',
      ''
    ].join('\r\n'),
    'utf-8'
  )
}

function writeLauncher(root: string): void {
  fs.writeFileSync(
    join(root, ROOT_LAUNCHER_FILENAME),
    ['@echo off', 'start "" "%~dp0app\\WingletReader.exe"', ''].join('\r\n'),
    'utf-8'
  )
}

function writeReadme(root: string): void {
  fs.writeFileSync(
    join(root, ROOT_README_FILENAME),
    [
      'WingletReader Portable',
      '======================',
      '',
      'Open this folder in File Explorer and double-click WingletReader.cmd.',
      'Keep the app folder in place; the launcher starts app\\WingletReader.exe.',
      '',
      'This alpha build is unsigned. On a new PC, Windows may show a one-time',
      'SmartScreen warning. Choose "More info", then "Run anyway" if you trust this copy.',
      '',
      'Close WingletReader before ejecting the USB stick so library/settings saves finish.',
      '',
      'Windows does not auto-launch portable apps from removable drives.',
      ''
    ].join('\r\n'),
    'utf-8'
  )
}

function writeAutorun(root: string): void {
  fs.writeFileSync(
    join(root, ROOT_AUTORUN_FILENAME),
    ['[Autorun]', 'Label=WingletReader', 'Icon=WingletReader.ico', ''].join('\r\n'),
    'utf-8'
  )
}

function copyApp(sourceAppDir: string, appDir: string): void {
  fs.cpSync(sourceAppDir, appDir, {
    recursive: true,
    filter: (source) => resolve(source) !== resolve(join(sourceAppDir, PORTABLE_DATA_DIRNAME))
  })
}

function cloneData(sourceDataFile: string, dataDir: string): void {
  fs.mkdirSync(dataDir, { recursive: true })
  if (exists(sourceDataFile)) {
    fs.copyFileSync(sourceDataFile, join(dataDir, DATA_FILENAME))
  }
}

function buildPortableLayout(stagingRoot: string, options: PortableProvisioningOptions, iconSource: string | null): void {
  const appDir = join(stagingRoot, 'app')
  fs.mkdirSync(stagingRoot, { recursive: true })
  copyApp(options.sourceAppDir, appDir)
  writeMarker(appDir)
  writeLauncher(stagingRoot)
  writeReadme(stagingRoot)
  writeAutorun(stagingRoot)
  if (iconSource) fs.copyFileSync(iconSource, join(stagingRoot, ROOT_ICON_FILENAME))
  cloneData(options.sourceDataFile, join(appDir, PORTABLE_DATA_DIRNAME))
}

function safeRemove(path: string): void {
  try {
    fs.rmSync(path, { recursive: true, force: true })
  } catch {
    // Best effort cleanup only.
  }
}

function publishIntoExistingTarget(stagingRoot: string, targetPath: string): void {
  const moved: string[] = []
  try {
    for (const entry of fs.readdirSync(stagingRoot)) {
      const from = join(stagingRoot, entry)
      const to = join(targetPath, entry)
      fs.renameSync(from, to)
      moved.push(to)
    }
    safeRemove(stagingRoot)
  } catch (err) {
    for (const created of moved) safeRemove(created)
    safeRemove(stagingRoot)
    throw err
  }
}

function isInsidePath(candidate: string, parent: string): boolean {
  const normalizedCandidate = resolve(candidate).toLowerCase()
  const normalizedParent = resolve(parent).toLowerCase()
  return normalizedCandidate === normalizedParent || normalizedCandidate.startsWith(`${normalizedParent}\\`)
}

export function createPortableDrive(
  targetPathInput: string,
  options: PortableProvisioningOptions
): PortableProvisioningResult {
  if (typeof targetPathInput !== 'string' || targetPathInput.trim() === '') {
    return error('invalid-target', 'Choose a destination folder for the portable copy.')
  }

  const targetPath = resolve(targetPathInput)
  const sourceAppDir = resolve(options.sourceAppDir)
  const targetExists = exists(targetPath)
  const writableProbePath = targetExists ? targetPath : dirname(targetPath)

  if (!isAbsolute(targetPathInput)) {
    return error('invalid-target', 'The portable destination must be an absolute path.')
  }
  if (isInsidePath(targetPath, sourceAppDir)) {
    return error('invalid-target', 'Choose a destination outside the running app folder.')
  }
  if (!isDirectory(sourceAppDir) || !exists(join(sourceAppDir, PRODUCT_EXE_FILENAME))) {
    return error('source-missing', 'The running app folder could not be copied.')
  }
  if (targetExists && !isDirectory(targetPath)) {
    return error('target-not-writable', 'The portable destination must be a folder.')
  }
  if (!targetExists && !isDirectory(dirname(targetPath))) {
    return error('target-not-writable', 'The destination parent folder does not exist.')
  }
  if (targetExists && hasPortableInstall(targetPath)) {
    return error('portable-exists', 'That folder already contains a WingletReader portable copy.')
  }

  const conflicts = targetExists ? conflictedPortableEntries(targetPath) : []
  if (conflicts.length > 0) {
    return error(
      'target-has-conflicts',
      'That folder already contains files WingletReader would need to create.',
      { detail: conflicts.join(', ') }
    )
  }

  if (!ensureWritableProbe(writableProbePath)) {
    return error('target-not-writable', 'WingletReader cannot write to that destination.')
  }

  const iconSource = findIconSource(options.iconSourceCandidates)
  if (!iconSource) {
    return error('source-missing', 'The WingletReader drive icon could not be found.')
  }

  const required = requiredBytes(sourceAppDir, options.sourceDataFile, iconSource)
  const available = (options.getAvailableBytes ?? defaultAvailableBytes)(writableProbePath)
  if (available !== null && available < required) {
    return error(
      'insufficient-space',
      'There is not enough free space for a portable WingletReader copy.',
      { requiredBytes: required, availableBytes: available }
    )
  }

  const stagingParent = targetExists ? targetPath : dirname(targetPath)
  const stagingRoot = join(
    stagingParent,
    `${STAGING_PREFIX}${basename(targetPath)}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )

  try {
    buildPortableLayout(stagingRoot, options, iconSource)
    if (targetExists) {
      publishIntoExistingTarget(stagingRoot, targetPath)
    } else {
      fs.renameSync(stagingRoot, targetPath)
    }
  } catch (err) {
    safeRemove(stagingRoot)
    return error('copy-failed', 'The portable copy could not be created.', {
      detail: err instanceof Error ? err.message : String(err)
    })
  }

  return {
    ok: true,
    targetPath,
    launcherPath: join(targetPath, ROOT_LAUNCHER_FILENAME),
    dataPath: join(targetPath, 'app', PORTABLE_DATA_DIRNAME, DATA_FILENAME)
  }
}
