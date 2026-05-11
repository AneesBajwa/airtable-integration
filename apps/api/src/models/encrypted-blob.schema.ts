import { Schema } from 'mongoose';
import type { EncryptedBlob } from '@/crypto/aes-gcm.js';

/** Reusable Mongoose subdocument schema for AES-GCM encrypted fields. */
export const EncryptedBlobSchema = new Schema<EncryptedBlob>(
  {
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
  },
  { _id: false },
);
