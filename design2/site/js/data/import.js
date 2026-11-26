/**
 * Import of results/annotation files into the domain model.
 *
 * Accepted inputs (auto-detected):
 *   - CSV / TSV / semicolon CSV (organizers' annotation table, ML results table)
 *   - XLSX (first sheet; needs SheetJS, loaded on demand from js/vendor/ or cdnjs)
 *   - JSON array of rows, JSONL (ml/runs/<run>/predictions.jsonl as is)
 *   - native JSON  { format: "poputno.results", rows|results|detections: [...], objects?, quality? }
 *   - dataset dump { objects: [...], detections: [...], events?: [...] } (API/demo shapes)
 *   - quality report (ml/runs/<run>/report.json or /api/quality response)
 *   - taxonomy (data/taxonomy.json / ml/taxonomy.json shape: { classes: {...} })
 *   - COCO-style { images, annotations, categories }
 * Column names are matched flexibly (ru/en synonyms); nothing is required except one row.
 * Missing coordinates, timestamps, bbox, object ids are fine.
 */

import { norm, toNumber, toProb, toIso, fileKey, basename, stableId } from './util.js';
import {
  normalizeKind, normalizeSeverity, normalizeStatus, emptyDataset, createDataset, ingestDetection,
  localReview, upsertObject, deriveObject, computeQualityReport, normalizeQuality,
} from './model.js';
import { createTaxonomy } from './taxonomy.js';

/* ------------------------------------------------------------------ column synonyms */

/**
 * Canonical field → header synonyms (compared after norm(): lowercase, ё→е, punctuation → "_").
 * Order of fields matters: the first field that claims a column wins.
 */
export const FIELD_SYNONYMS = {
  detectionId: ['detection_id', 'det_id'],
  file: ['file', 'filename', 'file_name', 'image', 'image_name', 'image_file', 'img', 'img_name', 'photo', 'photo_name',
    'picture', 'path', 'image_path', 'img_path', 'filepath', 'файл', 'имя_файла', 'фото', 'фотография', 'изображение',
    'снимок', 'кадр', 'название_файла', 'имя_фото', 'путь'],
  mediaUri: ['media_uri', 'crop_uri', 'image_url', 'photo_url', 'url', 'uri', 'src', 'ссылка', 'ссылка_на_фото'],
  objectId: ['object_id', 'objectid', 'obj_id', 'asset_id', 'asset', 'registry_id', 'inventory_id', 'object', 'id_объекта',
    'объект', 'номер_объекта', 'ид_объекта', 'идентификатор', 'идентификатор_объекта', 'инвентарный_номер', 'инв_номер',
    'номер', 'номер_колодца', 'номер_опоры', 'код_объекта', 'id'],
  lat: ['lat', 'latitude', 'широта', 'y_coord', 'gps_lat', 'position_lat', 'coordinates_lat', 'location_lat', 'coords_lat', 'geo_lat'],
  lon: ['lon', 'lng', 'long', 'longitude', 'долгота', 'x_coord', 'gps_lon', 'gps_lng', 'position_lon', 'coordinates_lon',
    'coordinates_lng', 'location_lon', 'location_lng', 'coords_lon', 'geo_lon'],
  coords: ['coordinates', 'coords', 'coord', 'координаты', 'gps', 'location', 'position', 'geo', 'point', 'местоположение', 'геопозиция', 'latlon', 'lat_lon'],
  kind: ['object_kind', 'object_type', 'kind', 'тип_объекта', 'вид_объекта', 'класс_объекта', 'тип_инфраструктуры', 'asset_type', 'object_class'],
  truth: ['label', 'true_label', 'gt', 'gt_label', 'ground_truth', 'truth', 'true_class', 'target', 'annotation', 'defect',
    'defect_label', 'damage', 'damage_type', 'вид_повреждения', 'тип_повреждения', 'повреждение', 'дефект', 'тип_дефекта',
    'вид_дефекта', 'разметка', 'метка', 'класс', 'категория_дефекта', 'неисправность', 'описание_повреждения'],
  truthStatus: ['status', 'state', 'condition', 'gt_status', 'true_status', 'статус', 'состояние', 'техническое_состояние',
    'тех_состояние', 'категория', 'категория_состояния', 'оценка_состояния', 'статус_повреждения'],
  pred: ['pred', 'prediction', 'predicted', 'pred_class', 'pred_label', 'predicted_class', 'predicted_label', 'defect_type',
    'model_class', 'model_label', 'класс_модели', 'предсказание', 'ответ_модели', 'прогноз'],
  top: ['top', 'top_class', 'top1'],
  confidence: ['confidence', 'conf', 'score', 'prob', 'probability', 'pred_conf', 'pred_score', 'уверенность', 'вероятность', 'достоверность'],
  topP: ['top_p', 'top_prob'],
  objectP: ['object_p', 'object_prob', 'visibility', 'видимость'],
  pCritical: ['p_critical', 'critical_prob'],
  severity: ['severity', 'danger', 'danger_level', 'risk', 'priority', 'опасность', 'уровень_опасности', 'критичность', 'приоритет', 'срочность'],
  route: ['route', 'routing', 'decision_route', 'маршрут', 'маршрутизация'],
  rationale: ['rationale', 'explanation', 'reason', 'comment', 'note', 'description', 'объяснение', 'комментарий', 'примечание', 'описание'],
  timestamp: ['created_at', 'captured_at', 'timestamp', 'datetime', 'date_time', 'date', 'time', 'shot_at', 'дата', 'время',
    'дата_съемки', 'дата_время', 'дата_и_время', 'время_съемки', 'дата_фото'],
  address: ['address', 'addr', 'street', 'адрес', 'улица', 'место'],
  district: ['district', 'area', 'region', 'район', 'округ', 'административный_округ', 'зона'],
  bbox: ['bbox', 'box', 'rect', 'рамка'],
  bboxX: ['bbox_x', 'box_x'], bboxY: ['bbox_y', 'box_y'], bboxW: ['bbox_w', 'box_w', 'bbox_width'],
  bboxH: ['bbox_h', 'box_h', 'bbox_height'],
  x1: ['x1', 'xmin', 'x_min', 'left'], y1: ['y1', 'ymin', 'y_min', 'top_px'], x2: ['x2', 'xmax', 'x_max', 'right'], y2: ['y2', 'ymax', 'y_max', 'bottom'],
  imgW: ['image_width', 'img_width', 'img_w', 'width', 'ширина'], imgH: ['image_height', 'img_height', 'img_h', 'height', 'высота'],
  reviewState: ['review_state', 'review', 'решение', 'решение_диспетчера'],
  probs: ['probs', 'probabilities', 'class_probs', 'вероятности'],
  objectPresent: ['has_object', 'object_present', 'объект_виден'],
  passId: ['pass_id', 'pass', 'trip_id', 'проезд', 'рейс'],
  vehicleId: ['vehicle_id', 'vehicle', 'car', 'машина', 'автомобиль', 'борт'],
};

