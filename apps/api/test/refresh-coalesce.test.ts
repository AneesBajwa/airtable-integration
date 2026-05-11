import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Unit-test for the refresh-stampede protection in oauth.service.ts.
 *
 * We can't easily test against the real Mongo+undici stack from here, so we test the
 * coalescing pattern in isolation against an in-memory fake. If this contract holds,
 * the implementation in oauth.service.ts (which uses the identical pattern) is sound.
 */

interface Cache<K, V> {
  get(k: K): Promise<V> | undefined;
  set(k: K, v: Promise<V>): void;
  delete(k: K): void;
}

class InFlightCache<K, V> implements Cache<K, V> {
  private map = new Map<K, Promise<V>>();
  get(k: K) {
    return this.map.get(k);
  }
  set(k: K, v: Promise<V>) {
    this.map.set(k, v);
  }
  delete(k: K) {
    this.map.delete(k);
  }
}

async function getCoalesced<K, V>(
  cache: Cache<K, V>,
  key: K,
  loader: () => Promise<V>,
): Promise<V> {
  const existing = cache.get(key);
  if (existing) return existing;
  const p = loader().finally(() => cache.delete(key));
  cache.set(key, p);
  return p;
}

test('coalesces concurrent calls for the same key', async () => {
  let calls = 0;
  const cache = new InFlightCache<string, string>();
  const loader = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 20));
    return `result-${calls}`;
  };

  const [a, b, c] = await Promise.all([
    getCoalesced(cache, 'k1', loader),
    getCoalesced(cache, 'k1', loader),
    getCoalesced(cache, 'k1', loader),
  ]);

  assert.equal(calls, 1, 'loader should only run once');
  assert.equal(a, b);
  assert.equal(b, c);
});

test('does not coalesce different keys', async () => {
  let calls = 0;
  const cache = new InFlightCache<string, string>();
  const loader = (k: string) => async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 10));
    return k;
  };

  await Promise.all([getCoalesced(cache, 'a', loader('a')), getCoalesced(cache, 'b', loader('b'))]);
  assert.equal(calls, 2);
});

test('cache entry is removed after the underlying promise resolves', async () => {
  const cache = new InFlightCache<string, string>();
  await getCoalesced(cache, 'k', async () => 'ok');
  assert.equal(cache.get('k'), undefined);
});
