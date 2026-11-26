import { html, raw, mount, icon, $, plural } from '../ui/dom.js';
import { statusPill, thumb, empty } from '../ui/components.js';
import { selectWorkOrders, fmt, photoUrl } from '../data/index.js';
import { noData } from './summary.js';

/** Before/after photos of an order as detection-like objects for thumb()/evidence(). */
export function orderPhotos(w, ds) {
  const o = w.object || ds.byId.get(w.objectId);
  const beforeUri = w.beforePhoto ? photoUrl(w.beforePhoto, ds.meta.photoBase) : o?.evidence?.photo;
  const before = beforeUri ? { ...(o?.evidence || {}), photo: beforeUri } : o?.evidence || null;
  const after = w.afterPhoto ? { photo: /^(blob:|data:|https?:|\/|\.)/.test(w.afterPhoto) ? w.afterPhoto : photoUrl(w.afterPhoto, ds.meta.photoBase), isDefect: false, bbox: null, defectLabel: 'После ремонта', objectId: w.objectId, confidence: null, createdAt: w.closedAt } : null;
  return { o, before, after };
}

export default {
  title: 'Наряды',
  render(root, ctx) {
    const { ds, src } = ctx;
    if (ds.meta.empty) { mount(root, noData(ctx)); return {}; }
    let state = ctx.query.state || 'open';

    function paint() {
      const all = selectWorkOrders(ds);
      const list = state === 'all' ? all : all.filter((w) => w.state === state);
      const n = { open: all.filter((w) => w.state === 'open').length, closed: all.filter((w) => w.state === 'closed').length, all: all.length };
      mount(root, html`<div class="ux-page ux-page--wide">
        <header class="ux-pagehead">
          <div><h2 class="pp-h2">Наряды</h2><p class="ux-pagehead__meta">Наряд закрывает бригада с фото «после». Следующий проезд машины подтверждает ремонт.</p></div>
          <div class="pp-segmented" role="group" aria-label="Состояние наряда">
            ${[['open', 'Открытые'], ['closed', 'Закрытые'], ['all', 'Все']].map(([k, l]) => html`<button class="pp-segmented__item" data-state="${k}" aria-pressed="${state === k}">${l}<span class="pp-mono pp-muted">${n[k]}</span></button>`)}
          </div>
        </header>
        ${src.kind === 'api' && !all.length ? html`<div class="ux-banner ux-banner--info">${icon('alert', 'pp-icon--sm')}<span>В API пока нет эндпоинтов нарядов: здесь видны наряды из демо-данных и событий <span class="pp-mono">work_order_*</span>.</span></div>` : ''}
        ${list.length ? html`<ul class="ux-orders">${list.map((w) => {
          const { o, before, after } = orderPhotos(w, ds);
          return html`<li><a class="ux-order" href="#/orders/${encodeURIComponent(w.id)}">
            <span class="ux-order__media">${thumb(before)}${after ? thumb(after) : ''}</span>
            <span class="ux-order__body">
              <span class="ux-order__top"><span class="pp-id">${w.objectId}</span><span class="ux-wo-state ux-wo-state--${w.state}">${w.stateLabel}</span>${o ? statusPill(o.displayStatus, o.displayStatusLabel, { sm: true }) : ''}</span>
              <span class="ux-order__task">${w.task || o?.recommendation || 'Наряд'}</span>
              <span class="ux-order__meta">${o?.kindLabel || ''}${w.assignee ? html` · ${w.assignee}` : ''}</span>
            </span>
            <span class="ux-order__time pp-mono">${w.state === 'closed' ? html`закрыт<br>${fmt.dateTime(w.closedAt)}` : html`открыт<br>${fmt.dateTime(w.openedAt)}`}</span>
          </a></li>`;
        })}</ul>` : empty({ iconName: 'route', title: state === 'open' ? 'Открытых нарядов нет' : 'Нарядов нет', text: 'Наряд появляется, когда диспетчер подтверждает дефект и отправляет бригаду.' })}
      </div>`);
      ctx.hydrate(root);
    }
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-state]');
      if (b) { state = b.dataset.state; history.replaceState(null, '', ctx.href('/orders', { state })); paint(); }
    });
    paint();
    return { update: paint };
  },
};

export { raw, plural, $ };
