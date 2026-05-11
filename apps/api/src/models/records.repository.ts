import { mongoose } from '@/db/mongo.js';

/**
 * Records are stored in dynamic per-table collections named
 * `airtable_records_<baseId>_<tableId>`. Document shape mirrors Airtable's response,
 * so we use the underlying driver directly rather than a Mongoose schema.
 */

const recordsCollectionName = (baseId: string, tableId: string): string =>
  `airtable_records_${baseId}_${tableId}`;

export interface AirtableRecordDoc {
  _recordId: string;
  _baseId: string;
  _tableId: string;
  _syncedAt: Date;
  _createdTime?: string;
  fields: Record<string, unknown>;
}

const indexedCollections = new Set<string>();

/** Bulk-upsert by `_recordId`. Creates a wildcard text index once per collection. */
export async function upsertRecords(
  baseId: string,
  tableId: string,
  rows: AirtableRecordDoc[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const name = recordsCollectionName(baseId, tableId);
  const coll = mongoose.connection.collection(name);

  if (!indexedCollections.has(name)) {
    try {
      await coll.createIndex({ '$**': 'text' }, { name: 'fields_text_idx' });
    } catch {
      /* Mongo allows only one text index per collection — fall back to regex on read. */
    }
    indexedCollections.add(name);
  }

  const ops = rows.map((row) => ({
    updateOne: {
      filter: { _recordId: row._recordId },
      update: { $set: row },
      upsert: true,
    },
  }));
  const result = await coll.bulkWrite(ops, { ordered: false });
  return (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0);
}

/** List collections produced by Airtable sync (used by the Entity dropdown). */
export async function listAirtableCollections(): Promise<{ name: string; count: number }[]> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');
  const colls = await db.listCollections().toArray();
  const names = colls
    .map((c) => c.name)
    .filter((n) => n.startsWith('airtable_') || n === 'revision_history')
    .sort();
  return Promise.all(
    names.map(async (name) => ({
      name,
      count: await mongoose.connection.collection(name).countDocuments(),
    })),
  );
}
