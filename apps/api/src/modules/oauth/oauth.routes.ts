import type { FastifyInstance } from 'fastify';
import { config, assertOAuthConfigured } from '@/config/index.js';
import type { OAuthCallbackQuery } from '@/types/api.types.js';
import {
  buildAuthorizeUrl,
  handleCallback,
  isConnected,
  OAuthCallbackError,
} from '@/modules/oauth/oauth.service.js';

export default async function oauthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/auth/airtable/start', async (_req, reply) => {
    try {
      assertOAuthConfigured();
    } catch (err) {
      return reply.code(503).send({ error: (err as Error).message });
    }
    return buildAuthorizeUrl();
  });

  app.get<{ Querystring: OAuthCallbackQuery }>('/auth/airtable/callback', async (req, reply) => {
    const { code, state, error } = req.query;

    if (error) {
      return reply.redirect(`${config.webOrigin}/?auth=error&reason=${encodeURIComponent(error)}`);
    }
    if (!code || !state) {
      return reply.code(400).send({ error: 'Missing code or state' });
    }
    try {
      await handleCallback({ code, state });
    } catch (err) {
      if (err instanceof OAuthCallbackError) {
        return reply.code(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
    return reply.redirect(`${config.webOrigin}/?auth=success`);
  });

  app.get('/auth/airtable/status', () => isConnected());
}
