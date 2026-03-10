import { NextResponse } from 'next/server';
import { assertApiKey } from '@/lib/auth/guard';
import { inspectSchema } from '@/lib/db/mysql';
import { writeAuditLog } from '@/lib/audit/logger';

export async function GET(request) {
  if (!assertApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const schema = await inspectSchema();
    const auditId = await writeAuditLog({
      sessionId: request.headers.get('x-session-id') || 'anonymous',
      mode: 'sql-schema',
      promptHash: 'schema_inspect',
      sources: [],
      sqlUsed: true,
      answerHash: 'schema'
    });
    return NextResponse.json({ auditId, schema });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