/** Columns that only an ML output has: their presence means "model results", not "labels only". */
const MODEL_FIELDS = ['pred', 'top', 'confidence', 'topP', 'route', 'probs', 'objectP', 'pCritical'];

const FUZZY = [
  ['file', /файл|фото|изображ|image|photo|file|снимок|кадр/],
  ['lat', /широт|latitude|(^|_)lat($|_)/],
  ['lon', /долгот|longitude|(^|_)(lon|lng)($|_)/],
  ['coords', /координат|coord|gps/],
  ['objectId', /(^|_)id($|_)|идентиф|номер|инв/],
  ['kind', /тип_объект|вид_объект|object_type/],
  ['truth', /поврежд|дефект|damage|defect|label|метк|разметк/],
  ['truthStatus', /статус|состояни|status|condition/],
  ['confidence', /уверен|вероятн|confid/],
  ['severity', /опасн|критичн|severity|danger/],
  ['timestamp', /дата|время|date|time/],
  ['address', /адрес|address|улиц/],
  ['district', /район|округ|district/],
];

/** ml/worker.py bookkeeping columns: known, not shown as "unmapped". */
const IGNORED = new Set(['sha256', 'cached', 'latency', 'cost', 'spent', 'path', 'severity_score', 'questions_hash', 'error', '_row']);

const SYN_LOOKUP = (() => {
  const m = new Map();
  for (const [field, list] of Object.entries(FIELD_SYNONYMS)) for (const s of list) if (!m.has(norm(s))) m.set(norm(s), field);
  return m;
})();

/**
 * Maps table headers to canonical fields.
 * @param {string[]} headers
 * @param {Record<string,string>} [overrides] field → exact header, wins over auto-detection
 * @param {object[]} [sampleRows] used to disambiguate generic columns like "type"/"class"
 * @returns {{mapping: Record<string,string>, unmapped: string[], ignored: string[]}}
 */
export function mapColumns(headers, overrides = {}, sampleRows = []) {
  const mapping = {};
  const used = new Set();
  for (const [field, col] of Object.entries(overrides || {})) {
    if (headers.includes(col)) { mapping[field] = col; used.add(col); }
  }
  const claim = (field, h) => {
    if (mapping[field] || used.has(h)) return;
    mapping[field] = h; used.add(h);
  };
  // 1. exact synonyms
  for (const h of headers) {
    const field = SYN_LOOKUP.get(norm(h));
    if (field) claim(field, h);
  }
  // 2. generic "type"/"class"/"тип"/"name": object kind if values look like kinds, otherwise a defect label
  for (const h of headers) {
    if (used.has(h) || !['type', 'class', 'тип', 'вид', 'category', 'class_name', 'name', 'category_name'].includes(norm(h))) continue;
    const vals = sampleRows.map((r) => r[h]).filter((v) => v != null && v !== '');
    const kinds = vals.filter((v) => normalizeKind(v)).length;
    claim(vals.length && kinds / vals.length >= 0.6 ? 'kind' : 'truth', h);
  }
  // 3. fuzzy patterns for whatever is left
  for (const h of headers) {
    if (used.has(h)) continue;
    const n = norm(h);
    for (const [field, re] of FUZZY) {
      if (!mapping[field] && re.test(n)) { claim(field, h); break; }
    }
  }
  const rest = headers.filter((h) => !used.has(h));
  return { mapping, unmapped: rest.filter((h) => !IGNORED.has(norm(h))), ignored: rest.filter((h) => IGNORED.has(norm(h))) };
}

