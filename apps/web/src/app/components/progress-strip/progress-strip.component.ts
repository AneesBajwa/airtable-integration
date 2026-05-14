import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import {
  labelFor,
  progressPercent,
  type ProgressView,
  type ScrapeProgressPhase,
  SyncPhase,
} from '@airtable-integration/shared';

const ICON_FOR_PHASE: Readonly<Record<SyncPhase | ScrapeProgressPhase, string>> = {
  [SyncPhase.Bases]: 'storage',
  [SyncPhase.Tables]: 'table_chart',
  [SyncPhase.Records]: 'cloud_sync',
  [SyncPhase.Users]: 'group',
  acquiring: 'lock_open',
  awaiting_mfa: 'shield_lock',
  verifying_mfa: 'shield',
  scraping: 'history',
};

@Component({
  selector: 'app-progress-strip',
  standalone: true,
  imports: [MatIconModule, MatProgressBarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './progress-strip.component.html',
  styleUrl: './progress-strip.component.scss',
})
export class ProgressStripComponent {
  readonly view = input<ProgressView | null>(null);

  readonly icon = computed(() => {
    const v = this.view();
    return v ? ICON_FOR_PHASE[v.phase] : '';
  });

  readonly label = computed(() => {
    const v = this.view();
    return v ? labelFor(v) : '';
  });

  readonly percent = computed(() => {
    const v = this.view();
    return v ? progressPercent(v) : 0;
  });

  readonly counter = computed(() => {
    const v = this.view();
    if (!v || v.total == null) return null;
    return `${v.current.toLocaleString()} / ${v.total.toLocaleString()}`;
  });
}
