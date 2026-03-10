import { env } from '@/lib/config/env';

async function post(path, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.ollamaTimeoutMs);
  const response = await fetch(`${env.ollamaBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: controller.signal
  });
  clearTimeout(timeout);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama request failed (${response.status}): ${text}`);
  }

  return response.json();
}

async function get(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.ollamaTimeoutMs);
  const response = await fetch(`${env.ollamaBaseUrl}${path}`, { signal: controller.signal });
  clearTimeout(timeout);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama request failed (${response.status}): ${text}`);
  }
  return response.json();
}

export async function generateText(prompt, system) {
  try {
    const data = await post('/api/generate', {
      model: env.ollamaGenerateModel,
      system,
      prompt,
      stream: false
    });
    return data.response || '';
  } catch (error) {
    const message = String(error?.message || '');
    if (message.includes('not found')) {
      throw new Error(
        `Ollama generation model missing: ${env.ollamaGenerateModel}. Run: ollama pull ${env.ollamaGenerateModel}`
      );
    }
    throw error;
  }
}

export async function embedText(input) {
  try {
    const data = await post('/api/embeddings', {
      model: env.ollamaEmbedModel,
      prompt: input
    });
    return data.embedding || [];
  } catch {
    return [];
  }
}

export async function getOllamaModels() {
  const data = await get('/api/tags');
  const models = Array.isArray(data?.models) ? data.models : [];
  return models.map((m) => m.name).filter(Boolean);
}
