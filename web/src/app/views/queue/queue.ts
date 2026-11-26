import { Component, ElementRef, HostListener, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth';
import { PoputnoStore } from '../../data/store';
import { Det, M, fmt } from '../../data/legacy';
import { PP, eventNode, plural } from '../../ui/pp';
import { Shell } from '../../ui/shell.service';

type Decision = 'confirm' | 'reject' | 'need_recapture';
type Mode = 'idle' | 'reasons' | 'other';

const KEYS = {
  confirm: ['y', 'н'],
  reject: ['n', 'т'],
  need_recapture: ['r', 'к'],
  next: ['j', 'о', 'ArrowDown'],
  prev: ['k', 'л', 'ArrowUp'],
};
type KeyName = keyof typeof KEYS;

/** Big imports put thousands of frames in the queue: draw a window around the selected one, not all of them. */
const WINDOW = 120;

/**
 * «Очередь проверки» (design2/site/js/views/queue.js): the list of frames waiting for a dispatcher,
 * critical first, and the selected frame with the evidence, probabilities, the organizers' annotation
 * and the decision bar. Y / N / R decide, J / K move, Enter opens the object, 1…6 pick a reject reason.
 */
@Component({
  selector: 'app-queue-view',
  imports: [RouterLink, ...PP],
  templateUrl: './queue.html',
  host: { style: 'display: contents' },
})
export class QueueView implements OnDestroy {
  readonly store = inject(PoputnoStore);
  private auth = inject(AuthService);
  private shell = inject(Shell);
  private router = inject(Router);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly fmt = fmt;
  readonly plural = plural;
  readonly eventNode = eventNode;

  readonly canReview = computed(() => this.auth.can('review'));
  readonly roleLabel = computed(() => this.store.tax()?.roleLabel(this.auth.user()?.role) ?? '');
  readonly empty = this.store.select((ds) => !!ds.meta?.empty, false);
  readonly reasons = computed<[string, string][]>(() => Object.entries(this.store.tax()?.dict.rejectReasons ?? {}) as [string, string][]);
  readonly decisions = computed(() => this.store.tax()?.dict.decisions ?? {});

  /** Optimistic: decided here but not yet confirmed by the server. */
  private readonly removed = signal<ReadonlySet<string>>(new Set());
  /** Selected detection id (as picked; `selId` is the one actually shown). */
  private readonly sel = signal<string | null>(null);
  private lastIndex = 0;
  readonly mode = signal<Mode>('idle');
  readonly last = signal<{ id: string; text: string } | null>(null);
  readonly leaving = signal(false);
  private busy = false;
  /** «Критично» pulses once per frame, never on keyboard repaint. */
  private pulsed = new Set<string>();
  private gAt = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private historyTimer: ReturnType<typeof setTimeout> | undefined;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private historyLoaded = new Set<string>();

  readonly list = computed<Det[]>(() => {
    this.store.version();
    const ds = this.store.ds();
    const removed = this.removed();
    return ds ? M.selectQueue(ds).filter((d: Det) => !removed.has(d.id)) : [];
  });
  readonly selId = computed(() => {
    const list = this.list();
    if (!list.length) return null;
    const s = this.sel();
    if (s && list.some((d) => d.id === s)) return s;
    return list[Math.min(this.lastIndex, list.length - 1)].id;
  });
  readonly current = computed<Det | null>(() => this.list().find((d) => d.id === this.selId()) ?? null);
  readonly index = computed(() => this.list().findIndex((d) => d.id === this.selId()));
  readonly critCount = computed(() => this.list().filter((d) => d.isCritical).length);
  readonly pulse = computed(() => {
    const d = this.current();
    if (!d?.isCritical || this.pulsed.has(d.id)) return false;
    this.pulsed.add(d.id);
    return true;
  });

  /** The drawn slice of the list: {start, end, items}. */
  readonly window = computed(() => {
    const list = this.list();
    if (list.length <= WINDOW) return { start: 0, end: list.length, items: list };
    const i = Math.max(0, this.index());
    const start = Math.max(0, Math.min(i - 30, list.length - WINDOW));
    const end = Math.min(list.length, start + WINDOW);
    return { start, end, items: list.slice(start, end) };
  });

  readonly history = computed(() => {
    const o = this.current()?.object;
    this.store.version();
    const ds = this.store.ds();
    return o && ds ? M.selectTimeline(ds, { objectId: o.id, order: 'desc', limit: 4 }) : [];
  });

  constructor() {
    this.store.refreshQueue().catch(() => {});
    effect(() => {
      const n = this.list().length;
      this.shell.setTitle(this.current() ? `Очередь проверки · ${n}` : 'Очередь проверки');
    });
    // The object's history (event log) is loaded on demand: fetch it for the selected frame's object.
    effect(() => {
      const id = this.current()?.objectId as string | undefined;
      clearTimeout(this.historyTimer);
      if (!id || this.historyLoaded.has(id) || untracked(() => this.store.ds()?.byId.get(id)?.detailsLoaded)) return;
      this.historyTimer = setTimeout(() => {
        this.historyLoaded.add(id);
        this.store.object(id).catch(() => this.historyLoaded.delete(id));
      }, 350);
    });
    // New frames for review arrive live (frame_analyzed with route review/critical): re-read the queue.
    effect(() => {
      const m = this.store.live();
      const route = m?.payload?.['route'];
      if (m?.payload.type !== 'frame_analyzed' || (route !== 'review' && route !== 'critical')) return;
      clearTimeout(this.refreshTimer);
      this.refreshTimer = setTimeout(() => this.store.refreshQueue().catch(() => {}), 500);
    });
  }

  ngOnDestroy() {
    this.timers.forEach(clearTimeout);
    clearTimeout(this.historyTimer);
    clearTimeout(this.refreshTimer);
  }

  private later(fn: () => void, ms = 0) {
    this.timers.push(setTimeout(fn, ms));
  }

  /* ------------------------------------------------------------- selection */

  select(id: string, { reveal = false } = {}) {
    const list = this.list();
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return;
    this.sel.set(id);
    this.lastIndex = i;
    this.mode.set('idle');
    this.later(() => {
      const detail = this.q('.ux-qdetail');
      if (detail) detail.scrollTop = 0;
      if (reveal) this.revealItem(i);
    });
  }

  move(step: number) {
    const list = this.list();
    if (!list.length) return;
    const i = Math.max(0, Math.min(list.length - 1, this.index() + step));
    this.select(list[i].id, { reveal: true });
  }

  /** Scrolls only the queue list (never the page) so the selected frame is visible. */
  private revealItem(n: number) {
    const ul = this.q('.ux-qlist__items');
    const el = this.q(`#q-${n}`);
    if (!ul || !el) return;
    const a = el.getBoundingClientRect(), b = ul.getBoundingClientRect();
    if (a.top < b.top) ul.scrollTop -= b.top - a.top + 8;
    else if (a.bottom > b.bottom) ul.scrollTop += a.bottom - b.bottom + 8;
  }

  private q(sel: string) {
    return this.host.nativeElement.querySelector<HTMLElement>(sel);
  }

  /* ------------------------------------------------------------- decisions */

  openReasons() {
    this.mode.set('reasons');
    this.later(() => this.q('.ux-reasons [data-action="reason"]')?.focus());
  }
  openOther() {
    this.mode.set('other');
    this.later(() => this.q('.ux-reasons__input')?.focus());
  }
  cancel() {
    this.mode.set('idle');
  }

  pickReason(k: string, e?: MouseEvent) {
    if (k === 'other') this.openOther();
    else this.decide('reject', k, { viaMouse: !!e && e.detail > 0 });
  }

  submitOther(e: Event, input: HTMLInputElement) {
    e.preventDefault();
    const text = input.value.trim();
    if (text) this.decide('reject', { other: text }, { viaMouse: true });
  }

  async decide(decision: Decision, rejectReason: unknown = null, { viaMouse = false } = {}) {
    const d = this.current();
    const tax = this.store.tax();
    if (!d || this.busy || !this.canReview() || !d.objectId || !tax) return;
    this.busy = true;
    if (viaMouse && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.leaving.set(true);
      await new Promise((r) => setTimeout(r, 160));
      this.leaving.set(false);
    }
    this.lastIndex = Math.max(0, this.list().indexOf(d));
    this.removed.update((s) => new Set(s).add(d.id));
    this.mode.set('idle');
    // the next frame takes the decided one's place
    const next = this.list();
    this.sel.set(next.length ? next[Math.min(this.lastIndex, next.length - 1)].id : null);
    // same rule as the registry (model.js displayStatus): a confirmed defect with critical severity shows as «Критично»
    const shown = d.severity === 'critical' || d.object?.maxSeverity === 'critical' ? 'critical' : 'defect';
    const word =
      decision === 'confirm'
        ? `подтверждён, статус «${tax.statusLabel(shown)}»`
        : decision === 'reject'
          ? `ложное: ${tax.rejectReasonLabel(rejectReason).toLowerCase()}`
          : 'нужен кадр';
    this.last.set({ id: d.objectId, text: word });
    this.later(() => {
      this.revealItem(this.index());
      const detail = this.q('.ux-qdetail');
      if (detail) detail.scrollTop = 0;
    });
    this.busy = false;
    try {
      await this.store.review(d.objectId, { detectionId: d.id, decision, rejectReason: rejectReason ?? undefined });
    } catch (err: any) {
      this.removed.update((s) => {
        const n = new Set(s);
        n.delete(d.id);
        return n;
      });
      this.last.set(null);
      this.shell.toast({ title: 'Решение не записано', text: err?.error?.error || err?.message || 'Ошибка API', tone: 'critical' });
    }
  }

  /* ------------------------------------------------------------- hotkeys */

  /** Runs before the shell's window listener; preventDefault() keeps the global keys out. */
  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || this.shell.helpOpen()) return;
    const k = e.key;
    const t = e.target as HTMLElement | null;
    if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) {
      if (k === 'Escape' && t.closest('[data-other]')) {
        e.preventDefault();
        this.openReasons();
      }
      return;
    }
    // G + letter is the shell's navigation (G N = «Наряды», G K = «Качество»): not ours.
    if (this.gAt && Date.now() - this.gAt < 1200) {
      this.gAt = 0;
      return;
    }
    this.gAt = k === 'g' || k === 'п' ? Date.now() : 0;
    if (this.empty()) return;
    const is = (name: KeyName) => KEYS[name].includes(k) || KEYS[name].includes(k.toLowerCase());
    const done = () => e.preventDefault();
    const mode = this.mode();
    if (mode === 'other') {
      if (k === 'Escape') { done(); this.openReasons(); }
      return;
    }
    if (mode === 'reasons') {
      const r = /^[1-9]$/.test(k) ? this.reasons()[+k - 1] : undefined;
      if (r) { done(); this.pickReason(r[0]); return; }
      if (k === 'Escape' || is('reject')) { done(); this.cancel(); return; }
    }
    if (is('next')) { done(); this.move(1); return; }
    if (is('prev')) { done(); this.move(-1); return; }
    if (k === 'Enter') {
      // Enter on another focused button/link activates it; on the list or the page it opens the object.
      if (t?.closest?.('a, button') && !t.closest('.ux-qitem')) return;
      const id = this.current()?.objectId;
      if (id) { done(); this.router.navigate(['/objects', id]); }
      return;
    }
    if (!this.canReview() || !this.current()) return;
    if (is('confirm')) { done(); this.decide('confirm'); return; }
    if (is('reject')) { done(); this.openReasons(); return; }
    if (is('need_recapture')) { done(); this.decide('need_recapture'); return; }
  }
}
