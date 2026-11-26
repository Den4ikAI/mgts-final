/**
 * DataSource: one interface, three adapters.
 *
 *   const src = await openSource();          // picks ?source=demo|api|file (see config.js)
 *   const ds  = src.dataset;                 // normalized Dataset (model.js)
 *   const objs = await src.getObjects({ displayStatus: 'critical' });
 *
 * Every adapter implements:
 *   load() refresh() getObjects(f) getObject(id) getHistory(id) getQueue() getStats() getQuality(run?)
 *   getTaxonomy() getUser() review(objectId, decision) subscribe(cb) resolvePhoto(uri)
 * plus `kind`, `label`, `capabilities`, `dataset`.
 * Adapter-specific: FileSource.importFiles/clear/hasData, ApiSource.login/logout, DemoSource.simulate/reset.
 */

import { getConfig, saveSetting } from './config.js';
import { loadTaxonomy, createTaxonomy } from './taxonomy.js';
import { fetchJSON, idb, storage, fileKey, stableId } from './util.js';
import {
  createDataset, emptyDataset, mergeObjectDetails, applyEvent, ingestDetection, localReview, normalizeQuality,
  upsertDetection, deriveObject,
  selectObjects, selectObject, selectQueue, selectStats, selectTimeline,
} from './model.js';
import { parseFiles, buildDataset, isImageFile } from './import.js';

export const DEMO_NOTE = 'Демо-данные, не датасет организаторов';

/** Error with an HTTP status and a Russian message for the UI. */
export class DataError extends Error {
  constructor(message, { status = 0, cause } = {}) {
    super(message);
    this.name = 'DataError';
    this.status = status;
    this.cause = cause;
  }
}

/* ------------------------------------------------------------------ in-memory base */

/** Shared implementation over an in-memory Dataset (demo and file sources). */
class MemorySource {
  constructor(cfg) {
    this.cfg = cfg;
    /** @type {any} */
    this.dataset = null;
    this.taxonomy = null;
    this.listeners = new Set();
  }
  /** @returns {Promise<any>} Dataset */
  async refresh() { return this.load(); }
  async getObjects(filter = {}) { return selectObjects(this.dataset, filter); }
  async getObject(id) { return selectObject(this.dataset, id); }
  async getHistory(id) { return selectTimeline(this.dataset, { objectId: id }); }
  async getQueue() { return selectQueue(this.dataset); }
  async getStats() { return selectStats(this.dataset); }
  async getQuality() { return this.dataset.quality; }
  async getTaxonomy() { return this.taxonomy; }
  async getUser() { return this.dataset.user; }
  /** Global event feed, newest first. */
  async getEvents(f = {}) { return selectTimeline(this.dataset, f); }

  /**
   * Dispatcher decision, applied locally with the backend projection rules.
   * @param {string} objectId
   * @param {{detectionId?:string, decision:'confirm'|'reject'|'need_recapture', rejectReason?:string|{other:string}, comment?:string}} r
   * @returns {Promise<{ok:true, events:any[]}>}
   */
  async review(objectId, r) {
    if (!this.dataset.byId.has(objectId)) throw new DataError(`Объект ${objectId} не найден`, { status: 404 });
    const events = localReview(this.dataset, objectId, { ...r, reviewer: r.reviewer || this.dataset.user?.login || 'dispatcher' });
    this._afterReview?.(objectId, r);
    this.emit(events);
    return { ok: true, events };
  }

  /**
   * Live events. Callback gets (event, dataset) for every new TimelineEvent.
   * @returns {() => void} unsubscribe
   */
  subscribe(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  emit(events) {
    for (const e of events) for (const cb of this.listeners) {
      try { cb(e, this.dataset); } catch (err) { console.error(err); }
    }
  }
  /** Photo URL usable in <img src>. */
  async resolvePhoto(uri) { return uri || null; }
}

/* ------------------------------------------------------------------ demo */

/** Loads ./data/demo/*.json (backend API shapes). Reviews are applied in memory only. */
export class DemoSource extends MemorySource {
  kind = 'demo';
  label = 'Демо-данные';
  capabilities = { review: true, live: true, login: false, import: false };

