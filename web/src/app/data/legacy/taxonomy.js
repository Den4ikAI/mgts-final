/**
 * Taxonomy: defect classes and every Russian label the UI needs.
 *
 * Classes come from ONE file, data/taxonomy.json (same shape as ml/taxonomy.json, which can be
 * copied over as is). Optional per-class extras: `severity` (default severity) and
 * `recommendation` (template with {label} {deadline} {kind}). Optional top-level `ui` block
 * overrides the built-in dictionaries below (statuses, severities, deadlines, kinds, …).
 *
 * Rules: unknown class keys are shown as is; null/empty defect → «Норма».
 */

import { fetchJSON, norm } from './util.js';
import { getConfig } from './config.js';

/** Object status → label. `critical` is a display status (suspected/defect + critical severity). */
export const STATUS = {
  ok: 'Норма',
  suspected: 'Проверить',
  defect: 'Дефект',
  critical: 'Критично',
  not_observed: 'Не наблюдается',
};
/** Display order: most urgent first. */
export const STATUS_ORDER = ['critical', 'defect', 'suspected', 'not_observed', 'ok'];

export const SEVERITY = { low: 'Низкая', medium: 'Средняя', high: 'Высокая', critical: 'Аварийная' };
export const SEVERITY_RANK = { low: 1, medium: 2, high: 3, critical: 4 };
export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];
/** Severity → repair deadline wording used in recommendations. */
export const DEADLINE = { critical: 'немедленно', high: '24 часа', medium: '3 суток', low: 'плановое ТО' };

export const KIND = { tksh: 'ТКШ', rsh: 'РЩ' };
export const KIND_LONG = { tksh: 'Телекоммуникационный климатический шкаф', rsh: 'Распределительный щит' };

export const ROUTE = {
  critical: 'Тревога, в обход очереди',
  review: 'К диспетчеру',
  auto_ok: 'Норма без человека',
  not_observed: 'Не наблюдается',
  error: 'Ошибка модели',
};

export const REVIEW_STATE = {
  pending: 'Ждёт решения',
  confirm: 'Подтверждено',
  confirmed: 'Норма, автоматически',
  reject: 'Ложное',
  rejected: 'Ложное',
  need_recapture: 'Нужен кадр',
  not_observed: 'Не наблюдается',
};

export const DECISION = {
  confirm: { label: 'Подтвердить', key: 'Y', keyRu: 'Н' },
  reject: { label: 'Ложное', key: 'N', keyRu: 'Т' },
  need_recapture: { label: 'Нужен кадр', key: 'R', keyRu: 'К' },
};

export const REJECT_REASON = {
  shadow: 'Блик или тень',
  puddle: 'Грязь, а не коррозия',
  foreign_owner: 'Чужое оборудование',
  bad_frame: 'Плохой кадр',
  not_a_defect: 'Не дефект',
  other: 'Другое',
};

export const EVENT = {
  observed: 'Наблюдение',
  critical_alert_raised: 'Тревога',
  status_changed: 'Смена статуса',
  reviewed: 'Решение диспетчера',
  work_order_opened: 'Наряд открыт',
  work_order_closed: 'Наряд закрыт',
};

export const ROLE = { admin: 'Администратор', dispatcher: 'Диспетчер', manager: 'Руководитель', technician: 'Бригада' };

/** Words that mean "no defect" in organizers' tables, on top of the `ok` class aliases. */
const OK_WORDS = ['ok', 'ок', 'норма', 'нормальное', 'исправен', 'исправно', 'исправное', 'нет', 'без дефектов',
  'без повреждений', 'нет дефекта', 'нет повреждений', 'good', 'normal', 'no defect', 'none_defect', '0', 'false'];
const NONE_WORDS = ['none', 'нет объекта', 'объекта нет', 'не виден', 'не наблюдается', 'no object', 'not_observed'];

/** Built-in fallback = current ml/taxonomy.json classes, used when the JSON cannot be loaded. */
export const FALLBACK_TAXONOMY = {
  classes: {
    none: { label: 'Объекта нет', kind: null, ok: true },
    ok: { label: 'Удовлетворительно', kind: null, ok: true },
    paint: { label: 'Повреждение ЛКП', kind: null, ok: false, severity: 'low' },
    deformation: { label: 'Механическое повреждение', kind: null, ok: false, severity: 'medium' },
    mount_failure: { label: 'Нарушение крепления', kind: null, ok: false, severity: 'critical' },
  },
  thresholds: { object_min: 0.75, auto_ok: 0.6, critical_prob: 0.5, high_score: 2.0, check_max: 0.6 },
};

const GENERIC_RECOMMENDATION = 'Проверить объект на месте: {label}. Срок: {deadline}.';

/**
 * @typedef {Object} ClassInfo
 * @property {string} key
 * @property {string} label        Russian label
 * @property {'tksh'|'rsh'|null} kind
 * @property {boolean} ok          true = not a defect (ok / none)
 * @property {string|null} severity default severity for this class
 * @property {string|null} recommendation template
 * @property {string} description
 * @property {string[]} aliases
 * @property {boolean} known       false for keys not present in taxonomy.json
 */

/**
 * Builds a taxonomy object from parsed JSON (data/taxonomy.json, /api/taxonomy or ml/taxonomy.json).
 * @param {object} [json]
 */
