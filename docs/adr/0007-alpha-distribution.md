# ADR-0007: Alpha distribution — electron-builder + electron-updater, unsigned, no telemetry

**Date:** 2026-06-11
**Status:** Accepted direction — partially implemented

## Context

WingletReader is moving from dev-run-only to an early **alpha** whose purpose is to garner feedback on the software itself. As of this decision the repo has *zero* distribution groundwork: no electron-builder/forge config, no auto-update, no crash/feedback channel. The README's "Installation" section is `npm install` → `npm run dev` — i.e. the app cannot be handed to a non-developer.

Implementation status as of 2026-06-17: this ADR is **partially shipped**. Pass 1 added `electron-builder` and a Windows NSIS `.exe` package config. Pass 2 issue 06 wired `electron-updater` plus GitHub `build.publish` for the public binary-only repo; the maintainer alpha.1 -> alpha.2 packaged dry-run is GREEN. Pass 2 issue 08 packaged smoke is also GREEN. In-app feedback is not implemented yet, so the feedback carve-out remains future work.

Three forces shape the choice:

1. **Alpha cadence.** An alpha means frequent builds. Testers running stale builds produce feedback against bugs already fixed, so getting everyone onto the latest build automatically is the enabling capability, not a polish item.
2. **Local-first identity (CONTEXT.md, ADR-0001).** The app is defined as local-first and "runs fully offline." Automatic telemetry / crash reporting sends user data off-device and directly contradicts that promise.
3. **Cost and time.** Code-signing certificates (OV/EV) cost money and setup effort, and SmartScreen reputation accrues slowly regardless. Spending that before knowing anyone wants the app is premature.

## Decision

When the alpha distribution slice is implemented, ship it with:

- **Packaging:** `electron-builder`, NSIS installer (`.exe`), app icon, Windows 10/11 target.
- **Auto-update:** `electron-updater` pulling from **GitHub Releases**. Every tester auto-updates to the latest build after this slice ships.
- **Unsigned binaries** for the alpha. Document the Windows SmartScreen "more info → run anyway" click-through for testers rather than buying a cert.
- **No automatic telemetry.** Feedback is **user-initiated**: an in-app "Send feedback" action (prefilled GitHub issue / email) plus a rotating local log file the user can attach. No crash reporter, no analytics, no opt-in network sink.

## Rationale

Auto-update is the single capability that makes an alpha worth running, so it is non-negotiable; GitHub Releases is the zero-infrastructure host that fits a solo/early project. Unsigned is acceptable because the only cost is a one-time SmartScreen warning, documented away, versus a recurring cert spend with no validated audience.

Keeping feedback user-initiated preserves the local-first promise intact for *data* — nothing leaves the device without an explicit user action — while still producing actionable reports. This was chosen over **opt-in crash reporting** (rejected for alpha: forces writing consent/privacy copy and introduces an off-device data path before there's evidence it's needed) and over **nothing structured** (rejected: yields vibes, not reproducible reports, and no crash visibility).

"Offline" is consequently redefined in CONTEXT.md to mean *no data leaves the device*. The two accepted future carve-outs are the auto-update check (outbound, no user data) and user-initiated feedback. They must not be documented as current behavior until implemented.

## Consequences

**Positive**
- Once implemented, testers install a real app and stay current automatically; fixes reach everyone within an update cycle.
- Local-first promise stays truthful: no silent data egress.
- No cert spend or consent-copy work blocks the alpha.

**Negative**
- Unsigned installs trigger SmartScreen friction; some testers will bounce at the warning.
- Feedback signal depends on testers acting — quieter than automatic crash capture.
- An update check is now a recurring outbound call; the "internet only during first install" framing no longer holds and must be stated as such.

## Notes

This ADR covers the **alpha** only. Re-evaluate before a wider/beta release:

- **Code signing** becomes worthwhile once there's an audience worth removing install friction for.
- **Opt-in crash reporting** may be reconsidered, but only behind explicit consent and a documented exception to the local-first promise — it must not be added silently. Re-introducing telemetry without an ADR is the failure mode this note exists to prevent.
- The update host (GitHub Releases) is a convenience, not a commitment; a dedicated channel can replace it without changing the local-first stance.
