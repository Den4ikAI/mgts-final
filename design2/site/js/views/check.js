import { html, mount, icon, $ } from '../ui/dom.js';
import { evidence, probBars, sevChip, kv } from '../ui/components.js';
import { fmt } from '../data/index.js';
import { getKey, setKey, hasKey, checkPhoto, checkMany, canAsk, DECISION_MODEL, BOX_MODEL } from '../data/inference.js';

const IMAGE_RE = /\.(jpe?g|png|webp|bmp|gif|heic|heif|avif|tiff?)$/i;
export const isImage = (f) => (f.type || '').startsWith('image/') || IMAGE_RE.test(f.name || '');

/** API key panel shared by «Проверить фото» and «Загрузить данные». */
export function keyPanel(note = '') {
  const k = getKey();
  return html`<section class="ux-panel ux-keypanel">
    <header class="ux-panel__head"><h3 class="ux-panel__title">Ключ модели</h3>
      <span class="ux-keystate">${k ? html`${icon('check', 'pp-icon--sm')}ключ сохранён в этом браузере · <span class="pp-mono">…${k.slice(-4)}</span>` : html`${icon('alert', 'pp-icon--sm')}ключа нет, модель не вызвать`}</span></header>
    <form class="ux-keyform" data-keyform autocomplete="off">
      <label class="pp-field"><span class="pp-field__label">Ключ OpenRouter</span><input class="pp-input pp-input--mono" name="key" type="password" placeholder="${k ? 'заменить ключ' : 'sk-or-…'}" autocomplete="off" spellcheck="false"></label>
      <button class="pp-btn pp-btn--secondary" type="submit">Сохранить</button>
      ${k ? html`<button class="pp-btn pp-btn--ghost" type="button" data-keyclear>Забыть ключ</button>` : ''}
    </form>
    <p class="ux-note">Фото уходят напрямую в OpenRouter: <span class="pp-mono">${DECISION_MODEL}</span> (состояние) и <span class="pp-mono">${BOX_MODEL}</span> (рамка). Ключ хранится только в localStorage этого браузера, в коде сайта его нет.${note ? html` ${note}` : ''}</p>
  </section>`;
}

/** Binds the key form inside root; onChange runs after save/clear. */
export function bindKeyPanel(root, onChange) {
  root.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-keyform]');
    if (!f) return;
    e.preventDefault();
    const v = String(new FormData(f).get('key') || '').trim();
    if (v) { setKey(v); onChange?.(); }
  });
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-keyclear]')) { setKey(''); onChange?.(); }
  });
}

