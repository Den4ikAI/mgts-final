/** No-UI tests of the data layer. Open js/data/selftest.html over http. */

import { openSource, createSource, ApiSource, FileSource } from './source.js';
import { loadTaxonomy, createTaxonomy } from './taxonomy.js';
import {
  selectObjects, selectObject, selectQueue, selectStats, selectTimeline, selectFacets, selectBeforeAfter,
  selectMapPoints, selectWorkOrders, normalizeBBox, normalizeSeverity, fmt,
} from './model.js';
import { parseImport, parseFiles, buildDataset, parseCSV, mapColumns } from './import.js';
import { getConfig } from './config.js';

const ROOT = '../../';
const CFG = { demoBase: `${ROOT}data/demo/`, taxonomyUrl: `${ROOT}data/taxonomy.json`, photoBase: `${ROOT}data/photos/` };

const results = [];
let current = '';
function ok(cond, name, detail = '') {
  results.push({ group: current, name, pass: !!cond, detail: cond ? '' : String(detail) });
}
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }
async function group(name, fn) {
  current = name;
  try { await fn(); } catch (e) { ok(false, `${name}: threw`, e.stack || e.message); }
}

/* ------------------------------------------------------------------ */

await group('taxonomy', async () => {
  const tax = await loadTaxonomy(CFG.taxonomyUrl);
  ok(!tax.isFallback, 'data/taxonomy.json loaded');
  eq(tax.label('open_hatch'), 'Открытый люк', 'label by key');
  eq(tax.label(null), 'Норма', 'null → Норма');
  eq(tax.label('graffiti'), 'graffiti', 'unknown key shown as is');
  eq(tax.match('Открытый люк'), 'open_hatch', 'match Russian label');
  eq(tax.match('отсутствует крышка'), 'open_hatch', 'match alias');
  eq(tax.match('Норма'), null, 'match ok → null');
  eq(tax.match('исправен'), null, 'match generic ok word');
  eq(tax.match('не виден'), 'none', 'match none');
  eq(tax.match('трещина обоймы'), undefined, 'unknown value → undefined');
  eq(tax.kindOf('pole_tilt'), 'dual_pole', 'kind of class');
  eq(tax.defaultSeverity('open_hatch'), 'critical', 'default severity');
  ok(tax.recommend('open_hatch', 'critical').includes('немедленно'), 'recommendation with deadline', tax.recommend('open_hatch', 'critical'));
  ok(tax.recommend('graffiti', 'low').includes('плановое ТО'), 'generic recommendation for unknown class');
  eq(tax.statusLabel('critical'), 'Критично', 'status label');
  const custom = createTaxonomy({ classes: { ok: { label: 'Норма', ok: true }, rust: { label: 'Коррозия', kind: 'dual_pole', ok: false } } });
  eq(custom.label('rust'), 'Коррозия', 'replaceable taxonomy');
  eq(createTaxonomy(null).isFallback, true, 'fallback taxonomy on bad JSON');
});