  async load() {
    const base = this.cfg.demoBase;
    const opt = (name) => fetchJSON(base + name).catch(() => null);
    const [meta, objects, detections, events, workOrders, quality, tax] = await Promise.all([
      opt('meta.json'), fetchJSON(base + 'objects.json'), opt('detections.json'), opt('events.json'),
      opt('work_orders.json'), opt('quality.json'), loadTaxonomy(this.cfg.taxonomyUrl),
    ]).catch((e) => { throw new DataError(`Демо-данные не загрузились: ${e.message}`, { status: e.status, cause: e }); });
    this.taxonomy = tax;
    this.dataset = createDataset({
      meta: { note: DEMO_NOTE, ...(meta || {}), source: 'demo', demo: true, photoBase: base },
      objects, detections: detections || [], events: events || [], work_orders: workOrders || [],
      quality, runs: quality ? [{ run_id: quality.run_id, modified: quality.generated_at || null }] : [],
      user: meta?.user || { login: 'dispatcher', display_name: 'Диспетчер (демо)', role: 'dispatcher', permissions: ['objects_read', 'review', 'stats_read', 'work_orders_manage'] },
    }, tax);
    return this.dataset;
  }

  /** Reloads the original demo files, dropping local decisions. */
  async reset() { return this.load(); }

  /**
   * Demo live feed: every `intervalMs` a random object gets a new pass (mostly «норма»,
   * sometimes a defect into the queue). Returns a stop function.
   */
  simulate({ intervalMs = 8000, defectShare = 0.25 } = {}) {
    const tax = this.taxonomy;
    const defects = tax.defects();
    const tick = () => {
      const ds = this.dataset;
      const pool = ds.objects.filter((o) => o.status !== 'defect');
      if (!pool.length) return;
      const o = pool[Math.floor(Math.random() * pool.length)];
      const isDefect = Math.random() < defectShare;
      const cls = isDefect ? (defects.filter((c) => !c.kind || c.kind === o.kind)[0] ?? defects[0]) : null;
      const conf = isDefect ? 0.7 + Math.random() * 0.25 : 0.86 + Math.random() * 0.12;
      const now = new Date().toISOString();
      const { events } = ingestDetection(ds, {
        id: stableId('sim', o.id, now), frame_id: stableId('simf', o.id, now), object_id: o.id, object_kind: o.kind,
        defect_type: cls?.key ?? null, severity: cls ? cls.severity : null, confidence: +conf.toFixed(3),
        crop_uri: o.photo, lat: o.lat, lon: o.lon, created_at: now,
        rationale: cls ? `${cls.label} ${Math.round(conf * 100)}% · Норма ${Math.round((1 - conf) * 80)}% · демо-проезд` : `Норма, подтверждено автоматически · Норма ${Math.round(conf * 100)}% · демо-проезд`,
        review_state: cls ? 'pending' : 'confirmed',
      }, { source: 'demo.simulate' });
      this.emit(events);
    };
    const t = setInterval(tick, intervalMs);
    return () => clearInterval(t);
  }
}

/* ------------------------------------------------------------------ file */

const FILES_KEY = 'import.files';
const REVIEWS_KEY = 'import.reviews';
const BASE_KEY = 'poputno.baseDataset';

/**
 * Results file dropped into the page (CSV/XLSX/JSON/JSONL, plus photos).
 * Raw files are persisted in IndexedDB and re-parsed on load, so editing data/taxonomy.json
 * re-labels everything without re-importing. Photos are stored as blobs keyed by file name.
 */
export class FileSource extends MemorySource {
  kind = 'file';
  label = 'Датасет и загрузки';
  capabilities = { review: true, live: false, login: false, import: true };
  /** @type {{reports:any[], summary:any}|null} last import result */
  lastImport = null;
  photoUrls = new Map();

  /** The bundled organizers' dataset is shown unless switched off on «Загрузить данные». */
  get baseEnabled() { return storage.get(BASE_KEY) !== 'off'; }
  setBaseEnabled(on) { if (on) storage.remove(BASE_KEY); else storage.set(BASE_KEY, 'off'); }

  async baseFiles() {
    if (!this.baseEnabled || !this.cfg.datasetUrl) return [];
    if (!this._base) {
      this._base = fetchJSON(this.cfg.datasetUrl)
        .then((j) => [{ name: 'Датасет организаторов', content: j, base: true }])
        .catch((e) => { console.warn('[file source] bundled dataset not loaded:', e.message); this._base = null; return []; });
    }
    return this._base;
  }

