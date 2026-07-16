# Custom NSIS include for WingletReader — adds a "Portable to USB" installer mode.
# ADR-0016 §3, portable-usb slice 08.  Wired via package.json build.nsis.include.
#
# DESIGN (chosen with the maintainer, 2026-06-23; directory-page fix 2026-06-25):
# electron-builder's stock install Section + uninstaller are left untouched — a
# standard install is byte-for-byte today's behaviour. The one structural change is
# that the stock MUI_PAGE_DIRECTORY is disabled (package.json
# build.nsis.allowToChangeInstallationDirectory:false) and replaced by the custom
# directory page below. The stock page had to go because the per-user/all-users page's
# setInstallModePerUser resets $INSTDIR to the local install folder right before it
# displays, so in portable mode it showed (and could reset to) a local path, defeating
# the USB redirect. Our custom page serves both modes: it skips silently in portable
# mode (after re-binding $INSTDIR to the USB drive) and acts as the normal-install
# location picker otherwise.
#
# The install Section unconditionally writes HOST registration (Add/Remove-Programs
# + uninstaller registry keys, Start-menu/desktop shortcuts) and stashes the
# installer for the updater, and the only in-Section hook (customInstall) runs
# AFTER all of it. So the portable mode:
#   1. lets the user choose "Portable to USB" and a destination (customWelcomePage);
#   2. skips the per-user/all-users page (customInstallMode);
#   3. normalizes the chosen USB drive/folder and redirects the install target there
#      before files are extracted (customPageAfterChangeDir; the custom directory page
#      also provides the normal-install location picker that the disabled stock page
#      used to);
#   4. after the Section has extracted the app there, DELETES every host artifact the
#      Section just created and writes the run-in-place portable layout (customInstall).
# The app payload is embedded once (the Section's own extraction, shared by both
# modes), so the standard installer is not bloated.
#
# Net result (HITL-verified): after a portable run the host has no ARP entry, no app
# registry keys, no shortcuts, no uninstaller, and no updater stash — everything lives
# on the stick. Registration is briefly written then removed; this is a deliberate,
# complete clean-up, not an accidental leave-in-place.
#
# Layout single-sourcing: the marker + the four root files come from
# build/portable-layout/, rendered by scripts/generate-portable-layout.mjs from the
# shared source of truth (scripts/portable-layout.mjs, also used by dist:portable), so
# the installer can never drift from the slice-03 assembly. The marker filename literal
# below must match PORTABLE_MARKER_FILENAME in src/main/portableMode.ts; a rename there
# changes the generated filename and fails the File at compile time (loud, intended).
#
# MAINTENANCE: relies on stock macro names/vars from electron-builder 26.15.3
# (installSection.nsh, installer.nsh, common.nsh, multiUser*.nsh). On an
# electron-builder bump, re-check that registryAddInstallInfo / addStartMenuLink /
# addDesktopLink / installApplicationFiles still write only the host artifacts this
# file cleans up, and re-run the slice-08 HITL.

!include LogicLib.nsh
!include nsDialogs.nsh
!include WinMessages.nsh

# INSTALL_REGISTRY_KEY is defined by the stock multiUser.nsh, which is included AFTER
# this file. Mirror it here (same value, !define /ifndef) so the existing-install check
# in portablePageLeave can resolve it at compile time; multiUser.nsh's own /ifndef then
# no-ops. APP_GUID is a command-line define available everywhere.
!define /ifndef INSTALL_REGISTRY_KEY "Software\${APP_GUID}"

# >>> PORTABLE (slice 08)
# Everything portable is installer-pass only. electron-builder compiles NSIS twice
# (installer + a separate uninstaller pass) with warnings-as-errors, so anything not
# used in the uninstaller pass must be excluded from it. customInstallMode is the one
# exception: the install-mode page inserts it in BOTH passes, so the macro must stay
# defined for both — but its body (and thus its use of portableMode) is installer-only.

