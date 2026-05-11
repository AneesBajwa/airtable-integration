/**
 * Centralized config loader. Validates required env vars at startup.
 *
 * Uses Node 22's built-in `process.loadEnvFile()` (added in 21.7.0) instead of the
 * `dotenv` package — fewer dependencies, same outcome. The `.env` file at repo root is
 * only loaded when present; production deployments inject env vars directly.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Walk up from this file's directory until we find a `.env`. This makes the loader
 * robust to whichever cwd npm workspaces / tsx use to launch the process.
 * In production, env vars come from the runtime — `.env` is dev-only.
 */
function findEnvFile(): string | null {
  let dir = import.meta.dirname;
  for (;;) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const envPath = findEnvFile();
if (envPath) {
  process.loadEnvFile(envPath);
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined) return fallback;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: num('PORT', 3000),
  nodeEnv: optional('NODE_ENV', 'development'),
  mongoUri: optional('MONGO_URI', 'mongodb://localhost:27017/airtable_integration'),
  webOrigin: optional('WEB_ORIGIN', 'http://localhost:4200'),

  airtable: {
    oauth: {
      // We default to empty strings here so the dev server can still boot without OAuth
      // credentials. The /auth/airtable/start route guards on these being present.
      clientId: optional('AIRTABLE_OAUTH_CLIENT_ID', ''),
      clientSecret: optional('AIRTABLE_OAUTH_CLIENT_SECRET', ''),
      redirectUri: optional(
        'AIRTABLE_OAUTH_REDIRECT_URI',
        'http://localhost:3000/auth/airtable/callback',
      ),
      scopes: optional(
        'AIRTABLE_OAUTH_SCOPES',
        'data.records:read,data.recordComments:read,schema.bases:read,user.email:read',
      )
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      authorizeUrl: 'https://airtable.com/oauth2/v1/authorize',
      tokenUrl: 'https://airtable.com/oauth2/v1/token',
      apiBase: 'https://api.airtable.com/v0',
    },
    scraper: {
      email: optional('AIRTABLE_SCRAPER_EMAIL', ''),
      password: optional('AIRTABLE_SCRAPER_PASSWORD', ''),
      // ASSUMPTION #9: activity-endpoint path template. Captured from Airtable's web UI
      // — undocumented and may change. `{recordId}` is substituted at request time.
      // Override via env without code changes.
      activityPath: optional(
        'AIRTABLE_ACTIVITY_PATH',
        '/v0.3/row/{recordId}/readRowActivitiesAndComments',
      ),
      // ASSUMPTION #13: 10 records in flight at once.
      concurrency: num('SCRAPER_CONCURRENCY', 10),
    },
    pageThrottleMs: num('AIRTABLE_PAGE_THROTTLE_MS', 200),
    maxRetries: num('AIRTABLE_MAX_RETRIES', 3),
  },

  // Encryption keys — required at startup. We don't fail the import; we let crypto/aes-gcm
  // do the validation so the error message is consistent with the rest of the crypto module.
  tokenEncryptionKey: process.env['TOKEN_ENCRYPTION_KEY'] ?? '',
  scraperEncryptionKey: process.env['SCRAPER_ENCRYPTION_KEY'] ?? '',

  // ASSUMPTION #8: there is no auth system; everything is keyed on a single demo user.
  demoUserId: 'demo',
};

export function assertOAuthConfigured(): void {
  if (!config.airtable.oauth.clientId || !config.airtable.oauth.clientSecret) {
    throw new Error(
      'Airtable OAuth not configured. Set AIRTABLE_OAUTH_CLIENT_ID and AIRTABLE_OAUTH_CLIENT_SECRET in .env.',
    );
  }
}
