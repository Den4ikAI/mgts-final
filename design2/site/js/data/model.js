/**
 * Normalized domain model, projection rules and selectors.
 *
 * Every source (demo JSON, Rust API, imported file) ends up as one `Dataset`:
 *   { meta, taxonomy, objects[], byId, detections[], unmatched[], events[], workOrders[], quality, runs, user }
 * Input shapes are the backend's snake_case rows (InfraObject, Detection, ObjectEventRow);
 * camelCase variants are accepted too. Status rules mirror backend/crates/api/src/projection.rs.
 */

import { SEVERITY_RANK, SEVERITY_ORDER, STATUS_ORDER } from './taxonomy.js';
import { toNumber, toProb, toIso, basename, stableId, norm, countBy } from './util.js';

/* ------------------------------------------------------------------ value normalizers */

const KIND_WORDS = {
  tksh: ['tksh', 'ткш', 'телекоммуникационный климатический шкаф', 'климатический шкаф', 'шкаф', 'cabinet', 'telecom cabinet'],
  rsh: ['rsh', 'рщ', 'распределительный щит', 'щит', 'щиток', 'board', 'distribution board'],
};
const KIND_LOOKUP = new Map(Object.entries(KIND_WORDS).flatMap(([k, ws]) => ws.map((w) => [norm(w), k])));

/** Object kind from any wording; unknown → null. */
export function normalizeKind(v) {
  if (v == null || v === '') return null;
  const n = norm(v);
  if (KIND_LOOKUP.has(n)) return KIND_LOOKUP.get(n);
  if (/ткш|шкаф|cabinet/.test(n)) return 'tksh';
  if (/рщ|щит|board/.test(n)) return 'rsh';
  return null;
}

/** Guess kind from an id prefix: ТКШ-… → climate cabinet, РЩ-… → distribution board. */
export function kindFromId(id) {
  const s = String(id ?? '').toUpperCase();
  if (/^(ТКШ|TKSH)[-_ ]?/.test(s)) return 'tksh';
  if (/^(РЩ|RSH)[-_ ]?/.test(s)) return 'rsh';
  return null;
}

const SEVERITY_WORDS = {
  low: ['low', 'низкая', 'низкий', 'незначительная', 'минимальная', 'minor'],
  medium: ['medium', 'средняя', 'средний', 'умеренная', 'moderate'],
  high: ['high', 'высокая', 'высокий', 'серьезная', 'major', 'severe'],
  critical: ['critical', 'критическая', 'критичная', 'критично', 'критический', 'угроза жизни', 'аварийная', 'аварийный', 'urgent'],
};
const SEVERITY_LOOKUP = new Map(Object.entries(SEVERITY_WORDS).flatMap(([k, ws]) => ws.map((w) => [norm(w), k])));

/**
 * Severity from key, Russian word or number. Numbers: 0..1 fractions bucket by quarters;
 * integers 0–1 → low, 2 → medium, 3 → high, ≥4 → critical. Unknown → null.
 */
export function normalizeSeverity(v) {
  if (v == null || v === '') return null;
  const s = SEVERITY_LOOKUP.get(norm(v));
  if (s) return s;
  const n = toNumber(v);
  if (n == null) return null;
  if (n > 0 && n < 1) return n >= 0.75 ? 'critical' : n >= 0.5 ? 'high' : n >= 0.25 ? 'medium' : 'low';
  if (n <= 1) return 'low';
  if (n < 3) return 'medium';
  if (n < 4) return 'high';
  return 'critical';
}

const STATUS_WORDS = {
  ok: ['ok', 'норма', 'исправен', 'исправно', 'исправное', 'в норме', 'хорошее', 'удовлетворительное', 'good'],
  suspected: ['suspected', 'проверить', 'проверка', 'требует проверки', 'подозрение', 'сомнительно', 'review', 'check'],
  defect: ['defect', 'дефект', 'ремонт', 'неисправен', 'неисправно', 'требует ремонта', 'неудовлетворительное', 'bad', 'broken', 'damaged'],
  not_observed: ['not_observed', 'не наблюдается', 'нет данных', 'не виден', 'unknown', 'unseen'],
};
const STATUS_LOOKUP = new Map(Object.entries(STATUS_WORDS).flatMap(([k, ws]) => ws.map((w) => [norm(w), k])));

/** Object status from key or wording (also maps organizers' «исправен/ремонт/проверка»). */
export function normalizeStatus(v) {
  if (v == null || v === '') return null;
  return STATUS_LOOKUP.get(norm(v)) ?? null;
}

/**
 * Bbox in [0,1] frame coordinates or null. Accepts {x,y,w,h}, [x,y,w,h], "x,y,w,h", JSON string.
 * The whole frame ({0,0,1,1}, what the worker writes today) → null: nothing to draw.
 */
export function normalizeBBox(b) {
  if (b == null || b === '') return null;
  let v = b;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { v = v.split(/[\s,;]+/).map(Number); }
  }
  let x, y, w, h;
  if (Array.isArray(v)) [x, y, w, h] = v.map(Number);
  else if (typeof v === 'object') ({ x, y, w, h } = { x: +v.x, y: +v.y, w: +(v.w ?? v.width), h: +(v.h ?? v.height) });
  if (![x, y, w, h].every(Number.isFinite)) return null;
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x > 1 || y > 1 || w > 1.001 || h > 1.001) return null;
  if (x <= 0.01 && y <= 0.01 && w >= 0.98 && h >= 0.98) return null;
  return { x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) };
}

function coord(v, lo, hi) {
  const n = toNumber(v);
  return n != null && n >= lo && n <= hi && n !== 0 ? n : null;
}

/** Joins a photo reference with a base folder unless it is already a URL/absolute path. */
export function photoUrl(uri, base = '') {
  if (!uri) return null;
  const s = String(uri);
  if (/^(https?:|data:|blob:|\/|\.\/|\.\.\/)/.test(s)) return s;
  return (base || '') + s;
}

/* ------------------------------------------------------------------ entity normalizers */