await group('normalizers', async () => {
  eq(normalizeBBox({ x: 0, y: 0, w: 1, h: 1 }), null, 'full-frame bbox → null');
  eq(normalizeBBox('0.1,0.2,0.3,0.4'), { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, 'bbox from string');
  eq(normalizeBBox([10, 20, 30, 40]), null, 'pixel bbox without size → null');
  eq(normalizeSeverity('Угроза жизни'), 'critical', 'severity ru');
  eq(normalizeSeverity(2), 'medium', 'severity number');
  eq(fmt.dateTime('2026-11-26T07:42:00Z'), '26.11 10:42', 'fmt.dateTime Moscow');
  eq(fmt.conf(0.953), '0.95', 'fmt.conf');
  eq(fmt.pct(0.846), '84,6%', 'fmt.pct');
  eq(fmt.dateTime(null), 'нет', 'fmt null');
  eq(getConfig({ source: 'nope' }).source, 'demo', 'bad source → demo');
});

let demo;
await group('demo source', async () => {
  demo = await openSource({ kind: 'demo', fallback: false, ...CFG });
  const ds = demo.dataset;
  eq(demo.kind, 'demo', 'kind');
  ok(ds.meta.demo === true && ds.meta.note === 'Демо-данные, не датасет организаторов', 'flagged as demo', JSON.stringify(ds.meta));
  ok(ds.objects.length >= 55 && ds.objects.length <= 65, '~60 objects', ds.objects.length);
  const st = selectStats(ds);
  for (const s of ['ok', 'suspected', 'defect', 'critical', 'not_observed']) ok(st.byDisplayStatus[s] > 0, `display status ${s} present`, JSON.stringify(st.byDisplayStatus));
  eq(Object.values(st.byDisplayStatus).reduce((a, b) => a + b, 0), st.total, 'display statuses sum to total');
  ok(st.byKind.cable_well?.total > 0 && st.byKind.dual_pole?.total > 0, 'both kinds');
  ok(st.byDistrict.length >= 5, 'districts aggregated', st.byDistrict.length);
  eq(st.workOrders, { open: 3, closed: 2 }, 'work orders open/closed');
  ok(st.withCoords === st.total, 'all demo objects have coordinates');

  const q = selectQueue(ds);
  ok(q.length >= 10 && q.length <= 14, 'queue ~12', q.length);
  ok(q[0].isCritical && q[0].object, 'queue: critical first, linked to object');
  const ranks = q.map((d) => ({ critical: 0, high: 1, medium: 2 }[d.severity] ?? 3));
  ok(ranks.every((r, i) => i === 0 || r >= ranks[i - 1]), 'queue sorted by severity', ranks.join(','));
  ok(q.every((d) => d.photo && d.photo.endsWith('.svg')), 'queue items have photos');

  // status consistency: last status_changed event = object status
  const bad = ds.objects.filter((o) => {
    const sc = o.events.filter((e) => e.type === 'status_changed').pop();
    return sc ? sc.payload.to !== o.status : o.status !== 'not_observed';
  });
  ok(!bad.length, 'statuses consistent with event history', bad.map((o) => o.id).join(','));

  const crit = selectObjects(ds, { displayStatus: 'critical' });
  ok(crit.length >= 3 && crit.every((o) => o.maxSeverity === 'critical'), 'critical selector');
  ok(crit.every((o) => o.recommendation && o.recommendation.length > 5), 'recommendations present');
  const sorted = selectObjects(ds);
  eq(sorted[0].displayStatus, 'critical', 'priority sort: critical first');
  eq(sorted[sorted.length - 1].displayStatus, 'ok', 'priority sort: ok last');
  ok(selectObjects(ds, { q: 'авиамоторная' }).length > 0, 'text search by address');
  ok(selectObjects(ds, { kind: 'dual_pole' }).every((o) => o.kind === 'dual_pole'), 'kind filter');

  const multi = ds.objects.find((o) => o.passes >= 3);
  ok(multi, 'object with 3+ passes');
  const ba = selectBeforeAfter(ds.objects.find((o) => o.workOrders.some((w) => w.state === 'closed')));
  ok(ba.before && ba.after && ba.before !== ba.after, 'before/after for repaired object');
  const closed = selectWorkOrders(ds, { state: 'closed' })[0];
  ok(closed?.afterPhoto?.endsWith('-after.svg') && closed.object?.status === 'ok', 'closed WO has after photo, object ok', JSON.stringify(closed?.afterPhoto));
  const defObj = ds.objects.find((o) => o.status === 'defect');
  const tl = selectTimeline(ds, { objectId: defObj.id });
  ok(['observed', 'status_changed', 'reviewed'].every((t) => tl.some((e) => e.type === t)), 'object timeline has observed/status/reviewed');
  ok(tl.every((e, i) => i === 0 || (e.at || '') >= (tl[i - 1].at || '')), 'object timeline chronological');
  ok(tl.every((e) => e.label && e.text), 'events have label/text');
  const feed = selectTimeline(ds, { limit: 10 });
  ok(feed.length === 10 && feed[0].at >= feed[9].at, 'global feed newest first');
  eq(selectMapPoints(ds).length, ds.objects.length, 'map points');
  const f = selectFacets(ds);
  ok(f.hasCoords && f.hasHistory && f.hasBBoxes && f.districts.length >= 5, 'facets', JSON.stringify(f));
  ok(ds.detections.some((d) => d.bbox) && ds.detections.some((d) => !d.bbox), 'some detections with bbox, some without');
  ok(ds.objects.some((o) => o.status === 'not_observed' && !o.lastSeenAt), 'never-observed objects survive');

  const quality = await demo.getQuality();
  ok(quality?.available && quality.demo, 'quality report (demo)');
  eq(quality.confusion.matrix.length, quality.confusion.labels.length, 'confusion square');
  ok(quality.perClass.length === 8 && quality.perClass.every((c) => c.label), 'per-class P/R/F1');
  ok(quality.thresholdSweep.some((w) => w.current) && quality.thresholdSweep.some((w) => w.off), 'sweep current + off rows');
  ok(quality.kpi.defectRecall > 0.8 && quality.kpi.defectRecall < 1, 'kpi defect recall plausible', quality.kpi.defectRecall);

  const res = await fetch(q[0].photo);
  ok(res.ok && (await res.text()).includes('<svg'), 'demo SVG placeholder served');
});

await group('demo review', async () => {
  const ds = demo.dataset;
  const seen = [];
  const off = demo.subscribe((e) => seen.push(e.type));
  const before = selectQueue(ds).length;
  const first = selectQueue(ds)[0];
  await demo.review(first.objectId, { detectionId: first.id, decision: 'confirm' });
  eq(selectObject(ds, first.objectId).status, 'defect', 'confirm → defect');
  eq(selectQueue(ds).length, before - 1, 'queue shrinks');
  ok(seen.includes('reviewed') && seen.includes('status_changed'), 'subscriber got events', seen.join(','));
  const single = selectQueue(ds).find((d) => d.object.pendingCount === 1 && d.object.status === 'suspected');
  await demo.review(single.objectId, { detectionId: single.id, decision: 'reject', rejectReason: 'shadow' });
  eq(selectObject(ds, single.objectId).status, 'ok', 'reject (no other pending) → ok');
  const last = selectTimeline(ds, { objectId: single.objectId }).filter((e) => e.type === 'reviewed').pop();
  ok(last.text.includes('Тень'), 'reject reason in event text', last.text);
  const rec = selectQueue(ds)[0];
  await demo.review(rec.objectId, { detectionId: rec.id, decision: 'need_recapture' });
  eq(selectObject(ds, rec.objectId).status, 'suspected', 'need_recapture keeps status');
  off();
  const stop = demo.simulate({ intervalMs: 5 });
  const n0 = ds.detections.length;
  await new Promise((r) => setTimeout(r, 60));
  stop();
  ok(ds.detections.length > n0, 'simulate adds passes');
});

const tax = await loadTaxonomy(CFG.taxonomyUrl);

await group('import: organizers CSV + model output', async () => {
  const text = await (await fetch(`${ROOT}data/demo/sample-import.csv`)).text();
  const chunk = await parseImport(text, { filename: 'sample-import.csv', taxonomy: tax });
  const r = chunk.report;
  ok(r.ok, 'parsed', r.errors.join('; '));
  eq(r.format, 'csv', 'format csv (semicolon)');
  eq(r.rows, 10, 'rows');
  eq(r.kind, 'results', 'kind results');
  eq(r.mapping.file, 'Имя файла', 'map file');
  eq(r.mapping.objectId, 'ID объекта', 'map object id');
  eq(r.mapping.coords, 'Координаты', 'map coords');
  eq(r.mapping.kind, 'Тип объекта', 'map kind');
  eq(r.mapping.truth, 'Вид повреждения', 'map truth');
  eq(r.mapping.truthStatus, 'Статус', 'map status');
  eq(r.mapping.pred, 'Класс модели', 'map pred');
  eq(r.mapping.confidence, 'Уверенность', 'map confidence');
  eq(r.mapping.severity, 'Опасность', 'map severity');
  eq(r.mapping.timestamp, 'Дата съёмки', 'map timestamp');
  eq(r.unmappedColumns, ['Камера'], 'unmapped columns reported');
  ok(r.unmappedValues.truth['трещина обоймы'] === 1, 'unknown truth label reported');
  ok(r.unmappedValues.pred.graffiti === 1, 'unknown model class reported');
  ok(r.warnings.some((w) => w.includes('переставлены')), 'lat/lon swap warning');

  const { dataset: ds, summary } = buildDataset([chunk], tax, { photoBase: CFG.photoBase });
  eq(summary.objects, 9, 'objects grouped by id (+ IMG- fallback)');
  eq(summary.detections, 10, 'detections');
  const o414 = selectObject(ds, 'ККС-0414');
  eq([o414.displayStatus, o414.passes, o414.kind], ['critical', 2, 'cable_well'], 'two passes of a critical hatch');
  ok(Math.abs(o414.lat - 55.75162) < 1e-6 && Math.abs(o414.lon - 37.71721) < 1e-6, 'coords with decimal commas', `${o414.lat},${o414.lon}`);
  const o416 = selectObject(ds, 'ККС-0416');
  ok(o416.lat > 55 && o416.lon < 38, 'swapped coords fixed', `${o416.lat},${o416.lon}`);
  eq(selectObject(ds, 'ОДН-0107').hasCoords, false, 'object without coords survives');
  eq(selectObject(ds, 'ОДН-0107').status, 'ok', 'confident ok → auto ok');
  eq(selectObject(ds, 'ОДН-0106').defectType, 'cable_sag', 'Russian model label mapped');
  eq(selectObject(ds, 'ОДН-0106').confidence, 0.92, 'percent confidence');
  const img8 = selectObject(ds, 'IMG-img_008');
  ok(img8 && img8.defectLabel === 'graffiti', 'unknown class shown as is', img8?.defectLabel);
  eq(selectObject(ds, 'ККС-0418').status, 'not_observed', 'none → not observed');
  eq(o414.lastSeenAt, '2026-11-26T09:05:00.000Z', 'ru date parsed as Moscow time');
  ok(o414.photo.endsWith('data/photos/img_002.jpg'), 'photo from photoBase + file', o414.photo);
  eq(o414.truth.key, 'open_hatch', 'ground truth attached');
  const q = selectQueue(ds);
  eq(q.length, 7, 'queue from import');
  ok(q[0].isCritical, 'critical first');
  const qual = ds.quality;
  ok(qual?.available && qual.computed, 'quality computed in browser');
  eq(qual.evaluated, 9, 'evaluated pairs (unknown truth skipped)');
  eq(qual.kpi.accuracy, 0.6667, 'accuracy');
  eq(qual.kpi.defectRecall, 0.8333, 'defect recall');
  eq(qual.kpi.defectsMissed, 1, 'missed defect');
  eq(qual.unmappedLabels, { 'трещина обоймы': 1 }, 'unmapped labels in quality');
  ok(qual.thresholdSweep.length === 9, 'threshold sweep computed');
  ok(qual.confusion.labels.includes('graffiti'), 'confusion includes unknown model class');
  eq(qual.missed[0]?.objectId, 'ОДН-0107', 'missed example');
  const tl = selectTimeline(ds, { objectId: 'ККС-0414' });
  ok(tl.some((e) => e.type === 'critical_alert_raised'), 'critical alert event generated');
});

await group('import: other formats', async () => {
  // predictions.jsonl from ml/worker.py
  const jsonl = [
    { file: 'hatch_patched.jpg', route: 'review', defect_type: 'subsidence', top: 'subsidence', top_p: 0.5555, object_p: 0.85, kind: 'cable_well', severity: 'low', p_critical: 0.07, probs: { ok: 0.29, subsidence: 0.5555 }, rationale: 'Просадка 56% · Норма 29%', object_id: 'ККС-0414', media_uri: '/api/media/hatch_patched.jpg' },
    { file: 'ok.jpg', route: 'auto_ok', defect_type: null, top: 'ok', top_p: 0.93, object_p: 0.95, kind: 'cable_well', severity: null, p_critical: 0.01, probs: { ok: 0.93 }, object_id: 'IMG-ok' },
    { file: 'err.jpg', route: 'error', error: 'timeout' },
  ].map((x) => JSON.stringify(x)).join('\n');
  const c1 = await parseImport(jsonl, { filename: 'predictions.jsonl', taxonomy: tax });
  eq([c1.report.format, c1.report.kind, c1.report.rows], ['jsonl', 'results', 3], 'predictions.jsonl');
  const b1 = buildDataset([c1], tax);
  const d1 = b1.dataset.detections.find((d) => d.file === 'hatch_patched.jpg');
  eq([d1.top, d1.topP, d1.route, d1.photo], ['subsidence', 0.5555, 'review', '/api/media/hatch_patched.jpg'], 'jsonl fields kept');
  eq(b1.dataset.quality, null, 'no truth → no quality');
  eq(b1.dataset.detections.find((d) => d.file === 'err.jpg').route, 'error', 'error rows kept, no crash');

  // native contract (README example)
  const native = {
    format: 'poputno.results', version: 1, run_id: 'final', model: 'google/gemini-decision-1',
    rows: [
      { file: 'img_001.jpg', object_id: 'ККС-0001', lat: 55.7516, lon: 37.7172, kind: 'cable_well', truth: 'открытый люк', pred: 'open_hatch', confidence: 0.95, severity: 'critical', route: 'critical', captured_at: '2026-11-26T10:42:00+03:00', bbox: [0.3, 0.4, 0.2, 0.15] },
      { file: 'img_002.jpg', object_id: 'ОДН-0002', truth: 'норма', pred: null, confidence: 0.91, route: 'auto_ok' },
    ],
  };
  const c2 = await parseImport(JSON.stringify(native), { filename: 'results.json', taxonomy: tax });
  const b2 = buildDataset([c2], tax);
  eq(b2.summary.objects, 2, 'native rows');
  eq(b2.dataset.meta.runId, 'final', 'native meta');
  const k1 = selectObject(b2.dataset, 'ККС-0001');
  eq(k1.evidence.bbox, { x: 0.3, y: 0.4, w: 0.2, h: 0.15 }, 'bbox array');
  eq(k1.displayStatus, 'critical', 'native critical');
  eq(selectObject(b2.dataset, 'ОДН-0002').kind, 'dual_pole', 'kind from id prefix');
  ok(b2.dataset.quality?.kpi.accuracy === 1, 'quality from native truth');

  // organizers' labels only (no model columns)
  const labels = 'file,object_id,latitude,longitude,defect,status\nа.jpg,MH-1,55.75,37.71,Открытый люк,ремонт\nб.jpg,MH-2,55.76,37.72,норма,исправен\nв.jpg,MH-3,,,Коррозия люка,проверка\n';
  const c3 = await parseImport(labels, { filename: 'labels.csv', taxonomy: tax });
  ok(c3.report.labelsOnly && c3.report.kind === 'labels', 'labels-only detected');
  const b3 = buildDataset([c3], tax);
  eq(selectObject(b3.dataset, 'MH-1').displayStatus, 'critical', 'labels shown as detections');
  eq(selectObject(b3.dataset, 'MH-3').defectLabel, 'Коррозия люка', 'unknown label shown as is');
  eq(b3.dataset.quality, null, 'no quality without model');
  ok(b3.dataset.detections.every((d) => d.origin === 'label'), 'origin label');

  // predictions.jsonl + organizers' labels dropped together → joined by file name
  const lab2 = 'Файл;Номер колодца;Широта;Долгота;Повреждение\nHATCH_PATCHED.JPG;ККС-9001;55,74;37,70;просадка\nok.png;ККС-9002;55,75;37,71;норма\nextra.jpg;ККС-9003;;;норма\n';
  const cl = await parseImport(lab2, { filename: 'labels.csv', taxonomy: tax });
  const bj = buildDataset([c1, cl], tax);
  eq(bj.summary.joined && [bj.summary.joined.matched, bj.summary.joined.results], [2, 3], 'join stats');
  const jok = selectObject(bj.dataset, 'IMG-ok');
  ok(!jok && selectObject(bj.dataset, 'ККС-9002')?.hasCoords, 'fallback IMG- id replaced by registry id + coords from labels');
  eq(selectObject(bj.dataset, 'ККС-0414').truth?.key, 'subsidence', 'truth joined (case-insensitive file key)');
  ok(bj.dataset.quality?.computed && bj.dataset.quality.evaluated === 2, 'quality from joined truth', JSON.stringify(bj.dataset.quality?.evaluated));
  ok(!selectObject(bj.dataset, 'ККС-9003'), 'label rows without model output not shown');

  // minimal: only file names
  const c4 = await parseImport('photo\n1.jpg\n2.jpg\n', { filename: 'min.csv', taxonomy: tax });
  const b4 = buildDataset([c4], tax);
  eq(b4.summary.objects, 2, 'only file column works');

  // quality / taxonomy / garbage / empty
  const c5 = await parseImport(await (await fetch(`${CFG.demoBase}quality.json`)).text(), { filename: 'report.json', taxonomy: tax });
  eq(c5.report.kind, 'quality', 'report.json detected');
  const c6 = await parseImport(JSON.stringify({ classes: { ok: { label: 'Норма', ok: true }, subsidence: { label: 'Просадка грунта', kind: 'cable_well', ok: false } } }), { filename: 'taxonomy.json', taxonomy: tax });
  eq(c6.report.kind, 'taxonomy', 'taxonomy detected');
  const b6 = buildDataset([c1, c5, c6], tax);
  eq(selectObject(b6.dataset, 'ККС-0414').defectLabel, 'Просадка грунта', 'dropped taxonomy relabels');
  ok(b6.dataset.quality?.available && !b6.dataset.quality.computed, 'dropped report.json used');
  const newTax = { classes: { ok: { label: 'Норма', ok: true, aliases: ['исправно'] }, rust: { label: 'Коррозия', kind: 'dual_pole', ok: false, aliases: ['ржавчина на опоре'] } } };
  const pf = await parseFiles([{ name: 'l.csv', content: 'file,label,pred,confidence\nq.jpg,ржавчина на опоре,rust,0.8\n' }, { name: 'taxonomy.json', content: JSON.stringify(newTax) }], tax);
  const bp = buildDataset(pf.chunks, pf.taxonomy);
  eq([bp.dataset.detections[0].truth.key, bp.dataset.objects[0].defectLabel, bp.dataset.quality?.kpi.accuracy], ['rust', 'Коррозия', 1], 'dropped taxonomy applies to labels in the same drop');
  const bad = await parseImport('{oops', { filename: 'bad.json', taxonomy: tax });
  ok(!bad.report.ok && bad.report.errors.length, 'garbage JSON → error report, no throw');
  const empty = await parseImport('', { filename: 'empty.csv', taxonomy: tax });
  ok(!empty.report.ok, 'empty file → error report');

  // COCO
  const coco = { images: [{ id: 1, file_name: 'c1.jpg', width: 1000, height: 500 }, { id: 2, file_name: 'c2.jpg' }], annotations: [{ image_id: 1, category_id: 3, bbox: [100, 100, 200, 100] }], categories: [{ id: 3, name: 'open_hatch' }] };
  const b7 = buildDataset([await parseImport(JSON.stringify(coco), { filename: 'coco.json', taxonomy: tax })], tax);
  eq(b7.dataset.detections.find((d) => d.file === 'c1.jpg').bbox, { x: 0.1, y: 0.2, w: 0.2, h: 0.2 }, 'COCO bbox normalized');

  // column helpers
  eq(parseCSV('a\t"b ""q"""\n1\t2\n').rows[0], { a: '1', 'b "q"': '2' }, 'TSV + quotes');
  eq(mapColumns(['Широта', 'Долгота', 'Наименование файла']).mapping, { lat: 'Широта', lon: 'Долгота', file: 'Наименование файла' }, 'fuzzy header match');
  eq(mapColumns(['type'], {}, [{ type: 'опора' }, { type: 'колодец' }]).mapping, { kind: 'type' }, '"type" with kinds → kind');
  eq(mapColumns(['type'], {}, [{ type: 'просадка' }]).mapping, { truth: 'type' }, '"type" with defects → truth');
  eq(mapColumns(['A', 'B'], { file: 'A' }).mapping, { file: 'A' }, 'manual mapping override');
});

await group('file source (IndexedDB)', async () => {
  const src = createSource('file', CFG);
  await src.clear();
  ok(src.dataset.meta.empty, 'empty before import');
  const text = await (await fetch(`${ROOT}data/demo/sample-import.csv`)).text();
  const res = await src.importFiles([{ name: 'sample-import.csv', content: text }]);
  eq(res.summary.objects, 9, 'import via source');
  const q = await src.getQueue();
  await src.review(q[0].objectId, { detectionId: q[0].id, decision: 'confirm' });
  const again = createSource('file', CFG);
  await again.load();
  eq(again.dataset.objects.length, 9, 'persisted across instances');
  eq(selectObject(again.dataset, q[0].objectId).status, 'defect', 'local decision persisted');
  ok(await again.hasData(), 'hasData');
  if (typeof Blob !== 'undefined') {
    const blob = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'img_002.svg', { type: 'image/svg+xml' });
    await again.importFiles([blob]);
    const u = await again.resolvePhoto('./data/photos/img_002.jpg');
    ok(u.startsWith('blob:'), 'dropped photo resolved by file name', u);
  }
  await again.clear();
  ok(!(await again.hasData()), 'cleared');
  ok(src instanceof FileSource, 'class');
});

