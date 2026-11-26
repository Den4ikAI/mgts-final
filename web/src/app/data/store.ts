import { HttpClient, HttpEventType } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Subject, firstValueFrom } from 'rxjs';
import { AuthService } from '../core/auth';
import { Api } from '../core/api';
import { Dataset, Det, M, T } from './legacy';

/** POST /api/frames answer, one per photo. */
export interface Accepted { frame_id: string; file_name: string | null; media_uri: string; duplicate: boolean }

/** A box of the second-stage model (frames.objects), normalized to the frame. */
export interface FrameObject {
  bbox: { x: number; y: number; w: number; h: number };
  kind: string | null;
  condition: string;
  confidence: number;
  note: string | null;
}

/** FrameAnalyzed: the model's verdict for one photo. */
export interface Verdict {
  frame_id: string;
  route: 'auto_ok' | 'review' | 'critical' | 'not_observed' | 'error';
  object_kind: string | null;
  defect_type: string | null;
  severity: string | null;
  confidence: number;
  top_class: string | null;
  top_p: number | null;
  probs: Record<string, number> | null;
  rationale: string | null;
  detection_id: string | null;
  object_id: string | null;
  position: { lat: number; lon: number } | null;
  latency_ms: number | null;
  error: string | null;
}

/** GET /api/frames row. */
export interface FrameRow {
  id: string;
  source: string;
  media_uri: string;
  file_name: string | null;
  uploaded_by: string | null;
  object_id: string | null;
  lat: number | null;
  lon: number | null;
  status: 'queued' | 'done' | 'error';
  result: Verdict | null;
  objects: FrameObject[] | null;
  truth: { class: string | null; kind: string | null; status: string | null; description: string | null } | null;
  batch_id: string | null;
  size_bytes: number;
  created_at: string;
  analyzed_at: string | null;
}

/** POST /api/datasets answer. */
export interface Imported {
  batch_id: string;
  name: string;
  images: number;
  labeled: number;
  notes: { skipped: string[]; photos_without_annotation: string[]; annotation_without_photo: string[]; unrecognized_status: string[] };
}

/** GET /api/datasets/{id}. */
export interface BatchReport {
  batch: { id: string; name: string; uploaded_by: string | null; images: number; labeled: number; created_at: string; analyzed: number; errors: number; notes: Imported['notes'] };
  routes: Record<string, number>;
  quality: null | {
    evaluated: number; accuracy: number; defects_total: number; defects_caught: number; defect_recall: number | null;
    auto_share: number; auto_precision: number | null; confusion: Record<string, number>;
  };
}

/** A live message from /api/stream: object events plus frame_analyzed / frame_objects. */
export interface LiveMessage { key: string; payload: { type: string } & Record<string, unknown> }

/**
 * The product's data: everything the «Попутно» views read, loaded from the Rust API and
 * normalized by the site's own data layer (legacy/model.js), so the screens behave as on the site.
 *
 * The dataset is mutated in place by model.js (that is how the site works); every change bumps
 * `version`, so views read `store.ds()` inside a computed that also reads `store.version()`
 * (or use `store.select(fn)`).
 */
@Injectable({ providedIn: 'root' })
export class PoputnoStore {
  private http = inject(HttpClient);
  private api = inject(Api);
  private auth = inject(AuthService);

  /** model.js dataset; null until the first load. */
  readonly ds = signal<Dataset | null>(null);
  /** Taxonomy helper object (T.createTaxonomy). */
  readonly tax = signal<any | null>(null);
  /** Bumped after every in-place change of `ds`. */
  readonly version = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** Last live message (frame_analyzed, frame_objects, object events), for views that react to them. */
  readonly live = signal<LiveMessage | null>(null);
  /** Every frame_analyzed / frame_objects message (a signal would merge two close ones). */
  readonly frames$ = new Subject<LiveMessage>();
  /** Last critical alert for a toast: {objectId, text}. */
  readonly alert = signal<{ objectId: string; text: string; at: string } | null>(null);

