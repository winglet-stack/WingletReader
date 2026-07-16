import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

function installerSource(): string {
  return readFileSync(join(process.cwd(), 'build', 'installer.nsh'), 'utf-8')
}

function packageJson(): { build: { nsis: Record<string, unknown> } } {
  return JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'))
}

function functionBody(source: string, name: string): string {
  const match = source.match(new RegExp(`Function ${name}([\\s\\S]*?)FunctionEnd`))
  if (!match) throw new Error(`Missing NSIS function ${name}`)
  return match[1]
}

function macroBody(source: string, name: string): string {
  const match = source.match(new RegExp(`!macro ${name}\\r?\\n([\\s\\S]*?)!macroend`))
  if (!match) throw new Error(`Missing NSIS macro ${name}`)
  return match[1]
}

describe('installer portable mode script', () => {
  it('disables the stock electron-builder directory page', () => {
    // The stock MUI_PAGE_DIRECTORY resets $INSTDIR to the local per-user folder right
    // before it displays (via the install-mode page's setInstallModePerUser), which
    // defeated the portable USB redirect. It is replaced by the custom directory page.
    expect(packageJson().build.nsis.allowToChangeInstallationDirectory).toBe(false)
  })

  it('binds a selected USB drive or folder to the portable app directory', () => {
    const bind = functionBody(installerSource(), 'portableBindInstallDir')

    expect(bind).toContain('StrLen $0 "$portableDest"')
    expect(bind).toContain('IntOp $0 $0 - 1')
    expect(bind).toContain('StrCpy $1 "$portableDest" 1 $0')
    expect(bind).toContain('StrCpy $portableDest "$portableDest" $0')
    expect(bind).toContain('StrCpy $portableRoot "$portableDest\\WingletReader"')
    expect(bind).toContain('StrCpy $INSTDIR "$portableRoot\\app"')
  })

  it('binds the destination on the welcome page but defers directory creation to the confirmation', () => {
    const source = installerSource()
    const pageLeave = functionBody(source, 'portablePageLeave')

    // The welcome page binds (computes $portableRoot/$INSTDIR) so the confirmation can
    // show them, but it must NOT create the folders yet — otherwise clicking Back to fix
    // a mis-typed drive would orphan empty WingletReader folders on the rejected drive.
    expect(pageLeave).toContain('Call portableBindInstallDir')
    expect(pageLeave).not.toContain('CreateDirectory')
  })

  it('creates the portable target directories only when the user confirms (page leave)', () => {
    const source = installerSource()
    const dirPageLeave = functionBody(source, 'portableDirPageLeave')
    const customInstall = macroBody(source, 'customInstall')

    // Directory creation lives in the confirmation page's leave (Next), the point of no
    // return. Pressing Back does not call leave, so a corrected choice leaves no folders.
    const portableBranch = dirPageLeave.split('${EndIf}')[0]
    expect(portableBranch).toContain('$portableMode == "1"')
    expect(portableBranch).toContain('Call portableBindInstallDir')
    expect(portableBranch).toContain('CreateDirectory "$portableRoot"')
    expect(portableBranch).toContain('CreateDirectory "$INSTDIR"')

    expect(customInstall).toContain('Call portableBindInstallDir')
  })

  it('shows a read-only destination confirmation in portable mode (recoverable via Back)', () => {
    const dirPageCreate = functionBody(installerSource(), 'portableDirPageCreate')

    // The portable branch runs to its own Return, before the normal-install picker code.
    const portableBranch = dirPageCreate.slice(
      dirPageCreate.indexOf('$portableMode == "1"'),
      dirPageCreate.indexOf('Return')
    )

    // It rebinds, then displays the chosen drive and the resolved portable root...
    expect(portableBranch).toContain('Call portableBindInstallDir')
    expect(portableBranch).toContain('Confirm')
    expect(portableBranch).toContain('"$portableDest"')
    expect(portableBranch).toContain('"$portableRoot"')
    // ...read-only (the user goes Back to change it, not edits in place)...
    expect(portableBranch).toContain('EnableWindow $0 0')
    // ...and never builds the local-install Browse picker on this page.
    expect(portableBranch).not.toContain('portableDirOnBrowse')
    // No folders are created while merely displaying the confirmation.
    expect(portableBranch).not.toContain('CreateDirectory')
  })

  it('preserves the chosen mode and destination when returning to the welcome page', () => {
    const pageCreate = functionBody(installerSource(), 'portablePageCreate')

    // Back navigation re-enters portablePageCreate: it must not clobber the user's
    // choice. Auto-detect only on the first visit, and restore the portable radio.
    expect(pageCreate).toContain('${If} $portableDest == ""')
    expect(pageCreate).toContain('Call portableDetectDefaultDrive')
    expect(pageCreate).toMatch(
      /\$portableMode == "1"[\s\S]*?\$\{NSD_SetState\} \$portableRadioPortable \$\{BST_CHECKED\}/
    )
  })

  it('still offers a destination picker for a normal install', () => {
    const source = installerSource()
    const dirPageCreate = functionBody(source, 'portableDirPageCreate')
    const dirPageLeave = functionBody(source, 'portableDirPageLeave')

    // Normal mode shows a real directory page with an editable path and Browse button.
    expect(dirPageCreate).toContain('nsDialogs::Create 1018')
    expect(dirPageCreate).toContain('${NSD_CreateText}')
    expect(dirPageCreate).toContain('${NSD_CreateButton}')
    expect(dirPageCreate).toContain('portableDirOnBrowse')

    // ...and commits the chosen folder back into $INSTDIR, validating non-empty input
    // and keeping the app-name sub-folder (mirrors the stock instFilesPre behaviour).
    expect(dirPageLeave).toContain('${NSD_GetText} $instDirText $0')
    expect(dirPageLeave).toContain('MessageBox')
    expect(dirPageLeave).toContain('${StrContains} $1 "${APP_FILENAME}" "$0"')
    expect(dirPageLeave).toContain('StrCpy $INSTDIR "$0"')

    // The custom page is wired in as the after-change-dir page.
    expect(macroBody(source, 'customPageAfterChangeDir')).toContain(
      'Page custom portableDirPageCreate portableDirPageLeave'
    )
  })

  it('rebinds portable paths in customInstall before writing the marker and root files', () => {
    const customInstall = macroBody(installerSource(), 'customInstall')

    const rebind = customInstall.indexOf('Call portableBindInstallDir')
    const marker = customInstall.indexOf('WingletReader.portable')
    expect(rebind).toBeGreaterThan(-1)
    expect(marker).toBeGreaterThan(-1)
    expect(rebind).toBeLessThan(marker)
  })
})