/** Photo → live model verdict; the frame is added to the queue right away. */
export default {
  title: 'Проверить фото',
  render(root, ctx) {
    const { app } = ctx;
    let state = { phase: 'idle' };   // idle | busy | done | error | batch
    let ctrl = null;

    const tax = () => app.ds.taxonomy;
    const raw = () => tax().raw;

    function verdict(d, meta) {
      return html`<section class="ux-panel ux-verdict">
        <header class="ux-panel__head"><h3 class="ux-panel__title">Ответ модели</h3><span class="ux-panel__meta pp-mono">${d.file || ''}</span></header>
        <div class="ux-verdict__grid">
          ${evidence(d, { cls: 'ux-photo--lg', enter: true })}
          <div>
            <p class="ux-verdict__label">${d.route === 'not_observed' ? 'Не наблюдается' : d.defectLabel}</p>
            <p class="ux-verdict__route">${icon('arrow-right', 'pp-icon--sm')}${d.routeLabel}</p>
            ${kv([
              ['Объект', d.objectId ? html`<a class="pp-id ux-link" href="#/objects/${encodeURIComponent(d.objectId)}">${d.objectId}</a>` : 'нет'],
              ['Тип', tax().kindLongLabel(d.kind)],
              ['Опасность', sevChip(d.severity, d.severityLabel)],
              ['Уверенность', html`<span class="pp-mono">${fmt.conf(d.confidence ?? d.topP)}</span>`],
              ['Оборудование видно', html`<span class="pp-mono">${fmt.conf(d.objectP)}</span>`],
              meta ? ['Ответ за', html`<span class="pp-mono">${String(meta.latency.toFixed(1)).replace('.', ',')} с · $${meta.cost.toFixed(5)}</span>`] : null,
            ])}
            ${d.probs ? html`<div class="ux-block"><h3 class="ux-block__title">Вероятности</h3>${probBars(d, tax())}</div>` : ''}
            ${d.rationale ? html`<p class="ux-why__text">${d.rationale}</p>` : ''}
            <p class="ux-reco">${d.recommendation}</p>
            ${d.isPending ? html`<a class="pp-btn pp-btn--primary" href="#/queue">${icon('queue')}В очередь проверки</a>` : html`<a class="pp-btn pp-btn--secondary" href="#/objects/${encodeURIComponent(d.objectId)}">Открыть объект</a>`}
          </div>
        </div></section>`;
    }

    function batchTpl() {
      const b = state.batch;
      if (!b) return '';
      const ok = b.items.filter((x) => x.row);
      return html`<section class="ux-panel">
        <header class="ux-panel__head"><h3 class="ux-panel__title">Пачка фото</h3><span class="ux-panel__meta pp-mono">${b.done} / ${b.total}</span></header>
        <div class="ux-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${b.total}" aria-valuenow="${b.done}"><span style="--v:${(b.done / Math.max(1, b.total)).toFixed(3)}"></span></div>
        <ul class="ux-batch">${b.items.slice(-60).map((x) => x.error
          ? html`<li class="ux-batch__item ux-batch__item--err">${icon('alert', 'pp-icon--sm')}<span><b>${x.file.name}</b>${x.error.message}</span></li>`
          : html`<li class="ux-batch__item"><span><b>${tax().label(x.row.route === 'not_observed' ? 'none' : x.row.pred)}</b><span class="ux-batch__name">${x.file.name} · ${tax().routeLabel(x.row.route)}</span></span></li>`)}</ul>
        ${b.finished ? html`<p class="ux-note">Добавлено в данные: ${ok.length} фото${b.items.length - ok.length ? `, с ошибкой ${b.items.length - ok.length}` : ''}.</p>
          <div class="ux-report__actions"><a class="pp-btn pp-btn--primary" href="#/queue">${icon('queue')}Очередь проверки</a><a class="pp-btn pp-btn--secondary" href="#/objects">Реестр</a></div>` : ''}
      </section>`;
    }

    function side() {
      if (!canAsk(raw())) return html`<div class="ux-banner ux-banner--warn">${icon('alert', 'pp-icon--sm')}<span>В data/taxonomy.json нет вопросов для модели. Скопируйте туда ml/taxonomy.json.</span></div>`;
      switch (state.phase) {
        case 'busy': return html`<p class="ux-note" role="status">Модель смотрит на кадр. Обычно это 1–3 секунды.</p><button class="pp-btn pp-btn--ghost pp-btn--sm" data-action="cancel">Отменить</button>`;
        case 'done': return html`<div class="ux-banner ux-banner--info">${icon('check', 'pp-icon--sm')}<span>${state.det.isPending ? 'Кадр добавлен в очередь проверки.' : state.det.route === 'auto_ok' ? 'Уверенная норма: кадр закрыт без человека и сохранён в объекте.' : 'Кадр сохранён в объекте.'}</span></div>`;
        case 'error': return html`<div class="ux-banner ux-banner--warn">${icon('alert', 'pp-icon--sm')}<span><b>Не получилось.</b> ${state.error}</span></div>`;
        case 'batch': return html`<p class="ux-note" role="status">Проверяем пачку: по 6 фото параллельно.</p>${state.batch?.finished ? '' : html`<button class="pp-btn pp-btn--ghost pp-btn--sm" data-action="cancel">Остановить</button>`}`;
        default: return html`<ol class="ux-howto">
          <li><span>Перетащите фото (JPG, PNG, WEBP, любой размер) или сразу несколько.</span></li>
          <li><span>Модель отвечает, видно ли оборудование, ТКШ это или РЩ, какое состояние и насколько срочно, и обводит шкаф рамкой.</span></li>
          <li><span>Кадр с дефектом сразу попадает в очередь проверки, критичный идёт в обход очереди.</span></li></ol>`;
      }
    }

    function paint() {
      mount(root, html`<div class="ux-page">
        <header class="ux-pagehead"><div><h2 class="pp-h2">Проверить фото</h2>
          <p class="ux-pagehead__meta">Модель смотрит на новое фото сейчас, а не берёт ответ из прогона.</p></div></header>
        ${hasKey() ? '' : keyPanel()}
        <div class="ux-checkpage">
          <label class="ux-drop ux-drop--photo pp-corners${state.phase === 'busy' ? ' is-busy' : ''}" id="drop">
            ${state.preview ? html`<img class="ux-drop__preview" src="${state.preview}" alt="Выбранное фото">` : html`<span class="ux-drop__icon">${icon('camera', 'pp-icon--xl')}</span>
              <span class="ux-drop__title">Перетащите фото или нажмите</span><span class="ux-drop__text">JPG, PNG, WEBP · можно несколько сразу</span>`}
            <input type="file" accept="image/*,.heic,.heif" id="pick" multiple hidden>
          </label>
          <div class="ux-check__side" aria-live="polite">${side()}</div>
        </div>
        ${state.phase === 'done' ? verdict(state.det, state.meta) : ''}
        ${state.phase === 'batch' ? batchTpl() : ''}
        ${hasKey() ? keyPanel() : ''}
      </div>`);
      ctx.hydrate(root);
      bind();
    }

    async function one(file) {
      if (state.preview) URL.revokeObjectURL(state.preview);
      ctrl = new AbortController();
      state = { phase: 'busy', preview: URL.createObjectURL(file) };
      paint();
      try {
        const res = await checkPhoto(file, raw(), { signal: ctrl.signal });
        await app.src.addChecked([res]);
        app.lastCheck = { storeName: res.storeName, latency: res.row.latency, cost: res.row.cost };
        await app.reload();          // re-renders this view: keep the verdict through app.lastCheck
        return;
      } catch (e) {
        if (e.name === 'AbortError') { state = { phase: 'idle' }; paint(); return; }
        console.error(e);
        state = { ...state, phase: 'error', error: e.message };
        paint();
      }
    }

    async function many(files) {
      ctrl = new AbortController();
      state = { phase: 'batch', batch: { total: files.length, done: 0, items: [], finished: false } };
      paint();
      let fatal = null, items = [];
      try {
        items = await checkMany(files, raw(), {
          signal: ctrl.signal,
          onProgress: (done, total, last) => {
            state.batch.done = done;
            state.batch.items.push(last);
            const host = root.querySelector('.ux-panel:has(.ux-batch)');
            if (host) host.outerHTML = String(batchTpl()); else paint();
          },
        });
      } catch (e) {
        fatal = e;
        items = e.partial || state.batch.items;
      }
      const ok = items.filter((x) => x.row);
      if (ok.length) await app.src.addChecked(ok, `Пачка фото`);
      app.lastBatch = { ...state.batch, items: state.batch.items, finished: true };
      if (fatal && fatal.name !== 'AbortError') app.lastBatch.error = fatal.message;
      await app.reload();
    }

    function run(list) {
      const files = Array.from(list || []).filter(isImage);
      if (!files.length) return;
      if (!hasKey()) { state = { phase: 'error', error: 'Сначала сохраните ключ OpenRouter ниже.' }; paint(); return; }
      if (files.length === 1) one(files[0]); else many(files);
    }

    function bind() {
      const drop = $('#drop', root);
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
      drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-over'); run(e.dataTransfer.files); });
      $('#pick', root).addEventListener('change', (e) => run(e.target.files));
    }

    root.addEventListener('click', (e) => { if (e.target.closest('[data-action="cancel"]')) ctrl?.abort(); });
    bindKeyPanel(root, paint);

    // after addChecked → app.reload() the view is rendered again: show what was just checked
    if (app.lastBatch) {
      state = { phase: 'batch', batch: app.lastBatch };
      if (app.lastBatch.error) state.batch.items.push({ file: { name: 'остановлено' }, error: new Error(app.lastBatch.error) });
      app.lastBatch = null;
    } else if (app.lastCheck) {
      const { storeName, latency, cost } = app.lastCheck;
      const det = app.ds.detections.find((d) => d.photo && d.photo.endsWith(storeName));
      if (det) state = { phase: 'done', det, meta: { latency, cost } };
      app.lastCheck = null;
    }
    paint();
    return { destroy() { ctrl?.abort(); if (state.preview) URL.revokeObjectURL(state.preview); } };
  },
};