/**
 * @typedef {Object} Detection
 * @property {string} id
 * @property {string|null} frameId
 * @property {string|null} objectId      null = not matched to the registry
 * @property {'tksh'|'rsh'|null} kind
 * @property {string|null} defectType    class key; null = seen and fine
 * @property {string} defectLabel
 * @property {boolean} isDefect
 * @property {string|null} severity      low|medium|high|critical
 * @property {string} severityLabel
 * @property {number} severityRank       0..4
 * @property {number|null} confidence    0..1
 * @property {{x:number,y:number,w:number,h:number}|null} bbox  null = no box (whole frame)
 * @property {string|null} photo         evidence image URL (api: needs resolvePhoto)
 * @property {string|null} file          photo file name
 * @property {string|null} rationale
 * @property {number|null} lat
 * @property {number|null} lon
 * @property {string} reviewState        pending|confirm|reject|need_recapture|confirmed|not_observed
 * @property {string} reviewStateLabel
 * @property {string} route              critical|review|auto_ok|not_observed|error
 * @property {string} routeLabel
 * @property {string|null} createdAt     ISO
 * @property {boolean} isPending
 * @property {boolean} isCritical
 * @property {string} recommendation
 * @property {Record<string,number>|null} probs  class → probability, if the model gave them
 * @property {string|null} top           model's most likely class (may be ok-class)
 * @property {number|null} topP
 * @property {number|null} objectP
 * @property {number|null} pCritical
 * @property {{key:string|null|undefined, label:string, raw:string|null, status:string|null, statusRaw:string|null}|null} truth  ground truth from the organizers' table
 * @property {boolean|null} correct      pred class == truth class (null if unknown)
 * @property {'model'|'label'} origin    'label' = row had only ground truth, no model output
 * @property {Record<string,string>|null} extra  unmapped columns from an import
 * @property {object|null} object        back-reference, set when linked into a Dataset
 */

/** @returns {Detection} */
export function normalizeDetection(raw, tax, { photoBase = '' } = {}) {
  const r = raw || {};
  const defectType = r.defect_type ?? r.defectType ?? null;
  const isDefect = !tax.isOk(defectType);
  let severity = normalizeSeverity(r.severity);
  if (isDefect && !severity) severity = tax.defaultSeverity(defectType);
  if (!isDefect) severity = null;
  const reviewState = r.review_state ?? r.reviewState ?? (isDefect ? 'pending' : 'confirmed');
  const route = r.route ?? (reviewState === 'not_observed' ? 'not_observed'
    : !isDefect ? 'auto_ok' : severity === 'critical' ? 'critical' : 'review');
  const kind = normalizeKind(r.object_kind ?? r.kind) ?? tax.kindOf(defectType) ?? kindFromId(r.object_id ?? r.objectId);
  const pos = r.position || {};
  const photoRaw = r.crop_uri ?? r.cropUri ?? r.media_uri ?? r.photo ?? r.file ?? null;
  const photo = photoUrl(photoRaw, photoBase);
  const truth = r.truth ? {
    key: r.truth.key,
    label: r.truth.key === undefined ? String(r.truth.raw ?? '') : tax.label(r.truth.key),
    raw: r.truth.raw ?? null,
    status: r.truth.status ?? null,
    statusRaw: r.truth.statusRaw ?? null,
  } : null;
  const top = r.top ?? null;
  const predClass = top ?? (route === 'not_observed' ? tax.noneKey : defectType ?? tax.okKey);
  const truthClass = truth ? (truth.key === null ? tax.okKey : truth.key) : undefined;
  const det = {
    id: String(r.id ?? r.detection_id ?? stableId('det', r.object_id, r.file, r.created_at, defectType)),
    frameId: r.frame_id ?? r.frameId ?? null,
    objectId: r.object_id ?? r.objectId ?? null,
    kind,
    defectType,
    defectLabel: tax.label(defectType),
    isDefect,
    severity,
    severityLabel: tax.severityLabel(severity),
    severityRank: SEVERITY_RANK[severity] || 0,
    confidence: toProb(r.confidence),
    bbox: normalizeBBox(r.bbox),
    photo,
    file: r.file ?? (photo ? basename(photo) : null),
    rationale: r.rationale ?? null,
    lat: coord(r.lat ?? pos.lat, -90, 90),
    lon: coord(r.lon ?? pos.lon, -180, 180),
    reviewState,
    reviewStateLabel: tax.reviewStateLabel(reviewState),
    route,
    routeLabel: tax.routeLabel(route),
    createdAt: toIso(r.created_at ?? r.createdAt ?? r.captured_at),
    isPending: reviewState === 'pending',
    isCritical: severity === 'critical',
    recommendation: tax.recommend(defectType, severity, { kind, status: route === 'not_observed' ? 'not_observed' : null }),
    probs: r.probs && typeof r.probs === 'object' ? r.probs : null,
    top,
    topP: toProb(r.top_p ?? r.topP),
    objectP: toProb(r.object_p ?? r.objectP),
    pCritical: toProb(r.p_critical ?? r.pCritical),
    truth,
    correct: truthClass === undefined || truthClass === null && !tax.okKey ? null : predClass === truthClass,
    origin: r.origin === 'label' ? 'label' : 'model',
    extra: r.extra ?? null,
    object: null,
  };
  return det;
}

/**
 * @typedef {Object} TimelineEvent
 * @property {string} id
 * @property {string|null} objectId
 * @property {string} type     observed|critical_alert_raised|status_changed|reviewed|work_order_opened|work_order_closed
 * @property {string} label    Russian event name
 * @property {string} text     one-line Russian summary
 * @property {string|null} at  ISO time
 * @property {string} source
 * @property {object} payload  raw payload (snake_case, as in Kafka)
 * @property {boolean} isCritical
 */

/** Accepts ObjectEventRow {event_id,type,payload,…} or a Kafka envelope {event_id,key,payload:{type}}. */
export function normalizeEvent(raw, tax) {
  const r = raw || {};
  const payload = r.payload && typeof r.payload === 'object' ? r.payload : {};
  const type = r.type ?? payload.type ?? 'unknown';
  const objectId = r.object_id ?? r.objectId ?? r.key ?? null;
  const at = toIso(r.occurred_at ?? r.at);
  return {
    id: String(r.event_id ?? r.id ?? stableId('ev', objectId, type, at, JSON.stringify(payload))),
    objectId,
    type,
    label: tax.eventLabel(type),
    text: eventText(type, payload, tax),
    at,
    source: r.source ?? '',
    payload: { type, ...payload },
    isCritical: type === 'critical_alert_raised' || payload.severity === 'critical',
  };
}

function eventText(type, p, tax) {
  switch (type) {
    case 'observed': {
      const conf = toProb(p.confidence);
      const c = conf != null ? ` · уверенность ${conf.toFixed(2)}` : '';
      return p.defect_type ? `${tax.label(p.defect_type)}${p.severity ? ` · ${tax.severityLabel(p.severity).toLowerCase()}` : ''}${c}` : `Норма${c}`;
    }
    case 'critical_alert_raised':
      return `${tax.label(p.defect_type || null)} · в обход очереди`;
    case 'status_changed':
      return `${tax.statusLabel(p.from)} → ${tax.statusLabel(p.to)}`;
    case 'reviewed': {
      const d = tax.dict.decisions[p.decision]?.label ?? p.decision;
      const reason = tax.rejectReasonLabel(p.reject_reason);
      return [d, reason, p.reviewer, p.comment].filter(Boolean).join(' · ');
    }
    case 'work_order_opened':
      return p.assignee ? `Бригада: ${p.assignee}` : 'Наряд создан';
    case 'work_order_closed':
      return p.after_photo_uri ? 'Работы выполнены, есть фото после' : 'Работы выполнены';
    default:
      return type;
  }
}

