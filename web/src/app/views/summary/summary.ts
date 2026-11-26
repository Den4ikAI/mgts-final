import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth';
import { PoputnoStore } from '../../data/store';
import { M, T, fmt } from '../../data/legacy';
import { CHARTS } from '../../ui/charts';
import { PP, eventNode, plural } from '../../ui/pp';
import { Shell } from '../../ui/shell.service';

const ROUTE_ORDER = ['critical', 'review', 'auto_ok', 'not_observed', 'error'];
const STATUS_ORDER: string[] = T.STATUS_ORDER;

/** «Сводка»: main numbers, status split, defects, routes, districts, critical now, event feed (design2/site/js/views/summary.js). */
@Component({
  selector: 'app-summary-view',
  imports: [RouterLink, ...PP, ...CHARTS],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
@if (vm(); as v) {
  @if (v.empty) {
    <div class="ux-page">
      <pp-empty icon="upload" title="Данные ещё не загружены" text="Объектов пока нет. Загрузите фото или датасет организаторов: модель разберёт кадры, и сводка заполнится.">
        @if (auth.can('frames_upload')) { <a class="pp-btn pp-btn--primary" routerLink="/import"><pp-icon name="upload" />Загрузить данные</a> }
      </pp-empty>
    </div>
  } @else {
  <div class="ux-page">
    <header class="ux-pagehead">
      <div><h2 class="pp-h2">Сводка по объектам</h2>
        <p class="ux-pagehead__meta">{{ v.title }}@if (v.st.lastUpdate) { {{ v.title ? '· ' : '' }}последнее событие <span class="pp-mono">{{ dt(v.st.lastUpdate) }}</span>}</p></div>
      @if (auth.can('review') && v.st.pending) {
        <a class="pp-btn pp-btn--primary" routerLink="/queue"><pp-icon name="queue" />Разобрать очередь<span class="ux-btncount pp-mono">{{ v.st.pending }}</span></a>
      }
    </header>

    <section class="ux-kpis" aria-label="Главные цифры">
      <a class="ux-kpi" routerLink="/objects"><span class="ux-kpi__label">Объектов в реестре</span><span class="ux-kpi__value">{{ int(v.st.total) }}</span><span class="ux-kpi__sub">{{ v.kinds }}</span></a>
      <a class="ux-kpi" routerLink="/objects" [queryParams]="{ status: 'attention' }"><span class="ux-kpi__label">Требуют внимания</span><span class="ux-kpi__value">{{ int(v.att) }}</span><span class="ux-kpi__sub">проверить {{ v.st.byDisplayStatus.suspected }} · дефект {{ v.st.byDisplayStatus.defect }}</span></a>
      <a class="ux-kpi" [class.ux-kpi--critical]="v.st.criticalOpen" routerLink="/objects" [queryParams]="{ status: 'critical' }"><span class="ux-kpi__label">@if (v.st.criticalOpen) {<pp-glyph status="critical" [size]="10" />}Критично открыто</span><span class="ux-kpi__value">{{ int(v.st.criticalOpen) }}</span><span class="ux-kpi__sub">тревога в обход очереди</span></a>
      @if (v.q?.available && v.q.kpi.accuracy != null) {
        <a class="ux-kpi" routerLink="/quality"><span class="ux-kpi__label">Точность модели</span><span class="ux-kpi__value">{{ pct(v.q.kpi.accuracy, 1) }}</span><span class="ux-kpi__sub">вид состояния на {{ int(v.q.evaluated) }} фото с разметкой@if (v.q.kpi.defectRecall != null) { · дефекты до человека {{ pct(v.q.kpi.defectRecall, 0) }}<!---->}</span></a>
      } @else {
        <a class="ux-kpi" routerLink="/objects" [queryParams]="{ status: 'not_observed' }"><span class="ux-kpi__label">Объект виден на кадре</span><span class="ux-kpi__value">{{ v.st.observedShare == null ? 'нет' : pct(v.st.observedShare, 0) }}</span><span class="ux-kpi__sub">не наблюдается {{ int(v.st.byDisplayStatus.not_observed) }} {{ pl(v.st.byDisplayStatus.not_observed, 'объект', 'объекта', 'объектов') }}</span></a>
      }
      <a class="ux-kpi" routerLink="/queue"><span class="ux-kpi__label">Ждут решения</span><span class="ux-kpi__value">{{ int(v.st.pending) }}</span><span class="ux-kpi__sub">{{ pl(v.st.pending, 'кадр', 'кадра', 'кадров') }} у диспетчера</span></a>
      <a class="ux-kpi" routerLink="/orders"><span class="ux-kpi__label">Наряды в работе</span><span class="ux-kpi__value">{{ int(v.st.workOrders.open) }}</span><span class="ux-kpi__sub">закрыто {{ int(v.st.workOrders.closed) }}</span></a>
    </section>

    <div class="ux-grid ux-grid--summary">
      <div class="ux-col">
        <section class="ux-panel">
          <header class="ux-panel__head"><h3 class="ux-panel__title">Состояние объектов</h3><span class="ux-panel__meta pp-mono">{{ int(v.st.total) }}</span></header>
          <pp-status-bar [parts]="v.parts" [total]="v.st.total" />
        </section>
        <div class="ux-grid ux-grid--2">
          <section class="ux-panel">
            <header class="ux-panel__head"><h3 class="ux-panel__title">Что ломается</h3><span class="ux-panel__meta">объекты с дефектом по виду</span></header>
            @if (v.defects.length) { <pp-hbars [rows]="v.defects" /> } @else { <p class="ux-note">Дефектов в данных нет.</p> }
          </section>
          <section class="ux-panel">
            <header class="ux-panel__head"><h3 class="ux-panel__title">Куда ушли кадры</h3><span class="ux-panel__meta pp-mono">{{ int(v.st.detections) }} {{ pl(v.st.detections, 'кадр', 'кадра', 'кадров') }}</span></header>
            @if (v.routes.length) { <pp-hbars [rows]="v.routes" [accent]="v.autoIdx" /> } @else { <p class="ux-note">Кадров нет.</p> }
            @if (v.routes.length && v.autoIdx >= 0) { <p class="ux-note">Уверенная норма закрывается без человека, людям уходит только сомнительное.</p> }
          </section>
        </div>
        @if (v.st.byDistrict.length) {
          <section class="ux-panel ux-panel--flush">
            <header class="ux-panel__head"><h3 class="ux-panel__title">Районы</h3><span class="ux-panel__meta">критичные первыми</span></header>
            <div class="ux-scroll"><table class="pp-table pp-table--dense ux-table ux-table--wraphead">
              <thead><tr><th>Район</th><th class="pp-table__num">Объектов</th>
                @for (s of statuses; track s) { <th class="pp-table__num"><span class="ux-th-glyph"><pp-glyph [status]="s" [size]="9" />{{ tax()?.statusLabel(s) }}</span></th> }
              </tr></thead>
              <tbody>
                @for (d of v.st.byDistrict; track d.district) {
                  <tr><td class="pp-table__main"><a class="ux-rowlink" routerLink="/objects" [queryParams]="{ district: d.district }">{{ d.district }}</a></td><td class="pp-table__num">{{ d.total }}</td>
                    @for (s of statuses; track s) {
                      <td class="pp-table__num" [class.ux-hot]="d[s] && s === 'critical'">{{ d[s] || '' }}@if (!d[s]) {<span class="pp-muted">0</span>}</td>
                    }
                  </tr>
                }
              </tbody>
            </table></div>
          </section>
        }
      </div>

      <div class="ux-col">
        <section class="ux-panel ux-panel--critical">
          <header class="ux-panel__head"><h3 class="ux-panel__title">Критичное сейчас</h3><span class="ux-panel__meta pp-mono">{{ v.st.criticalOpen }}</span></header>
          @if (v.crit.length) {
            <ul class="ux-crit">
              @for (o of v.crit; track o.id) {
                <li><a class="ux-crit__item" [routerLink]="['/objects', o.id]">
                  <pp-thumb [d]="o.evidence" />
                  <span class="ux-crit__body"><span class="ux-crit__top"><span class="pp-id">{{ o.id }}</span><pp-sev [sev]="o.maxSeverity" [label]="o.severityLabel" /></span>
                  <span class="ux-crit__label">{{ o.defectLabel }}</span>
                  <span class="ux-crit__meta">{{ o.kindLabel }} · <span class="pp-mono">{{ dt(o.lastSeenAt) }}</span></span></span></a></li>
              }
            </ul>
          } @else {
            <p class="ux-note"><pp-icon name="check" cls="pp-icon--sm" /> Критичных объектов нет.</p>
          }
          @if (v.critQueue && auth.can('review')) {
            <a class="pp-btn pp-btn--secondary pp-btn--sm pp-btn--block" routerLink="/queue">Разобрать критичные кадры</a>
          }
        </section>
        <section class="ux-panel">
          <header class="ux-panel__head"><h3 class="ux-panel__title">Лента событий</h3><span class="ux-panel__meta">последние</span></header>
          @if (feed().length) {
            <ol class="pp-timeline ux-feed">
              @for (f of feed(); track f.e.id) {
                <li class="pp-timeline__item" [class.is-new]="f.isNew">
                  <span [class]="'pp-timeline__node pp-timeline__node--' + node(f.e)"></span>
                  <div><div class="ux-feed__top"><span class="pp-timeline__time">{{ f.e.at ? dt(f.e.at) : 'без времени' }}</span><a class="pp-id ux-feed__id" [routerLink]="['/objects', f.e.objectId || '']">{{ f.e.objectId || '' }}</a></div>
                  <div class="pp-timeline__text">{{ f.e.label }}</div><div class="pp-timeline__meta">{{ f.e.text }}</div></div></li>
              }
            </ol>
          } @else {
            <p class="ux-note">Событий пока нет.</p>
          }
        </section>
      </div>
    </div>
  </div>
  }
}`,
})
export class SummaryView {
  readonly auth = inject(AuthService);
  private store = inject(PoputnoStore);
  readonly tax = this.store.tax;
  readonly statuses = STATUS_ORDER;

  readonly vm = this.store.select((ds) => {
    const tax = ds.taxonomy;
    const st = M.selectStats(ds);
    const q = ds.quality;
    const att = st.byDisplayStatus.suspected + st.byDisplayStatus.defect + st.byDisplayStatus.critical;
    const routes = ROUTE_ORDER.filter((r) => st.frames.byRoute[r]).map((r) => ({ label: tax.routeLabel(r), count: st.frames.byRoute[r] }));
    return {
      empty: !!ds.meta.empty,
      st,
      q,
      att,
      title: ds.meta.title || ds.meta.runId || (ds.meta.files || []).join(', ') || '',
      crit: M.selectObjects(ds, { displayStatus: 'critical', limit: 6 }) as any[],
      critQueue: (M.selectQueue(ds) as any[]).some((d) => d.isCritical),
      kinds: Object.entries(st.byKind as Record<string, any>).map(([k, v]) => `${tax.kindLabel(k === 'unknown' ? null : k).toLowerCase()} ${fmt.int(v.total)}`).join(' · '),
      parts: STATUS_ORDER.map((s) => ({ key: s, label: tax.statusLabel(s), count: st.byDisplayStatus[s] || 0, link: '/objects', query: { status: s } })),
      defects: (st.byDefect as any[]).map((d) => ({ label: d.label, count: d.count, link: '/objects', query: { defect: d.key } })),
      routes,
      autoIdx: routes.findIndex((r) => r.label === tax.routeLabel('auto_ok')),
    };
  }, null as any);

  /** Events seen on a previous paint: anything else in the feed is new and flashes once (site: `is-new`). */
  private seen: Set<string> | null = null;
  private readonly events = this.store.select((ds) => M.selectTimeline(ds, { limit: 14 }) as any[], [] as any[]);
  readonly feed = computed(() => {
    const evs = this.events();
    const seen = this.seen;
    this.seen = new Set(seen);
    for (const e of evs) this.seen.add(e.id);
    return evs.map((e) => ({ e, isNew: !!seen && !seen.has(e.id) }));
  });

  constructor() {
    inject(Shell).setTitle('Сводка');
  }

  node(e: any) {
    return eventNode(e);
  }
  int(v: number) {
    return fmt.int(v);
  }
  pct(v: number, d?: number) {
    return fmt.pct(v, d);
  }
  dt(iso: string) {
    return fmt.dateTime(iso);
  }
  pl(n: number, one: string, few: string, many: string) {
    return plural(n, [one, few, many]);
  }
}
