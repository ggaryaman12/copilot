import test from 'node:test';
import assert from 'node:assert/strict';

import { inferIntent } from '@/lib/agents/intent.js';
import { proposeTables } from '@/lib/agents/table.js';
import { pruneColumns } from '@/lib/agents/columnPrune.js';

test('intent maps dashboard prompt to dashboard + server domains', () => {
  const out = inferIntent({ mode: 'flow', prompt: 'dashboard merchant order list API issue' });
  assert.equal(out.domains.includes('yelo-dashboard-angular'), true);
  assert.equal(out.domains.includes('yelo-server'), true);
});

test('table agent respects user selected tables', () => {
  const schema = { tables: [{ table_name: 'orders' }], columns: [] };
  const out = proposeTables({ prompt: 'order query', schema, selectedTables: ['users', 'orders'] });
  assert.deepEqual(out.finalTables, ['users', 'orders']);
});

test('column prune returns columns grouped per table', () => {
  const schema = {
    columns: [
      { table_name: 'orders', column_name: 'id' },
      { table_name: 'orders', column_name: 'customer_id' },
      { table_name: 'orders', column_name: 'created_at' }
    ]
  };
  const out = pruneColumns({ prompt: 'latest orders by customer', schema, tables: ['orders'] });
  assert.equal(Array.isArray(out.orders), true);
  assert.equal(out.orders.includes('customer_id'), true);
});