# Skip the per-user/all-users page in portable mode. multiUserUi.nsh's install-mode
# PRE inserts `customInstallMode`; setting isForceCurrentInstall makes that page abort.
!macro customInstallMode
  !ifndef BUILD_UNINSTALLER
    ${If} $portableMode == "1"
      StrCpy $isForceCurrentInstall "1"
    ${EndIf}
  !endif
!macroend

!ifndef BUILD_UNINSTALLER

Var portableMode          # "1" when the user chose "Portable to USB", else "0"
Var portableDest          # USB drive/folder the user chose
Var portableRoot          # the portable copy's root: $portableDest\WingletReader
Var portableDialog
Var portableRadioInstall
Var portableRadioPortable
Var portableDestLabel
Var portableDestText
Var portableBrowseButton
Var instDirDialog         # custom normal-install directory page (replaces the stock one)
Var instDirText
Var instDirBrowse

# StrContains is normally pulled in by the stock MUI_PAGE_DIRECTORY block, which is now
# disabled (allowToChangeInstallationDirectory:false). Include it here, installer-pass
# only, so the custom directory page can reuse the stock app-name-subfolder check.
!include StrContains.nsh

# Initialise the flag before any page runs (inserted in .onInit by the stock template,
# installer pass only — un.onInit uses customUnInit instead).
!macro customInit
  StrCpy $portableMode "0"
!macroend

# Find a removable drive to pre-fill the destination, e.g. "E:\". Leaves $portableDest
# empty if none is found (the user then browses to one). Result in $portableDest.
Function portableDetectDefaultDrive
  StrCpy $portableDest ""
  StrCpy $9 65   # 'A'
  ${Do}
    IntFmt $8 "%c" $9
    StrCpy $7 "$8:\"
    System::Call 'kernel32::GetDriveType(t r7) i .r6'
    ${If} $6 == 2   # DRIVE_REMOVABLE
      StrCpy $portableDest "$7"
      Return
    ${EndIf}
    IntOp $9 $9 + 1
  ${LoopUntil} $9 > 90   # 'Z'
FunctionEnd

# Enable the destination field/button only while "Portable to USB" is selected.
Function portableSyncDestEnabled
  ${NSD_GetState} $portableRadioPortable $0
  ${If} $0 == ${BST_CHECKED}
    EnableWindow $portableDestLabel 1
    EnableWindow $portableDestText 1
    EnableWindow $portableBrowseButton 1
  ${Else}
    EnableWindow $portableDestLabel 0
    EnableWindow $portableDestText 0
    EnableWindow $portableBrowseButton 0
  ${EndIf}
FunctionEnd

Function portableOnModeChange
  Pop $0   # clicked control handle (unused)
  Call portableSyncDestEnabled
FunctionEnd

Function portableOnBrowse
  Pop $0   # clicked control handle (unused)
  ${NSD_GetText} $portableDestText $1
  nsDialogs::SelectFolderDialog "Select the USB drive or folder for the portable copy" "$1"
  Pop $2
  ${If} $2 != error
    ${NSD_SetText} $portableDestText "$2"
  ${EndIf}
FunctionEnd

# Resolve the selected portable parent into the real run-in-place layout:
#   E:\              -> E:\WingletReader\app
#   E:\Tools         -> E:\Tools\WingletReader\app
#   E:\Tools\Reader\ -> E:\Tools\Reader\WingletReader\app
#
# The user chooses the drive/folder that should contain the portable copy; the
# installer creates the WingletReader working directory inside it.
Function portableBindInstallDir
  StrLen $0 "$portableDest"
  IntOp $0 $0 - 1
  StrCpy $1 "$portableDest" 1 $0
  ${If} $1 == "\"
    StrCpy $portableDest "$portableDest" $0
  ${EndIf}

  StrCpy $portableRoot "$portableDest\WingletReader"
  StrCpy $INSTDIR "$portableRoot\app"
FunctionEnd

