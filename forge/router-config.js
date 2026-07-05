/* FallForge · LLM router blends · five tiers baked into every install. */

export const BLENDS = {
  fullFrontier: {
    key: 'fullFrontier',
    label: 'Full Frontier',
    tagline: 'Highest quality · everything on frontier LLM',
    monthly_gbp_range: '£80–£300',
    routes: {
      discovery: { provider: 'anthropic', model: 'claude-opus-4-8' },
      harvest:   { provider: 'anthropic', model: 'claude-opus-4-8' },
      reply:     { provider: 'anthropic', model: 'claude-opus-4-8' },
      bulk:      { provider: 'anthropic', model: 'claude-opus-4-8' },
      judge:     { provider: 'anthropic', model: 'claude-opus-4-8' }
    }
  },
  eighty20: {
    key: 'eighty20',
    label: '80/20 (default)',
    tagline: 'Frontier for reasoning · open-source for bulk',
    monthly_gbp_range: '£20–£60',
    default: true,
    routes: {
      discovery: { provider: 'gemini',    model: 'gemini-2.5-pro' },
      harvest:   { provider: 'anthropic', model: 'claude-opus-4-8' },
      reply:     { provider: 'anthropic', model: 'claude-opus-4-8' },
      bulk:      { provider: 'groq',      model: 'llama-3.3-70b-versatile' },
      judge:     { provider: 'groq',      model: 'llama-3.3-70b-versatile' }
    }
  },
  fifty50: {
    key: 'fifty50',
    label: '50/50 blend',
    tagline: 'Balanced cost & quality',
    monthly_gbp_range: '£8–£25',
    routes: {
      discovery: { provider: 'gemini', model: 'gemini-2.5-pro' },
      harvest:   { provider: 'groq',   model: 'llama-3.3-70b-versatile' },
      reply:     { provider: 'anthropic', model: 'claude-opus-4-8' },
      bulk:      { provider: 'groq',   model: 'llama-3.3-70b-versatile' },
      judge:     { provider: 'groq',   model: 'llama-3.3-70b-versatile' }
    }
  },
  fullOpen: {
    key: 'fullOpen',
    label: 'Full Open',
    tagline: 'Sovereign · fast · everything Llama',
    monthly_gbp_range: '£4–£12',
    routes: {
      discovery: { provider: 'groq', model: 'llama-3.3-70b-versatile' },
      harvest:   { provider: 'groq', model: 'llama-3.3-70b-versatile' },
      reply:     { provider: 'groq', model: 'llama-3.3-70b-versatile' },
      bulk:      { provider: 'groq', model: 'llama-3.1-8b-instant' },
      judge:     { provider: 'groq', model: 'llama-3.3-70b-versatile' }
    }
  },
  local: {
    key: 'local',
    label: 'Local-only (WebLLM)',
    tagline: 'Zero cost · zero servers · runs in browser',
    monthly_gbp_range: '£0',
    routes: {
      discovery: { provider: 'webllm', model: 'Llama-3.1-8B-Instruct-q4f16_1-MLC' },
      harvest:   { provider: 'webllm', model: 'Llama-3.1-8B-Instruct-q4f16_1-MLC' },
      reply:     { provider: 'webllm', model: 'Llama-3.1-8B-Instruct-q4f16_1-MLC' },
      bulk:      { provider: 'webllm', model: 'Llama-3.1-8B-Instruct-q4f16_1-MLC' },
      judge:     { provider: 'webllm', model: 'Llama-3.1-8B-Instruct-q4f16_1-MLC' }
    }
  }
};

export function pickBlendDefault() { return BLENDS.eighty20; }

export function serialiseForKernel(blend, keys) {
  return {
    router: {
      blend: blend.key,
      routes: blend.routes,
      keys: keys || {}
    }
  };
}
