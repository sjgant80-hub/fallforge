import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REACH, sha256, canon,
  provenanceChain, provenanceReceipt, provenanceSignable, verifyProvenanceReceipt,
  BALANCE_MIN, AGREE_MIN, coupleHealth, makeMeshLimb, borrowLimb,
  RISK_TIERS, riskSelfCheck, CHECKLIST, compliancePosture, compliancePostureReceipt, verifyCompliancePostureReceipt,
} from './kernel.mjs';

const H = (s) => sha256(s).hash;
const manifest = { hash: H('manifest-1') };
const listing = { manifestHash: H('manifest-1'), node: 'triage-1b' };

test('provenanceChain: intact at "shelved" when only mint->catalogue is supplied', () => {
  const r = provenanceChain({ node: 'triage-1b', manifest, listing });
  assert.equal(r.ok, true);
  assert.equal(r.intact, true);
  assert.equal(r.brokenAt, null);
  assert.deepEqual(r.reach, ['shelved']);
  assert.equal(r.links.length, 1);
  assert.equal(r.links[0].link, 'mint→catalogue');
  assert.equal(r.links[0].ok, true);
  // the reach===1 boundary: says "not yet served or audited", NOT the "and X matches it" phrasing
  // (kills the reach.length > 1 -> >= mutant, which would wrongly take the other branch at length 1)
  assert.ok(r.why.includes('not yet served or audited'), 'got: ' + r.why);
  assert.equal(r.why.includes(' and '), false, 'the single-link message must not use the multi-link phrasing, got: ' + r.why);
  assert.equal(REACH.length, 3);
  assert.deepEqual(REACH, ['shelved', 'served', 'audited']);
});

test('provenanceChain: refuses only on malformed input, one guard per field', () => {
  assert.equal(provenanceChain('nope').ok, false);
  assert.equal(provenanceChain({ manifest, listing }).ok, false);              // no node
  assert.equal(provenanceChain({ node: '  ', manifest, listing }).ok, false);  // blank node
  assert.equal(provenanceChain({ node: 'x', listing }).ok, false);             // no manifest
  assert.equal(provenanceChain({ node: 'x', manifest: {}, listing }).ok, false);           // manifest no hash
  assert.equal(provenanceChain({ node: 'x', manifest: { hash: 'X'.repeat(64) }, listing }).ok, false); // non-hex hash
  assert.equal(provenanceChain({ node: 'x', manifest: { hash: 'a'.repeat(63) }, listing }).ok, false); // short hash
  assert.equal(provenanceChain({ node: 'x', manifest }).ok, false);            // no listing
  assert.equal(provenanceChain({ node: 'x', manifest, listing: { node: 'x' } }).ok, false);            // listing no manifestHash
  assert.equal(provenanceChain({ node: 'x', manifest, listing: { manifestHash: H('m') } }).ok, false); // listing no node
  assert.equal(provenanceChain({ node: 'x', manifest, listing, served: 'nope' }).ok, false);           // served not an object
  assert.equal(provenanceChain({ node: 'x', manifest, listing, served: {} }).ok, false);               // served.ledger missing
  assert.equal(provenanceChain({ node: 'x', manifest, listing, served: { ledger: 'nope' } }).ok, false); // ledger not an array
  assert.equal(provenanceChain({ node: 'x', manifest, listing, audited: 'nope' }).ok, false);          // audited not an object
  assert.equal(provenanceChain({ node: 'x', manifest, listing, audited: {} }).ok, false);              // audited no department
  assert.equal(provenanceChain({ node: 'x', manifest, listing, audited: { department: {} } }).ok, false); // department no hash
  assert.equal(provenanceChain({ node: 'x', manifest, listing, audited: { department: { hash: H('d') } } }).ok, false); // department no units
  assert.equal(provenanceChain({ node: 'x', manifest, listing, audited: { department: { hash: H('d'), units: [] } } }).ok, false); // no receipts array
  // served/audited explicitly null is the same as omitted — not an error
  assert.equal(provenanceChain({ node: 'triage-1b', manifest, listing, served: null, audited: null }).intact, true);
});

