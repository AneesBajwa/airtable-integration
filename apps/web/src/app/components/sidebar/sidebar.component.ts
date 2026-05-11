import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { type CollectionDescriptor } from '@airtable-integration/shared';

/**
 * Collection navigation rail. Lists all synced Mongo collections with a
 * record count; clicking emits {@link entityChange}.
 */
@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  readonly collections = input<CollectionDescriptor[]>([]);
  readonly entity = input<string | null>(null);
  readonly open = input<boolean>(true);

  readonly entityChange = output<string>();

  onPick(name: string): void {
    if (name !== this.entity()) this.entityChange.emit(name);
  }
}
