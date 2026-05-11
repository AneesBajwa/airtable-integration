import { request } from 'undici';
import pLimit from 'p-limit';
import type { FastifyBaseLogger } from 'fastify';
import { ScraperState, type ScrapeRunStatus } from '@airtable-integration/shared';
import { config } from '@/config/index.js';
import { ScraperSession } from '@/models/scraper-session.model.js';
import { RevisionHistory } from '@/models/revision-history.model.js';
import { mongoose } from '@/db/mongo.js';
import { parseActivityResponse, type ActivityEnvelope } from '@/modules/scraper/activity-parser.js';
import {
  acquireCookies,
  loadSession,
  type DecryptedSession,
} from '@/modules/scraper/cookie-acquirer.js';

/**
 * Coordinates: probe cookies → optional acquire → scrape every record's revision history.
 *
 * Activation is reserved synchronously before any await so concurrent `POST /scrape/run`
 * cannot both start a run. Progress is persisted to `scraper_sessions.progress` so the
 * UI can recover after a process restart.
 */

const RETRY_DELAYS_MS = [1000, 2000, 4000];
const PROBE_URL = 'https://airtable.com/v0.3/auth/loginUser';

let activeRun: Promise<void> | null = null;

const sleep = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms));

/** Best-effort wait for an in-flight scrape to finish (used by graceful shutdown). */
export const drainActiveScrape = async (timeoutMs: number): Promise<void> => {
  if (!activeRun) return;
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  await Promise.race([activeRun.catch(() => undefined), timeout]);
};

async function setState(state: ScraperState, lastError: string | null = null): Promise<void> {
  await ScraperSession.findOneAndUpdate(
    { userId: config.demoUserId },
    { $set: { userId: config.demoUserId, state, lastError } },
    { upsert: true },
  );
}

interface ProgressPatch {
  total?: number;
  processed?: number;
  failed?: number;
  startedAt?: Date | null;
  completedAt?: Date | null;
}

async function setProgress(patch: ProgressPatch): Promise<void> {
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    update[`progress.${k}`] = v;
  }
  await ScraperSession.findOneAndUpdate(
    { userId: config.demoUserId },
    { $set: update },
    { upsert: true },
  );
}

/** True if the cookies are still valid. Only 401/403 means "invalid"; 3xx (redirect to dashboard) is OK. */
async function probeCookies(session: DecryptedSession): Promise<boolean> {
  try {
    const res = await request(PROBE_URL, {
      method: 'GET',
      headers: { cookie: session.cookieHeader },
    });
    await res.body.dump();
    if (res.statusCode === 401 || res.statusCode === 403) return false;
    return res.statusCode >= 200 && res.statusCode < 400;
  } catch {
    return false;
  }
}

const ACTIVITY_QUERY = JSON.stringify({
  limit: 100,
  offsetV2: null,
  shouldReturnDeserializedActivityItems: true,
  shouldIncludeRowActivityOrCommentUserObjById: true,
});

function randomToken(prefix: string): string {
  return prefix + Math.random().toString(36).slice(2, 18);
}

async function fetchActivity(
  recordId: string,
  appId: string,
  session: DecryptedSession,
): Promise<ActivityEnvelope> {
  const path = config.airtable.scraper.activityPath.replace('{recordId}', recordId);
  const url =
    `https://airtable.com${path}` +
    `?stringifiedObjectParams=${encodeURIComponent(ACTIVITY_QUERY)}` +
    `&requestId=${randomToken('req')}`;

  const headers: Record<string, string> = {
    cookie: session.cookieHeader,
    accept: 'application/json, text/javascript, */*; q=0.01',
    'x-requested-with': 'XMLHttpRequest',
    'x-airtable-application-id': appId,
    'x-airtable-inter-service-client': 'webClient',
    'x-time-zone': 'UTC',
    'x-user-locale': 'en',
  };
  if (session.csrfToken) headers['x-airtable-csrf-token'] = session.csrfToken;

  const res = await request(url, { method: 'GET', headers });

  if (res.statusCode === 401 || res.statusCode === 403) {
    throw new Error(`auth_expired:${res.statusCode}`);
  }
  if (res.statusCode >= 500) throw new Error(`server_error:${res.statusCode}`);
  if (res.statusCode !== 200) {
    const body = await res.body.text();
    throw new Error(`activity_endpoint:${res.statusCode}:${body.slice(0, 200)}`);
  }

  return (await res.body.json()) as ActivityEnvelope;
}

async function fetchWithRetry(
  recordId: string,
  appId: string,
  session: DecryptedSession,
): Promise<ActivityEnvelope> {
  for (const delay of RETRY_DELAYS_MS) {
    try {
      return await fetchActivity(recordId, appId, session);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith('auth_expired:')) throw err;
      await sleep(delay);
    }
  }
  return await fetchActivity(recordId, appId, session);
}