/* ------------------------------------------------------------------ text formats */

/** RFC 4180-ish CSV parser with delimiter sniffing (, ; tab |), quotes, BOM, CRLF. */
export function parseCSV(text) {
  const src = String(text).replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t', '|']
    .map((d) => [d, firstLine.split('"').filter((_, i) => i % 2 === 0).join('').split(d).length - 1])
    .sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += c;
    } else if (c === '"' && field === '') q = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  if (!rows.length) return { headers: [], rows: [], delimiter: delim };
  const headers = rows[0].map((h, i) => h.trim() || `col${i + 1}`);
  const out = rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
  return { headers, rows: out, delimiter: delim };
}

/** Flattens one level of nested objects: {coordinates:{lat,lon}} → {"coordinates.lat", "coordinates.lon"}. */
function flatten(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && !['probs', 'probabilities', 'bbox', 'box', 'truth', 'extra'].includes(k)) {
      for (const [k2, v2] of Object.entries(v)) out[`${k}.${k2}`] = v2;
    } else out[k] = v;
  }
  return out;
}

function parseCoords(v) {
  if (v == null || v === '') return null;
  if (Array.isArray(v)) return v.length >= 2 ? { a: toNumber(v[0]), b: toNumber(v[1]) } : null;
  if (typeof v === 'object') return { a: toNumber(v.lat ?? v.latitude), b: toNumber(v.lon ?? v.lng ?? v.longitude) };
  const s = String(v).trim();
  const wkt = s.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
  if (wkt) return { a: toNumber(wkt[2]), b: toNumber(wkt[1]) }; // WKT is "lon lat"
  let parts;
  if (s.includes(';')) parts = s.split(';');
  else if (/\d,\d/.test(s) && (s.match(/,/g) || []).length >= 3) parts = s.split(/,\s+|\s+/); // "55,75, 37,71"
  else parts = s.split(/[,\s]+/);
  const nums = parts.map((p) => toNumber(p.replace(/[^\d.,-]/g, ''))).filter((n) => n != null);
  return nums.length >= 2 ? { a: nums[0], b: nums[1] } : null;
}

/** Fixes swapped lat/lon (|lat| > 90, or Moscow written as lon,lat). */
function fixLatLon(lat, lon, warn) {
  if (lat == null || lon == null) return [null, null];
  if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) { warn('swap'); return [lon, lat]; }
  if (lat > 30 && lat < 45 && lon > 50 && lon < 60) { warn('swap'); return [lon, lat]; }
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return [null, null];
  return [lat, lon];
}

const ROUTE_WORDS = {
  critical: ['critical', 'тревога', 'критично', 'alarm', 'alert'],
  review: ['review', 'диспетчер', 'к_диспетчеру', 'проверка', 'manual', 'human'],
  auto_ok: ['auto_ok', 'auto', 'авто', 'автоматически', 'норма_без_человека', 'ok'],
  not_observed: ['not_observed', 'не_наблюдается', 'unseen', 'skip'],
  error: ['error', 'ошибка', 'fail'],
};
const ROUTE_LOOKUP = new Map(Object.entries(ROUTE_WORDS).flatMap(([k, ws]) => ws.map((w) => [norm(w), k])));

const REVIEW_LOOKUP = new Map([
  ['pending', 'pending'], ['ожидает', 'pending'], ['confirm', 'confirm'], ['confirmed', 'confirmed'], ['подтверждено', 'confirm'],
  ['подтвердить', 'confirm'], ['reject', 'reject'], ['rejected', 'reject'], ['ложное', 'reject'], ['отклонено', 'reject'],
  ['need_recapture', 'need_recapture'], ['нужен_кадр', 'need_recapture'], ['переснять', 'need_recapture'],
]);

function parseProbs(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { const o = JSON.parse(v); return o && typeof o === 'object' ? o : null; } catch { return null; }
}

/* ------------------------------------------------------------------ rows → raw detections */

/**
 * @typedef {Object} ImportReport
 * @property {string} name          file name
 * @property {'results'|'labels'|'quality'|'taxonomy'|'dataset'|'photos'|'unknown'} kind
 * @property {string} format        csv|tsv|json|jsonl|xlsx|coco|native|image
 * @property {boolean} ok
 * @property {number} rows          rows read
 * @property {number} used          rows turned into detections
 * @property {Record<string,string>} mapping   canonical field → source column
 * @property {string[]} unmappedColumns        kept in detection.extra
 * @property {{truth:Record<string,number>, pred:Record<string,number>, kind:Record<string,number>, severity:Record<string,number>, status:Record<string,number>}} unmappedValues
 * @property {boolean} labelsOnly   true = no model columns, ground truth shown as detections
 * @property {string[]} warnings    Russian, ready to show
 * @property {string[]} errors
 */

