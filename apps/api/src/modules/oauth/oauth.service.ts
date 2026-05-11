import { request } from 'undici';
import { config, assertOAuthConfigured } from '@/config/index.js';
import { encrypt, decrypt } from '@/crypto/aes-gcm.js';
import { AirtableOAuthToken } from '@/models/oauth-token.model.js';
import { codeChallengeFromVerifier, generateCodeVerifier, generateState } from '@/modules/oauth/pkce.js';
import type { AirtableTokenResponse } from '@/types/airtable.types.js';

interface PkceSession {
  verifier: string;
  createdAt: number;
}

const SESSION_TTL_MS = 10 * 60 * 1000;
const REFRESH_BUFFER_MS = 60 * 1000;

/** Keyed by the OAuth `state` parameter — its unguessability is what defends against CSRF. */
const pkceStore = new Map<string, PkceSession>();
const inFlightRefreshes = new Map<string, Promise<string>>();

/** Thrown for any error during the OAuth callback handshake. */
export class OAuthCallbackError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
  }
}

/** Thrown when the stored refresh token is rejected by Airtable. The UI must prompt to reconnect. */
export class ReconnectRequiredError extends Error {
  constructor(message = 'Airtable connection expired — please re-connect') {
    super(message);
  }
}

function gcSessions(): void {
  const now = Date.now();
  for (const [k, v] of pkceStore) {
    if (now - v.createdAt > SESSION_TTL_MS) pkceStore.delete(k);
  }
}

function basicAuthHeader(): string {
  return Buffer.from(
    `${config.airtable.oauth.clientId}:${config.airtable.oauth.clientSecret}`,
  ).toString('base64');
}

/** Generate a fresh PKCE verifier + state, persist server-side, return the authorize URL. */
export function buildAuthorizeUrl(): { authorizeUrl: string } {
  gcSessions();
  const verifier = generateCodeVerifier();
  const state = generateState();
  pkceStore.set(state, { verifier, createdAt: Date.now() });

  const url = new URL(config.airtable.oauth.authorizeUrl);
  url.searchParams.set('client_id', config.airtable.oauth.clientId);
  url.searchParams.set('redirect_uri', config.airtable.oauth.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('code_challenge', codeChallengeFromVerifier(verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  url.searchParams.set('scope', config.airtable.oauth.scopes.join(' '));

  return { authorizeUrl: url.toString() };
}

async function postToken(body: URLSearchParams): Promise<AirtableTokenResponse> {
  assertOAuthConfigured();
  const res = await request(config.airtable.oauth.tokenUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${basicAuthHeader()}`,
    },
    body: body.toString(),
  });
  const json = (await res.body.json()) as AirtableTokenResponse | { error: string };
  if (res.statusCode !== 200 || 'error' in json) {
    throw new OAuthCallbackError(`Airtable token endpoint: ${JSON.stringify(json)}`, res.statusCode);
  }
  return json;
}

async function persistTokens(userId: string, tokens: AirtableTokenResponse): Promise<void> {
  await AirtableOAuthToken.findOneAndUpdate(
    { userId },
    {
      $set: {
        accessToken: encrypt(tokens.access_token, config.tokenEncryptionKey),
        refreshToken: encrypt(tokens.refresh_token, config.tokenEncryptionKey),
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scopes: tokens.scope.split(/[\s,]+/).filter(Boolean),
      },
    },
    { upsert: true, new: true },
  );
}

/** Exchange the OAuth `code` for tokens and persist them encrypted. */
export async function handleCallback(params: { code: string; state: string }): Promise<void> {
  const session = pkceStore.get(params.state);
  if (!session) {
    throw new OAuthCallbackError(
      'No PKCE session found for the returned state — restart the connect flow',
      400,
    );
  }
  // Single-use: the state is consumed regardless of subsequent success/failure.
  pkceStore.delete(params.state);

  const tokens = await postToken(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: config.airtable.oauth.redirectUri,
      client_id: config.airtable.oauth.clientId,
      code_verifier: session.verifier,
    }),
  );
  await persistTokens(config.demoUserId, tokens);
}

async function doRefresh(userId: string): Promise<string> {
  const doc = await AirtableOAuthToken.findOne({ userId });
  if (!doc) throw new ReconnectRequiredError('No Airtable connection on file');
  const refreshPlain = decrypt(doc.refreshToken, config.tokenEncryptionKey);
  try {
    const refreshed = await postToken(
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshPlain,
        client_id: config.airtable.oauth.clientId,
      }),
    );
    await persistTokens(userId, refreshed);
    return refreshed.access_token;
  } catch (err) {
    await AirtableOAuthToken.deleteOne({ userId });
    throw new ReconnectRequiredError(
      err instanceof Error ? err.message : 'Refresh token rejected',
    );
  }
}

/**
 * Return a usable access token for `userId`. Refreshes (with rotation) when within
 * the expiry buffer; coalesces concurrent refreshes for the same user.
 */
export async function getAccessToken(userId: string = config.demoUserId): Promise<string> {
  const doc = await AirtableOAuthToken.findOne({ userId });
  if (!doc) {
    throw new ReconnectRequiredError('No Airtable connection on file');
  }
  if (doc.expiresAt.getTime() - Date.now() > REFRESH_BUFFER_MS) {
    return decrypt(doc.accessToken, config.tokenEncryptionKey);
  }
  let p = inFlightRefreshes.get(userId);
  if (!p) {
    p = doRefresh(userId).finally(() => inFlightRefreshes.delete(userId));
    inFlightRefreshes.set(userId, p);
  }
  return p;
}

export async function isConnected(
  userId: string = config.demoUserId,
): Promise<{ connected: boolean; expiresAt: string | null }> {
  const doc = await AirtableOAuthToken.findOne({ userId }).lean();
  if (!doc) return { connected: false, expiresAt: null };
  return { connected: true, expiresAt: doc.expiresAt.toISOString() };
}