async function persistEntries(entries: ReturnType<typeof parseActivityResponse>): Promise<void> {
  if (entries.length === 0) return;
  await RevisionHistory.bulkWrite(
    entries.map((e) => ({
      updateOne: {
        filter: { uuid: e.uuid },
        update: { $set: { ...e, createdDate: new Date(e.createdDate) } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

interface RecordRef {
  recordId: string;
  baseId: string;
}

async function listAllRecordRefs(): Promise<RecordRef[]> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');
  const colls = await db.listCollections().toArray();
  const recordColls = colls.map((c) => c.name).filter((n) => n.startsWith('airtable_records_'));
  const refs: RecordRef[] = [];
  for (const name of recordColls) {
    const docs = await db
      .collection(name)
      .find({}, { projection: { _recordId: 1, _baseId: 1 } })
      .toArray();
    for (const d of docs) {
      const recordId = d['_recordId'];
      const baseId = d['_baseId'];
      if (typeof recordId === 'string' && typeof baseId === 'string') {
        refs.push({ recordId, baseId });
      }
    }
  }
  return refs;
}

async function ensureSession(log: FastifyBaseLogger): Promise<DecryptedSession> {
  let session = await loadSession();
  if (session && (await probeCookies(session))) return session;
  log.info('Scraper cookies missing or invalid — acquiring fresh');
  await acquireCookies(log);
  session = await loadSession();
  if (!session) throw new Error('Could not load scraper session after acquisition');
  return session;
}

const PROGRESS_FLUSH_EVERY = 25;

async function doScrape(log: FastifyBaseLogger): Promise<void> {
  try {
    const session = await ensureSession(log);
    const refs = await listAllRecordRefs();
    await setProgress({ total: refs.length });

    let processed = 0;
    let failed = 0;
    let lastFlushed = 0;
    let authExpired = false;
    const limit = pLimit(config.airtable.scraper.concurrency);

    const flush = async (): Promise<void> => {
      if (processed + failed - lastFlushed < PROGRESS_FLUSH_EVERY) return;
      lastFlushed = processed + failed;
      await setProgress({ processed, failed });
    };

    await Promise.all(
      refs.map((ref) =>
        limit(async () => {
          // Once any record reports auth_expired, fail the rest fast — don't waste
          // requests on a session that's already invalid.
          if (authExpired) {
            failed++;
            return;
          }
          try {
            const envelope = await fetchWithRetry(ref.recordId, ref.baseId, session);
            await persistEntries(parseActivityResponse(envelope, ref.recordId));
            processed++;
          } catch (err) {
            failed++;
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.startsWith('auth_expired:')) {
              authExpired = true;
            }
            log.warn({ err: msg, recordId: ref.recordId }, 'Scrape failed for record');
          }
          await flush();
        }),
      ),
    );

    await setProgress({ processed, failed });
    if (authExpired) {
      await setState(ScraperState.Failed, 'auth_expired');
    } else {
      await setState(ScraperState.Ready);
    }
    await setProgress({ completedAt: new Date() });
    log.info({ processed, failed, total: refs.length, authExpired }, 'Scrape completed');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setState(ScraperState.Failed, message);
    await setProgress({ completedAt: new Date() });
    log.error({ err }, 'Scrape failed');
  }
}

/** Start a scrape if one isn't already running. The slot is reserved synchronously. */
export function startScrape(log: FastifyBaseLogger): { ok: true } {
  if (activeRun) return { ok: true };
  const run = (async (): Promise<void> => {
    await setState(ScraperState.Scraping);
    await ScraperSession.findOneAndUpdate(
      { userId: config.demoUserId },
      {
        $set: {
          'progress.total': 0,
          'progress.processed': 0,
          'progress.failed': 0,
          'progress.startedAt': new Date(),
          'progress.completedAt': null,
        },
      },
    );
    await doScrape(log);
  })().finally(() => {
    activeRun = null;
  });
  activeRun = run;
  return { ok: true };
}

export async function getScraperState(): Promise<{
  state: ScraperState;
  cookiesExpireAt: string | null;
  lastError: string | null;
}> {
  const doc = await ScraperSession.findOne({ userId: config.demoUserId }).lean();
  return {
    state: doc?.state ?? ScraperState.Idle,
    cookiesExpireAt: doc?.expiresAt?.toISOString() ?? null,
    lastError: doc?.lastError ?? null,
  };
}

export async function getProgress(): Promise<ScrapeRunStatus> {
  const doc = await ScraperSession.findOne({ userId: config.demoUserId }).lean();
  return {
    state: doc?.state ?? ScraperState.Idle,
    total: doc?.progress?.total ?? 0,
    processed: doc?.progress?.processed ?? 0,
    failed: doc?.progress?.failed ?? 0,
    startedAt: doc?.progress?.startedAt?.toISOString() ?? null,
    completedAt: doc?.progress?.completedAt?.toISOString() ?? null,
  };
}
