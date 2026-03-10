import test from 'node:test';
import assert from 'node:assert/strict';

import { aggregateScores } from '@/lib/eval/scoring.js';

test('passes when structure and citation are present', () => {
  const answer = `
VERIFIED
- Claim: /Users/aryamangupta/YELO/yelo-server/src/routes.js:10
INFERRED
- Note
UNKNOWN
- Missing detail
  `;
  const score = aggregateScores(answer, 'architecture');
  assert.equal(score.pass, true);
});

test('fails when required section is missing', () => {
  const answer = `
VERIFIED
- Claim: /Users/aryamangupta/YELO/yelo-server/src/routes.js:10
INFERRED
- Note
  `;
  const score = aggregateScores(answer, 'architecture');
  assert.equal(score.pass, false);
  assert.equal(score.structure.hasUnknown, false);
});

test('flags unsafe SQL in sql mode', () => {
  const answer = `
VERIFIED
- /Users/aryamangupta/YELO/yelo-server/src/routes.js:10
INFERRED
- Might use update statements
UNKNOWN
- More evidence needed
  `;
  const score = aggregateScores(answer, 'sql');
  assert.equal(score.pass, false);
  assert.equal(score.sql.unsafe, true);
});
