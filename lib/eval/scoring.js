const FORBIDDEN_SQL = /\b(insert|update|delete|drop|truncate|alter|create|replace)\b/i;

export function scoreCitationCoverage(answer) {
  const citationPattern = /\/Users\/aryamangupta\/YELO\/[\w\-/().\[\]]+:(\d+)/g;
  const matches = answer.match(citationPattern) || [];
  return {
    count: matches.length,
    pass: matches.length >= 1
  };
}

export function scoreStructure(answer) {
  const hasVerified = /\bVERIFIED\b/i.test(answer);
  const hasInferred = /\bINFERRED\b/i.test(answer);
  const hasUnknown = /\bUNKNOWN\b/i.test(answer);
  const pass = hasVerified && hasInferred && hasUnknown;
  return { pass, hasVerified, hasInferred, hasUnknown };
}

export function scoreSqlSafety(answer) {
  const unsafe = FORBIDDEN_SQL.test(answer);
  return {
    pass: !unsafe,
    unsafe
  };
}

export function aggregateScores(answer, mode) {
  const structure = scoreStructure(answer);
  const citations = scoreCitationCoverage(answer);
  const sql = mode === 'sql' ? scoreSqlSafety(answer) : { pass: true, unsafe: false };
  const pass = structure.pass && citations.pass && sql.pass;
  return { pass, structure, citations, sql };
}
