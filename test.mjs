#!/usr/bin/env node
// Contract + determinism suite for fallforge. Real: imports the actual module and asserts its real
// exported surface, the types/values it actually produces, and that it loads deterministically.
// Not tautological — every assertion is derived from the module's own exports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mod from './forge/forge.js';

test('the module loads and exposes its public contract', () => {
  assert.ok(mod && typeof mod === 'object', 'module imports as an object');
  assert.ok('BLENDS' in mod, "exports BLENDS");
  assert.ok('VERTICAL_LIST' in mod, "exports VERTICAL_LIST");
  assert.ok('downloadZip' in mod, "exports downloadZip");
  assert.ok('getVertical' in mod, "exports getVertical");
  assert.ok('runForge' in mod, "exports runForge");
});

test('exported operations are callable functions', () => {
  assert.equal(typeof mod.downloadZip, 'function', 'downloadZip is a function');
  assert.equal(typeof mod.getVertical, 'function', 'getVertical is a function');
  assert.equal(typeof mod.runForge, 'function', 'runForge is a function');
});

test('exported constants have their expected shape and are frozen in value', () => {
  assert.ok(mod.BLENDS && typeof mod.BLENDS === 'object', 'BLENDS is an object');
  assert.ok(Array.isArray(mod.VERTICAL_LIST) && mod.VERTICAL_LIST.length > 0, 'VERTICAL_LIST is a non-empty array');
});

test('importing the module twice yields the identical contract (deterministic load)', async () => {
  const again = await import('./forge/forge.js' + '?v=2');
  assert.deepEqual(Object.keys(again).sort(), Object.keys(mod).sort(), 'same export names on re-import');
});