/**
 * @typedef {Object} WorkOrder
 * @property {string} id
 * @property {string} objectId
 * @property {'open'|'closed'} state
 * @property {string} stateLabel
 * @property {string|null} assignee
 * @property {string|null} openedAt
 * @property {string|null} closedAt
 * @property {string|null} afterPhoto
 * @property {string|null} beforePhoto
 * @property {string|null} task
 * @property {object|null} object
 */

function workOrdersFromEvents(events, extras = []) {
  const map = new Map();
  for (const e of events) {
    if (e.type !== 'work_order_opened' && e.type !== 'work_order_closed') continue;
    const id = String(e.payload.work_order_id ?? e.id);
    const wo = map.get(id) || { id, objectId: e.objectId, state: 'open', assignee: null, openedAt: null, closedAt: null, afterPhoto: null, beforePhoto: null, task: null, object: null };
    if (e.type === 'work_order_opened') { wo.openedAt = e.at; wo.assignee = e.payload.assignee ?? null; }
    else { wo.closedAt = e.at; wo.state = 'closed'; wo.afterPhoto = e.payload.after_photo_uri ?? null; }
    map.set(id, wo);
  }
  for (const x of extras || []) {
    const id = String(x.id ?? x.work_order_id);
    const wo = map.get(id) || { id, objectId: x.object_id ?? x.objectId, state: 'open', assignee: null, openedAt: null, closedAt: null, afterPhoto: null, beforePhoto: null, task: null, object: null };
    Object.assign(wo, {
      objectId: wo.objectId ?? x.object_id ?? x.objectId,
      assignee: wo.assignee ?? x.assignee ?? null,
      openedAt: wo.openedAt ?? toIso(x.opened_at),
      closedAt: wo.closedAt ?? toIso(x.closed_at),
      afterPhoto: wo.afterPhoto ?? x.after_photo_uri ?? null,
      beforePhoto: x.before_photo_uri ?? wo.beforePhoto,
      task: x.task ?? wo.task,
    });
    if (wo.closedAt) wo.state = 'closed';
    map.set(id, wo);
  }
  return [...map.values()].map((w) => ({ ...w, stateLabel: w.state === 'closed' ? 'Закрыт' : 'Открыт' }));
}

/**
 * @typedef {Object} InfraObject
 * @property {string} id
 * @property {'tksh'|'rsh'|null} kind
 * @property {string} kindLabel
 * @property {number|null} lat
 * @property {number|null} lon
 * @property {boolean} hasCoords
 * @property {string|null} address
 * @property {string|null} district
 * @property {'ok'|'suspected'|'defect'|'not_observed'} status   backend status
 * @property {string} statusLabel
 * @property {'ok'|'suspected'|'defect'|'critical'|'not_observed'} displayStatus  critical = suspected/defect with critical severity
 * @property {string} displayStatusLabel
 * @property {string|null} defectType
 * @property {string} defectLabel        «Норма» when null
 * @property {string|null} maxSeverity
 * @property {string} severityLabel
 * @property {number} severityRank
 * @property {string|null} lastSeenAt
 * @property {string|null} updatedAt
 * @property {Detection[]} detections    newest first
 * @property {TimelineEvent[]} events    chronological
 * @property {WorkOrder[]} workOrders
 * @property {Detection|null} latest     latest frame
 * @property {Detection|null} evidence   the frame to show: latest pending/defect frame, else latest
 * @property {string|null} photo         evidence photo URL
 * @property {number|null} confidence    evidence confidence
 * @property {number} pendingCount
 * @property {WorkOrder|null} openWorkOrder
 * @property {string} recommendation
 * @property {number} priority           sort key, lower = more urgent
 * @property {number} passes             number of frames
 * @property {object|null} truth         ground truth of the latest labelled frame
 * @property {boolean} detailsLoaded     api source: detections/history fetched
 * @property {Record<string,unknown>} extra
 */

/** @returns {InfraObject} */
export function normalizeObject(raw, tax) {
  const r = raw || {};
  const status = normalizeStatus(r.status) ?? 'not_observed';
  return {
    id: String(r.id ?? r.object_id),
    kind: normalizeKind(r.kind ?? r.object_kind) ?? kindFromId(r.id) ?? tax.kindOf(r.last_defect_type),
    kindLabel: '',
    lat: coord(r.lat, -90, 90),
    lon: coord(r.lon, -180, 180),
    hasCoords: false,
    address: r.address ?? null,
    district: r.district ?? null,
    status,
    statusLabel: '',
    displayStatus: status,
    displayStatusLabel: '',
    defectType: r.last_defect_type ?? r.defectType ?? null,
    defectLabel: '',
    maxSeverity: normalizeSeverity(r.max_severity ?? r.maxSeverity),
    severityLabel: '',
    severityRank: 0,
    lastSeenAt: toIso(r.last_seen_at ?? r.lastSeenAt),
    updatedAt: toIso(r.updated_at ?? r.updatedAt),
    detections: [],
    events: [],
    workOrders: [],
    latest: null,
    evidence: null,
    photo: null,
    confidence: null,
    pendingCount: 0,
    openWorkOrder: null,
    recommendation: '',
    priority: 99,
    passes: 0,
    truth: null,
    detailsLoaded: false,
    extra: r.extra ?? {},
  };
}

const byTimeDesc = (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '');
const byAtAsc = (a, b) => (a.at || '').localeCompare(b.at || '');

/** Recomputes every derived field of an object (labels, display status, evidence, priority…). */
export function deriveObject(o, tax) {
  o.detections.sort(byTimeDesc);
  o.events.sort(byAtAsc);
  const seen = o.detections.filter((d) => d.route !== 'not_observed' && d.route !== 'error');
  o.latest = o.detections[0] ?? null;
  o.evidence = o.detections.find((d) => d.isPending) ?? o.detections.find((d) => d.isDefect && d.reviewState !== 'reject') ?? o.latest;
  o.photo = o.evidence?.photo ?? null;
  o.confidence = o.evidence?.confidence ?? null;
  o.pendingCount = o.detections.filter((d) => d.isPending).length;
  o.passes = o.detections.length;
  if (!o.kind) o.kind = o.detections.find((d) => d.kind)?.kind ?? null;
  if (o.lat == null || o.lon == null) {
    const g = o.detections.find((d) => d.lat != null && d.lon != null);
    if (g) { o.lat = g.lat; o.lon = g.lon; }
  }
  o.hasCoords = o.lat != null && o.lon != null;
  if (!o.lastSeenAt && seen.length) o.lastSeenAt = seen[0].createdAt;
  if (!o.defectType && o.status !== 'ok') o.defectType = o.detections.find((d) => d.isDefect)?.defectType ?? null;
  if (!o.maxSeverity && o.defectType && o.status !== 'ok') {
    o.maxSeverity = o.detections.find((d) => d.defectType === o.defectType)?.severity ?? tax.defaultSeverity(o.defectType);
  }
  o.workOrders.sort((a, b) => (a.openedAt || '').localeCompare(b.openedAt || ''));
  o.openWorkOrder = o.workOrders.find((w) => w.state === 'open') ?? null;
  o.truth = o.detections.find((d) => d.truth)?.truth ?? null;

  const active = o.status === 'suspected' || o.status === 'defect';
  o.displayStatus = active && o.maxSeverity === 'critical' ? 'critical' : o.status;
  o.kindLabel = tax.kindLabel(o.kind);
  o.statusLabel = tax.statusLabel(o.status);
  o.displayStatusLabel = tax.statusLabel(o.displayStatus);
  // An ok object keeps last_defect_type in the backend; show «Норма» for it.
  o.defectLabel = active ? tax.label(o.defectType) : o.status === 'not_observed' ? tax.statusLabel('not_observed') : tax.label(null);
  o.severityRank = active ? SEVERITY_RANK[o.maxSeverity] || 0 : 0;
  o.severityLabel = active ? tax.severityLabel(o.maxSeverity) : 'нет';
  o.recommendation = active ? tax.recommend(o.defectType, o.maxSeverity, { kind: o.kind }) : tax.recommend(null, null, { status: o.status });
  o.priority = STATUS_ORDER.indexOf(o.displayStatus) * 10 + (4 - o.severityRank);
  return o;
}