test('provenanceChain: link 1 (mint→catalogue) breaks on EITHER a hash mismatch or a node mismatch, independently', () => {
  const wrongHash = provenanceChain({ node: 'triage-1b', manifest, listing: { ...listing, manifestHash: H('other-manifest') } });
  assert.equal(wrongHash.intact, false);
  assert.equal(wrongHash.brokenAt, 'mint→catalogue');
  assert.deepEqual(wrongHash.reach, []);
  assert.ok(wrongHash.why.includes('different build'), 'names the break, got: ' + wrongHash.why);

  const wrongNode = provenanceChain({ node: 'triage-1b', manifest, listing: { ...listing, node: 'review-1b' } });
  assert.equal(wrongNode.intact, false);
  assert.equal(wrongNode.brokenAt, 'mint→catalogue');

  // both wrong at once is still just one broken link, named the same way
  const bothWrong = provenanceChain({ node: 'triage-1b', manifest, listing: { manifestHash: H('other'), node: 'other-node' } });
  assert.equal(bothWrong.intact, false);
  assert.equal(bothWrong.brokenAt, 'mint→catalogue');
});

function ledgerWith(entry) { return { ledger: [{ seq: 0, prevHash: 'GENESIS', hash: H('l0'), entry }] }; }

test('provenanceChain: catalogue→served — a matching ledger serve-entry extends reach; a mismatch on EITHER field breaks it', () => {
  const good = provenanceChain({ node: 'triage-1b', manifest, listing, served: ledgerWith({ act: 'serve', node: 'triage-1b', manifestHash: H('manifest-1') }) });
  assert.equal(good.intact, true);
  assert.deepEqual(good.reach, ['shelved', 'served']);
  assert.equal(good.links[1].link, 'catalogue→served');
  assert.equal(good.links[1].ok, true);

  const wrongManifest = provenanceChain({ node: 'triage-1b', manifest, listing, served: ledgerWith({ act: 'serve', node: 'triage-1b', manifestHash: H('a-different-manifest') }) });
  assert.equal(wrongManifest.intact, false);
  assert.equal(wrongManifest.brokenAt, 'catalogue→served');
  assert.deepEqual(wrongManifest.reach, ['shelved']);

  const wrongNode = provenanceChain({ node: 'triage-1b', manifest, listing, served: ledgerWith({ act: 'serve', node: 'review-1b', manifestHash: H('manifest-1') }) });
  assert.equal(wrongNode.intact, false);
  assert.equal(wrongNode.brokenAt, 'catalogue→served');

  // no 'serve' act in the ledger at all (e.g. only 'ask' entries) — no entry to match, breaks the same way
  const noServeAct = provenanceChain({ node: 'triage-1b', manifest, listing, served: ledgerWith({ act: 'ask', node: 'triage-1b', manifestHash: H('manifest-1') }) });
  assert.equal(noServeAct.intact, false);
  assert.equal(noServeAct.brokenAt, 'catalogue→served');

  // an empty ledger — nothing to find, honest break, not a crash
  const empty = provenanceChain({ node: 'triage-1b', manifest, listing, served: { ledger: [] } });
  assert.equal(empty.intact, false);
  assert.equal(empty.brokenAt, 'catalogue→served');
});

const dept = (unitHash) => ({ hash: H('dept'), units: [{ name: 'audit', receiptHash: unitHash }] });
const receiptFor = (manifestHash, ownHash) => ({ taskHash: manifestHash, hash: ownHash });

test('provenanceChain: catalogue→audited — a department unit bound by taskHash extends reach; an unbound or foreign receipt breaks it', () => {
  const rec = receiptFor(H('manifest-1'), H('real-unit-receipt'));
  const good = provenanceChain({ node: 'triage-1b', manifest, listing, audited: { department: dept(rec.hash), receipts: [rec] } });
  assert.equal(good.intact, true);
  assert.deepEqual(good.reach, ['shelved', 'audited']);
  assert.equal(good.links[1].link, 'catalogue→audited');

  // a receipt whose taskHash matches, but whose OWN hash is not among the department's units — a
  // real receipt about the right task that was never actually rolled into THIS department
  const foreign = receiptFor(H('manifest-1'), H('a-receipt-not-in-the-department'));
  const notInDept = provenanceChain({ node: 'triage-1b', manifest, listing, audited: { department: dept(H('some-other-unit')), receipts: [foreign] } });
  assert.equal(notInDept.intact, false);
  assert.equal(notInDept.brokenAt, 'catalogue→audited');
  assert.deepEqual(notInDept.reach, ['shelved']);

  // a receipt genuinely inside the department, but bound to a DIFFERENT task (wrong taskHash)
  const wrongTask = receiptFor(H('a-different-manifest'), H('real-unit-receipt'));
  const wrongBinding = provenanceChain({ node: 'triage-1b', manifest, listing, audited: { department: dept(wrongTask.hash), receipts: [wrongTask] } });
  assert.equal(wrongBinding.intact, false);
  assert.equal(wrongBinding.brokenAt, 'catalogue→audited');

  // no receipts supplied at all
  const none = provenanceChain({ node: 'triage-1b', manifest, listing, audited: { department: dept(H('x')), receipts: [] } });
  assert.equal(none.intact, false);
  assert.equal(none.brokenAt, 'catalogue→audited');
});

