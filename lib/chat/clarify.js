export function buildClarifyingQuestions({ mode, prompt, intent, contexts, tablePlan, tableAck }) {
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

  if (mode === 'sql' && tablePlan && !tableAck) {
    questions.push('Can you ACK/edit the proposed tables before I generate SQL?');
  }

  return questions.slice(0, 4);
}
