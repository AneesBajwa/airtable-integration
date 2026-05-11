import type { FastifyInstance } from 'fastify';
import { SyncStatus, type SyncStatusResponse } from '@airtable-integration/shared';
import { ReconnectRequiredError } from '@/modules/oauth/oauth.service.js';
import { getSyncStatus, startSync } from '@/modules/sync/sync.service.js';

export default async function syncRoutes(app: FastifyInstance): Promise<void> {
  app.post('/sync/run', async (_req, reply) => {
    try {
      const { id } = await startSync(app.log);
      return { id };
    } catch (err) {
      if (err instanceof ReconnectRequiredError) {
        return reply.code(401).send({ error: 'reconnect_required', message: err.message });
      }
      throw err;
    }
  });

  app.get('/sync/status', async (): Promise<SyncStatusResponse> => {
    return (await getSyncStatus()) ?? { status: SyncStatus.Idle };
  });
}
