/**
 * Small HTML/SVG charts on tokens, ported from design2/site/js/ui/charts.js.
 * Brand rule: grey series + one signal accent; warm colours only where the bar IS an object status.
 * Markup and classes are the site's; hosts are `display: contents`, so the CSS applies as is.
 */
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { fmt } from '../data/legacy';
import { PpGlyph, stClass } from './pp';

/** A link target for chart rows: router path + optional query params (site: `#/objects?status=…`). */
export interface ChartLink {
  link?: string;
  query?: Record<string, string> | null;
}
export interface StatusPart extends ChartLink {
  key: string;
  label: string;
  count: number;
}
export interface BarRow extends ChartLink {
  label: string;
  count: number;
  key?: string;
}

/** Status distribution: one stacked bar (2px surface gaps) + legend with glyph, word, count, share. */
@Component({
  selector: 'pp-status-bar',
  imports: [RouterLink, PpGlyph],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="ux-stack" role="img" [attr.aria-label]="aria()">
      @for (p of shown(); track p.key) {
        <span [class]="'ux-stack__seg ux-stack__seg--' + cls(p.key)" [style.flex-grow]="p.count" [attr.title]="p.label + ': ' + int(p.count) + ' (' + pct(p.count / sum()) + ')'"></span>
      }
    </div>
    <ul class="ux-legend">
      @for (p of parts(); track p.key) {
        <li><a class="ux-legend__item" [routerLink]="p.link || '/objects'" [queryParams]="p.query || null"><pp-glyph [status]="p.key" [size]="11" /><span class="ux-legend__label">{{ p.label }}</span>
          <span class="ux-legend__val pp-mono">{{ int(p.count) }}</span><span class="ux-legend__pct pp-mono">{{ pct(p.count / sum(), 0) }}</span></a></li>
      }
    </ul>`,
})
export class PpStatusBar {
  readonly parts = input.required<StatusPart[]>();
  readonly total = input<number | null>(null);
  readonly sum = computed(() => this.total() || this.parts().reduce((a, p) => a + p.count, 0) || 1);
  readonly shown = computed(() => this.parts().filter((p) => p.count > 0));
  readonly aria = computed(() => this.parts().map((p) => `${p.label}: ${p.count}`).join(', '));
  readonly cls = stClass;
  int(v: number) {
    return fmt.int(v);
  }
  pct(v: number, d?: number) {
    return fmt.pct(v, d);
  }
}

/** Horizontal bars, grey; `accent` index (default 0 = the largest) in signal. */
@Component({
  selector: 'pp-hbars',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<ul class="ux-hbars">
    @for (r of rows(); track $index) {
      <li><a class="ux-hbars__row" [class.is-accent]="$index === accent()" [routerLink]="r.link || '/objects'" [queryParams]="r.query || null" [attr.title]="r.label + ': ' + int(r.count) + unit()">
        <span class="ux-hbars__label">{{ r.label }}</span>
        <span class="ux-hbars__track"><span class="ux-hbars__fill" [style.--v]="(r.count / max()).toFixed(4)"></span></span>
        <span class="ux-hbars__val pp-mono">{{ int(r.count) }}</span></a></li>
    }
  </ul>`,
})
export class PpHbars {
  readonly rows = input.required<BarRow[]>();
  readonly accent = input(0);
  readonly unit = input('');
  readonly max = computed(() => Math.max(1, ...this.rows().map((r) => r.count)));
  int(v: number) {
    return fmt.int(v);
  }
}

/**
 * Confusion matrix heatmap: single hue (signal), intensity = share of the row.
 * Rows = organizers' labels, columns = model answers.
 */
