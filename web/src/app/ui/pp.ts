/**
 * Shared pieces of the «Попутно» UI, ported from design2/site/js/ui/components.js.
 * Markup and class names are the site's (brand pp-* + product ux-*), so the CSS applies as is.
 */
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { PoputnoStore } from '../data/store';
import { fmt } from '../data/legacy';

const ST_CLASS: Record<string, string> = { ok: 'ok', suspected: 'suspected', defect: 'defect', critical: 'critical', not_observed: 'not-observed' };
export const stClass = (s: string | null | undefined) => ST_CLASS[s ?? ''] || 'not-observed';
export const ICONS = '/brand/icons.svg';

/** Sprite icon: <pp-icon name="alert" cls="pp-icon--sm"/>. */
@Component({
  selector: 'pp-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<svg [attr.class]="'pp-icon ' + cls()" aria-hidden="true"><use [attr.href]="href()" /></svg>`,
})
export class PpIcon {
  readonly name = input.required<string>();
  readonly cls = input('');
  readonly href = computed(() => `${ICONS}#i-${this.name()}`);
}

/** Status pill: icon + word; «Не наблюдается» dashed. */
@Component({
  selector: 'pp-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<span [class]="'pp-status pp-status--' + c() + (sm() ? ' pp-status--sm' : '') + (pulse() ? ' pp-status--pulse' : '')">
    <svg class="pp-status__icon" aria-hidden="true"><use [attr.href]="icons + '#i-status-' + c()" /></svg><span>{{ label() }}</span></span>`,
})
export class PpStatus {
  readonly status = input<string | null>(null);
  readonly label = input<string>('');
  readonly sm = input(false);
  readonly pulse = input(false);
  readonly icons = ICONS;
  readonly c = computed(() => stClass(this.status()));
}

const SEV_LEVEL: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
/** Severity chip with 1..4 bars; null → muted «нет». */
@Component({
  selector: 'pp-sev',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `@if (sev()) {
      <span [class]="'pp-sev pp-sev--' + sev()" [attr.data-level]="level()"><span class="pp-sev__bars"><i></i><i></i><i></i><i></i></span>{{ label() }}</span>
    } @else {
      <span class="pp-muted">нет</span>
    }`,
})
export class PpSev {
  readonly sev = input<string | null>(null);
  readonly label = input<string>('');
  readonly level = computed(() => SEV_LEVEL[this.sev() ?? ''] || 1);
}

/** ТКШ / РЩ glyph. */
@Component({
  selector: 'pp-kind-icon',
  imports: [PpIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<pp-icon [name]="kind() === 'tksh' ? 'cabinet' : kind() === 'rsh' ? 'board' : 'frame'" cls="pp-icon--sm" />`,
})
export class PpKindIcon {
  readonly kind = input<string | null>(null);
}

