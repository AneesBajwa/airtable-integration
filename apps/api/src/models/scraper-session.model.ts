import { Schema, model, type Model } from 'mongoose';
import { ScraperState } from '@airtable-integration/shared';
import type { EncryptedBlob } from '@/crypto/aes-gcm.js';
import { EncryptedBlobSchema } from '@/models/encrypted-blob.schema.js';

export interface IScraperSession {
  userId: string;
  state: ScraperState;
  cookies: EncryptedBlob | null;
  csrfToken: EncryptedBlob | null;
  expiresAt: Date | null;
  lastError: string | null;
  progress: {
    total: number;
    processed: number;
    failed: number;
    startedAt: Date | null;
    completedAt: Date | null;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

const ScraperSessionSchema = new Schema<IScraperSession>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    state: {
      type: String,
      enum: Object.values(ScraperState),
      default: ScraperState.Idle,
    },
    cookies: { type: EncryptedBlobSchema, default: null },
    csrfToken: { type: EncryptedBlobSchema, default: null },
    expiresAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    progress: {
      total: { type: Number, default: 0 },
      processed: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      startedAt: { type: Date, default: null },
      completedAt: { type: Date, default: null },
    },
  },
  { collection: 'scraper_sessions', timestamps: true },
);

export const ScraperSession: Model<IScraperSession> = model<IScraperSession>(
  'ScraperSession',
  ScraperSessionSchema,
);
