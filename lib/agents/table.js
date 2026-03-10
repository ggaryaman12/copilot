function tokenize(text = '') {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function scoreTable(tableName, tableColumns, queryTokens) {
  const nameTokens = tokenize(tableName);
  const columnTokens = tableColumns.flatMap((c) => tokenize(c.column_name || ''));
  let score = 0;

  for (const token of queryTokens) {
    if (nameTokens.includes(token)) score += 2;
    if (columnTokens.includes(token)) score += 1;
  }
  return score;
}

export function proposeTables({ prompt, schema, selectedTables = [] }) {
  const selected = selectedTables.map((t) => t.trim()).filter(Boolean);
  if (selected.length) {
    return {
      recommendedTables: selected,
      finalTables: selected,
      source: 'user-selected'
    };
  }

  const tokens = tokenize(prompt);
  const tableNames = schema.tables
    .map((t) => String(t.table_name || '').trim())
    .filter(Boolean);
  const columnsByTable = schema.columns.reduce((acc, col) => {
    acc[col.table_name] ||= [];
    acc[col.table_name].push(col);
    return acc;
  }, {});

  const ranked = tableNames
    .map((table) => ({
      table,
      score: scoreTable(table, columnsByTable[table] || [], tokens)
    }))
    .filter((x) => x.table)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => x.table);

  const fallback = tableNames.slice(0, 5);
  const finalRanked = ranked.length ? ranked : fallback;

  return {
    recommendedTables: finalRanked,
    finalTables: finalRanked,
    source: 'agent-recommended'
  };
}