/** Map-pin glyph per status (shape carries meaning): circle, triangle, diamond, octagon, dashed circle. */
@Component({
  selector: 'pp-glyph',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<svg class="ux-glyph" [attr.width]="size()" [attr.height]="size()" [attr.viewBox]="'0 0 ' + size() + ' ' + size()" aria-hidden="true">
    @switch (status()) {
      @case ('suspected') { <path [attr.d]="tri()" [attr.fill]="color()" /> }
      @case ('defect') { <path [attr.d]="diamond()" [attr.fill]="color()" /> }
      @case ('critical') { <path [attr.d]="octagon()" [attr.fill]="color()" /> }
      @case ('not_observed') { <circle [attr.cx]="h()" [attr.cy]="h()" [attr.r]="h() - 1.5" fill="none" stroke="var(--status-not-observed)" stroke-width="1.5" stroke-dasharray="2 2" /> }
      @default { <circle [attr.cx]="h()" [attr.cy]="h()" [attr.r]="h() - 1" [attr.fill]="color()" /> }
    }
  </svg>`,
})
export class PpGlyph {
  readonly status = input<string | null>(null);
  readonly size = input(12);
  readonly h = computed(() => this.size() / 2);
  readonly color = computed(() => `var(--status-${this.status() === 'not_observed' ? 'not-observed' : this.status() || 'ok'}-solid)`);
  readonly tri = computed(() => { const s = this.size(), h = s / 2; return `M${h} 1 L${s - 1} ${s - 1} L1 ${s - 1}Z`; });
  readonly diamond = computed(() => { const s = this.size(), h = s / 2; return `M${h} 0 L${s} ${h} L${h} ${s} L0 ${h}Z`; });
  readonly octagon = computed(() => {
    const h = this.size() / 2, r = h - 0.5, k = r * 0.41;
    return `M${h - k} ${h - r}H${h + k}L${h + r} ${h - k}V${h + k}L${h + k} ${h + r}H${h - k}L${h - r} ${h + k}V${h - k}Z`;
  });
}

/** Photo through the API (bearer token → blob URL); hides itself and shows «Нет кадра» on failure. */
@Component({
  selector: 'pp-photo-img',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `@if (url()) { <img [src]="url()" [alt]="alt()" loading="lazy" (load)="loaded.set(true)" (error)="failed.set(true)" /> }`,
})
export class PpPhotoImg {
  private store = inject(PoputnoStore);
  readonly uri = input<string | null>(null);
  readonly alt = input('');
  readonly url = signal<string | null>(null);
  readonly loaded = signal(false);
  readonly failed = signal(false);
  constructor() {
    effect(() => {
      const u = this.uri();
      this.url.set(null);
      this.failed.set(false);
      this.store.photo(u).then((x) => (x ? this.url.set(x) : this.failed.set(true)));
    });
  }
}

/** Loads a /api/media photo for a template: url / loaded / failed signals. */
class PhotoState {
  readonly url = signal<string | null>(null);
  readonly loaded = signal(false);
  readonly failed = signal(false);
  constructor(store: PoputnoStore, uri: () => string | null | undefined) {
    effect(() => {
      const u = uri();
      this.url.set(null);
      this.loaded.set(false);
      this.failed.set(!u);
      if (u) store.photo(u).then((x) => (x ? this.url.set(x) : this.failed.set(true)));
    });
  }
}

/** Boxes to draw on a photo: every object of the frame (second stage) or the detection's own bbox. */
export interface Box {
  x: number; y: number; w: number; h: number;
  tone: string;
  label: string | null;
  conf: number | null;
  note: string | null;
}

const COND_TONE: Record<string, string> = { mount_failure: 'pp-detect__box--critical', deformation: 'pp-detect__box--defect', paint: 'pp-detect__box--defect', ok: '' };

/** Frame tone for a detection: critical / defect / ok (scan). */
export function boxTone(d: any): string {
  if (!d) return '';
  if (d.isCritical || d.severity === 'critical') return 'pp-detect__box--critical';
  if (d.isDefect) return 'pp-detect__box--defect';
  return '';
}

/** Boxes for a detection: d.extra.objects (every cabinet/board) if known, else d.bbox, else none. */
export function boxesOf(d: any, tax: any): Box[] {
  const objs = d?.extra?.objects as any[] | undefined;
  if (objs?.length) {
    const kinds = tax?.kinds || { tksh: 'ТКШ', rsh: 'РЩ' };
    return objs.map((o) => ({
      ...o.bbox,
      tone: COND_TONE[o.condition] ?? 'pp-detect__box--defect',
      label: `${kinds[o.kind] || 'Объект'} · ${o.condition === 'ok' ? 'норма' : String(tax?.label(o.condition) ?? o.condition).toLowerCase()}`,
      conf: o.confidence ?? null,
      note: o.note ?? null,
    }));
  }
  if (d?.bbox && !(d.bbox.x === 0 && d.bbox.y === 0 && d.bbox.w === 1 && d.bbox.h === 1)) {
    return [{ ...d.bbox, tone: boxTone(d), label: null, conf: null, note: null }];
  }
  return [];
}

/**
 * Evidence photo with detection frames and the tag «Повреждение ЛКП · 95%».
 * Every cabinet/board of the frame gets its own box when the second stage has answered;
 * otherwise corners around the whole frame with an honest caption.
 */
@Component({
  selector: 'pp-evidence',
  imports: [PpIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <figure [class]="'pp-detect ux-photo ' + cls() + (img.failed() ? ' is-missing' : '')">
      @if (!img.failed()) {
        @if (img.url()) { <img [src]="img.url()" [alt]="alt() || label() + ', ' + (d()?.objectId || 'кадр')" (load)="img.loaded.set(true)" (error)="img.failed.set(true)" /> }
        @if (img.loaded()) {
          @if (boxes().length) {
            @for (b of boxes(); track $index) {
              <span [class]="'pp-detect__box ' + b.tone + (enter() ? ' pp-detect__box--enter' : '') + tagPos(b)"
                [style.--x]="pct(b.x)" [style.--y]="pct(b.y)" [style.--w]="pct(b.w)" [style.--h]="pct(b.h)" [attr.title]="b.note">
                @if (tag()) { <span class="pp-detect__tag">{{ b.label || label() }}@if (b.conf != null || (!b.label && d()?.confidence != null)) { · <b>{{ conf(b.label ? b.conf : d()?.confidence) }}</b>}</span> }
              </span>
            }
          } @else {
            <span [class]="'pp-detect__box ux-box-whole ' + tone() + (enter() ? ' pp-detect__box--enter' : '')">
              @if (tag()) { <span class="pp-detect__tag">{{ label() }} · <b>{{ conf(d()?.confidence) }}</b></span> }
            </span>
          }
        }
      } @else {
        <div class="ux-nophoto"><pp-icon name="camera" cls="pp-icon--lg" /><span>Нет кадра</span></div>
      }
      @if (caption() && d()) {
        <figcaption class="pp-detect__caption"><span>{{ d()!.objectId || 'Объект не сопоставлен' }}</span><span>{{ captionRight() }}</span></figcaption>
      }
    </figure>`,
})
export class PpEvidence {
  private store = inject(PoputnoStore);
  readonly d = input<any>(null);
  readonly img = new PhotoState(this.store, () => this.d()?.photo);
  readonly tag = input(true);
  readonly caption = input(true);
  readonly cls = input('');
  readonly alt = input('');
  readonly enter = input(false);
  readonly boxes = computed(() => boxesOf(this.d(), this.store.tax()));
  readonly tone = computed(() => boxTone(this.d()));
  readonly label = computed(() => {
    const d = this.d();
    if (!d) return '';
    return d.isDefect ? d.defectLabel : d.route === 'not_observed' ? 'Не наблюдается' : 'Норма';
  });
  readonly captionRight = computed(() => {
    const d = this.d();
    const n = this.boxes().length;
    return [n > 1 ? `объектов в кадре: ${n}` : n ? '' : 'рамка: весь кадр', d?.createdAt ? fmt.dateTime(d.createdAt) : ''].filter(Boolean).join(' · ');
  });
  pct(v: number) {
    return `${(v * 100).toFixed(2)}%`;
  }
  conf(v: number | null | undefined) {
    return fmt.conf(v);
  }
  tagPos(b: Box) {
    return (b.y >= 0.07 ? '' : b.y + b.h <= 0.9 ? ' ux-tag-below' : ' ux-tag-inside') + (b.x + b.w > 1 - b.x ? ' ux-tag-right' : '');
  }
}

