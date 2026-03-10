import { NextResponse } from 'next/server';
import { assertApiKey } from '@/lib/auth/guard';
import { runSelectQuery } from '@/lib/db/mysql';

export async function POST(request) {
  if (!assertApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const input = body.sql || '';
    const sql = /^explain\b/i.test(input.trim()) ? input : `EXPLAIN ${input}`;
    const result = await runSelectQuery(sql);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
