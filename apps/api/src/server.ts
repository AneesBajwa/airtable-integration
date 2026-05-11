import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import closeWithGrace from 'close-with-grace';
import { config } from '@/config/index.js';
import { assertKeyValid } from '@/crypto/aes-gcm.js';
import { connectMongo, mongoose } from '@/db/mongo.js';
import { closeAllBrowsers } from '@/modules/scraper/cookie-acquirer.js';
import { drainActiveSync } from '@/modules/sync/sync.service.js';
import { drainActiveScrape } from '@/modules/scraper/scraper.service.js';
import oauthRoutes from '@/modules/oauth/oauth.routes.js';
import syncRoutes from '@/modules/sync/sync.routes.js';
import scraperRoutes from '@/modules/scraper/scraper.routes.js';
import collectionsRoutes from '@/modules/collections/collections.routes.js';
import healthRoutes from '@/modules/health/health.routes.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;
const BACKGROUND_DRAIN_MS = 5_000;

async function build(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.nodeEnv === 'development' ? 'debug' : 'info',
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.accessToken.*',
        '*.refreshToken.*',
        '*.cookies.*',
        '*.csrfToken.*',
      ],
      transport:
        config.nodeEnv === 'development'
          ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', singleLine: true } }
          : undefined,
    },
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
    },
  });

  await app.register(cors, { origin: config.webOrigin, credentials: true });

  await connectMongo(app.log);

  await app.register(healthRoutes);
  await app.register(oauthRoutes);
  await app.register(syncRoutes);
  await app.register(scraperRoutes);
  await app.register(collectionsRoutes);

  return app;
}

async function main(): Promise<void> {
  try {
    assertKeyValid(config.tokenEncryptionKey, 'TOKEN_ENCRYPTION_KEY');
    assertKeyValid(config.scraperEncryptionKey, 'SCRAPER_ENCRYPTION_KEY');
  } catch (err) {
    process.stderr.write(`[startup] ${(err as Error).message}\n`);
    process.exit(1);
  }

  const app = await build();

  closeWithGrace({ delay: SHUTDOWN_TIMEOUT_MS }, async ({ err, signal }) => {
    if (err) app.log.error({ err }, 'Server crashed; shutting down');
    else if (signal) app.log.info({ signal }, 'Received shutdown signal');
    await closeAllBrowsers();
    await app.close();
    await Promise.allSettled([
      drainActiveSync(BACKGROUND_DRAIN_MS),
      drainActiveScrape(BACKGROUND_DRAIN_MS),
    ]);
    await mongoose.disconnect();
  });

  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`API listening on http://localhost:${config.port}`);
}

main().catch((err) => {
  process.stderr.write(`Fatal startup error: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
