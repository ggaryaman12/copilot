function tokenize(text = '') {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function isBaseColumn(name) {
  return ['id', 'created_at', 'updated_at', 'status', 'name'].includes(name);
}

export function pruneColumns({ prompt, schema, tables }) {
  const tokens = new Set(tokenize(prompt));
  const byTable = {};

  for (const table of tables) {
    const columns = schema.columns.filter((c) => c.table_name === table);
    const scored = columns.map((col) => {
      const name = String(col.column_name || '').toLowerCase();
      let score = 0;
      if (isBaseColumn(name)) score += 1;
      for (const token of tokens) {
        if (name.includes(token)) score += 2;
      }
      return { name: col.column_name, score };
    });

    const pruned = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((c) => c.name);

    byTable[table] = pruned;
  }

  return byTable;
}
