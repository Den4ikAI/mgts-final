import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PoputnoStore } from '../../data/store';
import { M, T, fmt } from '../../data/legacy';
import { Shell } from '../../ui/shell.service';
import { ICONS, PP, plural } from '../../ui/pp';

const PAGE = 200;
const ATTENTION = ['suspected', 'defect', 'critical'];
const FILTER_KEYS = ['q', 'status', 'kind', 'severity', 'district', 'defect'] as const;

interface Filter {
  q: string;
  status: string;
  kind: string;
  severity: string;
  district: string;
  defect: string;
  sort: string;
}
const EMPTY: Omit<Filter, 'sort'> = { q: '', status: '', kind: '', severity: '', district: '', defect: '' };

/** «Реестр объектов»: ported from design2/site/js/views/objects.js. Filters live in the query string. */
@Component({
  selector: 'app-objects-view',
  imports: [RouterLink, ...PP],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './objects.html',
  styleUrl: './objects.scss',
})
export class ObjectsView {
  readonly store = inject(PoputnoStore);
  private shell = inject(Shell);
  private router = inject(Router);
  private location = inject(Location);
  readonly icons = ICONS;
  readonly fmt = fmt;
  readonly plural = plural;

  readonly f = signal<Filter>(this.fromQuery());
  /** The search box as typed; applied to `f` after a short pause. */
  readonly qInput = signal(this.f().q);
  readonly limit = signal(PAGE);
  readonly exporting = signal<'' | 'xlsx' | 'csv'>('');
  private qTimer: ReturnType<typeof setTimeout> | undefined;

  readonly ready = computed(() => !!this.store.ds());
  readonly empty = this.store.select((ds) => !!ds.meta.empty, false);
  readonly total = this.store.select((ds) => ds.objects.length, 0);
  readonly facets = this.store.select((ds) => M.selectFacets(ds), null as any);

  readonly statusOptions = computed(() => {
    const tax = this.store.tax();
    return [['', 'Все статусы'], ['attention', 'Требуют внимания'], ...T.STATUS_ORDER.map((s: string) => [s, tax?.statusLabel(s) ?? s])] as [string, string][];
  });
  readonly kindOptions = computed(() => {
    const tax = this.store.tax();
    return [['', 'Все типы'], ...(this.facets()?.kinds ?? []).map((k: string) => [k, tax?.kindLabel(k) ?? k])] as [string, string][];
  });
  readonly severityOptions = computed(() => {
    const tax = this.store.tax();
    return [['', 'Любая'], ...['critical', 'high', 'medium', 'low'].map((s) => [s, tax?.severityLabel(s) ?? s])] as [string, string][];
  });
  readonly defectOptions = computed(() => {
    const d = this.facets()?.defectTypes ?? [];
    return d.length ? ([['', 'Любой'], ...d.map((x: any) => [x.key, x.label])] as [string, string][]) : [];
  });
  readonly sortOptions: [string, string][] = [
    ['priority', 'Сначала срочные'],
    ['lastSeen', 'Последний кадр'],
    ['severity', 'По опасности'],
    ['id', 'По ID'],
  ];

  readonly selects = computed(() =>
    [
      { name: 'status' as const, label: 'Статус', options: this.statusOptions() },
      { name: 'kind' as const, label: 'Тип', options: this.kindOptions() },
      { name: 'severity' as const, label: 'Опасность', options: this.severityOptions() },
      { name: 'defect' as const, label: 'Дефект', options: this.defectOptions() },
      { name: 'sort' as const, label: 'Порядок', options: this.sortOptions },
    ].filter((x) => x.options.length),
  );

  readonly current = computed(() => {
    const f = this.f();
    this.store.version();
    const ds = this.store.ds();
    if (!ds) return [];
    const status = f.status === 'attention' ? ATTENTION : f.status || undefined;
    return M.selectObjects(ds, {
      q: f.q || undefined,
      displayStatus: status,
      kind: f.kind || undefined,
      severity: f.severity || undefined,
      district: f.district || undefined,
      defectType: f.defect || undefined,
      sort: f.sort,
    }) as any[];
  });
  readonly rows = computed(() => this.current().slice(0, this.limit()));
  readonly more = computed(() => Math.min(PAGE, this.current().length - this.rows().length));
  readonly active = computed(() => FILTER_KEYS.some((k) => this.f()[k]));
  readonly countText = computed(() => {
    const n = this.current().length, shown = this.rows().length;
    return `${fmt.int(n)} ${plural(n, ['объект', 'объекта', 'объектов'])} из ${fmt.int(this.total())}${n > shown ? `, показаны первые ${shown}` : ''}`;
  });

  constructor() {
    this.shell.setTitle('Объекты');
    inject(DestroyRef).onDestroy(() => clearTimeout(this.qTimer));
  }

  private fromQuery(): Filter {
    const q = inject(ActivatedRoute).snapshot.queryParamMap;
    const g = (k: string) => q.get(k) || '';
    return { q: g('q'), status: g('status'), kind: g('kind'), severity: g('severity'), district: g('district'), defect: g('defect'), sort: g('sort') || 'priority' };
  }

  set(k: keyof Filter, v: string) {
    this.f.update((f) => ({ ...f, [k]: v }));
    this.limit.set(PAGE);
    this.syncUrl();
  }

  onSearch(v: string) {
    this.qInput.set(v);
    clearTimeout(this.qTimer);
    this.qTimer = setTimeout(() => this.set('q', v), 120);
  }

  reset() {
    clearTimeout(this.qTimer);
    this.qInput.set('');
    this.f.update((f) => ({ ...f, ...EMPTY }));
    this.limit.set(PAGE);
    this.syncUrl();
  }

  showMore() {
    this.limit.update((l) => l + PAGE);
  }

  open(id: string, e: Event) {
    if ((e.target as HTMLElement).closest('a')) return;
    this.router.navigate(['/objects', id]);
  }

  /** Same as the site's history.replaceState: the URL keeps the filters without a new history entry. */
  private syncUrl() {
    const q = Object.fromEntries(Object.entries(this.f()).filter(([k, v]) => v && !(k === 'sort' && v === 'priority')));
    this.location.replaceState(this.router.serializeUrl(this.router.createUrlTree(['/objects'], { queryParams: q })));
  }

  /** «Выгрузить перечень»: the server's result table (objects, verdict, recommendation, check against the annotation). */
  async exportTable(format: 'xlsx' | 'csv') {
    if (this.exporting()) return;
    this.exporting.set(format);
    try {
      await this.store.download({ format });
      this.shell.toast({ title: 'Перечень выгружен', text: format === 'xlsx' ? 'Таблица результата, XLSX' : 'Таблица результата, CSV для Excel', tone: 'ok' });
    } catch (e: any) {
      this.shell.toast({ title: 'Выгрузка не удалась', text: e?.error?.error || e?.message || 'Сервер не ответил', tone: 'critical' });
    } finally {
      this.exporting.set('');
    }
  }
}
