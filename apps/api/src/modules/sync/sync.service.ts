import type { FastifyBaseLogger } from 'fastify';
import pLimit from 'p-limit';
import { SyncPhase, SyncStatus, type SyncRunSummary } from '@airtable-integration/shared';
import {
  AirtableBase,
  AirtableTable,
  AirtableUser,
} from '@/models/airtable-entities.model.js';
import { SyncRun } from '@/models/sync-run.model.js';
import { upsertRecords } from '@/models/records.repository.js';
import * as airtable from '@/modules/airtable/airtable.client.js';
import { ReconnectRequiredError } from '@/modules/oauth/oauth.service.js';

interface ActiveRun {
  idPromise: Promise<string>;
  promise: Promise<void>;
}

const TABLE_CONCURRENCY = 3;

let activeRun: ActiveRun | null = null;

/** Best-effort wait for an in-flight sync to finish (used by graceful shutdown). */
export const drainActiveSync = async (timeoutMs: number): Promise<void> => {
  if (!activeRun) return;
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  await Promise.race([activeRun.promise.catch(() => undefined), timeout]);
};

/**
 * Start a background sync. Idempotent — concurrent calls return the same run id.
 * Set the slot synchronously before any await so two concurrent callers cannot
 * both spawn separate runs.
 */
export async function startSync(log: FastifyBaseLogger): Promise<{ id: string }> {
  if (activeRun) return { id: await activeRun.idPromise };

  let resolveId!: (id: string) => void;
  let rejectId!: (err: unknown) => void;
  const idPromise = new Promise<string>((resolve, reject) => {
    resolveId = resolve;
    rejectId = reject;
  });

  const runPromise = (async (): Promise<void> => {
    let runId: string;
    try {
      const run = await SyncRun.create({ status: SyncStatus.Running, startedAt: new Date() });
      runId = String(run._id);
      resolveId(runId);
    } catch (err) {
      rejectId(err);
      throw err;
    }
    await doRun(runId, log);
  })().finally(() => {
    activeRun = null;
  });

  activeRun = { idPromise, promise: runPromise };
  return { id: await idPromise };
}

async function doRun(runId: string, log: FastifyBaseLogger): Promise<void> {
  const counters = {
    basesProcessed: 0,
    tablesProcessed: 0,
    recordsProcessed: 0,
    usersProcessed: 0,
  };
  const persistCounters = (): Promise<unknown> =>
    SyncRun.findByIdAndUpdate(runId, { $set: counters });

  let currentPhase: SyncPhase = SyncPhase.Bases;
  const persistPhase = async (next: SyncPhase): Promise<void> => {
    currentPhase = next;
    await SyncRun.findByIdAndUpdate(runId, { $set: { phase: next } });
  };

  try {
    await persistPhase(SyncPhase.Bases);
    const bases = await airtable.listBases();
    for (const b of bases) {
      await AirtableBase.findOneAndUpdate(
        { baseId: b.id },
        {
          $set: {
            baseId: b.id,
            name: b.name,
            permissionLevel: b.permissionLevel,
            syncedAt: new Date(),
          },
        },
        { upsert: true },
      );
    }
    counters.basesProcessed = bases.length;
    await persistCounters();

    await persistPhase(SyncPhase.Tables);
    const tableLimit = pLimit(TABLE_CONCURRENCY);
    let recordsPhaseEntered = false;
    for (const b of bases) {
      const tables = await airtable.listTables(b.id);
      for (const t of tables) {
        await AirtableTable.findOneAndUpdate(
          { baseId: b.id, tableId: t.id },
          {
            $set: {
              baseId: b.id,
              tableId: t.id,
              name: t.name,
              primaryFieldId: t.primaryFieldId,
              fields: t.fields,
              syncedAt: new Date(),
            },
          },
          { upsert: true },
        );
        counters.tablesProcessed++;
      }
      await persistCounters();

      if (!recordsPhaseEntered) {
        await persistPhase(SyncPhase.Records);
        recordsPhaseEntered = true;
      }

      await Promise.all(
        tables.map((t) =>
          tableLimit(async () => {
            const records = await airtable.listRecords(b.id, t.id);
            const docs = records.map((r) => ({
              _recordId: r.id,
              _baseId: b.id,
              _tableId: t.id,
              _syncedAt: new Date(),
              _createdTime: r.createdTime,
              fields: r.fields,
            }));
            const written = await upsertRecords(b.id, t.id, docs);
            counters.recordsProcessed += written;
            await persistCounters();
          }),
        ),
      );
    }

    await persistPhase(SyncPhase.Users);
    const users = await airtable.listUsers();
    for (const u of users) {
      await AirtableUser.findOneAndUpdate(
        { userId: u.id },
        {
          $set: {
            userId: u.id,
            email: u.email ?? '',
            name: u.name ?? '',
            syncedAt: new Date(),
          },
        },
        { upsert: true },
      );
    }
    counters.usersProcessed = users.length;

    await SyncRun.findByIdAndUpdate(runId, {
      $set: { ...counters, status: SyncStatus.Success, completedAt: new Date() },
    });
    log.info({ runId, counters, phase: currentPhase }, 'Sync completed');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const reconnect = err instanceof ReconnectRequiredError;
    await SyncRun.findByIdAndUpdate(runId, {
      $set: {
        ...counters,
        status: SyncStatus.Failed,
        completedAt: new Date(),
        error: reconnect ? `reconnect_required: ${message}` : message,
      },
    });
    log.error({ runId, err, phase: currentPhase }, 'Sync failed');
  }
}

/** Latest sync run summary, or `null` when there has never been a run. */
export async function getSyncStatus(): Promise<SyncRunSummary | null> {
  const latest = await SyncRun.findOne().sort({ createdAt: -1 }).lean();
  if (!latest) return null;
  return {
    id: String(latest._id),
    status: latest.status,
    phase: latest.phase ?? null,
    startedAt: latest.startedAt.toISOString(),
    completedAt: latest.completedAt?.toISOString() ?? null,
    basesProcessed: latest.basesProcessed,
    tablesProcessed: latest.tablesProcessed,
    recordsProcessed: latest.recordsProcessed,
    usersProcessed: latest.usersProcessed,
    error: latest.error,
  };
}
