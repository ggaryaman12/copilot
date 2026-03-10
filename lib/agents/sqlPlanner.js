function lower(value) {
  return String(value || '').toLowerCase();
}

function hasWord(text, words) {
  return words.some((w) => text.includes(w));
}

function detectUserId(question) {
  const q = lower(question);
  const m1 = q.match(/marketplace user id\s*([0-9]+)/i);
  if (m1) return Number.parseInt(m1[1], 10);
  const m2 = q.match(/user id\s*([0-9]+)/i);
  if (m2) return Number.parseInt(m2[1], 10);
  return null;
}

function tableColumns(schema, tableName) {
  return schema.columns.filter((c) => c.table_name === tableName).map((c) => lower(c.column_name));
}

function pickDateColumn(columns) {
  const prefs = ['creation_datetime', 'created_at', 'created_on', 'order_datetime', 'job_datetime', 'date_time'];
  for (const p of prefs) {
    if (columns.includes(p)) return p;
  }
  return columns.find((c) => c.includes('date') || c.includes('time')) || null;
}

function pickUserColumn(columns) {
  const prefs = ['marketplace_user_id', 'user_id', 'customer_id', 'buyer_id'];
  for (const p of prefs) {
    if (columns.includes(p)) return p;
  }
  return null;
}

function scoreTable(question, tableName, columns) {
  const q = lower(question);
  let score = 0;
  const t = lower(tableName);

  if (hasWord(q, ['order', 'orders']) && (t.includes('order') || t.includes('job'))) score += 5;
  if (q.includes('marketplace') && t.includes('marketplace')) score += 3;
  if (columns.includes('marketplace_user_id')) score += 5;
  if (columns.includes('creation_datetime') || columns.includes('created_at')) score += 3;
  if (columns.includes('is_deleted')) score += 1;
  if (t.startsWith('tb_')) score += 1;
  return score;
}

function buildDateCondition(question, dateColumn) {
  const q = lower(question);
  if (!dateColumn) return null;
  if (q.includes('today')) return `DATE(${dateColumn}) = CURDATE()`;
  const fromTo = q.match(/from\s+([0-9]{1,2}\s+[a-z]{3,9})\s+to\s+([0-9]{1,2}\s+[a-z]{3,9})/i);
  if (fromTo) {
    const from = fromTo[1];
    const to = fromTo[2];
    return `${dateColumn} >= STR_TO_DATE('${from}', '%e %M') AND ${dateColumn} < DATE_ADD(STR_TO_DATE('${to}', '%e %M'), INTERVAL 1 DAY)`;
  }
  return null;
}

export function planSqlQuery({ question, schema, forcedTable = null, rowLimit = 200 }) {
  const tableNames = schema.tables.map((t) => t.table_name).filter(Boolean);
  if (!tableNames.length) {
    return { ready: false, reason: 'No DB tables were discovered in schema introspection.', candidates: [] };
  }

  const scored = tableNames
    .map((table) => {
      const cols = tableColumns(schema, table);
      return { table, cols, score: scoreTable(question, table, cols) };
    })
    .sort((a, b) => b.score - a.score);

  const candidates = scored.filter((x) => x.score > 0).slice(0, 8).map((x) => x.table);
  const chosen = forcedTable || candidates[0] || scored[0]?.table || null;
  if (!chosen) {
    return { ready: false, reason: 'Could not choose a table.', candidates };
  }

  const cols = tableColumns(schema, chosen);
  const idCol = pickUserColumn(cols);
  const userId = detectUserId(question);
  const dateCol = pickDateColumn(cols);
  const dateCond = buildDateCondition(question, dateCol);

  const blockers = [];
  if (!idCol) blockers.push('No user-id column found in selected table.');
  if (userId == null) blockers.push('User id could not be parsed from question.');
  if (!dateCol) blockers.push('No date/time column found in selected table.');

  const conditions = [];
  if (idCol && userId != null) conditions.push(`${idCol} = ${userId}`);
  if (dateCond) conditions.push(dateCond);
  if (cols.includes('is_deleted')) conditions.push('is_deleted = 0');

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderBy = dateCol ? `ORDER BY ${dateCol} DESC` : '';
  const sql = `SELECT * FROM ${chosen} ${where} ${orderBy} LIMIT ${rowLimit}`.replace(/\s+/g, ' ').trim();

  return {
    ready: blockers.length === 0,
    reason: blockers.join(' '),
    candidates,
    chosenTable: chosen,
    idColumn: idCol,
    dateColumn: dateCol,
    parsedUserId: userId,
    sql
  };
}
