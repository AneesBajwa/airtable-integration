import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { ErrorView } from '@airtable-integration/shared';

@Component({
  selector: 'app-error-banner',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './error-banner.component.html',
  styleUrl: './error-banner.component.scss',
})
export class ErrorBannerComponent {
  readonly view = input<ErrorView | null>(null);

  readonly actionClick = output<void>();
  readonly dismiss = output<void>();

  readonly title = computed(() => {
    const v = this.view();
    if (!v) return '';
    return v.kind === 'sync' ? 'Sync failed' : 'Scrape failed';
  });

  readonly actionLabel = computed(() => {
    const v = this.view();
    if (!v) return '';
    return v.action === 'reconnect' ? 'Reconnect' : 'Try again';
  });
}
