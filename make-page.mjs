#!/usr/bin/env node
// make-page.mjs — the page fixpoint: every page listed below runs the SAME hub kernel the witness
// gates, by inlining kernel.mjs between the two markers in each. CI runs this and then
// `git diff --exit-code chain.html compliance.html`: if a shipped page's logic ever drifts from the
// gated kernel, the build goes red. One kernel, gated once, is the live logic in every surface — no
// second hand-typed copy to rot.
import { readFileSync, writeFileSync } from 'node:fs';
const PAGES = ['chain.html', 'compliance.html'];
const kernel = readFileSync(new URL('./kernel.mjs', import.meta.url), 'utf8')
  .replace(/^export /gm, '').replace(/\r\n/g, '\n').trimEnd();
const BEGIN = '// ⟦KERNEL-BEGIN⟧ generated from kernel.mjs by make-page.mjs — do not edit here';
const END = '// ⟦KERNEL-END⟧';
let fail = false;
for (const name of PAGES) {
  const page = readFileSync(new URL('./' + name, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const a = page.indexOf(BEGIN), b = page.indexOf(END);
  if (a === -1 || b === -1 || b < a) { console.error('markers missing in ' + name); fail = true; continue; }
  writeFileSync(new URL('./' + name, import.meta.url), page.slice(0, a + BEGIN.length) + '\n' + kernel + '\n' + page.slice(b));
  console.log(name + ': kernel injected, ' + kernel.length + ' chars');
}
if (fail) process.exit(1);