  async load() {
    this.taxonomy = this.taxonomy || await loadTaxonomy(this.cfg.taxonomyUrl);
    const own = this._memoryFiles || (await idb.get(FILES_KEY)) || [];
    const files = [...(await this.baseFiles()), ...own];
    if (!files.length) {
      this.dataset = emptyDataset(this.taxonomy, { source: 'file', note: 'Данных нет', photoBase: this.cfg.photoBase });
      this.lastImport = null;
      return this.dataset;
    }
    const { chunks } = await parseFiles(files, this.taxonomy);
    const reviews = (await idb.get(REVIEWS_KEY)) || [];
    this.lastImport = buildDataset(chunks, this.taxonomy, { reviews, photoBase: this.cfg.photoBase, meta: { importedAt: own[0]?.savedAt ?? null } });
    this.dataset = this.lastImport.dataset;
    this.dataset.meta.files = files.map((f) => f.name);
    this.dataset.meta.base = files.some((f) => f.base);
    this.dataset.meta.own = own.length;
    return this.dataset;
  }

  /** Own (browser) files only, without the bundled dataset. */
  async ownFiles() { return this._memoryFiles || (await idb.get(FILES_KEY)) || []; }

  /**
   * Stores rows produced by the live model (inference.js checkPhoto) as one more results file,
   * with their photos, and rebuilds the dataset: the frames appear in the queue at once.
   * @param {{row:object, preview:string, storeName:string}[]} results
   * @param {string} [title]
   */
  async addChecked(results, title = 'Проверка фото') {
    const ok = results.filter((r) => r.row);
    if (!ok.length) return this.dataset;
    for (const r of ok) {
      const blob = r.blob || (await fetch(r.preview).then((x) => x.blob()));
      await idb.set(fileKey(r.storeName), blob, 'photos');
    }
    const at = new Date().toISOString();
    const entry = {
      name: `${title} · ${ok.length} фото · ${at.slice(11, 19)}`,
      content: { format: 'poputno.results', version: 1, model: ok[0].row.model, rows: ok.map((r) => r.row) },
      savedAt: at, live: true,
    };
    const prev = await this.ownFiles();
    const next = [...prev, entry];
    if (!(await idb.set(FILES_KEY, next))) this._memoryFiles = next;
    this.photoUrls.forEach((u) => URL.revokeObjectURL?.(u));
    this.photoUrls.clear();
    return this.load();
  }

  /** @returns {Promise<boolean>} */
  async hasData() { return ((await idb.get(FILES_KEY)) || []).length > 0; }

  /**
   * Imports dropped files. Data files replace the previous import (unless append=true);
   * images are added to the photo store.
   * @param {FileList|File[]|{name:string, content:string|ArrayBuffer|object}[]} files
   * @param {{append?:boolean, mapping?:Record<string,string>}} [opts] mapping = manual column override
   * @returns {Promise<{reports:any[], summary:any, photos:number}>}
   */
  async importFiles(files, { append = true, mapping } = {}) {
    this.taxonomy = this.taxonomy || await loadTaxonomy(this.cfg.taxonomyUrl);
    const list = Array.from(files || []);
    const data = [];
    let photos = 0;
    for (const f of list) {
      if (f instanceof Blob && isImageFile(f.name)) {
        if (await idb.set(fileKey(f.name), f, 'photos')) photos++;
        continue;
      }
      let content = f.content;
      if (content === undefined && f instanceof Blob) content = /\.(xlsx|xls|xlsm)$/i.test(f.name) ? await f.arrayBuffer() : await f.text();
      data.push({ name: f.name, content, mapping, savedAt: new Date().toISOString() });
    }
    if (data.length) {
      const prev = append ? ((await idb.get(FILES_KEY)) || []) : [];
      if (!append) await idb.del(REVIEWS_KEY);
      const ok = await idb.set(FILES_KEY, [...prev, ...data]);
      this._memoryFiles = null;
      if (!ok) console.warn('[file source] could not persist import, keeping it in memory only');
      if (!ok) this._memoryFiles = [...prev, ...data];
    }
    this.photoUrls.forEach((u) => URL.revokeObjectURL?.(u));
    this.photoUrls.clear();
    await this.load();
    return { reports: this.lastImport?.reports || [], summary: this.lastImport?.summary || null, photos };
  }

  /** Forgets the imported files, decisions and photos. */
  async clear() {
    await idb.del(FILES_KEY);
    await idb.del(REVIEWS_KEY);
    await idb.clear('photos');
    this._memoryFiles = null;
    return this.load();
  }

