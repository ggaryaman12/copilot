import { env } from '@/lib/config/env';

function clean(value) {
  return String(value || '').trim();
}

export function resolveLLMRuntime({ request, body } = {}) {
  const source = body?.llm || {};
  const header = (name) => clean(request?.headers?.get?.(name));

  const providerRaw = clean(source.provider || header('x-llm-provider') || env.llmProvider || 'auto').toLowerCase();
  const provider = providerRaw === 'auto' ? 'ollama' : providerRaw;

  const runtime = {
    provider,
    timeoutMs: env.ollamaTimeoutMs,
    ollama: {
      baseUrl: clean(source.baseUrl || header('x-llm-base-url') || env.ollamaBaseUrl),
      model: clean(source.model || header('x-llm-model') || env.ollamaGenerateModel),
      embedModel: clean(source.embedModel || header('x-llm-embed-model') || env.ollamaEmbedModel)
    },
    gemini: {
      baseUrl: clean(source.baseUrl || header('x-llm-base-url') || env.geminiBaseUrl),
      apiKey: clean(source.apiKey || header('x-llm-api-key') || env.geminiApiKey),
      model: clean(source.model || header('x-llm-model') || env.geminiGenerateModel),
      embedModel: clean(source.embedModel || header('x-llm-embed-model') || env.geminiEmbedModel)
    }
  };

  return runtime;
}
