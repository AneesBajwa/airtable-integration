/**
 * Shared string enums. JSON-serializable, type-safe, and tree-shakeable.
 * Used by both the Fastify API and the Angular UI.
 */

export enum SyncStatus {
  Pending = 'pending',
  Running = 'running',
  Success = 'success',
  Failed = 'failed',
  Idle = 'idle',
}

export enum ScraperState {
  Idle = 'idle',
  Acquiring = 'acquiring',
  AwaitingMfa = 'awaiting_mfa',
  VerifyingMfa = 'verifying_mfa',
  Ready = 'ready',
  Scraping = 'scraping',
  Failed = 'failed',
}

/** Revision-history change type. The FSD requires only Status and Assignee changes. */
export enum ColumnType {
  Status = 'status',
  Assignee = 'assignee',
}

/** Inferred field type for AG Grid column generation. */
export enum FieldType {
  String = 'string',
  Number = 'number',
  Boolean = 'boolean',
  Date = 'date',
  Object = 'object',
}

/** Active integration list — currently Airtable only (ASSUMPTION #3). */
export enum IntegrationId {
  Airtable = 'Airtable',
}
