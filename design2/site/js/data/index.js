/**
 * Data layer entry point for the UI: `import * as data from './js/data/index.js'`.
 * See data/README.md for the import contract.
 */
export { openSource, createSource, switchSource, currentSourceKind, DemoSource, FileSource, ApiSource, DataError, DEMO_NOTE } from './source.js';
export {
  selectObjects, selectObject, selectQueue, selectStats, selectTimeline, selectBeforeAfter, selectMapPoints,
  selectBounds, selectWorkOrders, selectFacets, selectQuality, fmt, photoUrl,
  createDataset, normalizeQuality, computeQualityReport, chooseRoute,
} from './model.js';
export {
  createTaxonomy, loadTaxonomy, STATUS, STATUS_ORDER, SEVERITY, SEVERITY_ORDER, SEVERITY_RANK, KIND, KIND_LONG,
  ROUTE, REVIEW_STATE, DECISION, REJECT_REASON, EVENT, ROLE,
} from './taxonomy.js';
export { parseImport, parseCSV, mapColumns, rowsToDetections, buildDataset, FIELD_SYNONYMS } from './import.js';
export { getConfig, saveSetting, DEFAULTS } from './config.js';