  private photoUrls = new Map<string, Promise<string | null>>();
  private refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private liveSub: { unsubscribe(): void } | null = null;

  /** computed(() => fn(ds)) that re-runs on every dataset change. */
  select<R>(fn: (ds: Dataset) => R, fallback: R) {
    return computed(() => {
      this.version();
      const ds = this.ds();
      return ds ? fn(ds) : fallback;
    });
  }
  touch() {
    this.version.update((v) => v + 1);
  }

  /* ------------------------------------------------------------- loading */

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const taxJson = await firstValueFrom(this.http.get<any>('/api/taxonomy'));
      const tax = T.createTaxonomy(taxJson);
      const [objects, queue, quality, events] = await Promise.all([
        firstValueFrom(this.http.get<any[]>('/api/objects')),
        firstValueFrom(this.http.get<any[]>('/api/queue')).catch(() => []),
        firstValueFrom(this.http.get<any>('/api/quality')).catch(() => null),
        firstValueFrom(this.http.get<any[]>('/api/events', { params: { limit: '300' } })).catch(() => []),
      ]);
      const ds = M.createDataset(
        {
          meta: { source: 'api', demo: false, note: null, photoBase: '', apiBase: '' },
          objects,
          detections: queue.map(toRawDetection),
          events,
          quality,
          runs: quality?.runs || [],
          user: this.auth.user(),
        },
        tax,
      );
      this.tax.set(tax);
      this.ds.set(ds);
      this.touch();
      this.startLive();
    } catch (e: any) {
      this.error.set(e?.error?.error || e?.message || 'API недоступно');
      throw e;
    } finally {
      this.loading.set(false);
    }
  }

  /** Re-reads everything (after an import, a source switch…). */
  reload() {
    return this.load();
  }

  /** Unsubscribes the live stream and forgets the data (logout). */
  reset() {
    this.liveSub?.unsubscribe();
    this.liveSub = null;
    this.ds.set(null);
    this.tax.set(null);
    this.photoUrls.forEach((p) => p.then((u) => u && URL.revokeObjectURL(u)));
    this.photoUrls.clear();
  }

  /** /api/objects/{id} + history merged into the dataset; returns the normalized object. */
  async object(id: string): Promise<any> {
    const enc = encodeURIComponent(id);
    const [details, history] = await Promise.all([
      firstValueFrom(this.http.get<any>(`/api/objects/${enc}`)),
      firstValueFrom(this.http.get<any[]>(`/api/objects/${enc}/history`)).catch(() => []),
    ]);
    const o = M.mergeObjectDetails(this.ds(), {
      object: details.object,
      detections: details.detections.map(toRawDetection),
      events: (history || []).map((e) => ({ ...e, object_id: id })),
    });
    this.touch();
    return o;
  }

  /** GET /api/queue; detections no longer pending on the server are marked as decided. */
  async refreshQueue(): Promise<void> {
    const rows = await firstValueFrom(this.http.get<any[]>('/api/queue'));
    const ds = this.ds();
    if (!ds) return;
    const ids = new Set(rows.map((r) => String(r.id)));
    for (const d of ds.detections) if (d.isPending && !ids.has(d.id)) d.isPending = false;
    for (const r of rows) M.upsertDetection(ds, toRawDetection(r));
    for (const o of ds.objects) M.deriveObject(o, ds.taxonomy);
    this.touch();
  }

  /** GET /api/quality?run= → normalized quality, also stored in ds.quality. */
  async quality(runId?: string): Promise<any> {
    const q = await firstValueFrom(this.http.get<any>('/api/quality', { params: runId ? { run: runId } : {} }));
    const ds = this.ds();
    if (ds) {
      ds.quality = M.normalizeQuality(q, ds.taxonomy);
      ds.runs = q?.runs || [];
      this.touch();
    }
    return ds?.quality;
  }

  /**
   * Dispatcher decision → POST /api/objects/{id}/reviews (applied through Kafka).
   * rejectReason: shadow | puddle | foreign_owner | bad_frame | not_a_defect | {other: text}
   */
  async review(objectId: string, r: { detectionId?: string | null; decision: 'confirm' | 'reject' | 'need_recapture'; rejectReason?: unknown; comment?: string | null }) {
    await firstValueFrom(
      this.http.post(`/api/objects/${encodeURIComponent(objectId)}/reviews`, {
        detection_id: r.detectionId ?? null,
        decision: r.decision,
        reject_reason: r.rejectReason ?? null,
        comment: r.comment ?? null,
      }),
    );
    const ds = this.ds();
    const det = r.detectionId && ds?.detections.find((d: Det) => d.id === r.detectionId);
    if (det) {
      det.isPending = false;
      det.reviewState = r.decision;
      det.reviewStateLabel = ds.taxonomy.reviewStateLabel(r.decision);
    }
    this.touch();
    this.scheduleRefresh(objectId, 600);
  }

  /* ------------------------------------------------------------- work orders */

  /** «Отправить бригаду»: work_order_opened in the object's history (Kafka). */
  async openWorkOrder(objectId: string, assignee = 'Бригада 3 · Сидоров'): Promise<string> {
    const r = await firstValueFrom(
      this.http.post<{ work_order_id: string }>(`/api/objects/${encodeURIComponent(objectId)}/work-orders`, { assignee }),
    );
    this.scheduleRefresh(objectId, 500);
    return r.work_order_id;
  }

  /**
   * The brigade closes the order. The «after» photo goes through the normal pipeline
   * (S3 → model, bound to this object), its URI is stored on the event; the object returns to «Норма».
   */
  async closeWorkOrder(objectId: string, workOrderId: string, after?: File | null) {
    let afterUri: string | null = null;
    if (after) afterUri = (await this.uploadFrames([after], { objectId }))[0]?.media_uri ?? null;
    await firstValueFrom(
      this.http.post(`/api/objects/${encodeURIComponent(objectId)}/work-orders/${workOrderId}/close`, { after_photo_uri: afterUri }),
    );
    this.scheduleRefresh(objectId, 500);
  }

  /* ------------------------------------------------------------- photos */

  /** /api/media needs the bearer token: fetched as a blob → object URL (cached per URL). */
  photo(uri: string | null | undefined): Promise<string | null> {
    if (!uri) return Promise.resolve(null);
    if (!uri.startsWith('/api/')) return Promise.resolve(uri);
    let p = this.photoUrls.get(uri);
    if (!p) {
      p = firstValueFrom(this.http.get(uri, { responseType: 'blob' }))
        .then((b) => URL.createObjectURL(b))
        .catch(() => null);
      this.photoUrls.set(uri, p);
    }
    return p;
  }

  /* ------------------------------------------------------------- upload & dataset */

  /**
   * «Проверить фото»: photos → S3 → Kafka → model. Verdicts arrive live (`live()` with
   * type frame_analyzed, then frame_objects with every box) and via `frame(id)`.
   */
  uploadFrames(files: File[], meta: { objectId?: string; lat?: string; lon?: string } = {}, onProgress?: (share: number) => void): Promise<Accepted[]> {
    const form = new FormData();
    for (const f of files) form.append('files', f, f.name);
    if (meta.objectId?.trim()) form.append('object_id', meta.objectId.trim());
    if (meta.lat?.trim() && meta.lon?.trim()) {
      form.append('lat', meta.lat.trim());
      form.append('lon', meta.lon.trim());
    }
    return this.postWithProgress<Accepted[]>('/api/frames', form, onProgress);
  }

  /** Recent uploads with verdicts; mine = only the current user's. */
  frames(params: { mine?: boolean; status?: string; limit?: number } = {}) {
    const p: Record<string, string> = {};
    if (params.mine) p['mine'] = 'true';
    if (params.status) p['status'] = params.status;
    if (params.limit) p['limit'] = String(params.limit);
    return firstValueFrom(this.http.get<FrameRow[]>('/api/frames', { params: p }));
  }
  frame(id: string) {
    return firstValueFrom(this.http.get<FrameRow>(`/api/frames/${id}`));
  }

  /**
   * «Загрузить данные»: the organizers' dataset. Zip files go as archives; anything else is sent
   * file by file with its relative path (a dropped folder: webkitRelativePath), so the server
   * finds photos and annotation tables in the same folders.
   */
  importDataset(files: File[], name?: string, onProgress?: (share: number) => void): Promise<Imported> {
    const form = new FormData();
    if (name?.trim()) form.append('name', name.trim());
    for (const f of files) {
      const path = (f as any).webkitRelativePath || (f as any).relativePath || f.name;
      form.append(f.name.toLowerCase().endsWith('.zip') ? 'archive' : 'files', f, path);
    }
    return this.postWithProgress<Imported>('/api/datasets', form, onProgress);
  }
  batches() {
    return firstValueFrom(this.http.get<BatchReport['batch'][]>('/api/datasets'));
  }
  batch(id: string) {
    return firstValueFrom(this.http.get<BatchReport>(`/api/datasets/${id}`));
  }

  /** Jury table (XLSX/CSV): objects, verdict, recommendation, check against the annotation. */
  async download(opts: { batch?: string | null; format?: 'xlsx' | 'csv' } = {}) {
    const format = opts.format || 'xlsx';
    const params: Record<string, string> = { format };
    if (opts.batch) params['batch'] = opts.batch;
    const res = await firstValueFrom(this.http.get('/api/frames/export', { params, responseType: 'blob', observe: 'response' }));
    const cd = res.headers.get('Content-Disposition') || '';
    const name = /filename="([^"]+)"/.exec(cd)?.[1] || `poputno-result.${format}`;
    const url = URL.createObjectURL(res.body!);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  private postWithProgress<R>(url: string, body: FormData, onProgress?: (share: number) => void): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      this.http.post<R>(url, body, { reportProgress: true, observe: 'events' }).subscribe({
        next: (ev) => {
          if (ev.type === HttpEventType.UploadProgress && ev.total) onProgress?.(ev.loaded / ev.total);
          if (ev.type === HttpEventType.Response) resolve(ev.body as R);
        },
        error: (e) => reject(new Error(e?.error?.error || e?.message || 'Не удалось загрузить')),
      });
    });
  }

  /* ------------------------------------------------------------- live */

  private startLive() {
    if (this.liveSub) return;
    this.liveSub = this.api.live().subscribe((m: any) => {
      const msg = m as LiveMessage;
      this.live.set(msg);
      if (msg.payload.type === 'frame_analyzed' || msg.payload.type === 'frame_objects') {
        this.frames$.next(msg);
        return;
      }
      const ds = this.ds();
      if (!ds) return;
      const events = M.applyEvent(ds, msg, { project: false });
      for (const e of events) {
        if (e.type === 'observed' && e.objectId) this.scheduleRefresh(e.objectId, 400);
        if (e.type === 'critical_alert_raised' && e.objectId) this.alert.set({ objectId: e.objectId, text: e.text, at: e.at });
      }
      this.touch();
    });
  }

  /** After an observation or a review, re-read that object (and the queue) shortly after. */
  private scheduleRefresh(objectId: string, ms: number) {
    clearTimeout(this.refreshTimers.get(objectId));
    this.refreshTimers.set(
      objectId,
      setTimeout(() => {
        this.refreshTimers.delete(objectId);
        this.object(objectId).catch(() => {});
        this.refreshQueue().catch(() => {});
      }, ms),
    );
  }
}

/**
 * API detection row → the raw shape model.js normalizeDetection reads. Adds what the API knows
 * about the frame: model's top class and probabilities, the organizers' annotation, every box.
 */
export function toRawDetection(r: any): any {
  const t = r.truth;
  return {
    ...r,
    top: r.top_class ?? undefined,
    top_p: r.top_p ?? undefined,
    probs: r.probs ?? undefined,
    file: r.file_name ?? undefined,
    truth: t ? { key: t.class ?? undefined, raw: [t.status, t.description].filter(Boolean).join(' · ') || null } : undefined,
    extra: r.objects ? { objects: r.objects } : null,
  };
}