export function createTaxonomy(json) {
  const src = json && typeof json === 'object' && json.classes ? json : FALLBACK_TAXONOMY;
  const ui = src.ui || {};
  const dict = {
    statuses: { ...STATUS, ...(ui.statuses || {}) },
    severities: { ...SEVERITY, ...(ui.severities || {}) },
    deadlines: { ...DEADLINE, ...(ui.deadlines || {}) },
    kinds: { ...KIND, ...(ui.kinds || {}) },
    kindsLong: { ...KIND_LONG, ...(ui.kinds_long || {}) },
    routes: { ...ROUTE, ...(ui.routes || {}) },
    reviewStates: { ...REVIEW_STATE, ...(ui.review_states || {}) },
    decisions: DECISION,
    rejectReasons: { ...REJECT_REASON, ...(ui.reject_reasons || {}) },
    events: { ...EVENT, ...(ui.events || {}) },
    roles: ROLE,
  };

  /** @type {Record<string, ClassInfo>} */
  const classes = {};
  for (const [key, c] of Object.entries(src.classes)) {
    classes[key] = {
      key,
      label: c.label || key,
      kind: c.kind ?? null,
      ok: !!c.ok,
      severity: c.severity ?? (c.ok ? null : 'medium'),
      recommendation: c.recommendation ?? null,
      description: c.description || '',
      aliases: Array.isArray(c.aliases) ? c.aliases : [],
      known: true,
    };
  }

  // value → class key lookup (key, label, aliases, generic ok/none words)
  const lookup = new Map();
  const okKey = classes.ok ? 'ok' : Object.values(classes).find((c) => c.ok && c.key !== 'none')?.key ?? null;
  const noneKey = classes.none ? 'none' : null;
  if (okKey) for (const w of OK_WORDS) lookup.set(norm(w), okKey);
  if (noneKey) for (const w of NONE_WORDS) lookup.set(norm(w), noneKey);
  for (const c of Object.values(classes)) {
    for (const v of [c.key, c.label, ...c.aliases]) lookup.set(norm(v), c.key);
  }

  const tax = {
    raw: src,
    isFallback: src === FALLBACK_TAXONOMY,
    classes,
    dict,
    thresholds: { ...FALLBACK_TAXONOMY.thresholds, ...(src.thresholds || {}) },
    okKey,
    noneKey,
    /** All classes in file order. @returns {ClassInfo[]} */
    list: () => Object.values(classes),
    /** Defect classes only (ok=false). */
    defects: () => Object.values(classes).filter((c) => !c.ok),

    /** Class info, synthesized for unknown keys (label = key). @returns {ClassInfo|null} */
    info(key) {
      if (key == null || key === '') return null;
      return classes[key] ?? {
        key: String(key), label: String(key), kind: null, ok: false, severity: null,
        recommendation: null, description: '', aliases: [], known: false,
      };
    },
    /** Russian label; null → «Норма»; unknown key → the key itself. */
    label(key) {
      if (key == null || key === '') return classes.ok?.label || 'Норма';
      return classes[key]?.label ?? String(key);
    },
    /** true if the key means "no defect" (null, ok, none or any ok-class). */
    isOk(key) {
      if (key == null || key === '') return true;
      return classes[key]?.ok ?? false;
    },
    kindOf(key) {
      return classes[key]?.kind ?? null;
    },
    defaultSeverity(key) {
      return tax.isOk(key) ? null : (classes[key]?.severity ?? 'medium');
    },
    /**
     * Maps a raw value from a table (key, Russian label, alias, "норма", …) to a class key.
     * @returns {string|null|undefined} key; null = no defect; undefined = unknown value
     */
    match(value) {
      if (value == null || String(value).trim() === '') return null;
      const k = lookup.get(norm(value));
      if (k === undefined) return undefined;
      return k === okKey ? null : k;
    },
    /**
     * Recommendation text for a defect.
     * @param {string|null} key defect class
     * @param {string|null} [severity]
     * @param {{status?: string, kind?: string}} [ctx]
     */
    recommend(key, severity, ctx = {}) {
      if (ctx.status === 'not_observed') return 'Переснять объект при следующем проезде.';
      if (key === noneKey && key) return 'Объект не виден. Переснять при следующем проезде.';
      if (tax.isOk(key)) return 'Действий не требуется.';
      const c = tax.info(key);
      const sev = severity || c.severity || 'medium';
      const tpl = c.recommendation || GENERIC_RECOMMENDATION;
      return tpl
        .replace(/\{label\}/g, c.label)
        .replace(/\{deadline\}/g, dict.deadlines[sev] || dict.deadlines.medium)
        .replace(/\{kind\}/g, dict.kindsLong[ctx.kind || c.kind] || 'объект');
    },
    statusLabel: (s) => dict.statuses[s] ?? (s || 'нет'),
    severityLabel: (s) => (s ? dict.severities[s] ?? s : 'нет'),
    kindLabel: (k) => (k ? dict.kinds[k] ?? k : 'Объект'),
    kindLongLabel: (k) => (k ? dict.kindsLong[k] ?? k : 'Объект'),
    routeLabel: (r) => (r ? dict.routes[r] ?? r : 'нет'),
    reviewStateLabel: (s) => (s ? dict.reviewStates[s] ?? s : 'нет'),
    eventLabel: (t) => dict.events[t] ?? t,
    rejectReasonLabel(r) {
      if (r == null) return null;
      if (typeof r === 'object' && r.other != null) return `${dict.rejectReasons.other}: ${r.other}`;
      return dict.rejectReasons[r] ?? String(r);
    },
    roleLabel: (r) => ROLE[r] ?? r,
  };
  return tax;
}

/**
 * Loads data/taxonomy.json (or another URL). Never rejects: falls back to the built-in copy.
 * @param {string} [url]
 */
export async function loadTaxonomy(url = getConfig().taxonomyUrl) {
  try {
    return createTaxonomy(await fetchJSON(url));
  } catch (e) {
    console.warn('[taxonomy] fallback to built-in classes:', e.message);
    return createTaxonomy(null);
  }
}
