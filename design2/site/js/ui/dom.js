/**
 * Tiny rendering helpers: escaped HTML templates, icons, delegated events.
 *   el.innerHTML = String(html`<b>${userText}</b>`)  // interpolations are escaped
 *   raw(str)  marks a trusted string (already escaped markup)
 */

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

export const raw = (s) => new Raw(String(s ?? ''));

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toStr(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(toStr).join('');
  return esc(v);
}

/** Tagged template: escapes every interpolation except raw()/html`` results and arrays of them. */
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s + (i < vals.length ? toStr(vals[i]) : ''); });
  return new Raw(out);
}

/** Sets innerHTML from an html`` result. */
export function mount(el, tpl) {
  el.innerHTML = String(tpl);
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const ICONS = '../brand/icons.svg';

/** Sprite icon. */
export function icon(name, cls = '') {
  return raw(`<svg class="pp-icon ${cls}" aria-hidden="true"><use href="${ICONS}#i-${name}"/></svg>`);
}

/**
 * Delegated click handling: <button data-action="foo" data-id="…">.
 * @param {HTMLElement} root
 * @param {Record<string,(el:HTMLElement, ev:Event)=>void>} handlers
 */
export function onAction(root, handlers, type = 'click') {
  const fn = (ev) => {
    const t = ev.target.closest?.('[data-action]');
    if (!t || !root.contains(t)) return;
    const h = handlers[t.dataset.action];
    if (h) h(t, ev);
  };
  root.addEventListener(type, fn);
  return () => root.removeEventListener(type, fn);
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** True when the event target is a text field (global hotkeys must not fire). */
export function isTyping(ev) {
  const t = ev.target;
  if (!t || !t.tagName) return false;
  return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Download a text blob. */
export function download(name, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/** Russian plural: plural(5, ['объект','объекта','объектов']) */
export function plural(n, forms) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}
