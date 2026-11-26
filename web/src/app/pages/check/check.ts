import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Api } from '../../core/api';
import { AuthImg } from '../../core/auth-img';
import { SEVERITY_LABEL, TaxonomyService } from '../../core/taxonomy';

type Route = 'auto_ok' | 'review' | 'critical' | 'not_observed' | 'error';
interface Verdict {
  route: Route;
  object_kind: string | null;
  defect_type: string | null;
  severity: string | null;
  confidence: number;
  rationale: string | null;
  object_id: string | null;
  position: { lat: number; lon: number } | null;
  latency_ms: number | null;
  error: string | null;
}
interface Frame {
  id: string;
  media_uri: string;
  file_name: string | null;
  status: 'queued' | 'done' | 'error';
  result: Verdict | null;
  created_at: string;
  /** Local preview while the upload is fresh (no extra request). */
  preview?: string;
}
interface Accepted { frame_id: string; file_name: string | null; media_uri: string; duplicate: boolean }

const ROUTE: Record<Route, { text: string; pill: string }> = {
  auto_ok: { text: 'Норма', pill: 'ok' },
  review: { text: 'Нужна проверка', pill: 'suspected' },
  critical: { text: 'Критично', pill: 'critical' },
  not_observed: { text: 'Объект не найден', pill: 'unseen' },
  error: { text: 'Ошибка анализа', pill: 'unseen' },
};

