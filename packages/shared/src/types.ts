import type { ColumnType, FieldType, ScraperState, SyncPhase, SyncStatus } from './enums.js';

export interface RevisionHistoryEntry {
  uuid: string;
  issueId: string;
  columnType: ColumnType;
  oldValue: string | null;
  newValue: string | null;
  createdDate: string;
  authoredBy: string;
}

export interface SyncRunSummary {
  id: string;
  status: SyncStatus;
  phase: SyncPhase | null;
  startedAt: string;
  completedAt: string | null;
  basesProcessed: number;
  tablesProcessed: number;
  recordsProcessed: number;
  usersProcessed: number;
  error: string | null;
}

export type SyncStatusResponse = SyncRunSummary | { status: SyncStatus.Idle };

export interface ScraperStateResponse {
  state: ScraperState;
  cookiesExpireAt: string | null;
  lastError: string | null;
}

export interface ScrapeRunStatus {
  state: ScraperState;
  total: number;
  processed: number;
  failed: number;
  startedAt: string | null;
  completedAt: string | null;
}

export interface CollectionDescriptor {
  name: string;
  count: number;
}

export interface FieldDescriptor {
  key: string;
  type: FieldType;
}

export interface CollectionPage<T = Record<string, unknown>> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OAuthStatus {
  connected: boolean;
  expiresAt: string | null;
}

export type ScrapeProgressPhase =
  | 'acquiring'
  | 'awaiting_mfa'
  | 'verifying_mfa'
  | 'scraping';

/** Discriminated on `kind` — narrow before switching on `phase`. */
export type ProgressView =
  | { kind: 'sync'; phase: SyncPhase; current: number; total: number | null }
  | { kind: 'scrape'; phase: ScrapeProgressPhase; current: number; total: number | null };

/** Persistent inline error banner state. `action` is the primary recovery affordance. */
export type ErrorAction = 'retry' | 'reconnect';

export interface ErrorView {
  kind: 'sync' | 'scrape';
  message: string;
  action: ErrorAction;
}
