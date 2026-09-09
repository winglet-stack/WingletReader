# ADR-0029: First official alpha snapshot — packaging, reproducibility, and hardening

**Date:** 2026-07-16
**Status:** Accepted
**Relates to:** ADR-0007 (local-first / no data leaves device — unchanged), ADR-0008 (unified settings handler — the `logo_style` removal relies on unknown-key tolerance), ADR-0016 (portable mode + frozen `fasttrack` identifiers — this ADR *defers* the rename rather than superseding the freeze), ADR-0022 (DisplayKit visual layer — the UI kit being frozen).

## Context

WingletReader has shipped several **private** test builds (`0.1.0-alpha.2/3`, `0.1.1-alpha.1`, `0.1.2-alpha.1`) with no git tags and no CI. The goal now is to cut the **first official public alpha** as a reproducible, hardened snapshot that jump-starts the project as a **build-in-public** effort, and to make the public repo production-ready.

The overriding intent: **every user builds the same program** (determinism), **the current UI kit is hard-wired** (one canonical look), and **the snapshot is the authoritative source of truth** (tagged, CI-built). Before publishing, harden from every reasonable angle for an alpha.

Key facts at decision time:
- Public repo (`winglet-stack/WingletReader`) is a **single orphan snapshot commit** (`cc0ad15`), disconnected from the 372-commit dev history. Installers publish to a third repo, `WingletReader-Releases`, via `electron-updater`.
- Toolchain unpinned (no `engines`, no `.nvmrc`); lockfile committed. Electron **28** (EOL). Test suite: **4 UI-drift failures / 1710 passing**.
- Electron security already largely hardened: `contextIsolation: true`, `nodeIntegration` off, `setWindowOpenHandler → deny` on every window, strict CSP.
- A **proprietary Monotype font** is committed and bundled — a redistribution risk in a public repo. It is only the `--font-serif` option and degrades to the system font.
- `fasttrack` identifiers (`appId`/AUMID `com.fasttrack.reader`, data filename `fasttrack-data.json`, `fasttrack.transmute.*` keys) are **frozen** per CONTEXT.md / ADR-0016. Audit confirms none are user-visible: the entire user-facing brand is already "WingletReader" (window title, Start menu, `%APPDATA%\WingletReader`, `wingletreader-export-*.json`). The only reachable leak is the data *filename*, seen only if a user opens the AppData folder.
- `updaterCore.ts` already sets `allowPrerelease = true`, so prerelease auto-update works.

## Considered options & decisions

**Versioning scheme (reproducible release identity):**
- **`0.2.0-alpha.1`, freeze major.minor + increment only `-alpha.N` — chosen.** A clean minor boundary above every private `0.1.x` build; strictly newer, so existing testers auto-update forward. Graduate via `-beta.N` → `0.2.0`. First-ever git tag `v0.2.0-alpha.1`.
- *Reset to `0.1.0-alpha.1`* — rejected: lower than builds testers already have; `electron-updater` would not offer it (downgrade blocked).
- *Keep `0.1.2-alpha.1`* — rejected: blurs the official/private boundary; keeps the noisy patch-churn habit.

**Build pipeline (the reproducibility guarantee):**
- **GitHub Actions on the *public* repo, triggered by `v*` tag — chosen.** `npm ci` → `npm test` (blocking) → `dist:win` → publish installer to `WingletReader-Releases`. A clean, pinned CI environment is what makes "every user builds the same program" *true*; the local `dist:win` becomes a dev convenience, not the source of truth. Cross-repo publish token is a public-repo secret.

**Code signing:**
- **Unsigned + documented — chosen.** Ship unsigned; document the SmartScreen "More info → Run anyway" step in README + release notes. Defer a cert to beta. Alpha adopters tolerate it; a cert is premature spend while the product is still settling.

**Proprietary font:**
- **Remove + fall back to system serif — chosen.** Delete the bundled font and webfont declaration; `--font-serif` falls back to system Times New Roman → Liberation Serif. Zero visual delta on Windows, removes the redistribution risk, shrinks the bundle. Gone from the fresh snapshot's history automatically.

**Public history:**
- **Fresh clean orphan snapshot, force-replace `cc0ad15` — chosen.** Because public history is already a disposable single snapshot, no `git filter-repo` surgery is needed: build a hardened, font-free snapshot and force-push; the licensed font never exists in the new public history. Tag there.

**Test gate:**
- **Fix the 4 drifted tests; green is a hard CI gate — chosen.** The failures are SessionDialog + settings-panel *test drift*, not product bugs. A "production-ready" snapshot ships 100% green; CI blocks any tag that regresses.

**Electron runtime:**
- **Upgrade to current stable, keep the suite green — chosen.** Electron 28 is EOL (unpatched Chromium/V8). Exposure is narrow (local-first, strict CSP, no remote content, no native addons), but a public "hardened" repo pinning an EOL runtime is a credibility hit. Bounded upgrade with the 1714-test suite as the safety net. **Fallback:** if it destabilizes, pin Electron + add a `SECURITY.md` note + a tracked upgrade-before-beta issue.

