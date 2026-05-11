import { chromium, type Browser } from 'playwright';
import type { FastifyBaseLogger } from 'fastify';
import { ScraperState } from '@airtable-integration/shared';
import { config } from '@/config/index.js';
import { encrypt, decrypt } from '@/crypto/aes-gcm.js';
import { ScraperSession } from '@/models/scraper-session.model.js';
import { mfaBus } from '@/modules/scraper/mfa-bus.js';

const LOGIN_URL = 'https://airtable.com/login';
const LOGIN_TIMEOUT_MS = 60_000;
const MFA_TIMEOUT_MS = 5 * 60_000;
const POST_MFA_TIMEOUT_MS = 30_000;

const EMAIL_SELECTOR = 'input[name="email"], input[type="email"]';
const PASSWORD_SELECTOR = 'input[type="password"]';
const MFA_SELECTOR = 'input[name="mfaCode"], input[autocomplete="one-time-code"], input[name="otp"]';
const SUBMIT_SELECTOR = 'button[type="submit"], button:has-text("Continue"), button:has-text("Next"), button:has-text("Sign in"), button:has-text("Verify")';
const DASHBOARD_URL_RE = /airtable\.com\/(?!login|sso|sign|verify)/;

// Module-level so the SIGTERM handler can release Chromium cleanly.
let activeBrowser: Browser | null = null;

export async function closeAllBrowsers(): Promise<void> {
  if (!activeBrowser) return;
  try {
    await activeBrowser.close();
  } finally {
    activeBrowser = null;
  }
}

export interface SessionCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
}

interface AcquireResult {
  cookies: SessionCookie[];
  csrfToken: string | null;
}

async function persistSession(result: AcquireResult): Promise<void> {
  const cookiesEnc = encrypt(JSON.stringify(result.cookies), config.scraperEncryptionKey);
  const csrfEnc = result.csrfToken
    ? encrypt(result.csrfToken, config.scraperEncryptionKey)
    : null;
  const soonest = result.cookies
    .map((c) => (c.expires && c.expires > 0 ? c.expires * 1000 : Number.POSITIVE_INFINITY))
    .reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);

  await ScraperSession.findOneAndUpdate(
    { userId: config.demoUserId },
    {
      $set: {
        userId: config.demoUserId,
        state: ScraperState.Ready,
        cookies: cookiesEnc,
        csrfToken: csrfEnc,
        expiresAt: Number.isFinite(soonest) ? new Date(soonest) : null,
        lastError: null,
      },
    },
    { upsert: true },
  );
}

async function setState(state: ScraperState, lastError: string | null = null): Promise<void> {
  await ScraperSession.findOneAndUpdate(
    { userId: config.demoUserId },
    { $set: { userId: config.demoUserId, state, lastError } },
    { upsert: true },
  );
}

/**
 * Run a fresh login. Pauses on the MFA page (state = `awaiting_mfa`) until
 * {@link mfaBus.submitCode} delivers a code or the wait times out.
 */
export async function acquireCookies(log: FastifyBaseLogger): Promise<void> {
  if (!config.airtable.scraper.email || !config.airtable.scraper.password) {
    throw new Error(
      'Scraper credentials not configured. Set AIRTABLE_SCRAPER_EMAIL and AIRTABLE_SCRAPER_PASSWORD.',
    );
  }
  await setState(ScraperState.Acquiring);

  // Headful: Airtable's PerimeterX bot mitigation serves a "Verify it's you"
  // challenge to headless Chromium, so the login form never renders.
  const browser = await chromium.launch({ headless: false });
  activeBrowser = browser;
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(LOGIN_TIMEOUT_MS);

    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

    await page.fill(EMAIL_SELECTOR, config.airtable.scraper.email);
    await page.click(SUBMIT_SELECTOR);

    await page.waitForSelector(PASSWORD_SELECTOR, { timeout: 15_000 });
    await page.fill(PASSWORD_SELECTOR, config.airtable.scraper.password);
    await page.click(SUBMIT_SELECTOR);

    const mfaPromise = page
      .waitForSelector(MFA_SELECTOR, { timeout: 15_000 })
      .then(() => 'mfa' as const)
      .catch(() => null);
    const dashPromise = page
      .waitForURL(DASHBOARD_URL_RE, { timeout: 15_000 })
      .then(() => 'dash' as const)
      .catch(() => null);

    if ((await Promise.race([mfaPromise, dashPromise])) === 'mfa') {
      log.info('Scraper login: MFA prompt detected, awaiting code from operator');
      await setState(ScraperState.AwaitingMfa);
      const code = await mfaBus.waitForCode(config.demoUserId, MFA_TIMEOUT_MS);
      await setState(ScraperState.VerifyingMfa);
      await page.fill(MFA_SELECTOR, code);
      await page.click(SUBMIT_SELECTOR);
      await page.waitForURL(DASHBOARD_URL_RE, { timeout: POST_MFA_TIMEOUT_MS });
    }

    const cookies = await context.cookies();
    let csrf: string | null = null;
    try {
      csrf = await page.locator('meta[name="csrf-token"]').first().getAttribute('content');
    } catch {
      /* meta tag not present */
    }
    if (!csrf) {
      const csrfCookie = cookies.find(
        (c) => c.name === 'AUTH_CSRF' || c.name.toLowerCase().includes('csrf'),
      );
      csrf = csrfCookie?.value ?? null;
    }

    await persistSession({ cookies, csrfToken: csrf });
    log.info({ cookieCount: cookies.length, csrfPresent: !!csrf }, 'Scraper cookies acquired');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err }, 'Cookie acquisition failed');
    await setState(ScraperState.Failed, message);
    throw err;
  } finally {
    // Only clear the slot if `closeAllBrowsers()` hasn't already done so concurrently.
    if (activeBrowser === browser) {
      activeBrowser = null;
    }
    await browser.close().catch(() => undefined);
  }
}

export interface DecryptedSession {
  cookies: SessionCookie[];
  csrfToken: string | null;
  cookieHeader: string;
}

/** Decrypt the persisted session, ready to be passed as cookies on outgoing requests. */
export async function loadSession(): Promise<DecryptedSession | null> {
  const doc = await ScraperSession.findOne({ userId: config.demoUserId }).lean();
  if (!doc?.cookies) return null;
  const cookies = JSON.parse(
    decrypt(doc.cookies, config.scraperEncryptionKey),
  ) as SessionCookie[];
  const csrf = doc.csrfToken ? decrypt(doc.csrfToken, config.scraperEncryptionKey) : null;
  return {
    cookies,
    csrfToken: csrf,
    cookieHeader: cookies.map((c) => `${c.name}=${c.value}`).join('; '),
  };
}
