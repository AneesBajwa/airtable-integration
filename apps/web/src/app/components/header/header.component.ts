import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  readonly connected = input<boolean>(false);
  readonly syncing = input<boolean>(false);
  readonly scraping = input<boolean>(false);
  readonly menuOpen = input<boolean>(false);

  readonly syncClick = output<void>();
  readonly scrapeClick = output<void>();
  readonly connectClick = output<void>();
  readonly menuToggle = output<void>();

  readonly statusText = computed(() => {
    if (this.syncing()) return 'Syncing';
    if (this.scraping()) return 'Scraping';
    return this.connected() ? 'Connected' : 'Disconnected';
  });

  readonly statusKind = computed<'ok' | 'off' | 'busy'>(() => {
    if (this.syncing() || this.scraping()) return 'busy';
    return this.connected() ? 'ok' : 'off';
  });
}
