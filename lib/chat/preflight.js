import { inferIntent } from '@/lib/agents/intent';
import { searchKnowledge } from '@/lib/rag/search';
import { getMissingDbEnvKeys } from '@/lib/config/env';

function askIfMissingConcreteTarget(prompt = '', mode = 'architecture') {
  const q = prompt.toLowerCase();
  if (mode === 'sql') {
    // Do not block straightforward SQL questions with extra targeting prompts.
    // SQL generation can proceed with table inference.
    return null;
  }

  const hasConcrete = /\b(endpoint|route|controller|service|function|screen|component)\b/.test(q);
  if (!hasConcrete && mode === 'architecture') {
    return 'Should I focus on system architecture, a specific module, or a single endpoint chain?';
  }
  if (!hasConcrete && mode === 'flow') {
    return 'Which user action should I trace first, and where should the flow end?';
  }
  return null;
}

function askIfCrossApp(prompt = '', domains = [], mode = 'architecture') {
  if (mode === 'sql') return null;
  const q = prompt.toLowerCase();
  const mentionsDashboard = q.includes('dashboard') || domains.includes('yelo-dashboard-angular');
  const mentionsMarketplace = q.includes('marketplace') || domains.includes('yelo-marketplace-webapp');
  if (mentionsDashboard && mentionsMarketplace) {
    return 'Do you want dashboard flow, marketplace flow, or both in this run?';
  }
  return null;
}

function askIfSQLNeedsBounds(mode, prompt = '') {
  if (mode !== 'sql') return null;
  return null;
}

function hasPlaceholderSql(sql = '') {
  const normalized = String(sql || '').toLowerCase();
  if (!normalized.trim()) return false;
  return (
    normalized.includes('table_name') ||
    normalized.includes('table_a') ||
    normalized.includes('table_b') ||
    normalized.includes('table_c')
  );
}

function hasPlaceholderTables(selectedTables = []) {
  return selectedTables.some((t) => /^table_[a-z0-9]+$/i.test(String(t || '').trim()));
}

export async function runPreflight({ mode, prompt, sql = '', selectedTables = [], llmRuntime }) {
  const normalizedMode = (mode || 'architecture').toLowerCase();
  const intent = inferIntent({ mode: normalizedMode, prompt });
  const contexts = await searchKnowledge(prompt, normalizedMode, 5, intent.domains, llmRuntime);

  const questions = [];
  const q1 = askIfMissingConcreteTarget(prompt, normalizedMode);
  const q2 = askIfCrossApp(prompt, intent.domains, normalizedMode);
  const q3 = askIfSQLNeedsBounds(normalizedMode, prompt);
  if (q1) questions.push(q1);
  if (q2) questions.push(q2);
  if (q3) questions.push(q3);

  if (normalizedMode === 'sql') {
    const missingDb = getMissingDbEnvKeys();
    if (missingDb.length) {
      questions.unshift(`DB setup required before SQL run. Missing: ${missingDb.join(', ')}`);
    }
    if (hasPlaceholderSql(sql)) {
      questions.unshift('Optional SQL has placeholder table names (table_name/table_a). Remove it or provide a real table.');
    }
    if (hasPlaceholderTables(selectedTables)) {
      questions.unshift('Selected tables contain placeholders. Replace with real table names or leave empty for table agent.');
    }
  }

  const lowConfidence = contexts.length === 0 || Number(contexts[0]?.score || 0) < 0.1;
  if (normalizedMode !== 'sql' && lowConfidence) {
    questions.push('I have low confidence from retrieval. Share one known keyword/path from your code to anchor this run.');
  }

  return {
    ready: questions.length === 0,
    questions,
    intent,
    contextPreview: contexts.map((c) => ({
      path: c.path,
      startLine: c.startLine,
      score: c.score,
      preview: c.text.slice(0, 240)
    }))
  };
}
