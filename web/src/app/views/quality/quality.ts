import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth';
import { PoputnoStore } from '../../data/store';
import { M, fmt } from '../../data/legacy';
import { CHARTS } from '../../ui/charts';
import { ICONS, PP, plural } from '../../ui/pp';
import { Shell } from '../../ui/shell.service';

const pct = (v: number | null | undefined) => (v == null ? 'нет данных' : fmt.pct(v));

/** Weighted recall over classes whose default severity is critical (e.g. «Открытый люк»). */
function criticalRecall(q: any, tax: any) {
  const rows = (q.perClass as any[]).filter((c) => tax.info(c.key)?.severity === 'critical' && c.support > 0);
  if (!rows.length) return null;
  const sup = rows.reduce((a, c) => a + c.support, 0);
  return { value: rows.reduce((a, c) => a + c.recall * c.support, 0) / sup, support: sup, labels: rows.map((c) => c.label) };
}

/** «Качество модели»: metrics on the organizers' annotation, confusion, per class, threshold sweep, misses (design2/site/js/views/quality.js). */
@Component({
  selector: 'app-quality-view',
  imports: [RouterLink, ...PP, ...CHARTS],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
@if (vm(); as v) {
  @if (!v.q) {
    <div class="ux-page">
      <pp-empty icon="eye" title="Отчёта о качестве пока нет" text="Качество считается по разметке организаторов. Отчёт появится после прогона модели по размеченным фото (ml/runs/&lt;прогон&gt;/report.json).">
        @if (auth.can('frames_upload')) { <a class="pp-btn pp-btn--primary" routerLink="/import"><pp-icon name="upload" />Загрузить данные</a> }
      </pp-empty>
    </div>
  } @else {
  @let q = v.q;
  @let k = q.kpi;
  <div class="ux-page ux-page--wide">
    <header class="ux-pagehead">
      <div><h2 class="pp-h2">Качество модели</h2>
        <p class="ux-pagehead__meta">
          @if (q.model) {<span class="pp-mono">{{ q.model }}</span> · }прогон <span class="pp-mono">{{ q.runId || 'без имени' }}</span> · оценено {{ int(q.evaluated) }} из {{ int(q.images) }} фото
          @if (q.costUsd != null) { · весь прогон <span class="pp-mono">{{ usd(q.costUsd) }}</span>}@if (q.costPerImage != null) { (<span class="pp-mono">{{ usd(q.costPerImage) }}</span> за фото)}
          @if (q.avgLatencyS != null) { · ответ в среднем <span class="pp-mono">{{ sec(q.avgLatencyS) }}</span> с}</p></div>
      @if (v.runs.length > 1) {
        <label class="ux-filter"><span class="ux-filter__label">Прогон</span><span class="pp-select"><select id="run" [disabled]="busy()" (change)="pickRun($any($event.target).value)">
          @for (r of v.runs; track r.run_id) { <option [value]="r.run_id" [selected]="r.run_id === q.runId">{{ r.run_id }}</option> }
        </select><svg class="pp-select__chevron" aria-hidden="true"><use [attr.href]="icons + '#i-chevron-down'" /></svg></span></label>
      }
    </header>
    @if (v.unm.length) {
      <div class="ux-banner ux-banner--warn"><pp-icon name="alert" cls="pp-icon--sm" /><span>Метки разметки без класса в таксономии не вошли в оценку:
        @for (u of v.unm; track u[0]; let last = $last) {<b>{{ u[0] }}</b>&ngsp;<span class="pp-mono">{{ u[1] }}</span>@if (!last) {, }}. Добавьте их в aliases файла data/taxonomy.json.</span></div>
    }

    <section class="ux-kpis ux-kpis--5" aria-label="Главные метрики">
      <div class="ux-kpi"><span class="ux-kpi__label">Точность по виду состояния</span><span class="ux-kpi__value">{{ pct(k.accuracy) }}</span><span class="ux-kpi__sub">на {{ int(q.evaluated) }} фото с разметкой · macro-F1 <span class="pp-mono">{{ conf(k.macroF1) }}</span></span></div>
      <div class="ux-kpi"><span class="ux-kpi__label">Дефекты дошли до человека</span><span class="ux-kpi__value">{{ pct(k.defectRecall) }}</span><span class="ux-kpi__sub">{{ int(k.defectsTotal - k.defectsMissed) }} из {{ int(k.defectsTotal) }}, пропущено {{ int(k.defectsMissed) }}</span></div>
      <div class="ux-kpi"><span class="ux-kpi__label">Решено без людей</span><span class="ux-kpi__value">{{ pct(k.autoShare) }}</span><span class="ux-kpi__sub">точность автонормы {{ pct(k.autoPrecision) }} · порог <span class="pp-mono">{{ conf(q.thresholds?.auto_ok) }}</span></span></div>
      <div class="ux-kpi"><span class="ux-kpi__label">Ложные тревоги на норме</span><span class="ux-kpi__value">{{ pct(k.falseAlarmRate) }}</span><span class="ux-kpi__sub">людям уходит {{ pct(k.toHumansShare) }} кадров</span></div>
      @if (q.raw?.kind_accuracy != null) {
        <div class="ux-kpi"><span class="ux-kpi__label">Тип объекта ТКШ / РЩ</span><span class="ux-kpi__value">{{ pct(q.raw.kind_accuracy) }}</span><span class="ux-kpi__sub">на РЩ-фото рядом часто висит шкаф крупнее</span></div>
      } @else {
        <div class="ux-kpi"><span class="ux-kpi__label">Найдено критичных</span><span class="ux-kpi__value">{{ v.cr ? pct(v.cr.value) : 'нет' }}</span><span class="ux-kpi__sub">@if (v.cr) {recall по классам «{{ v.cr.labels.join('», «') }}», {{ v.cr.support }} фото} @else {в разметке нет критичных классов}</span></div>
      }
    </section>
    @if (!q.computed && q.evaluated) {
      <div class="ux-banner ux-banner--info"><pp-icon name="alert" cls="pp-icon--sm" /><span>Выборка маленькая: {{ int(q.evaluated) }} фото. Описания классов уточнялись по ошибкам на этих же фото, поэтому честная оценка будет только на новых снимках. Новые фото проверяются на странице «Проверить фото» и при загрузке папки.</span></div>
    }

    <div class="ux-grid ux-grid--quality">
      <section class="ux-panel">
        <header class="ux-panel__head"><h3 class="ux-panel__title">Где модель путает классы</h3><span class="ux-panel__meta">строки разметка, столбцы ответ модели, цвет доля строки</span></header>
        @if (q.confusion) { <pp-heatmap [conf]="q.confusion" /> } @else { <p class="ux-note">В отчёте нет матрицы ошибок.</p> }
      </section>
      <section class="ux-panel">
        <header class="ux-panel__head"><h3 class="ux-panel__title">Куда ушли кадры</h3><span class="ux-panel__meta pp-mono">{{ int(q.images) }}</span></header>
        @if (v.routes.length) { <pp-hbars [rows]="v.routes" [accent]="v.autoIdx" /> } @else { <p class="ux-note">Нет данных о маршрутах.</p> }
        @if (q.apiErrors) { <p class="ux-note">Ошибок API: <span class="pp-mono">{{ q.apiErrors }}</span>, они не вошли в оценку.</p> }
        @if (q.noLabel) { <p class="ux-note">Без разметки: <span class="pp-mono">{{ q.noLabel }}</span> фото.</p> }
      </section>
    </div>

    <section class="ux-panel ux-panel--flush">
      <header class="ux-panel__head"><h3 class="ux-panel__title">По классам</h3><span class="ux-panel__meta">precision: сколько ответов модели верны · recall: сколько случаев нашлось</span></header>
      <div class="ux-scroll"><table class="pp-table ux-table ux-perclass">
        <thead><tr><th>Класс</th><th class="pp-table__num">Фото</th><th class="pp-table__num">Precision</th><th class="pp-table__num">Recall</th><th class="pp-table__num">F1</th><th class="ux-col-meter">F1</th></tr></thead>
        <tbody>
          @for (c of v.perClass; track c.key) {
            <tr>
              <td class="pp-table__main">{{ c.label }}@if (c.critical) { <span class="ux-tag-crit">критичный</span>}</td><td class="pp-table__num">{{ c.support }}</td>
              <td class="pp-table__num">{{ conf(c.precision) }}</td><td class="pp-table__num">{{ conf(c.recall) }}</td><td class="pp-table__num">{{ conf(c.f1) }}</td><td class="ux-col-meter"><pp-meter [value]="c.f1" /></td></tr>
          }
        </tbody></table></div>
    </section>

    @if (q.thresholdSweep.length) {
      <section class="ux-panel">
        <header class="ux-panel__head"><h3 class="ux-panel__title">Цена автоподтверждения нормы</h3><span class="ux-panel__meta">чем ниже порог, тем больше кадров закрывается без человека и тем больше дефектов можно пропустить</span></header>
        <div class="ux-grid ux-grid--sweep">
          <pp-sweep [sweep]="q.thresholdSweep" />
          <div class="ux-scroll"><table class="pp-table pp-table--dense ux-table">
            <thead><tr><th class="pp-table__num">Порог</th><th class="pp-table__num">Без людей</th><th class="pp-table__num">Людям</th><th class="pp-table__num">Пропущено</th><th class="pp-table__num">Дошли</th></tr></thead>
            <tbody>
              @for (w of q.thresholdSweep; track $index) {
                <tr [attr.aria-selected]="w.current ? 'true' : null">
                  <td class="pp-table__num">{{ w.off ? 'выкл' : w.autoOk.toFixed(2) }}@if (w.current) { <span class="ux-tag-cur">сейчас</span>}</td><td class="pp-table__num">{{ pct(w.autoShare) }}</td><td class="pp-table__num">{{ pct(w.toHumansShare) }}</td>
                  <td class="pp-table__num" [class.ux-hot]="w.defectsMissed">{{ w.defectsMissed }}</td><td class="pp-table__num">{{ pct(w.defectRecall) }}</td></tr>
              }
            </tbody></table></div>
        </div>
      </section>
    }

    @if (v.wrong.length) {
      <section class="ux-panel">
        <header class="ux-panel__head"><h3 class="ux-panel__title">Где модель ошиблась</h3><span class="ux-panel__meta">{{ int(v.wrong.length) }} {{ pl(v.wrong.length) }}: разметка → ответ модели</span></header>
        <ul class="ux-wrong">
          @for (d of v.wrong; track d.id) {
            <li><a class="ux-wrong__item" [routerLink]="['/objects', d.objectId]"><pp-thumb [d]="d" cls="ux-wrong__thumb" />
              <span class="ux-wrong__body"><span><b>{{ d.truth.label }}</b>&ngsp;<span class="pp-muted">→</span> {{ d.answer }}</span><span class="pp-mono pp-muted">{{ d.objectId }} · {{ d.routeLabel }}</span></span></a></li>
          }
        </ul>
      </section>
    }

    <section class="ux-panel">
      <header class="ux-panel__head"><h3 class="ux-panel__title">Пропущенные дефекты</h3><span class="ux-panel__meta pp-mono">{{ q.missed.length }}</span></header>
      @if (q.missed.length) {
        <ul class="ux-missed">
          @for (m of v.missed; track $index) {
            <li class="ux-missed__item">
              <figure class="pp-detect ux-photo ux-photo--cover">
                <pp-photo-img #ph [uri]="m.photo" [alt]="m.truth + ', файл ' + m.file" />
                @if (ph.failed()) { <div class="ux-nophoto"><pp-icon name="camera" cls="pp-icon--lg" /><span>Нет кадра</span></div> }
              </figure>
              <div class="ux-missed__body"><div><span class="ux-missed__truth">{{ m.truth }}</span>&ngsp;<span class="pp-muted">→</span> {{ m.predicted }}</div>
              <div class="ux-missed__meta pp-mono">{{ m.file }}@if (m.objectId) { · <a class="ux-link" [routerLink]="['/objects', m.objectId]">{{ m.objectId }}</a>}</div>
              <div class="ux-missed__meta">{{ m.routeLabel }}</div></div></li>
          }
        </ul>
      } @else {
        <p class="ux-note"><pp-icon name="check" cls="pp-icon--sm" /> Все дефекты из разметки дошли до человека.</p>
      }
    </section>
  </div>
  }
}`,
})
export class QualityView {
  readonly auth = inject(AuthService);
  private store = inject(PoputnoStore);
  private shell = inject(Shell);
  readonly icons = ICONS;
  readonly busy = signal(false);

  readonly vm = this.store.select((ds) => {
    const tax = ds.taxonomy;
    const q = ds.quality;
    if (!q || !q.available) return { q: null } as any;
    const routes = Object.entries((q.routes || {}) as Record<string, number>)
      .sort((a, b) => b[1] - a[1])
      .map(([r, n]) => ({ label: tax.routeLabel(r), count: n, key: r }));
    return {
      q,
      cr: criticalRecall(q, tax),
      routes,
      autoIdx: routes.findIndex((r) => r.key === 'auto_ok'),
      unm: Object.entries(q.unmappedLabels || {}),
      runs: (q.runs || ds.runs || []) as any[],
      perClass: (q.perClass as any[])
        .slice()
        .sort((a, b) => b.support - a.support)
        .map((c) => ({ ...c, critical: tax.info(c.key)?.severity === 'critical' })),
      wrong: (ds.detections as any[])
        .filter((d) => d.correct === false && d.truth && d.photo)
        .map((d) => ({ ...d, answer: tax.label(d.top === tax.okKey ? null : d.top) })),
      missed: (q.missed as any[]).map((m) => ({ ...m, photo: M.photoUrl(m.mediaUri, ds.meta.photoBase), routeLabel: tax.routeLabel(m.route) })),
    };
  }, null as any);

  constructor() {
    this.shell.setTitle('Качество модели');
  }

  async pickRun(runId: string) {
    this.busy.set(true);
    try {
      await this.store.quality(runId);
    } catch (err: any) {
      this.shell.toast({ title: 'Прогон не загрузился', text: err?.error?.error || err?.message, tone: 'critical' });
    } finally {
      this.busy.set(false);
    }
  }

  pct(v: number | null | undefined) {
    return pct(v);
  }
  int(v: number) {
    return fmt.int(v);
  }
  conf(v: number | null | undefined) {
    return fmt.conf(v);
  }
  usd(v: number) {
    return fmt.usd(v);
  }
  sec(v: number) {
    return v.toFixed(2).replace('.', ',');
  }
  pl(n: number) {
    return plural(n, ['кадр', 'кадра', 'кадров']);
  }
}