Function portablePageCreate
  nsDialogs::Create 1018
  Pop $portableDialog
  ${If} $portableDialog == error
    Abort
  ${EndIf}

  # Pre-fill a removable drive only on the first visit. If the user reached the
  # confirmation page and clicked Back, $portableDest already holds their choice —
  # keep it so the selection survives the round-trip.
  ${If} $portableDest == ""
    Call portableDetectDefaultDrive
  ${EndIf}

  ${NSD_CreateLabel} 0u 0u 300u 22u "How would you like to set up WingletReader?"
  Pop $0

  ${NSD_CreateRadioButton} 6u 26u 294u 12u "Install on this PC"
  Pop $portableRadioInstall
  ${NSD_CreateLabel} 18u 39u 282u 18u "The normal install: adds WingletReader to this PC with shortcuts and an Add/Remove Programs entry."
  Pop $0

  ${NSD_CreateRadioButton} 6u 62u 294u 12u "Portable to USB drive"
  Pop $portableRadioPortable
  ${NSD_CreateLabel} 18u 75u 282u 26u "Creates a run-in-place copy on a USB drive. Nothing is installed on this PC: no shortcuts, no registry entries, no uninstaller. Your library and settings live on the stick."
  Pop $0

  ${NSD_CreateLabel} 6u 108u 294u 12u "Portable drive or parent folder (WingletReader is created inside it):"
  Pop $portableDestLabel
  ${NSD_CreateText} 6u 121u 234u 13u "$portableDest"
  Pop $portableDestText
  ${NSD_CreateButton} 246u 120u 54u 15u "Browse..."
  Pop $portableBrowseButton

  ${NSD_OnClick} $portableRadioInstall portableOnModeChange
  ${NSD_OnClick} $portableRadioPortable portableOnModeChange
  ${NSD_OnClick} $portableBrowseButton portableOnBrowse

  # Restore the previously chosen mode (default on first visit: install on this PC).
  ${If} $portableMode == "1"
    ${NSD_SetState} $portableRadioPortable ${BST_CHECKED}
  ${Else}
    ${NSD_SetState} $portableRadioInstall ${BST_CHECKED}
  ${EndIf}
  Call portableSyncDestEnabled

  nsDialogs::Show
FunctionEnd

Function portablePageLeave
  ${NSD_GetState} $portableRadioPortable $0
  ${If} $0 != ${BST_CHECKED}
    StrCpy $portableMode "0"
    Return
  ${EndIf}

  StrCpy $portableMode "1"
  ${NSD_GetText} $portableDestText $portableDest

  ${If} $portableDest == ""
    MessageBox MB_OK|MB_ICONEXCLAMATION "Choose a USB drive or folder for the portable copy."
    Abort   # stay on the page
  ${EndIf}

  # Warn (but allow) if the destination is not a removable drive. External SSDs and
  # some sticks report as fixed, and the maintainer may test on any drive, so this is
  # advisory. Catches the "left it on a host path" mistake before anything is written.
  StrCpy $1 "$portableDest" 3   # "X:\"
  System::Call 'kernel32::GetDriveType(t r1) i .r2'
  ${If} $2 != 2   # DRIVE_REMOVABLE
    MessageBox MB_YESNO|MB_ICONQUESTION "This location does not look like a removable USB drive:$\r$\n$portableDest$\r$\n$\r$\nCreate the portable copy here anyway?" IDYES +2
    Abort   # user said no — stay on the page
  ${EndIf}

  # The installer Section runs uninstallOldVersion, which removes an existing standard
  # install (data is kept). We cannot skip it from a hook, so warn: anyone who already
  # has WingletReader installed should use the in-app "Create Portable Drive" instead.
  ReadRegStr $3 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ReadRegStr $4 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $3 != ""
  ${OrIf} $4 != ""
    MessageBox MB_YESNO|MB_ICONEXCLAMATION "WingletReader is already installed on this PC.$\r$\n$\r$\nContinuing will remove the installed copy (your library and settings are kept). To make a portable drive WITHOUT removing your install, click No, finish a normal install, and use 'Create Portable Drive' inside WingletReader.$\r$\n$\r$\nContinue making a portable copy?" IDYES +2
    Abort   # user said no — stay on the page
  ${EndIf}

  # Bind immediately so every later stock page/hook (and the confirmation page) sees
  # the portable destination, not the normal per-user install folder. Directory
  # creation is deferred to the confirmation page's leave, so that going Back to fix a
  # mis-typed drive does not leave empty WingletReader folders on the wrong drive.
  Call portableBindInstallDir
