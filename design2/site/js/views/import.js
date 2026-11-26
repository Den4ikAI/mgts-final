import { html, raw, mount, icon, $, plural } from '../ui/dom.js';
import { createSource, getConfig, fmt } from '../data/index.js';
import { parseFiles } from '../data/import.js';
import { checkMany, hasKey, canAsk } from '../data/inference.js';
import { keyPanel, bindKeyPanel, isImage } from './check.js';

const FIELD = {
  detectionId: 'ID кадра', file: 'Фото (имя файла)', mediaUri: 'Ссылка на фото', objectId: 'ID объекта', lat: 'Широта', lon: 'Долгота',
  coords: 'Координаты', kind: 'Тип объекта', truth: 'Разметка: вид повреждения', truthStatus: 'Разметка: статус', pred: 'Ответ модели',
  top: 'Самый вероятный класс', confidence: 'Уверенность', topP: 'Вероятность класса', objectP: 'Вероятность объекта', pCritical: 'Вероятность угрозы',
  severity: 'Опасность', route: 'Маршрут', rationale: 'Объяснение модели', timestamp: 'Время съёмки', address: 'Адрес', district: 'Район',
  bbox: 'Рамка', bboxX: 'Рамка: x', bboxY: 'Рамка: y', bboxW: 'Рамка: ширина', bboxH: 'Рамка: высота', imgW: 'Ширина кадра', imgH: 'Высота кадра',
  reviewState: 'Решение диспетчера', probs: 'Вероятности классов', objectPresent: 'Объект виден', passId: 'Проезд', vehicleId: 'Машина',
};
const KIND = { results: 'Ответы модели', labels: 'Разметка организаторов', quality: 'Отчёт качества', taxonomy: 'Таксономия', dataset: 'Набор данных', photos: 'Фото', unknown: 'Не распознан' };
const BUCKET = { truth: 'Метки разметки без класса', pred: 'Ответы модели без класса', kind: 'Непонятный тип объекта', severity: 'Непонятная опасность', status: 'Непонятный статус' };

