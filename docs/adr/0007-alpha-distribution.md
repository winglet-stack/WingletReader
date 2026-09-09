# ADR-0007: Alpha distribution — electron-builder + electron-updater, unsigned, no telemetry

> Signing note: the unsigned decision is unchanged, but its scope, accepted costs, and the trigger that ends it were recorded on 2026-09-09 — see the amendment at the end of this record.

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

---

## Amendment — 2026-09-09: code signing is deferred with an explicit trigger

**Status:** Accepted. The Decision above is unchanged — the alpha still ships
unsigned. What this amendment adds is the part that was never written down: the
*scope* that makes unsigned acceptable, the costs being accepted, the condition
that ends the deferral, and the route to take when it does. Shipping unsigned is
a reasonable call; shipping unsigned without recording it as a call is how it
becomes the status quo by default through a public launch.

### Decision

**Ship the `0.2.1-alpha` line unsigned.** `package.json`'s `build` block carries
no `certificateFile`, no `sign`, and no signing configuration of any kind, and
that stays true for this release.

### Scope that makes it acceptable

The alpha is an **unadvertised, invite-only prerelease** handed to people the
maintainer knows personally — on the order of 5–10 testers who receive the
release link directly. The binary-only Releases repo is public in the sense that
its URLs resolve, but it is not linked, announced, or indexed as a download for
strangers. Unsigned is a defensible trade **only inside that scope**; the moment
the scope widens, the trade no longer holds.

### Accepted costs

Stated plainly, because each one is real and each one is being accepted rather
than solved:

- **SmartScreen on every install.** Each tester sees *"Windows protected your
  PC"* and must click **More info → Run anyway**. A fresh, reputation-less
  binary gets the aggressive variant of that prompt, and reputation accrues per
  binary — every new alpha build starts over. Some testers will bounce here.
- **No updater publisher verification.** `electron-updater` skips publisher
  verification on unsigned packages, so the auto-update path testers are now on
  carries no authenticity check. Update integrity rests on GitHub Releases and
  TLS, not on a signature the app itself validates.
- **Managed machines may block outright.** Corporate/school devices under
  SmartScreen or AppLocker policy can refuse an unsigned installer with no
  click-through at all. Those testers are simply unreachable until signing
  lands; the answer is *not* to have them weaken their machine's protections.

Mitigation for this scope, and the only one offered: the maintainer publishes
the installer's **SHA-256** with each release and testers verify it before
running (`.internal/docs/alpha/ALPHA_TESTERS.md`). A matching hash proves the
file is byte-identical to what the maintainer published. It proves nothing about
whether the publisher is trustworthy — it is an integrity check, not an identity
check, and the tester guide says so in those terms.

### Trigger

> **Signing is required before any public or link-shared distribution — that
> is, before the Releases repo stops being unadvertised.**

Concretely, the deferral ends the first time any of these is true: the download
is linked from the marketing site or a README aimed at strangers, the release is
announced anywhere public, the repo is advertised or listed for discovery, or
the build is handed to anyone outside the invited circle. Widening the audience
without signing first is the failure mode this trigger exists to prevent; it is
not a "when convenient" item.

### Likely route when the trigger fires

Recorded now so the decision does not have to be re-researched from scratch:

- **Azure Trusted Signing — the expected choice.** Roughly **$10/month**, and
  **natively supported by `electron-builder`** (no custom `sign` hook), so the
  change is configuration plus a signing identity rather than a build-pipeline
  rewrite. It issues short-lived certificates from a Microsoft-managed CA, which
  suits a solo maintainer with no HSM. Eligibility requires an identity-verified
  Azure account and, for organization identity, a legal entity with a
  verifiable history — check that gate *before* assuming this route is open.
- **OV certificate** — traditional route, usually a few hundred dollars a year,
  and it does **not** grant instant SmartScreen reputation: reputation still
  accrues per signed publisher over downloads and time.
- **EV certificate** — the more expensive route (hardware token or cloud HSM)
  that historically carried immediate SmartScreen reputation.
- **Validation lead time is the scheduling risk, not the money.** Identity /
  organization validation for any of these takes days to weeks. Start the
  process before the release that needs it, not during it.

### Non-goals

Explicitly out of scope for this amendment, on one shared rationale: **this
records a deferral and its exit condition — it does not begin the work.**

- **Acquiring or configuring a certificate.** No account is opened, no identity
  validation is started, and no signing identity exists yet.
- **Any change to `package.json`'s `build` block or the release workflow.** The
  signing configuration lands with the work the trigger unblocks, not here.
- **macOS notarization and Linux packaging.** Windows 10/11 remains the only
  target (see the Decision above); other platforms' signing stories are not
  considered.
- **Reputation shortcuts.** No advice — to testers or in ops docs — to disable
  SmartScreen, add Defender exclusions, or otherwise weaken a machine's
  protections. The supported path is verify the hash, then click through.
