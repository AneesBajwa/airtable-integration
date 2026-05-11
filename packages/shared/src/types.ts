import type { ColumnType, FieldType, ScraperState, SyncStatus } from './enums.js';

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
