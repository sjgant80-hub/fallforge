# FallForge — design note

Status: Accepted
Version: 1.0.0
Scope: the five-phase concierge install pipeline and its network-free core.

## Problem

A new buyer arrives with nothing but a public website. To stand up a working
FallHub instance for them we need three things they cannot supply by hand:

1. which **vertical** their business is (the template and module set differ);
2. a grounding **kernel** — the facts an assistant must never get wrong;
3. a **router** configuration that trades cost against quality across LLM
   providers, using the buyer's own keys (BYOK).

FallForge produces all three from a URL and a name, then hands back a
deployable bundle.

## Pipeline

The orchestrator (`forge/forge.js`) runs five phases and reports progress
through an `onPhase` callback so a browser UI can render a live bar:

```
DISCOVER → KERNEL → WIRE → CALIBRATE → HANDOFF
```

| Phase     | Module                    | Nature            |
|-----------|---------------------------|-------------------|
| discover  | `forge/discover.js`       | network (fetch)   |
| kernel    | `forge/kernel-distil.js`  | network (LLM)     |
| wire      | `forge/wire.js`           | pure + optional push |
| calibrate | (buyer instance, post-install) | deferred     |
| handoff   | `forge/wire.js` (zip/push)| network (optional)|

## Deterministic core

Three units are pure functions of their inputs and reach no network. They are
the contract this repository tests directly:

### 1. Vertical fingerprinting — `forge/verticals.js`

`detectVertical(text)` lower-cases the discovered footprint and scores it
against five keyword fingerprints (hospitality, trades, adshop, accounting,
barbershop). Matching is **word-boundary anchored**: `book` scores for
hospitality but `booking` does not, so a booking-widget URL does not inflate
the score. It returns a ranked list plus a `confident` flag, which is true only
when the leading vertical holds at least 35% of total hits **and** at least four
absolute hits. Below that the caller is expected to ask the buyer to confirm,
rather than guess.

### 2. Router blends — `forge/router-config.js`

Five named blends span the cost/quality curve, from `fullFrontier` (every phase
on a frontier model) down to `local` (every phase in-browser via WebLLM, zero
marginal cost). `eighty20` is the flagged default: frontier models for
reasoning-heavy phases, open-weight models for bulk. `serialiseForKernel`
folds the chosen blend and the buyer's keys into a `router` envelope that the
wire phase embeds in the kernel.

### 3. Install assembly — `forge/wire.js`

`packageInstall` is a pure builder: given a kernel, a vertical and a blend key,
it emits a fixed five-file bundle (`kernel.json`, `bom.json`, `README.md`,
`INSTALL.md`, `modules-to-install.txt`), merges the router envelope into the
kernel without dropping existing fields, and selects a recommended module set
per vertical. Unknown vertical falls back to the `botler`-only set; unknown
blend key falls back to `eighty20`. No file I/O and no network happen until the
separate `zipFiles`/`pushToGitHub` steps are invoked.

The BYOK adapter (`forge/adapter.js`) exposes `SUPPORTED_PROVIDERS`; every
provider named by any blend route must appear in that list — a cross-check the
test suite asserts.

## Testing boundary

`test.mjs` covers the three pure units and the provider registry above. The
network-bound phases — `discover`, `distilKernel`, `chat` — are deliberately
out of scope for unit tests: their behaviour depends on live sites and live
provider responses and belongs to integration testing. The rule the suite
follows is that every assertion is derived from an observed return value, never
from a restatement of the implementation.

## Invariants

- Keys never leave the browser; the adapter posts directly to each provider.
- The wire phase is deterministic apart from the `forged_at` timestamp.
- Adding a vertical means adding a fingerprint, a kernel template and a
  recommended module list — three edits, one per concern, no regeneration.