export default {
  title: 'Загрузить данные',
  render(root, ctx) {
    const { app } = ctx;
    const cfg = getConfig();
    const fileSrc = app.src.kind === 'file' ? app.src : createSource('file');
    let result = app.lastImport || null;     // last import {reports, summary, photos}, survives re-render
    let busy = false;
    let error = null;
    let apiMsg = null;
    let batch = null;        // live model progress {total, done, errors, last}
    let ctrl = null;

    function current() {
      const m = app.ds.meta;
      const what = app.src.kind === 'file' ? (m.base ? 'Датасет организаторов' : 'Только загрузки') + (m.own ? ` + ${m.own} ${plural(m.own, ['загрузка', 'загрузки', 'загрузок'])}` : '') : 'API';
      return html`<section class="ux-panel ux-current">
        <div class="ux-current__main"><span class="ux-current__label">Сейчас на сайте</span>
          <span class="ux-current__kind">${what}${m.fallbackFrom ? html` <span class="ux-hot">· API недоступно</span>` : ''}</span>
          <span class="ux-current__meta">${m.empty ? 'данных нет' : html`${fmt.int(app.ds.objects.length)} ${plural(app.ds.objects.length, ['объект', 'объекта', 'объектов'])} · ${fmt.int(app.ds.detections.length)} ${plural(app.ds.detections.length, ['кадр', 'кадра', 'кадров'])}${app.ds.quality?.available ? ' · есть отчёт качества' : ''}`}</span>
          ${m.files?.length ? html`<span class="ux-current__meta pp-mono">${m.files.join(' · ')}</span>` : ''}</div>
        <div class="ux-current__actions">
          ${fileSrc.baseEnabled
            ? html`<button class="pp-btn pp-btn--secondary" data-action="base-off" title="Например, чтобы на защите в очереди был только тестовый набор">Скрыть датасет</button>`
            : html`<button class="pp-btn pp-btn--secondary" data-action="base-on">Показать датасет</button>`}
          ${app.src.kind !== 'file' ? html`<button class="pp-btn pp-btn--secondary" data-action="use-file">Датасет и загрузки</button>` : ''}
          ${app.src.kind === 'file' && m.own ? html`<button class="pp-btn pp-btn--ghost" data-action="clear">Удалить загрузки</button>` : ''}
        </div></section>`;
    }

    function progressTpl() {
      const b = batch;
      return html`<section class="ux-panel" role="status">
        <header class="ux-panel__head"><h3 class="ux-panel__title">Модель проверяет фото</h3><span class="ux-panel__meta pp-mono">${b.done} / ${b.total}${b.errors ? html` · ошибок ${b.errors}` : ''}</span></header>
        <div class="ux-progress"><span style="--v:${(b.done / Math.max(1, b.total)).toFixed(3)}"></span></div>
        <p class="ux-note">По 6 фото параллельно, обычно 1–3 секунды на фото. Готовые кадры появятся в очереди, когда пачка закончится.${b.last ? html` Последнее: <span class="pp-mono">${b.last}</span>` : ''}</p>
        <button class="pp-btn pp-btn--ghost pp-btn--sm" data-action="stop">Остановить и сохранить готовое</button>
      </section>`;
    }

    function reportTpl() {
      if (batch) return progressTpl();
      if (busy) return html`<div class="ux-panel ux-importing" role="status"><span class="pp-btn pp-btn--ghost" aria-busy="true"><span>.</span></span>Читаем файлы и сопоставляем колонки</div>`;
      if (error) return html`<div class="ux-banner ux-banner--warn">${icon('alert', 'pp-icon--sm')}<span><b>Файлы не прочитались.</b> ${error}</span></div>`;
      if (!result) return '';
      const s = result.summary;
      if (result.checked) {
        const c = result.checked;
        return html`<section class="ux-panel ux-report"><header class="ux-panel__head"><h3 class="ux-panel__title">Фото проверены моделью</h3><span class="ux-panel__meta">${c.ok} из ${c.total}${c.errors ? html` · ошибок <span class="ux-hot">${c.errors}</span>` : ''}</span></header>
          <div class="ux-kpis ux-kpis--4 ux-kpis--compact">
            <div class="ux-kpi"><span class="ux-kpi__label">В очередь</span><span class="ux-kpi__value">${fmt.int(c.review)}</span><span class="ux-kpi__sub">из них критичных ${fmt.int(c.critical)}</span></div>
            <div class="ux-kpi"><span class="ux-kpi__label">Норма без человека</span><span class="ux-kpi__value">${fmt.int(c.auto)}</span></div>
            <div class="ux-kpi"><span class="ux-kpi__label">Не наблюдается</span><span class="ux-kpi__value">${fmt.int(c.notObserved)}</span></div>
            <div class="ux-kpi"><span class="ux-kpi__label">Стоимость</span><span class="ux-kpi__value ux-kpi__value--text">$${c.cost.toFixed(4)}</span><span class="ux-kpi__sub">${c.seconds.toFixed(0)} с на всю пачку</span></div>
          </div>
          ${c.labels ? html`<p class="ux-note">Разметка из таблицы склеена по имени фото, качество на этих фото считается на странице «Качество».</p>` : ''}
          ${c.fatal ? html`<div class="ux-banner ux-banner--warn">${icon('alert', 'pp-icon--sm')}<span>${c.fatal}</span></div>` : ''}
          ${c.errorList.length ? html`<ul class="ux-msgs ux-msgs--err">${c.errorList.slice(0, 8).map((m) => html`<li>${icon('alert', 'pp-icon--sm')}${m}</li>`)}</ul>` : ''}
          <div class="ux-report__actions"><a class="pp-btn pp-btn--primary" href="#/queue">${icon('queue')}Очередь проверки</a><a class="pp-btn pp-btn--secondary" href="#/">Сводка</a><a class="pp-btn pp-btn--secondary" href="#/objects">Реестр</a></div>
        </section>`;
      }
      if (!s) return html`<div class="ux-banner ux-banner--info">${icon('check', 'pp-icon--sm')}<span>Добавлено фото: ${result.photos}. Таблицы с результатами не было, данные не изменились.</span></div>`;
      const ok = s.objects > 0 && !s.errors.length;
      return html`<section class="ux-panel ux-report" aria-label="Отчёт импорта">
        <header class="ux-panel__head"><h3 class="ux-panel__title">${ok ? 'Данные прочитаны' : 'Прочитано с ошибками'}</h3><span class="ux-panel__meta">${s.files} ${plural(s.files, ['файл', 'файла', 'файлов'])}${result.photos ? html` · фото ${result.photos}` : ''}</span></header>
        <div class="ux-kpis ux-kpis--4 ux-kpis--compact">
          <div class="ux-kpi"><span class="ux-kpi__label">Объектов</span><span class="ux-kpi__value">${fmt.int(s.objects)}</span></div>
          <div class="ux-kpi"><span class="ux-kpi__label">Кадров</span><span class="ux-kpi__value">${fmt.int(s.detections)}</span></div>
          <div class="ux-kpi"><span class="ux-kpi__label">В очереди</span><span class="ux-kpi__value">${fmt.int(app.ds.detections.filter((d) => d.isPending).length)}</span><span class="ux-kpi__sub">ждут решения диспетчера</span></div>
          <div class="ux-kpi"><span class="ux-kpi__label">Качество модели</span><span class="ux-kpi__value ux-kpi__value--text">${s.quality === 'file' ? 'из report.json' : s.quality === 'computed' ? 'посчитано' : 'нет'}</span><span class="ux-kpi__sub">${s.quality ? '' : 'нужна разметка или report.json'}</span></div>
        </div>
        ${s.labelsOnly ? html`<div class="ux-banner ux-banner--info">${icon('alert', 'pp-icon--sm')}<span>В файле только разметка, ответов модели нет. Перетащите вместе с таблицей папку с фото: модель проверит их и склеит с разметкой.</span></div>` : ''}
        ${s.joined ? html`<p class="ux-note">Склейка с разметкой по имени фото: <span class="pp-mono">${s.joined.matched}</span> из <span class="pp-mono">${s.joined.results}</span> кадров.</p>` : ''}
        ${s.errors.length ? html`<ul class="ux-msgs ux-msgs--err">${s.errors.map((m) => html`<li>${icon('alert', 'pp-icon--sm')}${m}</li>`)}</ul>` : ''}
        ${s.warnings.length ? html`<ul class="ux-msgs">${s.warnings.map((m) => html`<li>${icon('alert', 'pp-icon--sm')}${m}</li>`)}</ul>` : ''}
        ${result.reports.map((r) => html`<details class="ux-file" ${result.reports.length < 4 ? raw('open') : ''}>
          <summary><span class="ux-file__name pp-mono">${r.name}</span><span class="ux-badge-kind">${KIND[r.kind] || r.kind}</span><span class="pp-muted">${r.format}</span>
            ${r.rows ? html`<span class="pp-mono pp-muted">${r.used} из ${r.rows} строк</span>` : ''}${r.ok ? '' : html`<span class="ux-hot">ошибка</span>`}</summary>
          ${Object.keys(r.mapping || {}).length ? html`<div class="ux-scroll"><table class="pp-table pp-table--dense ux-table ux-mapping"><thead><tr><th>Поле сайта</th><th>Колонка в файле</th></tr></thead>
            <tbody>${Object.entries(r.mapping).map(([f, c]) => html`<tr><td>${FIELD[f] || f}</td><td class="pp-mono pp-table__main">${c}</td></tr>`)}</tbody></table></div>` : ''}
          ${r.unmappedColumns?.length ? html`<p class="ux-note">Колонки без сопоставления, сохранены как есть: ${r.unmappedColumns.map((c) => html`<span class="ux-chipcol pp-mono">${c}</span>`)}</p>` : ''}
          ${Object.entries(r.unmappedValues || {}).filter(([, v]) => Object.keys(v).length).map(([b, v]) => html`<p class="ux-note ux-note--warn">${BUCKET[b] || b}: ${Object.entries(v).map(([val, n]) => html`<span class="ux-chipcol"><b>${val}</b> <span class="pp-mono">${n}</span></span>`)}</p>`)}
        </details>`)}
        ${Object.keys(s.unmappedTruth || {}).length ? html`<p class="ux-note ux-note--warn">Метки разметки, которых нет в таксономии, не попадут в оценку качества. Добавьте их в <span class="pp-mono">aliases</span> в <span class="pp-mono">data/taxonomy.json</span> и обновите страницу: перезагружать файлы не нужно.</p>` : ''}
        <div class="ux-report__actions">
          ${app.src.kind === 'file'
            ? html`<a class="pp-btn pp-btn--primary" href="#/">${icon('chart')}Открыть сводку по этим данным</a><a class="pp-btn pp-btn--secondary" href="#/queue">Очередь</a><a class="pp-btn pp-btn--secondary" href="#/quality">Качество</a>`
            : html`<button class="pp-btn pp-btn--primary" data-action="use-file">${icon('arrow-right')}Показать эти данные на сайте</button><span class="ux-note">Сейчас включены данные API. Файлы сохранены в браузере.</span>`}
        </div>
      </section>`;
    }

    function paint() {
      mount(root, html`<div class="ux-page">
        <header class="ux-pagehead"><div><h2 class="pp-h2">Загрузить данные</h2>
          <p class="ux-pagehead__meta">Тестовый набор на защите: перетащите папку с фото, модель проверит каждое и отправит кадры в очередь. Всё хранится в этом браузере.</p></div></header>
        ${current()}
        <ol class="ux-steps">
          <li><span class="ux-steps__n pp-mono">1</span><div><b>Фото</b><span>папкой целиком или файлами: JPG, PNG, WEBP. Модель проверит каждое</span></div></li>
          <li><span class="ux-steps__n pp-mono">2</span><div><b>Разметка, если есть</b><span>CSV или XLSX организаторов вместе с фото: склейка по имени файла, появится оценка качества</span></div></li>
          <li><span class="ux-steps__n pp-mono">3</span><div><b>Или готовый прогон</b><span>predictions.jsonl и report.json из ml/runs/: тогда модель заново не вызывается</span></div></li>
        </ol>
        <div class="ux-drop pp-corners${busy || batch ? ' is-busy' : ''}" id="drop" tabindex="0" role="button" aria-label="Перетащите файлы или выберите их">
          <div class="ux-drop__icon">${icon('upload', 'pp-icon--xl')}</div>
          <p class="ux-drop__title">Перетащите папку с фото или файлы сюда</p>
          <p class="ux-drop__text">Новые данные добавляются к тем, что уже есть. Убрать датасет организаторов из очереди можно кнопкой «Скрыть датасет» выше.</p>
          <div class="ux-drop__actions">
            <label class="pp-btn pp-btn--primary">${icon('layers')}Выбрать папку<input type="file" id="pick-dir" webkitdirectory multiple hidden></label>
            <label class="pp-btn pp-btn--secondary">${icon('plus')}Выбрать файлы<input type="file" id="pick-files" multiple hidden accept=".json,.jsonl,.ndjson,.csv,.tsv,.txt,.xlsx,.xls,.xlsm,image/*"></label>
          </div>
        </div>
        ${hasKey() ? '' : keyPanel('Без ключа можно загрузить только готовый прогон (predictions.jsonl).')}
        <div id="report">${reportTpl()}</div>

        <section class="ux-panel ux-api">
          <header class="ux-panel__head"><h3 class="ux-panel__title">Подключить API стенда</h3><span class="ux-panel__meta">Rust API, живая очередь по SSE</span></header>
          <form id="api-form" class="ux-api__form" autocomplete="on">
            <label class="pp-field"><span class="pp-field__label">Адрес API</span><input class="pp-input pp-input--mono" name="base" placeholder="пусто = этот же адрес" value="${cfg.apiBase}"></label>
            <label class="pp-field"><span class="pp-field__label">Логин</span><input class="pp-input" name="login" autocomplete="username" placeholder="dispatcher"></label>
            <label class="pp-field"><span class="pp-field__label">Пароль</span><input class="pp-input" name="password" type="password" autocomplete="current-password"></label>
            <button class="pp-btn pp-btn--secondary" type="submit" ${apiMsg?.busy ? raw('aria-busy="true"') : ''}><span>Подключиться</span></button>
          </form>
          ${apiMsg && !apiMsg.busy ? html`<p class="ux-note${apiMsg.ok ? '' : ' ux-note--warn'}">${apiMsg.text}</p>` : ''}
          <p class="ux-note">Если API не ответит при загрузке страницы, сайт откроет датасет и загрузки из браузера и покажет плашку.</p>
        </section>
        ${hasKey() ? keyPanel() : ''}
      </div>`);
      bind();
    }

    /** Data files (tables, json) are imported; photos go to the model unless a model-results file came with them. */
    async function run(files) {
      if (!files?.length) return;
      const images = files.filter(isImage);
      const data = files.filter((f) => !isImage(f));
      error = null; result = null;
      let kinds = [];
      if (data.length) {
        try {
          const entries = await Promise.all(data.map(async (f) => ({ name: f.name, content: /\.(xlsx|xls|xlsm)$/i.test(f.name) ? await f.arrayBuffer() : await f.text() })));
          kinds = (await parseFiles(entries, app.ds.taxonomy)).chunks.map((c) => c.report.kind);
        } catch { kinds = []; }
      }
      const hasResults = kinds.some((k) => k === 'results' || k === 'dataset');
      if (!images.length || hasResults) return importOnly(files);
      if (!hasKey()) { error = 'Чтобы проверить фото моделью, нужен ключ OpenRouter (поле ниже). Готовый прогон predictions.jsonl можно загрузить и без ключа.'; paint(); return; }
      if (!canAsk(app.ds.taxonomy.raw)) { error = 'В data/taxonomy.json нет вопросов для модели.'; paint(); return; }
      if (data.length) await fileSrc.importFiles(data);   // labels/taxonomy first: joined to the new rows by file name
      ctrl = new AbortController();
      batch = { total: images.length, done: 0, errors: 0, last: '' };
      paint();
      const t0 = performance.now();
      let items = [], fatal = null;
      try {
        items = await checkMany(images, app.ds.taxonomy.raw, {
          signal: ctrl.signal,
          onProgress: (done, total, last) => {
            batch.done = done;
            if (last.error) batch.errors++;
            batch.last = last.file.name;
            const r = $('#report', root);
            if (r) r.innerHTML = String(progressTpl());
          },
        });
      } catch (e) {
        fatal = e.name === 'AbortError' ? 'Остановлено вручную, готовые фото сохранены.' : e.message;
        items = e.partial || [];
      }
      const ok = items.filter((x) => x.row);
      batch = { ...batch, done: batch.total };
      $('#report', root).innerHTML = String(html`<div class="ux-panel ux-importing" role="status"><span class="pp-btn pp-btn--ghost" aria-busy="true"><span>.</span></span>Сохраняем ${ok.length} фото в браузере</div>`);
      if (ok.length) await fileSrc.addChecked(ok, 'Пачка фото');
      const rows = ok.map((x) => x.row);
      result = { checked: {
        total: images.length, ok: ok.length, errors: items.filter((x) => x.error).length, fatal,
        errorList: items.filter((x) => x.error).map((x) => `${x.file.name}: ${x.error.message}`),
        review: rows.filter((r) => r.route === 'review' || r.route === 'critical').length,
        critical: rows.filter((r) => r.route === 'critical').length,
        auto: rows.filter((r) => r.route === 'auto_ok').length,
        notObserved: rows.filter((r) => r.route === 'not_observed').length,
        cost: rows.reduce((a, r) => a + (r.cost || 0), 0),
        seconds: (performance.now() - t0) / 1000,
        labels: kinds.includes('labels'),
      } };
      app.lastImport = result;
      batch = null;
      if (app.src === fileSrc) { await app.reload(); return; }
      paint();
    }

    async function importOnly(files) {
      busy = true;
      $('#report', root).innerHTML = String(reportTpl());
      $('#drop', root)?.classList.add('is-busy');
      try {
        result = await fileSrc.importFiles(files);
        app.lastImport = result;
        if (app.src === fileSrc) { busy = false; await app.reload(); return; }
      } catch (e) {
        console.error(e);
        error = e.message || String(e);
      }
      busy = false;
      paint();
      $('#report', root)?.scrollIntoView({ block: 'start' });
    }

    function bind() {
      const drop = $('#drop', root);
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
      drop.addEventListener('dragleave', (e) => { if (!drop.contains(e.relatedTarget)) drop.classList.remove('is-over'); });
      drop.addEventListener('drop', async (e) => {
        e.preventDefault();
        drop.classList.remove('is-over');
        try { run(await collectDropped(e.dataTransfer)); } catch (err) { error = err.message; paint(); }
      });
      drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#pick-files', root).click(); } });
      $('#pick-files', root).addEventListener('change', (e) => run(Array.from(e.target.files)));
      $('#pick-dir', root).addEventListener('change', (e) => run(Array.from(e.target.files)));
      $('#api-form', root).addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const base = String(fd.get('base') || '').trim().replace(/\/+$/, '');
        apiMsg = { busy: true };
        e.target.querySelector('button').setAttribute('aria-busy', 'true');
        try {
          const api = createSource('api', { apiBase: base });
          if (fd.get('login')) await api.login(String(fd.get('login')), String(fd.get('password') || ''));
          await api.load();
          apiMsg = { ok: true, text: `API отвечает: ${api.dataset.objects.length} объектов. Переключаем.` };
          paint();
          setTimeout(() => app.switchSource('api', { apiBase: base }), 600);
        } catch (err) {
          apiMsg = { ok: false, text: `Не подключилось: ${err.message}. Проверьте адрес и что API запущено.` };
          paint();
        }
      });
    }

    root.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-action]')?.dataset.action;
      if (a === 'use-file') app.switchSource('file');
      if (a === 'stop') ctrl?.abort();
      if (a === 'base-off' || a === 'base-on') {
        fileSrc.setBaseEnabled(a === 'base-on');
        fileSrc._base = null;
        if (app.src === fileSrc) await app.reload(); else paint();
        ctx.toast({ title: a === 'base-on' ? 'Датасет организаторов снова на сайте' : 'Датасет организаторов скрыт', text: a === 'base-on' ? '' : 'В очереди и реестре остались только ваши загрузки', tone: 'ok' });
      }
      if (a === 'clear') {
        await fileSrc.clear();
        result = null;
        app.lastImport = null;
        await app.reload();
        ctx.toast({ title: 'Загрузки удалены из браузера', text: 'Датасет организаторов остался', tone: 'ok' });
      }
    });

    bindKeyPanel(root, paint);
    paint();
    return { destroy() { ctrl?.abort(); }, update() { if (!busy && !batch) { const r = $('#report', root); const cur = root.querySelector('.ux-current'); if (cur) cur.outerHTML = String(current()); if (r) r.innerHTML = String(reportTpl()); } } };
  },
};

/** Files from a drop, walking folders recursively (the dataset folder with photos). */
async function collectDropped(dt) {
  const items = Array.from(dt?.items || []);
  const entries = items.map((it) => it.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.some((e) => e.isDirectory)) return Array.from(dt?.files || []);
  const out = [];
  const walk = async (entry) => {
    if (entry.isFile) { out.push(await new Promise((res, rej) => entry.file(res, rej))); return; }
    const reader = entry.createReader();
    for (;;) {
      const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const x of batch) await walk(x);
    }
  };
  for (const x of entries) await walk(x);
  return out;
}