/* ------------------------------------------------------------------ dataset */

/**
 * @typedef {Object} DatasetMeta
 * @property {'demo'|'api'|'file'} source
 * @property {boolean} demo        true = demo data, show the badge
 * @property {string|null} note    e.g. «Демо-данные, не датасет организаторов»
 * @property {string|null} title
 * @property {string|null} runId
 * @property {string|null} model
 * @property {string|null} generatedAt
 * @property {string} loadedAt
 * @property {string} photoBase
 * @property {boolean} empty       no objects at all (file source before import)
 */

/**
 * Builds a linked Dataset from raw arrays (api/demo shapes).
 * @param {{meta?:object, objects?:object[], detections?:object[], events?:object[], work_orders?:object[], workOrders?:object[], quality?:object, runs?:object[], user?:object}} input
 * @param {ReturnType<import('./taxonomy.js').createTaxonomy>} tax
 */
export function createDataset(input, tax) {
  const meta = {
    source: 'demo', demo: false, note: null, title: null, runId: null, model: null, generatedAt: null,
    photoBase: '', ...(input.meta || {}), loadedAt: new Date().toISOString(),
  };
  const ds = {
    meta,
    taxonomy: tax,
    objects: [],
    byId: new Map(),
    detections: [],
    unmatched: [],
    events: [],
    workOrders: [],
    quality: null,
    runs: input.runs || [],
    user: input.user || null,
  };
  for (const r of input.objects || []) {
    const o = normalizeObject(r, tax);
    if (!ds.byId.has(o.id)) { ds.objects.push(o); ds.byId.set(o.id, o); }
  }
  for (const r of input.detections || []) attachDetection(ds, normalizeDetection(r, tax, { photoBase: meta.photoBase }), { infer: true });
  for (const r of input.events || []) attachEvent(ds, normalizeEvent(r, tax));
  rebuildWorkOrders(ds, input.work_orders || input.workOrders);
  if (input.quality) ds.quality = normalizeQuality(input.quality, tax, input.runs);
  for (const o of ds.objects) deriveObject(o, tax);
  meta.empty = ds.objects.length === 0 && ds.unmatched.length === 0;
  return ds;
}

/** Empty dataset (file source before anything is imported). */
export function emptyDataset(tax, meta = {}) {
  return createDataset({ meta: { ...meta, empty: true } }, tax);
}

function ensureObject(ds, id, seed = {}) {
  let o = ds.byId.get(id);
  if (!o) {
    o = normalizeObject({ id, kind: seed.kind, lat: seed.lat, lon: seed.lon, address: seed.address, district: seed.district, status: 'not_observed' }, ds.taxonomy);
    ds.objects.push(o);
    ds.byId.set(id, o);
  } else {
    if (!o.kind && seed.kind) o.kind = seed.kind;
    if (o.lat == null && seed.lat != null) { o.lat = seed.lat; o.lon = seed.lon; }
    if (!o.address && seed.address) o.address = seed.address;
    if (!o.district && seed.district) o.district = seed.district;
  }
  return o;
}

/**
 * Creates or enriches an object from a seed {id, kind, lat, lon, address, district} (used by the importer).
 * @returns {InfraObject}
 */
export function upsertObject(ds, seed) {
  return ensureObject(ds, String(seed.id), { ...seed, kind: normalizeKind(seed.kind) ?? kindFromId(seed.id) });
}

/** Adds or replaces one detection row (api shape) and re-derives its object. @returns {Detection} */
export function upsertDetection(ds, raw) {
  const det = attachDetection(ds, normalizeDetection(raw, ds.taxonomy, { photoBase: ds.meta.photoBase }));
  if (det.object) deriveObject(det.object, ds.taxonomy);
  return det;
}

function attachDetection(ds, det, { infer = false } = {}) {
  const i = ds.detections.findIndex((d) => d.id === det.id);
  if (i >= 0) {
    const old = ds.detections[i];
    ds.detections[i] = det;
    if (old.object) old.object.detections = old.object.detections.filter((d) => d.id !== det.id);
  } else {
    ds.detections.push(det);
  }
  if (!det.objectId) { ds.unmatched = ds.unmatched.filter((d) => d.id !== det.id).concat(det); return det; }
  const o = ensureObject(ds, det.objectId, det);
  // Stub object created from a detection: infer status like the projection would.
  if (infer && o.status === 'not_observed' && !o.updatedAt && det.route !== 'not_observed' && det.route !== 'error') {
    o.status = det.isDefect ? (det.reviewState === 'confirm' ? 'defect' : 'suspected') : 'ok';
  }
  det.object = o;
  o.detections.push(det);
  return det;
}

function attachEvent(ds, ev) {
  if (ds.events.some((e) => e.id === ev.id)) return null;
  ds.events.push(ev);
  if (ev.objectId) ensureObject(ds, ev.objectId).events.push(ev);
  return ev;
}

function rebuildWorkOrders(ds, extras) {
  const prevExtras = extras ?? ds._woExtras;
  ds._woExtras = prevExtras;
  ds.workOrders = workOrdersFromEvents(ds.events, prevExtras);
  for (const o of ds.objects) o.workOrders = [];
  for (const w of ds.workOrders) {
    if (!w.objectId) continue;
    const o = ensureObject(ds, w.objectId);
    w.object = o;
    w.afterPhoto = photoUrl(w.afterPhoto, ds.meta.photoBase);
    w.beforePhoto = photoUrl(w.beforePhoto, ds.meta.photoBase) ?? o.detections.slice().reverse().find((d) => d.isDefect)?.photo ?? null;
    o.workOrders.push(w);
  }
}

