import { NextResponse } from 'next/server';
import { env, getMissingDbEnvKeys } from '@/lib/config/env';
import { getProviderHealth } from '@/lib/llm/client';
import { resolveLLMRuntime } from '@/lib/llm/runtime';

export async function GET(request) {
  const llmRuntime = resolveLLMRuntime({ request });
  const ts = new Date().toISOString();
  const out = {
    ok: true,
    service: 'yelo-copilot-platform',
    ts,
    checks: {
      llm: {
        ok: false,
        provider: llmRuntime.provider,
        baseUrl: llmRuntime.provider === 'gemini' ? llmRuntime.gemini.baseUrl : llmRuntime.ollama.baseUrl,
        generateModel: llmRuntime.provider === 'gemini' ? llmRuntime.gemini.model : llmRuntime.ollama.model,
        embedModel: llmRuntime.provider === 'gemini' ? llmRuntime.gemini.embedModel : llmRuntime.ollama.embedModel,
        availableModels: [],
        missingGenerateModel: false,
        missingEmbedModel: false
      },
      db: {
        configured: Boolean(env.db.host && env.db.user && env.db.database && env.db.password),
        missingEnv: getMissingDbEnvKeys()
      }
    }
  };

  try {
    const llmHealth = await getProviderHealth(llmRuntime);
    out.checks.llm = {
      ...out.checks.llm,
      ...llmHealth
    };
    out.ok = Boolean(out.ok && out.checks.llm.ok);
  } catch (error) {
    out.ok = false;
    out.checks.llm.error = error.message;
  }

  return NextResponse.json(out);
}
