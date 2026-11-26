import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Shell } from '../../ui/shell.service';
import { PP, Box, boxTone, boxesOf } from '../../ui/pp';
import { FrameObject, FrameRow, PoputnoStore, Verdict } from '../../data/store';
import { M, fmt } from '../../data/legacy';

const IMAGE_RE = /\.(jpe?g|png|webp|bmp|gif|heic|heif|avif|tiff?)$/i;
export const isImage = (f: File) => (f.type || '').startsWith('image/') || IMAGE_RE.test(f.name || '');

/** How long a card waits for the boxes (frame_objects) after the verdict before giving up. */
const BOXES_WAIT_MS = 90_000;
const POLL_MS = 3000;

/** One photo on the page: a fresh upload of this session or a recent one from the server. */
interface Item {
  key: string;
  frameId: string | null;
  file: string;
  /** media_uri (or the blob URL of a just picked file) */
  photo: string | null;
  /** what <img> shows: blob URL (local file or /api/media fetched with the token) */
  src: string | null;
  phase: 'uploading' | 'queued' | 'done' | 'error';
  verdict: Verdict | null;
  objects: FrameObject[] | null;
  objectId: string | null;
  createdAt: string;
  /** Date.now() when the verdict arrived: boxes are awaited for BOXES_WAIT_MS after it */
  verdictAt: number | null;
  error: string | null;
}

interface Card {
  it: Item;
  d: any;
  boxes: Box[];
  tone: string;
  label: string;
  waitingBoxes: boolean;
}

/**
 * «Проверить фото»: photos → POST /api/frames (S3 → Kafka → model). Each photo shows right away
 * as «Анализ…»; the verdict comes live (frame_analyzed), the boxes a few seconds later
 * (frame_objects); GET /api/frames/{id} is polled as a fallback while anything is pending.
 */
@Component({
  selector: 'app-check-view',
  imports: [PP, RouterLink],
  templateUrl: './check.html',
  styleUrl: './check.scss',
})
export class CheckView {
  private store = inject(PoputnoStore);
  private shell = inject(Shell);
  readonly tax = this.store.tax;
  readonly fmt = fmt;

  /** Photos sent from this page, newest batch first. */
  readonly items = signal<Item[]>([]);
  /** The user's recent uploads (GET /api/frames?mine=true). */
  readonly history = signal<Item[]>([]);
  readonly historyLoading = signal(true);
  readonly historyAll = signal(false);
  /** Upload in flight: number of photos and the sent share 0..1. */
  readonly uploading = signal<{ n: number; share: number } | null>(null);
  readonly error = signal<string | null>(null);
  readonly over = signal(false);
  /** Size of the last batch (cards from the top of `items`). */
  readonly lastBatch = signal(0);

  readonly objectId = signal('');
  readonly lat = signal('');
  readonly lon = signal('');

  private seq = 0;
  private blobs: string[] = [];
  /** Live messages for frame ids we do not know yet (the answer may beat the POST response). */
  private early = new Map<string, { verdict?: Verdict; objects?: FrameObject[] }>();
  private detCache = new WeakMap<Item, Card>();
  private detTax: any = null;
  private polling = false;

  readonly cards = computed<Card[]>(() => {
    const tax = this.tax();
    if (tax !== this.detTax) {
      this.detCache = new WeakMap();
      this.detTax = tax;
    }
    return this.items().map((it) => {
      let c = this.detCache.get(it);
      if (!c) {
        c = this.card(it, tax);
        this.detCache.set(it, c);
      }
      return c;
    });
  });

  readonly historyCards = computed(() => {
    const tax = this.tax();
    const open = new Set(this.items().map((i) => i.frameId));
    return this.history().filter((it) => !open.has(it.frameId)).map((it) => ({ it, d: tax ? detOf(it, tax) : null }));
  });

  /** Summary of the last batch: «в очередь / норма / не наблюдается». */
  readonly summary = computed(() => {
    const xs = this.items().slice(0, this.lastBatch());
    const v = xs.map((x) => x.verdict).filter((x): x is Verdict => !!x);
    return {
      total: xs.length,
      done: xs.filter((x) => x.phase === 'done' || x.phase === 'error').length,
      review: v.filter((r) => r.route === 'review' || r.route === 'critical').length,
      critical: v.filter((r) => r.route === 'critical').length,
      auto: v.filter((r) => r.route === 'auto_ok').length,
      notObserved: v.filter((r) => r.route === 'not_observed').length,
      errors: xs.filter((x) => x.phase === 'error').length,
      boxes: xs.filter((x) => x.objects).length,
    };
  });

  readonly pending = computed(() => this.items().filter((i) => i.phase === 'uploading' || i.phase === 'queued').length);

