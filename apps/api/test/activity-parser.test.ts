import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ColumnType } from '@airtable-integration/shared';
import { parseActivityResponse } from '@/modules/scraper/activity-parser.js';
import { buildEnvelope, COMMENT_ONLY_ENVELOPE } from './fixtures/activity-html.mock.js';

test('parses a status (select) change', () => {
  const env = buildEnvelope('act1', 'usr1', '2024-06-01T10:00:00Z', [
    { type: 'select', oldVal: 'Open', newVal: 'In Progress' },
  ]);
  const out = parseActivityResponse(env, 'rec1');
  assert.equal(out.length, 1);
  assert.equal(out[0]!.uuid, 'act1:select');
  assert.equal(out[0]!.columnType, ColumnType.Status);
  assert.equal(out[0]!.oldValue, 'Open');
  assert.equal(out[0]!.newValue, 'In Progress');
  assert.equal(out[0]!.authoredBy, 'usr1');
});

test('parses an assignee (collaborator) change', () => {
  const env = buildEnvelope('act2', 'usr2', '2024-06-01T11:00:00Z', [
    { type: 'collaborator', newVal: 'Anees' },
  ]);
  const out = parseActivityResponse(env, 'rec2');
  assert.equal(out.length, 1);
  assert.equal(out[0]!.columnType, ColumnType.Assignee);
});

test('skips comment-only activity (no diff html)', () => {
  assert.equal(parseActivityResponse(COMMENT_ONLY_ENVELOPE, 'rec3').length, 0);
});

test('skips non-status, non-assignee column types', () => {
  const env = buildEnvelope('act4', 'u', '2024-06-01T12:00:00Z', [
    { type: 'multilineText', oldVal: 'a', newVal: 'b' },
  ]);
  assert.equal(parseActivityResponse(env, 'rec4').length, 0);
});

test('mixed activity emits one entry per status/assignee change', () => {
  const env = buildEnvelope('act5', 'u', '2024-06-01T13:00:00Z', [
    { type: 'multilineText', oldVal: 'x', newVal: 'y' },
    { type: 'select', oldVal: 'A', newVal: 'B' },
    { type: 'multipleCollaborators', newVal: 'C' },
  ]);
  const out = parseActivityResponse(env, 'rec5');
  assert.equal(out.length, 2);
  assert.deepEqual(
    out.map((e) => e.columnType).sort(),
    [ColumnType.Assignee, ColumnType.Status],
  );
});
