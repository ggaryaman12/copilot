import test from 'node:test';
import assert from 'node:assert/strict';

import { applyRowLimit, assertSafeReadOnlySql } from '@/lib/security/sqlSafety.js';

test('allows SELECT query', () => {
  const sql = assertSafeReadOnlySql('SELECT * FROM users');
  assert.equal(sql, 'SELECT * FROM users');
});

test('allows EXPLAIN query', () => {
  const sql = assertSafeReadOnlySql('EXPLAIN SELECT * FROM users');
  assert.equal(sql, 'EXPLAIN SELECT * FROM users');
});

test('blocks UPDATE query', () => {
  assert.throws(() => assertSafeReadOnlySql('UPDATE users SET name = "x"'));
});

test('blocks multi statement query', () => {
  assert.throws(() => assertSafeReadOnlySql('SELECT 1; SELECT 2'));
});

test('adds default LIMIT when missing', () => {
  const sql = applyRowLimit('SELECT * FROM users');
  assert.match(sql, /\sLIMIT\s+\d+$/i);
});

test('blocks LIMIT above configured row limit', () => {
  assert.throws(() => applyRowLimit('SELECT * FROM users LIMIT 999999'));
});
