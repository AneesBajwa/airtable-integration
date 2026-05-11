import type { FastifyInstance } from 'fastify';
import { mongoStatus } from '@/db/mongo.js';

export default async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', () => ({ ok: true, mongo: mongoStatus() }));
}
