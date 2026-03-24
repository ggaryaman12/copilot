import { NextResponse } from 'next/server';
import { assertApiKey } from '@/lib/auth/guard';
import { getLearnedMemoryPath, upsertLearnedFact } from '@/lib/memory/learnedMemory';

export async function POST(request) {
  if (!assertApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const fact = body?.fact;
    if (!fact?.key) {
      return NextResponse.json({ error: 'fact.key is required' }, { status: 400 });
    }

    const memory = await upsertLearnedFact(fact);
    return NextResponse.json({
      ok: true,
      memoryPath: getLearnedMemoryPath(),
      factCount: memory.facts.length
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to save learned memory' }, { status: 500 });
  }
}
