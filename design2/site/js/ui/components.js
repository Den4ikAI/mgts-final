/**
 * Shared view pieces built on brand/components.css (pp-*) plus app.css (ux-*).
 * Every label comes from the taxonomy / data layer.
 */
import { html, raw, icon, esc } from './dom.js';
import { fmt } from '../data/index.js';

const ST_CLASS = { ok: 'ok', suspected: 'suspected', defect: 'defect', critical: 'critical', not_observed: 'not-observed' };
export const stClass = (s) => ST_CLASS[s] || 'not-observed';

/** Status pill: icon + word, «Не наблюдается» dashed. */
export function statusPill(status, label, { sm = false, pulse = false } = {}) {
  const c = stClass(status);
  return html`<span class="pp-status pp-status--${c}${sm ? ' pp-status--sm' : ''}${pulse ? ' pp-status--pulse' : ''}">
    <svg class="pp-status__icon" aria-hidden="true"><use href="../brand/icons.svg#i-status-${c}"/></svg><span>${label}</span></span>`;
}

const SEV_LEVEL = { low: 1, medium: 2, high: 3, critical: 4 };
/** Severity chip with 1..4 bars; null → muted dash. */
export function sevChip(sev, label) {
  if (!sev) return html`<span class="pp-muted">нет</span>`;
  return html`<span class="pp-sev pp-sev--${sev}" data-level="${SEV_LEVEL[sev] || 1}"><span class="pp-sev__bars"><i></i><i></i><i></i><i></i></span>${label}</span>`;
}

export function kindIcon(kind) {
  return icon(kind === 'tksh' ? 'cabinet' : kind === 'rsh' ? 'board' : 'frame', 'pp-icon--sm');
}

/** Map-pin glyph per status (shape carries meaning too, as in the brandbook): circle, triangle, diamond, octagon, dashed circle */
export function statusGlyph(status, size = 12) {
  const s = size, h = s / 2;
  const c = `var(--status-${status === 'not_observed' ? 'not-observed' : status}-solid)`;
  let shape;
  switch (status) {
    case 'suspected': shape = `<path d="M${h} 1 L${s - 1} ${s - 1} L1 ${s - 1}Z" fill="${c}"/>`; break;
    case 'defect': shape = `<path d="M${h} 0 L${s} ${h} L${h} ${s} L0 ${h}Z" fill="${c}"/>`; break;
    case 'critical': { const r = h - 0.5, k = r * 0.41; shape = `<path d="M${h - k} ${h - r}H${h + k}L${h + r} ${h - k}V${h + k}L${h + k} ${h + r}H${h - k}L${h - r} ${h + k}V${h - k}Z" fill="${c}"/>`; break; }
    case 'not_observed': shape = `<circle cx="${h}" cy="${h}" r="${h - 1.5}" fill="none" stroke="var(--status-not-observed)" stroke-width="1.5" stroke-dasharray="2 2"/>`; break;
    default: shape = `<circle cx="${h}" cy="${h}" r="${h - 1}" fill="${c}"/>`;
  }
  return raw(`<svg class="ux-glyph" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" aria-hidden="true">${shape}</svg>`);
}

/** Frame tone for a detection: critical / defect / ok(scan). */
export function boxTone(d) {
  if (!d) return '';
  if (d.isCritical || d.severity === 'critical') return 'pp-detect__box--critical';
  if (d.isDefect) return 'pp-detect__box--defect';
  return '';
}

/**
 * Evidence photo with the detection frame and tag «Повреждение ЛКП · 0.95».
 * No bbox (model judged the whole frame) → corners around the whole frame, honest caption.
 * Image src is resolved later by hydratePhotos() (api/file sources need resolvePhoto).
 */
export function evidence(d, { tag = true, caption = true, cls = '', alt = '', enter = false } = {}) {
  if (!d) return noPhoto(cls);
  const label = d.isDefect ? d.defectLabel : (d.route === 'not_observed' ? 'Не наблюдается' : 'Норма');
  const tagEl = tag ? html`<span class="pp-detect__tag">${label} · <b>${fmt.conf(d.confidence)}</b></span>` : '';
  const tone = boxTone(d);
  const box = d.bbox
    ? html`<span class="pp-detect__box ${tone}${enter ? ' pp-detect__box--enter' : ''}${d.bbox.y >= 0.07 ? '' : d.bbox.y + d.bbox.h <= 0.9 ? ' ux-tag-below' : ' ux-tag-inside'}${d.bbox.x + d.bbox.w > 1 - d.bbox.x ? ' ux-tag-right' : ''}" style="--x:${(d.bbox.x * 100).toFixed(2)}%;--y:${(d.bbox.y * 100).toFixed(2)}%;--w:${(d.bbox.w * 100).toFixed(2)}%;--h:${(d.bbox.h * 100).toFixed(2)}%">${tagEl}</span>`
    : html`<span class="pp-detect__box ux-box-whole ${tone}${enter ? ' pp-detect__box--enter' : ''}">${tagEl}</span>`;
  const cap = caption ? html`<figcaption class="pp-detect__caption"><span>${d.objectId || 'Объект не сопоставлен'}</span><span>${[d.bbox ? '' : 'рамка: весь кадр', d.createdAt ? fmt.dateTime(d.createdAt) : ''].filter(Boolean).join(' · ')}</span></figcaption>` : '';
  if (!d.photo) return html`<figure class="pp-detect ux-photo ${cls}">${noPhotoInner()}${cap}</figure>`;
  return html`<figure class="pp-detect ux-photo ${cls}"><img data-photo="${d.photo}" alt="${alt || `${label}, ${d.objectId || 'кадр'}`}" loading="lazy">${box}${cap}</figure>`;
}