test('provenanceChain: both served AND audited can hold at once — reach carries all three, in order', () => {
  const rec = receiptFor(H('manifest-1'), H('unit-x'));
  const r = provenanceChain({
    node: 'triage-1b', manifest, listing,
    served: ledgerWith({ act: 'serve', node: 'triage-1b', manifestHash: H('manifest-1') }),
    audited: { department: dept(rec.hash), receipts: [rec] },
  });
  assert.equal(r.intact, true);
  assert.deepEqual(r.reach, ['shelved', 'served', 'audited']);
  assert.equal(r.links.length, 3);
  assert.ok(r.why.includes('served and audited'), 'names both, got: ' + r.why);
});

test('provenanceReceipt: wraps a chain walk into a self-hashing, re-verifiable receipt', () => {
  const r = provenanceReceipt({ node: 'triage-1b', manifest, listing, createdAt: '2026-09-19T00:00:00Z' });
  assert.equal(r.ok, true);
  assert.equal(r.receipt.kind, 'fallforge-provenance');
  assert.equal(r.receipt.intact, true);
  assert.equal(r.receipt.manifestHash, manifest.hash);
  assert.equal(r.receipt.hash.length, 64);
  assert.equal(verifyProvenanceReceipt(r.receipt).valid, true);

  // propagates a refusal from provenanceChain rather than masking it
  assert.equal(provenanceReceipt({ node: '', manifest, listing, createdAt: 't' }).ok, false);
  // its own guard: createdAt
  assert.equal(provenanceReceipt({ node: 'x', manifest, listing, createdAt: '' }).ok, false);
  assert.equal(provenanceReceipt({ node: 'x', manifest, listing, createdAt: 7 }).ok, false);
  assert.equal(provenanceReceipt('nope').ok, false);

  const s = provenanceSignable(r.receipt);
  assert.equal(s.payload.includes('"signature"'), false);
  assert.equal(s.payload.includes(r.receipt.hash), true);
  assert.equal(provenanceSignable({ ...r.receipt, signature: { alg: 'Ed25519' } }).payload, s.payload);
  assert.equal(provenanceSignable({ kind: 'other' }).ok, false);
  assert.equal(provenanceSignable({ kind: 'fallforge-provenance' }).ok, false);   // no hash
});

