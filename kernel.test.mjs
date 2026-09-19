import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REACH, sha256, canon,
  provenanceChain, provenanceReceipt, provenanceSignable, verifyProvenanceReceipt,
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
