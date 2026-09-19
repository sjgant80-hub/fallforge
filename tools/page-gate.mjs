// page-gate.mjs — FallForge's page gate. A page IS the product here, so this checks the page for the
// real failure modes that have actually shipped in this estate, WITHOUT the false-positives that kept the
// old inline gate red for no reason (it parsed JSON-LD as JavaScript, and read href="${...}" inside a
// <script> template literal as a static dead link). Four checks:
//   1. every EXECUTABLE inline script parses            — a page that 404s its own JS is a dead app
//      (type="application/ld+json" / "application/json" / import-maps are DATA, not JS — skipped)
//   2. no unresolved __TEMPLATE__ placeholder is served — a generator that ran and did not finish
//   3. every same-repo href/src in the MARKUP resolves  — the dead-link class (scripts/styles stripped
//      first, so JS template literals and CSS url()s are not misread as links)
//   4. no obvious secret is committed                   — keys have leaked from pages before
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { Script } from 'node:vm';

const JS_TYPE = /^\s*(module|text\/javascript|application\/javascript|)\s*$/i;
const html = readdirSync('.').filter((f) => f.endsWith('.html'));
if (!html.length) { console.error('no HTML in this repo — nothing to serve'); process.exit(1); }
let fail = 0;

for (const f of html) {
  const s = readFileSync(f, 'utf8');

  // 1. executable inline scripts must parse (data scripts skipped).
  const blocks = [...s.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
  blocks.forEach((m, i) => {
    const attrs = m[1];
    if (/\bsrc=/.test(attrs)) return;                       // external — the file check covers it
    const tm = attrs.match(/\btype=["']([^"']*)["']/);
    if (tm && !JS_TYPE.test(tm[1])) return;                 // ld+json / json / importmap — data, not JS
    try { new Script(m[2].replace(/^\s*import\s.*$/gm, '').replace(/^\s*export\s/gm, '')); }
    catch (e) { if (!/await is only valid|Unexpected token 'export'|Cannot use import/.test(e.message)) { console.error(f + ' script[' + i + '] DOES NOT PARSE: ' + e.message); fail = 1; } }
  });

  // 2. unresolved placeholder.
  const ph = s.match(/__[A-Z][A-Z0-9_]*__/g);
  if (ph) { console.error(f + ' serves unresolved placeholders: ' + [...new Set(ph)].join(', ')); fail = 1; }

  // 3. same-repo dead links — scan the MARKUP only.
  const markup = s.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  for (const m of markup.matchAll(/(?:href|src)="(?!https?:|data:|mailto:|#|\/\/|\$\{)([^"?#]+)/g)) {
    const t = m[1].replace(/^\.\//, '');
    if (t && !existsSync(t)) { console.error(f + ' links to a file that is not here: ' + t); fail = 1; }
  }
}

// 4. committed secret (top-level served files).
for (const f of readdirSync('.')) {
  if (!/\.(html|js|mjs|json|md)$/.test(f)) continue;
  const s = readFileSync(f, 'utf8');
  const hit = s.match(/(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/);
  if (hit) { console.error(f + ' contains what looks like a live credential: ' + hit[1].slice(0, 12) + '…'); fail = 1; }
}

// 5. NO PRICING (Simon's standing rule: never, ever put pricing on the product) and
// 6. the Konomi credit MUST be present (every product carries it). Scan all served source, skip tools/.
const served = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = dir === '.' ? e.name : dir + '/' + e.name;
    if (e.isDirectory()) { if (!/^(\.git|node_modules|tools|\.github)$/.test(e.name)) walk(p); }
    else if (/\.(html|js|mjs)$/.test(e.name)) served.push(p);
  }
};
walk('.');
const PRICE = /£\s?\d|\bmonthly_gbp\b|\bpricing\b|\bpriceCurrency\b|"@type"\s*:\s*"Offer"|\/mo\b|\bper\s+(seat|month|year|node)\b|\b\d+\s?(GBP|USD)\b/i;
const KONOMI = 'powered by the Konomi architecture, created by Thomas Frumkin';
let konomi = false;
for (const p of served) {
  const s = readFileSync(p, 'utf8');
  const pm = s.match(PRICE);
  if (pm) { console.error(p + ' contains PRICING (rule: never put pricing on the product): "' + pm[0] + '"'); fail = 1; }
  if (s.includes(KONOMI)) konomi = true;
}
if (!konomi) { console.error('MISSING the Konomi credit — every product must carry: "' + KONOMI + '"'); fail = 1; }

if (fail) { console.error('\nPAGE GATE FAILED'); process.exit(1); }
console.log('page gate clean — ' + html.length + ' page(s): scripts parse, no placeholders, no dead links, no committed keys, NO PRICING, Konomi credit present');
