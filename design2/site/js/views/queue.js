import { html, mount, icon, $, $$, reducedMotion, plural } from '../ui/dom.js';
import { statusPill, sevChip, thumb, evidence, probBars, empty, kv, eventNode, kindIcon } from '../ui/components.js';
import { selectQueue, selectTimeline, fmt } from '../data/index.js';
import { noData } from './summary.js';

const KEYS = {
  confirm: ['y', 'н'],
  reject: ['n', 'т'],
  need_recapture: ['r', 'к'],
  next: ['j', 'о', 'ArrowDown'],
  prev: ['k', 'л', 'ArrowUp'],
};

export default {
  title: 'Очередь проверки',
  render(root, ctx) {
    const { ds, tax, src } = ctx;
    if (ds.meta.empty) { mount(root, noData(ctx)); return {}; }
    const canReview = ctx.can('review');
    const reasons = Object.entries(tax.dict.rejectReasons);
    const removed = new Set();   // optimistic: decided but not yet confirmed by the source
    let list = [];
    let sel = null;              // detection id
    let mode = 'idle';           // idle | reasons | other
    let busy = false;
    let last = null;             // {id, text}
    let lastIndex = 0;
    const pulsed = new Set();    // «Критично» pulses once per frame, never on keyboard repaint

    const current = () => list.find((d) => d.id === sel) || null;

    function computeList() {
      list = selectQueue(ds).filter((d) => !removed.has(d.id));
      if (!list.length) { sel = null; return; }
      if (!sel || !list.some((d) => d.id === sel)) sel = list[Math.min(lastIndex, list.length - 1)].id;
      lastIndex = list.findIndex((d) => d.id === sel);
    }

    function itemTpl(d, i) {
      const o = d.object;
      return html`<li><button class="ux-qitem${d.id === sel ? ' is-selected' : ''}${d.isCritical ? ' is-critical' : ''}" data-action="select" data-id="${d.id}" aria-current="${d.id === sel}" id="q-${i}">
        ${thumb(d)}
        <span class="ux-qitem__body">
          <span class="ux-qitem__top"><span class="pp-id">${d.objectId || 'не сопоставлен'}</span><span class="pp-mono ux-qitem__time">${d.createdAt ? fmt.dateTime(d.createdAt) : ''}</span></span>
          <span class="ux-qitem__label">${d.defectLabel}</span>
          <span class="ux-qitem__meta">${sevChip(d.severity, d.severityLabel)}<span class="pp-mono">${fmt.conf(d.confidence)}</span></span>
        </span></button></li>`;
    }

    function detailTpl(d) {
      const o = d.object;
      const hist = o ? selectTimeline(ds, { objectId: o.id, order: 'desc', limit: 4 }) : [];
      const idx = list.indexOf(d);
      const status = d.isCritical ? 'critical' : 'suspected';
      return html`
      <div class="ux-qdetail__head">
        <div class="ux-qdetail__pills">${statusPill(status, d.isCritical ? tax.statusLabel('critical') : tax.statusLabel('suspected'), { pulse: d.isCritical && !pulsed.has(d.id) && pulsed.add(d.id) })}
          <span class="ux-qdetail__pos pp-mono">${idx + 1} / ${list.length}</span></div>
        <h2 class="ux-qdetail__title">${d.defectLabel}</h2>
        <p class="ux-qdetail__sub">${o ? html`<a class="pp-id ux-link" href="#/objects/${encodeURIComponent(o.id)}">${o.id}</a>` : html`<span class="pp-muted">Объект не сопоставлен</span>`}
          ${o ? html`<span class="ux-dotsep">${kindIcon(o.kind)}${o.kindLabel}</span>` : ''}</p>
      </div>
      <div class="ux-qdetail__grid">
        <div class="ux-qdetail__media">${evidence(d, { cls: 'ux-photo--lg' })}
          ${d.rationale ? html`<div class="ux-why"><span class="pp-prov pp-prov--model">${icon('frame')}Найдено моделью<span class="pp-prov__conf">${fmt.conf(d.confidence)}</span></span><p class="ux-why__text">${d.rationale}</p></div>` : ''}
        </div>
        <div class="ux-qdetail__facts">
          ${kv([
            ['Опасность', sevChip(d.severity, d.severityLabel)],
            ['Уверенность', html`<span class="pp-mono">${fmt.conf(d.confidence)}</span>`],
            ['Маршрут', d.routeLabel],
            ['Время кадра', html`<span class="pp-mono">${fmt.dateTime(d.createdAt)}</span>`],
            d.extra?.gt_state ? ['Описание в разметке', html`${d.extra.gt_state}${d.extra.gt_note ? html` · ${d.extra.gt_note}` : ''}`] : null,
            d.file ? ['Файл', html`<span class="pp-mono ux-break">${d.extra?.source_path || d.file}</span>`] : null,
            d.truth ? ['Разметка', html`${d.truth.label}${d.correct === true ? html` <span class="ux-ok">${icon('check', 'pp-icon--sm')}совпадает</span>` : d.correct === false ? html` <span class="pp-muted">не совпадает</span>` : ''}`] : null,
            o && o.passes > 1 ? ['Кадров по объекту', html`<span class="pp-mono">${o.passes}</span>`] : null,
          ])}
          ${d.probs ? html`<div class="ux-block"><h3 class="ux-block__title">Вероятности</h3>${probBars(d, tax)}</div>` : ''}
          <div class="ux-block"><h3 class="ux-block__title">Рекомендация</h3><p class="ux-reco">${d.recommendation || 'нет'}</p></div>
          ${hist.length ? html`<div class="ux-block"><h3 class="ux-block__title">История объекта</h3><ol class="pp-timeline ux-feed ux-feed--compact">${hist.map((e) => html`<li class="pp-timeline__item"><span class="pp-timeline__node pp-timeline__node--${eventNode(e)}"></span><div><span class="pp-timeline__time">${e.at ? fmt.dateTime(e.at) : 'без времени'}</span> <span class="pp-timeline__text">${e.label}</span><div class="pp-timeline__meta">${e.text}</div></div></li>`)}</ol></div>` : ''}
        </div>
      </div>
      <div class="ux-actions" id="q-actions">${actionsTpl(d)}</div>`;
    }

    function actionsTpl(d) {
      if (!canReview) return html`<p class="ux-note">${icon('user', 'pp-icon--sm')} Решение принимает диспетчер. Роль «${tax.roleLabel(ctx.app.role)}» только смотрит очередь.</p>`;
      if (!d.objectId) return html`<p class="ux-note">${icon('alert', 'pp-icon--sm')} Кадр не привязан к объекту реестра, решение по нему записать некуда.</p>`;
      if (mode === 'other') {
        return html`<form class="ux-reasons ux-reasons--other" data-other role="group" aria-label="Своя причина ложного срабатывания">
          <span class="ux-reasons__title">Почему ложное?</span>
          <input class="pp-input ux-reasons__input" name="other" maxlength="200" placeholder="Своя причина, например «это не ТКШ, а рекламный щит»" autocomplete="off" required>
          <button class="pp-btn pp-btn--primary pp-btn--sm" type="submit">Записать<span class="pp-kbd">Enter</span></button>
          <button class="pp-btn pp-btn--ghost pp-btn--sm" type="button" data-action="reasons"><span class="pp-kbd">Esc</span>Назад</button></form>`;
      }
      if (mode === 'reasons') {
        return html`<div class="ux-reasons" role="group" aria-label="Причина ложного срабатывания">
          <span class="ux-reasons__title">Ложное:</span>
          ${reasons.map(([k, v], i) => html`<button class="pp-btn pp-btn--secondary pp-btn--sm" data-action="${k === 'other' ? 'other' : 'reason'}" data-reason="${k}" title="Клавиша ${i + 1}"><span class="ux-reasons__n pp-mono">${i + 1}</span>${k === 'other' ? `${v}…` : v}</button>`)}
          <button class="pp-btn pp-btn--ghost pp-btn--sm" data-action="cancel" title="Назад (Esc)">Назад</button></div>`;
      }
      return html`<div class="ux-actions__row">
        <button class="pp-btn pp-btn--primary pp-btn--lg" data-action="decide" data-decision="confirm">${icon('check')}${tax.dict.decisions.confirm.label}<span class="pp-kbd ux-kbd-on">Y</span></button>
        <button class="pp-btn pp-btn--secondary pp-btn--lg" data-action="reasons">${icon('close')}${tax.dict.decisions.reject.label}<span class="pp-kbd">N</span></button>
        <button class="pp-btn pp-btn--secondary pp-btn--lg" data-action="decide" data-decision="need_recapture">${icon('camera')}${tax.dict.decisions.need_recapture.label}<span class="pp-kbd">R</span></button>
      </div>`;
    }

    /** Big imports put thousands of frames in the queue: draw a window around the selected one, not all of them. */
    const WINDOW = 120;
    function windowed() {
      if (list.length <= WINDOW) return list.map(itemTpl);
      const i = Math.max(0, list.findIndex((x) => x.id === sel));
      const start = Math.max(0, Math.min(i - 30, list.length - WINDOW));
      const end = Math.min(list.length, start + WINDOW);
      const more = (n, where) => html`<li class="ux-qlist__more pp-mono">${where} ещё ${n} ${plural(n, ['кадр', 'кадра', 'кадров'])} · J и K листают</li>`;
      return html`${start ? more(start, 'Выше') : ''}${list.slice(start, end).map((d, k) => itemTpl(d, start + k))}${end < list.length ? more(list.length - end, 'Ниже') : ''}`;
    }

    function paint({ reveal = false } = {}) {
      const keepList = root.querySelector('.ux-qlist__items')?.scrollTop;
      const keepPage = window.scrollY;
      computeList();
      const crit = list.filter((d) => d.isCritical).length;
      const d = current();
      mount(root, html`<div class="ux-queue${list.length ? '' : ' is-empty'}">
        <aside class="ux-qlist" aria-label="Кадры в очереди">
          <header class="ux-qlist__head">
            <div><span class="ux-qlist__count pp-mono">${list.length}</span> ${plural(list.length, ['кадр ждёт', 'кадра ждут', 'кадров ждут'])} решения</div>
            <div class="ux-qlist__sub">${crit ? html`<span class="ux-hot">${crit} ${plural(crit, ['критичный', 'критичных', 'критичных'])}</span> · ` : ''}критичные идут первыми</div>
            <div class="ux-qlist__last" aria-live="polite">${last ? html`${icon('check', 'pp-icon--sm')}<span class="pp-id">${last.id}</span> ${last.text}` : ''}</div>
          </header>
          <ul class="ux-qlist__items" role="list">${windowed()}</ul>
        </aside>
        <section class="ux-qdetail" aria-label="Кадр">${d ? detailTpl(d) : empty({ iconName: 'check', title: 'Очередь пуста', text: 'Все кадры разобраны. Новые появятся здесь после следующего проезда машины.', actions: html`<a class="pp-btn pp-btn--secondary" href="#/objects">Открыть реестр объектов</a>` })}</section>
      </div>`);
      ctx.hydrate(root);
      if (d) {
        const n = list.indexOf(d);
        const total = list.length;
        ctx.setTitle(`Очередь проверки · ${total}`);
        const ul = root.querySelector('.ux-qlist__items');
        if (ul && keepList != null) ul.scrollTop = keepList;
        if (reveal) revealItem(n);
      } else ctx.setTitle('Очередь проверки');
      if (window.scrollY !== keepPage) window.scrollTo(0, keepPage);
    }

    /** Scrolls only the queue list (never the page) so the selected frame is visible. */
    function revealItem(n) {
      const ul = root.querySelector('.ux-qlist__items');
      const el = root.querySelector(`#q-${n}`);
      if (!ul || !el) return;
      const a = el.getBoundingClientRect(), b = ul.getBoundingClientRect();
      if (a.top < b.top) ul.scrollTop -= b.top - a.top + 8;
      else if (a.bottom > b.bottom) ul.scrollTop += a.bottom - b.bottom + 8;
    }

    /** Selecting a frame repaints only the detail panel: no full re-render, list and page stay where they are. */
    function select(id, { reveal = false } = {}) {
      if (!list.some((x) => x.id === id)) return;
      sel = id; mode = 'idle';
      lastIndex = list.findIndex((x) => x.id === sel);
      const btn = root.querySelector(`.ux-qitem[data-id="${CSS.escape(id)}"]`);
      const detail = root.querySelector('.ux-qdetail');
      if (!btn || !detail) { paint({ reveal }); return; }   // outside the drawn window of a huge queue
      root.querySelectorAll('.ux-qitem.is-selected').forEach((b) => { b.classList.remove('is-selected'); b.setAttribute('aria-current', 'false'); });
      btn.classList.add('is-selected');
      btn.setAttribute('aria-current', 'true');
      const keepPage = window.scrollY;
      detail.innerHTML = String(detailTpl(current()));
      detail.scrollTop = 0;
      ctx.hydrate(detail);
      if (reveal) revealItem(lastIndex);
      if (window.scrollY !== keepPage) window.scrollTo(0, keepPage);
    }

    function paintActions() {
      const d = current();
      const a = $('#q-actions', root);
      if (a && d) a.innerHTML = String(actionsTpl(d));
    }

    function move(step) {
      if (!list.length) return;
      const i = Math.max(0, Math.min(list.length - 1, list.findIndex((x) => x.id === sel) + step));
      select(list[i].id, { reveal: true });
    }

    async function decide(decision, rejectReason, { viaMouse = false } = {}) {
      const d = current();
      if (!d || busy || !canReview || !d.objectId) return;
      busy = true;
      if (viaMouse && !reducedMotion()) {
        root.querySelector('.ux-qitem.is-selected')?.classList.add('is-leaving');
        root.querySelector('.ux-qdetail')?.classList.add('is-leaving');
        await new Promise((r) => setTimeout(r, 160));
      }
      lastIndex = Math.max(0, list.indexOf(d));
      removed.add(d.id);
      mode = 'idle';
      // same rule as the registry (model.js displayStatus): a confirmed defect with critical severity shows as «Критично»
      const shown = d.severity === 'critical' || d.object?.maxSeverity === 'critical' ? 'critical' : 'defect';
      const word = decision === 'confirm' ? `подтверждён, статус «${tax.statusLabel(shown)}»` : decision === 'reject' ? `ложное: ${tax.rejectReasonLabel(rejectReason).toLowerCase()}` : 'нужен кадр';
      last = { id: d.objectId, text: word };
      paint({ reveal: true });
      busy = false;
      try {
        await src.review(d.objectId, { detectionId: d.id, decision, rejectReason: rejectReason ?? undefined });
      } catch (err) {
        removed.delete(d.id);
        last = null;
        paint();
        ctx.toast({ title: 'Решение не записано', text: err.message, tone: 'critical' });
      }
    }

    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-action]');
      if (!t) return;
      const a = t.dataset.action;
      if (a === 'select') { e.preventDefault(); select(t.dataset.id); }
      if (a === 'decide') decide(t.dataset.decision, null, { viaMouse: e.detail > 0 });
      if (a === 'reasons') { mode = 'reasons'; paintActions(); root.querySelector('[data-action="reason"]')?.focus(); }
      if (a === 'reason') decide('reject', t.dataset.reason, { viaMouse: e.detail > 0 });
      if (a === 'other') openOther();
      if (a === 'cancel') { mode = 'idle'; paintActions(); }
    });
    root.addEventListener('submit', (e) => {
      const f = e.target.closest('[data-other]');
      if (!f) return;
      e.preventDefault();
      const text = String(new FormData(f).get('other') || '').trim();
      if (text) decide('reject', { other: text }, { viaMouse: true });
    });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && e.target.closest?.('[data-other]')) { e.preventDefault(); mode = 'reasons'; paintActions(); root.querySelector('[data-action="reason"]')?.focus(); }
    });
    function openOther() {
      mode = 'other';
      paintActions();
      root.querySelector('.ux-reasons__input')?.focus();
    }

    paint();

    return {
      update() {
        // drop optimistic marks the source has caught up with
        for (const id of [...removed]) { const det = ds.detections.find((x) => x.id === id); if (!det || !det.isPending) removed.delete(id); }
        paint();
      },
      keydown(e) {
        const k = e.key;
        const is = (name) => KEYS[name].includes(k) || KEYS[name].includes(k.toLowerCase());
        if (mode === 'other') {
          if (k === 'Escape') { mode = 'reasons'; paintActions(); return true; }
          return false;
        }
        if (mode === 'reasons') {
          if (/^[1-9]$/.test(k) && reasons[+k - 1]) { if (reasons[+k - 1][0] === 'other') { e.preventDefault(); openOther(); } else decide('reject', reasons[+k - 1][0]); return true; }
          if (k === 'Escape' || is('reject')) { mode = 'idle'; paintActions(); return true; }
        }
        if (is('next')) { e.preventDefault(); move(1); return true; }
        if (is('prev')) { e.preventDefault(); move(-1); return true; }
        if (k === 'Enter' && current()?.objectId) { ctx.navigate(`/objects/${encodeURIComponent(current().objectId)}`); return true; }
        if (!canReview || !current()) return false;
        if (is('confirm')) { decide('confirm'); return true; }
        if (is('reject')) { mode = 'reasons'; paintActions(); return true; }
        if (is('need_recapture')) { decide('need_recapture'); return true; }
        return false;
      },
    };
  },
};
