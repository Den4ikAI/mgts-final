import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { PoputnoStore } from '../../data/store';
import { Dataset, M, fmt } from '../../data/legacy';
import { PP } from '../../ui/pp';
import { Shell } from '../../ui/shell.service';

type OrderState = 'open' | 'closed' | 'all';

/** Before/after photos of an order as detection-like objects for pp-thumb / pp-evidence (site: orders.js orderPhotos). */
export function orderPhotos(w: any, ds: Dataset) {
  const o = w.object || ds.byId.get(w.objectId);
  const beforeUri = w.beforePhoto ? M.photoUrl(w.beforePhoto, ds.meta.photoBase) : o?.evidence?.photo;
  const before = beforeUri ? { ...(o?.evidence || {}), photo: beforeUri } : o?.evidence || null;
  const after = w.afterPhoto
    ? {
        photo: /^(blob:|data:|https?:|\/|\.)/.test(w.afterPhoto) ? w.afterPhoto : M.photoUrl(w.afterPhoto, ds.meta.photoBase),
        isDefect: false, bbox: null, defectLabel: 'После ремонта', objectId: w.objectId, confidence: null, createdAt: w.closedAt,
      }
    : null;
  return { o, before, after };
}

/**
 * «Наряды»: open / closed work orders (site: design2/site/js/views/orders.js).
 * The API has no work-order endpoints; orders come from `work_order_*` events and live in the
 * dataset (model.js), as on the site.
 */
@Component({
  selector: 'app-orders-view',
  imports: [RouterLink, ...PP],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ux-page ux-page--wide">
      <header class="ux-pagehead">
        <div>
          <h2 class="pp-h2">Наряды</h2>
          <p class="ux-pagehead__meta">Наряд закрывает бригада с фото «после». Следующий проезд машины подтверждает ремонт.</p>
        </div>
        <div class="pp-segmented" role="group" aria-label="Состояние наряда">
          @for (s of states; track s.key) {
            <button class="pp-segmented__item" type="button" [attr.aria-pressed]="state() === s.key" (click)="setState(s.key)">
              {{ s.label }}<span class="pp-mono pp-muted">{{ counts()[s.key] }}</span>
            </button>
          }
        </div>
      </header>
      @if (!all().length) {
        <div class="ux-banner ux-banner--info">
          <pp-icon name="alert" cls="pp-icon--sm" />
          <span>В API пока нет эндпоинтов нарядов: здесь видны наряды из событий <span class="pp-mono">work_order_*</span>.</span>
        </div>
      }
      @if (rows().length) {
        <ul class="ux-orders">
          @for (r of rows(); track r.w.id) {
            <li>
              <a class="ux-order" [routerLink]="['/orders', r.w.id]">
                <span class="ux-order__media"><pp-thumb [d]="r.before" />@if (r.after) { <pp-thumb [d]="r.after" /> }</span>
                <span class="ux-order__body">
                  <span class="ux-order__top">
                    <span class="pp-id">{{ r.w.objectId }}</span>
                    <span [class]="'ux-wo-state ux-wo-state--' + r.w.state">{{ r.w.stateLabel }}</span>
                    @if (r.o) { <pp-status [status]="r.o.displayStatus" [label]="r.o.displayStatusLabel" [sm]="true" /> }
                  </span>
                  <span class="ux-order__task">{{ r.w.task || r.o?.recommendation || 'Наряд' }}</span>
                  <span class="ux-order__meta">{{ r.o?.kindLabel || '' }}@if (r.w.assignee) { · {{ r.w.assignee }} }</span>
                </span>
                <span class="ux-order__time pp-mono">
                  @if (r.w.state === 'closed') { закрыт<br />{{ dt(r.w.closedAt) }} } @else { открыт<br />{{ dt(r.w.openedAt) }} }
                </span>
              </a>
            </li>
          }
        </ul>
      } @else {
        <pp-empty icon="route" [title]="state() === 'open' ? 'Открытых нарядов нет' : 'Нарядов нет'"
          text="Наряд появляется, когда диспетчер подтверждает дефект и отправляет бригаду." />
      }
    </div>
  `,
})
export class OrdersView {
  private store = inject(PoputnoStore);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly states: { key: OrderState; label: string }[] = [
    { key: 'open', label: 'Открытые' },
    { key: 'closed', label: 'Закрытые' },
    { key: 'all', label: 'Все' },
  ];
  readonly state = toSignal(
    this.route.queryParamMap.pipe(map((q) => (['open', 'closed', 'all'].includes(q.get('state') || '') ? q.get('state') : 'open') as OrderState)),
    { initialValue: 'open' as OrderState },
  );
  readonly all = this.store.select((ds) => M.selectWorkOrders(ds) as any[], []);
  readonly counts = computed(() => {
    const all = this.all();
    return { open: all.filter((w) => w.state === 'open').length, closed: all.filter((w) => w.state === 'closed').length, all: all.length };
  });
  readonly rows = computed(() => {
    const ds = this.store.ds();
    const s = this.state();
    const list = s === 'all' ? this.all() : this.all().filter((w) => w.state === s);
    return ds ? list.map((w) => ({ w, ...orderPhotos(w, ds) })) : [];
  });

  constructor() {
    inject(Shell).setTitle('Наряды');
  }

  setState(state: OrderState) {
    this.router.navigate([], { relativeTo: this.route, queryParams: { state }, replaceUrl: true });
  }
  dt(v: string | null) {
    return fmt.dateTime(v);
  }
}
