import { request } from 'undici';
import { config } from '@/config/index.js';
import { getAccessToken } from '@/modules/oauth/oauth.service.js';
import type { RawBase, RawRecord, RawTable, RawUser } from '@/types/airtable.types.js';

interface AirtableListResponse<T> {
  records?: T[];
  bases?: T[];
  tables?: T[];
  users?: T[];
  offset?: string;
}

const RATE_LIMIT_FLOOR_MS = 30_000;
const MAX_PAGES = 10_000;

const sleep = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms));

/** Parse `Retry-After` (RFC 7231 §7.1.3): seconds OR HTTP-date. */
function parseRetryAfterMs(header: string | string[] | undefined): number {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return 0;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const dateMs = Date.parse(raw);
  if (Number.isFinite(dateMs)) {
    const delta = dateMs - Date.now();
    return delta > 0 ? delta : 0;
  }
  return 0;
}

async function airtableGet<T>(
  path: string,
  query: Record<string, string | undefined> = {},
): Promise<T> {
  const accessToken = await getAccessToken();
  const url = new URL(`${config.airtable.oauth.apiBase}${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }

  let attempt = 0;
  for (;;) {
    const res = await request(url.toString(), {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    if (res.statusCode === 200) {
      return (await res.body.json()) as T;
    }

    if (res.statusCode === 429 && attempt < config.airtable.maxRetries) {
      const retryAfterMs = parseRetryAfterMs(res.headers['retry-after']);
      const delay = Math.max(retryAfterMs, RATE_LIMIT_FLOOR_MS) + 1000 * attempt;
      await res.body.dump();
      await sleep(delay);
      attempt++;
      continue;
    }

    const body = await res.body.text();
    throw new Error(`Airtable GET ${path} → ${res.statusCode}: ${body}`);
  }
}

async function paginated<T>(
  path: string,
  collect: (resp: AirtableListResponse<T>) => T[],
  extraQuery: Record<string, string | undefined> = {},
): Promise<T[]> {
  const out: T[] = [];
  let offset: string | undefined = undefined;
  let pages = 0;
  do {
    if (++pages > MAX_PAGES) {
      throw new Error(`Airtable pagination exceeded ${MAX_PAGES} pages on ${path}`);
    }
    const resp: AirtableListResponse<T> = await airtableGet<AirtableListResponse<T>>(path, {
      ...extraQuery,
      offset,
    });
    out.push(...collect(resp));
    offset = resp.offset;
  } while (offset);
  return out;
}

export const listBases = (): Promise<RawBase[]> =>
  paginated<RawBase>('/meta/bases', (r) => r.bases ?? []);

export const listTables = (baseId: string): Promise<RawTable[]> =>
  paginated<RawTable>(`/meta/bases/${baseId}/tables`, (r) => r.tables ?? []);

export const listRecords = (baseId: string, tableId: string): Promise<RawRecord[]> =>
  paginated<RawRecord>(`/${baseId}/${tableId}`, (r) => r.records ?? [], { pageSize: '100' });

// Airtable's public API has no `/users` list endpoint — `whoami` returns the
// connected user, which is the closest equivalent.
export async function listUsers(): Promise<RawUser[]> {
  const me = await airtableGet<RawUser>('/meta/whoami');
  return me.id ? [me] : [];
}
