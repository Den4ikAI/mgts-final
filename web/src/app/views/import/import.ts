import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Shell } from '../../ui/shell.service';
import { PP, plural } from '../../ui/pp';
import { BatchReport, Imported, PoputnoStore } from '../../data/store';
import { fmt } from '../../data/legacy';

const POLL_MS = 1500;
/** Polling stops when the count has not moved for this long (workers down?). */
const STALL_MS = 5 * 60_000;

type Phase = 'idle' | 'uploading' | 'analyzing' | 'done' | 'error';
type Batch = BatchReport['batch'];

const NOTE_LABEL: Record<string, string> = {
  photos_without_annotation: 'Фото без строки в разметке',
  annotation_without_photo: 'Строки разметки без фото',
  unrecognized_status: 'Непонятный статус в разметке',
  skipped: 'Пропущенные файлы',
};

/**
 * «Загрузить данные»: the organizers' dataset (zip or folder with photos + xlsx/csv) →
 * POST /api/datasets; the server unpacks it, matches the annotation and sends every photo to
 * the model. Progress and quality vs annotation come from GET /api/datasets/{id}.
 */
@Component({
  selector: 'app-import-view',
  imports: [PP, RouterLink],
  templateUrl: './import.html',
  styleUrl: './import.scss',
})
export class ImportView {
  private store = inject(PoputnoStore);
  private shell = inject(Shell);
  readonly fmt = fmt;
  readonly plural = plural;
  readonly noteLabel = NOTE_LABEL;

  readonly phase = signal<Phase>('idle');
  readonly share = signal(0);
  readonly picked = signal<{ files: number; bytes: number; zips: number } | null>(null);
  readonly imported = signal<Imported | null>(null);
  readonly report = signal<BatchReport | null>(null);
  readonly error = signal<string | null>(null);
  readonly stalled = signal(false);
  readonly over = signal(false);
  readonly name = signal('');
  readonly batches = signal<Batch[] | null>(null);
  readonly downloading = signal<string | null>(null);

  readonly counts = this.store.select((ds) => ({ objects: ds.objects.length, detections: ds.detections.length, pending: ds.detections.filter((d: any) => d.isPending).length }), null);

  /** Routes of the shown batch: «в очередь / норма / не наблюдается». */
  readonly routes = computed(() => {
    const r = this.report()?.routes || {};
    return {
      review: (r['review'] || 0) + (r['critical'] || 0),
      critical: r['critical'] || 0,
      auto: r['auto_ok'] || 0,
      notObserved: r['not_observed'] || 0,
      errors: r['error'] || 0,
      queued: r['queued'] || 0,
    };
  });

  readonly notes = computed(() => {
    const n = (this.report()?.batch.notes || this.imported()?.notes || {}) as Record<string, string[] | undefined>;
    return Object.keys(NOTE_LABEL)
      .map((k) => ({ key: k, label: NOTE_LABEL[k], items: n[k] || [] }))
      .filter((x) => x.items.length);
  });

  /** Confusion «разметка → модель» as rows with labels. */
  readonly confusion = computed(() => {
    const c = this.report()?.quality?.confusion || {};
    const tax = this.store.tax();
    const lab = (k: string) => (tax ? tax.label(k === tax.okKey ? null : k) : k);
    return Object.entries(c)
      .map(([k, n]) => {
        const [t, p] = k.split('→');
        return { truth: lab(t), pred: lab(p || ''), n, ok: t === p };
      })
      .sort((a, b) => Number(a.ok) - Number(b.ok) || b.n - a.n);
  });

  private timer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private watching: string | null = null;

