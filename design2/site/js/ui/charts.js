/**
 * Small HTML/SVG charts on tokens. Brand rule: grey series + one signal accent;
 * warm colours only where the bar IS an object status.
 */
import { html, raw } from './dom.js';
import { statusGlyph, stClass } from './components.js';
import { fmt } from '../data/index.js';

/**
 * Status distribution: one stacked bar (2px surface gaps) + legend with glyph, word, count, share.
 * @param {{key:string,label:string,count:number,href?:string}[]} parts
 */
export function statusBar(parts, total) {
  const sum = total || parts.reduce((a, p) => a + p.count, 0) || 1;
  const shown = parts.filter((p) => p.count > 0);
  return html`<div class="ux-stack" role="img" aria-label="${parts.map((p) => `${p.label}: ${p.count}`).join(', ')}">
      ${shown.map((p) => html`<span class="ux-stack__seg ux-stack__seg--${stClass(p.key)}" style="flex-grow:${p.count}" title="${p.label}: ${fmt.int(p.count)} (${fmt.pct(p.count / sum)})"></span>`)}
    </div>
    <ul class="ux-legend">${parts.map((p) => html`<li>
      <a class="ux-legend__item" href="${p.href || '#/objects'}">${statusGlyph(p.key, 11)}<span class="ux-legend__label">${p.label}</span>
      <span class="ux-legend__val pp-mono">${fmt.int(p.count)}</span><span class="ux-legend__pct pp-mono">${fmt.pct(p.count / sum, 0)}</span></a></li>`)}</ul>`;
}

/**
 * Horizontal bars, grey; `accent` index (default 0 = the largest) in signal.
 * @param {{label:string,count:number,href?:string}[]} rows
 */
export function hbars(rows, { accent = 0, unit = '' } = {}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return html`<ul class="ux-hbars">${rows.map((r, i) => html`<li>
      <a class="ux-hbars__row${i === accent ? ' is-accent' : ''}" href="${r.href || '#/objects'}" title="${r.label}: ${fmt.int(r.count)}${unit}">
        <span class="ux-hbars__label">${r.label}</span>
        <span class="ux-hbars__track"><span class="ux-hbars__fill" style="--v:${(r.count / max).toFixed(4)}"></span></span>
        <span class="ux-hbars__val pp-mono">${fmt.int(r.count)}</span></a></li>`)}</ul>`;
}

/**
 * Confusion matrix heatmap: single hue (signal), intensity = share of the row.
 * Rows = organizers' labels, columns = model answers.
 */
export function heatmap(conf) {
  const n = conf.labels.length;
  const cells = [];
  for (let i = 0; i < n; i++) {
    const rt = conf.rowTotals[i] || 1;
    cells.push(html`<tr><th scope="row" class="ux-heat__rowh" title="${conf.names[i]}">${conf.names[i]}<span class="pp-mono pp-muted"> ${conf.rowTotals[i]}</span></th>
      ${conf.matrix[i].map((v, j) => {
        const share = v / rt;
        const a = v ? Math.max(0.12, share) : 0;
        return html`<td class="ux-heat__cell${i === j ? ' is-diag' : ''}${a > 0.55 ? ' is-strong' : ''}" style="--a:${a.toFixed(3)}" title="Разметка: ${conf.names[i]} → модель: ${conf.names[j]} · ${v} (${fmt.pct(share, 0)} строки)"><span class="pp-mono">${v || ''}</span></td>`;
      })}</tr>`);
  }
  return html`<div class="ux-scroll"><table class="ux-heat">
    <thead><tr><th class="ux-heat__corner"><span>разметка ↓</span><span>модель →</span></th>${conf.names.map((nm) => html`<th scope="col" class="ux-heat__colh" title="${nm}"><span>${nm}</span></th>`)}</tr></thead>
    <tbody>${cells}</tbody></table></div>`;
}

/**
 * Threshold sweep: two lines on one 0..1 axis (share without humans, defect recall),
 * the current threshold marked. Both measures are shares, so one axis is honest.
 */
export function sweepChart(sweep) {
  const pts = sweep.filter((w) => !w.off);
  if (pts.length < 2) return '';
  const W = 560, H = 200, L = 36, R = 12, T = 12, B = 28;
  const xs = pts.map((w) => w.autoOk);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const X = (v) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R);
  const Y = (v) => T + (1 - v) * (H - T - B);
  const line = (key) => pts.filter((w) => w[key] != null).map((w, i) => `${i ? 'L' : 'M'}${X(w.autoOk).toFixed(1)} ${Y(w[key]).toFixed(1)}`).join(' ');
  const cur = pts.find((w) => w.current);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((g) => `<line x1="${L}" x2="${W - R}" y1="${Y(g)}" y2="${Y(g)}" class="ux-chart__grid"/><text x="${L - 6}" y="${Y(g) + 4}" class="ux-chart__tick" text-anchor="end">${Math.round(g * 100)}%</text>`).join('');
  const ticks = pts.map((w) => `<text x="${X(w.autoOk)}" y="${H - 8}" class="ux-chart__tick" text-anchor="middle">${w.autoOk.toFixed(2)}</text>`).join('');
  const dots = (key, cls) => pts.filter((w) => w[key] != null).map((w) => `<circle cx="${X(w.autoOk)}" cy="${Y(w[key])}" r="4" class="${cls}"><title>порог ${w.autoOk.toFixed(2)}: ${fmt.pct(w[key])}</title></circle>`).join('');
  const curLine = cur ? `<line x1="${X(cur.autoOk)}" x2="${X(cur.autoOk)}" y1="${T}" y2="${H - B}" class="ux-chart__cur"/><text x="${X(cur.autoOk) + 5}" y="${Y(0) - 6}" class="ux-chart__curlabel">сейчас</text>` : '';
  return html`<figure class="ux-chart">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Перебор порога автоподтверждения: доля без людей и доля найденных дефектов">
      ${raw(grid)}${raw(curLine)}
      <path d="${line('defectRecall')}" class="ux-chart__line ux-chart__line--accent"/>
      <path d="${line('autoShare')}" class="ux-chart__line"/>
      ${raw(dots('defectRecall', 'ux-chart__dot ux-chart__dot--accent'))}${raw(dots('autoShare', 'ux-chart__dot'))}
      ${raw(ticks)}
    </svg>
    <figcaption class="ux-chart__legend"><span><i class="ux-key ux-key--accent"></i>Дефекты дошли до человека</span><span><i class="ux-key"></i>Решено без людей</span><span class="pp-muted">ось X: порог автоподтверждения нормы</span></figcaption>
  </figure>`;
}

/** Thin progress meter 0..1 (pp-progress, scaleX). */
export function meter(v) {
  return html`<span class="pp-progress ux-meter"><span class="pp-progress__fill" style="--value:${Math.max(0, Math.min(1, v ?? 0)).toFixed(4)}"></span></span>`;
}
