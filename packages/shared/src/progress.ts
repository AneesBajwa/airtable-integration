import { ScraperState, SyncPhase, SyncStatus } from './enums.js';
import type {
  ProgressView,
  ScrapeRunStatus,
  SyncRunSummary,
  SyncStatusResponse,
} from './types.js';

const SCRAPE_BUSY_STATES: ReadonlySet<ScraperState> = new Set([
  ScraperState.Acquiring,
  ScraperState.AwaitingMfa,
  ScraperState.VerifyingMfa,
  ScraperState.Scraping,
]);

/**
 * Map the latest sync + scrape poll payloads into a single view-model for the strip.
 * `null` means nothing in flight — the strip collapses.
 *
 * Sync wins when it is running; otherwise any non-idle scrape state surfaces. This
 * way a completed sync doesn't shadow a freshly-started scrape during the polling gap.
 */
export function computeProgressView(
  sync: SyncStatusResponse | null,
  scrape: ScrapeRunStatus,
  scraperState: ScraperState,
): ProgressView | null {
  if (sync !== null && sync.status === SyncStatus.Running) {
    return syncView(sync);
  }
  if (SCRAPE_BUSY_STATES.has(scraperState)) return scrapeView(scrape, scraperState);
  return null;
}

function syncView(sync: SyncRunSummary): ProgressView {
  const phase = sync.phase ?? SyncPhase.Bases;
  return { kind: 'sync', phase, current: currentFor(phase, sync), total: null };
}

function currentFor(phase: SyncPhase, sync: SyncRunSummary): number {
  switch (phase) {
    case SyncPhase.Bases:
      return sync.basesProcessed;
    case SyncPhase.Tables:
      return sync.tablesProcessed;
    case SyncPhase.Records:
      return sync.recordsProcessed;
    case SyncPhase.Users:
      return sync.usersProcessed;
  }
}

function scrapeView(scrape: ScrapeRunStatus, state: ScraperState): ProgressView {
  if (state === ScraperState.Acquiring) {
    return { kind: 'scrape', phase: 'acquiring', current: 0, total: null };
  }
  if (state === ScraperState.AwaitingMfa) {
    return { kind: 'scrape', phase: 'awaiting_mfa', current: 0, total: null };
  }
  if (state === ScraperState.VerifyingMfa) {
    return { kind: 'scrape', phase: 'verifying_mfa', current: 0, total: null };
  }
  return {
    kind: 'scrape',
    phase: 'scraping',
    current: scrape.processed + scrape.failed,
    total: scrape.total > 0 ? scrape.total : null,
  };
}

/** Human-readable label for the strip. Pure; safe to call from a template. */
export function labelFor(view: ProgressView): string {
  if (view.kind === 'sync') {
    switch (view.phase) {
      case SyncPhase.Bases:
        return 'Fetching bases…';
      case SyncPhase.Tables:
        return `Fetching tables (${view.current} so far)…`;
      case SyncPhase.Records:
        return `Fetching records (${view.current.toLocaleString()} so far)…`;
      case SyncPhase.Users:
        return 'Fetching users…';
    }
  }
  switch (view.phase) {
    case 'acquiring':
      return 'Signing in to Airtable…';
    case 'awaiting_mfa':
      return 'Waiting for verification code…';
    case 'verifying_mfa':
      return 'Verifying code…';
    case 'scraping': {
      const total = view.total != null ? view.total.toLocaleString() : '?';
      return `Fetching revision history (${view.current.toLocaleString()} / ${total})`;
    }
  }
}

/**
 * Floor percentage when a phase begins. The bar is always determinate so it
 * never animates idly back-and-forth. Phases without an inner counter (most of
 * them) sit at the floor; `scraping` interpolates up to 100% with real progress.
 *
 * Bands are tuned to typical wall-clock durations: records dominates sync,
 * scraping dominates scrape, the login/MFA preamble is a small fraction.
 */
const PHASE_FLOOR: Readonly<Record<SyncPhase | 'acquiring' | 'awaiting_mfa' | 'verifying_mfa' | 'scraping', number>> = {
  [SyncPhase.Bases]: 5,
  [SyncPhase.Tables]: 25,
  [SyncPhase.Records]: 50,
  [SyncPhase.Users]: 95,
  acquiring: 15,
  awaiting_mfa: 25,
  verifying_mfa: 40,
  scraping: 60,
};

/** Percent in [0, 100]. Always defined — the bar is always determinate. */
export function progressPercent(view: ProgressView): number {
  const floor = PHASE_FLOOR[view.phase];
  if (view.kind === 'scrape' && view.phase === 'scraping' && view.total != null && view.total > 0) {
    const ratio = view.current / view.total;
    const clamped = ratio < 0 ? 0 : ratio > 1 ? 1 : ratio;
    return floor + (100 - floor) * clamped;
  }
  return floor;
}
