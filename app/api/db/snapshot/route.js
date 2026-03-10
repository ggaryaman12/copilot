import { NextResponse } from 'next/server';
import { assertApiKey } from '@/lib/auth/guard';
import { inspectSchema } from '@/lib/db/mysql';
import { extractCodeTableHints, saveSchemaMemory, getSchemaMemoryPath } from '@/lib/memory/schemaMemory';

function toTableQuestions(schemaTables, codeHints) {
  const tableSet = new Set(schemaTables.map((t) => t.table_name));
  const missingFromDb = codeHints
    .map((h) => h.table)
    .filter((t) => !tableSet.has(t))
    .slice(0, 8);

  const questions = [];
  if (missingFromDb.length) {
    questions.push(
      `These yelo-server table names are referenced in code but not found in current DB: ${missingFromDb.join(', ')}. Which are legacy/unused?`
    );
  }
  if (tableSet.has('tb_jobs')) {
    questions.push('Can we confirm tb_jobs is the source of truth for marketplace orders?');
  }
  return questions;
}

export async function POST(request) {
  if (!assertApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const schema = await inspectSchema();
    const codeHints = await extractCodeTableHints();
    const questions = toTableQuestions(schema.tables, codeHints);

    const payload = {
      capturedAt: new Date().toISOString(),
      db: {
        tableCount: schema.tables.length,
        columnCount: schema.columns.length,
        indexCount: schema.indexes.length,
        fkCount: schema.fks.length
      },
      schema,
      codeHints,
      questions
    };

    await saveSchemaMemory(payload);
    return NextResponse.json({
      ok: true,
      memoryPath: getSchemaMemoryPath(),
      tableCount: schema.tables.length,
      codeHintCount: codeHints.length,
      questions
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
