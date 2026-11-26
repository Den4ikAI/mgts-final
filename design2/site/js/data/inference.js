/**
 * Live model calls from the browser: the same pipeline as ml/decision.py + ml/crop.py.
 *
 *   google/gemini-decision-1  → has object? kind (ТКШ/РЩ)? condition class? severity? yes/no checks
 *   typesafe/jev-1.14         → box around the main cabinet / board (drawn on the photo)
 *
 * Questions are built from data/taxonomy.json exactly like build_questions() in decision.py,
 * and interpret()/chooseRoute() repeat the Python routing rule, so a photo checked here gets
 * the same answer as in the batch run. OpenRouter allows CORS, the key lives in localStorage
 * of this browser only (never in the repo or the page source).
 */

import { storage, fileKey, basename, stableId } from './util.js';

export const DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';
export const DECISION_MODEL = 'google/gemini-decision-1';
export const BOX_MODEL = 'typesafe/jev-1.14';
const KEY = 'poputno.openrouterKey';
const BOX_TARGET = 'the main telecom equipment cabinet or electrical distribution board on the pole (the largest and closest one, or the damaged one)';

export class ModelError extends Error {
  constructor(message, { fatal = false, status = 0 } = {}) {
    super(message);
    this.name = 'ModelError';
    this.fatal = fatal;
    this.status = status;
  }
}

/* ------------------------------------------------------------------ key */

export function getKey() { return storage.get(KEY) || ''; }
export function setKey(v) { const s = String(v || '').trim(); if (s) storage.set(KEY, s); else storage.remove(KEY); }
export function hasKey() { return !!getKey(); }

/* ------------------------------------------------------------------ image */

/**
 * Decodes any browser-readable image (JPG/PNG/WEBP/BMP/GIF/HEIC where supported), applies EXIF
 * rotation and re-encodes as JPEG with the long side ≤ maxSide (min side ≥ minSide for Jev).
 * @returns {Promise<{dataUrl:string, width:number, height:number}>}
 */
export async function encodeImage(file, { maxSide = 2048, minSide = 0, quality = 0.88 } = {}) {
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bmp = await new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new ModelError('Браузер не смог открыть это изображение')); };
      img.src = url;
    });
  }
  const W = bmp.width, H = bmp.height;
  let k = Math.min(1, maxSide / Math.max(W, H));
  if (minSide && Math.min(W, H) * k < minSide) k = minSide / Math.min(W, H);
  const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, w, h);
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return { dataUrl: c.toDataURL('image/jpeg', quality), width: W, height: H };
}