  async _afterReview(objectId, r) {
    const list = (await idb.get(REVIEWS_KEY)) || [];
    list.push({ objectId, ...r, at: new Date().toISOString() });
    await idb.set(REVIEWS_KEY, list);
  }

  /** Stored photo blob (by file name) → object URL; otherwise the URL itself (data/photos/…). */
  async resolvePhoto(uri) {
    if (!uri) return null;
    const key = fileKey(uri);
    if (this.photoUrls.has(key)) return this.photoUrls.get(key);
    const blob = await idb.get(key, 'photos');
    if (blob && typeof URL !== 'undefined' && URL.createObjectURL) {
      const u = URL.createObjectURL(blob);
      this.photoUrls.set(key, u);
      return u;
    }
    return uri;
  }

  /**
   * Helper: wires drag-and-drop + an optional <input type=file> to importFiles.
   * @param {HTMLElement} target
   * @param {{input?:HTMLInputElement, onImport?:(res:any)=>void, onError?:(e:Error)=>void, onDragState?:(over:boolean)=>void}} handlers
   * @returns {() => void} detach
   */
  bindDropTarget(target, { input, onImport, onError, onDragState } = {}) {
    const run = (files) => this.importFiles(files).then(onImport, onError || console.error);
    const over = (e) => { e.preventDefault(); onDragState?.(true); };
    const leave = () => onDragState?.(false);
    const drop = async (e) => {
      e.preventDefault();
      onDragState?.(false);
      try {
        const files = await droppedFiles(e.dataTransfer);
        if (files.length) await run(files);
      } catch (err) { (onError || console.error)(err); }
    };
    const change = () => { if (input.files?.length) run(input.files); input.value = ''; };
    target.addEventListener('dragover', over);
    target.addEventListener('dragleave', leave);
    target.addEventListener('drop', drop);
    input?.addEventListener('change', change);
    return () => {
      target.removeEventListener('dragover', over);
      target.removeEventListener('dragleave', leave);
      target.removeEventListener('drop', drop);
      input?.removeEventListener('change', change);
    };
  }
}

/** Files from a drop event, walking dropped folders recursively (dataset folder with photos). */
async function droppedFiles(dt) {
  const items = Array.from(dt?.items || []);
  const entries = items.map((it) => it.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length || !entries.some((e) => e.isDirectory)) return Array.from(dt?.files || []);
  const out = [];
  const walk = async (entry) => {
    if (entry.isFile) { out.push(await new Promise((res, rej) => entry.file(res, rej))); return; }
    const reader = entry.createReader();
    for (;;) {
      const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const e of batch) await walk(e);
    }
  };
  for (const e of entries) await walk(e);
  return out;
}

/* ------------------------------------------------------------------ api */

/**
 * Rust backend adapter. Bearer token in localStorage (config.tokenKey); on 401 tries
 * POST /api/auth/refresh once (refresh cookie, works when the site is served same-origin).
 */
export class ApiSource {
  kind = 'api';
  label = 'API';
  capabilities = { review: true, live: true, login: true, import: false };

  constructor(cfg) {
    this.cfg = cfg;
    this.base = cfg.apiBase;
    this.dataset = null;
    this.taxonomy = null;
    this.listeners = new Set();
    this.photoUrls = new Map();
    this._refreshTimers = new Map();
  }

  get token() { return storage.get(this.cfg.tokenKey); }
  set token(v) { if (v) storage.set(this.cfg.tokenKey, v); else storage.remove(this.cfg.tokenKey); }

