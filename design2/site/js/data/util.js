/** Small shared helpers: safe storage, text normalization, number/date parsing. */

/** localStorage that never throws (private mode, blocked site data, previews). */
export const storage = {
  get(key) {
    try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
  },
  set(key, value) {
    try { globalThis.localStorage?.setItem(key, value); return true; } catch { return false; }
  },
  remove(key) {
    try { globalThis.localStorage?.removeItem(key); } catch { /* ignore */ }
  },
  getJSON(key) {
    const v = this.get(key);
    if (v == null) return null;
    try { return JSON.parse(v); } catch { return null; }
  },
  setJSON(key, value) {
    try { return this.set(key, JSON.stringify(value)); } catch { return false; }
  },
};

const IDB_NAME = 'poputno';
const IDB_STORES = ['kv', 'photos'];

function idbOpen() {
  return new Promise((resolve, reject) => {
    try {
      if (!globalThis.indexedDB) return reject(new Error('IndexedDB unavailable'));
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        for (const s of IDB_STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

function idbTx(store, mode, fn) {
  return idbOpen().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const st = tx.objectStore(store);
    const out = fn(st);
    tx.oncomplete = () => { db.close(); resolve(out instanceof IDBRequest ? out.result : out); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  }));
}

/**
 * IndexedDB key/value store with a localStorage fallback for small values.
 * Every method resolves (never rejects): failures return null/false.
 */
export const idb = {
  async get(key, store = 'kv') {
    try {
      return (await idbTx(store, 'readonly', (st) => st.get(key))) ?? null;
    } catch {
      return store === 'kv' ? storage.getJSON(`poputno.idb.${key}`) : null;
    }
  },
  async set(key, value, store = 'kv') {
    try {
      await idbTx(store, 'readwrite', (st) => st.put(value, key));
      return true;
    } catch {
      return store === 'kv' ? storage.setJSON(`poputno.idb.${key}`, value) : false;
    }
  },
  async del(key, store = 'kv') {
    try { await idbTx(store, 'readwrite', (st) => st.delete(key)); } catch { /* ignore */ }
    if (store === 'kv') storage.remove(`poputno.idb.${key}`);
  },
  async clear(store) {
    try { await idbTx(store, 'readwrite', (st) => st.clear()); } catch { /* ignore */ }
  },
  async keys(store) {
    try { return (await idbTx(store, 'readonly', (st) => st.getAllKeys())) || []; } catch { return []; }
  },
};

/** Lowercase, ё→е, collapse punctuation/spaces to single "_" — for header and value matching. */
export function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\s\-./\\,;:()[\]{}"'«»№#]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** "0,93" / "93%" / 0.93 → number or null. */
export function toNumber(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  const percent = s.endsWith('%');
  if (percent) s = s.slice(0, -1);
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return percent ? n / 100 : n;
}

/** Confidence-like value in [0,1]: accepts 0.93, "93%", 93. */
export function toProb(v) {
  const n = toNumber(v);
  if (n == null) return null;
  if (n > 1 && n <= 100) return n / 100;
  return n < 0 || n > 1 ? null : n;
}

/**
 * Parses dates: ISO, "26.11.2026 10:42", "2026-11-26 10:42", unix seconds/ms.
 * Dates without a zone are treated as Moscow time (UTC+3). Returns ISO string or null.
 */
export function toIso(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === 'number' || /^\d{9,13}$/.test(String(v).trim())) {
    const n = Number(v);
    const d = new Date(n < 1e11 ? n * 1000 : n);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const s = String(v).trim();
  const ru = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (ru) {
    const [, d, m, y, hh = '12', mm = '00', ss = '00'] = ru;
    const year = y.length === 2 ? `20${y}` : y;
    return toIso(`${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${hh.padStart(2, '0')}:${mm}:${ss}+03:00`);
  }
  let iso = s.replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) iso += 'T12:00:00';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(iso)) iso += '+03:00';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Basename of a path or URL: "img/001.JPG" → "001.JPG". */
export function basename(p) {
  return String(p ?? '').replace(/\\/g, '/').split(/[?#]/)[0].split('/').pop() || '';
}

/** File key used to match photos to rows, like ml/labels.py: basename without extension, lowercase. */
export function fileKey(p) {
  return basename(p).replace(/\.[^.]+$/, '').toLowerCase();
}

/** Deterministic short id (FNV-1a, hex) — stable across re-imports of the same data. */
export function stableId(...parts) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const s = parts.join('␟');
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/** fetch JSON with a readable error. */
export async function fetchJSON(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const err = new Error(`${res.status} ${res.statusText} · ${url}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** Max by key (null-safe). */
export function maxBy(list, fn) {
  let best = null;
  let bestV = -Infinity;
  for (const x of list) {
    const v = fn(x);
    if (v != null && v > bestV) { bestV = v; best = x; }
  }
  return best;
}

/** Count occurrences into a plain object. */
export function countBy(list, fn) {
  const out = {};
  for (const x of list) {
    const k = fn(x);
    if (k == null) continue;
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}
