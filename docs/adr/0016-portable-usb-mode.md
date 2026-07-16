# ADR-0016: Portable USB mode — run-in-place, marker-gated userData redirect

**Date:** 2026-06-23
**Status:** Accepted — implemented in code; installer-mode HITL pending

## Context

A recurring user wish is a "portable library and reader": carry WingletReader on a
USB stick, plug it into any eligible PC, and read from it without installing anything
on the host. Imports, settings, and segments made on the stick should live **on the
stick** and follow the user from machine to machine.

This is unusually cheap to support here because of two existing architecture facts:

1. **The entire library is one JSON file in `userData`.** `src/main/index.ts:120-122`
   constructs `new Database(join(app.getPath('userData'), 'fasttrack-data.json'))`, and
   imported document **text is stored inside that JSON store** (ADR-0001) — there is no
   separate documents folder, no SQLite, and no native binaries to relocate. Redirecting
   one path moves the whole library.
2. **The build is already per-user, not per-machine.** `package.json` `build.nsis` sets
   `perMachine: false`, so "runs without admin" is already the installed posture; portable
   is a smaller step from there than from a per-machine install.

The hard constraints the design must respect:

- **Drive letters change between PCs** (a stick is `F:` on one host, `E:` on the next), so
  the app may never store or rely on an absolute data path. The data location must be
  recomputed from the executable's own location every launch.
- **Windows blocks true auto-launch of an `.exe` from removable media** (AutoRun-for-
  executables was severed for removable drives in Windows 7+ as a malware mitigation; no
  flag, signing tier, or `autorun.inf` trick re-enables it). Genuine auto-on-insert launch
  requires a resident watcher *installed on the host*, which contradicts the zero-install
  premise. Auto-launch and zero-install are therefore mutually exclusive on Windows.
- **Must not regress installed users.** The change has to be purely additive: with no
  portable signal present, startup behaviour is byte-for-byte today's behaviour.
- **Frozen identifiers (CONTEXT.md App Identity).** The data filename `fasttrack-data.json`,
  the AppUserModelId `com.fasttrack.reader`, and the `fasttrack.transmute.*` localStorage
  keys stay frozen; portable mode changes *where* `userData` resolves, not these names.

This ADR was produced in a `grill-me` design session (2026-06-23). Implementation now lives in
the main process runtime (`portableMode.ts`, `index.ts`, `updater*.ts`), the in-app provisioning
core (`portableProvisioning.ts` + Settings -> Data UI), `dist:portable`, and the NSIS include
`build/installer.nsh`. The work is **not gated on the alpha timeline** — on 2026-06-23 the
maintainer widened the alpha invite timeline and removed the prior post-alpha gate as moot.

## Considered Options

**Provisioning model (how a stick comes to exist):**

- **In-app "Create Portable Drive" creator only.** Rejected as the *starting* point: it
  copies the app + current library onto a chosen drive, but it cannot meaningfully exist
  until the portable *runtime* exists, and it front-loads self-copy/verify/migration
  complexity. Kept as **Phase 2**.
- **Shipped portable download only** (publish a portable artifact users copy themselves).
  Viable but loses the "clone my existing library to the stick" convenience.
- **Phased: portable runtime first, creator later.** **Chosen.** The runtime is the
  load-bearing piece and must exist regardless; the creator becomes a thin wrapper over the
  same `dist:portable` assembly step.

**Launch experience:**

- **`autorun.inf` + AutoPlay registration.** Rejected as an auto-launch strategy: modern
  Windows will not execute the `.exe` from it and may show nothing; AV sometimes flags it.
  Its only working part — a custom **drive icon/label** — is kept as cosmetic polish.
- **One obvious launcher at the drive root.** **Chosen.** The standard, reliable, zero-
  install portable-app experience (PortableApps, portable Obsidian): plug in → Explorer/
  AutoPlay opens the drive → user double-clicks the single launcher at the top.

**Portable-mode detection:**

- **Auto-detect removable drive type.** Rejected: fragile across USB-HDD, SD readers,
  external SSD, virtual/network drives; hard to reason about and test.
- **Separate portable build with the flag compiled in.** Rejected as primary: two artifacts
  to build/test/release that can drift.
- **Marker file beside the executable.** **Chosen.** Explicit, testable, one codebase for
  both modes, and drive-letter-proof because the data path is recomputed from the exe's real
  location each launch.

**Packaging shape (how binaries live/run on the stick):**

- **Self-extracting single `.exe`** (electron-builder `portable` target). Rejected: it
  unpacks the whole app into the host's `%TEMP%` on **every** launch — writes to the host,
  slower cold start, and works against the "leaves nothing on the PC" goal.
- **Run-in-place from the stick.** **Chosen.** The unpacked app runs directly off the stick;
  nothing is copied to the host to launch.

**SmartScreen / signing:**

- **Code-sign the portable exe now.** Rejected for alpha: recurring cert cost, and SmartScreen
  reputation accrues slowly regardless (only an EV cert clears it instantly). Consistent with
  ADR-0007's unsigned-alpha stance.
- **Accept the unsigned warning, document the one-time "Run anyway" click.** **Chosen.**

## Decision

### 1. Portable runtime (Phase 1)

