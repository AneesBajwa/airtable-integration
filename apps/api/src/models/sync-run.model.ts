import { Schema, model, type Model } from 'mongoose';
import { SyncPhase, SyncStatus } from '@airtable-integration/shared';

export interface ISyncRun {
  status: SyncStatus;
  phase: SyncPhase | null;
  startedAt: Date;
  completedAt: Date | null;
  basesProcessed: number;
  tablesProcessed: number;
  recordsProcessed: number;
  usersProcessed: number;
  error: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const SyncRunSchema = new Schema<ISyncRun>(
  {
    status: {
      type: String,
      enum: Object.values(SyncStatus),
      default: SyncStatus.Pending,
      index: true,
    },
    phase: {
      type: String,
      enum: Object.values(SyncPhase),
      default: null,
    },
    startedAt: { type: Date, default: () => new Date() },
    completedAt: { type: Date, default: null },
    basesProcessed: { type: Number, default: 0 },
    tablesProcessed: { type: Number, default: 0 },
    recordsProcessed: { type: Number, default: 0 },
    usersProcessed: { type: Number, default: 0 },
    error: { type: String, default: null },
  },
  { collection: 'sync_runs', timestamps: true },
);

export const SyncRun: Model<ISyncRun> = model<ISyncRun>('SyncRun', SyncRunSchema);
