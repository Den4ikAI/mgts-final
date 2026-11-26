import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { DatePipe, PercentPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Api, Detection, ReviewDecision } from '../../core/api';
import { AuthImg } from '../../core/auth-img';
import { SEVERITY_LABEL, TaxonomyService } from '../../core/taxonomy';

/** Review inbox: one card at a time, hotkeys Y (confirm) / N (reject) / R (recapture). */
@Component({
  selector: 'app-queue',
  imports: [DatePipe, PercentPipe, AuthImg],
  template: `
    <h1>Очередь разбора <small class="mg-data">{{ items().length }}</small></h1>
    @if (current(); as d) {
      <article class="card" [class.critical]="d.severity === 'critical'">
        <header>
          <b class="mg-data">{{ d.object_id ?? 'Объект не сопоставлен' }}</b>
          <span class="sev">{{ tax.kind(d.object_kind) }}</span>
          <span class="mg-pill" [class]="'mg-pill mg-pill--' + (d.severity === 'critical' ? 'critical' : 'suspected')">
            {{ tax.label(d.defect_type) }}
          </span>
          @if (d.severity) { <span class="sev">{{ sev[d.severity] }}</span> }
          <span class="mg-data conf">уверенность {{ d.confidence | percent }}</span>
          <time class="mg-data">{{ d.created_at | date: 'dd.MM HH:mm' }}</time>
        </header>
        <div class="evidence">
          @if (d.crop_uri) {
            <img [mgAuthSrc]="d.crop_uri" alt="Кадр с камеры" />
          } @else {
            <div class="ph">нет кадра</div>
          }
        </div>
        @if (d.rationale) { <p class="why">{{ d.rationale }}</p> }
        <footer>
          <button class="mg-btn mg-btn--confirm" (click)="decide('confirm')">Подтвердить <span class="mg-kbd">Y</span></button>
          <button class="mg-btn mg-btn--reject" (click)="decide('reject')">Ложное <span class="mg-kbd">N</span></button>
          <button class="mg-btn" (click)="decide('need_recapture')">Нужен кадр <span class="mg-kbd">R</span></button>
        </footer>
      </article>
      @if (items().length > 1) {
        <p class="next">Дальше: {{ items().length - 1 }} · критичные идут первыми</p>
      }
    } @else {
      <p>Очередь пуста.</p>
    }
  `,
  styles: `
    .card { border: 1px solid var(--line); border-radius: 12px; padding: 16px; max-width: 820px; background: var(--surface); }
    .card.critical { border-color: var(--status-defect); box-shadow: var(--glow-critical); }
    header { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .sev, .conf, time { color: var(--ink-muted); font-size: 14px; }
    time { margin-left: auto; }
    .evidence img, .ph { display: block; width: 100%; max-height: 60vh; object-fit: contain; border-radius: 8px; margin: 12px 0; background: var(--surface-2); }
    .ph { aspect-ratio: 16/9; display: grid; place-items: center; color: var(--ink-muted); }
    .why { margin: 0 0 12px; color: var(--ink); }
    footer { display: flex; gap: 8px; flex-wrap: wrap; }
    .next { color: var(--ink-muted); font-size: 14px; }
  `,
})
export class QueuePage {
  private api = inject(Api);
  readonly tax = inject(TaxonomyService);
  readonly sev = SEVERITY_LABEL;
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
    this.api.review(d.object_id, { detection_id: d.id, decision }).subscribe();
  }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement)?.closest('input, textarea, select')) return;
    const map: Record<string, ReviewDecision> = { y: 'confirm', n: 'reject', r: 'need_recapture', н: 'confirm', т: 'reject', к: 'need_recapture' };
    const decision = map[e.key.toLowerCase()];
    if (decision) this.decide(decision);
  }
}
