import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../core/auth';
import { PoputnoStore } from '../../data/store';
import { M, fmt } from '../../data/legacy';
import { PP } from '../../ui/pp';
import { Shell } from '../../ui/shell.service';
import { orderPhotos } from '../orders/orders';

/**
 * Brigade view of one work order: phone-first, light theme (daylight, gloves), big targets
 * (site: design2/site/js/views/order.js). The shell switches the page to the light theme.
 *
 * Closing goes through model.js `applyEvent(work_order_closed, project)`, as on the site:
 * the API has no work-order endpoint, so the change lives in this browser's dataset.
 */
@Component({
  selector: 'app-order-view',
  imports: [RouterLink, ...PP],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ux-brigade-host', 'data-theme': 'light', style: 'display: block' },
  template: `
    @if (view(); as v) {
      <div class="ux-brigade-wrap">
        <p class="ux-brigade-hint"><pp-icon name="user" cls="pp-icon--sm" /> Так наряд видит бригада в телефоне. Светлая тема для улицы, кнопки под перчатки.</p>
        <article class="ux-brigade">
          <header class="ux-brigade__head">
            <a class="pp-btn pp-btn--ghost pp-btn--sm" routerLink="/orders"><pp-icon name="arrow-right" cls="ux-flip" />Наряды</a>
            <span [class]="'ux-wo-state ux-wo-state--' + v.w.state">{{ v.w.stateLabel }}</span>
          </header>
          <p class="ux-brigade__id pp-mono">{{ v.w.objectId }}@if (v.o) { · {{ v.o.kindLabel }} }</p>
          <h2 class="ux-brigade__task">{{ v.w.task || v.o?.recommendation || 'Осмотреть объект' }}</h2>
          @if (v.o) {
            <div class="ux-brigade__status">
              <pp-status [status]="v.o.displayStatus" [label]="v.o.displayStatusLabel" />
              @if (v.o.severityRank) { <span>{{ v.o.defectLabel }}</span> }
            </div>
          }
          <section class="ux-brigade__block">
            <h3 class="ux-brigade__label">Что за объект</h3>
            <p class="ux-brigade__addr">{{ v.o ? tax()?.kindLongLabel(v.o.kind) : 'Объект не найден' }}</p>
            @if (v.o?.lat != null && v.o?.lon != null) {
              <p class="ux-brigade__coords pp-mono">{{ v.o.lat.toFixed(5) }}, {{ v.o.lon.toFixed(5) }}</p>
            } @else {
              <p class="ux-note">Координат в данных нет: место берётся из реестра МГТС по ID объекта.</p>
            }
          </section>
          <section class="ux-brigade__block">
            <h3 class="ux-brigade__label">{{ v.w.state === 'closed' ? 'До и после' : 'Что искать' }}</h3>
            @if (v.w.state === 'closed' || afterUrl()) {
              <div class="ux-ba ux-ba--stack">
                <figure class="ux-ba__item">
                  <figcaption class="ux-ba__cap"><span>До</span></figcaption>
                  <pp-evidence [d]="v.before" [caption]="false" />
                </figure>
                <figure class="ux-ba__item">
                  <figcaption class="ux-ba__cap"><span>После</span><span class="pp-mono">{{ v.w.closedAt ? dt(v.w.closedAt) : 'сейчас' }}</span></figcaption>
                  <pp-evidence [d]="afterShot()" [caption]="false" [tag]="false" />
                </figure>
              </div>
            } @else {
              <pp-evidence [d]="v.before" [caption]="true" />
            }
          </section>
          <dl class="ux-kv">
            <dt>Открыт</dt><dd><span class="pp-mono">{{ dt(v.w.openedAt) }}</span></dd>
            @if (v.w.assignee) { <dt>Бригада</dt><dd>{{ v.w.assignee }}</dd> }
            @if (v.w.closedAt) { <dt>Закрыт</dt><dd><span class="pp-mono">{{ dt(v.w.closedAt) }}</span></dd> }
          </dl>
          @if (v.w.state === 'open') {
            <footer class="ux-brigade__foot">
              @if (!canClose()) {
                <p class="ux-note">Закрыть наряд может бригада или диспетчер.</p>
              } @else {
                <p class="ux-note">В API пока нет эндпоинта закрытия наряда: закрытие хранится в этом браузере.</p>
              }
              @if (afterUrl()) {
                <label class="ux-check ux-check--lg"><input type="checkbox" [checked]="done()" (change)="done.set($any($event.target).checked)" />Работа выполнена, объект в порядке</label>
                <button class="pp-btn pp-btn--primary pp-btn--lg pp-btn--block" type="button" [disabled]="!done()" (click)="close()"><pp-icon name="check" />Закрыть наряд</button>
                <button class="pp-btn pp-btn--ghost pp-btn--block" type="button" (click)="retake()">Переснять фото</button>
              } @else {
                <label class="pp-btn pp-btn--primary pp-btn--lg pp-btn--block ux-filebtn" [class.is-disabled]="!canClose()">
                  <pp-icon name="camera" />Закрыть с фото после
                  <input type="file" accept="image/*" capture="environment" [disabled]="!canClose()" (change)="onFile($event)" />
                </label>
              }
            </footer>
          } @else {
            <p class="ux-note"><pp-icon name="check" cls="pp-icon--sm" /> Наряд закрыт. Объект вернулся в «Норму», следующий проезд машины это проверит.</p>
          }
        </article>
      </div>
    } @else {
      <div class="ux-brigade-wrap">
        <div class="ux-brigade">
          <pp-empty icon="route" title="Наряд не найден"><a class="pp-btn pp-btn--secondary" routerLink="/orders">Все наряды</a></pp-empty>
        </div>
      </div>
    }
  `,
})
export class OrderView {
  private store = inject(PoputnoStore);
  private shell = inject(Shell);
  private auth = inject(AuthService);

  readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('id') || '')), { initialValue: '' });
  readonly tax = this.store.tax;
  /** Local photo «после» (object URL) before the order is closed. */
  readonly afterUrl = signal<string | null>(null);
  readonly done = signal(false);
  readonly canClose = computed(() => this.auth.can('work_orders_own') || this.auth.can('work_orders_manage'));

  readonly view = computed(() => {
    this.store.version();
    const ds = this.store.ds();
    const w = ds?.workOrders.find((x: any) => x.id === this.id());
    return w ? { w, ...orderPhotos(w, ds) } : null;
  });
  readonly afterShot = computed(() => this.view()?.after || { photo: this.afterUrl(), isDefect: false, bbox: null, confidence: null });

  constructor() {
    effect(() => {
      const v = this.view();
      this.shell.setTitle(v ? `Наряд · ${v.w.objectId}` : 'Наряд');
    });
  }

  dt(v: string | null) {
    return fmt.dateTime(v);
  }

  private afterFile: File | null = null;
  readonly closing = signal(false);

  onFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    this.afterFile = f;
    this.afterUrl.set(URL.createObjectURL(f));
    this.done.set(false);
  }

  retake() {
    this.afterFile = null;
    this.afterUrl.set(null);
    this.done.set(false);
  }

  /** Closing goes to the API (work_order_closed in Kafka); the «after» photo is uploaded as a frame of this object. */
  async close() {
    const ds = this.store.ds();
    const w = this.view()?.w;
    if (!ds || !w || !this.done() || this.closing()) return;
    this.closing.set(true);
    try {
      await this.store.closeWorkOrder(w.objectId, w.id, this.afterFile);
      // show it at once; the API's event replaces this one on refresh
      M.applyEvent(
        ds,
        { object_id: w.objectId, type: 'work_order_closed', source: 'local.brigade', occurred_at: new Date().toISOString(),
          payload: { work_order_id: w.id, after_photo_uri: this.afterUrl() } },
        { project: true },
      );
      this.afterFile = null;
      this.afterUrl.set(null);
      this.done.set(false);
      this.store.touch();
      this.shell.toast({ title: 'Наряд закрыт', text: `${w.objectId} · статус «Норма»`, tone: 'ok' });
    } catch (e: any) {
      this.shell.toast({ title: 'Наряд не закрылся', text: e?.error?.error || e?.message || '', tone: 'critical' });
    } finally {
      this.closing.set(false);
    }
  }
}
