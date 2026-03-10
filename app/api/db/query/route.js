import { NextResponse } from 'next/server';
import { assertApiKey } from '@/lib/auth/guard';
import { runSelectQuery } from '@/lib/db/mysql';
import { hashText, writeAuditLog } from '@/lib/audit/logger';

export async function POST(request) {
  if (!assertApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const sql = body.sql || '';
    const result = await runSelectQuery(sql);
    const auditId = await writeAuditLog({
      sessionId: request.headers.get('x-session-id') || 'anonymous',
      mode: 'sql-query',
      promptHash: hashText(sql),
      sources: [],
      sqlUsed: true,
      answerHash: hashText(JSON.stringify(result.rows).slice(0, 8000))
    });
    return NextResponse.json({ auditId, ...result });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
