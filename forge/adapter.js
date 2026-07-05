/* FallForge · BYOK LLM adapter · thin variant of the FallHub adapter.
 * Providers: anthropic · openai · gemini · groq · mistral · webllm (local).
 * Owner's key stays in browser · direct hits provider · never our servers.
 */

const PROVIDERS = {
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    headers: (key) => ({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json'
    }),
    body: ({ messages, model, system, max_tokens }) => ({
      model: model || 'claude-opus-4-8',
      max_tokens: max_tokens || 4096,
      system: system || undefined,
      messages: messages.map(m => ({ role: m.role, content: m.content }))
    }),
    parse: (r) => ({ text: (r.content || []).filter(b => b.type === 'text').map(b => b.text).join(''), usage: r.usage })
  },
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    headers: (key) => ({ 'Authorization': `Bearer ${key}`, 'content-type': 'application/json' }),
    body: ({ messages, model, system, max_tokens }) => ({
      model: model || 'gpt-4.1',
      max_tokens: max_tokens || 4096,
      messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages]
    }),
    parse: (r) => ({ text: r.choices?.[0]?.message?.content || '', usage: r.usage })
  },
  gemini: {
    endpoint: (model, key) => `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.5-pro'}:generateContent?key=${key}`,
    headers: () => ({ 'content-type': 'application/json' }),
    body: ({ messages, system }) => ({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents: messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
      }))
    }),
    parse: (r) => ({ text: (r.candidates?.[0]?.content?.parts || []).filter(p => p.text).map(p => p.text).join(''), usage: r.usageMetadata })
  },
  groq: {
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    headers: (key) => ({ 'Authorization': `Bearer ${key}`, 'content-type': 'application/json' }),
    body: ({ messages, model, system }) => ({
      model: model || 'llama-3.3-70b-versatile',
      messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages]
    }),
    parse: (r) => ({ text: r.choices?.[0]?.message?.content || '' })
  },
  mistral: {
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    headers: (key) => ({ 'Authorization': `Bearer ${key}`, 'content-type': 'application/json' }),
    body: ({ messages, model, system }) => ({
      model: model || 'mistral-large-latest',
      messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages]
    }),
    parse: (r) => ({ text: r.choices?.[0]?.message?.content || '' })
  },
  webllm: {
    _engine: null,
    async _lazyInit(model, onProgress) {
      if (this._engine) return this._engine;
      const { CreateMLCEngine } = await import('https://esm.run/@mlc-ai/web-llm');
      this._engine = await CreateMLCEngine(model || 'Llama-3.1-8B-Instruct-q4f16_1-MLC', {
        initProgressCallback: (r) => onProgress && onProgress(r)
      });
      return this._engine;
    },
    async chatDirect({ messages, system, model, onProgress }) {
      const eng = await this._lazyInit(model, onProgress);
      const r = await eng.chat.completions.create({
        messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages]
      });
      return { text: r.choices?.[0]?.message?.content || '' };
    }
  }
};

export async function chat({ provider, model, key, messages, system, max_tokens, onProgress }) {
  const p = PROVIDERS[provider];
  if (!p) throw new Error(`unknown provider: ${provider}`);
  if (provider === 'webllm') return p.chatDirect({ messages, system, model, onProgress });

  const endpoint = typeof p.endpoint === 'function' ? p.endpoint(model, key) : p.endpoint;
  const headers = p.headers(key);
  const body = p.body({ messages, model, system, max_tokens });
  const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`${provider} ${res.status}: ${t.slice(0, 200)}`);
  }
  return p.parse(await res.json());
}

export const SUPPORTED_PROVIDERS = Object.keys(PROVIDERS);
