import test from 'node:test';
import assert from 'node:assert/strict';

import { env } from '@/lib/config/env.js';
import { assertApiKey } from '@/lib/auth/guard.js';
import { isInScope } from '@/lib/rag/scope.js';

function mockRequest(headers) {
  return {
    headers: {
      get(name) {
        return headers[name.toLowerCase()] || null;
      }
    }
  };
}

test('accepts valid API key', () => {
  const req = mockRequest({ 'x-api-key': env.apiKey });
  assert.equal(assertApiKey(req), true);
});

test('rejects invalid API key', () => {
  const req = mockRequest({ 'x-api-key': 'invalid-key' });
  assert.equal(assertApiKey(req), false);
});

test('includes only configured repo scope paths', () => {
  const inScopePath = `${env.scopePaths[0]}/src/index.js`;
  const outOfScopePath = '/Users/aryamangupta/YELO/payment-gateways/src/index.js';
  assert.equal(isInScope(inScopePath), true);
  assert.equal(isInScope(outOfScopePath), false);
});