/** Small thumbnail with the frame (queue list, feeds). */
@Component({
  selector: 'pp-thumb',
  imports: [PpIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @if (!img.failed()) {
      <span [class]="'ux-thumb pp-detect ' + cls()" [style.--ar]="ar()">
        @if (img.url()) { <img [src]="img.url()" alt="" (load)="onLoad($event)" (error)="img.failed.set(true)" /> }
        @for (b of boxes(); track $index) {
          <span [class]="'pp-detect__box ux-thumb__box ' + b.tone" [style.--x]="pct(b.x)" [style.--y]="pct(b.y)" [style.--w]="pct(b.w)" [style.--h]="pct(b.h)"></span>
        }
      </span>
    } @else {
      <span [class]="'ux-thumb ux-thumb--empty ' + cls()"><pp-icon name="camera" cls="pp-icon--sm" /></span>
    }`,
})
export class PpThumb {
  private store = inject(PoputnoStore);
  readonly d = input<any>(null);
  readonly cls = input('');
  readonly ar = signal<string | null>(null);
  readonly img = new PhotoState(this.store, () => this.d()?.photo);
  /** Thumbnails take the photo's own aspect ratio, so the boxes land where the model drew them. */
  onLoad(e: Event) {
    const i = e.target as HTMLImageElement;
    if (i.naturalWidth) this.ar.set(`${i.naturalWidth} / ${i.naturalHeight}`);
  }
  readonly boxes = computed(() => {
    const b = boxesOf(this.d(), this.store.tax());
    return b.length ? b : [{ x: 0.08, y: 0.08, w: 0.84, h: 0.84, tone: boxTone(this.d()), label: null, conf: null, note: null }];
  });
  pct(v: number) {
    return `${(v * 100).toFixed(1)}%`;
  }
}

/** Probability bars, grey + accent for the chosen class. */
@Component({
  selector: 'pp-probs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `@if (rows().length) {
    <ul class="ux-probs" aria-label="Вероятности классов">
      @for (r of rows(); track r.key) {
        <li [class.is-top]="r.key === chosen()"><span class="ux-probs__label">{{ r.label }}</span>
          <span class="ux-probs__track"><span class="ux-probs__fill" [style.--v]="r.v"></span></span>
          <span class="ux-probs__val pp-mono">{{ r.text }}</span></li>
      }
    </ul>
  }`,
})
export class PpProbs {
  private store = inject(PoputnoStore);
  readonly d = input<any>(null);
  readonly limit = input(5);
  readonly chosen = computed(() => {
    const d = this.d(), tax = this.store.tax();
    return d?.top ?? d?.defectType ?? tax?.okKey;
  });
  readonly rows = computed(() => {
    const d = this.d(), tax = this.store.tax();
    if (!d?.probs || !tax) return [];
    return (Object.entries(d.probs) as [string, number][])
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.limit())
      .map(([k, p]) => ({ key: k, label: tax.label(k === tax.okKey ? null : k), v: Math.max(0.005, p).toFixed(4), text: fmt.conf(p) }));
  });
}

/** Empty state with corner brackets; actions go into the content slot. */
@Component({
  selector: 'pp-empty',
  imports: [PpIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="pp-empty"><div class="pp-empty__icon pp-corners"><pp-icon [name]="icon()" /></div>
    <h3 class="pp-empty__title">{{ title() }}</h3>@if (text()) { <p class="pp-empty__text">{{ text() }}</p> }
    <div class="pp-empty__actions"><ng-content /></div></div>`,
})
export class PpEmpty {
  readonly icon = input('frame');
  readonly title = input.required<string>();
  readonly text = input('');
}

/** Brand mark (logo geometry), colours from tokens. */
@Component({
  selector: 'pp-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<svg [attr.class]="'pp-mark pp-logo-mark ' + cls()" viewBox="0 0 64 64" [attr.width]="size()" [attr.height]="size()" aria-hidden="true"><g class="pp-mark__route"><path class="pp-mark__route-l" d="M3 29H21V35H0Z"/><path class="pp-mark__route-r" d="M43 29H64L61 35H43Z"/></g><g class="pp-mark__frame"><path class="pp-mark__c" d="M8 25V10A2 2 0 0 1 10 8H25V14H14V25Z"/><path class="pp-mark__c" d="M39 8H54A2 2 0 0 1 56 10V25H50V14H39Z"/><path class="pp-mark__c" d="M56 39V54A2 2 0 0 1 54 56H39V50H50V39Z"/><path class="pp-mark__c" d="M25 56H10A2 2 0 0 1 8 54V39H14V50H25Z"/></g><circle class="pp-mark__dot" cx="32" cy="32" r="8"/></svg>`,
})
export class PpMark {
  readonly cls = input('');
  readonly size = input(32);
}

/** Loading state: the mark loop + one line. */
@Component({
  selector: 'pp-loader',
  imports: [PpMark],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="ux-loader" role="status"><pp-mark cls="pp-mark-anim--loop" [size]="56" /><span>{{ text() }}</span></div>`,
})
export class PpLoader {
  readonly text = input('Загружаем данные');
}

/** Event → status-ish class for timeline nodes. */
export function eventNode(e: any): string {
  if (e.isCritical) return 'critical';
  switch (e.type) {
    case 'status_changed': return stClass(e.payload.to);
    case 'observed': return e.payload.defect_type ? 'suspected' : 'ok';
    case 'reviewed': return e.payload.decision === 'confirm' ? 'defect' : e.payload.decision === 'reject' ? 'ok' : 'suspected';
    case 'work_order_closed': return 'ok';
    case 'work_order_opened': return 'defect';
    default: return '';
  }
}

/** Russian plural: plural(5, ['объект', 'объекта', 'объектов']). */
export function plural(n: number, forms: [string, string, string]) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

/** All shared pieces, for `imports: [...PP]`. */
export const PP = [PpIcon, PpStatus, PpSev, PpKindIcon, PpGlyph, PpPhotoImg, PpEvidence, PpThumb, PpProbs, PpEmpty, PpMark, PpLoader];
