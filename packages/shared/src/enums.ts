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

export enum ColumnType {
  Status = 'status',
  Assignee = 'assignee',
}

export enum FieldType {
  String = 'string',
  Number = 'number',
  Boolean = 'boolean',
  Date = 'date',
  Object = 'object',
}

export enum SyncPhase {
  Bases = 'bases',
  Tables = 'tables',
  Records = 'records',
  Users = 'users',
}
