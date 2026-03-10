import { NextResponse } from 'next/server';
import { assertApiKey } from '@/lib/auth/guard';
import { runAgent } from '@/lib/chat/engine';
import { hashText, writeAuditLog } from '@/lib/audit/logger';
import { writeRuntimeLog } from '@/lib/logging/runtime';

export async function POST(request) {
  if (!assertApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionId = request.headers.get('x-session-id') || 'anonymous';

  try {
    const body = await request.json();
    const mode = body.mode || 'architecture';
    const prompt = body.prompt || '';
    const sql = body.sql || '';
    const selectedTables = Array.isArray(body.selectedTables) ? body.selectedTables : [];
    const tableAck = Boolean(body.tableAck);

    if (!prompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const out = await runAgent({ mode, prompt, sql, selectedTables, tableAck });

    const auditId = await writeAuditLog({
      sessionId,
      mode,
      promptHash: hashText(prompt),
      sources: out.contexts.map((c) => ({ path: c.path, startLine: c.startLine, endLine: c.endLine, score: c.score })),
      sqlUsed: Boolean(sql),
      answerHash: hashText(out.answer)
    });

    return NextResponse.json({
      auditId,
      mode,
      answer: out.answer,
      citations: out.contexts.map((c) => ({
        path: c.path,
        startLine: c.startLine,
        endLine: c.endLine,
        anchor: c.anchor,
        score: c.score,
        preview: c.text?.slice(0, 400) || ''
      })),
      sqlContext: out.sqlContext,
      intent: out.intent,
      tablePlan: out.tablePlan,
      columnPlan: out.columnPlan,
      trace: out.trace || [],
      clarifyingQuestions: out.clarifyingQuestions || []
    });
  } catch (error) {
    await writeRuntimeLog('error', 'chat_route_failed', {
      message: error?.message || 'unknown error',
      stack: error?.stack || null
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
