import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import type {
  CollectionDescriptor,
  CollectionPage,
  FieldDescriptor,
  OAuthStatus,
  ScrapeRunStatus,
  ScraperStateResponse,
  SyncStatusResponse,
} from '@airtable-integration/shared';

/** Sole HTTP entry point for the SPA. Every API call is `/api/*` (proxied to Fastify in dev). */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api';

  // ── OAuth ──
  getAuthStatus(): Observable<OAuthStatus> {
    return this.http.get<OAuthStatus>(`${this.base}/auth/airtable/status`);
  }

  /** Returns Airtable's authorize URL. Caller sets `window.location.href` to it. */
  startOAuth(): Observable<{ authorizeUrl: string }> {
    return this.http.get<{ authorizeUrl: string }>(`${this.base}/auth/airtable/start`);
  }

  // ── Sync ──
  startSync(): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(`${this.base}/sync/run`, {});
  }
  getSyncStatus(): Observable<SyncStatusResponse> {
    return this.http.get<SyncStatusResponse>(`${this.base}/sync/status`);
  }

  // ── Scraper ──
  startScrape(): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`${this.base}/scrape/run`, {});
  }
  getScrapeStatus(): Observable<ScrapeRunStatus> {
    return this.http.get<ScrapeRunStatus>(`${this.base}/scrape/status`);
  }
  getScraperState(): Observable<ScraperStateResponse> {
    return this.http.get<ScraperStateResponse>(`${this.base}/scraper/state`);
  }
  submitMfa(code: string): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`${this.base}/scraper/mfa`, { code });
  }

  // ── Collections (drives the grid) ──
  listCollections(): Observable<CollectionDescriptor[]> {
    return this.http.get<CollectionDescriptor[]>(`${this.base}/collections`);
  }
  getColumns(name: string): Observable<FieldDescriptor[]> {
    return this.http.get<FieldDescriptor[]>(
      `${this.base}/collections/${encodeURIComponent(name)}/columns`,
    );
  }
  fetchPage<T = Record<string, unknown>>(
    name: string,
    opts: { page: number; pageSize: number; sort?: string; q?: string },
  ): Observable<CollectionPage<T>> {
    let params = new HttpParams()
      .set('page', String(opts.page))
      .set('pageSize', String(opts.pageSize));
    if (opts.sort) params = params.set('sort', opts.sort);
    if (opts.q) params = params.set('q', opts.q);
    return this.http.get<CollectionPage<T>>(
      `${this.base}/collections/${encodeURIComponent(name)}`,
      { params },
    );
  }
}
