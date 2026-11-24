import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { DatePipe, PercentPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Api, Detection, ReviewDecision } from '../../core/api';

/** Review inbox: one card at a time, hotkeys Y (confirm) / N (reject) / R (recapture). */
@Component({
  selector: 'app-queue',
  imports: [DatePipe, PercentPipe],
  template: `
    <h1>Очередь разбора <small>{{ items().length }}</small></h1>
    @if (current(); as d) {
      <article class="card" [class.critical]="d.severity === 'critical'">
        <header>
          <b>{{ d.object_id ?? 'Объект не сопоставлен' }}</b>
          <span>{{ d.defect_type }} · {{ d.severity }} · {{ d.confidence | percent }}</span>
          <time>{{ d.created_at | date: 'dd.MM HH:mm' }}</time>
        </header>
        <div class="evidence">
          @if (d.crop_uri) { <img [src]="d.crop_uri" alt="кадр" /> } @else { <div class="ph">нет кадра</div> }
        </div>
        <p class="why">{{ d.rationale }}</p>
        <footer>
          <button (click)="decide('confirm')">Подтвердить <kbd>Y</kbd></button>
          <button (click)="decide('reject')">Ложное <kbd>N</kbd></button>
          <button (click)="decide('need_recapture')">Нужен кадр <kbd>R</kbd></button>
        </footer>
      </article>
    } @else {
      <p>Очередь пуста.</p>
    }
  `,
  styles: `
    .card { border: 1px solid var(--line); border-radius: 12px; padding: 16px; max-width: 720px; background: var(--surface); }
    .card.critical { border-color: var(--danger); }
    header { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; }
    time { margin-left: auto; color: var(--muted); }
    .evidence img, .ph { width: 100%; aspect-ratio: 16/9; object-fit: cover; border-radius: 8px; margin: 12px 0; }
    .ph { display: grid; place-items: center; background: var(--surface-2); color: var(--muted); }
    footer { display: flex; gap: 8px; flex-wrap: wrap; }
    kbd { opacity: .6; margin-left: 4px; }
  `,
})
export class QueuePage {
  private api = inject(Api);
  readonly items = signal<Detection[]>([]);
  readonly current = computed(() => this.items()[0]);

  constructor() {
    this.reload();
    this.api.live().pipe(takeUntilDestroyed()).subscribe(() => this.reload());
  }

  reload() {
    this.api.queue().subscribe((q) => this.items.set(q));
  }

  decide(decision: ReviewDecision) {
    const d = this.current();
    if (!d?.object_id) return;
    this.items.update((xs) => xs.slice(1)); // optimistic
    this.api.review(d.object_id, { detection_id: d.id, decision, reviewer: 'dispatcher' }).subscribe();
  }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    const map: Record<string, ReviewDecision> = { y: 'confirm', n: 'reject', r: 'need_recapture' };
    const decision = map[e.key.toLowerCase()];
    if (decision) this.decide(decision);
  }
}
