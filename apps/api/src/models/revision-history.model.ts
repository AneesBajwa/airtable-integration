import { Schema, model, type Model } from 'mongoose';
import { ColumnType } from '@airtable-integration/shared';

export interface IRevisionHistory {
  uuid: string;
  issueId: string;
  columnType: ColumnType;
  oldValue: string | null;
  newValue: string | null;
  createdDate: Date;
  authoredBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const RevisionHistorySchema = new Schema<IRevisionHistory>(
  {
    uuid: { type: String, required: true, unique: true },
    issueId: { type: String, required: true, index: true },
    columnType: { type: String, enum: Object.values(ColumnType), required: true, index: true },
    oldValue: { type: String, default: null },
    newValue: { type: String, default: null },
    createdDate: { type: Date, required: true },
    authoredBy: { type: String, default: '', index: true },
  },
  { collection: 'revision_history', timestamps: true },
);
RevisionHistorySchema.index({ issueId: 1, createdDate: 1 });

export const RevisionHistory: Model<IRevisionHistory> = model<IRevisionHistory>(
  'RevisionHistory',
  RevisionHistorySchema,
);
