import { html, mount, icon, $, debounce, download, plural } from '../ui/dom.js';
import { statusPill, sevChip, kindIcon, statusGlyph } from '../ui/components.js';
import { selectObjects, selectFacets, fmt, STATUS_ORDER } from '../data/index.js';
import { noData } from './summary.js';

const PAGE = 200;
const ATTENTION = ['suspected', 'defect', 'critical'];

/** CSV of the given objects (UTF-8 BOM, «;» for Russian Excel). */
export function objectsCsv(list, tax) {
  const cols = [
    ['ID', (o) => o.id],
    ['Тип', (o) => o.kindLabel],
    ['Статус', (o) => o.displayStatusLabel],
    ['Дефект', (o) => (o.severityRank ? o.defectLabel : '')],
    ['Опасность', (o) => (o.severityRank ? o.severityLabel : '')],
    ['Разметка', (o) => o.truth?.label || ''],
    ['Последний кадр', (o) => (o.lastSeenAt ? fmt.date(o.lastSeenAt) + ' ' + fmt.time(o.lastSeenAt) : '')],
    ['Кадров', (o) => o.passes],
    ['Уверенность', (o) => (o.confidence != null ? fmt.conf(o.confidence) : '')],
    ['Ждут решения', (o) => o.pendingCount],
    ['Рекомендация', (o) => o.recommendation || ''],
    ['Фото', (o) => o.evidence?.file || o.photo || ''],
  ];
  const q = (v) => { const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + [cols.map((c) => c[0]).join(';'), ...list.map((o) => cols.map(([, f]) => q(f(o))).join(';'))].join('\r\n');
}

export default {
  title: 'Объекты',
  render(root, ctx) {
    const { ds, tax, query } = ctx;
    if (ds.meta.empty) { mount(root, noData(ctx)); return {}; }
    const f = {
      q: query.q || '', status: query.status || '', kind: query.kind || '', severity: query.severity || '',
      district: query.district || '', defect: query.defect || '', sort: query.sort || 'priority', coords: query.coords || '',
    };
    let limit = PAGE;
    let current = [];

    const facets = selectFacets(ds);
    const sel = (name, label, options) => html`<label class="ux-filter"><span class="ux-filter__label">${label}</span><span class="pp-select"><select data-f="${name}">${options.map(([v, l]) => html`<option value="${v}" ${f[name] === v ? 'selected' : ''}>${l}</option>`)}</select><svg class="pp-select__chevron" aria-hidden="true"><use href="../brand/icons.svg#i-chevron-down"/></svg></span></label>`;

    mount(root, html`<div class="ux-page ux-page--wide">
      <header class="ux-pagehead">
        <div><h2 class="pp-h2">Реестр объектов</h2>
          <p class="ux-pagehead__meta">Перечень ТКШ и РЩ по ID с состоянием и рекомендацией. Координат в датасете нет, поэтому их нет и здесь. Выгрузка берёт текущий список с фильтрами.</p></div>
        <button class="pp-btn pp-btn--primary" id="export">${icon('upload')}Выгрузить перечень<span class="ux-btncount pp-mono" id="export-count"></span></button>
      </header>
      <div class="ux-toolbar">
        <label class="pp-search ux-toolbar__search"><svg class="pp-search__icon" aria-hidden="true"><use href="../brand/icons.svg#i-search"/></svg>
          <input class="pp-input" type="search" data-f="q" value="${f.q}" placeholder="ID или дефект" aria-label="Поиск по реестру"></label>
        ${sel('status', 'Статус', [['', 'Все статусы'], ['attention', 'Требуют внимания'], ...STATUS_ORDER.map((s) => [s, tax.statusLabel(s)])])}
        ${sel('kind', 'Тип', [['', 'Все типы'], ...facets.kinds.map((k) => [k, tax.kindLabel(k)])])}
        ${sel('severity', 'Опасность', [['', 'Любая'], ...['critical', 'high', 'medium', 'low'].map((s) => [s, tax.severityLabel(s)])])}
        ${facets.defectTypes.length ? sel('defect', 'Дефект', [['', 'Любой'], ...facets.defectTypes.map((d) => [d.key, d.label])]) : ''}
        ${sel('sort', 'Порядок', [['priority', 'Сначала срочные'], ['lastSeen', 'Последний кадр'], ['severity', 'По опасности'], ['id', 'По ID']])}
        <button class="pp-btn pp-btn--ghost pp-btn--sm ux-toolbar__reset" id="reset" hidden>Сбросить</button>
      </div>
      <p class="ux-count" id="count" aria-live="polite"></p>
      <div class="pp-table-wrap ux-tablewrap"><table class="pp-table ux-table ux-objects">
        <thead><tr><th>ID</th><th>Тип</th><th>Статус</th><th>Дефект</th><th>Опасность</th><th>Разметка</th><th>Последний кадр</th><th class="pp-table__num ux-col-passes">Кадров</th><th class="ux-col-reco">Рекомендация</th></tr></thead>
        <tbody id="rows"></tbody></table></div>
      <div class="ux-more" id="more"></div>
    </div>`);

    function filtered() {
      const status = f.status === 'attention' ? ATTENTION : f.status || undefined;
      return selectObjects(ds, {
        q: f.q || undefined, displayStatus: status, kind: f.kind || undefined, severity: f.severity || undefined,
        district: f.district || undefined, defectType: f.defect || undefined, sort: f.sort,
        hasCoords: f.coords === '1' ? true : undefined,
      });
    }

    function paint() {
      current = filtered();
      const rows = current.slice(0, limit);
      $('#rows', root).innerHTML = rows.length ? String(html`${rows.map((o) => html`<tr data-id="${o.id}">
        <td class="pp-table__main"><a class="pp-id ux-rowlink" href="#/objects/${encodeURIComponent(o.id)}">${o.id}</a></td>
        <td><span class="ux-kind">${kindIcon(o.kind)}${o.kindLabel}</span></td>
        <td>${statusPill(o.displayStatus, o.displayStatusLabel, { sm: true })}</td>
        <td class="pp-table__main">${o.severityRank ? o.defectLabel : html`<span class="pp-muted">${o.status === 'not_observed' ? 'нет данных' : 'нет'}</span>`}</td>
        <td>${o.severityRank ? sevChip(o.maxSeverity, o.severityLabel) : html`<span class="pp-muted">нет</span>`}</td>
        <td>${o.truth ? html`${o.truth.label}${o.latest?.correct === false ? html` <span class="pp-muted">≠ модель</span>` : ''}` : html`<span class="pp-muted">нет</span>`}</td>
        <td class="pp-mono">${fmt.dateTime(o.lastSeenAt)}</td>
        <td class="pp-table__num ux-col-passes">${o.passes}</td>
        <td class="ux-reco-cell ux-col-reco" title="${o.recommendation || ''}">${o.recommendation || html`<span class="pp-muted">нет</span>`}</td></tr>`)}`)
        : `<tr><td colspan="9" class="ux-emptyrow">Под фильтр ничего не попало. Сбросьте фильтры или измените запрос.</td></tr>`;
      $('#count', root).textContent = `${fmt.int(current.length)} ${plural(current.length, ['объект', 'объекта', 'объектов'])} из ${fmt.int(ds.objects.length)}${current.length > rows.length ? `, показаны первые ${rows.length}` : ''}`;
      $('#export-count', root).textContent = fmt.int(current.length);
      $('#more', root).innerHTML = current.length > rows.length ? `<button class="pp-btn pp-btn--secondary" id="more-btn">Показать ещё ${Math.min(PAGE, current.length - rows.length)}</button>` : '';
      const active = ['q', 'status', 'kind', 'severity', 'district', 'defect', 'coords'].some((k) => f[k]);
      $('#reset', root).hidden = !active;
    }

    const syncUrl = () => {
      const q = Object.fromEntries(Object.entries(f).filter(([k, v]) => v && !(k === 'sort' && v === 'priority')));
      history.replaceState(null, '', ctx.href('/objects', q));
    };
    const onInput = debounce(() => { limit = PAGE; syncUrl(); paint(); }, 120);
    root.addEventListener('input', (e) => { const k = e.target.dataset?.f; if (k) { f[k] = e.target.value; onInput(); } });
    root.addEventListener('change', (e) => { const k = e.target.dataset?.f; if (k && e.target.tagName === 'SELECT') { f[k] = e.target.value; limit = PAGE; syncUrl(); paint(); } });
    root.addEventListener('click', (e) => {
      if (e.target.closest('#more-btn')) { limit += PAGE; paint(); return; }
      if (e.target.closest('#reset')) {
        Object.assign(f, { q: '', status: '', kind: '', severity: '', district: '', defect: '', coords: '' });
        root.querySelectorAll('[data-f]').forEach((el) => { el.value = f[el.dataset.f] ?? ''; });
        syncUrl(); paint(); return;
      }
      if (e.target.closest('#export')) {
        const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
        download(`poputno-perechen-${stamp}.csv`, objectsCsv(current, tax));
        ctx.toast({ title: 'Перечень выгружен', text: `${fmt.int(current.length)} ${plural(current.length, ['объект', 'объекта', 'объектов'])}, CSV для Excel`, tone: 'ok' });
        return;
      }
      const tr = e.target.closest('tr[data-id]');
      if (tr && !e.target.closest('a')) ctx.navigate(`/objects/${encodeURIComponent(tr.dataset.id)}`);
    });
    root.addEventListener('keydown', (e) => {
      const tr = e.target.closest?.('tr[data-id]');
      if (tr && e.key === 'Enter') ctx.navigate(`/objects/${encodeURIComponent(tr.dataset.id)}`);
    });

    paint();
    return { update: paint };
  },
};

export { statusGlyph };
