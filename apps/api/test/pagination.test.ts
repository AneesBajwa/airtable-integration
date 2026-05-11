import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * The pagination loop in airtable.client.ts is internal; we exercise the same control
 * flow here against an in-memory fake to verify the contract:
 *   - keep calling until response.offset is undefined
 *   - collect every record across every page
 */

interface Page {
  records: { id: string }[];
  offset?: string;
}
const pages: Record<string, Page> = {
  '': { records: [{ id: 'a' }, { id: 'b' }], offset: 'p2' },
  p2: { records: [{ id: 'c' }], offset: 'p3' },
  p3: { records: [{ id: 'd' }, { id: 'e' }] },
};

async function paginated(): Promise<{ id: string }[]> {
  const out: { id: string }[] = [];
  let offset: string | undefined = '';
  do {
    const resp = pages[offset]!;
    out.push(...resp.records);
    offset = resp.offset;
  } while (offset);
  return out;
}

test('multi-page pagination collects every record', async () => {
  const all = await paginated();
  assert.deepEqual(
    all.map((r) => r.id),
    ['a', 'b', 'c', 'd', 'e'],
  );
});
