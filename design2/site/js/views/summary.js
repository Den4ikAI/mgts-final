import { html, raw, mount, icon, plural } from '../ui/dom.js';
import { statusPill, thumb, empty, eventNode, statusGlyph, sevChip } from '../ui/components.js';
import { statusBar, hbars } from '../ui/charts.js';
import { selectStats, selectObjects, selectTimeline, selectQueue, fmt, STATUS_ORDER } from '../data/index.js';

export function noData(ctx) {
  return html`<div class="ux-page">${empty({
    iconName: 'upload', title: 'Данные ещё не загружены',
    text: 'Датасет выключен, а своих загрузок нет. Загрузите фото или результаты прогона, либо снова включите датасет организаторов.',
    actions: html`<a class="pp-btn pp-btn--primary" href="#/import">${icon('upload')}Загрузить данные</a>`,
  })}</div>`;
}

const ROUTE_ORDER = ['critical', 'review', 'auto_ok', 'not_observed', 'error'];

export default {
  title: 'Сводка',
  render(root, ctx) {
    const { ds, tax } = ctx;
    const seen = new Set();
    const paint = (events = []) => {
      if (ds.meta.empty) { mount(root, noData(ctx)); return; }
      const st = selectStats(ds);
      const q = ds.quality;
      const att = st.byDisplayStatus.suspected + st.byDisplayStatus.defect + st.byDisplayStatus.critical;
      const crit = selectObjects(ds, { displayStatus: 'critical', limit: 6 });
      const feed = selectTimeline(ds, { limit: 14 });
      const fresh = new Set(events.map((e) => e.id));
      const queue = selectQueue(ds);
      const kinds = Object.entries(st.byKind).map(([k, v]) => `${tax.kindLabel(k === 'unknown' ? null : k).toLowerCase()} ${fmt.int(v.total)}`).join(' · ');
      const parts = STATUS_ORDER.map((s) => ({ key: s, label: tax.statusLabel(s), count: st.byDisplayStatus[s] || 0, href: `#/objects?status=${s}` }));
      const defects = st.byDefect.map((d) => ({ label: d.label, count: d.count, href: `#/objects?defect=${encodeURIComponent(d.key)}` }));
      const routes = ROUTE_ORDER.filter((r) => st.frames.byRoute[r]).map((r) => ({ label: tax.routeLabel(r), count: st.frames.byRoute[r] }));
      const autoIdx = routes.findIndex((r) => r.label === tax.routeLabel('auto_ok'));

      mount(root, html`<div class="ux-page">
        <header class="ux-pagehead">
          <div><h2 class="pp-h2">Сводка по объектам</h2>
            <p class="ux-pagehead__meta">${ds.meta.title || ds.meta.runId || (ds.meta.files || []).join(', ') || ''}${st.lastUpdate ? html` · последнее событие <span class="pp-mono">${fmt.dateTime(st.lastUpdate)}</span>` : ''}</p></div>
          ${ctx.can('review') && st.pending ? html`<a class="pp-btn pp-btn--primary" href="#/queue">${icon('queue')}Разобрать очередь<span class="ux-btncount pp-mono">${st.pending}</span></a>` : ''}
        </header>

        <section class="ux-kpis" aria-label="Главные цифры">
          <a class="ux-kpi" href="#/objects"><span class="ux-kpi__label">Объектов в реестре</span><span class="ux-kpi__value">${fmt.int(st.total)}</span><span class="ux-kpi__sub">${kinds}</span></a>
          <a class="ux-kpi" href="#/objects?status=attention"><span class="ux-kpi__label">Требуют внимания</span><span class="ux-kpi__value">${fmt.int(att)}</span><span class="ux-kpi__sub">проверить ${st.byDisplayStatus.suspected} · дефект ${st.byDisplayStatus.defect}</span></a>
          <a class="ux-kpi${st.criticalOpen ? ' ux-kpi--critical' : ''}" href="#/objects?status=critical"><span class="ux-kpi__label">${st.criticalOpen ? statusGlyph('critical', 10) : ''}Критично открыто</span><span class="ux-kpi__value">${fmt.int(st.criticalOpen)}</span><span class="ux-kpi__sub">тревога в обход очереди</span></a>
          ${q?.available && q.kpi.accuracy != null
            ? html`<a class="ux-kpi" href="#/quality"><span class="ux-kpi__label">Точность модели</span><span class="ux-kpi__value">${fmt.pct(q.kpi.accuracy, 1)}</span><span class="ux-kpi__sub">вид состояния на ${fmt.int(q.evaluated)} фото с разметкой${q.kpi.defectRecall != null ? ` · дефекты до человека ${fmt.pct(q.kpi.defectRecall, 0)}` : ''}</span></a>`
            : html`<a class="ux-kpi" href="#/objects?status=not_observed"><span class="ux-kpi__label">Объект виден на кадре</span><span class="ux-kpi__value">${st.observedShare == null ? 'нет' : fmt.pct(st.observedShare, 0)}</span><span class="ux-kpi__sub">не наблюдается ${fmt.int(st.byDisplayStatus.not_observed)} ${plural(st.byDisplayStatus.not_observed, ['объект', 'объекта', 'объектов'])}</span></a>`}
          <a class="ux-kpi" href="#/queue"><span class="ux-kpi__label">Ждут решения</span><span class="ux-kpi__value">${fmt.int(st.pending)}</span><span class="ux-kpi__sub">${plural(st.pending, ['кадр', 'кадра', 'кадров'])} у диспетчера</span></a>
          <a class="ux-kpi" href="#/orders"><span class="ux-kpi__label">Наряды в работе</span><span class="ux-kpi__value">${fmt.int(st.workOrders.open)}</span><span class="ux-kpi__sub">закрыто ${fmt.int(st.workOrders.closed)}</span></a>
        </section>

        <div class="ux-grid ux-grid--summary">
          <div class="ux-col">
            <section class="ux-panel">
              <header class="ux-panel__head"><h3 class="ux-panel__title">Состояние объектов</h3><span class="ux-panel__meta pp-mono">${fmt.int(st.total)}</span></header>
              ${statusBar(parts, st.total)}
            </section>
            <div class="ux-grid ux-grid--2">
              <section class="ux-panel">
                <header class="ux-panel__head"><h3 class="ux-panel__title">Что ломается</h3><span class="ux-panel__meta">объекты с дефектом по виду</span></header>
                ${defects.length ? hbars(defects) : html`<p class="ux-note">Дефектов в данных нет.</p>`}
              </section>
              <section class="ux-panel">
                <header class="ux-panel__head"><h3 class="ux-panel__title">Куда ушли кадры</h3><span class="ux-panel__meta pp-mono">${fmt.int(st.detections)} ${plural(st.detections, ['кадр', 'кадра', 'кадров'])}</span></header>
                ${routes.length ? hbars(routes, { accent: autoIdx }) : html`<p class="ux-note">Кадров нет.</p>`}
                ${routes.length && autoIdx >= 0 ? html`<p class="ux-note">Уверенная норма закрывается без человека, людям уходит только сомнительное.</p>` : ''}
              </section>
            </div>
            ${st.byDistrict.length ? html`<section class="ux-panel ux-panel--flush">
              <header class="ux-panel__head"><h3 class="ux-panel__title">Районы</h3><span class="ux-panel__meta">критичные первыми</span></header>
              <div class="ux-scroll"><table class="pp-table pp-table--dense ux-table ux-table--wraphead">
                <thead><tr><th>Район</th><th class="pp-table__num">Объектов</th>${STATUS_ORDER.map((s) => html`<th class="pp-table__num"><span class="ux-th-glyph">${statusGlyph(s, 9)}${tax.statusLabel(s)}</span></th>`)}</tr></thead>
                <tbody>${st.byDistrict.map((d) => html`<tr><td class="pp-table__main"><a class="ux-rowlink" href="#/objects?district=${encodeURIComponent(d.district)}">${d.district}</a></td><td class="pp-table__num">${d.total}</td>${STATUS_ORDER.map((s) => html`<td class="pp-table__num${d[s] && (s === 'critical') ? ' ux-hot' : ''}">${d[s] || html`<span class="pp-muted">0</span>`}</td>`)}</tr>`)}</tbody>
              </table></div></section>` : ''}
          </div>

          <div class="ux-col">
            <section class="ux-panel ux-panel--critical">
              <header class="ux-panel__head"><h3 class="ux-panel__title">Критичное сейчас</h3><span class="ux-panel__meta pp-mono">${st.criticalOpen}</span></header>
              ${crit.length ? html`<ul class="ux-crit">${crit.map((o) => html`<li><a class="ux-crit__item" href="#/objects/${encodeURIComponent(o.id)}">
                  ${thumb(o.evidence)}
                  <span class="ux-crit__body"><span class="ux-crit__top"><span class="pp-id">${o.id}</span>${sevChip(o.maxSeverity, o.severityLabel)}</span>
                  <span class="ux-crit__label">${o.defectLabel}</span>
                  <span class="ux-crit__meta">${o.kindLabel} · <span class="pp-mono">${fmt.dateTime(o.lastSeenAt)}</span></span></span></a></li>`)}</ul>`
                : html`<p class="ux-note">${icon('check', 'pp-icon--sm')} Критичных объектов нет.</p>`}
              ${queue.some((d) => d.isCritical) && ctx.can('review') ? html`<a class="pp-btn pp-btn--secondary pp-btn--sm pp-btn--block" href="#/queue">Разобрать критичные кадры</a>` : ''}
            </section>
            <section class="ux-panel">
              <header class="ux-panel__head"><h3 class="ux-panel__title">Лента событий</h3><span class="ux-panel__meta">${ctx.app.live ? html`<span class="ux-livebadge">идут проезды</span>` : 'последние'}</span></header>
              ${feed.length ? html`<ol class="pp-timeline ux-feed">${feed.map((e) => html`<li class="pp-timeline__item${fresh.has(e.id) && !seen.has(e.id) ? ' is-new' : ''}">
                  <span class="pp-timeline__node pp-timeline__node--${eventNode(e)}"></span>
                  <div><div class="ux-feed__top"><span class="pp-timeline__time">${e.at ? fmt.dateTime(e.at) : 'без времени'}</span><a class="pp-id ux-feed__id" href="#/objects/${encodeURIComponent(e.objectId || '')}">${e.objectId || ''}</a></div>
                  <div class="pp-timeline__text">${e.label}</div><div class="pp-timeline__meta">${e.text}</div></div></li>`)}</ol>`
                : html`<p class="ux-note">Событий пока нет.</p>`}
            </section>
          </div>
        </div>
      </div>`);
      feed.forEach((e) => seen.add(e.id));
      ctx.hydrate(root);
    };
    feedInit(ds, seen);
    paint();
    return { update: (evs) => paint(evs) };
  },
};

function feedInit(ds, seen) {
  for (const e of selectTimeline(ds, { limit: 14 })) seen.add(e.id);
}

export { raw };
