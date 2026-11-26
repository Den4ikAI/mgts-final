import { html, mount, icon, $ } from '../ui/dom.js';
import { statusPill, evidence, empty, kv } from '../ui/components.js';
import { fmt } from '../data/index.js';
import { applyEvent } from '../data/model.js';
import { orderPhotos } from './orders.js';

/** Brigade view: phone-first, light theme (daylight, gloves), big targets. */
export default {
  title: 'Наряд',
  render(root, ctx) {
    const { ds, src } = ctx;
    const id = decodeURIComponent(ctx.params.id);
    root.dataset.theme = 'light';
    root.classList.add('ux-brigade-host');
    let afterUrl = null;
    let done = false;

    function paint() {
      const w = ds.workOrders.find((x) => x.id === id);
      if (!w) {
        mount(root, html`<div class="ux-brigade">${empty({ iconName: 'route', title: 'Наряд не найден', actions: html`<a class="pp-btn pp-btn--secondary" href="#/orders">Все наряды</a>` })}</div>`);
        return;
      }
      const { o, before, after } = orderPhotos(w, ds);
      ctx.setTitle(`Наряд · ${w.objectId}`);
      const canClose = src.kind !== 'api';
      mount(root, html`<div class="ux-brigade-wrap">
        <p class="ux-brigade-hint">${icon('user', 'pp-icon--sm')} Так наряд видит бригада в телефоне. Светлая тема для улицы, кнопки под перчатки.</p>
        <article class="ux-brigade">
          <header class="ux-brigade__head">
            <a class="pp-btn pp-btn--ghost pp-btn--sm" href="#/orders">${icon('arrow-right', 'ux-flip')}Наряды</a>
            <span class="ux-wo-state ux-wo-state--${w.state}">${w.stateLabel}</span>
          </header>
          <p class="ux-brigade__id pp-mono">${w.objectId}${o ? html` · ${o.kindLabel}` : ''}</p>
          <h2 class="ux-brigade__task">${w.task || o?.recommendation || 'Осмотреть объект'}</h2>
          ${o ? html`<div class="ux-brigade__status">${statusPill(o.displayStatus, o.displayStatusLabel)}${o.severityRank ? html`<span>${o.defectLabel}</span>` : ''}</div>` : ''}
          <section class="ux-brigade__block">
            <h3 class="ux-brigade__label">Что за объект</h3>
            <p class="ux-brigade__addr">${o ? ctx.tax.kindLongLabel(o.kind) : 'Объект не найден'}</p>
            <p class="ux-note">Координат в данных нет: место берётся из реестра МГТС по ID объекта.</p>
          </section>
          <section class="ux-brigade__block">
            <h3 class="ux-brigade__label">${w.state === 'closed' ? 'До и после' : 'Что искать'}</h3>
            ${w.state === 'closed' || afterUrl
              ? html`<div class="ux-ba ux-ba--stack"><figure class="ux-ba__item"><figcaption class="ux-ba__cap"><span>До</span></figcaption>${evidence(before, { caption: false })}</figure>
                  <figure class="ux-ba__item"><figcaption class="ux-ba__cap"><span>После</span><span class="pp-mono">${w.closedAt ? fmt.dateTime(w.closedAt) : 'сейчас'}</span></figcaption>${evidence(after || { photo: afterUrl, isDefect: false, bbox: null, confidence: null }, { caption: false, tag: false })}</figure></div>`
              : evidence(before, { caption: true })}
          </section>
          ${kv([
            ['Открыт', html`<span class="pp-mono">${fmt.dateTime(w.openedAt)}</span>`],
            w.assignee ? ['Бригада', w.assignee] : null,
            w.closedAt ? ['Закрыт', html`<span class="pp-mono">${fmt.dateTime(w.closedAt)}</span>`] : null,
          ])}
          ${w.state === 'open' ? html`<footer class="ux-brigade__foot">
            ${!canClose ? html`<p class="ux-note">В API нет эндпоинта закрытия наряда. Закрытие работает в демо-данных и в режиме «Файл».</p>` : ''}
            ${afterUrl ? html`
              <label class="ux-check ux-check--lg"><input type="checkbox" id="confirm-done" ${done ? 'checked' : ''}>Работа выполнена, объект в порядке</label>
              <button class="pp-btn pp-btn--primary pp-btn--lg pp-btn--block" id="close-order" ${done ? '' : 'disabled'}>${icon('check')}Закрыть наряд</button>
              <button class="pp-btn pp-btn--ghost pp-btn--block" id="retake">Переснять фото</button>`
            : html`<label class="pp-btn pp-btn--primary pp-btn--lg pp-btn--block ux-filebtn${canClose ? '' : ' is-disabled'}">${icon('camera')}Закрыть с фото после
                <input type="file" accept="image/*" capture="environment" id="after-input" ${canClose ? '' : 'disabled'}></label>`}
          </footer>` : html`<p class="ux-note">${icon('check', 'pp-icon--sm')} Наряд закрыт. Объект вернулся в «Норму», следующий проезд машины это проверит.</p>`}
        </article>
      </div>`);
      ctx.hydrate(root);
    }

    root.addEventListener('change', (e) => {
      if (e.target.id === 'after-input' && e.target.files?.[0]) {
        afterUrl = URL.createObjectURL(e.target.files[0]);
        paint();
      }
      if (e.target.id === 'confirm-done') { done = e.target.checked; $('#close-order', root).disabled = !done; }
    });
    root.addEventListener('click', (e) => {
      if (e.target.closest('#retake')) { afterUrl = null; done = false; paint(); }
      if (e.target.closest('#close-order')) {
        const w = ds.workOrders.find((x) => x.id === id);
        const events = applyEvent(ds, {
          object_id: w.objectId, type: 'work_order_closed', source: 'local.brigade', occurred_at: new Date().toISOString(),
          payload: { work_order_id: w.id, after_photo_uri: afterUrl },
        }, { project: true });
        src.emit?.(events);
        afterUrl = null;
        ctx.toast({ title: 'Наряд закрыт', text: `${w.objectId} · статус «Норма»`, tone: 'ok' });
        paint();
      }
    });
    paint();
    return { update: paint };
  },
};
