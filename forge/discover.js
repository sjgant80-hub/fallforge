/* FallForge · Phase 1 · Discover
 * Pulls raw evidence from a business's public footprint.
 * Local mode: browser fetch. CORS-blocked hosts fall back to hosted worker proxy if available.
 */

const HOSTED_PROXY = 'https://fallforge-worker.ai-nativesolutions.workers.dev/fetch?url=';

export async function discover({ url, opts = {}, log = () => {} }) {
  const evidence = {
    url,
    fetched_at: new Date().toISOString(),
    raw: {},
    text: '',
    links: [],
    socials: {},
    errors: []
  };

  log('discover', `Fetching ${url}`);
  let html;
  try {
    html = await _fetch(url, opts);
  } catch (e) {
    log('discover', `Direct fetch failed (${e.message}) · trying hosted proxy…`, 'warn');
    try {
      html = await _fetchViaProxy(url);
    } catch (e2) {
      evidence.errors.push('primary fetch failed: ' + e2.message);
      log('discover', `Both direct + proxy failed: ${e2.message}`, 'err');
      return evidence;
    }
  }
  evidence.raw.landing = html;

  const text = _extractText(html);
  evidence.text = text;
  log('discover', `Extracted ${text.length.toLocaleString()} chars from landing page`);

  const links = _extractLinks(html, url);
  evidence.links = links;
  log('discover', `Found ${links.length} internal links`);

  const socials = _extractSocials(html);
  evidence.socials = socials;
  if (Object.keys(socials).length) log('discover', `Socials: ${Object.keys(socials).join(', ')}`);

  // Deep-crawl a few likely-signal pages (about, prices, reviews)
  const signalPatterns = /(about|prices?|rates?|book|contact|reviews?|faq|policies|terms)/i;
  const signalLinks = links.filter(l => signalPatterns.test(l)).slice(0, 5);
  for (const link of signalLinks) {
    try {
      const sub = await _fetch(link, opts);
      const subText = _extractText(sub);
      evidence.text += '\n\n---\n' + link + '\n' + subText.slice(0, 8000);
      log('discover', `+${subText.length.toLocaleString()} chars from ${_short(link)}`);
    } catch (e) {
      // fall back to proxy
      try {
        const sub = await _fetchViaProxy(link);
        const subText = _extractText(sub);
        evidence.text += '\n\n---\n' + link + '\n' + subText.slice(0, 8000);
        log('discover', `+${subText.length.toLocaleString()} chars from ${_short(link)} (proxy)`);
      } catch { /* skip */ }
    }
  }

  return evidence;
}

async function _fetch(url, opts) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs || 12000);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow', headers: { 'accept': 'text/html,*/*' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function _fetchViaProxy(url) {
  const res = await fetch(HOSTED_PROXY + encodeURIComponent(url));
  if (!res.ok) throw new Error('proxy ' + res.status);
  return await res.text();
}

function _extractText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function _extractLinks(html, base) {
  const out = new Set();
  const rx = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
  let m;
  const baseUrl = new URL(base);
  while ((m = rx.exec(html))) {
    try {
      const abs = new URL(m[1], base).toString();
      const u = new URL(abs);
      if (u.host === baseUrl.host) out.add(abs);
    } catch {}
  }
  return Array.from(out).slice(0, 40);
}

function _extractSocials(html) {
  const s = {};
  const patterns = {
    instagram: /instagram\.com\/([A-Za-z0-9_.]+)/,
    facebook: /facebook\.com\/([A-Za-z0-9_.-]+)/,
    twitter: /(?:twitter\.com|x\.com)\/([A-Za-z0-9_]+)/,
    linkedin: /linkedin\.com\/(?:in|company)\/([A-Za-z0-9-_.]+)/,
    tiktok: /tiktok\.com\/@?([A-Za-z0-9_.]+)/,
    airbnb: /airbnb\.[a-z.]+\/rooms\/(\d+)/,
    booking: /booking\.com\/hotel\/[a-z]+\/([A-Za-z0-9-_.]+)/
  };
  for (const [k, rx] of Object.entries(patterns)) {
    const m = html.match(rx);
    if (m) s[k] = m[1];
  }
  return s;
}

function _short(url) {
  try { const u = new URL(url); return u.pathname.length > 40 ? u.pathname.slice(0, 40) + '…' : u.pathname; }
  catch { return url; }
}
