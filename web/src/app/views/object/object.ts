import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../core/auth';
import { PoputnoStore } from '../../data/store';
import { M, fmt } from '../../data/legacy';
import { Shell } from '../../ui/shell.service';
import { PP, eventNode } from '../../ui/pp';

/**
 * Object card: ported from design2/site/js/views/object.js. On open it reads /api/objects/{id}
 * and the object's history (store.object), then shows frames, before/after, decisions, work
 * orders and the timeline from the merged dataset.
 */
@Component({
  selector: 'app-object-view',
  imports: [RouterLink, ...PP],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './object.html',
})
export class ObjectView {
  readonly sending = signal(false);
  hasOpenOrder(o: any) {
    return (o.workOrders || []).some((w: any) => w.state !== 'closed');
  }
  /** «Отправить бригаду»: opens a work order through the API (work_order_opened in Kafka). */
  async sendBrigade(o: any) {
    this.sending.set(true);
    try {
      const id = await this.store.openWorkOrder(o.id);
      this.shell.toast({ title: 'Наряд открыт', text: `${o.id} · Бригада 3 · Сидоров`, tone: 'ok', link: `/orders/${id}`, actionLabel: 'Открыть наряд' });
    } catch (e: any) {
      this.shell.toast({ title: 'Наряд не открылся', text: e?.message || '', tone: 'critical' });
    } finally {
      this.sending.set(false);
    }
  }
  readonly store = inject(PoputnoStore);
  readonly auth = inject(AuthService);
  private shell = inject(Shell);
  readonly fmt = fmt;
  readonly eventNode = eventNode;

  readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('id') ?? '')), { initialValue: '' });
  /** Detection shown big (null: «было и сейчас» or the evidence frame). */
  readonly main = signal<string | null>(null);
  /** Last id whose fetch has finished (successfully or not). */
  readonly done = signal<string | null>(null);
  private requested: string | null = null;

  readonly obj = computed(() => {
    const id = this.id();
    this.store.version();
    const ds = this.store.ds();
    return ds && id ? (M.selectObject(ds, id) as any) : null;
  });
  /** Loader until the details arrive; an object already loaded once is shown at once and refreshed. */
  readonly loading = computed(() => !this.store.ds() || (!this.obj()?.detailsLoaded && this.done() !== this.id()));

  readonly vm = computed(() => {
    const o = this.obj();
    if (!o) return null;
    const ds = this.store.ds();
    const main = this.main();
    const dets: any[] = o.detections;
    const shown = dets.find((d) => d.id === main) || o.evidence || dets[0] || null;
    const { before, after } = M.selectBeforeAfter(o);
    const events: any[] = M.selectTimeline(ds, { objectId: o.id, order: 'desc' });
    const pending = dets.filter((d) => d.isPending);
    const showBA = !!(before && after && before.id !== after.id);
    const why = showBA && !main ? after : shown;
    const ex = dets.find((d) => d.extra?.gt_state || d.extra?.gt_note)?.extra;
    const gt = ex ? [ex.gt_state, ex.gt_note].filter(Boolean).join(' · ') : '';
    return {
      o, dets, shown, before, after, events, pending, showBA, why, gt,
      last: o.latest,
      hasTruth: dets.some((d) => d.truth),
      framesWord: dets.length === 1 ? 'кадр' : dets.length < 5 ? 'кадра' : 'кадров',
    };
  });

  constructor() {
    effect(() => {
      const id = this.id();
      this.shell.setTitle(id ? `Объект ${id}` : 'Объект');
    });
    // A new id: back to «было и сейчас», then load the details once the dataset is there.
    effect(() => {
      const id = this.id();
      const ready = !!this.store.ds();
      if (!id || !ready || this.requested === id) return;
      this.requested = id;
      untracked(() => {
        this.main.set(null);
        this.load(id);
      });
    });
  }

  private async load(id: string) {
    try {
      await this.store.object(id);
    } catch (e: any) {
      // 404: the object is simply not in the data; the empty state says so.
      if (e?.status !== 404) this.shell.toast({ title: 'История не загрузилась', text: e?.error?.error || e?.message || 'Сервер не ответил', tone: 'critical' });
    } finally {
      this.done.set(id);
    }
  }

  show(id: string) {
    this.main.set(id);
  }
  backToBA() {
    this.main.set(null);
  }
}
