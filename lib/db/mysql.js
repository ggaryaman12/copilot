import mysql from 'mysql2/promise';
import { env } from '@/lib/config/env';
import { applyRowLimit, assertSafeReadOnlySql } from '@/lib/security/sqlSafety';

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      database: env.db.database,
      ssl: env.db.ssl ? {} : undefined,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: env.db.queryTimeoutMs
    });
  }
  return pool;
}

function assertDbConfigured() {
  if (!env.db.host || !env.db.user || !env.db.database) {
    throw new Error('DB is not configured. Set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME.');
  }
}

export async function runSelectQuery(inputSql) {
  assertDbConfigured();
  const safe = assertSafeReadOnlySql(inputSql);
  const sql = /^explain\b/i.test(safe) ? safe : applyRowLimit(safe);
  const [rows] = await getPool().query({ sql, timeout: env.db.queryTimeoutMs });
  return { sql, rows };
}

export async function inspectSchema() {
  assertDbConfigured();
  const db = env.db.database;
  const p = getPool();

  const [tables] = await p.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name`,
    [db]
  );

  const [columns] = await p.query(
    `SELECT table_name, column_name, data_type, is_nullable, column_key, extra
     FROM information_schema.columns
     WHERE table_schema = ?
     ORDER BY table_name, ordinal_position`,
    [db]
  );

  const [indexes] = await p.query(
    `SELECT table_name, index_name, column_name, non_unique
     FROM information_schema.statistics
     WHERE table_schema = ?
     ORDER BY table_name, index_name, seq_in_index`,
    [db]
  );

  const [fks] = await p.query(
    `SELECT table_name, column_name, referenced_table_name, referenced_column_name
     FROM information_schema.key_column_usage
     WHERE table_schema = ? AND referenced_table_name IS NOT NULL
     ORDER BY table_name, column_name`,
    [db]
  );

  return { tables, columns, indexes, fks };
}
