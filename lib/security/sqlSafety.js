import { env } from '@/lib/config/env';

const BLOCKED_PATTERN = /\b(insert|update|delete|drop|truncate|alter|create|replace|grant|revoke|lock|unlock|rename)\b/i;
const SEMICOLON_PATTERN = /;/g;

export function assertSafeReadOnlySql(sql) {
  if (!sql || typeof sql !== 'string') {
    throw new Error('SQL query is required.');
  }

  const trimmed = sql.trim();
  if (!/^select\b/i.test(trimmed) && !/^explain\b/i.test(trimmed)) {
    throw new Error('Only SELECT/EXPLAIN queries are allowed in read-only mode.');
  }

  if (BLOCKED_PATTERN.test(trimmed)) {
    throw new Error('Mutating SQL is blocked.');
  }

  const semicolons = (trimmed.match(SEMICOLON_PATTERN) || []).length;
  if (semicolons > 1 || (semicolons === 1 && !trimmed.endsWith(';'))) {
    throw new Error('Multiple statements are not allowed.');
  }

  return trimmed.endsWith(';') ? trimmed.slice(0, -1) : trimmed;
}

function extractLimitCount(sql) {
  const placeholderOffset = sql.match(/\blimit\s+\?\s+offset\s+\?\b/i);
  if (placeholderOffset) return 0;
  const placeholderSimple = sql.match(/\blimit\s+\?\b/i);
  if (placeholderSimple) return 0;
  const offsetForm = sql.match(/\blimit\s+(\d+)\s*,\s*(\d+)\b/i);
  if (offsetForm) return Number.parseInt(offsetForm[2], 10);
  const keywordOffset = sql.match(/\blimit\s+(\d+)\s+offset\s+(\d+)\b/i);
  if (keywordOffset) return Number.parseInt(keywordOffset[1], 10);
  const simple = sql.match(/\blimit\s+(\d+)\b/i);
  if (simple) return Number.parseInt(simple[1], 10);
  return null;
}

export function applyRowLimit(sql) {
  const existingLimit = extractLimitCount(sql);
  if (existingLimit != null) {
    if (existingLimit > env.db.rowLimit) {
      throw new Error(`Row limit exceeded. Maximum allowed is ${env.db.rowLimit}.`);
    }
    return sql;
  }
  return `${sql} LIMIT ${env.db.rowLimit}`;
}
