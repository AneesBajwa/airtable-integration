/**
 * Shared interface types for the Airtable integration.
 * No runtime exports here — this file is types-only.
 */
import type { ColumnType, FieldType, ScraperState, SyncStatus } from './enums.js';

// ──────────────────────────────────────────────────────────────────────
// Airtable API entities (mirrors what we persist to MongoDB)
// ──────────────────────────────────────────────────────────────────────

export interface AirtableBase {
  baseId: string;
  name: string;
  permissionLevel: string;
  syncedAt: string;
}

export interface AirtableTableField {
  id: string;
  name: string;
  type: string;
}

export interface AirtableTable {
  baseId: string;
  tableId: string;
  name: string;
  primaryFieldId: string;
  fields: AirtableTableField[];
  syncedAt: string;
}

export interface AirtableUser {
  userId: string;
  email: string;
  name: string;
  syncedAt: string;
}

// ──────────────────────────────────────────────────────────────────────
// Revision history entry — schema dictated by the FSD (Part B).
// ──────────────────────────────────────────────────────────────────────

export interface RevisionHistoryEntry {
  uuid: string;
  issueId: string;
  columnType: ColumnType;
  oldValue: string | null;
  newValue: string | null;
  createdDate: string;
  authoredBy: string;
}

// ──────────────────────────────────────────────────────────────────────
// Sync run state
// ──────────────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────────────
// Scraper state
// ──────────────────────────────────────────────────────────────────────

export interface ScraperStateResponse {
  state: ScraperState;
  message: string | null;
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

// ──────────────────────────────────────────────────────────────────────
// Collections API (Part C)
// ──────────────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────────────
// Auth API
// ──────────────────────────────────────────────────────────────────────

export interface OAuthStatus {
  connected: boolean;
  expiresAt: string | null;
}