test('verifyProvenanceReceipt: catches tamper, a lying intact flag, and a lying reach', () => {
  const rec = receiptFor(H('manifest-1'), H('unit-x'));
  const r = provenanceReceipt({
    node: 'triage-1b', manifest, listing,
    served: ledgerWith({ act: 'serve', node: 'triage-1b', manifestHash: H('manifest-1') }),
    audited: { department: dept(rec.hash), receipts: [rec] },
    createdAt: 't',
  }).receipt;
  assert.equal(verifyProvenanceReceipt(r).valid, true);
  assert.equal(verifyProvenanceReceipt({ ...r, node: 'x' }).valid, false);   // tamper -> hash mismatch

  // forge: claim intact while one link is secretly false, re-hash consistently
  const b1 = { ...r }; delete b1.hash; delete b1.signature;
  b1.links = b1.links.map((l, i) => (i === 1 ? { ...l, ok: false } : l));
  const forgedIntact = { ...b1, hash: sha256(canon(b1)).hash };
  const v1 = verifyProvenanceReceipt(forgedIntact);
  assert.equal(v1.valid, false);
  assert.ok(v1.why.includes('intact'), 'the lie is named, got: ' + v1.why);

  // forge: intact stays true and every link stays ok, but reach claims a level never actually reached
  const b2 = { ...r }; delete b2.hash; delete b2.signature;
  b2.reach = ['shelved'];   // hides that served+audited were both proven
  const forgedReach = { ...b2, hash: sha256(canon(b2)).hash };
  const v2 = verifyProvenanceReceipt(forgedReach);
  assert.equal(v2.valid, false);
  assert.ok(v2.why.includes('reach'), 'the hidden reach is named, got: ' + v2.why);

  // and the reverse: reach CLAIMS more than the links actually proved
  const b3 = { ...r }; delete b3.hash; delete b3.signature;
  b3.reach = ['shelved', 'served', 'audited', 'omniscient'];
  const forgedReach2 = { ...b3, hash: sha256(canon(b3)).hash };
  assert.equal(verifyProvenanceReceipt(forgedReach2).valid, false);

  assert.equal(verifyProvenanceReceipt({ kind: 'other', hash: 'x' }).ok, false);
  assert.equal(verifyProvenanceReceipt({ kind: 'fallforge-provenance' }).ok, false);   // no hash
  // split guards: non-array links / non-array reach are each independently invalid
  const pbody = { ...r }; delete pbody.hash; delete pbody.signature;
  const noLinks = { ...pbody, links: 'nope' }; noLinks.hash = sha256(canon(noLinks)).hash;
  assert.equal(verifyProvenanceReceipt(noLinks).valid, false);
  const noReach = { ...pbody, reach: 'nope' }; noReach.hash = sha256(canon(noReach)).hash;
  assert.equal(verifyProvenanceReceipt(noReach).valid, false);
});

// ── organ 2: coupling health + the shared frontier budget ─────────────────────────────────────────
test('coupleHealth: SOVEREIGN needs balance AND real disagreement, not perfect agreement', () => {
  assert.equal(coupleHealth({ interactions: 100, aChecks: 50, bChecks: 50, agreements: 80 }).state, 'SOVEREIGN');
  assert.equal(coupleHealth({ interactions: 100, aChecks: 50, bChecks: 50, agreements: 80 }).sound, true);
  assert.equal(coupleHealth({ interactions: 0, aChecks: 0, bChecks: 0, agreements: 0 }).state, 'FROZEN');
  assert.equal(coupleHealth({ interactions: 100, aChecks: 0, bChecks: 50, agreements: 40 }).state, 'STARVED');   // a never checks
  assert.equal(coupleHealth({ interactions: 100, aChecks: 50, bChecks: 0, agreements: 40 }).state, 'STARVED');   // b never checks
  const merged = coupleHealth({ interactions: 100, aChecks: 50, bChecks: 50, agreements: 100 });
  assert.equal(merged.state, 'MERGED');
  assert.match(merged.why, /correlated/);
  assert.equal(coupleHealth({ interactions: 100, aChecks: 90, bChecks: 30, agreements: 80 }).state, 'EXTRACTIVE');
  assert.equal(coupleHealth({ interactions: 100, aChecks: 50, bChecks: 50, agreements: 20 }).state, 'STARVED');  // balanced but rarely agree
  assert.equal(coupleHealth({ interactions: 100, aChecks: 100, bChecks: 100, agreements: 80 }).state, 'SOVEREIGN'); // a side may check every interaction
});

test('coupleHealth: the balance and agreement bands are exact integer boundaries (kills >= vs >)', () => {
  const atBalanceBand = coupleHealth({ interactions: 1000, aChecks: 618, bChecks: 1000, agreements: 800 });
  assert.equal(atBalanceBand.state, 'SOVEREIGN');
  const belowBalanceBand = coupleHealth({ interactions: 1000, aChecks: 617, bChecks: 1000, agreements: 800 });
  assert.equal(belowBalanceBand.state, 'EXTRACTIVE');
  const atAgreeBand = coupleHealth({ interactions: 1000, aChecks: 700, bChecks: 700, agreements: 500 });
  assert.equal(atAgreeBand.state, 'SOVEREIGN');
  const belowAgreeBand = coupleHealth({ interactions: 1000, aChecks: 700, bChecks: 700, agreements: 499 });
  assert.equal(belowAgreeBand.state, 'STARVED');
  assert.equal(BALANCE_MIN, 618);
  assert.equal(AGREE_MIN, 500);
});