FunctionEnd

# customWelcomePage is inserted as the first installer page by the stock template.
!macro customWelcomePage
  Page custom portablePageCreate portablePageLeave
!macroend

# The custom directory page (it replaces the disabled stock MUI_PAGE_DIRECTORY) does
# double duty:
#   * Portable mode: a read-only CONFIRMATION of where the portable copy will be created
#     — the last stop before extraction starts. The destination box only takes effect at
#     the confirmation page, never on the welcome page, so this gives the user a chance to
#     catch a mis-typed/mis-picked drive and click Back to fix it (there was no recovery
#     point before — pressing Next on the welcome page started the copy immediately). We
#     re-bind here because the per-user/all-users page's setInstallModePerUser reset
#     $INSTDIR to the local folder just before this point; the resolved paths are shown,
#     and the directories are only created on leave (see portableDirPageLeave).
#   * Normal mode: act as the install-location picker the stock page used to provide, so
#     a normal install can still choose where it lands. (Silent installs — including
#     electron-updater's auto-update — skip all custom pages, so this never prompts on
#     update; a manual re-run defaults to the existing location read by initMultiUser.
#     We deliberately do NOT gate on ${isUpdated} here: it expands to a StdUtils plugin
#     call that cannot resolve in a top-level Function compiled at include time.)
Function portableDirPageCreate
  ${If} $portableMode == "1"
    Call portableBindInstallDir   # recompute $portableRoot/$INSTDIR from the choice

    nsDialogs::Create 1018
    Pop $instDirDialog
    ${If} $instDirDialog == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0u 0u 300u 24u "Confirm where the portable copy will be created. Nothing is installed on this PC."
    Pop $0

    ${NSD_CreateLabel} 0u 32u 300u 11u "Drive or folder you chose:"
    Pop $0
    ${NSD_CreateText} 0u 44u 300u 13u "$portableDest"
    Pop $0
    EnableWindow $0 0   # read-only display; click Back on this page to change it

    ${NSD_CreateLabel} 0u 66u 300u 11u "Portable copy folder (created automatically):"
    Pop $0
    ${NSD_CreateText} 0u 78u 300u 13u "$portableRoot"
    Pop $0
    EnableWindow $0 0

    ${NSD_CreateLabel} 0u 102u 300u 24u "If this is not correct, click Back to choose a different drive or folder."
    Pop $0

    nsDialogs::Show
    Return
  ${EndIf}

  nsDialogs::Create 1018
  Pop $instDirDialog
  ${If} $instDirDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0u 0u 300u 22u "Choose the folder to install WingletReader into:"
  Pop $0
  ${NSD_CreateText} 6u 30u 234u 13u "$INSTDIR"
  Pop $instDirText
  ${NSD_CreateButton} 246u 29u 54u 15u "Browse..."
  Pop $instDirBrowse
  ${NSD_OnClick} $instDirBrowse portableDirOnBrowse

  nsDialogs::Show
FunctionEnd

Function portableDirOnBrowse
  Pop $0   # clicked control handle (unused)
  ${NSD_GetText} $instDirText $1
  nsDialogs::SelectFolderDialog "Select the folder to install WingletReader into" "$1"
  Pop $2
  ${If} $2 != error
    ${NSD_SetText} $instDirText "$2"
  ${EndIf}
FunctionEnd

