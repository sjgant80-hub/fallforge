/* FallForge · orchestrator · runs the 5 phases end-to-end.
 * DISCOVER → KERNEL → WIRE → CALIBRATE → HANDOFF
 */

import { discover } from './discover.js';
import { detectVertical, VERTICAL_LIST, getVertical } from './verticals.js';
import { distilKernel } from './kernel-distil.js';
import { packageInstall, zipFiles, downloadZip, pushToGitHub } from './wire.js';
import { BLENDS, pickBlendDefault } from './router-config.js';

/* Run all five phases. Emits progress via onPhase({ phase, pct, msg }). */
export async function runForge({
  businessUrl,
  businessName,
  forcedVertical = null,
  blendKey = null,
  keys = {},
  githubToken = null,
  ownerHandle = null,
  repoName = null,
  onPhase = () => {},
  onLog = () => {}
}) {
  const state = {
    startedAt: Date.now(),
    businessUrl,
    businessName,
    keys
  };
  const log = (phase, msg, level = 'info') => { onLog({ phase, msg, level, ts: Date.now() }); };

  /* Phase 1 · DISCOVER */
  onPhase({ phase: 'discover', pct: 5, msg: 'Fetching your online footprint…' });
  state.evidence = await discover({ url: businessUrl, log });
  onPhase({ phase: 'discover', pct: 20, msg: 'Footprint captured' });

  /* Detect vertical */
  let verticalKey = forcedVertical;
  if (!verticalKey) {
    const detected = detectVertical(state.evidence.text);
    state.detectedVertical = detected;
    verticalKey = detected.top.key;
    log('discover', `Vertical auto-detected: ${detected.top.label} · confidence ${(detected.top.confidence * 100).toFixed(0)}%`, detected.confident ? 'ok' : 'warn');
    if (!detected.confident) {
      log('discover', 'Low confidence · you may want to override the vertical', 'warn');
    }
  }
  state.verticalKey = verticalKey;

  /* Phase 2 · KERNEL */
  onPhase({ phase: 'kernel', pct: 30, msg: 'Distilling your business kernel…' });
  const blend = blendKey ? BLENDS[blendKey] : pickBlendDefault();
  state.blend = blend;
  const harvestRoute = blend.routes.harvest;
  const harvestKey = keys[harvestRoute.provider];
  if (harvestRoute.provider !== 'webllm' && !harvestKey) {
    throw new Error(`Missing API key for ${harvestRoute.provider} (needed for kernel harvest under blend "${blend.label}")`);
  }
  state.kernel = await distilKernel({
    evidence: state.evidence,
    verticalKey,
    businessName,
    route: harvestRoute,
    key: harvestKey,
    log
  });
  onPhase({ phase: 'kernel', pct: 55, msg: 'Kernel distilled' });

  /* Phase 3 · WIRE */
  onPhase({ phase: 'wire', pct: 65, msg: 'Packaging your FallHub install…' });
  const pkg = await packageInstall({
    kernel: state.kernel,
    verticalKey,
    blendKey: blend.key,
    keys,
    businessName,
    log
  });
  state.package = pkg;
  onPhase({ phase: 'wire', pct: 80, msg: 'Package assembled' });

  /* Phase 4 · CALIBRATE (skipped in MVP · runs on the buyer's instance post-install) */
  onPhase({ phase: 'calibrate', pct: 85, msg: 'Autopilot calibration queued for post-install (runs on your instance)' });
  log('calibrate', 'Full simulator calibration runs on your FallHub instance after deploy · see INSTALL.md', 'ok');

  /* Phase 5 · HANDOFF */
  onPhase({ phase: 'handoff', pct: 92, msg: 'Preparing handoff…' });
  const zipBlob = await zipFiles(pkg.files);
  state.zipBlob = zipBlob;

  let ghResult = null;
  if (githubToken && ownerHandle && repoName) {
    log('handoff', 'Pushing to your GitHub…');
    try {
      ghResult = await pushToGitHub({ files: pkg.files, token: githubToken, ownerHandle, repoName, log });
      state.githubResult = ghResult;
    } catch (e) {
      log('handoff', 'GitHub push failed: ' + e.message + ' · falling back to ZIP download', 'warn');
    }
  }

  onPhase({ phase: 'handoff', pct: 100, msg: 'Done' });
  log('handoff', `Total forge time: ${((Date.now() - state.startedAt) / 1000).toFixed(1)}s`, 'ok');
  return state;
}

export { BLENDS, VERTICAL_LIST, getVertical, downloadZip };