function newReport(name, format, kind = 'unknown') {
  return {
    name, kind, format, ok: true, rows: 0, used: 0, mapping: {}, unmappedColumns: [],
    unmappedValues: { truth: {}, pred: {}, kind: {}, severity: {}, status: {} }, labelsOnly: false, warnings: [], errors: [],
  };
}

/**
 * Converts table rows into raw detections (backend snake_case shape + truth/extra).
 * @param {object[]} rows
 * @param {ReturnType<createTaxonomy>} tax
 * @param {{mapping?:Record<string,string>, report?:ImportReport, headers?:string[]}} [opts]
 * @returns {{detections: object[], seeds: object[], report: ImportReport}}
 */
export function rowsToDetections(rows, tax, opts = {}) {
  const report = opts.report || newReport('rows', 'json');
  const flat = rows.map(flatten);
  const headers = opts.headers || [...new Set(flat.flatMap((r) => Object.keys(r)))];
  const { mapping, unmapped } = mapColumns(headers, opts.mapping, flat.slice(0, 200));
  // "defect_type" in a table without any model columns is the ground truth, not a prediction.
  const hasModel = MODEL_FIELDS.some((f) => f !== 'pred' && mapping[f]);
  if (mapping.pred && !mapping.truth && !hasModel && !/pred|модел|прогноз|предсказ/.test(norm(mapping.pred))) {
    mapping.truth = mapping.pred; delete mapping.pred;
  }
  const labelsOnly = !MODEL_FIELDS.some((f) => mapping[f]);
  report.mapping = mapping;
  report.unmappedColumns = unmapped;
  report.rows += rows.length;
  report.labelsOnly = labelsOnly && !!(mapping.truth || mapping.truthStatus);
  if (report.kind === 'unknown') report.kind = labelsOnly ? 'labels' : 'results';

  const get = (r, f) => (mapping[f] != null ? r[mapping[f]] : undefined);
  const bump = (bucket, v) => { const k = String(v); report.unmappedValues[bucket][k] = (report.unmappedValues[bucket][k] || 0) + 1; };
  let swapped = 0, badBox = 0;
  const detections = [];
  const seeds = [];

  flat.forEach((r, i) => {
    const file = get(r, 'file') ? basename(get(r, 'file')) : null;
    const media = get(r, 'mediaUri') || null;
    let objectId = get(r, 'objectId');
    objectId = objectId != null && String(objectId).trim() !== '' ? String(objectId).trim()
      : file ? `IMG-${basename(file).replace(/\.[^.]+$/, '')}` : `ROW-${String(i + 1).padStart(4, '0')}`;

    let lat = toNumber(get(r, 'lat')), lon = toNumber(get(r, 'lon'));
    if ((lat == null || lon == null) && get(r, 'coords') != null) {
      const c = parseCoords(get(r, 'coords'));
      if (c) { lat = c.a; lon = c.b; }
    }
    [lat, lon] = fixLatLon(lat, lon, () => swapped++);

    const kindRaw = get(r, 'kind');
    let kind = normalizeKind(kindRaw);
    if (kindRaw && !kind) bump('kind', kindRaw);

    // ground truth
    let truth = null;
    const truthRaw = get(r, 'truth');
    const statusRaw = get(r, 'truthStatus');
    if ((truthRaw != null && String(truthRaw).trim() !== '') || statusRaw) {
      let key = truthRaw != null && String(truthRaw).trim() !== '' ? tax.match(truthRaw) : null;
      if (key === undefined) bump('truth', truthRaw);
      const st = normalizeStatus(statusRaw);
      if (statusRaw && !st) bump('status', statusRaw);
      // Only a status column: "исправен" means no defect; a defect status without a class stays unknown.
      if ((truthRaw == null || String(truthRaw).trim() === '') && st && st !== 'ok') key = undefined;
      truth = { key, raw: truthRaw ?? null, status: st, statusRaw: statusRaw ?? null };
    }

    // model output
    let defectType = null, top = null;
    let route = get(r, 'route') ? ROUTE_LOOKUP.get(norm(get(r, 'route'))) ?? null : null;
    const predRaw = get(r, 'pred');
    if (predRaw != null && String(predRaw).trim() !== '') {
      const k = tax.match(predRaw);
      if (k === undefined) { bump('pred', predRaw); defectType = String(predRaw).trim(); }
      else if (k === tax.noneKey) { route = route || 'not_observed'; }
      else defectType = k;
    }
    const topRaw = get(r, 'top');
    if (topRaw) {
      const k = tax.match(topRaw);
      top = k === null ? tax.okKey : k === undefined ? String(topRaw) : k;
    }
    if (labelsOnly && truth) {
      if (truth.key === tax.noneKey) route = 'not_observed';
      else if (truth.key !== undefined) defectType = truth.key;
      else if (truth.status && truth.status !== 'ok') defectType = truth.raw ? String(truth.raw) : null;
    }
    const sevRaw = get(r, 'severity');
    let severity = normalizeSeverity(sevRaw);
    if (sevRaw && !severity) bump('severity', sevRaw);
    if (route === 'critical' && defectType) severity = 'critical';
    if (defectType && !severity) severity = tax.defaultSeverity(defectType);
    const confidence = toProb(get(r, 'confidence') ?? get(r, 'topP'));
    const explicitConf = toProb(get(r, 'confidence'));
    if (!route) {
      if (!defectType) route = labelsOnly ? 'auto_ok' : confidence != null && confidence < tax.thresholds.auto_ok ? 'review' : 'auto_ok';
      else route = severity === 'critical' ? 'critical' : 'review';
    }

    // bbox
    let bbox = get(r, 'bbox') ?? null;
    if (bbox == null && get(r, 'bboxX') != null && get(r, 'bboxW') != null) {
      bbox = [get(r, 'bboxX'), get(r, 'bboxY'), get(r, 'bboxW'), get(r, 'bboxH')].map(toNumber);
    } else if (bbox == null && get(r, 'x1') != null && get(r, 'x2') != null) {
      const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((f) => toNumber(get(r, f)));
      bbox = [x1, y1, x2 - x1, y2 - y1];
    }
    if (bbox != null) {
      let b = typeof bbox === 'string' ? (() => { try { return JSON.parse(bbox); } catch { return bbox.split(/[\s,;]+/).map(Number); } })() : bbox;
      if (b && !Array.isArray(b)) b = [b.x, b.y, b.w ?? b.width, b.h ?? b.height].map(Number);
      const W = toNumber(get(r, 'imgW')), H = toNumber(get(r, 'imgH'));
      if (Array.isArray(b) && b.some((v) => v > 1)) {
        if (W && H) b = [b[0] / W, b[1] / H, b[2] / W, b[3] / H];
        else { badBox++; b = null; }
      }
      bbox = b ? { x: b[0], y: b[1], w: b[2], h: b[3] } : null;
    }

    let reviewState = get(r, 'reviewState') ? REVIEW_LOOKUP.get(norm(get(r, 'reviewState'))) ?? null : null;
    if (!reviewState) reviewState = route === 'not_observed' ? 'not_observed' : route === 'error' ? 'not_observed' : defectType ? 'pending' : 'confirmed';
    const createdAt = toIso(get(r, 'timestamp'));
    const extra = {};
    for (const h of unmapped) if (r[h] != null && r[h] !== '' && typeof r[h] !== 'object') extra[h] = String(r[h]);

    const conf = (() => {
      // Same as ml/worker.py: explicit column, else P(defect class), else top_p.
      const probs = parseProbs(get(r, 'probs'));
      if (explicitConf != null) return explicitConf;
      if (probs && defectType && probs[defectType] != null) return toProb(probs[defectType]);
      return confidence;
    })();

    detections.push({
      id: get(r, 'detectionId') || stableId('imp', objectId, file || '', createdAt || '', i, predRaw ?? '', truthRaw ?? ''),
      frame_id: stableId('frame', file || objectId, createdAt || i),
      object_id: objectId,
      object_kind: kind ?? tax.kindOf(defectType) ?? tax.kindOf(truth?.key) ?? null,
      defect_type: defectType,
      severity,
      confidence: conf,
      bbox,
      crop_uri: media,
      file,
      rationale: get(r, 'rationale') || (r.error ? `Ошибка модели: ${r.error}` : null),
      lat, lon,
      review_state: reviewState,
      route,
      created_at: createdAt,
      probs: parseProbs(get(r, 'probs')),
      top,
      top_p: toProb(get(r, 'topP')),
      object_p: toProb(get(r, 'objectP')),
      p_critical: toProb(get(r, 'pCritical')),
      truth,
      origin: labelsOnly ? 'label' : 'model',
      extra: Object.keys(extra).length ? extra : null,
      _row: i,
    });
    seeds.push({ id: objectId, kind, lat, lon, address: get(r, 'address') || null, district: get(r, 'district') || null });
  });

  report.used += detections.length;
  if (swapped) report.warnings.push(`Широта и долгота переставлены местами в ${swapped} строках.`);
  if (badBox) report.warnings.push(`Рамки в пикселях без размера кадра пропущены в ${badBox} строках (нужны колонки image_width/image_height).`);
  if (!mapping.file && !mapping.mediaUri) report.warnings.push('Нет колонки с именем файла: фото показаны не будут.');
  if (!mapping.objectId) report.warnings.push('Нет колонки с ID объекта: ID построен из имени файла (IMG-…), каждый кадр стал отдельным объектом.');
  if (!mapping.lat && !mapping.coords) report.warnings.push('Нет координат: карта будет недоступна, используйте таблицу.');
  if (report.labelsOnly) report.warnings.push('В файле нет ответов модели: показана разметка организаторов.');
  const tv = Object.keys(report.unmappedValues.truth);
  if (tv.length) report.warnings.push(`Метки разметки без класса в таксономии: ${tv.slice(0, 8).join(', ')}${tv.length > 8 ? ' …' : ''}. Добавьте их в aliases в data/taxonomy.json.`);
  const pv = Object.keys(report.unmappedValues.pred);
  if (pv.length) report.warnings.push(`Классы модели не из таксономии (показаны как есть): ${pv.slice(0, 8).join(', ')}.`);
  if (unmapped.length) report.warnings.push(`Колонки без сопоставления (сохранены в extra): ${unmapped.join(', ')}.`);
  return { detections, seeds, report };
}

