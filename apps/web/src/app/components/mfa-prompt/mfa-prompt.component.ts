import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/** Inline MFA prompt rendered above the grid when the scraper is paused awaiting an OTP. */
const MFA_RE = /^\d{6}$/;

@Component({
  selector: 'app-mfa-prompt',
  standalone: true,
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mfa-prompt.component.html',
  styleUrl: './mfa-prompt.component.scss',
})
export class MfaPromptComponent {
  readonly submitting = input<boolean>(false);
  readonly error = input<string | null>(null);
  readonly codeSubmit = output<string>();

  readonly value = signal('');
  readonly canSubmit = computed(() => MFA_RE.test(this.value().trim()));

  private readonly codeInput = viewChild<ElementRef<HTMLInputElement>>('codeInput');

  constructor() {
    afterNextRender(() => this.codeInput()?.nativeElement.focus());
    // Refocus the input whenever a submission error appears so the user can retry without the mouse.
    effect(() => {
      if (this.error() !== null) {
        queueMicrotask(() => this.codeInput()?.nativeElement.focus());
      }
    });
  }

  onSubmit(): void {
    if (!this.canSubmit()) return;
    this.codeSubmit.emit(this.value().trim());
    this.value.set('');
  }
}