/** Data URL → Blob (to store the checked photo in IndexedDB). */
export function dataUrlToBlob(u) {
  const [head, b64] = u.split(',');
  const mime = head.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/* ------------------------------------------------------------------ questions (decision.py build_questions) */

export function buildQuestions(raw) {
  const classes = raw.classes;
  const q = {
    has_object: {
      type: 'noul',
      instructions: raw.object_question.instructions,
      criteria: { true: raw.object_question.true, false: raw.object_question.false },
    },
    kind: { type: 'choice', instructions: raw.kind_question.instructions, criteria: raw.kind_question.classes },
    defect: {
      type: 'choice',
      instructions: raw.defect_question.instructions,
      criteria: Object.fromEntries(Object.entries(classes).map(([k, v]) => [k, v.description])),
    },
    severity: {
      type: 'score',
      instructions: raw.severity_question.instructions,
      criteria: raw.severity_question.levels.map((l) => l.description),
    },
  };
  for (const [k, c] of Object.entries(raw.checks || {})) {
    q[`check_${k}`] = { type: 'noul', instructions: c.instructions, criteria: { true: c.true, false: c.false } };
  }
  return q;
}

/** The taxonomy must be the ML one (has the question blocks), not a bare class list. */
export function canAsk(raw) {
  return !!(raw?.context && raw.object_question && raw.kind_question && raw.defect_question && raw.severity_question && raw.classes);
}

/* ------------------------------------------------------------------ HTTP */

async function post(body, { signal, retries = 4 } = {}) {
  const key = getKey();
  if (!key) throw new ModelError('Нужен ключ OpenRouter', { fatal: true });
  let delay = 800, last = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res;
    const t0 = performance.now();
    try {
      res = await fetch(DECISIONS_URL, {
        method: 'POST', signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Poputno' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      last = new ModelError('Нет связи с OpenRouter');
    }
    if (res) {
      if (res.ok) {
        const j = await res.json();
        j._latency = (performance.now() - t0) / 1000;
        return j;
      }
      let msg = '';
      try { msg = (await res.text()).slice(0, 240); } catch { /* none */ }
      const human = { 401: 'Ключ OpenRouter не подошёл', 402: 'На ключе OpenRouter закончился баланс', 403: 'Ключу OpenRouter запрещён этот запрос', 400: 'OpenRouter не принял запрос', 404: 'Модель не найдена' }[res.status];
      if ([400, 401, 402, 403, 404].includes(res.status)) throw new ModelError(`${human}: ${msg}`, { fatal: true, status: res.status });
      last = new ModelError(`OpenRouter ответил ${res.status}`, { status: res.status });
    }
    if (attempt === retries) break;
    await new Promise((r) => setTimeout(r, delay + Math.random() * delay));
    delay = Math.min(delay * 2, 15000);
  }
  throw last || new ModelError('OpenRouter не ответил');
}

const imagePart = (u) => ({ type: 'image_url', image_url: { url: u } });

/** Gemini Decision: raw answers. */
export function askDecision(dataUrl, raw, opts) {
  return post({ model: DECISION_MODEL, state: [raw.context, imagePart(dataUrl)], questions: buildQuestions(raw) }, opts);
}

/** Jev: box around the main cabinet/board, fractions of the frame, or null. */
export async function askBox(dataUrl, opts) {
  const r = await post({
    model: BOX_MODEL,
    state: ['Inspection photo of telecom equipment mounted on a pole.', imagePart(dataUrl)],
    questions: { where: { type: 'box', instructions: BOX_TARGET } },
  }, opts);
  const a = r.answers?.where || {};
  return { box: a.box || null, confidence: Number(a.confidence ?? 0), cost: r.usage?.cost ?? 0 };
}

/* ------------------------------------------------------------------ interpretation (decision.py interpret / choose_route) */

export function chooseRouteRaw(top, topP, objectP, pCrit, severity, classes, th, checks = {}) {
  if (top === 'none' || (classes[top]?.ok && objectP < th.object_min)) return 'not_observed';
  const checkHit = Math.max(0, ...Object.values(checks)) >= (th.check_max ?? 1.01);
  if (classes[top]?.ok && topP >= th.auto_ok && pCrit < th.critical_prob && !checkHit) return 'auto_ok';
  return severity === 'critical' ? 'critical' : 'review';
}

/**
 * @returns {{route, defect_type, top, top_p, object_p, kind, severity, severity_score, p_critical, probs, rationale, checks}}
 */
export function interpret(res, raw) {
  const a = res.answers || {};
  const th = raw.thresholds;
  const classes = raw.classes;
  const levels = raw.severity_question.levels;
  const firstKind = Object.keys(raw.kind_question.classes)[0];
  const obj = a.has_object || {};
  const objectP = obj.type === 'noul' ? Number(obj.noul || 0) : 0;
  const defect = a.defect || {};
  const sev = a.severity || {};
  const probs = Object.fromEntries(Object.entries(defect.probabilities || {}).map(([k, v]) => [k, Number(v)]));
  if (defect.type !== 'choice' || !Object.keys(probs).length) {
    return { route: 'review', defect_type: null, top: null, top_p: 0, object_p: objectP, kind: firstKind, severity: null,
      severity_score: 0, p_critical: 0, probs: {}, checks: {}, rationale: 'Модель не ответила на вопрос о состоянии — нужна проверка человеком' };
  }
  const ranked = Object.entries(probs).sort((x, y) => y[1] - x[1]);
  const [top, topP] = ranked[0];
  const sevProbs = Object.fromEntries(Object.entries(sev.probabilities || {}).map(([k, v]) => [Number(k), Number(v)]));
  const score = sev.type === 'score' ? Number(sev.score || 0) : 0;
  const pCrit = sevProbs[levels.length - 1] || 0;
  let severity;
  if (pCrit >= th.critical_prob) severity = 'critical';
  else if (score >= th.high_score) severity = 'high';
  else severity = levels[Math.min(levels.length - 1, Math.max(0, Math.round(score)))].severity;

  const defects = ranked.filter(([k]) => !classes[k]?.ok);
  const bestDefect = defects[0]?.[0] ?? null;
  const kind = (!classes[top]?.ok && bestDefect ? classes[bestDefect].kind : null) || a.kind?.choice || firstKind;
  const pct = (k, p) => `${classes[k]?.label ?? k} ${Math.round(p * 100)}%`;
  let summary = ranked.slice(0, 3).map(([k, p]) => pct(k, p)).join(' · ') + ` · опасность ${score.toFixed(1)}/${levels.length - 1}`;
  const checks = {};
  for (const k of Object.keys(raw.checks || {})) if (a[`check_${k}`]?.type === 'noul') checks[k] = Number(a[`check_${k}`].noul || 0);
  const hits = Object.entries(checks).sort((x, y) => y[1] - x[1]).filter(([, p]) => p >= 0.5).map(([k, p]) => pct(k, p));
  if (hits.length) summary += ` · проверки: ${hits.join(', ')}`;
  const route = chooseRouteRaw(top, topP, objectP, pCrit, severity, classes, th, checks);
  const out = (defectType, s, text) => ({ route, defect_type: defectType, top, top_p: topP, object_p: objectP, kind, severity: s,
    severity_score: score, p_critical: pCrit, probs, checks, rationale: text });
  if (route === 'not_observed') return out(null, null, `Объект не различим (уверенность ${objectP.toFixed(2)}) · ${summary}`);
  if (route === 'auto_ok') return out(null, null, `Норма, подтверждено автоматически · ${summary}`);
  if (classes[top]?.ok) {
    const fired = Object.entries(checks).sort((x, y) => y[1] - x[1])[0] || [null, 0];
    const d = fired[1] >= (th.check_max ?? 1.01) ? fired[0] : bestDefect;
    return out(d, severity, `Модель не уверена, что всё в норме · ${summary}`);
  }
  return out(top, severity, summary);
}

/* ------------------------------------------------------------------ one photo end to end */

/**
 * Runs both models on one photo. Returns a row in the poputno.results contract plus the
 * encoded preview (so the caller can store it).
 * @param {File|Blob} file
 * @param {object} raw  taxonomy JSON (tax.raw)
 * @param {{signal?:AbortSignal, box?:boolean}} [opts]
 */
export async function checkPhoto(file, raw, { signal, box = true } = {}) {
  if (!canAsk(raw)) throw new ModelError('В таксономии нет вопросов для модели (data/taxonomy.json должна быть копией ml/taxonomy.json)', { fatal: true });
  const name = file.name || 'photo.jpg';
  const [big, small] = await Promise.all([
    encodeImage(file, { maxSide: 2048 }),
    box ? encodeImage(file, { maxSide: 1568, minSide: 256, quality: 0.9 }) : null,
  ]);
  const t0 = performance.now();
  const [dec, bx] = await Promise.all([
    askDecision(big.dataUrl, raw, { signal }),
    box ? askBox(small.dataUrl, { signal }).catch((e) => { if (e.name === 'AbortError' || e.fatal) throw e; return null; }) : null,
  ]);
  const seconds = (performance.now() - t0) / 1000;
  const d = interpret(dec, raw);
  const b = bx?.box;
  const stem = basename(name).replace(/\.[^.]+$/, '');
  const storeName = `chk-${stableId(name, file.size || 0, file.lastModified || 0).slice(0, 8)}-${fileKey(name).replace(/[^a-z0-9а-яё_-]+/gi, '-')}.jpg`;
  const row = {
    file: name,
    media_uri: storeName,
    object_id: `${raw.ui?.kinds?.[d.kind] || (d.kind === 'rsh' ? 'РЩ' : 'ТКШ')}-${stem}`,
    kind: d.kind,
    pred: d.route === 'not_observed' ? 'none' : d.defect_type,
    top: d.top, top_p: d.top_p, object_p: d.object_p, p_critical: d.p_critical,
    probs: d.probs, severity: d.severity, route: d.route, rationale: d.rationale,
    bbox: b ? [b.left, b.top, b.right - b.left, b.bottom - b.top] : null,
    jev_p: bx ? bx.confidence : null,
    captured_at: new Date().toISOString(),
    model: DECISION_MODEL,
    latency: +seconds.toFixed(2),
    cost: +((dec.usage?.cost ?? 0) + (bx?.cost ?? 0)).toFixed(6),
    image_width: big.width, image_height: big.height,
  };
  return { row, preview: big.dataUrl, storeName, decision: d };
}

/**
 * Runs checkPhoto over many files with a small worker pool.
 * @param {File[]} files
 * @param {(done:number, total:number, last:{file:File, row?:object, error?:Error}) => void} onProgress
 */
export async function checkMany(files, raw, { concurrency = 6, signal, onProgress } = {}) {
  const out = new Array(files.length);
  let next = 0, done = 0, fatal = null;
  const worker = async () => {
    while (next < files.length && !fatal && !signal?.aborted) {
      const i = next++;
      const f = files[i];
      try {
        out[i] = { file: f, ...(await checkPhoto(f, raw, { signal })) };
      } catch (e) {
        if (e.fatal) fatal = e;
        out[i] = { file: f, error: e };
      }
      done++;
      onProgress?.(done, files.length, out[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  if (fatal) throw Object.assign(fatal, { partial: out.filter(Boolean) });
  return out.filter(Boolean);
}