/** Replaces/merges one object's details (api: /objects/{id} + /history). */
export function mergeObjectDetails(ds, { object, detections = [], events = [] }) {
  const tax = ds.taxonomy;
  const fresh = normalizeObject(object, tax);
  let o = ds.byId.get(fresh.id);
  if (!o) { o = fresh; ds.objects.push(o); ds.byId.set(o.id, o); }
  else {
    for (const k of ['kind', 'lat', 'lon', 'address', 'status', 'defectType', 'maxSeverity', 'lastSeenAt', 'updatedAt']) {
      if (fresh[k] != null) o[k] = fresh[k];
    }
    if (fresh.district) o.district = fresh.district;
  }
  for (const r of detections) attachDetection(ds, normalizeDetection(r, tax, { photoBase: ds.meta.photoBase }));
  for (const r of events) attachEvent(ds, normalizeEvent(r, tax));
  rebuildWorkOrders(ds);
  o.detailsLoaded = true;
  return deriveObject(o, tax);
}

/* ------------------------------------------------------------------ projection (local) */

function nowIso() { return new Date().toISOString(); }

function emit(ds, objectId, type, payload, at, source) {
  const ev = normalizeEvent({
    event_id: stableId('ev', objectId, type, at, JSON.stringify(payload), ds.events.length),
    object_id: objectId, type, payload, source, occurred_at: at,
  }, ds.taxonomy);
  attachEvent(ds, ev);
  return ev;
}

function changeStatus(ds, o, to, reason, at, source, out) {
  if (o.status === to) return;
  out.push(emit(ds, o.id, 'status_changed', { from: o.status, to, reason }, at, source));
  o.status = to;
  o.updatedAt = at;
}

/**
 * Applies one object event to the dataset.
 * @param {object} raw  event row or Kafka envelope
 * @param {{project?: boolean}} [opts] project=true (local sources) also emits the follow-up
 *   status_changed events like the backend projection; false (SSE) trusts server events.
 * @returns {TimelineEvent[]} events added (the event itself + follow-ups)
 */
export function applyEvent(ds, raw, { project = false } = {}) {
  const tax = ds.taxonomy;
  const ev = normalizeEvent(raw, tax);
  if (!attachEvent(ds, ev)) return [];
  const out = [ev];
  const o = ev.objectId ? ensureObject(ds, ev.objectId) : null;
  if (!o) return out;
  const p = ev.payload;
  // undated frames (most dataset photos have no EXIF time) stay undated: no invented «now»
  const at = ev.at || (ev.type === 'observed' || ev.type === 'critical_alert_raised' ? null : nowIso());
  const src = ev.source || 'local';
  switch (ev.type) {
    case 'observed':
      if (at && (!o.lastSeenAt || at > o.lastSeenAt)) o.lastSeenAt = at;
      if (at) o.updatedAt = at;
      if (p.defect_type) { o.defectType = p.defect_type; o.maxSeverity = normalizeSeverity(p.severity); }
      if (project) {
        const next = o.status === 'defect' ? 'defect' : p.defect_type ? 'suspected' : o.status === 'suspected' ? 'suspected' : 'ok';
        changeStatus(ds, o, next, 'observation', at, src, out);
      }
      break;
    case 'status_changed':
      o.status = normalizeStatus(p.to) ?? o.status;
      o.updatedAt = at;
      break;
    case 'reviewed': {
      const det = p.detection_id ? ds.detections.find((d) => d.id === String(p.detection_id)) : null;
      if (det) {
        det.reviewState = p.decision;
        det.reviewStateLabel = tax.reviewStateLabel(p.decision);
        det.isPending = false;
      }
      if (project) {
        let next = o.status;
        if (p.decision === 'confirm') next = 'defect';
        else if (p.decision === 'reject') next = o.detections.some((d) => d.isPending) ? o.status : 'ok';
        changeStatus(ds, o, next, 'review', at, src, out);
      }
      break;
    }
    case 'work_order_closed':
      if (project) changeStatus(ds, o, 'ok', 'work order closed', at, src, out);
      break;
    default:
      break;
  }
  if (ev.type.startsWith('work_order')) rebuildWorkOrders(ds);
  deriveObject(o, tax);
  return out;
}

/**
 * Adds a detection the way the backend projection does: stores it, emits `observed`
 * (+ `critical_alert_raised` for critical) and applies status rules. Used by the file
 * importer and the demo live ticker. Frames with route not_observed/error are stored
 * without events (the worker does not publish them).
 * @returns {{detection: Detection, events: TimelineEvent[]}}
 */
export function ingestDetection(ds, raw, { source = 'local' } = {}) {
  const tax = ds.taxonomy;
  const det = attachDetection(ds, normalizeDetection(raw, tax, { photoBase: ds.meta.photoBase }));
  const events = [];
  if (det.objectId && det.route !== 'not_observed' && det.route !== 'error') {
    const at = det.createdAt;
    const base = { detection_id: det.id, frame_id: det.frameId, defect_type: det.defectType, severity: det.severity, confidence: det.confidence };
    events.push(...applyEvent(ds, { object_id: det.objectId, type: 'observed', payload: base, source, occurred_at: at, event_id: stableId('obs', det.id) }, { project: true }));
    if (det.isCritical) {
      events.push(...applyEvent(ds, { object_id: det.objectId, type: 'critical_alert_raised', payload: { detection_id: det.id, defect_type: det.defectType }, source, occurred_at: at, event_id: stableId('crit', det.id) }, { project: true }));
    }
  }
  if (det.object) deriveObject(det.object, tax);
  return { detection: det, events };
}

/**
 * Local dispatcher decision (demo/file sources): same effect as POST /api/objects/{id}/reviews.
 * @param {{detectionId?:string, decision:'confirm'|'reject'|'need_recapture', rejectReason?:string|{other:string}, comment?:string, reviewer?:string, at?:string}} r
 * @returns {TimelineEvent[]}
 */
export function localReview(ds, objectId, r) {
  return applyEvent(ds, {
    object_id: objectId,
    type: 'reviewed',
    source: 'local.review',
    occurred_at: r.at || nowIso(),
    payload: {
      detection_id: r.detectionId ?? null,
      decision: r.decision,
      reject_reason: r.rejectReason ?? null,
      reviewer: r.reviewer ?? 'dispatcher',
      comment: r.comment ?? null,
    },
  }, { project: true });
}

/* ------------------------------------------------------------------ selectors */

/**
 * Filtered + sorted objects.
 * @param {{status?:string|string[], displayStatus?:string|string[], kind?:string, severity?:string, district?:string,
 *          defectType?:string, q?:string, hasCoords?:boolean, pendingOnly?:boolean,
 *          sort?:'priority'|'lastSeen'|'id'|'severity', limit?:number}} [f]
 * @returns {InfraObject[]}
 */
