import type { FastifyInstance } from 'fastify';
import { FieldType } from '@airtable-integration/shared';
import { mongoose } from '@/db/mongo.js';
import { listAirtableCollections } from '@/models/records.repository.js';
import type { CollectionListQuery } from '@/types/api.types.js';

/**
 * Drives the Part C UI:
 *   - `/collections`           Entity dropdown options
 *   - `/collections/:name/columns`  dynamic AG Grid columns
 *   - `/collections/:name`     paginated rows with sort + search
 *
 * Security: collection name and sort field are both regex-allowlisted to prevent
 * NoSQL injection and unbounded scans.
 */

const COLLECTION_NAME_RE = /^(airtable_[a-zA-Z0-9_]+|revision_history)$/;
const SORT_FIELD_RE = /^[a-zA-Z][a-zA-Z0-9_.]{0,63}$/;

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;
const COLUMN_SAMPLE = 50;

const isAllowedCollection = (name: string): boolean => COLLECTION_NAME_RE.test(name);

function inferType(value: unknown): FieldType {
  if (value === null || value === undefined) return FieldType.String;
  if (typeof value === 'number') return FieldType.Number;
  if (typeof value === 'boolean') return FieldType.Boolean;
  if (value instanceof Date) return FieldType.Date;
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}/.test(value)) return FieldType.Date;
    return FieldType.String;
  }
  return FieldType.Object;
}

const textIndexedCache = new Set<string>();

async function hasTextIndex(name: string): Promise<boolean> {
  if (textIndexedCache.has(name)) return true;
  const indexes = await mongoose.connection.collection(name).indexes();
  const found = indexes.some((idx) =>
    Object.values(idx['key'] as Record<string, unknown>).includes('text'),
  );
  if (found) textIndexedCache.add(name);
  return found;
}

const escapeRegex = (input: string): string => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default async function collectionsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/collections', () => listAirtableCollections());

  app.get<{ Params: { name: string } }>('/collections/:name/columns', async (req, reply) => {
    const name = req.params.name;
    if (!isAllowedCollection(name)) return reply.code(404).send({ error: 'not_allowed' });

    const docs = await mongoose.connection.collection(name).find({}).limit(COLUMN_SAMPLE).toArray();
    const fieldMap = new Map<string, FieldType>();
    for (const doc of docs) {
      const fieldsValue = doc['fields'];
      const payload =
        fieldsValue && typeof fieldsValue === 'object' && fieldsValue !== null
          ? (fieldsValue as Record<string, unknown>)
          : (doc as Record<string, unknown>);
      for (const [k, v] of Object.entries(payload)) {
        if (k.startsWith('_') || k === '__v') continue;
        if (!fieldMap.has(k)) fieldMap.set(k, inferType(v));
      }
    }
    return Array.from(fieldMap.entries()).map(([key, type]) => ({ key, type }));
  });

  app.get<{ Params: { name: string }; Querystring: CollectionListQuery }>(
    '/collections/:name',
    async (req, reply) => {
      const name = req.params.name;
      if (!isAllowedCollection(name)) return reply.code(404).send({ error: 'not_allowed' });

      const page = Math.max(1, Number(req.query.page ?? '1'));
      const pageSize = Math.min(
        MAX_PAGE_SIZE,
        Math.max(1, Number(req.query.pageSize ?? DEFAULT_PAGE_SIZE)),
      );
      const skip = (page - 1) * pageSize;

      const filter: Record<string, unknown> = {};
      if (req.query.q && req.query.q.trim().length > 0) {
        const q = req.query.q.trim();
        if (await hasTextIndex(name)) {
          filter['$text'] = { $search: q };
        } else {
          const sample = await mongoose.connection.collection(name).find({}).limit(COLUMN_SAMPLE).toArray();
          const stringFields = new Set<string>();
          for (const doc of sample) {
            for (const [k, v] of Object.entries(doc)) {
              if (k.startsWith('_') || k === '__v') continue;
              if (typeof v === 'string') stringFields.add(k);
            }
          }
          const escaped = escapeRegex(q);
          if (stringFields.size > 0) {
            filter['$or'] = Array.from(stringFields).map((f) => ({
              [f]: { $regex: escaped, $options: 'i' },
            }));
          }
        }
      }

      const sortDef: Record<string, 1 | -1> = {};
      if (req.query.sort) {
        const [field, dir] = req.query.sort.split(':');
        if (!field || !SORT_FIELD_RE.test(field) || field.startsWith('_') || field.startsWith('$')) {
          return reply.code(400).send({ error: 'invalid_sort_field' });
        }
        if (dir !== 'asc' && dir !== 'desc') {
          return reply.code(400).send({ error: 'invalid_sort_direction' });
        }
        sortDef[field] = dir === 'desc' ? -1 : 1;
      }

      const cursor = mongoose.connection
        .collection(name)
        .find(filter)
        .skip(skip)
        .limit(pageSize);
      if (Object.keys(sortDef).length > 0) cursor.sort(sortDef);

      const [rows, total] = await Promise.all([
        cursor.toArray(),
        mongoose.connection.collection(name).countDocuments(filter),
      ]);
      return { rows, total, page, pageSize };
    },
  );
}
