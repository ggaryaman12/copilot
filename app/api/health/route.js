import { NextResponse } from 'next/server';
import { env, getMissingDbEnvKeys } from '@/lib/config/env';
import { getOllamaModels } from '@/lib/ollama/client';

export async function GET() {
  const ts = new Date().toISOString();
  const out = {
    ok: true,
    service: 'yelo-copilot-platform',
    ts,
    checks: {
      ollama: {
        ok: false,
        baseUrl: env.ollamaBaseUrl,
        generateModel: env.ollamaGenerateModel,
        embedModel: env.ollamaEmbedModel,
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
    const names = await getOllamaModels();
    out.checks.ollama.availableModels = names;
    out.checks.ollama.ok = true;
    out.checks.ollama.missingGenerateModel = !names.includes(env.ollamaGenerateModel);
    out.checks.ollama.missingEmbedModel = !names.includes(env.ollamaEmbedModel);
  } catch (error) {
    out.ok = false;
    out.checks.ollama.error = error.message;
  }

  return NextResponse.json(out);
}