export function selectObjects(ds, f = {}) {
  const inSet = (v, want) => want == null || (Array.isArray(want) ? want.includes(v) : v === want);
  const q = f.q ? norm(f.q) : null;
  let list = ds.objects.filter((o) => inSet(o.status, f.status) && inSet(o.displayStatus, f.displayStatus)
    && (!f.kind || o.kind === f.kind)
    && (!f.severity || o.maxSeverity === f.severity)
    && (!f.district || o.district === f.district)
    && (!f.defectType || o.defectType === f.defectType)
    && (f.hasCoords == null || o.hasCoords === f.hasCoords)
    && (!f.pendingOnly || o.pendingCount > 0)
    && (!q || norm(`${o.id} ${o.address || ''} ${o.district || ''} ${o.defectLabel}`).includes(q)));
  const sorters = {
    priority: (a, b) => a.priority - b.priority || (b.lastSeenAt || '').localeCompare(a.lastSeenAt || '') || a.id.localeCompare(b.id),
    lastSeen: (a, b) => (b.lastSeenAt || '').localeCompare(a.lastSeenAt || ''),
    id: (a, b) => a.id.localeCompare(b.id, 'ru', { numeric: true }),
    severity: (a, b) => b.severityRank - a.severityRank || a.priority - b.priority,
  };
  list.sort(sorters[f.sort || 'priority'] || sorters.priority);
  if (f.limit) list = list.slice(0, f.limit);
  return list;
}

/** @returns {InfraObject|null} */
export function selectObject(ds, id) {
  return ds.byId.get(String(id)) ?? null;
}

/**
 * Review queue: pending detections, critical → high → medium → rest, then oldest first
 * (same order as GET /api/queue). Each item is a Detection with `.object` set (null = unmatched).
 * @returns {Detection[]}
 */
export function selectQueue(ds) {
  const rank = (d) => ({ critical: 0, high: 1, medium: 2 }[d.severity] ?? 3);
  return ds.detections.filter((d) => d.isPending)
    .sort((a, b) => rank(a) - rank(b) || (a.createdAt || '').localeCompare(b.createdAt || ''));
}

/**
 * Aggregates for the summary page.
 * @returns {{total:number, byStatus:Record<string,number>, byDisplayStatus:Record<string,number>,
 *   byKind:Record<string,{total:number, byDisplayStatus:Record<string,number>}>, bySeverity:Record<string,number>,
 *   byDefect:{key:string,label:string,count:number}[], byDistrict:{district:string,total:number,critical:number,defect:number,suspected:number,ok:number,not_observed:number}[],
 *   pending:number, criticalOpen:number, unmatched:number, detections:number, frames:{byRoute:Record<string,number>},
 *   workOrders:{open:number, closed:number}, withCoords:number, observedShare:number|null, observed30d:number, lastUpdate:string|null}}
 */
export function selectStats(ds) {
  const objs = ds.objects;
  const zero = () => ({ ok: 0, suspected: 0, defect: 0, critical: 0, not_observed: 0 });
  const byStatus = { ok: 0, suspected: 0, defect: 0, not_observed: 0 };
  const byDisplayStatus = zero();
  const byKind = {};
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  const districts = new Map();
  const defects = {};
  const since = Date.now() - 30 * 864e5;
  let withCoords = 0, observed30d = 0, lastUpdate = null;
  for (const o of objs) {
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    byDisplayStatus[o.displayStatus] = (byDisplayStatus[o.displayStatus] || 0) + 1;
    const k = o.kind || 'unknown';
    byKind[k] ||= { total: 0, byDisplayStatus: zero() };
    byKind[k].total++;
    byKind[k].byDisplayStatus[o.displayStatus]++;
    if (o.severityRank) bySeverity[o.maxSeverity]++;
    if (o.severityRank && o.defectType) defects[o.defectType] = (defects[o.defectType] || 0) + 1;
    if (o.district) {
      const d = districts.get(o.district) || { district: o.district, total: 0, ...zero() };
      d.total++; d[o.displayStatus]++;
      districts.set(o.district, d);
    }
    if (o.hasCoords) withCoords++;
    if (o.lastSeenAt && Date.parse(o.lastSeenAt) >= since) observed30d++;
    if (o.updatedAt && (!lastUpdate || o.updatedAt > lastUpdate)) lastUpdate = o.updatedAt;
  }
  return {
    total: objs.length,
    byStatus,
    byDisplayStatus,
    byKind,
    bySeverity,
    byDefect: Object.entries(defects).map(([key, count]) => ({ key, label: ds.taxonomy.label(key), count })).sort((a, b) => b.count - a.count),
    byDistrict: [...districts.values()].sort((a, b) => b.critical - a.critical || b.defect - a.defect || b.total - a.total),
    pending: ds.detections.filter((d) => d.isPending).length,
    criticalOpen: byDisplayStatus.critical,
    unmatched: ds.unmatched.length,
    detections: ds.detections.length,
    frames: { byRoute: countBy(ds.detections, (d) => d.route) },
    workOrders: { open: ds.workOrders.filter((w) => w.state === 'open').length, closed: ds.workOrders.filter((w) => w.state === 'closed').length },
    withCoords,
    observedShare: objs.length ? (objs.length - byStatus.not_observed) / objs.length : null,
    observed30d,
    lastUpdate,
  };
}

/**
 * Event feed. With objectId: that object's history (chronological by default);
 * without: global feed (newest first by default).
 * @param {{objectId?:string, limit?:number, types?:string[], order?:'asc'|'desc'}} [f]
 * @returns {TimelineEvent[]}
 */
export function selectTimeline(ds, f = {}) {
  let list = f.objectId ? (selectObject(ds, f.objectId)?.events ?? []).slice() : ds.events.slice();
  if (f.types) list = list.filter((e) => f.types.includes(e.type));
  const order = f.order || (f.objectId ? 'asc' : 'desc');
  list.sort(order === 'asc' ? byAtAsc : (a, b) => byAtAsc(b, a));
  return f.limit ? list.slice(0, f.limit) : list;
}

/** «Было / сейчас»: the earliest defect frame and the latest frame of an object (either may be null). */
export function selectBeforeAfter(obj) {
  if (!obj || obj.detections.length < 2) return { before: null, after: obj?.latest ?? null };
  const chron = obj.detections.slice().reverse();
  return { before: chron.find((d) => d.isDefect) ?? chron[0], after: obj.detections[0] };
}

/** Points for a map; empty when the data has no coordinates (then: no map, table only). */
export function selectMapPoints(ds, f = {}) {
  return selectObjects(ds, { ...f, hasCoords: true }).map((o) => ({
    id: o.id, lat: o.lat, lon: o.lon, kind: o.kind, displayStatus: o.displayStatus, label: o.displayStatusLabel,
    defectLabel: o.defectLabel, address: o.address, object: o,
  }));
}

/** [[south, west], [north, east]] of all coordinates, or null. */
export function selectBounds(ds) {
  const pts = ds.objects.filter((o) => o.hasCoords);
  if (!pts.length) return null;
  const lats = pts.map((o) => o.lat), lons = pts.map((o) => o.lon);
  return [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]];
}

