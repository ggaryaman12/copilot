import { NextResponse } from 'next/server';
import { assertApiKey } from '@/lib/auth/guard';
import { runPreflight } from '@/lib/chat/preflight';

export async function POST(request) {
  if (!assertApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const mode = body.mode || 'architecture';
    const prompt = body.prompt || '';
    const sql = body.sql || '';
    const selectedTables = Array.isArray(body.selectedTables) ? body.selectedTables : [];

    if (!prompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const out = await runPreflight({ mode, prompt, sql, selectedTables });
    return NextResponse.json(out);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
