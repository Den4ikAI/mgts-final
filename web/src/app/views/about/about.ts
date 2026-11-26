import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { PoputnoStore } from '../../data/store';
import { M, T, fmt } from '../../data/legacy';
import { PP } from '../../ui/pp';
import { Shell } from '../../ui/shell.service';

const STATUS_TEXT: Record<string, string> = {
  critical: 'Аварийное состояние, например шкаф оторван от опоры или висит на кабелях. Тревога уходит диспетчеру в обход очереди.',
  defect: 'Диспетчер подтвердил дефект по фото. Объект ждёт наряда или ремонта.',
  suspected: 'Модель нашла возможный дефект. Кадр ждёт решения диспетчера.',
  not_observed: 'Оборудование не видно или кадр нельзя оценить: размыто, темно, закрыто. Это не норма.',
  ok: 'Последний кадр уверенно без дефекта, или бригада закрыла наряд.',
};

/** «О системе» (site: design2/site/js/views/about.js), facts updated for the API pipeline. */
@Component({
  selector: 'app-about-view',
  imports: [...PP],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ux-page ux-about">
      <header class="ux-about__lead">
        <pp-mark cls="pp-mark-anim" [size]="56" />
        <div>
          <h2 class="pp-h1">Машины уже едут. Инфраструктуру проверяем попутно.</h2>
          <p class="ux-about__sub">«Попутно» следит за телекоммуникационными климатическими шкафами (ТКШ) и распределительными щитами (РЩ) МГТС по фото: ржавчина и облезлая краска, вмятины и перекосы, оторванные крепления. Система подсказывает, решает человек.</p>
        </div>
      </header>

      <figure class="ux-fig" role="img" aria-label="Путь кадра: камера, модель, маршрут, диспетчер, наряд, повторный кадр">
        <ol class="ux-pipe">
          @for (s of steps; track s.title; let i = $index) {
            <li class="ux-pipe__step">
              <span class="ux-pipe__node pp-corners"><pp-icon [name]="s.icon" cls="pp-icon--lg" /></span>
              <span class="ux-pipe__n pp-mono">{{ pad(i + 1) }}</span>
              <h3 class="ux-pipe__title">{{ s.title }}</h3>
              <p class="ux-pipe__text">
                @if (s.route) {
                  Уверенная норма закрывается сама @if (st()) { <span class="pp-mono">{{ n('auto_ok') }}</span> }, сомнительное идёт диспетчеру @if (st()) { <span class="pp-mono">{{ n('review') }}</span> }, критичное поднимает тревогу @if (st()) { <span class="pp-mono">{{ n('critical') }}</span> }.
                } @else {
                  {{ s.text }}
                }
              </p>
              @if (s.verb) { <span class="ux-pipe__verb">{{ s.verb }}</span> }
            </li>
          }
        </ol>
        <figcaption class="ux-fig__cap">Рис. 1. Человек видит только сомнительные и опасные кадры@if (st(); as s) {: в текущих данных {{ int(seen()) }} из {{ int(s.detections) }}}.</figcaption>
      </figure>

      <div class="ux-grid ux-grid--2">
        <section class="ux-panel">
          <header class="ux-panel__head"><h3 class="ux-panel__title">Статусы объекта</h3><span class="ux-panel__meta">форма, слово и цвет</span></header>
          <ul class="ux-legendlist">
            @for (s of statusOrder; track s) {
              <li><pp-status [status]="s" [label]="tax()?.statusLabel(s)" /><p>{{ statusText[s] }}</p></li>
            }
          </ul>
        </section>
        <section class="ux-panel">
          <header class="ux-panel__head"><h3 class="ux-panel__title">Опасность и срок</h3><span class="ux-panel__meta">число столбиков читается без цвета</span></header>
          <ul class="ux-legendlist">
            @for (s of severityOrder; track s) {
              <li><pp-sev [sev]="s" [label]="tax()?.severityLabel(s)" /><p>Срок реакции: {{ tax()?.dict.deadlines[s] }}.</p></li>
            }
          </ul>
          <h3 class="ux-block__title">Где честно говорим «не знаю»</h3>
          <p class="ux-note">Размытый или тёмный кадр, оборудование закрыто или не попало в кадр: такие объекты получают статус «Не наблюдается», а не «Норма». Координат в датасете нет, поэтому карты в системе нет: место берётся из реестра по ID.</p>
        </section>
      </div>

      <div class="ux-grid ux-grid--2">
        <section class="ux-panel">
          <header class="ux-panel__head"><h3 class="ux-panel__title">Откуда данные</h3><span class="ux-panel__meta">сейчас: API</span></header>
          <dl class="ux-kv">
            <dt>Датасет</dt>
            <dd>62 фото организаторов («Датасет-ДСС»): ответы модели, рамки и разметка. Качество модели считается по нему@if (accuracy() != null) {: точность <b>{{ pct(accuracy()) }}</b>}.</dd>
            <dt>Загрузки</dt>
            <dd>Новые фото («Проверить фото», «Загрузить данные») ложатся в S3, кадр через Kafka уходит к модели. Ответ приходит за 1–3 с, сомнительные кадры попадают в очередь.</dd>
            <dt>API</dt>
            <dd>Стенд: Kafka хранит историю каждого объекта, Rust API отдаёт реестр, очередь, качество и живую ленту.</dd>
            <dt>Модель</dt>
            <dd><span class="pp-mono">{{ model() }}</span> (ответ) и <span class="pp-mono">google/gemini-4-hydrogen</span> (рамки) через OpenRouter, классы из таксономии без дообучения.</dd>
          </dl>
        </section>
        <section class="ux-panel">
          <header class="ux-panel__head"><h3 class="ux-panel__title">Команда</h3></header>
          <!-- [TODO: имя команды] -->
          <p class="ux-team">Команда [НАЗВАНИЕ]</p>
          <p class="ux-note">Кейс МГТС · Код города · Сетевая инфраструктура и сервис · финал 26.11.2026</p>
        </section>
      </div>
    </div>
  `,
})
export class AboutView {
  private store = inject(PoputnoStore);

  readonly tax = this.store.tax;
  readonly statusText = STATUS_TEXT;
  readonly statusOrder: string[] = T.STATUS_ORDER;
  readonly severityOrder: string[] = T.SEVERITY_ORDER;
  readonly steps = [
    { icon: 'car', title: 'Камера', text: 'Камера служебной машины или обходчик снимает ТКШ и РЩ на опорах по пути. Фото ложится в S3, кадр встаёт в очередь Kafka.', verb: 'кадр' },
    { icon: 'frame', title: 'Модель', text: 'Gemini Decision за 1–3 с отвечает: видно ли оборудование, ТКШ это или РЩ, какое состояние, насколько срочно. К каждому ответу вероятность. Вторым этапом Gemini 4 Hydrogen обводит рамкой каждый шкаф и щит в кадре.', verb: 'ответ' },
    { icon: 'route', title: 'Маршрут кадра', text: '', route: true, verb: 'сомнительное' },
    { icon: 'user-check', title: 'Диспетчер', text: 'Смотрит фото с рамкой и решает: «Подтвердить», «Ложное» или «Нужен кадр». Причины ложных идут в дообучение.', verb: 'дефект' },
    { icon: 'list', title: 'Наряд', text: 'Бригада получает ID объекта, фото «что искать» и закрывает наряд с фото «после».', verb: 'ремонт' },
    { icon: 'clock', title: 'Повторный кадр', text: 'Следующий снимок того же объекта подтверждает ремонт. Объект живёт во времени, не в одном кадре.', verb: '' },
  ];

  readonly st = this.store.select((ds) => (ds.meta.empty ? null : M.selectStats(ds)), null as any);
  readonly routes = computed<Record<string, number>>(() => this.st()?.frames.byRoute || {});
  /** Frames a human sees: review + critical. */
  readonly seen = computed(() => (this.routes()['review'] || 0) + (this.routes()['critical'] || 0));
  readonly accuracy = this.store.select((ds) => ds.quality?.kpi?.accuracy ?? null, null as number | null);
  readonly model = this.store.select((ds) => ds.quality?.model || ds.meta.model || 'google/gemini-decision-1', 'google/gemini-decision-1');

  constructor() {
    inject(Shell).setTitle('О системе');
  }

  n(k: string) {
    return fmt.int(this.routes()[k] || 0);
  }
  int(v: number) {
    return fmt.int(v);
  }
  pct(v: number | null) {
    return fmt.pct(v, 1);
  }
  pad(i: number) {
    return String(i).padStart(2, '0');
  }
}
