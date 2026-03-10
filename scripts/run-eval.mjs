import fs from 'fs/promises';
import path from 'path';

const baseUrl = process.env.EVAL_BASE_URL || 'http://localhost:3000';
const apiKey = process.env.YELO_AGENT_API_KEY || 'change-me';
const datasetPath = path.resolve(process.cwd(), 'data/eval/dataset.json');
const outputPath = path.resolve(process.cwd(), 'data/eval/results.json');

function score(answer, mode) {
  const hasVerified = /\bVERIFIED\b/i.test(answer);
  const hasInferred = /\bINFERRED\b/i.test(answer);
  const hasUnknown = /\bUNKNOWN\b/i.test(answer);
  const citations = (answer.match(/\/Users\/aryamangupta\/YELO\/[\w\-/().\[\]]+:\d+/g) || []).length;
  const hasUnsafeSql = mode === 'sql' && /\b(insert|update|delete|drop|truncate|alter|create)\b/i.test(answer);
  return {
    pass: hasVerified && hasInferred && hasUnknown && citations > 0 && !hasUnsafeSql,
    hasVerified,
    hasInferred,
    hasUnknown,
    citations,
    hasUnsafeSql
  };
}

async function main() {
  const dataset = JSON.parse(await fs.readFile(datasetPath, 'utf8'));
  const results = [];

  for (const item of dataset) {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({ prompt: item.question, mode: item.mode })
    });

    const body = await res.json();
    const answer = body.answer || '';
    const scores = score(answer, item.mode);
    results.push({ ...item, status: res.status, scores, answer });
    console.log(`${item.id}: ${scores.pass ? 'PASS' : 'FAIL'}`);
  }

  const summary = {
    total: results.length,
    passed: results.filter((r) => r.scores.pass).length,
    failed: results.filter((r) => !r.scores.pass).length
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify({ summary, results }, null, 2), 'utf8');
  console.log('Eval results saved to', outputPath);
  if (summary.failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