function noPhotoInner() {
  return html`<div class="ux-nophoto">${icon('camera', 'pp-icon--lg')}<span>Нет кадра</span></div>`;
}
export function noPhoto(cls = '') {
  return html`<figure class="pp-detect ux-photo ${cls}">${noPhotoInner()}</figure>`;
}

/** Small thumbnail with frame (queue list, feeds). */
export function thumb(d, cls = '') {
  if (!d?.photo) return html`<span class="ux-thumb ux-thumb--empty ${cls}">${icon('camera', 'pp-icon--sm')}</span>`;
  const tone = boxTone(d);
  const b = d.bbox;
  const style = b ? `--x:${(b.x * 100).toFixed(1)}%;--y:${(b.y * 100).toFixed(1)}%;--w:${(b.w * 100).toFixed(1)}%;--h:${(b.h * 100).toFixed(1)}%` : '--x:8%;--y:8%;--w:84%;--h:84%';
  return html`<span class="ux-thumb pp-detect ${cls}"><img data-photo="${d.photo}" alt="" loading="lazy"><span class="pp-detect__box ux-thumb__box ${tone}" style="${style}"></span></span>`;
}

/**
 * Resolves <img data-photo> through the source (blob URLs for file/api) and marks failures.
 * @param {HTMLElement} root
 * @param {{resolvePhoto:(u:string)=>Promise<string|null>}} src
 */
const missingPhotos = new Set(); // URLs that already failed: do not ask the server again on every repaint
export function forgetMissingPhotos() { missingPhotos.clear(); }

export function hydratePhotos(root, src) {
  root.querySelectorAll('img[data-photo]:not([data-hydrated])').forEach(async (img) => {
    img.dataset.hydrated = '1';
    const fail = () => {
      if (img.dataset.photo && !img.src.startsWith('blob:')) missingPhotos.add(img.dataset.photo);
      const fig = img.closest('.ux-photo, .ux-thumb');
      img.remove();
      if (!fig) return;
      fig.classList.add('is-missing');
      fig.querySelectorAll('.pp-detect__box').forEach((b) => b.remove());
      if (fig.classList.contains('ux-photo')) fig.insertAdjacentHTML('afterbegin', String(noPhotoInner()));
      else fig.insertAdjacentHTML('afterbegin', String(icon('camera', 'pp-icon--sm')));
    };
    if (missingPhotos.has(img.dataset.photo)) { fail(); return; }
    img.addEventListener('error', fail, { once: true });
    // thumbnails take the photo's own aspect ratio, so the model's box lands where it was drawn
    img.addEventListener('load', () => { const t = img.closest('.ux-thumb'); if (t && img.naturalWidth) t.style.setProperty('--ar', `${img.naturalWidth} / ${img.naturalHeight}`); }, { once: true });
    try {
      const u = await src.resolvePhoto(img.dataset.photo);
      if (u) img.src = u; else fail();
    } catch { fail(); }
  });
}

/** Probability bars, grey + accent for the chosen class. */
export function probBars(d, tax, limit = 5) {
  if (!d?.probs) return '';
  const rows = Object.entries(d.probs).sort((a, b) => b[1] - a[1]).slice(0, limit);
  const chosen = d.top ?? d.defectType ?? tax.okKey;
  return html`<ul class="ux-probs" aria-label="Вероятности классов">${rows.map(([k, p]) => html`
    <li class="${k === chosen ? 'is-top' : ''}"><span class="ux-probs__label">${tax.label(k === tax.okKey ? null : k)}</span>
      <span class="ux-probs__track"><span class="ux-probs__fill" style="--v:${Math.max(0.005, p).toFixed(4)}"></span></span>
      <span class="ux-probs__val pp-mono">${fmt.conf(p)}</span></li>`)}</ul>`;
}

/** Empty state with corner brackets. */
export function empty({ iconName = 'frame', title, text = '', actions = '' }) {
  return html`<div class="pp-empty"><div class="pp-empty__icon pp-corners">${icon(iconName)}</div>
    <h3 class="pp-empty__title">${title}</h3>${text ? html`<p class="pp-empty__text">${text}</p>` : ''}
    ${actions ? html`<div class="pp-empty__actions">${actions}</div>` : ''}</div>`;
}

/** Inline mark (logo/mark.svg geometry), colours from tokens via .pp-logo rules. */
export function mark(cls = '', size = 32) {
  return raw(`<svg class="pp-mark pp-logo-mark ${cls}" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true"><g class="pp-mark__route"><path class="pp-mark__route-l" d="M3 29H21V35H0Z"/><path class="pp-mark__route-r" d="M43 29H64L61 35H43Z"/></g><g class="pp-mark__frame"><path class="pp-mark__c" d="M8 25V10A2 2 0 0 1 10 8H25V14H14V25Z"/><path class="pp-mark__c" d="M39 8H54A2 2 0 0 1 56 10V25H50V14H39Z"/><path class="pp-mark__c" d="M56 39V54A2 2 0 0 1 54 56H39V50H50V39Z"/><path class="pp-mark__c" d="M25 56H10A2 2 0 0 1 8 54V39H14V50H25Z"/></g><circle class="pp-mark__dot" cx="32" cy="32" r="8"/></svg>`);
}

/** Loading state: the mark loop + one line. */
export function loader(text = 'Загружаем данные') {
  return html`<div class="ux-loader" role="status">${mark('pp-mark-anim--loop', 56)}<span>${text}</span></div>`;
}

/** Key-value list. rows: [label, value(html)] */
export function kv(rows) {
  return html`<dl class="ux-kv">${rows.filter(Boolean).map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>`;
}

export function mono(v, cls = '') { return html`<span class="pp-mono ${cls}">${v}</span>`; }

/** Event → status-ish class for timeline nodes. */
export function eventNode(e) {
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

export { esc };
