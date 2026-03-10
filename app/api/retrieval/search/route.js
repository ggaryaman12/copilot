import { NextResponse } from 'next/server';
import { assertApiKey } from '@/lib/auth/guard';
import { searchKnowledge } from '@/lib/rag/search';

export async function POST(request) {
  if (!assertApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const query = body.query || '';
    const mode = body.mode || 'architecture';
    const topK = Number.isFinite(body.topK) ? body.topK : undefined;
    const results = await searchKnowledge(query, mode, topK);
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