/** @param {{state?:'open'|'closed'}} [f] @returns {WorkOrder[]} */
export function selectWorkOrders(ds, f = {}) {
  return ds.workOrders.filter((w) => !f.state || w.state === f.state)
    .sort((a, b) => (b.openedAt || '').localeCompare(a.openedAt || ''));
}

/** Distinct values for filter dropdowns. */
export function selectFacets(ds) {
  const uniq = (fn) => [...new Set(ds.objects.map(fn).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'ru'));
  return {
    kinds: uniq((o) => o.kind),
    districts: uniq((o) => o.district),
    defectTypes: uniq((o) => o.defectType).map((key) => ({ key, label: ds.taxonomy.label(key) })),
    statuses: STATUS_ORDER.filter((s) => ds.objects.some((o) => o.displayStatus === s)),
    severities: SEVERITY_ORDER.filter((s) => ds.objects.some((o) => o.maxSeverity === s && o.severityRank)),
    hasCoords: ds.objects.some((o) => o.hasCoords),
    hasHistory: ds.objects.some((o) => o.passes > 1),
    hasBBoxes: ds.detections.some((d) => d.bbox),
    hasTruth: ds.detections.some((d) => d.truth),
  };
}

/* ------------------------------------------------------------------ quality */

/**
 * @typedef {Object} Quality  evaluate.py report.json shape + derived helpers
 * @property {boolean} available
 * @property {string|null} runId
 * @property {{run_id:string, modified:string}[]} runs
 * @property {number} images
 * @property {number} evaluated
 * @property {{accuracy:number|null, macroF1:number|null, defectRecall:number|null, defectsTotal:number, defectsMissed:number,
 *   falseAlarmRate:number|null, autoShare:number|null, autoPrecision:number|null, toHumansShare:number|null}} kpi
 * @property {{key:string,label:string,support:number,precision:number,recall:number,f1:number}[]} perClass
 * @property {{labels:string[], names:string[], matrix:number[][], max:number, rowTotals:number[], colTotals:number[]}|null} confusion  rows = truth, cols = model
 * @property {{autoOk:number, off:boolean, current:boolean, autoShare:number, toHumansShare:number, defectsMissed:number, defectRecall:number|null}[]} thresholdSweep
 * @property {{file:string, truth:string, predicted:string, route:string, mediaUri:string|null, objectId:string|null}[]} missed
 * @property {Record<string,number>} routes
 * @property {Record<string,number>} unmappedLabels
 * @property {Record<string,Record<string,number>>} statusVsRoute
 * @property {number|null} costUsd
 * @property {number|null} costPerImage
 * @property {number|null} avgLatencyS
 * @property {string|null} model
 * @property {object} thresholds
 * @property {boolean} demo
 * @property {boolean} computed   true = computed in the browser from imported rows
 * @property {object} raw
 */

/** Normalizes report.json (evaluate.py) or the {runs, report} wrapper from /api/quality. */
export function normalizeQuality(input, tax, runs = []) {
  if (!input) return null;
  const rep = input.report !== undefined && (input.runs || input.report === null) ? input.report : input;
  const runList = input.runs || runs || [];
  if (!rep) return { available: false, runs: runList, runId: null };
  const th = rep.thresholds || tax.thresholds;
  const conf = rep.confusion && Array.isArray(rep.confusion.matrix) ? rep.confusion : null;
  let confusion = null;
  if (conf) {
    const m = conf.matrix.map((row) => row.map((v) => +v || 0));
    confusion = {
      labels: conf.labels,
      names: conf.names || conf.labels.map((k) => tax.label(k)),
      matrix: m,
      max: Math.max(0, ...m.flat()),
      rowTotals: m.map((r) => r.reduce((a, b) => a + b, 0)),
      colTotals: conf.labels.map((_, j) => m.reduce((a, r) => a + (r[j] || 0), 0)),
    };
  }
  const images = rep.images ?? rep.evaluated ?? 0;
  return {
    available: true,
    runId: rep.run_id ?? null,
    runs: runList,
    images,
    evaluated: rep.evaluated ?? 0,
    noLabel: rep.no_label ?? 0,
    apiErrors: rep.api_errors ?? 0,
    kpi: {
      accuracy: rep.accuracy ?? null,
      macroF1: rep.macro_f1 ?? null,
      defectRecall: rep.defect_recall ?? null,
      defectsTotal: rep.defects_total ?? 0,
      defectsMissed: rep.defects_missed ?? 0,
      falseAlarmRate: rep.false_alarm_rate ?? null,
      autoShare: rep.auto_share ?? null,
      autoPrecision: rep.auto_precision ?? null,
      toHumansShare: rep.to_humans_share ?? null,
    },
    perClass: Object.entries(rep.per_class || {}).map(([key, v]) => ({
      key, label: v.label || tax.label(key), support: v.support ?? 0, precision: v.precision ?? 0, recall: v.recall ?? 0, f1: v.f1 ?? 0,
    })),
    confusion,
    thresholdSweep: (rep.threshold_sweep || []).map((w) => ({
      autoOk: w.auto_ok, off: w.auto_ok > 1, current: Math.abs(w.auto_ok - th.auto_ok) < 1e-9,
      autoShare: w.auto_share, toHumansShare: w.to_humans_share, defectsMissed: w.defects_missed, defectRecall: w.defect_recall ?? null,
    })),
    missed: (rep.missed_examples || []).map((x) => ({
      file: x.file, truth: x.truth, predicted: x.predicted, route: x.route, mediaUri: x.media_uri ?? null, objectId: x.object_id ?? null,
    })),
    routes: rep.routes || {},
    unmappedLabels: rep.unmapped_labels || {},
    statusVsRoute: rep.status_vs_route || {},
    costUsd: rep.cost_usd ?? null,
    costPerImage: rep.cost_usd != null && images ? rep.cost_usd / images : null,
    wallS: rep.wall_s ?? null,
    avgLatencyS: rep.avg_latency_s ?? null,
    model: rep.model ?? null,
    thresholds: th,
    demo: !!rep.demo,
    note: rep.note ?? null,
    computed: !!rep.computed,
    raw: rep,
  };
}

/** Routing rule from ml/decision.py choose_route (replayed for the threshold sweep). */
export function chooseRoute(top, topP, objectP, pCrit, severity, tax, th) {
  const ok = tax.classes[top]?.ok ?? (top == null);
  if (top === tax.noneKey || (ok && objectP < th.object_min)) return 'not_observed';
  if (ok && topP >= th.auto_ok && pCrit < th.critical_prob) return 'auto_ok';
  return severity === 'critical' ? 'critical' : 'review';
}

/**
 * Quality report computed in the browser from detections with ground truth (file import without report.json).
 * Mirrors ml/evaluate.py. Returns the report.json shape (feed it to normalizeQuality) or null.
 */
