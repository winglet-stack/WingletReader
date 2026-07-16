# ADR-0002: Preset-based settings UI over granular controls

**Date:** 2026-06-09  
**Status:** Superseded for UI by ADR-0008; retained for schema/validation context

## Context

The original settings panel exposed a slider or numeric input for every configurable parameter (BPM, words_per_stack, font_size, lines_count, etc.). This created two problems:

1. **Option overload** — most users want to read faster or slower, not tune eight independent dials.
2. **Inconsistent combinations** — arbitrary slider values could produce settings that looked or felt broken (e.g. very high BPM with very high words_per_stack).

## Decision

This was the original decision: replace granular controls with a **preset-based UI**: a small set of named options (three named presets + a Custom option) that map to validated parameter bundles. The Custom option exposes the full granular controls for users who need them.

The settings code layer (schema, validation, persistence) is unchanged; presets are a UI concern only. `parseSettings()` still accepts and validates arbitrary values.

This UI direction is no longer active. ADR-0008 supersedes it with the shipped wave-1 Settings model: a panel-local mode chip row (**Global · Standard Reader · Read While Working**) plus a **Simplified / Advanced** density switch. Simplified mode uses shared triplets; Advanced mode exposes raw controls, full Reader **Profiles**, and **Palettes**. Do not add new per-dimension preset UI from this ADR.

## Consequences

**Positive**
- Lower cognitive load for new users
- Preset bundles are tuned combinations; fewer degenerate states
- Settings panel UI is substantially simpler to render and maintain

**Negative**
- Advanced users must explicitly opt into Custom to adjust individual parameters
- Adding a new named preset requires a product decision, not just a code change

## Related

- ADR-0008 records the superseding Settings handler and UI model.
- The settings schema consolidation (single `DEFAULT_SETTINGS` constant, `parseSettings()` function in `src/shared/`) is a separate concern documented in the architecture deepening PRD at `docs/prd-architecture-deepening.md`.
