import mongoose from 'mongoose';
import type { FastifyBaseLogger } from 'fastify';
import { config } from '@/config/index.js';

export async function connectMongo(log: FastifyBaseLogger): Promise<void> {
  mongoose.connection.on('error', (err) => log.error({ err }, 'MongoDB connection error'));
  mongoose.connection.on('disconnected', () => log.warn('MongoDB disconnected'));
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
  log.info({ uri: config.mongoUri }, 'MongoDB connected');
}

type MongoStatus = 'connected' | 'connecting' | 'disconnected' | 'disconnecting';

export function mongoStatus(): MongoStatus {
  switch (mongoose.connection.readyState) {
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    case 3:
      return 'disconnecting';
    default:
      return 'disconnected';
  }
}

export { mongoose };
