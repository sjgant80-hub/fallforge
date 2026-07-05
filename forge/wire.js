/* FallForge · Phase 3 · Wire
 * Assembles the buyer's FallHub package: kernel.json + router config + module
 * install list + metadata. Produces a downloadable ZIP.
 * Optional: push to buyer's GitHub if a token is provided.
 */

import { BLENDS, serialiseForKernel } from './router-config.js';

const RECOMMENDED_MODULES = {
  hospitality: ['botler', 'fallsecurity', 'fallaccount', 'fallreach'],
  trades: ['botler', 'fallsecurity', 'fallaccount', 'fallcrm-elite'],
  adshop: ['botler', 'fallreach', 'fallcrm-elite', 'fallaccount'],
  accounting: ['botler', 'fallsecurity', 'fallaccount', 'fallbrief', 'kardv5'],
  barbershop: ['botler', 'fallsecurity', 'fallaccount', 'fallcrm-elite', 'fallreach']
};

/* Build a ZIP of the FallHub deployment for this buyer. */
export async function packageInstall({ kernel, verticalKey, blendKey, keys = {}, businessName, log = () => {} }) {
  const blend = BLENDS[blendKey] || BLENDS.eighty20;
  const modules = RECOMMENDED_MODULES[verticalKey] || ['botler'];

  log('wire', `Packaging install for "${businessName}" · blend=${blend.key} · modules=${modules.length}`);

  // Merge router config into kernel
  const enrichedKernel = { ...kernel, ...serialiseForKernel(blend, keys) };

  // Bill-of-materials
  const bom = {
    name: businessName || 'my-business',
    forged_at: new Date().toISOString(),
    forged_by: 'FallForge v1.0.0',
    vertical: verticalKey,
    fallhub_ref: 'https://github.com/sjgant80-hub/fallhub',
    blend: blend.key,
    router_monthly_estimate: blend.monthly_gbp_range,
    modules_installed: modules,
    fresh_install: true,
    autonomy_default: 'watch'
  };

  const readme = _generateReadme(businessName, verticalKey, blend, modules);

  const files = {
    'kernel.json': JSON.stringify(enrichedKernel, null, 2),
    'bom.json': JSON.stringify(bom, null, 2),
    'README.md': readme,
    'INSTALL.md': _generateInstallGuide(verticalKey, blend, modules),
    'modules-to-install.txt': modules.join('\n') + '\n'
  };

  log('wire', `${Object.keys(files).length} files ready to bundle`);
  return { files, bom, blend, modules };
}

/* Build a ZIP Blob using dynamically-imported JSZip · returns Blob for download. */
export async function zipFiles(files) {
  const { default: JSZip } = await import('https://esm.run/jszip@3');
  const z = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    z.file(path, content);
  }
  return await z.generateAsync({ type: 'blob' });
}

/* Trigger a browser download of the ZIP. */
export function downloadZip(blob, filename = 'fallforge-install.zip') {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/* Optional · push directly to a fresh GitHub repo (buyer supplies PAT). */
export async function pushToGitHub({ files, token, repoName, ownerHandle, log = () => {} }) {
  if (!token) throw new Error('GitHub token required');
  log('wire', `Creating GitHub repo ${ownerHandle}/${repoName}…`);

  // Create the repo
  const createRes = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'accept': 'application/vnd.github+json', 'content-type': 'application/json' },
    body: JSON.stringify({ name: repoName, description: 'FallHub · forged by FallForge', private: false, auto_init: false })
  });
  if (!createRes.ok) {
    const t = await createRes.text();
    throw new Error('repo create failed: ' + t.slice(0, 160));
  }
  const repo = await createRes.json();

  // Push each file via the contents API
  for (const [path, content] of Object.entries(files)) {
    const b64 = _b64encode(content);
    const putRes = await fetch(`https://api.github.com/repos/${ownerHandle}/${repoName}/contents/${path}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'accept': 'application/vnd.github+json', 'content-type': 'application/json' },
      body: JSON.stringify({ message: `FallForge · ${path}`, content: b64 })
    });
    if (!putRes.ok) log('wire', `push ${path} failed`, 'err');
    else log('wire', `pushed ${path}`);
  }

  return {
    repo_url: repo.html_url,
    pages_url: `https://${ownerHandle}.github.io/${repoName}/`
  };
}

function _b64encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function _generateReadme(name, verticalKey, blend, modules) {
  return `# ${name || 'My business'}

Forged by FallForge on top of FallHub. AI-Native Solutions substrate.

- **Vertical:** ${verticalKey}
- **Router blend:** ${blend.label} · monthly ${blend.monthly_gbp_range}
- **Modules installed:** ${modules.join(', ')}
- **Autonomy default:** watch (slide up as trust grows)

## What's in this bundle

- \`kernel.json\` — your business's kernel · distilled from your online footprint
- \`bom.json\` — bill of materials · what was installed and why
- \`INSTALL.md\` — steps to go live
- \`modules-to-install.txt\` — list of estate modules to fetch

## Get live

1. Follow \`INSTALL.md\`
2. Open your instance
3. Slide the autonomy dial from Watch → Auto as trust grows

## Resources

- FallHub: https://sjgant80-hub.github.io/fallhub/
- Live reference: https://sjgant80-hub.github.io/wishwood/
- FallForge: https://sjgant80-hub.github.io/fallforge/
- Publisher: https://www.ai-nativesolutions.com/

MIT · ◊·κ=1
`;
}

function _generateInstallGuide(verticalKey, blend, modules) {
  return `# Install guide · forged by FallForge

## Step 1 · Clone the FallHub template

Clone or download: https://github.com/sjgant80-hub/fallhub

## Step 2 · Drop kernel.json

Copy the \`kernel.json\` from this bundle into the \`ai/\` folder of your FallHub instance, replacing the example one.

## Step 3 · Install modules

Modules recommended for ${verticalKey}:

${modules.map(m => `- \`${m}\` — https://github.com/sjgant80-hub/${m}`).join('\n')}

## Step 4 · Configure the LLM router

Your bundle uses the ${blend.label} blend (monthly estimate ${blend.monthly_gbp_range}).

Paste the API keys for the providers in your bundle's kernel.json into \`autopilot.html\`:

${Object.entries(blend.routes).map(([phase, r]) => `- ${phase}: ${r.provider} (${r.model})`).join('\n')}

## Step 5 · Practice on the simulator

Open \`sim.html\`. Click DOWNLOAD & TRAIN. Practice with fake customers before real ones arrive.

## Step 6 · Slide the autonomy dial

Start on **Watch**. Slide up as trust grows.

Full setup guide: https://sjgant80-hub.github.io/fallhub/setup.html
`;
}
