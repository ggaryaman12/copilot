import path from 'path';
import { NextResponse } from 'next/server';
import { assertApiKey } from '@/lib/auth/guard';
import { readTailLines, getRuntimeLogPath, clearLogFile } from '@/lib/logging/runtime';

function tryParseJson(line) {
  try {
    return JSON.parse(line);
  } catch {
    return { raw: line };
  }
}

export async function GET(request) {
  if (!assertApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limitRaw = request.nextUrl.searchParams.get('limit');
  const limit = Number.parseInt(limitRaw || '120', 10);
  const auditPath = path.resolve(process.cwd(), 'data/audit.log');
  const runtimePath = getRuntimeLogPath();

  const [auditLines, runtimeLines] = await Promise.all([
    readTailLines(auditPath, limit),
    readTailLines(runtimePath, limit)
  ]);

  return NextResponse.json({
    audit: auditLines.map(tryParseJson),
    runtime: runtimeLines.map(tryParseJson)
  });
}

export async function DELETE(request) {
  if (!assertApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const auditPath = path.resolve(process.cwd(), 'data/audit.log');
  const runtimePath = getRuntimeLogPath();
  await Promise.all([clearLogFile(auditPath), clearLogFile(runtimePath)]);
  return NextResponse.json({ ok: true });
}