/* ------------------------------------------------------------------ file sniffing */

let xlsxPromise = null;
/** Loads SheetJS on demand: js/vendor/xlsx.full.min.js first (offline), then cdnjs. */
export function ensureXlsx() {
  if (globalThis.XLSX) return Promise.resolve(globalThis.XLSX);
  if (xlsxPromise) return xlsxPromise;
  const load = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = () => (globalThis.XLSX ? resolve(globalThis.XLSX) : reject(new Error('no XLSX')));
    s.onerror = () => reject(new Error(`cannot load ${src}`));
    document.head.appendChild(s);
  });
  xlsxPromise = load('./js/vendor/xlsx.full.min.js')
    .catch(() => load('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'))
    .catch((e) => { xlsxPromise = null; throw e; });
  return xlsxPromise;
}

function cocoToRows(j) {
  const cats = new Map((j.categories || []).map((c) => [c.id, c.name]));
  const anns = new Map();
  for (const a of j.annotations || []) {
    if (!anns.has(a.image_id)) anns.set(a.image_id, []);
    anns.get(a.image_id).push(a);
  }
  const rows = [];
  for (const im of j.images || []) {
    const list = anns.get(im.id) || [];
    if (!list.length) rows.push({ file: im.file_name, label: 'норма', lat: im.lat ?? im.latitude, lon: im.lon ?? im.longitude, date: im.date_captured });
    for (const a of list) {
      const [x, y, w, h] = a.bbox || [];
      rows.push({
        file: im.file_name, [a.score != null ? 'pred' : 'label']: cats.get(a.category_id) ?? a.category_id, object_id: a.object_id ?? im.object_id,
        bbox: im.width && im.height && w ? [x / im.width, y / im.height, w / im.width, h / im.height] : null,
        score: a.score, lat: im.lat ?? im.latitude, lon: im.lon ?? im.longitude, date: im.date_captured,
      });
    }
  }
  return rows;
}