**Runtime resilience (serves "alpha for feedback"):**
- **Full trio — chosen.** (1) Top-level React ErrorBoundary with a reload + "where the log is" screen; (2) main-process `uncaughtException`/`unhandledRejection` → `electron-log` file; (3) corrupt-store recovery (parse failure on load → back up `.corrupt` + reseed instead of crash-looping). Atomic store writes already exist.

**Repo posture (build-in-public):**
- **Discussions + Issues + public roadmap; PRs closed for alpha — chosen.** Discussions (Ideas / Q&A / Announcements) is the home for *user recommendations*; Issues (templated) for bugs; a public roadmap signals build-in-public. Add `CONTRIBUTING.md`, `SECURITY.md`, lightweight `CODE_OF_CONDUCT.md`. **Code PRs stay closed during alpha** — the source-available (non-OSS) license has no standard inbound=outbound grant, so unsolicited PRs create IP ambiguity while the codebase churns. Open PRs later, deliberately.

**App identity (`fasttrack` freeze):**
- **Keep all identifiers frozen for alpha; defer the full rename — chosen.** The payoff is *invisible to users* (verified above), and the data-filename rename is the load-bearing identifier requiring a migration. Timing note: an `appId` change is cheapest at the smallest install base (now) and *most* expensive at beta (more users + signing reputation begins) — so "postpone to beta" is the one dominated option. The decision is therefore "permanent vs. now," resolved as: **defer the complete `fasttrack → WingletReader` rename to its own dedicated, tested data-migration pass**, not bolted onto this stability-for-feedback snapshot.

**UI kit / "freeze the look":**
- **Remove the `logo_style` toggle; hard-wire the canonical (`'modern'`) logo — chosen.** Users switch **theme (light/dark) only**, not logo style. This is the concrete "hard-wire the UI kit" action. The classic variant + `logo_style` setting are removed across schema, `AppShell`/`useAppShellEffects`, `Reader.tsx`, `StageOverlays.tsx`, CSS, assets, and tests. Existing users keep a harmless orphan `logo_style` key (ADR-0008 ignores unknown keys). Keep custom reader palettes and dark/light theming — those are legitimate features, not UI-kit variance.

## Decision (summary)

Cut **`WingletReader 0.2.0-alpha.1`** as the first official public alpha: reproducible (pinned toolchain, `npm ci`, CI-built on tag), hard-wired UI kit (canonical logo, no `logo_style`), font-free, on a supported Electron, with the resilience trio, published as a fresh force-replaced public snapshot tagged `v0.2.0-alpha.1`, into a build-in-public repo (Discussions + Issues + roadmap, PRs closed). `fasttrack` identifiers stay frozen; the full rename is deferred.

## Consequences

- **Positive:** authoritative, reproducible snapshot; no proprietary-font exposure; supported runtime; graceful failure + crash logs for tester feedback; one canonical look; clean public jump-start with a real feedback channel.
- **Costs / follow-ups:** existing private testers on a would-be new `appId` are unaffected (identity frozen → in-place upgrade). A **deferred full-rename migration** is now owed (own ADR + slice). Electron upgrade may surface breakage → fallback path defined. Unsigned installer → SmartScreen friction, documented. `pdf-parse@1.1.1` is ancient/unmaintained — noted, replacement deferred (touches the import path + tests).
- **Execution:** tracked as the drip-fed AH-1..AH-10 cascade in `.scratch/active/alpha-hardening/issues/`.

## Amendment — 2026-07-16: unhandledRejection is logged, not fatal

The resilience trio's item (2) decided only *"main-process `uncaughtException` / `unhandledRejection` → `electron-log` file"* — log to file. It never decided on termination. The AH-4 implementation went beyond the decision text and added `process.exit(1)` to **both** handlers. Combined with the updater's unowned detached `downloadPromise` (slice `01`), a stray rejection at startup **silently killed the app** mid-session.

The trio now **logs and continues** on `unhandledRejection`, terminating only on `uncaughtException`. The asymmetry is deliberate: the JSON store is durable per-mutation (`database.ts` writes tmp-then-rename atomically on every `save()`), so fail-fast on a stray rejection protects nothing, while killing an alpha tester's session costs the feedback the alpha exists to collect. After an `uncaughtException`, main's state genuinely is unknown, so `terminate(1)` stays. This **restores** item (2)'s original intent rather than reversing it.

## Amendment — 2026-08-20: release targets use ordinary SemVer precedence

The first public-alpha decision froze `0.2.0` and incremented only `alpha.N`.
That rule served the initial hardening cycle, but it is not a permanent naming
constraint. Starting with the next converged snapshot, release identity follows
ordinary Semantic Versioning across every surface: package version
`0.2.1-alpha`, tag `v0.2.1-alpha`, release title
`WingletReader 0.2.1-alpha`, and generated installer
`WingletReader-0.2.1-alpha-Setup.exe`.

The product name is presentation, not part of the machine version. A further
prerelease of the same `0.2.1` target appends an ordered identifier
(`0.2.1-alpha.1`, then `.2`); advancing channel uses `beta.1` or `rc.1`, and the
stable build removes the suffix. Published version contents remain immutable.
The full operational convention lives in `docs/RELEASE.md`.
