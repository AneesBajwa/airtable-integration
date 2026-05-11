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
      // Airtable's internal endpoint — undocumented, may change. `{recordId}` is
      // substituted per request. Override via env without redeploying.
      activityPath: optional(
        'AIRTABLE_ACTIVITY_PATH',
        '/v0.3/row/{recordId}/readRowActivitiesAndComments',
      ),
      concurrency: num('SCRAPER_CONCURRENCY', 10),
    },
    maxRetries: num('AIRTABLE_MAX_RETRIES', 3),
  },

  // Validated lazily by `crypto/aes-gcm` on first use so missing-key errors all
  // route through the same code path.
  tokenEncryptionKey: process.env['TOKEN_ENCRYPTION_KEY'] ?? '',
  scraperEncryptionKey: process.env['SCRAPER_ENCRYPTION_KEY'] ?? '',

  // Single-user deployment: no per-request auth, everything is keyed on this id.
  demoUserId: 'demo',
};

export function assertOAuthConfigured(): void {
  if (!config.airtable.oauth.clientId || !config.airtable.oauth.clientSecret) {
    throw new Error(
      'Airtable OAuth not configured. Set AIRTABLE_OAUTH_CLIENT_ID and AIRTABLE_OAUTH_CLIENT_SECRET in .env.',
    );
  }
}