test('coupleHealth: refuses only on malformed input, each guard named', () => {
  assert.equal(coupleHealth(null).ok, false);
  assert.match(coupleHealth({ interactions: -1, aChecks: 0, bChecks: 0, agreements: 0 }).why, /non-negative/);
  assert.match(coupleHealth({ interactions: 5, aChecks: 6, bChecks: 1, agreements: 1 }).why, /check more times/);
  assert.match(coupleHealth({ interactions: 5, aChecks: 1, bChecks: 6, agreements: 1 }).why, /check more times/);
  assert.match(coupleHealth({ interactions: 5, aChecks: 1, bChecks: 1, agreements: 6 }).why, /agreements cannot exceed/);
  assert.equal(coupleHealth({ interactions: 5, aChecks: 1.5, bChecks: 1, agreements: 1 }).ok, false);   // non-integer
});

test('borrowLimb: the shared frontier budget, exact boundary, a refusal costs nothing', () => {
  const l = makeMeshLimb(10).limb;
  assert.equal(borrowLimb(l, 10).allowed, true);           // exactly the budget
  assert.equal(borrowLimb(l, 10).limb.spent, 10);
  assert.equal(borrowLimb(l, 11).allowed, false);          // one over
  assert.equal(borrowLimb(l, 11).spent, 0);
  assert.equal(borrowLimb(l, 0).allowed, true);            // zero cost is valid
  assert.equal(borrowLimb(l, -1).allowed, false);
  assert.equal(makeMeshLimb(0).ok, true);                   // a zero-budget mesh never lends
  assert.equal(makeMeshLimb(-1).ok, false);
  assert.equal(makeMeshLimb(1.5).ok, false);
  assert.equal(borrowLimb({ budget: 5, spent: 9 }, 0).ok, false);    // spent already exceeds budget
  assert.equal(borrowLimb({ budget: 5, spent: -1 }, 0).ok, false);
  assert.equal(borrowLimb(null, 1).ok, false);
  assert.equal(borrowLimb({ budget: 5, spent: 5 }, 0).allowed, true);   // spent === budget is still valid
  // sequential borrows against the SAME shared budget — no single borrow can see past its own call,
  // so the mesh-wide cap only holds if callers thread the returned limb through, which this pins
  const b1 = borrowLimb(l, 6);
  assert.equal(b1.allowed, true);
  const b2 = borrowLimb(b1.limb, 6);
  assert.equal(b2.allowed, false, 'a second borrow against the already-spent limb must see the real remaining budget');
  assert.match(b2.why, /answers on its own/);
});

// ── organ 3: the trust & compliance organ ──────────────────────────────────────────────────────────
test('riskSelfCheck: flags a category, never asserts a legal conclusion, no dated claim anywhere', () => {
  assert.deepEqual(RISK_TIERS, ['prohibited', 'high', 'limited', 'minimal']);

  const social = riskSelfCheck('a social scoring system for citizens');
  assert.equal(social.tier, 'prohibited');
  assert.ok(social.matched.includes('social scoring'));
  assert.ok(social.why.includes('conformity assessment'), 'always defers to the deployer’s own assessment');

  const cv = riskSelfCheck('screens CVs for a recruitment agency and ranks candidates');
  assert.equal(cv.tier, 'high');
  assert.ok(cv.matched.includes('employment / recruitment'));

  const clean = riskSelfCheck('a spam filter for incoming email');
  assert.equal(clean.tier, 'minimal');
  assert.deepEqual(clean.matched, []);
  assert.ok(clean.why.includes('not a clearance'), 'a non-match is never framed as a pass');

  // priority: a description that trips BOTH a prohibited and a high trigger reports PROHIBITED,
  // never softened — same load-bearing rule as fall-euaiact's own priority order
  const both = riskSelfCheck('a biometric social scoring system for citizens');
  assert.equal(both.tier, 'prohibited');

  // never throws, never refuses — garbage input is just treated as no description, not a crash
  assert.equal(riskSelfCheck(null).tier, 'minimal');
  assert.equal(riskSelfCheck(42).tier, 'minimal');
  assert.equal(riskSelfCheck(undefined).tier, 'minimal');

  // no hardcoded date anywhere in the output — the exact trap caught in fall-euaiact's donor code
  const allOutputs = [social, cv, clean, both].map((r) => JSON.stringify(r)).join(' ');
  assert.equal(/20\d\d-\d\d-\d\d/.test(allOutputs), false, 'riskSelfCheck must never emit a calendar date, got: ' + allOutputs);
});

