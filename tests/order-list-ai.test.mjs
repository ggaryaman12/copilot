import test from 'node:test';
import assert from 'node:assert/strict';

import context from '../data/context/order-list-context.json' assert { type: 'json' };
import { parseDeterministicOrderPrompt } from '@/lib/order-list/planner.js';
import { buildOrderListQuery } from '@/lib/order-list/query.js';

test('parses customer amount and date range filters from natural language', () => {
  const prompt = 'find me the completed orders from customer id 300 where order amount is greater than 3000 from 1 feb to 28 feb';
  const plan = parseDeterministicOrderPrompt(prompt, context, new Date('2026-03-24T00:00:00Z'));

  assert.equal(plan.entity, 'orders');
  assert.equal(plan.unsupported, '');
  assert.deepEqual(
    plan.filters.map((item) => item.field).sort(),
    ['creation_datetime', 'customer_id', 'job_status', 'total_amount'].sort()
  );
});

test('builds scoped query for order list AI', () => {
  const query = buildOrderListQuery({
    context,
    plan: {
      entity: 'orders',
      filters: [
        { field: 'customer_id', operator: 'eq', value: 300 },
        { field: 'total_amount', operator: 'gt', value: 3000 }
      ]
    },
    requestScope: {
      marketplaceUserId: 510012362,
      userRole: 1
    }
  });

  assert.match(query.sql, /FROM tb_jobs j/);
  assert.match(query.sql, /LEFT JOIN tb_job_payment_details tjpd/);
  assert.match(query.sql, /j\.marketplace_user_id = \?/);
  assert.match(query.sql, /j\.customer_id = \?/);
  assert.match(query.sql, /IFNULL\(tjpd\.total_amount, 0\) > \?/);
  assert.deepEqual(query.values, [510012362, 300, 3000]);
});

test('marks aggregate prompts as unsupported', () => {
  const plan = parseDeterministicOrderPrompt('find me total revenue last month', context, new Date('2026-03-24T00:00:00Z'));
  assert.equal(plan.unsupported, 'revenue');
});
