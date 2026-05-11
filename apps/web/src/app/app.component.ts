import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval, firstValueFrom } from 'rxjs';
import {
  type CollectionDescriptor,
  ScraperState,
  SyncStatus,
  type SyncStatusResponse,
} from '@airtable-integration/shared';
import { ApiService } from '@/services/api.service';
import { HeaderComponent } from '@/components/header/header.component';
import { SidebarComponent } from '@/components/sidebar/sidebar.component';
import { EmptyStateComponent } from '@/components/empty-state/empty-state.component';
import { MfaPromptComponent } from '@/components/mfa-prompt/mfa-prompt.component';
import { DataGridComponent } from '@/components/data-grid/data-grid.component';

const POLL_MS = 2000;
const RECONNECT_REQUIRED = 'reconnect_required';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    MatSnackBarModule,
    HeaderComponent,
    SidebarComponent,
    EmptyStateComponent,
    MfaPromptComponent,
    DataGridComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  protected readonly ScraperState = ScraperState;

  private readonly api = inject(ApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly collections = signal<CollectionDescriptor[]>([]);
  readonly entity = signal<string | null>(null);
  readonly connected = signal<boolean>(false);

  readonly syncing = signal<boolean>(false);
  readonly scraping = signal<boolean>(false);
  readonly scraperState = signal<ScraperState>(ScraperState.Idle);

  readonly reloadKey = signal<number>(0);
  readonly sidebarOpen = signal<boolean>(false);
  readonly mfaSubmitting = signal<boolean>(false);
  readonly mfaError = signal<string | null>(null);

  /** Document count of the currently-selected entity (drives client-vs-infinite row model). */
  readonly entityCount = computed(() => {
    const e = this.entity();
    if (!e) return 0;
    return this.collections().find((c) => c.name === e)?.count ?? 0;
  });

  private syncStatusInFlight = false;
  private scrapeStatusInFlight = false;

  ngOnInit(): void {
    this.handleAuthQueryString();
    void this.refreshAuth();
    void this.refreshCollections();
    void this.refreshScrapeStatus();

    interval(POLL_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.syncing()) void this.refreshSyncStatus();
        if (this.scraping() || this.scraperState() === ScraperState.AwaitingMfa) {
          void this.refreshScrapeStatus();
        }
      });
  }

  onEntityChange(name: string): void {
    this.entity.set(name);
    this.reloadKey.update((k) => k + 1);
    this.sidebarOpen.set(false); // close drawer on narrow viewports after pick
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }

  async onConnect(): Promise<void> {
    try {
      const { authorizeUrl } = await firstValueFrom(this.api.startOAuth());
      window.location.href = authorizeUrl;
    } catch (err) {
      this.handleHttpError(err);
    }
  }

  async onSync(): Promise<void> {
    if (this.syncing()) return;
    this.syncing.set(true);
    try {
      await firstValueFrom(this.api.startSync());
    } catch (err) {
      this.syncing.set(false);
      this.handleHttpError(err);
    }
  }

  async onScrape(): Promise<void> {
    if (this.scraping()) return;
    this.scraping.set(true);
    try {
      await firstValueFrom(this.api.startScrape());
    } catch (err) {
      // 412 = awaiting_mfa; keep scraping=true so the poll picks up the MFA banner.
      if (!(err instanceof HttpErrorResponse) || err.status !== 412) {
        this.scraping.set(false);
        this.handleHttpError(err);
        return;
      }
    }
    void this.refreshScrapeStatus();
  }

  async onMfaSubmit(code: string): Promise<void> {
    this.mfaSubmitting.set(true);
    this.mfaError.set(null);
    try {
      await firstValueFrom(this.api.submitMfa(code));
      this.snack.open('MFA submitted', 'Dismiss', { duration: 2000 });
    } catch (err) {
      this.mfaError.set(this.errorMessage(err));
    } finally {
      this.mfaSubmitting.set(false);
    }
  }

  private handleAuthQueryString(): void {
    const params = new URLSearchParams(window.location.search);
    const auth = params.get('auth');
    if (!auth) return;
    if (auth === 'success') {
      this.snack.open('Connected to Airtable', 'Dismiss', { duration: 4000 });
    } else if (auth === 'error') {
      this.snack.open(`Authorization failed: ${params.get('reason') ?? 'unknown'}`, 'Dismiss', {
        duration: 8000,
      });
    }
    window.history.replaceState({}, '', window.location.pathname);
  }

  private async refreshAuth(): Promise<void> {
    try {
      const status = await firstValueFrom(this.api.getAuthStatus());
      this.connected.set(status.connected);
    } catch (err) {
      this.handleHttpError(err);
    }
  }

  private async refreshCollections(): Promise<void> {
    try {
      this.collections.set(await firstValueFrom(this.api.listCollections()));
    } catch (err) {
      this.handleHttpError(err);
    }
  }

  private async refreshSyncStatus(): Promise<void> {
    if (this.syncStatusInFlight) return;
    this.syncStatusInFlight = true;
    try {
      const status: SyncStatusResponse = await firstValueFrom(this.api.getSyncStatus());
      switch (status.status) {
        case SyncStatus.Idle:
          this.syncing.set(false);
          return;
        case SyncStatus.Pending:
        case SyncStatus.Running:
          // Still in flight — keep polling.
          return;
        case SyncStatus.Success:
          this.syncing.set(false);
          this.snack.open('Sync complete', 'Dismiss', { duration: 3000 });
          await this.refreshCollections();
          this.reloadKey.update((k) => k + 1);
          return;
        case SyncStatus.Failed: {
          this.syncing.set(false);
          const msg = status.error ?? 'Sync failed';
          if (msg.startsWith(RECONNECT_REQUIRED)) {
            this.promptReconnect();
          } else {
            this.snack.open(`Sync failed: ${msg}`, 'Dismiss', { duration: 8000 });
          }
          return;
        }
      }
    } catch (err) {
      this.handleHttpError(err);
    } finally {
      this.syncStatusInFlight = false;
    }
  }

  private async refreshScrapeStatus(): Promise<void> {
    if (this.scrapeStatusInFlight) return;
    this.scrapeStatusInFlight = true;
    try {
      const [run, state] = await Promise.all([
        firstValueFrom(this.api.getScrapeStatus()),
        firstValueFrom(this.api.getScraperState()),
      ]);
      this.scraperState.set(state.state);

      // A run is in flight while `startedAt` is set but `completedAt` is not.
      // We can't rely on `state` alone — the session state stays at `Ready` for
      // most of the scrape (it tracks cookies, not the run).
      if (run.startedAt && !run.completedAt) {
        this.scraping.set(true);
        return;
      }

      if (this.scraping() && run.completedAt) {
        if (run.state === ScraperState.Failed) {
          this.snack.open(`Scrape failed: ${state.lastError ?? 'unknown'}`, 'Dismiss', {
            duration: 8000,
          });
        } else {
          this.snack.open(
            `Scrape complete: ${run.processed} ok, ${run.failed} failed`,
            'Dismiss',
            { duration: 4000 },
          );
          await this.refreshCollections();
          this.reloadKey.update((k) => k + 1);
        }
      }
      this.scraping.set(false);
    } catch (err) {
      this.handleHttpError(err);
    } finally {
      this.scrapeStatusInFlight = false;
    }
  }

  private errorMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { message?: string } | null;
      return body?.message ?? err.message;
    }
    return err instanceof Error ? err.message : 'Unknown error';
  }

  private promptReconnect(): void {
    this.connected.set(false);
    this.snack
      .open('Airtable connection expired — please reconnect', 'Reconnect', { duration: 8000 })
      .onAction()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.onConnect());
  }

  private handleHttpError(err: unknown): void {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { error?: string } | null;
      if (err.status === 401 && body?.error === RECONNECT_REQUIRED) {
        this.promptReconnect();
        return;
      }
    }
    this.snack.open(this.errorMessage(err), 'Dismiss', { duration: 6000 });
  }
}
