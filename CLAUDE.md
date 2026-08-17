# CLAUDE.md — working notes for agents

FallForge is a sovereign, single-file-style browser tool: it turns a business
URL into a deployable FallHub install. It ships as source, runs client-side,
and keeps the buyer's API keys in the browser (BYOK).

## Layout

- `forge/forge.js` — orchestrator; runs the five phases end to end.
- `forge/discover.js` — Phase 1; fetches the public footprint (network).
- `forge/kernel-distil.js` — Phase 2; distils a kernel via an LLM (network).
- `forge/wire.js` — Phase 3; assembles the install bundle (pure) and, on
  request, zips or pushes it (network).
- `forge/router-config.js` — the five LLM blends and their per-phase routes.
- `forge/verticals.js` — keyword fingerprints + `detectVertical`.
- `forge/adapter.js` — thin BYOK adapter across six providers.
- `worker/worker.js` — optional Cloudflare Worker for hosted mode.
- `*.html` — the static UI surfaces (install/how/pricing).

## Running the tests

```
npm test          # === node test.mjs
```

`test.mjs` uses only the Node built-in test runner and `node:assert`; there are
no third-party dependencies to install.

## Ground rules for changes

- **Do not weaken a test to make it pass.** If the code changed, update the
  assertion to the new *observed* output; if a test reveals a real defect, fix
  the code, not the test.
- **Only the pure units are unit-tested** — `detectVertical`, the blend config
  and `serialiseForKernel`, `packageInstall`, and `SUPPORTED_PROVIDERS`. The
  network-bound phases (`discover`, `distilKernel`, `chat`) are integration
  concerns and are intentionally not covered here. Do not add fake network
  stubs that assert on hard-coded responses.
- **Adding a vertical** is three coordinated edits: a fingerprint in
  `forge/verticals.js`, a kernel template in `forge/kernel-distil.js`, and a
  recommended module list in `forge/wire.js`. Keep them in step.
- Keys are secrets: never log them, never route them through a server.

See the design note in SPEC.md for the phase model and the testing boundary.