- **Stick layout:** one launcher (`WingletReader.cmd`) at the drive root; the unpacked app
  under `\app\`; the real executable at `\app\WingletReader.exe`; the **marker file** beside
  that real executable; portable data under `\app\data\`; a `README` with the safe-eject note
  and the one-time SmartScreen step. Custom drive **label + icon** for polish (the only
  sanctioned use of `autorun.inf`).
- **Detection:** at startup, **before the `Database` is constructed**, the app resolves the
  real directory of its own executable (`process.execPath`) and checks for the marker file
  beside it. **Marker present → portable; absent → today's installed behaviour, unchanged.**
- **Path resolution:** in portable mode, redirect the **entire `userData` directory** (not
  just the JSON file) to `<dir-of-real-exe>\data` via `app.setPath('userData', …)` before the
  database opens. This sweeps the library JSON, the `fasttrack.transmute.*` localStorage,
  Electron caches, and logs onto the stick, so the host PC stays clean and the experience
  follows the user. The path is recomputed from the exe location every launch, so the
  changing drive letter is irrelevant. Frozen identifiers are unchanged — only the parent
  directory moves.
- **Updater off in portable mode.** The `electron-updater` startup check (`updater.ts`)
  patches an installed NSIS app and cannot sanely update a stick; it is skipped when the
  marker is present. Portable copies are refreshed by re-issuing a stick (later, by the
  Phase 2 creator).
- **Write safety:** rely on the existing atomic write (temp-file + rename), which is safe
  because the temp file lands on the same volume as the target once `userData` is on the
  stick. The residual yank-mid-write risk is addressed by a written safe-eject caution, not
  new machinery.
- **Single-instance lock left as-is.** A portable copy and an installed copy on the same PC
  may see each other as a second instance; documented as a known edge case, not engineered
  around for alpha.
- **Production:** a `npm run dist:portable` script assembles the ready-to-copy portable
  folder (unpacked app in `\app\`, launcher + README + cosmetic drive files at root, marker
  beside `\app\WingletReader.exe`). The first sticks are made by copying that folder; the
  in-app creator and installer mode use the same layout contract.

### 2. Eligible device

Windows 10/11 **x64**, USB mass storage permitted by the host, ~500 MB free, **no admin
required**. Out of scope: hard-locked corporate machines (AppLocker / "block executables
from removable drives" policy), and non-Windows hosts — a single stick cannot be cross-OS
because each platform needs distinct native binaries. The unsigned launcher triggers a
one-time-per-machine SmartScreen warning, documented for the user.

### 3. Provisioning front-ends (over the same core)

Beyond the maintainer-run `dist:portable` assembly (§1), two convenience front-ends now produce
a stick from the same layout contract. Both are thin wrappers — no new runtime concepts:

- **In-app creator** — a Settings → Data "Create Portable Drive" action: pick a drive/folder,
  run the assembly onto it, clone the current library JSON. For someone already running the app.
- **Installer "Portable to USB" mode** — a custom mode in the NSIS installer for someone who
  only has the downloaded `Setup.exe` and wants a stick **without installing to the host**. It
  **must deliberately skip all host registration** — no Add/Remove-Programs entry, no host
  registry writes, no shortcuts or uninstaller — and instead lay the run-in-place portable
  layout on the chosen removable drive. Otherwise it reintroduces the "installs stuff on the
  PC" problem portability exists to avoid. (Note: a normal install merely *pointed* at a USB
  path via `allowToChangeInstallationDirectory` is **not** portable — it still registers on the
  host, keeps data in `C:\Users`, and breaks on a drive-letter change.) From a fresh installer
  there is usually no library yet, so it lays down an empty portable layout; cloning an existing
  library only applies when run on a machine that already has one.

### 4. Scope

**In:** marker-gated full-`userData` redirect, run-in-place packaging, root launcher + cosmetic
drive icon/label, updater-off-when-portable, `dist:portable` assembly, Settings -> Data creator,
NSIS "Portable to USB" mode, and Windows-x64 eligibility. **Deferred:** code signing, cross-OS
sticks, any auto-on-insert launch, and engineering around the single-instance edge.

## Consequences

- **Near-zero risk to existing users.** The only runtime change is a small, marker-gated
  path redirect that runs before the database opens; with no marker, nothing changes. No
  data-layer rewrite, no import/reader changes — the rest is build tooling and docs.
- **Build sequencing.** No alpha gate: the maintainer widened the alpha invite timeline
  (2026-06-23), making the prior "build after the invite" gate moot. Implementation slices
  live in `.scratch/active/portable-usb/` (01–08); code is complete, with installer-mode
  real-machine HITL still required before relying on that path for testers.
- **Honest UX.** The product promise is "plug in → open drive → one click," not "plug in →
  it runs." Auto-launch is not deliverable without installing a host-side watcher, which the
  zero-install premise forbids.
- **Verification gate:** `npm run build` + `npm test`; do not increase the `tsc -b` baseline
  (**30** as of slice 07, 2026-06-23 — down from 104 because slice 07 wrapped the `interface
  Window` augmentation in env.d.ts in `declare global`, which removed all 78 untyped-`window.api`
  errors). On 2026-06-23, `npm.cmd run build`, `npm.cmd test`, `npm.cmd run dist:portable`,
  `npm.cmd run dist:win`, and `npx.cmd --yes fallow audit --base HEAD --format json --quiet --explain`
  passed in the implementation review. The portable path still needs completed real-machine
  sign-off for the installer mode, and portable-drive smoke evidence should keep recording
  actual machines/drive letters.
- **Frozen identifiers untouched.** `fasttrack-data.json`, `com.fasttrack.reader`, and the
  `fasttrack.transmute.*` keys keep their names; portable mode only relocates the `userData`
  parent directory.
- **Relationship to ADR-0007.** Consistent with the unsigned-alpha distribution stance;
  portable is an additional distribution shape, not a change to the installer/updater path
  for installed users.

## Notes

- Re-evaluate **code signing** alongside ADR-0007's note once there's an audience worth
  removing install friction for; an EV-signed launcher would also clear the portable
  SmartScreen warning.
- A future cross-OS stick (Win/Mac/Linux folders side-by-side, three launchers) is possible
  but is a separate, much larger effort and needs its own decision.
- Provenance: `grill-me` design session 2026-06-23.
