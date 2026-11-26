import { html, raw, mount, icon, plural } from '../ui/dom.js';
import { empty, noPhoto, thumb } from '../ui/components.js';
import { heatmap, sweepChart, meter, hbars } from '../ui/charts.js';
import { fmt, photoUrl } from '../data/index.js';

const pct = (v) => (v == null ? 'нет данных' : fmt.pct(v));

/** Weighted recall over classes whose default severity is critical (e.g. «Открытый люк»). */
function criticalRecall(q, tax) {
  const rows = q.perClass.filter((c) => tax.info(c.key).severity === 'critical' && c.support > 0);
  if (!rows.length) return null;
  const sup = rows.reduce((a, c) => a + c.support, 0);
  return { value: rows.reduce((a, c) => a + c.recall * c.support, 0) / sup, support: sup, labels: rows.map((c) => c.label) };
}

export default {
  title: 'Качество модели',
  async render(root, ctx) {
    const { ds, tax, src } = ctx;
    let q = ds.quality;

    function paint() {
      if (!q || !q.available) {
        mount(root, html`<div class="ux-page">${empty({
          iconName: 'eye', title: 'Отчёта о качестве пока нет',
          text: 'Качество считается по разметке организаторов. Перетащите report.json из ml/runs/<прогон>/ или таблицу разметки вместе с ответами модели: сайт посчитает матрицу ошибок сам.',
          actions: html`<a class="pp-btn pp-btn--primary" href="#/import">${icon('upload')}Загрузить отчёт</a>`,
        })}</div>`);
        return;
      }
      const k = q.kpi;
      const cr = criticalRecall(q, tax);
      const routes = Object.entries(q.routes || {}).sort((a, b) => b[1] - a[1]).map(([r, n]) => ({ label: tax.routeLabel(r), count: n, key: r }));
      const unm = Object.entries(q.unmappedLabels || {});
      const runs = q.runs || [];
      const wrong = ds.detections.filter((d) => d.correct === false && d.truth && d.photo);
      mount(root, html`<div class="ux-page ux-page--wide">
        <header class="ux-pagehead">
          <div><h2 class="pp-h2">Качество модели</h2>
            <p class="ux-pagehead__meta">
              ${q.model ? html`<span class="pp-mono">${q.model}</span> · ` : ''}прогон <span class="pp-mono">${q.runId || 'без имени'}</span> · оценено ${fmt.int(q.evaluated)} из ${fmt.int(q.images)} фото
              ${q.costUsd != null ? html` · весь прогон <span class="pp-mono">${fmt.usd(q.costUsd)}</span>` : ''}${q.costPerImage != null ? html` (<span class="pp-mono">${fmt.usd(q.costPerImage)}</span> за фото)` : ''}
              ${q.avgLatencyS != null ? html` · ответ в среднем <span class="pp-mono">${q.avgLatencyS.toFixed(2).replace('.', ',')}</span> с` : ''}</p></div>
          ${runs.length > 1 && src.kind === 'api' ? html`<label class="ux-filter"><span class="ux-filter__label">Прогон</span><span class="pp-select"><select id="run">${runs.map((r) => html`<option value="${r.run_id}" ${r.run_id === q.runId ? raw('selected') : ''}>${r.run_id}</option>`)}</select><svg class="pp-select__chevron" aria-hidden="true"><use href="../brand/icons.svg#i-chevron-down"/></svg></span></label>` : ''}
        </header>
        ${q.demo ? html`<div class="ux-banner ux-banner--demo"><span class="ux-banner__tag pp-mono">ДЕМО</span><span>${q.note || 'Отчёт из демо-набора, не результат на датасете организаторов.'}</span></div>` : ''}
        ${q.computed ? html`<div class="ux-banner ux-banner--info">${icon('chart', 'pp-icon--sm')}<span>Отчёт посчитан в браузере из загруженных строк с разметкой. Стоимость и время ответа есть только в report.json.</span></div>` : ''}
        ${unm.length ? html`<div class="ux-banner ux-banner--warn">${icon('alert', 'pp-icon--sm')}<span>Метки разметки без класса в таксономии не вошли в оценку: ${unm.map(([l, n]) => html`<b>${l}</b> <span class="pp-mono">${n}</span>`).reduce((a, b) => html`${a}, ${b}`)}. Добавьте их в aliases файла data/taxonomy.json.</span></div>` : ''}

        <section class="ux-kpis ux-kpis--5" aria-label="Главные метрики">
          <div class="ux-kpi"><span class="ux-kpi__label">Точность по виду состояния</span><span class="ux-kpi__value">${pct(k.accuracy)}</span><span class="ux-kpi__sub">на ${fmt.int(q.evaluated)} фото с разметкой · macro-F1 <span class="pp-mono">${fmt.conf(k.macroF1)}</span></span></div>
          <div class="ux-kpi"><span class="ux-kpi__label">Дефекты дошли до человека</span><span class="ux-kpi__value">${pct(k.defectRecall)}</span><span class="ux-kpi__sub">${fmt.int(k.defectsTotal - k.defectsMissed)} из ${fmt.int(k.defectsTotal)}, пропущено ${fmt.int(k.defectsMissed)}</span></div>
          <div class="ux-kpi"><span class="ux-kpi__label">Решено без людей</span><span class="ux-kpi__value">${pct(k.autoShare)}</span><span class="ux-kpi__sub">точность автонормы ${pct(k.autoPrecision)} · порог <span class="pp-mono">${fmt.conf(q.thresholds?.auto_ok)}</span></span></div>
          <div class="ux-kpi"><span class="ux-kpi__label">Ложные тревоги на норме</span><span class="ux-kpi__value">${pct(k.falseAlarmRate)}</span><span class="ux-kpi__sub">людям уходит ${pct(k.toHumansShare)} кадров</span></div>
          ${q.raw?.kind_accuracy != null
            ? html`<div class="ux-kpi"><span class="ux-kpi__label">Тип объекта ТКШ / РЩ</span><span class="ux-kpi__value">${pct(q.raw.kind_accuracy)}</span><span class="ux-kpi__sub">на РЩ-фото рядом часто висит шкаф крупнее</span></div>`
            : html`<div class="ux-kpi"><span class="ux-kpi__label">Найдено критичных</span><span class="ux-kpi__value">${cr ? pct(cr.value) : 'нет'}</span><span class="ux-kpi__sub">${cr ? html`recall по классам «${cr.labels.join('», «')}», ${cr.support} фото` : 'в разметке нет критичных классов'}</span></div>`}
        </section>
        ${!q.computed && q.evaluated ? html`<div class="ux-banner ux-banner--info">${icon('alert', 'pp-icon--sm')}<span>Выборка маленькая: ${fmt.int(q.evaluated)} фото. Описания классов уточнялись по ошибкам на этих же фото, поэтому честная оценка будет только на новых снимках. Новые фото проверяются на странице «Проверить фото» и при загрузке папки.</span></div>` : ''}

        <div class="ux-grid ux-grid--quality">
          <section class="ux-panel">
            <header class="ux-panel__head"><h3 class="ux-panel__title">Где модель путает классы</h3><span class="ux-panel__meta">строки разметка, столбцы ответ модели, цвет доля строки</span></header>
            ${q.confusion ? heatmap(q.confusion) : html`<p class="ux-note">В отчёте нет матрицы ошибок.</p>`}
          </section>
          <section class="ux-panel">
            <header class="ux-panel__head"><h3 class="ux-panel__title">Куда ушли кадры</h3><span class="ux-panel__meta pp-mono">${fmt.int(q.images)}</span></header>
            ${routes.length ? hbars(routes, { accent: routes.findIndex((r) => r.key === 'auto_ok') }) : html`<p class="ux-note">Нет данных о маршрутах.</p>`}
            ${q.apiErrors ? html`<p class="ux-note">Ошибок API: <span class="pp-mono">${q.apiErrors}</span>, они не вошли в оценку.</p>` : ''}
            ${q.noLabel ? html`<p class="ux-note">Без разметки: <span class="pp-mono">${q.noLabel}</span> фото.</p>` : ''}
          </section>
        </div>

        <section class="ux-panel ux-panel--flush">
          <header class="ux-panel__head"><h3 class="ux-panel__title">По классам</h3><span class="ux-panel__meta">precision: сколько ответов модели верны · recall: сколько случаев нашлось</span></header>
          <div class="ux-scroll"><table class="pp-table ux-table ux-perclass">
            <thead><tr><th>Класс</th><th class="pp-table__num">Фото</th><th class="pp-table__num">Precision</th><th class="pp-table__num">Recall</th><th class="pp-table__num">F1</th><th class="ux-col-meter">F1</th></tr></thead>
            <tbody>${q.perClass.slice().sort((a, b) => b.support - a.support).map((c) => html`<tr>
              <td class="pp-table__main">${c.label}${tax.info(c.key).severity === 'critical' ? html` <span class="ux-tag-crit">критичный</span>` : ''}</td><td class="pp-table__num">${c.support}</td>
              <td class="pp-table__num">${fmt.conf(c.precision)}</td><td class="pp-table__num">${fmt.conf(c.recall)}</td><td class="pp-table__num">${fmt.conf(c.f1)}</td><td class="ux-col-meter">${meter(c.f1)}</td></tr>`)}</tbody></table></div>
        </section>

        ${q.thresholdSweep.length ? html`<section class="ux-panel">
          <header class="ux-panel__head"><h3 class="ux-panel__title">Цена автоподтверждения нормы</h3><span class="ux-panel__meta">чем ниже порог, тем больше кадров закрывается без человека и тем больше дефектов можно пропустить</span></header>
          <div class="ux-grid ux-grid--sweep">
            ${sweepChart(q.thresholdSweep)}
            <div class="ux-scroll"><table class="pp-table pp-table--dense ux-table">
              <thead><tr><th class="pp-table__num">Порог</th><th class="pp-table__num">Без людей</th><th class="pp-table__num">Людям</th><th class="pp-table__num">Пропущено</th><th class="pp-table__num">Дошли</th></tr></thead>
              <tbody>${q.thresholdSweep.map((w) => html`<tr ${w.current ? raw('aria-selected="true"') : ''}>
                <td class="pp-table__num">${w.off ? 'выкл' : w.autoOk.toFixed(2)}${w.current ? html` <span class="ux-tag-cur">сейчас</span>` : ''}</td><td class="pp-table__num">${pct(w.autoShare)}</td><td class="pp-table__num">${pct(w.toHumansShare)}</td>
                <td class="pp-table__num${w.defectsMissed ? ' ux-hot' : ''}">${w.defectsMissed}</td><td class="pp-table__num">${pct(w.defectRecall)}</td></tr>`)}</tbody></table></div>
          </div></section>` : ''}

        ${wrong.length ? html`<section class="ux-panel">
          <header class="ux-panel__head"><h3 class="ux-panel__title">Где модель ошиблась</h3><span class="ux-panel__meta">${fmt.int(wrong.length)} ${plural(wrong.length, ['кадр', 'кадра', 'кадров'])}: разметка → ответ модели</span></header>
          <ul class="ux-wrong">${wrong.map((d) => html`<li><a class="ux-wrong__item" href="#/objects/${encodeURIComponent(d.objectId)}">${thumb(d, 'ux-wrong__thumb')}
            <span class="ux-wrong__body"><span><b>${d.truth.label}</b> <span class="pp-muted">→</span> ${tax.label(d.top === tax.okKey ? null : d.top)}</span><span class="pp-mono pp-muted">${d.objectId} · ${d.routeLabel}</span></span></a></li>`)}</ul>
        </section>` : ''}

        <section class="ux-panel">
          <header class="ux-panel__head"><h3 class="ux-panel__title">Пропущенные дефекты</h3><span class="ux-panel__meta pp-mono">${q.missed.length}</span></header>
          ${q.missed.length ? html`<ul class="ux-missed">${q.missed.map((m) => html`<li class="ux-missed__item">
              ${m.mediaUri ? html`<figure class="pp-detect ux-photo ux-photo--cover"><img data-photo="${photoUrl(m.mediaUri, ds.meta.photoBase)}" alt="${m.truth}, файл ${m.file}" loading="lazy"></figure>` : noPhoto('ux-photo--cover')}
              <div class="ux-missed__body"><div><span class="ux-missed__truth">${m.truth}</span> <span class="pp-muted">→</span> ${m.predicted}</div>
              <div class="ux-missed__meta pp-mono">${m.file}${m.objectId ? html` · <a class="ux-link" href="#/objects/${encodeURIComponent(m.objectId)}">${m.objectId}</a>` : ''}</div>
              <div class="ux-missed__meta">${tax.routeLabel(m.route)}</div></div></li>`)}</ul>`
            : html`<p class="ux-note">${icon('check', 'pp-icon--sm')} Все дефекты из разметки дошли до человека.</p>`}
        </section>
      </div>`);
      ctx.hydrate(root);
    }

    root.addEventListener('change', async (e) => {
      if (e.target.id !== 'run') return;
      try { q = await src.getQuality(e.target.value); paint(); } catch (err) { ctx.toast({ title: 'Прогон не загрузился', text: err.message, tone: 'critical' }); }
    });
    paint();
    return { update: () => { q = ds.quality; paint(); } };
  },
};

export { plural };
