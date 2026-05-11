import type { FastifyInstance } from 'fastify';
import { ScraperState } from '@airtable-integration/shared';
import { config } from '@/config/index.js';
import type { MfaSubmitBody } from '@/types/api.types.js';
import { mfaBus } from '@/modules/scraper/mfa-bus.js';
import {
  getProgress,
  getScraperState,
  startScrape,
} from '@/modules/scraper/scraper.service.js';

const MFA_CODE_RE = /^\d{6}$/;

export default async function scraperRoutes(app: FastifyInstance): Promise<void> {
  app.post('/scrape/run', async (_req, reply) => {
    const state = await getScraperState();
    if (state.state === ScraperState.AwaitingMfa) {
      return reply.code(412).send({ error: 'awaiting_mfa', state: state.state });
    }
    return startScrape(app.log);
  });

  app.get('/scrape/status', () => getProgress());
  app.get('/scraper/state', () => getScraperState());

  app.post<{ Body: MfaSubmitBody }>('/scraper/mfa', (req, reply) => {
    const code = (req.body?.code ?? '').trim();
    if (!MFA_CODE_RE.test(code)) {
      return reply
        .code(400)
        .send({ error: 'invalid_code', message: 'MFA code must be exactly 6 digits' });
    }
    if (!mfaBus.submitCode(config.demoUserId, code)) {
      return reply
        .code(409)
        .send({ error: 'no_pending_mfa', message: 'Scraper is not awaiting an MFA code right now' });
    }
    return { ok: true };
  });
}