/** Upload photos → S3 → Kafka → model; verdicts arrive live, 1–3 s per photo. */
@Component({
  selector: 'app-check',
  imports: [AuthImg, PercentPipe, DecimalPipe, DatePipe],
  template: `
    <h1>Проверить фото</h1>
    <p class="sub">Фото ТКШ или РЩ → модель за 1–3 секунды скажет, в норме ли объект и что делать бригаде.</p>

    <label
      class="drop"
      [class.over]="over()"
      [class.busy]="progress() !== null"
      (dragover)="$event.preventDefault(); over.set(true)"
      (dragleave)="over.set(false)"
      (drop)="onDrop($event)"
    >
      <input type="file" accept="image/jpeg,image/png,image/webp" multiple (change)="onPick($event)" />
      @if (progress() !== null) {
        <b>Загрузка… {{ progress() | percent }}</b>
        <span class="bar"><span [style.width.%]="(progress() ?? 0) * 100"></span></span>
      } @else {
        <b>Перетащите фото сюда или нажмите, чтобы выбрать</b>
        <span class="hint">JPEG, PNG, WebP · до 20 МБ · можно сразу много</span>
      }
    </label>

    <details class="extra">
      <summary>Привязать к объекту или месту (необязательно)</summary>
      <div class="fields">
        <label><span class="mg-label">ID объекта</span><input [value]="objectId()" (input)="objectId.set($any($event.target).value)" placeholder="ТКШ-26224137" /></label>
        <label><span class="mg-label">Широта</span><input [value]="lat()" (input)="lat.set($any($event.target).value)" placeholder="55.7512" inputmode="decimal" /></label>
        <label><span class="mg-label">Долгота</span><input [value]="lon()" (input)="lon.set($any($event.target).value)" placeholder="37.6184" inputmode="decimal" /></label>
      </div>
      <p class="hint">Без координат система возьмёт GPS из EXIF фото, если он есть.</p>
    </details>

    @if (error()) { <p class="err" role="alert">{{ error() }}</p> }

    @if (frames().length) {
      <div class="summary">
        @for (s of summary(); track s.key) {
          <span class="mg-pill mg-pill--{{ s.pill }}">{{ s.text }} · {{ s.n }}</span>
        }
      </div>
      <div class="grid">
        @for (f of frames(); track f.id) {
          <article class="card" [class.critical]="f.result?.route === 'critical'">
            <div class="ph">
              @if (f.preview) { <img [src]="f.preview" [alt]="f.file_name ?? 'фото'" /> } @else { <img [mgAuthSrc]="f.media_uri" [alt]="f.file_name ?? 'фото'" /> }
            </div>
            <div class="body">
              @if (f.status === 'queued') {
                <span class="mg-pill mg-pill--unseen"><span class="spin"></span>Анализ…</span>
              } @else if (f.result; as r) {
                <div class="top">
                  <span class="mg-pill mg-pill--{{ route[r.route].pill }}">{{ route[r.route].text }}</span>
                  @if (r.object_kind) { <span class="kind">{{ tax.kind(r.object_kind) }}</span> }
                </div>
                @if (r.route !== 'not_observed' && r.route !== 'error') {
                  <h3>{{ r.defect_type ? tax.label(r.defect_type) : 'Дефектов не видно' }}</h3>
                  <p class="meta">
                    @if (r.severity) { {{ sev[r.severity] }} · }
                    уверенность {{ r.confidence | percent }}
                  </p>
                  <p class="action">{{ tax.action(r.defect_type ?? (r.route === 'auto_ok' ? 'ok' : null)) }}</p>
                } @else if (r.route === 'not_observed') {
                  <p class="action">{{ tax.action('none') }}</p>
                } @else {
                  <p class="action">{{ r.error }}</p>
                }
                @if (r.position) { <p class="meta mg-data">{{ r.position.lat | number: '1.5-5' }}, {{ r.position.lon | number: '1.5-5' }}</p> }
                <details class="why"><summary>Почему</summary><p>{{ r.rationale }}</p></details>
              }
              <p class="file mg-data">{{ f.file_name }} · {{ f.created_at | date: 'HH:mm:ss' }}@if (f.result?.latency_ms) { · {{ f.result!.latency_ms! / 1000 | number: '1.1-1' }} с }</p>
            </div>
          </article>
        }
      </div>
    }
  `,
  styles: `
    .sub { color: var(--ink-muted); margin: 4px 0 16px; }
    .drop { position: relative; display: grid; place-items: center; align-content: center; gap: 6px; text-align: center; min-height: 160px; padding: 24px;
            border: 2px dashed var(--line); border-radius: var(--radius-lg); background: var(--surface); cursor: pointer; transition: border-color .15s, background .15s; }
    .drop:hover, .drop.over { border-color: var(--accent); background: var(--surface-2); }
    .drop.busy { pointer-events: none; }
    .drop input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .drop:focus-within { box-shadow: var(--glow-accent); }
    .hint { color: var(--ink-muted); font-size: 13px; }
    .bar { width: min(320px, 80%); height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
    .bar span { display: block; height: 100%; background: var(--brand); transition: width .2s; }
    .extra { margin: 12px 0; }
    .extra summary { cursor: pointer; color: var(--ink-muted); font-size: 14px; }
    .fields { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; }
    .fields label { display: grid; gap: 4px; flex: 1 1 160px; }
    .fields input { height: 36px; padding: 0 10px; border-radius: var(--radius-sm); border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); font: 14px var(--font-sans); }
    .err { color: var(--status-defect); }
    .summary { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 12px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
    .card { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); overflow: hidden; }
    .card.critical { border-color: var(--status-defect); box-shadow: var(--glow-critical); }
    .ph { aspect-ratio: 4 / 3; background: var(--surface-2); }
    .ph img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .body { padding: 12px; display: grid; gap: 6px; align-content: start; }
    .top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .kind { font-size: 13px; color: var(--ink-muted); }
    h3 { margin: 2px 0 0; font-size: 16px; }
    .meta, .file { margin: 0; font-size: 13px; color: var(--ink-muted); }
    .action { margin: 0; font-size: 14px; }
    .why summary { cursor: pointer; font-size: 13px; color: var(--ink-muted); }
    .why p { margin: 4px 0 0; font-size: 13px; }
    .spin { width: 10px; height: 10px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spin .8s linear infinite; }
    .mg-pill:has(.spin)::before { display: none; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
  `,
})
export class CheckPage {
  private http = inject(HttpClient);
  readonly tax = inject(TaxonomyService);
  readonly sev = SEVERITY_LABEL;
  readonly route = ROUTE;
  readonly frames = signal<Frame[]>([]);
  readonly progress = signal<number | null>(null);
  readonly over = signal(false);
  readonly error = signal('');
  readonly objectId = signal('');
  readonly lat = signal('');
  readonly lon = signal('');
  readonly summary = computed(() => {
    const counts = new Map<string, number>();
    for (const f of this.frames()) {
      const k = f.status === 'queued' ? 'queued' : (f.result?.route ?? 'error');
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const order: (Route | 'queued')[] = ['critical', 'review', 'auto_ok', 'not_observed', 'error', 'queued'];
    return order
      .filter((k) => counts.has(k))
      .map((k) => ({ key: k, n: counts.get(k)!, ...(k === 'queued' ? { text: 'Анализ', pill: 'unseen' } : ROUTE[k]) }));
  });
  private poll?: ReturnType<typeof setInterval>;

  constructor() {
    this.http.get<Frame[]>('/api/frames', { params: { mine: true, limit: 60 } }).subscribe((xs) => this.frames.set(xs));
    // Verdicts arrive live; a slow poll covers a dropped SSE connection.
    inject(Api)
      .live()
      .pipe(takeUntilDestroyed())
      .subscribe((m) => {
        if (m.payload.type === 'frame_analyzed') this.apply(m.key, m.payload as unknown as Verdict);
      });
    this.poll = setInterval(() => this.refreshQueued(), 3000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(this.poll);
      for (const f of this.frames()) if (f.preview) URL.revokeObjectURL(f.preview);
    });
  }

