import { env } from '@/lib/config/env';

function withTimeout(ms = env.ollamaTimeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { controller, timeout };
}

async function parseJsonSafe(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response: ${text.slice(0, 240)}`);
  }
}

async function ollamaGenerate(prompt, system, runtime) {
  const { controller, timeout } = withTimeout(runtime.timeoutMs);
  const response = await fetch(`${runtime.ollama.baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: runtime.ollama.model,
      system,
      prompt,
      stream: false
    }),
    signal: controller.signal
  });
  clearTimeout(timeout);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama request failed (${response.status}): ${text}`);
  }
  const data = await parseJsonSafe(response);
  return data.response || '';
}

async function ollamaEmbed(input, runtime) {
  const { controller, timeout } = withTimeout(runtime.timeoutMs);
  const response = await fetch(`${runtime.ollama.baseUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: runtime.ollama.embedModel,
      prompt: input
    }),
    signal: controller.signal
  });
  clearTimeout(timeout);
  if (!response.ok) return [];
  const data = await parseJsonSafe(response);
  return data.embedding || [];
}

async function geminiGenerate(prompt, system, runtime) {
  if (!runtime.gemini.apiKey) throw new Error('Gemini API key missing.');
  const model = runtime.gemini.model || env.geminiGenerateModel;
  const url = `${runtime.gemini.baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(runtime.gemini.apiKey)}`;
  const { controller, timeout } = withTimeout(runtime.timeoutMs);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system || '' }] },
      contents: [{ parts: [{ text: prompt }] }]
    }),
    signal: controller.signal
  });
  clearTimeout(timeout);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${text}`);
  }
  const data = await parseJsonSafe(response);
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || '').join('\n').trim();
}

async function geminiEmbed(input, runtime) {
  if (!runtime.gemini.apiKey) return [];
  const model = runtime.gemini.embedModel || env.geminiEmbedModel;
  const url = `${runtime.gemini.baseUrl}/v1beta/models/${encodeURIComponent(model)}:embedContent?key=${encodeURIComponent(runtime.gemini.apiKey)}`;
  const { controller, timeout } = withTimeout(runtime.timeoutMs);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text: input }] }
    }),
    signal: controller.signal
  });
  clearTimeout(timeout);
  if (!response.ok) return [];
  const data = await parseJsonSafe(response);
  return data?.embedding?.values || [];
}

export async function generateText(prompt, system, runtime) {
  if ((runtime?.provider || 'ollama') === 'gemini') {
    return geminiGenerate(prompt, system, runtime);
  }
  return ollamaGenerate(prompt, system, runtime);
}

export async function embedText(input, runtime) {
  try {
    if ((runtime?.provider || 'ollama') === 'gemini') {
      return geminiEmbed(input, runtime);
    }
    return ollamaEmbed(input, runtime);
  } catch {
    return [];
  }
}

export async function getProviderHealth(runtime) {
  if ((runtime?.provider || 'ollama') === 'gemini') {
    if (!runtime.gemini.apiKey) {
      return {
        provider: 'gemini',
        ok: false,
        error: 'Gemini API key missing.',
        model: runtime.gemini.model
      };
    }

    const url = `${runtime.gemini.baseUrl}/v1beta/models?key=${encodeURIComponent(runtime.gemini.apiKey)}`;
    const { controller, timeout } = withTimeout(runtime.timeoutMs);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) {
      const text = await response.text();
      return { provider: 'gemini', ok: false, error: `Gemini models request failed: ${text}` };
    }
    const data = await parseJsonSafe(response);
    const names = (data?.models || []).map((m) => (m.name || '').split('/').pop()).filter(Boolean);
    return {
      provider: 'gemini',
      ok: true,
      availableModels: names,
      model: runtime.gemini.model,
      embedModel: runtime.gemini.embedModel,
      missingGenerateModel: !names.includes(runtime.gemini.model),
      missingEmbedModel: !names.includes(runtime.gemini.embedModel)
    };
  }

  const { controller, timeout } = withTimeout(runtime.timeoutMs);
  const response = await fetch(`${runtime.ollama.baseUrl}/api/tags`, { signal: controller.signal });
  clearTimeout(timeout);
  if (!response.ok) {
    const text = await response.text();
    return { provider: 'ollama', ok: false, error: `Ollama tags request failed: ${text}` };
  }
  const data = await parseJsonSafe(response);
  const names = (data?.models || []).map((m) => m.name).filter(Boolean);
  return {
    provider: 'ollama',
    ok: true,
    availableModels: names,
    model: runtime.ollama.model,
    embedModel: runtime.ollama.embedModel,
    missingGenerateModel: !names.includes(runtime.ollama.model),
    missingEmbedModel: !names.includes(runtime.ollama.embedModel)
  };
}
