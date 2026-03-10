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

function filterSince(items, sinceRaw) {
  if (!sinceRaw) return items;
  const sinceTs = Date.parse(sinceRaw);
  if (Number.isNaN(sinceTs)) return items;
  return items.filter((item) => {
    if (!item?.ts) return false;
    const itemTs = Date.parse(String(item.ts));
    return !Number.isNaN(itemTs) && itemTs >= sinceTs;
  });
}

export async function GET(request) {
  if (!assertApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limitRaw = request.nextUrl.searchParams.get('limit');
  const sinceRaw = request.nextUrl.searchParams.get('since');
  const limit = Number.parseInt(limitRaw || '120', 10);
  const auditPath = path.resolve(process.cwd(), 'data/audit.log');
  const runtimePath = getRuntimeLogPath();

  const [auditLines, runtimeLines] = await Promise.all([
    readTailLines(auditPath, limit),
    readTailLines(runtimePath, limit)
  ]);

  const audit = filterSince(auditLines.map(tryParseJson), sinceRaw);
  const runtime = filterSince(runtimeLines.map(tryParseJson), sinceRaw);

  return NextResponse.json({ audit, runtime });
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