  onPick(e: Event) {
    const input = e.target as HTMLInputElement;
    this.upload([...(input.files ?? [])]);
    input.value = '';
  }

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.over.set(false);
    this.upload([...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/')));
  }

  private upload(files: File[]) {
    if (!files.length) return;
    this.error.set('');
    const form = new FormData();
    for (const f of files) form.append('files', f, f.name);
    if (this.objectId().trim()) form.append('object_id', this.objectId().trim());
    if (this.lat().trim() && this.lon().trim()) {
      form.append('lat', this.lat().trim());
      form.append('lon', this.lon().trim());
    }
    const previews = new Map(files.map((f) => [f.name, URL.createObjectURL(f)]));
    this.progress.set(0);
    this.http.post<Accepted[]>('/api/frames', form, { reportProgress: true, observe: 'events' }).subscribe({
      next: (ev) => {
        if (ev.type === HttpEventType.UploadProgress && ev.total) this.progress.set(ev.loaded / ev.total);
        if (ev.type === HttpEventType.Response && ev.body) {
          const now = new Date().toISOString();
          const fresh: Frame[] = ev.body.map((a) => ({
            id: a.frame_id, media_uri: a.media_uri, file_name: a.file_name, status: 'queued', result: null, created_at: now,
            preview: previews.get(a.file_name ?? ''),
          }));
          this.frames.update((xs) => [...fresh, ...xs]);
          this.progress.set(null);
        }
      },
      error: (e) => {
        this.progress.set(null);
        previews.forEach((u) => URL.revokeObjectURL(u));
        this.error.set(e?.error?.error ?? 'Не удалось загрузить фото');
      },
    });
  }

  private apply(id: string, v: Verdict) {
    this.frames.update((xs) =>
      xs.map((f) => (f.id === id ? { ...f, status: v.route === 'error' ? 'error' : 'done', result: v } : f)),
    );
  }

  private refreshQueued() {
    for (const f of this.frames().filter((x) => x.status === 'queued')) {
      this.http.get<Frame>(`/api/frames/${f.id}`).subscribe((x) => {
        if (x.status !== 'queued' && x.result) this.apply(x.id, x.result);
      });
    }
  }
}