  constructor() {
    this.shell.setTitle('Проверить фото');

    effect(() => {
      const m = this.store.live();
      if (m) untracked(() => this.onLive(m.payload as any));
    });

    const timer = setInterval(() => this.poll(), POLL_MS);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      this.blobs.forEach((u) => URL.revokeObjectURL(u));
    });

    this.store
      .frames({ mine: true, limit: 60 })
      .then((rows) => this.history.set(rows.map((r) => this.fromRow(r))))
      .catch(() => this.history.set([]))
      .finally(() => this.historyLoading.set(false));
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
  onDrop(e: DragEvent) {
    e.preventDefault();
    this.over.set(false);
    this.run(Array.from(e.dataTransfer?.files || []));
  }

  async run(list: File[]) {
    const files = list.filter(isImage);
    if (!files.length) {
      if (list.length) this.error.set('Это не фото. Подойдут JPG, PNG или WEBP.');
      return;
    }
    this.error.set(null);
    const now = new Date().toISOString();
    const fresh: Item[] = files.map((f) => {
      const src = URL.createObjectURL(f);
      this.blobs.push(src);
      return {
        key: `local-${++this.seq}`, frameId: null, file: f.name, photo: src, src, phase: 'uploading',
        verdict: null, objects: null, objectId: this.objectId().trim() || null, createdAt: now, verdictAt: null, error: null,
      };
    });
    this.items.update((xs) => [...fresh, ...xs]);
    this.lastBatch.set(fresh.length);
    this.uploading.set({ n: files.length, share: 0 });
    try {
      const accepted = await this.store.uploadFrames(files, { objectId: this.objectId(), lat: this.lat(), lon: this.lon() }, (share) =>
        this.uploading.set({ n: files.length, share }),
      );
      const keys = new Map(fresh.map((x, i) => [x.key, accepted[i]]));
      this.items.update((xs) =>
        xs.map((x) => {
          const a = keys.get(x.key);
          if (!a) return x;
          let it: Item = { ...x, frameId: a.frame_id, file: baseName(a.file_name) || x.file, phase: 'queued' };
          const e = this.early.get(a.frame_id);
          if (e?.verdict) it = withVerdict(it, e.verdict);
          if (e?.objects) it = { ...it, objects: e.objects };
          this.early.delete(a.frame_id);
          return it;
        }),
      );
    } catch (e: any) {
      const msg = e?.message || 'Не удалось загрузить';
      this.error.set(msg);
      const ids = new Set(fresh.map((x) => x.key));
      this.items.update((xs) => xs.map((x) => (ids.has(x.key) ? { ...x, phase: 'error', error: msg } : x)));
    } finally {
      this.uploading.set(null);
    }
  }

  /** A recent upload → card on top. */
  open(it: Item) {
    this.items.update((xs) => [it, ...xs.filter((x) => x.frameId !== it.frameId)]);
    this.lastBatch.set(0);
    queueMicrotask(() => document.querySelector('.ux-verdict')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  clear() {
    this.items.set([]);
    this.lastBatch.set(0);
    this.error.set(null);
  }

  /* ------------------------------------------------------------- answers */

  private onLive(p: { type: string; frame_id?: string } & Record<string, any>) {
    if (p.type !== 'frame_analyzed' && p.type !== 'frame_objects') return;
    const id = String(p.frame_id || '');
    if (!id) return;
    const known = this.items().some((x) => x.frameId === id);
    if (!known) {
      if (!this.uploading()) return;
      const e = this.early.get(id) || {};
      if (p.type === 'frame_analyzed') e.verdict = p as unknown as Verdict;
      else e.objects = (p['objects'] as FrameObject[]) || [];
      this.early.set(id, e);
      if (this.early.size > 300) this.early.delete(this.early.keys().next().value!);
      return;
    }
    this.patch(id, (x) => (p.type === 'frame_analyzed' ? withVerdict(x, p as unknown as Verdict) : { ...x, objects: (p['objects'] as FrameObject[]) || [] }));
  }

  /** Fallback: GET /api/frames/{id} for whatever has no verdict or no boxes yet. */
  private async poll() {
    if (this.polling) return;
    const now = Date.now();
    // boxes that never came: stop waiting, the card falls back to the whole-frame corners
    if (this.items().some((x) => x.verdict && !x.objects && x.verdictAt && now - x.verdictAt >= BOXES_WAIT_MS)) {
      this.items.update((xs) => xs.map((x) => (x.verdict && !x.objects && x.verdictAt && now - x.verdictAt >= BOXES_WAIT_MS ? { ...x, objects: [] } : x)));
    }
    const ids = this.items()
      .filter((x) => x.frameId && (x.phase === 'queued' || (x.phase === 'done' && !x.objects && x.verdictAt && now - x.verdictAt < BOXES_WAIT_MS)))
      .map((x) => x.frameId!)
      .slice(0, 24);
    if (!ids.length) return;
    this.polling = true;
    try {
      const rows = await Promise.all(ids.map((id) => this.store.frame(id).catch(() => null)));
      for (const r of rows) {
        if (!r) continue;
        this.patch(r.id, (x) => {
          let it = x;
          if (r.result && !x.verdict) it = withVerdict(it, r.result);
          else if (r.status === 'error' && x.phase !== 'error') it = { ...it, phase: 'error', error: r.result?.error || 'Модель не ответила' };
          if (r.objects && !x.objects) it = { ...it, objects: r.objects };
          return it;
        });
      }
    } finally {
      this.polling = false;
    }
  }

  private patch(frameId: string, fn: (x: Item) => Item) {
    this.items.update((xs) => xs.map((x) => (x.frameId === frameId ? fn(x) : x)));
  }

  private fromRow(r: FrameRow): Item {
    const it: Item = {
      key: r.id, frameId: r.id, file: baseName(r.file_name) || 'кадр', photo: r.media_uri, src: null,
      phase: r.result ? (r.result.route === 'error' ? 'error' : 'done') : r.status === 'error' ? 'error' : 'queued',
      verdict: r.result, objects: r.objects, objectId: r.object_id, createdAt: r.created_at,
      verdictAt: r.result ? Date.now() - BOXES_WAIT_MS + 15_000 : null, error: r.result?.error ?? null,
    };
    this.store.photo(r.media_uri).then((u) => {
      if (!u) return;
      const set = (xs: Item[]) => xs.map((x) => (x.key === it.key && !x.src ? { ...x, src: u } : x));
      this.history.update(set);
      this.items.update(set);
    });
    return it;
  }

  private card(it: Item, tax: any): Card {
    const d = tax ? detOf(it, tax) : null;
    const boxes = d && it.verdict ? boxesOf(d, tax) : [];
    const label = !it.verdict ? 'Анализ…' : it.verdict.route === 'not_observed' ? 'Не наблюдается' : d?.isDefect ? d.defectLabel : 'Норма';
    return {
      it, d, boxes, tone: it.verdict ? boxTone(d) : '', label,
      waitingBoxes: !!it.verdict && !it.objects && it.verdict.route !== 'error',
    };
  }

  /* ------------------------------------------------------------- template helpers */

  pct(v: number) {
    return `${(v * 100).toFixed(2)}%`;
  }
  tagPos(b: Box) {
    return (b.y >= 0.07 ? '' : b.y + b.h <= 0.9 ? ' ux-tag-below' : ' ux-tag-inside') + (b.x + b.w > 1 - b.x ? ' ux-tag-right' : '');
  }
  latency(ms: number | null | undefined) {
    if (ms == null) return null;
    return ms < 50 ? 'сразу: фото уже проверялось' : `${(ms / 1000).toFixed(1).replace('.', ',')} с`;
  }
  pickLabel(it: Item) {
    const v = it.verdict, tax = this.tax();
    if (!v) return it.phase === 'error' ? 'Ошибка' : 'Анализ…';
    if (v.route === 'error') return 'Ошибка модели';
    return tax ? tax.label(v.route === 'not_observed' ? tax.noneKey ?? null : v.defect_type) : v.defect_type || 'Норма';
  }
  routeLabel(r: string | null | undefined) {
    return this.tax()?.routeLabel(r) ?? r ?? '';
  }
}

const baseName = (p: string | null | undefined) => (p ? p.split(/[\\/]/).pop() || p : null);

function withVerdict(x: Item, v: Verdict): Item {
  return {
    ...x, verdict: v, phase: v.route === 'error' ? 'error' : 'done', error: v.route === 'error' ? v.error || 'Модель не ответила' : null,
    objectId: v.object_id ?? x.objectId, verdictAt: Date.now(),
  };
}

/** Item → the site's normalized detection (labels, route, recommendation, probs, boxes). */
function detOf(it: Item, tax: any): any {
  const v = it.verdict;
  const flagged = v?.route === 'review' || v?.route === 'critical';
  return M.normalizeDetection(
    {
      id: it.frameId || it.key,
      frame_id: it.frameId,
      route: v?.route ?? 'not_observed',
      object_kind: v?.object_kind ?? null,
      defect_type: v?.defect_type ?? null,
      severity: v?.severity ?? null,
      confidence: v?.confidence ?? null,
      top: v?.top_class ?? undefined,
      top_p: v?.top_p ?? undefined,
      probs: v?.probs ?? undefined,
      rationale: v?.rationale ?? null,
      object_id: v?.object_id ?? it.objectId,
      position: v?.position ?? undefined,
      review_state: !v ? 'pending' : flagged ? 'pending' : v.route === 'not_observed' ? 'not_observed' : 'confirmed',
      media_uri: it.photo,
      file: it.file,
      created_at: it.createdAt,
      extra: it.objects ? { objects: it.objects } : null,
    },
    tax,
  );
}