Function portableDirPageLeave
  # Portable mode: the user confirmed the destination (Next). This is the point of no
  # return, so create the directories now. (Pressing Back instead does NOT call this
  # leave, so a corrected choice never leaves stray folders on the rejected drive.)
  ${If} $portableMode == "1"
    Call portableBindInstallDir
    CreateDirectory "$portableRoot"
    CreateDirectory "$INSTDIR"
    Return
  ${EndIf}

  ${NSD_GetText} $instDirText $0
  ${If} $0 == ""
    MessageBox MB_OK|MB_ICONEXCLAMATION "Choose a folder to install WingletReader into."
    Abort   # stay on the page
  ${EndIf}

  # Mirror the stock instFilesPre: ensure the path carries the WingletReader sub-folder
  # so we never install loose into a shared parent. If the user kept the default (or
  # already pointed inside a WingletReader folder) this is a no-op.
  ${StrContains} $1 "${APP_FILENAME}" "$0"
  ${If} $1 == ""
    StrCpy $0 "$0\${APP_FILENAME}"
  ${EndIf}
  StrCpy $INSTDIR "$0"
FunctionEnd

!macro customPageAfterChangeDir
  Page custom portableDirPageCreate portableDirPageLeave
!macroend

# Runs at the very end of the install Section, AFTER the stock template has extracted
# the app and (for the portable run, onto the USB) written all host registration. In
# portable mode: write the run-in-place layout, then delete every host artifact the
# Section created so the PC is left clean.
!macro customInstall
  ${If} $portableMode == "1"
    # Re-bind at the final write boundary too. electron-builder pages can reset
    # $INSTDIR for normal installs; portable must always extract to the stick.
    Call portableBindInstallDir

    # --- write the run-in-place portable layout (single-sourced, see header) ---
    # Marker beside the real exe ($INSTDIR == $portableRoot\app).
    SetOutPath "$INSTDIR"
    File "${PROJECT_DIR}\build\portable-layout\WingletReader.portable"
    # Root files beside \app.
    SetOutPath "$portableRoot"
    File "${PROJECT_DIR}\build\portable-layout\WingletReader.cmd"
    File "${PROJECT_DIR}\build\portable-layout\README.txt"
    File "${PROJECT_DIR}\build\portable-layout\autorun.inf"
    File "${PROJECT_DIR}\build\portable-layout\WingletReader.ico"
    SetOutPath "$INSTDIR"

    # --- remove the uninstaller the Section dropped into \app (never registered) ---
    Delete "$INSTDIR\${UNINSTALL_FILENAME}"

    # --- delete the host registration the Section just wrote (SHELL_CONTEXT == HKCU,
    #     since portable forces a current-user install) ---
    DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}"
    !ifdef UNINSTALL_REGISTRY_KEY_2
      DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY_2}"
    !endif
    DeleteRegKey SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}"

    # --- delete the Start-menu and desktop shortcuts the Section created ---
    # $newStartMenuLink / $newDesktopLink were set by setLinkVars earlier in the Section.
    WinShell::UninstShortcut "$newStartMenuLink"
    Delete "$newStartMenuLink"
    WinShell::UninstShortcut "$newDesktopLink"
    Delete "$newDesktopLink"
    WinShell::UninstAppUserModelId "${APP_ID}"
    !ifdef MENU_FILENAME
      RMDir "$SMPROGRAMS\${MENU_FILENAME}"
    !endif
    System::Call 'shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'

    # --- delete the installer copy the Section stashed for the updater ---
    # installApplicationFiles copies $EXEPATH to $LOCALAPPDATA\${APP_INSTALLER_STORE_FILE};
    # ${StdUtils.GetParentPath} gives the wingletreader-updater folder so it can be removed.
    !ifdef APP_INSTALLER_STORE_FILE
      Delete "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
      ${StdUtils.GetParentPath} $0 "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
      RMDir "$0"
    !endif

    # Run-after-finish (if shown/checked) should launch the portable copy off the stick.
    StrCpy $launchLink "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  ${EndIf}
!macroend

!endif # BUILD_UNINSTALLER
# <<< PORTABLE