/**
 * Parses one file's content into a typed chunk.
 * @param {string|ArrayBuffer|object} input  text, xlsx bytes or already-parsed JSON
 * @param {{filename?:string, taxonomy:ReturnType<createTaxonomy>, mapping?:Record<string,string>}} opts
 * @returns {Promise<{report: ImportReport, detections?: object[], seeds?: object[], dataset?: object, quality?: object, taxonomy?: object, meta?: object}>}
 */
export async function parseImport(input, opts) {
  const name = opts.filename || 'данные';
  const ext = (name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  const tax = opts.taxonomy;
  try {
    if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm' || input instanceof ArrayBuffer) {
      const XLSX = await ensureXlsx();
      const wb = XLSX.read(input, { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
      const out = rowsToDetections(rows, tax, { mapping: opts.mapping, report: newReport(name, 'xlsx') });
      return out;
    }
    let json = typeof input === 'object' ? input : null;
    const text = typeof input === 'string' ? input.replace(/^﻿/, '') : null;
    if (!json && text != null) {
      const t = text.trim();
      if (t.startsWith('{') || t.startsWith('[')) {
        try { json = JSON.parse(t); } catch {
          const lines = t.split(/\r?\n/).filter((l) => l.trim());
          if (lines.every((l) => l.trim().startsWith('{'))) {
            const rows = lines.map((l) => JSON.parse(l));
            return rowsToDetections(rows, tax, { mapping: opts.mapping, report: newReport(name, 'jsonl') });
          }
          throw new Error('JSON не разобран');
        }
      }
    }
    if (json) return parseJSON(json, name, tax, opts);
    if (text == null) throw new Error('Пустой файл');
    const csv = parseCSV(text);
    if (!csv.rows.length) throw new Error('В таблице нет строк');
    return rowsToDetections(csv.rows, tax, {
      mapping: opts.mapping, headers: csv.headers, report: newReport(name, csv.delimiter === '\t' ? 'tsv' : 'csv'),
    });
  } catch (e) {
    const report = newReport(name, ext || 'unknown');
    report.ok = false;
    report.errors.push(`${name}: ${e.message}`);
    return { report };
  }
}

function parseJSON(json, name, tax, opts) {
  const isArr = Array.isArray(json);
  if (!isArr && json.classes && typeof json.classes === 'object' && !json.detections) {
    const report = newReport(name, 'json', 'taxonomy');
    report.rows = Object.keys(json.classes).length;
    return { report, taxonomy: json };
  }
  if (!isArr && (json.confusion || json.per_class || (json.report !== undefined && json.runs))) {
    const report = newReport(name, 'json', 'quality');
    return { report, quality: json };
  }
  if (!isArr && json.images && json.annotations) {
    return rowsToDetections(cocoToRows(json), tax, { mapping: opts.mapping, report: newReport(name, 'coco') });
  }
  const meta = !isArr ? {
    title: json.title ?? null, runId: json.run_id ?? json.runId ?? null, model: json.model ?? null,
    generatedAt: toIso(json.generated_at ?? json.generatedAt), demo: !!json.demo, note: json.note ?? null,
    photoBase: json.photo_base ?? json.photoBase ?? undefined,
  } : {};
  const extras = {};
  if (!isArr && json.quality) extras.quality = json.quality;
  if (!isArr && json.taxonomy?.classes) extras.taxonomy = json.taxonomy;
  // Dataset dump (API/demo shapes): objects with status + detections rows.
  if (!isArr && Array.isArray(json.objects) && json.objects.some((o) => o.status) && !json.rows && !json.results) {
    const report = newReport(name, 'native', 'dataset');
    report.rows = json.objects.length;
    report.used = (json.detections || []).length;
    return { report, dataset: json, meta, ...extras };
  }
  const rows = isArr ? json : json.rows || json.results || json.detections || json.predictions || json.items || json.data || json.records || json.frames;
  if (Array.isArray(rows) && rows.length && typeof rows[0] === 'object') {
    const out = rowsToDetections(rows, tax, { mapping: opts.mapping || json.mapping, report: newReport(name, isArr ? 'json' : 'native') });
    if (!isArr && Array.isArray(json.objects)) out.seeds.push(...json.objects.map((o) => ({ ...o, id: String(o.id ?? o.object_id) })));
    return { ...out, meta, ...extras };
  }
  const report = newReport(name, 'json');
  report.ok = false;
  report.errors.push(`${name}: не нашёл строк (ожидался массив или поле rows/results/detections).`);
  return { report };
}

/**
 * Parses several files. If one of them is (or embeds) a taxonomy, the rest are parsed again
 * with it, so organizers' labels match the new classes and aliases.
 * @param {{name:string, content:string|ArrayBuffer|object, mapping?:Record<string,string>}[]} files
 * @param {ReturnType<createTaxonomy>} baseTax
 * @returns {Promise<{chunks: Awaited<ReturnType<parseImport>>[], taxonomy: ReturnType<createTaxonomy>}>}
 */
export async function parseFiles(files, baseTax) {
  const run = (tax) => Promise.all(files.map((f) => parseImport(f.content, { filename: f.name, taxonomy: tax, mapping: f.mapping })));
  let chunks = await run(baseTax);
  const t = chunks.filter((c) => c.taxonomy).pop();
  if (!t) return { chunks, taxonomy: baseTax };
  const tax = createTaxonomy(t.taxonomy);
  chunks = await run(tax);
  return { chunks, taxonomy: tax };
}

/* ------------------------------------------------------------------ chunks → dataset */

/**
 * Builds a Dataset from parsed chunks (several files dropped together: results + report + taxonomy).
 * @param {Awaited<ReturnType<parseImport>>[]} chunks
 * @param {ReturnType<createTaxonomy>} baseTax
 * @param {{reviews?: object[], photoBase?: string, meta?: object}} [opts] reviews = local decisions to replay
 * @returns {{dataset: object, reports: ImportReport[], summary: {files:number, objects:number, detections:number, withCoords:number, labelsOnly:boolean, quality:'file'|'computed'|null, unmappedTruth:Record<string,number>, warnings:string[], errors:string[]}}}
 */
export function buildDataset(chunks, baseTax, opts = {}) {
  const taxChunk = chunks.filter((c) => c.taxonomy).pop();
  const tax = taxChunk ? createTaxonomy(taxChunk.taxonomy) : baseTax;
  const meta = Object.assign({ source: 'file', demo: false, note: null, photoBase: opts.photoBase ?? '' },
    ...chunks.map((c) => Object.fromEntries(Object.entries(c.meta || {}).filter(([, v]) => v !== undefined && v !== null))), opts.meta || {});
  const dump = chunks.filter((c) => c.dataset).pop();
  const ds = dump ? createDataset({ ...dump.dataset, meta }, tax) : emptyDataset(tax, meta);
  ds.meta.empty = false;

  const { rows, seeds, joinNote } = joinLabels(chunks);
  for (const s of seeds) upsertObject(ds, s);
  rows.sort((a, b) => (a.created_at && b.created_at ? a.created_at.localeCompare(b.created_at) : 0) || a._row - b._row);
  for (const raw of rows) {
    const { _row, review_state: rs, ...det } = raw;
    // Imported decisions are replayed as review events so statuses follow the projection rules.
    const decided = rs === 'confirm' || rs === 'reject' || rs === 'need_recapture';
    const { detection } = ingestDetection(ds, { ...det, review_state: decided ? 'pending' : rs }, { source: 'import' });
    if (decided) localReview(ds, detection.objectId, { detectionId: detection.id, decision: rs, reviewer: 'import', at: detection.createdAt || undefined });
  }
  for (const r of opts.reviews || []) {
    if (ds.byId.has(r.objectId)) localReview(ds, r.objectId, r);
  }
  for (const o of ds.objects) deriveObject(o, tax);

  let qualityFrom = null;
  const qChunk = chunks.filter((c) => c.quality).pop();
  if (qChunk) { ds.quality = normalizeQuality(qChunk.quality, tax); qualityFrom = 'file'; }
  else {
    const rep = computeQualityReport(ds.detections, tax, { runId: meta.runId || 'import', model: meta.model });
    if (rep) { ds.quality = normalizeQuality(rep, tax); qualityFrom = 'computed'; }
  }
  ds.meta.empty = ds.objects.length === 0 && ds.unmatched.length === 0;

  const reports = chunks.map((c) => c.report);
  const unmappedTruth = {};
  for (const r of reports) for (const [k, v] of Object.entries(r.unmappedValues?.truth || {})) unmappedTruth[k] = (unmappedTruth[k] || 0) + v;
  return {
    dataset: ds,
    reports,
    summary: {
      files: chunks.length,
      objects: ds.objects.length,
      detections: ds.detections.length,
      withCoords: ds.objects.filter((o) => o.hasCoords).length,
      labelsOnly: reports.some((r) => r.labelsOnly) && !reports.some((r) => r.kind === 'results'),
      quality: qualityFrom,
      unmappedTruth,
      joined: joinNote,
      warnings: [...(joinNote?.warning ? [joinNote.warning] : []), ...reports.flatMap((r) => r.warnings.map((w) => `${r.name}: ${w}`))],
      errors: reports.flatMap((r) => r.errors),
    },
  };
}

/**
 * Results (model output) + labels (organizers' table) dropped together are joined by photo
 * file name (basename without extension, case-insensitive, like ml/labels.py): the result row
 * gets ground truth, coordinates, timestamp and a registry object id from the label row.
 */
function joinLabels(chunks) {
  const withRows = chunks.filter((c) => c.detections);
  const labels = withRows.filter((c) => c.report.kind === 'labels');
  const results = withRows.filter((c) => c.report.kind !== 'labels');
  if (!labels.length || !results.length) {
    return { rows: withRows.flatMap((c) => c.detections), seeds: withRows.flatMap((c) => c.seeds || []), joinNote: null };
  }
  const idx = new Map();
  for (const c of labels) c.detections.forEach((d, i) => { if (d.file) idx.set(fileKey(d.file), { d, seed: c.seeds[i] }); });
  const rows = [], seeds = [];
  let matched = 0;
  const isFallbackId = (id) => !id || /^(IMG|ROW)-/.test(String(id));
  for (const c of results) {
    c.detections.forEach((d, i) => {
      const m = d.file ? idx.get(fileKey(d.file)) : null;
      const seed = { ...(c.seeds[i] || { id: d.object_id }) };
      if (!m) { rows.push(d); seeds.push(seed); return; }
      matched++;
      const L = m.d;
      const merged = {
        ...d,
        truth: d.truth ?? L.truth,
        lat: d.lat ?? L.lat, lon: d.lon ?? L.lon,
        created_at: d.created_at ?? L.created_at,
        object_kind: d.object_kind ?? L.object_kind,
        extra: L.extra || d.extra ? { ...(L.extra || {}), ...(d.extra || {}) } : null,
      };
      if (isFallbackId(d.object_id) && !isFallbackId(L.object_id)) merged.object_id = L.object_id;
      rows.push(merged);
      seeds.push({
        id: merged.object_id, kind: seed.kind ?? m.seed?.kind, lat: merged.lat, lon: merged.lon,
        address: seed.address ?? m.seed?.address ?? null, district: seed.district ?? m.seed?.district ?? null,
      });
    });
  }
  const total = results.reduce((a, c) => a + c.detections.length, 0);
  const note = { matched, results: total, labels: idx.size };
  if (matched < total) note.warning = `Разметка найдена для ${matched} из ${total} кадров модели (сопоставление по имени файла).`;
  else if (idx.size > matched) note.warning = `${idx.size - matched} строк разметки без ответа модели (не показаны).`;
  return { rows, seeds, joinNote: note };
}

/** True for image files that should be stored as photos rather than parsed. */
export function isImageFile(name) {
  return /\.(jpe?g|png|webp|bmp|gif|svg)$/i.test(name || '');
}

export { fileKey };
