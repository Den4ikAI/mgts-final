/**
 * The pure data layer of the «Попутно» site (design2/site/js/data), reused as is:
 * normalizers, selectors, taxonomy helpers, formatting. Plain JS (allowJs), exposed as `any`
 * so templates can use the same objects the site's views used.
 */
// @ts-ignore: plain JS module
import * as Model from './legacy/model.js';
// @ts-ignore: plain JS module
import * as Taxonomy from './legacy/taxonomy.js';

export const M: any = Model;
export const T: any = Taxonomy;
/** fmt.int / pct / conf / time / date / dateTime / ago … */
export const fmt: any = (Model as any).fmt;

/** Dataset: { meta, taxonomy, objects, byId, detections, unmatched, events, workOrders, quality, runs, user }. */
export type Dataset = any;
/** Normalized detection (see model.js normalizeDetection). */
export type Det = any;
/** Normalized object (see model.js normalizeObject/deriveObject). */
export type Obj = any;