await group('api source (mocked fetch)', async () => {
  const calls = [];
  const fixtures = {
    'GET /api/taxonomy': await (await fetch(CFG.taxonomyUrl)).json(),
    'GET /api/objects': [{ id: 'KK-0001', kind: 'cable_well', lat: 55.751, lon: 37.618, address: null, status: 'suspected', last_defect_type: 'open_hatch', max_severity: 'critical', last_seen_at: '2026-11-26T10:41:00Z', updated_at: '2026-11-26T10:41:02Z' },
      { id: 'IMG-0002', kind: 'dual_pole', lat: null, lon: null, address: null, status: 'ok', last_defect_type: null, max_severity: null, last_seen_at: '2026-11-26T10:00:00Z', updated_at: '2026-11-26T10:00:00Z' }],
    'GET /api/queue': [{ id: 'd1', frame_id: 'f1', object_id: 'KK-0001', object_kind: 'cable_well', defect_type: 'open_hatch', severity: 'critical', confidence: 0.95, bbox: { x: 0, y: 0, w: 1, h: 1 }, crop_uri: '/api/media/photos/0001.jpg', rationale: 'Открытый люк 95%', lat: 55.751, lon: 37.618, review_state: 'pending', created_at: '2026-11-26T10:41:00Z' }],
    'GET /api/quality': { runs: [{ run_id: 'final', modified: '2026-11-26T12:30:00Z' }], report: await (await fetch(`${CFG.demoBase}quality.json`)).json() },
    'GET /api/auth/me': { id: 'u', login: 'dispatcher', display_name: 'Диспетчер', role: 'dispatcher', active: true, permissions: ['objects_read', 'review'] },
    'GET /api/objects/KK-0001': { object: { id: 'KK-0001', kind: 'cable_well', status: 'defect', last_defect_type: 'open_hatch', max_severity: 'critical', updated_at: '2026-11-26T10:45:00Z' }, detections: [] },
    'GET /api/objects/KK-0001/history': [{ event_id: 'e1', type: 'observed', payload: { type: 'observed', detection_id: 'd1', frame_id: 'f1', defect_type: 'open_hatch', severity: 'critical', confidence: 0.95 }, source: 'api.projection', occurred_at: '2026-11-26T10:41:00Z' },
      { event_id: 'e2', type: 'status_changed', payload: { type: 'status_changed', from: 'not_observed', to: 'suspected', reason: 'observation' }, source: 'api.projection', occurred_at: '2026-11-26T10:41:00Z' }],
    'POST /api/objects/KK-0001/reviews': null,
    'GET /api/media/photos/0001.jpg': 'IMG',
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (!String(url).includes('/api/')) return realFetch(url, init);
    const path = String(url).replace('http://api.test', '');
    const key = `${init.method || 'GET'} ${path.split('?')[0]}`;
    calls.push({ key, auth: init.headers?.Authorization, body: init.body });
    if (!(key in fixtures)) return new Response('{"error":"nf"}', { status: 404 });
    const v = fixtures[key];
    if (key.startsWith('POST') && v === null) return new Response(null, { status: 202 });
    return new Response(typeof v === 'string' ? v : JSON.stringify(v), { status: 200 });
  };
  localStorage.setItem('poputno.token', 'T0K');
  try {
    const api = createSource('api', { ...CFG, apiBase: 'http://api.test' });
    ok(api instanceof ApiSource, 'api adapter');
    const ds = await api.load();
    eq(calls[0].auth, 'Bearer T0K', 'bearer token from localStorage');
    eq(ds.objects.length, 2, 'objects');
    eq(selectObject(ds, 'KK-0001').displayStatus, 'critical', 'critical display status');
    eq(selectObject(ds, 'IMG-0002').hasCoords, false, 'no coords ok');
    eq((await api.getQueue()).length, 1, 'queue');
    eq((await api.getQueue())[0].bbox, null, 'full-frame bbox dropped');
    eq(ds.user.login, 'dispatcher', 'me');
    ok(ds.quality.available && ds.quality.runs[0].run_id === 'final', 'quality + runs');
    const o = await api.getObject('KK-0001');
    eq([o.status, o.events.length, o.detailsLoaded], ['defect', 2, true], 'details + history merged');
    await api.review('KK-0001', { detectionId: 'd1', decision: 'confirm' });
    const post = calls.find((c) => c.key === 'POST /api/objects/KK-0001/reviews');
    eq(JSON.parse(post.body), { detection_id: 'd1', decision: 'confirm', reject_reason: null, comment: null }, 'review POST body');
    eq(selectQueue(ds).length, 0, 'optimistic: queue item decided');
    const u = await api.resolvePhoto('/api/media/photos/0001.jpg');
    ok(u && u.startsWith('blob:'), 'media fetched with token as blob', u);
    const stats = await api.getStats();
    eq(stats.byDisplayStatus.critical, 1, 'client-side stats');
    const fb = await openSource({ kind: 'api', ...CFG, apiBase: 'http://nowhere.test' });
    ok(fb.kind === 'demo' && fb.dataset.meta.fallbackFrom === 'api' && fb.dataset.meta.demo, 'API down → demo fallback, flagged');
  } finally {
    globalThis.fetch = realFetch;
    localStorage.removeItem('poputno.token');
  }
});

/* ------------------------------------------------------------------ report */

const passed = results.filter((r) => r.pass).length;
const failed = results.length - passed;
const out = document.getElementById('out');
out.innerHTML = '';
let g = '';
for (const r of results) {
  if (r.group !== g) { g = r.group; out.append(`\n## ${g}\n`); }
  const line = document.createElement('span');
  line.className = r.pass ? 'pass' : 'fail';
  line.textContent = `${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  —  ${r.detail}` : ''}\n`;
  out.append(line);
}
out.append(`\n${passed}/${results.length} passed${failed ? `, ${failed} FAILED` : ''}\n`);
document.title = failed ? `FAIL ${failed}` : `PASS ${passed}`;
window.__SELFTEST__ = { passed, failed, results };