test('compliancePosture: a factual coverage reading over FallForge’s own checklist, weighted correctly', () => {
  assert.equal(CHECKLIST.length, 7);
  const allPublished = {};
  for (const item of CHECKLIST) allPublished[item] = 'published';
  const full = compliancePosture(allPublished);
  assert.equal(full.ok, true);
  assert.equal(full.maturityPct, 100);
  assert.deepEqual(full.gaps, []);
  assert.ok(full.why.includes('every checklist item is published'));

  const allMissing = {};
  for (const item of CHECKLIST) allMissing[item] = 'missing';
  const empty = compliancePosture(allMissing);
  assert.equal(empty.maturityPct, 0);
  assert.equal(empty.gaps.length, 7);

  // a known, hand-computed mix pins the exact weighted arithmetic (kills operator mutants in the sum)
  const mixed = { ...allMissing, 'privacy-notice': 'published', 'ai-transparency-notice': 'drafted' };
  const m = compliancePosture(mixed);
  // weightSum = 1(published) + 0.5(drafted) + 0*5(missing) = 1.5 ; 1.5/7 = 21.43% -> rounds to 21
  assert.equal(m.maturityPct, 21);
  assert.equal(m.published, 1);
  assert.equal(m.gaps.length, 6);
  assert.equal(m.gaps.includes('privacy-notice'), false);
  assert.ok(m.why.includes('1 of 7 published'));

  // refusals: not an object, a missing key, an unknown status value
  assert.equal(compliancePosture('nope').ok, false);
  assert.equal(compliancePosture({}).ok, false);
  const partial = { ...allPublished }; delete partial['dsar-route'];
  assert.equal(compliancePosture(partial).ok, false);
  assert.equal(compliancePosture({ ...allPublished, 'dsar-route': 'sort-of' }).ok, false);
});

test('compliancePostureReceipt / verifyCompliancePostureReceipt: seals a reading and catches a lying total', () => {
  const statuses = {};
  for (const item of CHECKLIST) statuses[item] = 'published';
  const r = compliancePostureReceipt(statuses, '2026-09-19T00:00:00Z');
  assert.equal(r.ok, true);
  assert.equal(r.receipt.kind, 'fallforge-compliance-posture');
  assert.equal(r.receipt.maturityPct, 100);
  assert.equal(r.receipt.hash.length, 64);
  assert.equal(verifyCompliancePostureReceipt(r.receipt).valid, true);

  assert.equal(compliancePostureReceipt(statuses, '').ok, false);
  assert.equal(compliancePostureReceipt(statuses, 7).ok, false);
  assert.equal(compliancePostureReceipt('nope', 't').ok, false);

  assert.equal(verifyCompliancePostureReceipt({ ...r.receipt, createdAt: 'x' }).valid, false);   // tamper

  // forge: published + gaps.length no longer adds up to total, re-hash consistently
  const b = { ...r.receipt }; delete b.hash; delete b.signature;
  b.gaps = [...b.gaps, 'an-extra-gap-not-reflected-in-published-or-total'];
  const forged = { ...b, hash: sha256(canon(b)).hash };
  const v = verifyCompliancePostureReceipt(forged);
  assert.equal(v.valid, false);
  assert.ok(v.why.includes('add up'), 'the lie is named, got: ' + v.why);

  assert.equal(verifyCompliancePostureReceipt({ kind: 'other', hash: 'x' }).ok, false);
  assert.equal(verifyCompliancePostureReceipt({ kind: 'fallforge-compliance-posture' }).ok, false);
  const noGaps = { ...b, gaps: 'nope' }; noGaps.hash = sha256(canon(noGaps)).hash;
  assert.equal(verifyCompliancePostureReceipt(noGaps).valid, false);
});

test('sha256 + canon: the vendored pair still holds (FIPS-pinned, order-blind)', () => {
  assert.equal(sha256('abc').hash, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256(7).ok, false);
  assert.equal(canon({ b: 1, a: 2 }), canon({ a: 2, b: 1 }));
  assert.notEqual(canon({ x: 5 }), canon({ x: '5' }));
  // each top-level primitive branch, pinned individually (kills the compound || -> && collapse)
  assert.equal(canon(5), '5');
  assert.equal(canon(true), 'true');
  assert.equal(canon(false), 'false');
  assert.equal(canon(null), 'null');
  assert.equal(canon('x'), '"x"');
});