@Component({
  selector: 'pp-heatmap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="ux-scroll"><table class="ux-heat">
    <thead><tr><th class="ux-heat__corner"><span>разметка ↓</span><span>модель →</span></th>
      @for (nm of conf().names; track $index) { <th scope="col" class="ux-heat__colh" [attr.title]="nm"><span>{{ nm }}</span></th> }
    </tr></thead>
    <tbody>
      @for (row of rows(); track $index; let i = $index) {
        <tr><th scope="row" class="ux-heat__rowh" [attr.title]="row.name">{{ row.name }}<span class="pp-mono pp-muted"> {{ row.total }}</span></th>
          @for (c of row.cells; track $index) {
            <td class="ux-heat__cell" [class.is-diag]="c.diag" [class.is-strong]="c.a > 0.55" [style.--a]="c.a.toFixed(3)" [attr.title]="c.title"><span class="pp-mono">{{ c.v || '' }}</span></td>
          }
        </tr>
      }
    </tbody></table></div>`,
})
export class PpHeatmap {
  /** Normalized confusion: {labels, names, matrix, rowTotals}. */
  readonly conf = input.required<any>();
  readonly rows = computed(() => {
    const conf = this.conf();
    const names: string[] = conf.names;
    return (conf.matrix as number[][]).map((r, i) => {
      const rt = conf.rowTotals[i] || 1;
      return {
        name: names[i],
        total: conf.rowTotals[i],
        cells: r.map((v, j) => {
          const share = v / rt;
          const a = v ? Math.max(0.12, share) : 0;
          return { v, a, diag: i === j, title: `Разметка: ${names[i]} → модель: ${names[j]} · ${v} (${fmt.pct(share, 0)} строки)` };
        }),
      };
    });
  });
}

/**
 * Threshold sweep: two lines on one 0..1 axis (share without humans, defect recall),
 * the current threshold marked. Both measures are shares, so one axis is honest.
 */
@Component({
  selector: 'pp-sweep',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `@if (g(); as g) {
    <figure class="ux-chart">
      <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" role="img" aria-label="Перебор порога автоподтверждения: доля без людей и доля найденных дефектов">
        @for (t of g.grid; track $index) {
          <line [attr.x1]="L" [attr.x2]="W - R" [attr.y1]="t.y" [attr.y2]="t.y" class="ux-chart__grid" /><text [attr.x]="L - 6" [attr.y]="t.y + 4" class="ux-chart__tick" text-anchor="end">{{ t.label }}</text>
        }
        @if (g.cur != null) {
          <line [attr.x1]="g.cur" [attr.x2]="g.cur" [attr.y1]="T" [attr.y2]="H - B" class="ux-chart__cur" /><text [attr.x]="g.cur + 5" [attr.y]="g.y0 - 6" class="ux-chart__curlabel">сейчас</text>
        }
        <path [attr.d]="g.recallLine" class="ux-chart__line ux-chart__line--accent" />
        <path [attr.d]="g.autoLine" class="ux-chart__line" />
        @for (d of g.recallDots; track $index) {
          <circle [attr.cx]="d.x" [attr.cy]="d.y" r="4" class="ux-chart__dot ux-chart__dot--accent"><title>{{ d.title }}</title></circle>
        }
        @for (d of g.autoDots; track $index) {
          <circle [attr.cx]="d.x" [attr.cy]="d.y" r="4" class="ux-chart__dot"><title>{{ d.title }}</title></circle>
        }
        @for (t of g.ticks; track $index) {
          <text [attr.x]="t.x" [attr.y]="H - 8" class="ux-chart__tick" text-anchor="middle">{{ t.label }}</text>
        }
      </svg>
      <figcaption class="ux-chart__legend"><span><i class="ux-key ux-key--accent"></i>Дефекты дошли до человека</span><span><i class="ux-key"></i>Решено без людей</span><span class="pp-muted">ось X: порог автоподтверждения нормы</span></figcaption>
    </figure>
  }`,
})
export class PpSweep {
  /** Normalized threshold sweep rows ({autoOk, off, current, autoShare, defectRecall, …}). */
  readonly sweep = input.required<any[]>();
  readonly W = 560;
  readonly H = 200;
  readonly L = 36;
  readonly R = 12;
  readonly T = 12;
  readonly B = 28;

  readonly g = computed(() => {
    const pts = this.sweep().filter((w) => !w.off);
    if (pts.length < 2) return null;
    const { W, H, L, R, T, B } = this;
    const xs = pts.map((w) => w.autoOk as number);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const X = (v: number) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R);
    const Y = (v: number) => T + (1 - v) * (H - T - B);
    const line = (key: string) =>
      pts.filter((w) => w[key] != null).map((w, i) => `${i ? 'L' : 'M'}${X(w.autoOk).toFixed(1)} ${Y(w[key]).toFixed(1)}`).join(' ');
    const dots = (key: string) =>
      pts.filter((w) => w[key] != null).map((w) => ({ x: X(w.autoOk), y: Y(w[key]), title: `порог ${w.autoOk.toFixed(2)}: ${fmt.pct(w[key])}` }));
    const cur = pts.find((w) => w.current);
    return {
      grid: [0, 0.25, 0.5, 0.75, 1].map((v) => ({ y: Y(v), label: `${Math.round(v * 100)}%` })),
      ticks: pts.map((w) => ({ x: X(w.autoOk), label: w.autoOk.toFixed(2) })),
      cur: cur ? X(cur.autoOk) : null,
      y0: Y(0),
      recallLine: line('defectRecall'),
      autoLine: line('autoShare'),
      recallDots: dots('defectRecall'),
      autoDots: dots('autoShare'),
    };
  });
}

/** Thin progress meter 0..1 (pp-progress, scaleX). */
@Component({
  selector: 'pp-meter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<span class="pp-progress ux-meter"><span class="pp-progress__fill" [style.--value]="v()"></span></span>`,
})
export class PpMeter {
  readonly value = input<number | null | undefined>(null);
  readonly v = computed(() => Math.max(0, Math.min(1, this.value() ?? 0)).toFixed(4));
}

/** All charts, for `imports: [...CHARTS]`. */
export const CHARTS = [PpStatusBar, PpHbars, PpHeatmap, PpSweep, PpMeter];
