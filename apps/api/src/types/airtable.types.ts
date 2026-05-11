/** Raw response shapes from Airtable's REST API. Internal — not exposed over the wire. */

export interface RawBase {
  id: string;
  name: string;
  permissionLevel: string;
}

export interface RawTableField {
  id: string;
  name: string;
  type: string;
}

export interface RawTable {
  id: string;
  name: string;
  primaryFieldId: string;
  fields: RawTableField[];
}

export interface RawRecord {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
}

export interface RawUser {
  id: string;
  email?: string;
  name?: string;
}

export interface AirtableTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}
