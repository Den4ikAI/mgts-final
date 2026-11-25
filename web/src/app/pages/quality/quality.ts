import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AuthImg } from '../../core/auth-img';

interface SweepRow { auto_ok: number; auto_share: number; to_humans_share: number; defects_missed: number; defect_recall: number | null }
interface Report {
  run_id: string;
  evaluated: number;
  images: number;
  no_label: number;
  api_errors: number;
  unmapped_labels: Record<string, number>;
  accuracy: number;
  macro_f1: number;
  defect_recall: number | null;
  false_alarm_rate: number | null;
  defects_total: number;
  defects_missed: number;
  auto_share: number;
  auto_precision: number | null;
  to_humans_share: number;
  per_class: Record<string, { label: string; support: number; precision: number; recall: number; f1: number }>;
  confusion: { labels: string[]; names: string[]; matrix: number[][] };
  threshold_sweep: SweepRow[];
  missed_examples: { file: string; truth: string; predicted: string | null; route: string; media_uri: string | null; object_id: string | null }[];
  cost_usd: number | null;
  wall_s: number | null;
  avg_latency_s: number | null;
  model: string | null;
  thresholds: { auto_ok: number } & Record<string, unknown>;
}
interface Quality { runs: { run_id: string; modified: string }[]; report: Report | null }

/** ML quality vs the organizers' annotation: what ml/evaluate.py wrote to report.json. */
@Component({
  selector: 'app-quality',
  imports: [PercentPipe, DecimalPipe, DatePipe, AuthImg],
  template: `
    <div class="head">
      <h1>Качество модели</h1>
      @if (data()?.runs?.length) {
        <label>
          <span class="mg-label">Прогон</span>
          <select (change)="load($any($event.target).value)">
            @for (r of data()!.runs; track r.run_id) {
              <option [value]="r.run_id" [selected]="r.run_id === rep()?.run_id">{{ r.run_id }} · {{ r.modified | date: 'dd.MM HH:mm' }}</option>
            }
          </select>
        </label>
      }
    </div>

    @if (rep(); as r) {
      <p class="sub">
        {{ r.model }} · оценено {{ r.evaluated }} из {{ r.images }} фото
        @if (r.no_label) { · без разметки {{ r.no_label }} }
        @if (r.api_errors) { · ошибок API {{ r.api_errors }} }
        · весь датасет {{ r.cost_usd | number: '1.2-4' }} $
        @if (r.avg_latency_s) { · ответ модели ≈ {{ r.avg_latency_s }} с на фото }
      </p>

      <div class="kpis">
        <div class="mg-kpi" [class.bad]="r.defects_missed > 0">
          <span class="mg-label">Дефекты дошли до человека</span>
          <span class="mg-kpi__value">{{ r.defect_recall === null ? '—' : (r.defect_recall | percent: '1.0-1') }}</span>
          <span class="mg-kpi__delta">{{ r.defects_total - r.defects_missed }} из {{ r.defects_total }} · пропущено {{ r.defects_missed }}</span>
        </div>
        <div class="mg-kpi">
          <span class="mg-label">Точность по виду дефекта</span>
          <span class="mg-kpi__value">{{ r.accuracy | percent: '1.0-1' }}</span>
          <span class="mg-kpi__delta">macro-F1 {{ r.macro_f1 | number: '1.2-2' }}</span>
        </div>
        <div class="mg-kpi">
          <span class="mg-label">Решено без людей</span>
          <span class="mg-kpi__value">{{ r.auto_share | percent: '1.0-1' }}</span>
          <span class="mg-kpi__delta">из них верно {{ r.auto_precision === null ? '—' : (r.auto_precision | percent: '1.0-1') }} · порог {{ r.thresholds.auto_ok }}</span>
        </div>
        <div class="mg-kpi">
          <span class="mg-label">Ложные тревоги на норме</span>
          <span class="mg-kpi__value">{{ r.false_alarm_rate === null ? '—' : (r.false_alarm_rate | percent: '1.0-1') }}</span>
          <span class="mg-kpi__delta">людям ушло {{ r.to_humans_share | percent: '1.0-1' }} кадров</span>
        </div>
      </div>

      @if (unmapped().length) {
        <p class="warn" role="alert">
          Метки без класса (добавить в aliases в ml/taxonomy.json):
          @for (u of unmapped(); track u[0]) { <span class="mg-data">«{{ u[0] }}» × {{ u[1] }}</span> }
        </p>
      }

      <div class="grid">
        <section class="panel">
          <h2>Матрица ошибок</h2>
          <p class="hint">Строки — разметка, столбцы — ответ модели. Темнее — больше фото.</p>
          <div class="scroll">
            <table class="cm">
              <thead><tr><th></th>@for (n of cm().names; track $index) { <th class="col"><span>{{ n }}</span></th> }</tr></thead>
              <tbody>
                @for (row of cm().rows; track row.name) {
                  <tr>
                    <th class="rowh">{{ row.name }}</th>
                    @for (c of row.cells; track $index) {
                      <td [style.background]="c.bg" [class.diag]="c.diag" [title]="row.name + ' → ' + cm().names[$index] + ': ' + c.v">
                        {{ c.v || '' }}
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        <section class="panel">
          <h2>По классам</h2>
          <table class="t">
            <thead><tr><th>Класс</th><th class="n">Фото</th><th class="n">Precision</th><th class="n">Recall</th><th class="n">F1</th></tr></thead>
            <tbody>
              @for (c of classes(); track c.label) {
                <tr>
                  <td>{{ c.label }}</td>
                  <td class="n mg-data">{{ c.support }}</td>
                  <td class="n mg-data">{{ c.precision | number: '1.2-2' }}</td>
                  <td class="n mg-data">{{ c.support ? (c.recall | number: '1.2-2') : '—' }}</td>
                  <td class="n mg-data">{{ c.f1 | number: '1.2-2' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </section>
      </div>

      <section class="panel">
        <h2>Порог автоподтверждения нормы</h2>
        <p class="hint">Выше порог — меньше работы снимаем с людей, но и меньше риск пропустить дефект. Текущий выделен.</p>
        <table class="t">
          <thead><tr><th class="n">Порог</th><th class="n">Без людей</th><th class="n">Людям</th><th class="n">Пропущено дефектов</th></tr></thead>
          <tbody>
            @for (w of r.threshold_sweep; track w.auto_ok) {
              <tr [class.cur]="w.auto_ok === r.thresholds.auto_ok">
                <td class="n mg-data">{{ w.auto_ok > 1 ? 'выкл' : w.auto_ok }}</td>
                <td class="n mg-data">{{ w.auto_share | percent: '1.0-1' }}</td>
                <td class="n mg-data">{{ w.to_humans_share | percent: '1.0-1' }}</td>
                <td class="n mg-data" [class.badtxt]="w.defects_missed > 0">{{ w.defects_missed }}</td>
              </tr>
            }
          </tbody>
        </table>
      </section>

      @if (r.missed_examples.length) {
        <section class="panel">
          <h2>Пропущенные дефекты</h2>
          <div class="missed">
            @for (m of r.missed_examples; track m.file) {
              <figure>
                @if (m.media_uri) { <img [mgAuthSrc]="m.media_uri" [alt]="m.file" /> }
                <figcaption><b>{{ m.truth }}</b> → {{ m.predicted ?? '—' }}<br /><span class="mg-data">{{ m.file }}</span></figcaption>
              </figure>
            }
          </div>
        </section>
      }
    } @else if (loaded()) {
      <p>Отчётов ещё нет. Запустите <code>ml/worker.py</code>, затем <code>ml/evaluate.py</code>.</p>
    }
  `,
  styles: `
    .head { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: space-between; }
    .head label { display: flex; gap: 8px; align-items: center; }
    select { height: 36px; padding: 0 10px; border-radius: 6px; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); font: 14px var(--font-sans); }
    .sub, .hint { color: var(--ink-muted); font-size: 14px; margin: 4px 0 12px; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .mg-kpi.bad { border-color: var(--status-defect); }
    .warn { padding: 10px 12px; border-radius: 8px; border: 1px solid var(--status-suspected); display: flex; gap: 10px; flex-wrap: wrap; }
    .grid { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
    .grid > .panel { flex: 1 1 420px; min-width: 0; }
    .panel { padding: 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); margin-bottom: 16px; }
    h2 { margin: 0 0 4px; font-size: 17px; }
    .scroll { overflow-x: auto; }
    table { border-collapse: collapse; font-size: 14px; }
    .t { width: 100%; }
    .t th, .t td { padding: 8px; border-bottom: 1px solid var(--line); text-align: left; }
    .t .n { text-align: right; }
    .t tr.cur td { background: var(--surface-2); font-weight: 600; }
    .badtxt { color: var(--status-defect); }
    .cm th, .cm td { padding: 0; }
    .cm td { width: 44px; height: 40px; text-align: center; font-family: var(--font-mono); border: 2px solid var(--surface); border-radius: 4px; color: var(--ink); }
    .cm td.diag { outline: 1px solid var(--ink-muted); outline-offset: -3px; }
    .cm .rowh { text-align: right; padding-right: 10px; font-weight: 400; white-space: nowrap; color: var(--ink-muted); }
    .cm .col { height: 120px; vertical-align: bottom; font-weight: 400; color: var(--ink-muted); }
    .cm .col span { display: inline-block; writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; }
    .missed { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
    figure { margin: 0; }
    figure img { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 8px; background: var(--surface-2); }
    figcaption { font-size: 13px; margin-top: 4px; }
  `,
})
export class QualityPage {
  private http = inject(HttpClient);
  readonly data = signal<Quality | null>(null);
  readonly loaded = signal(false);
  readonly rep = computed(() => this.data()?.report ?? null);
  readonly unmapped = computed(() => Object.entries(this.rep()?.unmapped_labels ?? {}));
  readonly classes = computed(() => Object.values(this.rep()?.per_class ?? {}));

