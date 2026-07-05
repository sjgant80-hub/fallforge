/* FallForge · Phase 2 · Kernel distillation
 * Turns raw evidence into a validated kernel.json for the picked vertical.
 * Uses the router's harvest route (Claude Opus 4.8 by default).
 */

import { chat } from './adapter.js';

const KERNEL_TEMPLATES = {
  hospitality: () => ({
    property: { name: null, type: null, sleeps: null, bedrooms: null, bathrooms: null,
      location: { address: null, region: null, country: 'GB' },
      amenities: [], not_present: [], quirks: [] },
    voice: { tone: 'warm', greeting_style: null, signature: null, banned_phrases: [] },
    policies: { check_in: null, check_out: null, min_nights: 1, max_nights: 21,
      cancellation: null, pets: 'on_request', children: 'yes', smoking: false,
      events_parties: false, quiet_hours: null, deposit_gbp: null, cleaning_fee_gbp: null },
    operations: { check_in_method: null, wifi: {}, arrival_instructions: null, checkout_instructions: null, faq: [] },
    market: { avg_nightly_gbp: null, occupancy_target: 0.7, seasonality: {} }
  }),
  trades: () => ({
    business: { name: null, trade: null, gas_safe: null, niceic: null,
      service_area: { centre: null, radius_miles: 15 },
      specialities: [], not_offered: [] },
    rates: { callout_gbp: null, hourly_gbp: null, emergency_multiplier: 1.5, minimum_charge_gbp: null },
    voice: { tone: 'plain-spoken', banned_phrases: [] },
    policies: { chase_cadence_days: [7, 14, 21], invoice_terms_days: 14, warranty_months: 12 },
    ops: { supplier_apis: [], van_stock: [] }
  }),
  adshop: () => ({
    agency: { name: null, disciplines: [] },
    clients: [],
    voice: { tone: 'considered', banned_phrases: [] },
    policies: { chase_cadence_days: [3, 7], milestone_terms_days: 30 },
    ops: { deliverable_channels: [] }
  }),
  accounting: () => ({
    practice: { name: null, aat_mip: null, acca_reg: null, pi_insurer: null },
    clients: [],
    voice: { tone: 'considered', banned_phrases: [] },
    policies: { chase_cadence_days: [7, 14], engagement_letter_template: null }
  }),
  barbershop: () => ({
    chain: { name: null, loyalty: { punch_card_size: 6, reward: null } },
    locations: [],
    services: [],
    voice: { tone: 'friendly-plain' }
  })
};

const DISTIL_PROMPTS = {
  hospitality: (name, text) => `You are the FallForge kernel-distil pass for a UK holiday-rental business named "${name}".

Read the raw website evidence below and extract EVERY fact you can into a hospitality kernel JSON.

CRITICAL:
- Populate not_present with items commonly asked about but NOT present (e.g. "hot tub" if not mentioned, "swimming pool" if not mentioned). This prevents future hallucination.
- Extract voice tone + banned_phrases from any review responses or reply style hints.
- If a field is not mentioned, leave as null · do NOT invent.

Return ONLY the JSON object, no commentary. Match this schema (populate what you can):

${JSON.stringify(KERNEL_TEMPLATES.hospitality(), null, 2)}

RAW EVIDENCE:
${text.slice(0, 40000)}`,

  trades: (name, text) => `You are the FallForge kernel-distil pass for a UK trades business named "${name}".

Extract every fact into a trades kernel JSON. Populate not_offered with services commonly-asked-about but NOT offered.

Return ONLY the JSON. Schema:

${JSON.stringify(KERNEL_TEMPLATES.trades(), null, 2)}

RAW EVIDENCE:
${text.slice(0, 40000)}`,

  adshop: (name, text) => `You are the FallForge kernel-distil pass for an ad-firm/creative-agency named "${name}".

Extract every fact into an ad-shop kernel JSON. If clients are named in case studies, list them.

Return ONLY the JSON. Schema:

${JSON.stringify(KERNEL_TEMPLATES.adshop(), null, 2)}

RAW EVIDENCE:
${text.slice(0, 40000)}`,

  accounting: (name, text) => `You are the FallForge kernel-distil pass for a UK accounting practice named "${name}".

Extract every fact into an accounting kernel JSON. Look for AAT / ACCA / ICAEW membership numbers and PII insurance references.

Return ONLY the JSON. Schema:

${JSON.stringify(KERNEL_TEMPLATES.accounting(), null, 2)}

RAW EVIDENCE:
${text.slice(0, 40000)}`,

  barbershop: (name, text) => `You are the FallForge kernel-distil pass for a UK barbershop (single or chain) named "${name}".

Extract every fact into a barbershop-chain kernel JSON. If multiple locations mentioned, populate each.

Return ONLY the JSON. Schema:

${JSON.stringify(KERNEL_TEMPLATES.barbershop(), null, 2)}

RAW EVIDENCE:
${text.slice(0, 40000)}`
};

export async function distilKernel({ evidence, verticalKey, businessName, route, key, log = () => {} }) {
  if (!KERNEL_TEMPLATES[verticalKey]) throw new Error('unknown vertical: ' + verticalKey);
  const template = KERNEL_TEMPLATES[verticalKey]();
  const prompt = DISTIL_PROMPTS[verticalKey](businessName || 'the business', evidence.text || '');

  log('kernel', `Distilling kernel via ${route.provider}:${route.model || 'default'}…`);

  const r = await chat({
    provider: route.provider,
    model: route.model,
    key,
    messages: [{ role: 'user', content: prompt }],
    system: 'You return strict JSON only. No prose, no code fences, no explanations.'
  });

  const j = _extractJson(r.text) || {};
  const merged = _mergeDeep(template, j);

  merged.meta = {
    kernel_version: '0.1.0',
    forged_at: new Date().toISOString(),
    forged_by: 'FallForge v1.0.0',
    vertical: verticalKey,
    source_url: evidence.url,
    sources: ['landing', ...evidence.links.slice(0, 5).map(l => l)],
    signature: null
  };

  log('kernel', `Kernel distilled · ${Object.keys(merged).length} top-level sections`, 'ok');
  return merged;
}

function _extractJson(text) {
  if (!text) return null;
  const m = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[1] || m[0]); } catch { return null; }
}

function _mergeDeep(target, source) {
  if (!source || typeof source !== 'object') return target;
  for (const k of Object.keys(source)) {
    if (source[k] === null || source[k] === undefined) continue;
    if (Array.isArray(source[k])) {
      target[k] = source[k];
    } else if (typeof source[k] === 'object') {
      target[k] = target[k] || {};
      _mergeDeep(target[k], source[k]);
    } else {
      target[k] = source[k];
    }
  }
  return target;
}
