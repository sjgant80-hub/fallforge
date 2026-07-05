/* FallForge · Cloudflare Worker · hosted-mode helper.
 * Endpoints:
 *   GET /fetch?url=<encoded>            → proxy-fetches HTML (CORS-friendly)
 *   POST /crawl                          → deeper multi-page crawl
 *   POST /gh-deploy                      → GitHub push + Pages enable
 * All endpoints are CORS-open · buyer's key never touches this worker.
 * Buyer's website scrape passes through · we don't store it.
 */

const ALLOWED_ORIGINS = [
  'https://sjgant80-hub.github.io',
  'https://www.ai-nativesolutions.com',
  'https://ai-nativesolutions.com',
  'http://localhost:5173',
  'http://localhost:8080',
  'http://127.0.0.1:5173'
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '*';
    const corsHeaders = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, x-fallforge-token'
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

    try {
      if (url.pathname === '/fetch' && request.method === 'GET') return handleFetch(url, corsHeaders);
      if (url.pathname === '/crawl' && request.method === 'POST') return handleCrawl(request, corsHeaders);
      if (url.pathname === '/gh-deploy' && request.method === 'POST') return handleGhDeploy(request, corsHeaders);
      if (url.pathname === '/' || url.pathname === '/health') return new Response(JSON.stringify({ ok: true, service: 'FallForge worker', version: '1.0.0' }), { headers: { 'content-type': 'application/json', ...corsHeaders } });
      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'content-type': 'application/json', ...corsHeaders } });
    }
  }
};

async function handleFetch(url, corsHeaders) {
  const target = url.searchParams.get('url');
  if (!target) return new Response('Missing url param', { status: 400, headers: corsHeaders });
  try {
    const t = new URL(target); // validation
    if (!['http:', 'https:'].includes(t.protocol)) throw new Error('bad protocol');
  } catch { return new Response('Bad URL', { status: 400, headers: corsHeaders }); }

  const res = await fetch(target, {
    headers: { 'user-agent': 'FallForge/1.0 (+https://sjgant80-hub.github.io/fallforge)', 'accept': 'text/html,*/*' },
    redirect: 'follow',
    cf: { cacheTtl: 300 }
  });
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') || 'text/html', 'cache-control': 'public, max-age=300', ...corsHeaders }
  });
}

async function handleCrawl(request, corsHeaders) {
  const { seed, max = 15 } = await request.json();
  if (!seed) return new Response('Missing seed', { status: 400, headers: corsHeaders });
  const seen = new Set([seed]);
  const queue = [seed];
  const pages = {};
  while (queue.length && Object.keys(pages).length < max) {
    const url = queue.shift();
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'FallForge/1.0' }, redirect: 'follow' });
      if (!res.ok) continue;
      const html = await res.text();
      pages[url] = html.slice(0, 100000);
      // Extract same-host links
      const base = new URL(url);
      const rx = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
      let m;
      while ((m = rx.exec(html)) && queue.length + Object.keys(pages).length < max * 2) {
        try {
          const abs = new URL(m[1], url).toString();
          const u = new URL(abs);
          if (u.host === base.host && !seen.has(abs)) {
            seen.add(abs);
            queue.push(abs);
          }
        } catch {}
      }
    } catch {}
  }
  return new Response(JSON.stringify({ pages }), { headers: { 'content-type': 'application/json', ...corsHeaders } });
}

async function handleGhDeploy(request, corsHeaders) {
  const { token, owner, repo, files, enable_pages = true } = await request.json();
  if (!token || !owner || !repo || !files) return new Response('Missing fields', { status: 400, headers: corsHeaders });

  // Create repo
  const createRes = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'accept': 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'FallForge/1.0' },
    body: JSON.stringify({ name: repo, private: false, auto_init: true, description: 'Forged by FallForge · AI-Native Solutions' })
  });
  if (!createRes.ok) {
    return new Response(JSON.stringify({ error: 'create failed', detail: await createRes.text() }), { status: 502, headers: { 'content-type': 'application/json', ...corsHeaders } });
  }

  // Push files
  for (const [path, content] of Object.entries(files)) {
    await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'accept': 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'FallForge/1.0' },
      body: JSON.stringify({ message: `FallForge · ${path}`, content: btoa(unescape(encodeURIComponent(content))) })
    });
  }

  // Enable Pages
  if (enable_pages) {
    await fetch(`https://api.github.com/repos/${owner}/${repo}/pages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'accept': 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'FallForge/1.0' },
      body: JSON.stringify({ source: { branch: 'main', path: '/' }, build_type: 'legacy' })
    }).catch(() => {});
  }

  return new Response(JSON.stringify({
    repo_url: `https://github.com/${owner}/${repo}`,
    pages_url: `https://${owner}.github.io/${repo}/`
  }), { headers: { 'content-type': 'application/json', ...corsHeaders } });
}