  /** Sequential single hue: share of the row → accent mixed into the surface. */
  readonly cm = computed(() => {
    const c = this.rep()?.confusion;
    if (!c) return { names: [] as string[], rows: [] as { name: string; cells: { v: number; bg: string; diag: boolean }[] }[] };
    const keep = c.labels.map((_, i) => c.matrix[i].some((v) => v) || c.matrix.some((row) => row[i]));
    const idx = c.labels.map((_, i) => i).filter((i) => keep[i]);
    return {
      names: idx.map((i) => c.names[i]),
      rows: idx.map((i) => {
        const total = c.matrix[i].reduce((a, b) => a + b, 0) || 1;
        return {
          name: c.names[i],
          cells: idx.map((j) => {
            const v = c.matrix[i][j];
            const share = Math.round((v / total) * 70);
            return { v, diag: i === j, bg: v ? `color-mix(in oklab, var(--brand-sky) ${10 + share}%, var(--surface))` : 'var(--surface-2)' };
          }),
        };
      }),
    };
  });

  constructor() {
    this.load();
  }

  load(run?: string) {
    this.http.get<Quality>('/api/quality', { params: run ? { run } : {} }).subscribe({
      next: (q) => {
        this.data.set(q);
        this.loaded.set(true);
      },
      error: () => this.loaded.set(true),
    });
  }
}