  /** fetch with bearer token, JSON in/out, one refresh retry on 401. */
  async request(path, { method = 'GET', body, raw = false, retry = true } = {}) {
    const headers = {};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(this.base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: 'include' });
    } catch (e) {
      throw new DataError('API недоступно: нет связи с сервером', { cause: e });
    }
    if (res.status === 401 && retry && !path.startsWith('/api/auth/')) {
      if (await this.refreshToken()) return this.request(path, { method, body, raw, retry: false });
    }
    if (!res.ok) {
      const msg = { 401: 'Нужен вход', 403: 'Нет прав на это действие', 404: 'Не найдено' }[res.status] || `Ошибка API ${res.status}`;
      let detail = '';
      try { detail = (await res.json()).error || ''; } catch { /* no body */ }
      throw new DataError(detail ? `${msg}: ${detail}` : msg, { status: res.status });
    }
    if (raw) return res;
    if (res.status === 202 || res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async refreshToken() {
    try {
      const r = await this.request('/api/auth/refresh', { method: 'POST', body: {}, retry: false });
      if (r?.access_token) { this.token = r.access_token; return true; }
    } catch { /* fall through */ }
    return false;
  }

  /** @returns {Promise<object>} user (id, login, display_name, role, permissions[]) */
  async login(login, password) {
    const r = await this.request('/api/auth/login', { method: 'POST', body: { login, password }, retry: false });
    this.token = r.access_token;
    if (this.dataset) this.dataset.user = r.user;
    return r.user;
  }

  async logout() {
    try { await this.request('/api/auth/logout', { method: 'POST', retry: false }); } catch { /* ignore */ }
    this.token = null;
  }

  async load() {
    const tax = await this.request('/api/taxonomy').then(createTaxonomy).catch(() => loadTaxonomy(this.cfg.taxonomyUrl));
    this.taxonomy = tax;
    const [objects, queue, quality, user] = await Promise.all([
      this.request('/api/objects'),
      this.request('/api/queue').catch(() => []),
      this.request('/api/quality').catch(() => null),
      this.request('/api/auth/me').catch(() => null),
    ]);
    this.dataset = createDataset({
      meta: { source: 'api', demo: false, note: null, photoBase: '', apiBase: this.base },
      objects, detections: queue, quality, runs: quality?.runs || [], user,
    }, tax);
    return this.dataset;
  }
  async refresh() { return this.load(); }

  async getObjects(filter = {}) { return selectObjects(this.dataset, filter); }

  /** Fetches /api/objects/{id} + /history and merges them (detections, events, work orders). */
  async getObject(id) {
    const enc = encodeURIComponent(id);
    const [details, history] = await Promise.all([
      this.request(`/api/objects/${enc}`),
      this.request(`/api/objects/${enc}/history`).catch(() => []),
    ]);
    return mergeObjectDetails(this.dataset, { object: details.object, detections: details.detections, events: (history || []).map((e) => ({ ...e, object_id: id })) });
  }

  async getHistory(id) {
    const o = selectObject(this.dataset, id);
    if (!o?.detailsLoaded) await this.getObject(id);
    return selectTimeline(this.dataset, { objectId: id });
  }

  /** GET /api/queue; detections no longer pending on the server are marked as decided. */
  async getQueue() {
    const rows = await this.request('/api/queue');
    const tax = this.taxonomy;
    const ids = new Set(rows.map((r) => String(r.id)));
    for (const d of this.dataset.detections) if (d.isPending && !ids.has(d.id)) d.isPending = false;
    for (const r of rows) upsertDetection(this.dataset, r);
    for (const o of this.dataset.objects) deriveObject(o, tax);
    return selectQueue(this.dataset);
  }

  /** Client-side aggregates over /api/objects (the server's /api/stats only has counts by status). */
  async getStats() { return selectStats(this.dataset); }

  /** GET /api/quality?run= → normalized Quality (null if no runs). */
  async getQuality(runId) {
    const q = await this.request(`/api/quality${runId ? `?run=${encodeURIComponent(runId)}` : ''}`);
    this.dataset.quality = normalizeQuality(q, this.taxonomy);
    this.dataset.runs = q?.runs || [];
    return this.dataset.quality;
  }
  async getTaxonomy() { return this.taxonomy; }
  async getUser() {
    try { this.dataset && (this.dataset.user = await this.request('/api/auth/me')); } catch { return null; }
    return this.dataset?.user ?? null;
  }
  async getEvents(f = {}) { return selectTimeline(this.dataset, f); }

  /**
   * POST /api/objects/{id}/reviews. The server applies it via Kafka; the object is re-fetched shortly after.
   * @param {{detectionId?:string, decision:'confirm'|'reject'|'need_recapture', rejectReason?:string|{other:string}, comment?:string}} r
   */
  async review(objectId, r) {
    await this.request(`/api/objects/${encodeURIComponent(objectId)}/reviews`, {
      method: 'POST',
      body: { detection_id: r.detectionId ?? null, decision: r.decision, reject_reason: r.rejectReason ?? null, comment: r.comment ?? null },
    });
    const det = r.detectionId && this.dataset.detections.find((d) => d.id === r.detectionId);
    if (det) { det.isPending = false; det.reviewState = r.decision; det.reviewStateLabel = this.taxonomy.reviewStateLabel(r.decision); }
    this._scheduleRefresh(objectId, 600);
    return { ok: true, events: [] };
  }

  _scheduleRefresh(objectId, ms = 400) {
    clearTimeout(this._refreshTimers.get(objectId));
    this._refreshTimers.set(objectId, setTimeout(() => {
      this._refreshTimers.delete(objectId);
      this.getObject(objectId).catch(() => {});
    }, ms));
  }

  /**
   * SSE /api/stream with a 60-s ticket; reconnects with a fresh ticket.
   * Callback gets (TimelineEvent, dataset). Returns unsubscribe.
   */
  subscribe(cb) {
    this.listeners.add(cb);
    if (!this._es && !this._connecting) this._connect();
    return () => {
      this.listeners.delete(cb);
      if (!this.listeners.size) { this._closed = true; this._es?.close(); this._es = null; clearTimeout(this._retry); }
    };
  }

  async _connect() {
    this._closed = false;
    this._connecting = true;
    const again = (ms) => { this._es?.close(); this._es = null; if (!this._closed) this._retry = setTimeout(() => this._connect(), ms); };
    try {
      const { ticket } = await this.request('/api/auth/stream-ticket', { method: 'POST', body: {} });
      if (this._closed) return;
      const es = new EventSource(`${this.base}/api/stream?ticket=${encodeURIComponent(ticket)}`);
      this._es = es;
      es.onmessage = (m) => {
        let env;
        try { env = JSON.parse(m.data); } catch { return; }
        const events = applyEvent(this.dataset, env, { project: false });
        if (events[0]?.type === 'observed' && events[0].objectId) this._scheduleRefresh(events[0].objectId);
        for (const e of events) for (const fn of this.listeners) { try { fn(e, this.dataset); } catch (err) { console.error(err); } }
      };
      es.onerror = () => again(2000);
    } catch {
      again(5000);
    } finally {
      this._connecting = false;
    }
  }

  /** /api/media needs the bearer token: fetch as blob → object URL (cached). Other URLs pass through. */
  async resolvePhoto(uri) {
    if (!uri) return null;
    if (!uri.startsWith('/api/')) return uri;
    if (this.photoUrls.has(uri)) return this.photoUrls.get(uri);
    try {
      const res = await this.request(uri, { raw: true });
      const u = URL.createObjectURL(await res.blob());
      this.photoUrls.set(uri, u);
      return u;
    } catch {
      return null;
    }
  }
}