  constructor() {
    this.shell.setTitle('Загрузить данные');
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      if (this.timer) clearTimeout(this.timer);
    });
    this.loadBatches();
  }

  /* ------------------------------------------------------------- input */

  onPick(e: Event) {
    const input = e.target as HTMLInputElement;
    this.run(Array.from(input.files || []));
    input.value = '';
  }
  onDragOver(e: DragEvent) {
    e.preventDefault();
    this.over.set(true);
  }
  onDragLeave(e: DragEvent) {
    const el = e.currentTarget as HTMLElement;
    if (!el.contains(e.relatedTarget as Node)) this.over.set(false);
  }
  async onDrop(e: DragEvent) {
    e.preventDefault();
    this.over.set(false);
    try {
      this.run(await collectDropped(e.dataTransfer));
    } catch (err: any) {
      this.fail(err?.message || String(err));
    }
  }
  busy() {
    return this.phase() === 'uploading' || this.phase() === 'analyzing';
  }

  async run(files: File[]) {
    if (!files.length || this.busy()) return;
    this.stop();
    this.error.set(null);
    this.report.set(null);
    this.imported.set(null);
    this.stalled.set(false);
    this.picked.set({ files: files.length, bytes: files.reduce((a, f) => a + f.size, 0), zips: files.filter((f) => /\.zip$/i.test(f.name)).length });
    this.share.set(0);
    this.phase.set('uploading');
    try {
      const res = await this.store.importDataset(files, this.name(), (s) => this.share.set(s));
      if (this.destroyed) return;
      this.imported.set(res);
      this.phase.set('analyzing');
      this.watch(res.batch_id);
    } catch (e: any) {
      this.fail(e?.message || 'Не удалось загрузить');
    }
  }

  /** Shows a previous batch (its report; keeps polling if it is still running). */
  show(b: Batch) {
    if (this.busy() && this.watching !== b.id) return;
    this.stop();
    this.error.set(null);
    this.imported.set(null);
    this.picked.set(null);
    this.stalled.set(false);
    this.phase.set('analyzing');
    this.watch(b.id);
    queueMicrotask(() => document.getElementById('report')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  /* ------------------------------------------------------------- progress */

  private watch(id: string) {
    this.watching = id;
    let last = -1;
    let movedAt = Date.now();
    const tick = async () => {
      this.timer = null;
      if (this.destroyed || this.watching !== id) return;
      try {
        const r = await this.store.batch(id);
        if (this.destroyed || this.watching !== id) return;
        this.report.set(r);
        const { analyzed, images } = r.batch;
        if (analyzed !== last) {
          last = analyzed;
          movedAt = Date.now();
        }
        if (analyzed >= images) return this.finish(r);
        if (Date.now() - movedAt > STALL_MS) {
          this.stalled.set(true);
          this.phase.set('done');
          this.loadBatches();
          return;
        }
      } catch (e: any) {
        if (!this.report()) return this.fail(e?.error?.error || e?.message || 'Не удалось получить прогресс');
      }
      this.timer = setTimeout(tick, POLL_MS);
    };
    tick();
  }

  private finish(r: BatchReport) {
    this.phase.set('done');
    this.watching = null;
    this.loadBatches();
    if (this.imported()) {
      this.store.reload().catch(() => {});
      const n = this.routes().review;
      this.shell.toast({
        title: `Проверено ${fmt.int(r.batch.images)} фото`,
        text: n ? `В очередь проверки: ${fmt.int(n)}` : 'Дефектов, которым нужен человек, нет',
        tone: 'ok',
        link: n ? '/queue' : undefined,
        actionLabel: n ? 'Очередь' : undefined,
      });
    }
  }

  private stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.watching = null;
  }

  private fail(msg: string) {
    this.stop();
    this.error.set(msg);
    this.phase.set('error');
  }

  private loadBatches() {
    this.store
      .batches()
      .then((b) => this.batches.set(b))
      .catch(() => this.batches.set(this.batches() || []));
  }

  async download(batch: string | null, format: 'xlsx' | 'csv') {
    const key = `${batch}:${format}`;
    if (this.downloading()) return;
    this.downloading.set(key);
    try {
      await this.store.download({ batch, format });
    } catch (e: any) {
      this.shell.toast({ title: 'Таблица не скачалась', text: e?.message || '', tone: 'warn' });
    } finally {
      this.downloading.set(null);
    }
  }

  /* ------------------------------------------------------------- template helpers */

  mb(bytes: number) {
    return `${(bytes / 1048576).toFixed(1).replace('.', ',')} МБ`;
  }
  progress(r: BatchReport | null) {
    const b = r?.batch;
    return b && b.images ? Math.min(1, b.analyzed / b.images) : 0;
  }
  isDone(b: Batch) {
    return b.analyzed >= b.images;
  }
}

/**
 * Files from a drop, walking folders recursively (the dataset folder: photos + annotation).
 * Each file gets `relativePath` (folder/sub/photo.jpg): the server matches the annotation by it.
 */
async function collectDropped(dt: DataTransfer | null): Promise<File[]> {
  const items = Array.from(dt?.items || []);
  const entries = items.map((it) => (it as any).webkitGetAsEntry?.()).filter(Boolean) as any[];
  if (!entries.some((e) => e.isDirectory)) return Array.from(dt?.files || []);
  const out: File[] = [];
  const walk = async (entry: any): Promise<void> => {
    if (entry.isFile) {
      const f: File = await new Promise((res, rej) => entry.file(res, rej));
      (f as any).relativePath = String(entry.fullPath || f.name).replace(/^\/+/, '');
      out.push(f);
      return;
    }
    const reader = entry.createReader();
    for (;;) {
      const batch: any[] = await new Promise((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const x of batch) await walk(x);
    }
  };
  for (const x of entries) await walk(x);
  return out;
}
