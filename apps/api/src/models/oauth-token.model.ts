import { Schema, model, type Model } from 'mongoose';
import type { EncryptedBlob } from '@/crypto/aes-gcm.js';
import { EncryptedBlobSchema } from '@/models/encrypted-blob.schema.js';

export interface IOAuthToken {
  userId: string;
  accessToken: EncryptedBlob;
  refreshToken: EncryptedBlob;
  expiresAt: Date;
  scopes: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

const AirtableOAuthTokenSchema = new Schema<IOAuthToken>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    accessToken: { type: EncryptedBlobSchema, required: true },
    refreshToken: { type: EncryptedBlobSchema, required: true },
    expiresAt: { type: Date, required: true },
    scopes: { type: [String], default: [] },
  },
  { timestamps: true, collection: 'airtable_oauth_tokens' },
);

export const AirtableOAuthToken: Model<IOAuthToken> = model<IOAuthToken>(
  'AirtableOAuthToken',
  AirtableOAuthTokenSchema,
);
