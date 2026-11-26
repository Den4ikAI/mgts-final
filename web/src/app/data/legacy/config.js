/**
 * Data-layer configuration. Every value can be overridden, in priority order:
 *   1. URL params:   ?source=demo|api|file  ?api=http://host:8080  ?photos=./data/photos/
 *   2. localStorage: poputno.source, poputno.apiBase, poputno.photoBase
 *   3. defaults below.
 * Paths are relative to the page (site/index.html), not to this module.
 */

import { storage } from './util.js';

export const DEFAULTS = Object.freeze({
  /** file (bundled dataset + browser imports) | api */
  source: 'file',
  /** Rust API origin; '' = same origin (site served behind the same proxy as /api). */
  apiBase: '',
  /** Folder with demo JSON files. */
  demoBase: './data/demo/',
  /** Single taxonomy file used by every source (api prefers /api/taxonomy, falls back here). */
  taxonomyUrl: './data/taxonomy.json',
  /** Organizers' dataset bundled with the site (data/dataset/build.py), shown under the browser imports. */
  datasetUrl: './data/dataset/results.json',
  /** Where photos referenced by bare file names live (file source). */
  photoBase: './data/photos/',
  /** localStorage key for the API bearer token. */
  tokenKey: 'poputno.token',
});

export const SOURCE_KINDS = ['demo', 'api', 'file'];

/** Reads ?param from the current page URL (safe outside browsers). */
function urlParam(name) {
  try {
    return new URLSearchParams(globalThis.location?.search || '').get(name);
  } catch {
    return null;
  }
}

/**
 * Effective configuration.
 * @param {Partial<typeof DEFAULTS>} [overrides]
 * @returns {typeof DEFAULTS}
 */
export function getConfig(overrides = {}) {
  const pick = (key, param) => overrides[key] ?? urlParam(param) ?? storage.get(`poputno.${key}`) ?? DEFAULTS[key];
  const cfg = {
    ...DEFAULTS,
    source: pick('source', 'source'),
    apiBase: pick('apiBase', 'api'),
    photoBase: pick('photoBase', 'photos'),
    demoBase: overrides.demoBase ?? DEFAULTS.demoBase,
    taxonomyUrl: overrides.taxonomyUrl ?? urlParam('taxonomy') ?? DEFAULTS.taxonomyUrl,
    tokenKey: overrides.tokenKey ?? DEFAULTS.tokenKey,
    datasetUrl: overrides.datasetUrl ?? DEFAULTS.datasetUrl,
  };
  // the demo set (invented objects and coordinates) is removed: an old stored 'demo' choice opens the dataset
  if (cfg.source === 'demo') cfg.source = 'file';
  if (!SOURCE_KINDS.includes(cfg.source)) cfg.source = DEFAULTS.source;
  cfg.apiBase = String(cfg.apiBase || '').replace(/\/+$/, '');
  return cfg;
}

/** Remembers a setting for the next page load (source, apiBase, photoBase). */
export function saveSetting(key, value) {
  if (value == null || value === '') storage.remove(`poputno.${key}`);
  else storage.set(`poputno.${key}`, String(value));
}
