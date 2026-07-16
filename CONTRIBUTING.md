# Contributing to WingletReader

Thanks for taking an interest. WingletReader is being built **in public** during
its alpha, and feedback from people who actually use it is the most valuable
thing you can offer right now.

This page explains where to put each kind of contribution.

## TL;DR

| You want to… | Go to |
| --- | --- |
| Suggest a feature, share an idea, or ask "why does it work this way?" | **[Discussions → Ideas](https://github.com/winglet-stack/WingletReader/discussions/categories/ideas)** |
| Ask a question or get help | **[Discussions → Q&A](https://github.com/winglet-stack/WingletReader/discussions/categories/q-a)** |
| Report a bug | **[Issues → New bug report](https://github.com/winglet-stack/WingletReader/issues/new/choose)** |
| Report a security vulnerability | **[SECURITY.md](SECURITY.md)** (private — do **not** open a public issue) |
| Submit a code change | Please **don't** during alpha — see below |

## Ideas & recommendations → Discussions

Anything that isn't a concrete, reproducible bug belongs in
[**Discussions**](https://github.com/winglet-stack/WingletReader/discussions):
feature requests, "it would be nice if…", questions about the reading model,
workflow friction, or design opinions. This keeps the Issues tracker a clean,
actionable list of things that are actually broken.

Browse first — someone may already have started the same thread, and adding your
voice to an existing one carries more weight than a new post.

## Bugs → Issues

If something is **broken** — a crash, wrong output, a control that doesn't do
what it says — open an [Issue](https://github.com/winglet-stack/WingletReader/issues/new/choose).
The bug-report template asks for what makes a report actionable:

- **App version** — shown in the app, or the installer filename
  (e.g. `0.2.0-alpha.1`).
- **OS** — Windows version (alpha ships Windows-only).
- **Steps to reproduce** — the exact sequence, from a fresh start if possible.
- **Expected vs. actual** — what you thought would happen, and what did.
- **Log file** — WingletReader writes a crash/error log you can attach. On
  Windows it lives at:

  ```
  %APPDATA%\wingletreader\logs\main.log
  ```

  (Paste the tail of the file, or attach it. It contains no personal data
  beyond file paths.)

A good bug report is one someone else can follow step-by-step and see the same
failure.

## Code contributions → not during alpha

**WingletReader is not accepting code pull requests during the alpha.** PRs will
be closed unmerged. This isn't a comment on your work — it's a deliberate posture
for this phase:

- **The license is source-available, not open-source.** It has no standard
  inbound-equals-outbound grant, so an unsolicited PR creates ownership and
  licensing ambiguity for both of us. See [LICENSE](LICENSE).
- **The codebase is churning.** The internals are being reshaped week to week
  during hardening; a patch written today may not have anywhere to land tomorrow.

Code contribution will open up **deliberately**, later, once the license and the
architecture are settled. Until then, the highest-leverage thing you can do is
**use the app and tell us what breaks or annoys you** — that shapes the product
far more than a patch would right now.

## Code of Conduct

Participation is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). Be kind;
assume good faith.