export function computeQualityReport(detections, tax, { runId = 'import', model = null } = {}) {
  const okKey = tax.okKey;
  const flagged = (route) => route === 'review' || route === 'critical';
  const unmapped = {};
  let noLabel = 0, errors = 0;
  const pairs = [];
  for (const d of detections) {
    if (d.origin === 'label') continue;
    if (!d.truth) { noLabel++; continue; }
    if (d.route === 'error') { errors++; continue; }
    if (d.truth.key === undefined) { unmapped[d.truth.raw] = (unmapped[d.truth.raw] || 0) + 1; continue; }
    const truth = d.truth.key ?? okKey;
    const pred = d.top ?? (d.route === 'not_observed' ? tax.noneKey : d.defectType ?? okKey);
    if (truth == null || pred == null) continue;
    pairs.push([truth, pred, d]);
  }
  const n = pairs.length;
  if (!n) return null;
  const keys = [...new Set([...Object.keys(tax.classes), ...pairs.flatMap(([t, p]) => [t, p])])];
  const isOk = (k) => tax.isOk(k);
  const cm = Object.fromEntries(keys.map((t) => [t, Object.fromEntries(keys.map((p) => [p, 0]))]));
  for (const [t, p] of pairs) cm[t][p]++;
  const perClass = {};
  for (const k of keys) {
    const tp = cm[k][k];
    const fp = keys.reduce((a, t) => a + (t !== k ? cm[t][k] : 0), 0);
    const fn = keys.reduce((a, p) => a + (p !== k ? cm[k][p] : 0), 0);
    if (!(tp + fp + fn)) continue;
    const pr = tp + fp ? tp / (tp + fp) : 0, rc = tp + fn ? tp / (tp + fn) : 0;
    const f1 = pr + rc ? 2 * pr * rc / (pr + rc) : 0;
    perClass[k] = { label: tax.label(k === okKey ? null : k), support: tp + fn, precision: +pr.toFixed(3), recall: +rc.toFixed(3), f1: +f1.toFixed(3) };
  }
  const supported = Object.values(perClass).filter((v) => v.support);
  const defects = pairs.filter(([t]) => !isOk(t));
  const oks = pairs.filter(([t]) => isOk(t));
  const missed = defects.filter(([, , d]) => !flagged(d.route));
  const auto = pairs.filter(([, , d]) => d.route === 'auto_ok');
  const r4 = (v) => +v.toFixed(4);
  const canSweep = pairs.every(([, , d]) => d.topP != null || d.confidence != null);
  const sweep = !canSweep ? [] : [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.01].map((autoOk) => {
    const th = { ...tax.thresholds, auto_ok: autoOk };
    const routes = pairs.map(([, p, d]) => chooseRoute(p, d.topP ?? d.confidence, d.objectP ?? 1, d.pCritical ?? (d.isCritical ? 1 : 0), d.severity ?? tax.defaultSeverity(p), tax, th));
    const fl = routes.map(flagged);
    const miss = pairs.filter(([t], i) => !isOk(t) && !fl[i]).length;
    return {
      auto_ok: autoOk,
      auto_share: r4(routes.filter((r) => r === 'auto_ok').length / n),
      to_humans_share: r4(fl.filter(Boolean).length / n),
      defects_missed: miss,
      defect_recall: defects.length ? r4(1 - miss / defects.length) : null,
    };
  });
  const labels = keys.filter((k) => keys.some((p) => cm[k][p] || cm[p][k]));
  const routes = countBy(detections.filter((d) => d.origin !== 'label'), (d) => d.route);
  return {
    run_id: runId,
    computed: true,
    images: detections.filter((d) => d.origin !== 'label').length,
    evaluated: n,
    no_label: noLabel,
    api_errors: errors,
    unmapped_labels: unmapped,
    accuracy: r4(pairs.filter(([t, p]) => t === p).length / n),
    macro_f1: supported.length ? r4(supported.reduce((a, v) => a + v.f1, 0) / supported.length) : 0,
    defect_recall: defects.length ? r4((defects.length - missed.length) / defects.length) : null,
    false_alarm_rate: oks.length ? r4(oks.filter(([, , d]) => flagged(d.route)).length / oks.length) : null,
    defects_total: defects.length,
    defects_missed: missed.length,
    auto_share: r4(auto.length / n),
    auto_precision: auto.length ? r4(auto.filter(([t]) => isOk(t)).length / auto.length) : null,
    to_humans_share: r4(pairs.filter(([, , d]) => flagged(d.route)).length / n),
    routes,
    per_class: perClass,
    threshold_sweep: sweep,
    confusion: { labels, names: labels.map((k) => tax.label(k === okKey ? null : k)), matrix: labels.map((t) => labels.map((p) => cm[t][p])) },
    missed_examples: missed.slice(0, 50).map(([t, , d]) => ({
      file: d.file, truth: tax.label(t), predicted: tax.label(d.top ?? d.defectType), route: d.route, media_uri: d.photo, object_id: d.objectId,
    })),
    status_vs_route: {},
    cost_usd: null,
    wall_s: null,
    avg_latency_s: null,
    model,
    thresholds: tax.thresholds,
  };
}

/** The quality report of the dataset (or null when there is none). */
export function selectQuality(ds) {
  return ds.quality;
}

/* ------------------------------------------------------------------ formatting */

const MSK = 'Europe/Moscow';
function parts(iso, opts) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('ru-RU', { timeZone: MSK, ...opts }).format(d);
}

/** Display formatters (Moscow time, brand voice: «26.11 10:42», «0.95», «84.6%»). */
export const fmt = {
  /** 0.953 → "0.95"; null → "нет" */
  conf: (v) => (v == null ? 'нет' : Number(v).toFixed(2)),
  /** 0.846 → "84.6%" */
  pct: (v, digits = 1) => (v == null ? 'нет' : `${(v * 100).toFixed(digits).replace('.', ',')}%`),
  /** ISO → "26.11 10:42" */
  dateTime: (iso) => parts(iso, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })?.replace(',', '') ?? 'нет',
  /** ISO → "26.11.2026" */
  date: (iso) => parts(iso, { day: '2-digit', month: '2-digit', year: 'numeric' }) ?? 'нет',
  /** ISO → "10:42" */
  time: (iso) => parts(iso, { hour: '2-digit', minute: '2-digit' }) ?? 'нет',
  /** 55.75160, 37.71720 */
  coords: (lat, lon) => (lat == null || lon == null ? 'нет координат' : `${lat.toFixed(5)}, ${lon.toFixed(5)}`),
  /** 0.00016 → "$0.00016" */
  usd: (v) => (v == null ? 'нет' : `$${v < 0.01 ? v.toPrecision(2) : v.toFixed(2)}`),
  /** Integer with thin spaces: 12345 → "12 345" */
  int: (v) => (v == null ? 'нет' : Math.round(v).toLocaleString('ru-RU')),
};
