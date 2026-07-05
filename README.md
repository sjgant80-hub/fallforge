# FallForge

**The AI concierge that installs your business.**

FallForge is the installer agent for [FallHub](https://sjgant80-hub.github.io/fallhub/). Point it at your existing website. It scrapes your footprint, distils it into a grounding kernel, packages your FallHub instance with the right vertical template and recommended modules, pre-configures the LLM router, and hands you a working AI-first business OS. Twenty minutes.

**Live:** https://sjgant80-hub.github.io/fallforge/
**Publisher:** [AI-Native Solutions](https://www.ai-nativesolutions.com/)
**Licence:** MIT
**Seal:** `◊·κ=1`

---

## The five phases

1. **Discover** — fetch landing + up to 5 signal pages · extract text, links, socials · detect vertical via keyword fingerprinting
2. **Kernel distil** — LLM-driven population of the vertical's kernel schema · anti-hallucination `not_present` list · voice extraction
3. **Wire** — assemble ZIP with `kernel.json` + `bom.json` + `README.md` + `INSTALL.md` + module list · optional GitHub push
4. **Calibrate** — post-deploy autopilot tuning on the buyer's instance (via sim.html)
5. **Handoff** — final report · live URLs · autonomy dial defaults

## The five router blends

| Blend | Providers | Monthly £ |
|---|---|---|
| Full Frontier | Claude Opus 4.8 across all phases | £80–£300 |
| **80/20 (default)** | Claude reasoning · Groq Llama bulk | £20–£60 |
| 50/50 | Balanced | £8–£25 |
| Full Open | Groq Llama 3.3 70B | £4–£12 |
| Local only | WebLLM Llama 3.1 8B (browser) | £0 |

## Two install modes

- **Local (free)** — runs entirely in browser · BYOK · sovereign
- **Hosted (£29 one-off)** — Cloudflare Worker helps with CORS-blocked fetches, deeper crawls, GitHub push assist

## Repo structure

```
fallforge/
├── index.html                    # marketing landing
├── install.html                  # the concierge UI
├── how.html                      # 5-phase explainer
├── pricing.html                  # tiers
├── forge/
│   ├── forge.js                  # 5-phase orchestrator
│   ├── discover.js               # Phase 1
│   ├── verticals.js              # vertical fingerprinting
│   ├── kernel-distil.js          # Phase 2
│   ├── wire.js                   # Phase 3 (ZIP + GitHub push)
│   ├── router-config.js          # 5 router blends
│   └── adapter.js                # BYOK across 6 LLM providers
├── worker/
│   ├── worker.js                 # Cloudflare Worker (hosted mode)
│   └── wrangler.toml
├── assets/
│   ├── theme.css                 # shared FallHub aesthetic
│   └── nav.js                    # top nav injector
├── module.manifest.json          # FallForge as itself a marketplace module
└── docs/
    └── ARCHITECTURE.md
```

## Deploy the hosted worker

Ships with a `wrangler.toml` for Cloudflare Workers deployment:

```bash
cd worker
wrangler deploy
```

The worker endpoint URL is baked into `forge/discover.js` (fallback proxy). Update if you rename.

## Fork the vertical set

Vertical fingerprints live in `forge/verticals.js`. Adding a new vertical:

1. Add a new key to `FINGERPRINTS` with ~40 keywords
2. Add a matching kernel template in `forge/kernel-distil.js`
3. Add a distil prompt in same file
4. Add recommended modules in `forge/wire.js`
5. Test with a real business site

## Konomi doctrine

FallForge is part of the AI-Native Solutions estate. Konomi seal ◊·κ=1 applies. Every generated install carries provenance via the estate KCC ledger (optional per install).

## Related

- [FallHub](https://sjgant80-hub.github.io/fallhub/) — the substrate FallForge installs
- [Wishwood](https://sjgant80-hub.github.io/wishwood/) — the live hospitality reference
- [Roost](https://sjgant80-hub.github.io/roost/) — the hospitality showroom
- [FallColony](https://sjgant80-hub.github.io/fallcolony/) — agent marketplace + Foundry seed-generation chamber
- Module marketplace: https://sjgant80-hub.github.io/fallhub/modules.html

## Licence

MIT · Copyright © 2026 AI-Native Solutions.
