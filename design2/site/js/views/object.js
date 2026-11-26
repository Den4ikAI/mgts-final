import { html, raw, mount, icon, $ } from '../ui/dom.js';
import { statusPill, sevChip, kindIcon, evidence, thumb, empty, kv, eventNode, probBars, loader } from '../ui/components.js';
import { selectObject, selectTimeline, selectBeforeAfter, fmt } from '../data/index.js';

export default {
  title: (p) => `Объект ${decodeURIComponent(p.id)}`,
  async render(root, ctx) {
    const { ds, tax, src } = ctx;
    const id = decodeURIComponent(ctx.params.id);
    let obj = selectObject(ds, id);
    if (src.kind === 'api' && obj && !obj.detailsLoaded) {
      mount(root, html`<div class="ux-page">${loader('Загружаем историю объекта')}</div>`);
      try { await src.getObject(id); } catch (e) { ctx.toast({ title: 'История не загрузилась', text: e.message, tone: 'critical' }); }
      obj = selectObject(ds, id);
    }
    if (!obj) {
      mount(root, html`<div class="ux-page">${empty({ iconName: 'search', title: `Объекта ${id} нет в данных`, text: 'Проверьте ID или откройте реестр и найдите объект поиском.', actions: html`<a class="pp-btn pp-btn--secondary" href="#/objects">К реестру</a>` })}</div>`);
      return {};
    }
    let main = null;   // detection id shown big

    function paint() {
      const o = selectObject(ds, id);
      const dets = o.detections;
      const shown = dets.find((d) => d.id === main) || o.evidence || dets[0] || null;
      const { before, after } = selectBeforeAfter(o);
      const events = selectTimeline(ds, { objectId: id, order: 'desc' });
      const pending = dets.filter((d) => d.isPending);
      const showBA = before && after && before.id !== after.id;
      const why = showBA && !main ? after : shown;
      const last = o.latest;
      const ex = dets.find((d) => d.extra?.gt_state || d.extra?.gt_note)?.extra;
      const gt = ex ? [ex.gt_state, ex.gt_note].filter(Boolean).join(' · ') : '';
      mount(root, html`<div class="ux-page ux-page--wide">
        <nav class="ux-crumbs" aria-label="Путь"><a href="#/objects" class="pp-link">Объекты</a><span aria-hidden="true">/</span><span class="pp-mono">${o.id}</span></nav>
        <header class="ux-objhead">
          <div class="ux-objhead__main">
            <h2 class="pp-h2 ux-objhead__title"><span class="ux-objhead__kind">${kindIcon(o.kind)}</span>${o.id}</h2>
            <div class="ux-objhead__pills">${statusPill(o.displayStatus, o.displayStatusLabel)}${o.severityRank ? sevChip(o.maxSeverity, o.severityLabel) : ''}<span class="ux-dotsep">${tax.kindLongLabel(o.kind)}</span></div>
            ${gt ? html`<p class="ux-objhead__addr">Разметка организаторов: ${gt}</p>` : ''}
          </div>
          <div class="ux-objhead__actions">
            ${pending.length && ctx.can('review') ? html`<a class="pp-btn pp-btn--primary" href="#/queue">${icon('queue')}Разобрать ${pending.length} в очереди</a>` : ''}
          </div>
        </header>

        <div class="ux-grid ux-grid--object">
          <div class="ux-col">
            <section class="ux-panel">
              <header class="ux-panel__head"><h3 class="ux-panel__title">${showBA ? 'Было и сейчас' : 'Кадр'}</h3><span class="ux-panel__meta">${dets.length} ${dets.length === 1 ? 'кадр' : dets.length < 5 ? 'кадра' : 'кадров'}</span></header>
              ${showBA && !main ? html`<div class="ux-ba">
                  <figure class="ux-ba__item"><figcaption class="ux-ba__cap"><span>Было</span><span class="pp-mono">${fmt.dateTime(before.createdAt)}</span></figcaption>${evidence(before, { caption: false })}</figure>
                  <figure class="ux-ba__item"><figcaption class="ux-ba__cap"><span>Сейчас</span><span class="pp-mono">${fmt.dateTime(after.createdAt)}</span></figcaption>${evidence(after, { caption: false })}</figure></div>`
                : shown ? evidence(shown, { cls: 'ux-photo--lg' }) : empty({ iconName: 'camera', title: 'Кадров нет', text: 'Объект есть в реестре, но кадров по нему ещё нет.' })}
              ${dets.length > 1 ? html`<ol class="ux-strip" aria-label="Все кадры">${dets.map((d) => html`<li><button class="ux-strip__item${shown && d.id === shown.id && main ? ' is-selected' : ''}" data-action="show" data-id="${d.id}" title="${d.defectLabel} · ${fmt.dateTime(d.createdAt)}">${thumb(d)}<span class="pp-mono">${fmt.dateTime(d.createdAt)}</span></button></li>`)}</ol>` : ''}
              ${main ? html`<button class="pp-btn pp-btn--ghost pp-btn--sm" data-action="ba">Вернуть «было и сейчас»</button>` : ''}
              ${why?.rationale ? html`<div class="ux-why"><span class="pp-prov pp-prov--model">${icon('frame')}Ответ модели · <span class="pp-mono">${fmt.dateTime(why.createdAt)}</span><span class="pp-prov__conf">${fmt.conf(why.confidence)}</span></span><p class="ux-why__text">${why.rationale}</p></div>` : ''}
            </section>

            <section class="ux-panel ux-panel--flush">
              <header class="ux-panel__head"><h3 class="ux-panel__title">Кадры и решения</h3></header>
              <div class="ux-scroll"><table class="pp-table pp-table--dense ux-table">
                <thead><tr><th>Время</th><th>Ответ модели</th><th class="pp-table__num">Уверенность</th><th>Опасность</th><th>Маршрут</th><th>Решение</th>${dets.some((d) => d.truth) ? html`<th>Разметка</th>` : ''}<th>Файл</th></tr></thead>
                <tbody>${dets.map((d) => html`<tr data-action="show" data-id="${d.id}" ${d.id === shown?.id ? raw('aria-selected="true"') : ''}>
                  <td class="pp-mono">${fmt.dateTime(d.createdAt)}</td><td class="pp-table__main">${d.defectLabel}</td><td class="pp-table__num">${fmt.conf(d.confidence)}</td>
                  <td>${sevChip(d.severity, d.severityLabel)}</td><td>${d.routeLabel}</td><td>${d.reviewStateLabel}</td>
                  ${dets.some((x) => x.truth) ? html`<td>${d.truth?.label ?? 'нет'}</td>` : ''}<td class="pp-mono ux-break">${d.file || 'нет'}</td></tr>`)}</tbody></table></div>
            </section>
          </div>

          <div class="ux-col">
            <section class="ux-panel">
              <header class="ux-panel__head"><h3 class="ux-panel__title">Что делать</h3></header>
              <p class="ux-reco ux-reco--lg">${o.recommendation || 'Действий не требуется.'}</p>
              ${kv([
                ['Дефект', o.severityRank ? o.defectLabel : 'нет'],
                ['Последний кадр', html`<span class="pp-mono">${fmt.dateTime(o.lastSeenAt)}</span>`],
                ['Уверенность', html`<span class="pp-mono">${fmt.conf(o.confidence)}</span>`],
                ['Ждут решения', html`<span class="pp-mono">${o.pendingCount}</span>`],
                o.truth ? ['Разметка', o.truth.label] : null,
              ])}
              ${last?.probs ? html`<div class="ux-block"><h3 class="ux-block__title">Последний кадр · <span class="pp-mono">${fmt.dateTime(last.createdAt)}</span></h3>${probBars(last, tax)}</div>` : ''}
            </section>

            <section class="ux-panel">
              <header class="ux-panel__head"><h3 class="ux-panel__title">Наряды</h3><span class="ux-panel__meta pp-mono">${o.workOrders.length}</span></header>
              ${o.workOrders.length ? html`<ul class="ux-wolist">${o.workOrders.map((w) => html`<li><a class="ux-wolist__item" href="#/orders/${encodeURIComponent(w.id)}">
                <span class="ux-wo-state ux-wo-state--${w.state}">${w.stateLabel}</span><span class="ux-wolist__task">${w.task || 'Наряд'}</span>
                <span class="pp-mono pp-muted">${fmt.dateTime(w.closedAt || w.openedAt)}</span></a></li>`)}</ul>` : html`<p class="ux-note">Нарядов по объекту нет.</p>`}
            </section>

            <section class="ux-panel">
              <header class="ux-panel__head"><h3 class="ux-panel__title">История</h3><span class="ux-panel__meta">новые сверху</span></header>
              ${events.length ? html`<ol class="pp-timeline ux-feed">${events.map((e, i) => html`<li class="pp-timeline__item${i ? ' pp-timeline__item--done' : ''}"><span class="pp-timeline__node pp-timeline__node--${eventNode(e)}"></span>
                <div><span class="pp-timeline__time">${e.at ? fmt.dateTime(e.at) : 'без времени'}</span><div class="pp-timeline__text">${e.label}</div><div class="pp-timeline__meta">${e.text}</div></div></li>`)}</ol>` : html`<p class="ux-note">Событий нет.</p>`}
            </section>
          </div>
        </div>
      </div>`);
      ctx.hydrate(root);
    }

    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-action]');
      if (!t) return;
      if (t.dataset.action === 'show') { main = t.dataset.id; paint(); }
      if (t.dataset.action === 'ba') { main = null; paint(); }
    });
    paint();
    return { update: paint };
  },
};
