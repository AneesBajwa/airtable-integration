import { Schema, model } from 'mongoose';

// Bases / tables / users use fixed-name collections. Records live in per-table
// collections — see records.repository.ts.

const AirtableBaseSchema = new Schema(
  {
    baseId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    permissionLevel: { type: String, default: '' },
    syncedAt: { type: Date, default: Date.now },
  },
  { collection: 'airtable_bases' },
);

const AirtableTableSchema = new Schema(
  {
    baseId: { type: String, required: true, index: true },
    tableId: { type: String, required: true },
    name: { type: String, required: true },
    primaryFieldId: { type: String, default: '' },
    fields: { type: Schema.Types.Mixed, default: [] },
    syncedAt: { type: Date, default: Date.now },
  },
  { collection: 'airtable_tables' },
);
AirtableTableSchema.index({ baseId: 1, tableId: 1 }, { unique: true });

const AirtableUserSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    email: { type: String, default: '' },
    name: { type: String, default: '' },
    syncedAt: { type: Date, default: Date.now },
  },
  { collection: 'airtable_users' },
);

export const AirtableBase = model('AirtableBase', AirtableBaseSchema);
export const AirtableTable = model('AirtableTable', AirtableTableSchema);
export const AirtableUser = model('AirtableUser', AirtableUserSchema);
