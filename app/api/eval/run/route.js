import { NextResponse } from 'next/server';
import { assertApiKey } from '@/lib/auth/guard';
import { runAgent } from '@/lib/chat/engine';
import { aggregateScores } from '@/lib/eval/scoring';
import fs from 'fs/promises';
import path from 'path';

const datasetPath = path.resolve(process.cwd(), 'data/eval/dataset.json');
const outputPath = path.resolve(process.cwd(), 'data/eval/results.json');

export async function POST(request) {
  if (!assertApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const dataset = JSON.parse(await fs.readFile(datasetPath, 'utf8'));
    const results = [];

    for (const item of dataset) {
      const out = await runAgent({ mode: item.mode, prompt: item.question });
      const scores = aggregateScores(out.answer || '', item.mode);
      results.push({ ...item, scores, answer: out.answer, citations: out.contexts.map((c) => c.anchor) });
    }

    const summary = {
      total: results.length,
      passed: results.filter((r) => r.scores.pass).length,
      failed: results.filter((r) => !r.scores.pass).length
    };

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify({ summary, results }, null, 2), 'utf8');

    return NextResponse.json({ summary, outputPath });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