/* ------------------------------------------------------------------ factory */

/**
 * Creates (does not load) the adapter for a kind.
 * @param {'demo'|'api'|'file'} [kind]
 * @param {object} [overrides] config overrides
 */
export function createSource(kind, overrides = {}) {
  const cfg = getConfig({ ...overrides, ...(kind ? { source: kind } : {}) });
  if (cfg.source === 'api') return new ApiSource(cfg);
  if (cfg.source === 'file') return new FileSource(cfg);
  return new DemoSource(cfg);
}

/**
 * Creates and loads the configured source. If the API is unreachable and fallback is on,
 * opens the demo source instead and sets dataset.meta.fallbackFrom / fallbackReason so the UI
 * can say so (never silently: meta.demo is true).
 * @param {{kind?:'demo'|'api'|'file', fallback?:boolean} & object} [opts]
 */
export async function openSource({ kind, fallback = true, ...overrides } = {}) {
  const src = createSource(kind, overrides);
  try {
    await src.load();
    return src;
  } catch (e) {
    if (!fallback || src.kind === 'demo') throw e;
    console.warn(`[source] ${src.kind} failed, falling back to the dataset:`, e.message);
    const demo = createSource('file', overrides);
    await demo.load();
    demo.dataset.meta.fallbackFrom = src.kind;
    demo.dataset.meta.fallbackReason = e.message;
    demo.failed = src;
    return demo;
  }
}

/** Current source kind from URL/localStorage/config. */
export function currentSourceKind() { return getConfig().source; }

/** Persists the source choice (and optional API base) and reloads the page. */
export function switchSource(kind, { apiBase, reload = true } = {}) {
  saveSetting('source', kind);
  if (apiBase !== undefined) saveSetting('apiBase', apiBase);
  if (reload && globalThis.location) {
    const u = new URL(location.href);
    u.searchParams.delete('source');
    location.href = u.toString();
  }
}
