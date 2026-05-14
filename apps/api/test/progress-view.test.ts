import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeProgressView,
  labelFor,
  progressPercent,
  ScraperState,
  SyncPhase,
  SyncStatus,
  type ProgressView,
  type ScrapeRunStatus,
  type SyncRunSummary,
} from '@airtable-integration/shared';

const idleSync = { status: SyncStatus.Idle } as const;
const baseSyncSummary = (overrides: Partial<SyncRunSummary>): SyncRunSummary => ({
  id: 'r1',
  status: SyncStatus.Running,
  phase: SyncPhase.Bases,
  startedAt: new Date().toISOString(),
  completedAt: null,
  basesProcessed: 0,
  tablesProcessed: 0,
  recordsProcessed: 0,
  usersProcessed: 0,
  error: null,
  ...overrides,
});

const idleScrape: ScrapeRunStatus = {
  state: ScraperState.Idle,
  total: 0,
  processed: 0,
  failed: 0,
  startedAt: null,
  completedAt: null,
};

test('returns null when both sides are idle', () => {
  assert.equal(computeProgressView(idleSync, idleScrape, ScraperState.Idle), null);
});

test('sync running on bases phase → kind=sync, phase=bases, percent floor', () => {
  const sync = baseSyncSummary({ phase: SyncPhase.Bases });
  const view = computeProgressView(sync, idleScrape, ScraperState.Idle);
  assert.equal(view?.kind, 'sync');
  assert.equal(view?.phase, 'bases');
  assert.equal(view?.total, null);
  assert.equal(progressPercent(view!), 5);
});

test('sync running on records phase exposes current count', () => {
  const sync = baseSyncSummary({ phase: SyncPhase.Records, recordsProcessed: 1247 });
  const view = computeProgressView(sync, idleScrape, ScraperState.Idle);
  assert.equal(view?.phase, 'records');
  assert.equal(view?.current, 1247);
});

test('scrape acquiring → kind=scrape, phase=acquiring, percent floor', () => {
  const view = computeProgressView(idleSync, idleScrape, ScraperState.Acquiring);
  assert.equal(view?.kind, 'scrape');
  assert.equal(view?.phase, 'acquiring');
  assert.equal(progressPercent(view!), 15);
});

test('scrape awaiting MFA is surfaced even without an active scrape run', () => {
  const view = computeProgressView(idleSync, idleScrape, ScraperState.AwaitingMfa);
  assert.equal(view?.phase, 'awaiting_mfa');
});

test('scrape verifying MFA is surfaced', () => {
  const view = computeProgressView(idleSync, idleScrape, ScraperState.VerifyingMfa);
  assert.equal(view?.phase, 'verifying_mfa');
});

test('scrape running with total>0 interpolates within scraping band', () => {
  const status: ScrapeRunStatus = {
    state: ScraperState.Scraping,
    total: 200,
    processed: 50,
    failed: 0,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
  const view = computeProgressView(idleSync, status, ScraperState.Scraping);
  assert.equal(view?.kind, 'scrape');
  assert.equal(view?.phase, 'scraping');
  assert.equal(view?.current, 50);
  assert.equal(view?.total, 200);
  // Scraping floor is 60; 25% of remaining 40 = 10 → 70
  assert.equal(progressPercent(view!), 70);
});

test('scrape running with total=0 sits at scraping floor', () => {
  const status: ScrapeRunStatus = {
    state: ScraperState.Scraping,
    total: 0,
    processed: 0,
    failed: 0,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
  const view = computeProgressView(idleSync, status, ScraperState.Scraping);
  assert.equal(progressPercent(view!), 60);
});

test('scrape progress counts failed records too (work consumed)', () => {
  const status: ScrapeRunStatus = {
    state: ScraperState.Scraping,
    total: 100,
    processed: 60,
    failed: 10,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
  const view = computeProgressView(idleSync, status, ScraperState.Scraping);
  assert.equal(view?.current, 70);
});

test('scrape final state with completedAt → null view', () => {
  const status: ScrapeRunStatus = {
    state: ScraperState.Scraping,
    total: 200,
    processed: 200,
    failed: 0,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
  assert.equal(computeProgressView(idleSync, status, ScraperState.Ready), null);
});

test('sync takes precedence over an idle scrape', () => {
  const sync = baseSyncSummary({ phase: SyncPhase.Records, recordsProcessed: 5 });
  const view = computeProgressView(sync, idleScrape, ScraperState.Idle);
  assert.equal(view?.kind, 'sync');
});

test('scrape takes precedence over a non-running sync summary', () => {
  const sync: SyncRunSummary = baseSyncSummary({
    status: SyncStatus.Success,
    phase: SyncPhase.Users,
    completedAt: new Date().toISOString(),
  });
  const view = computeProgressView(sync, idleScrape, ScraperState.Acquiring);
  assert.equal(view?.kind, 'scrape');
});

test('percent clamps to 100 when counters drift past total', () => {
  const status: ScrapeRunStatus = {
    state: ScraperState.Scraping,
    total: 10,
    processed: 15,
    failed: 0,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
  const view = computeProgressView(idleSync, status, ScraperState.Scraping);
  assert.equal(progressPercent(view!), 100);
});

test('every phase has a monotonic, non-decreasing floor percent', () => {
  const order: ProgressView[] = [
    { kind: 'sync', phase: SyncPhase.Bases, current: 0, total: null },
    { kind: 'sync', phase: SyncPhase.Tables, current: 0, total: null },
    { kind: 'sync', phase: SyncPhase.Records, current: 0, total: null },
    { kind: 'sync', phase: SyncPhase.Users, current: 0, total: null },
  ];
  let prev = -1;
  for (const v of order) {
    const p = progressPercent(v);
    assert.ok(p > prev, `sync phase ${v.phase} percent ${p} should exceed previous ${prev}`);
    prev = p;
  }

  const scrapeOrder: ProgressView[] = [
    { kind: 'scrape', phase: 'acquiring', current: 0, total: null },
    { kind: 'scrape', phase: 'awaiting_mfa', current: 0, total: null },
    { kind: 'scrape', phase: 'verifying_mfa', current: 0, total: null },
    { kind: 'scrape', phase: 'scraping', current: 0, total: 100 },
  ];
  let prevS = -1;
  for (const v of scrapeOrder) {
    const p = progressPercent(v);
    assert.ok(p > prevS, `scrape phase ${v.phase} percent ${p} should exceed previous ${prevS}`);
    prevS = p;
  }
});

test('labelFor returns a human label for every phase', () => {
  const cases: ProgressView[] = [
    { kind: 'sync', phase: SyncPhase.Bases, current: 0, total: null },
    { kind: 'sync', phase: SyncPhase.Tables, current: 4, total: null },
    { kind: 'sync', phase: SyncPhase.Records, current: 1247, total: null },
    { kind: 'sync', phase: SyncPhase.Users, current: 0, total: null },
    { kind: 'scrape', phase: 'acquiring', current: 0, total: null },
    { kind: 'scrape', phase: 'awaiting_mfa', current: 0, total: null },
    { kind: 'scrape', phase: 'verifying_mfa', current: 0, total: null },
    { kind: 'scrape', phase: 'scraping', current: 50, total: 200 },
  ];
  for (const v of cases) {
    const text = labelFor(v);
    assert.ok(text.length > 0, `label for ${v.kind}/${v.phase} is empty`);
  }
});
