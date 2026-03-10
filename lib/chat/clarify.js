export function buildClarifyingQuestions({ mode, prompt, intent, contexts, tablePlan, tableAck, sqlContext }) {
  const questions = [];
  const q = String(prompt || '').toLowerCase();
  const domainCount = Array.isArray(intent?.domains) ? intent.domains.length : 0;

  if (mode !== 'sql' && domainCount > 1) {
    questions.push('Should I focus on dashboard flow, marketplace flow, or both?');
  }

  if (mode !== 'sql' && !/\b(route|endpoint|api|controller|service)\b/.test(q)) {
    questions.push('Do you want route-level tracing (endpoint -> controller -> service) or high-level architecture only?');
  }

  if (Array.isArray(contexts) && contexts.length > 0) {
    const topScore = Number(contexts[0]?.score || 0);
    if (topScore < 0.12) {
      questions.push('Please share one concrete keyword: endpoint name, screen name, or function name to improve precision.');
    }
  }

  if (mode === 'sql') {
    if (sqlContext?.type === 'needs_table_input') {
      const suggested = (sqlContext.suggestedTables || []).filter(Boolean);
      if (suggested.length) {
        questions.push(`Please confirm one exact table name from: ${suggested.slice(0, 5).join(', ')}.`);
      } else {
        questions.push('Please share the exact table name for this SQL query.');
      }
    }
    if (sqlContext?.type === 'db_setup_required' && Array.isArray(sqlContext.missingEnv) && sqlContext.missingEnv.length) {
      questions.push(`Set DB env first: ${sqlContext.missingEnv.join(', ')}.`);
    }
  }

  return questions.slice(0, 4);
}
