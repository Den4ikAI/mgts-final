import { html, mount, icon } from '../ui/dom.js';
import { statusPill, sevChip, mark } from '../ui/components.js';
import { selectStats, fmt, STATUS_ORDER, SEVERITY_ORDER } from '../data/index.js';

const STATUS_TEXT = {
  critical: 'Аварийное состояние, например шкаф оторван от опоры или висит на кабелях. Тревога уходит диспетчеру в обход очереди.',
  defect: 'Диспетчер подтвердил дефект по фото. Объект ждёт наряда или ремонта.',
  suspected: 'Модель нашла возможный дефект. Кадр ждёт решения диспетчера.',
  not_observed: 'Оборудование не видно или кадр нельзя оценить: размыто, темно, закрыто. Это не норма.',
  ok: 'Последний кадр уверенно без дефекта, или бригада закрыла наряд.',
};

export default {
  title: 'О системе',
  render(root, ctx) {
    const { ds, tax, app } = ctx;
    const st = ds.meta.empty ? null : selectStats(ds);
    const r = st?.frames.byRoute || {};
    const n = (k) => (st ? html`<span class="pp-mono">${fmt.int(r[k] || 0)}</span>` : '');
    const steps = [
      { icon: 'car', title: 'Камера', text: 'Камера служебной машины или обходчик снимает ТКШ и РЩ на опорах по пути.', verb: 'кадр' },
      { icon: 'frame', title: 'Модель', text: 'Gemini Decision отвечает: видно ли оборудование, ТКШ это или РЩ, какое состояние, насколько срочно. К каждому ответу вероятность. Jev обводит шкаф рамкой.', verb: 'ответ' },
      { icon: 'route', title: 'Маршрут кадра', text: html`Уверенная норма закрывается сама ${n('auto_ok')}, сомнительное идёт диспетчеру ${n('review')}, критичное поднимает тревогу ${n('critical')}.`, verb: 'сомнительное' },
      { icon: 'user-check', title: 'Диспетчер', text: 'Смотрит фото с рамкой и решает: «Подтвердить», «Ложное» или «Нужен кадр». Причины ложных идут в дообучение.', verb: 'дефект' },
      { icon: 'list', title: 'Наряд', text: 'Бригада получает ID объекта, фото «что искать» и закрывает наряд с фото «после».', verb: 'ремонт' },
      { icon: 'clock', title: 'Повторный кадр', text: 'Следующий снимок того же объекта подтверждает ремонт. Объект живёт во времени, не в одном кадре.', verb: '' },
    ];
    mount(root, html`<div class="ux-page ux-about">
      <header class="ux-about__lead">
        ${mark('pp-mark-anim', 56)}
        <div><h2 class="pp-h1">Машины уже едут. Инфраструктуру проверяем попутно.</h2>
        <p class="ux-about__sub">«Попутно» следит за телекоммуникационными климатическими шкафами (ТКШ) и распределительными щитами (РЩ) МГТС по фото: ржавчина и облезлая краска, вмятины и перекосы, оторванные крепления. Система подсказывает, решает человек.</p></div>
      </header>

      <figure class="ux-fig" role="img" aria-label="Путь кадра: камера, модель, маршрут, диспетчер, наряд, повторный кадр">
        <ol class="ux-pipe">${steps.map((s, i) => html`<li class="ux-pipe__step">
          <span class="ux-pipe__node pp-corners">${icon(s.icon, 'pp-icon--lg')}</span>
          <span class="ux-pipe__n pp-mono">${String(i + 1).padStart(2, '0')}</span>
          <h3 class="ux-pipe__title">${s.title}</h3>
          <p class="ux-pipe__text">${s.text}</p>
          ${s.verb ? html`<span class="ux-pipe__verb">${s.verb}</span>` : ''}</li>`)}</ol>
        <figcaption class="ux-fig__cap">Рис. 1. Человек видит только сомнительные и опасные кадры${st ? html`: в текущих данных ${fmt.int((r.review || 0) + (r.critical || 0))} из ${fmt.int(st.detections)}` : ''}.</figcaption>
      </figure>

      <div class="ux-grid ux-grid--2">
        <section class="ux-panel">
          <header class="ux-panel__head"><h3 class="ux-panel__title">Статусы объекта</h3><span class="ux-panel__meta">форма, слово и цвет</span></header>
          <ul class="ux-legendlist">${STATUS_ORDER.map((s) => html`<li>${statusPill(s, tax.statusLabel(s))}<p>${STATUS_TEXT[s]}</p></li>`)}</ul>
        </section>
        <section class="ux-panel">
          <header class="ux-panel__head"><h3 class="ux-panel__title">Опасность и срок</h3><span class="ux-panel__meta">число столбиков читается без цвета</span></header>
          <ul class="ux-legendlist">${SEVERITY_ORDER.map((s) => html`<li>${sevChip(s, tax.severityLabel(s))}<p>Срок реакции: ${tax.dict.deadlines[s]}.</p></li>`)}</ul>
          <h3 class="ux-block__title">Где честно говорим «не знаю»</h3>
          <p class="ux-note">Размытый или тёмный кадр, оборудование закрыто или не попало в кадр: такие объекты получают статус «Не наблюдается», а не «Норма». Координат в датасете нет, поэтому карты в системе нет: место берётся из реестра по ID.</p>
        </section>
      </div>

      <div class="ux-grid ux-grid--2">
        <section class="ux-panel">
          <header class="ux-panel__head"><h3 class="ux-panel__title">Откуда данные</h3><span class="ux-panel__meta">сейчас: ${app.src.label}</span></header>
          <dl class="ux-kv">
            <dt>Датасет</dt><dd>62 фото организаторов («Датасет-ДСС»): ответы модели, рамки и разметка. Качество модели считается по нему${ds.quality?.kpi?.accuracy != null ? html`: точность <b>${fmt.pct(ds.quality.kpi.accuracy, 1)}</b>` : ''}.</dd>
            <dt>Загрузки</dt><dd>Новые фото проверяются моделью прямо в браузере («Проверить фото», «Загрузить данные») и попадают в очередь. Хранятся только в этом браузере.</dd>
            <dt>API</dt><dd>Стенд: Kafka хранит историю каждого объекта, Rust API отдаёт реестр, очередь и живую ленту.</dd>
            <dt>Модель</dt><dd><span class="pp-mono">${ds.quality?.model || ds.meta.model || 'google/gemini-decision-1'}</span> и <span class="pp-mono">typesafe/jev-1.14</span> (рамка) через OpenRouter, классы из таксономии без дообучения.</dd>
          </dl>
        </section>
        <section class="ux-panel">
          <header class="ux-panel__head"><h3 class="ux-panel__title">Команда</h3></header>
          <!-- [TODO: имя команды] -->
          <p class="ux-team">Команда [НАЗВАНИЕ]</p>
          <p class="ux-note">Кейс МГТС · Код города · Сетевая инфраструктура и сервис · финал 26.11.2026</p>
        </section>
      </div>

      <footer class="ux-about__foot">
        <a class="pp-btn pp-btn--secondary" href="../brand/" target="_blank" rel="noopener">${icon('layers')}Брендбук «Попутно»</a>
        <a class="pp-btn pp-btn--secondary" href="../deck/" target="_blank" rel="noopener">${icon('chart')}Презентация защиты</a>
        <span class="ux-note">Цвета, шрифты и иконки сайта взяты из брендбука, дека собрана на тех же токенах.</span>
      </footer>
    </div>`);
    return {};
  },
};
