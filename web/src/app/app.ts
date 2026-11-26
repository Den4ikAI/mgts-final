import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { filter } from 'rxjs';
import { AuthService, ROLE_LABEL, Role } from './core/auth';
import { PoputnoStore } from './data/store';
import { M, fmt } from './data/legacy';
import { Shell } from './ui/shell.service';
import { PP, PpIcon, PpLoader, PpMark, PpStatus } from './ui/pp';

interface NavItem {
  name: string;
  path: string;
  label: string;
  short?: string;
  icon: string;
  roles: Role[];
  key: string;
  count?: 'pending' | 'orders';
}

/** Navigation of the «Попутно» site: who sees what, hotkey G + letter. */
const NAV: (NavItem | { sep: true })[] = [
  { name: 'summary', path: '/', label: 'Сводка', icon: 'chart', roles: ['admin', 'dispatcher', 'manager'], key: 's' },
  { name: 'queue', path: '/queue', label: 'Очередь проверки', short: 'Очередь', icon: 'queue', roles: ['admin', 'dispatcher', 'manager'], key: 'q', count: 'pending' },
  { name: 'objects', path: '/objects', label: 'Объекты', icon: 'list', roles: ['admin', 'dispatcher', 'manager', 'technician'], key: 'o' },
  { name: 'orders', path: '/orders', label: 'Наряды', icon: 'route', roles: ['admin', 'dispatcher', 'manager', 'technician'], key: 'n', count: 'orders' },
  { name: 'quality', path: '/quality', label: 'Качество модели', short: 'Качество', icon: 'eye', roles: ['admin', 'dispatcher', 'manager'], key: 'k' },
  { sep: true },
  { name: 'import', path: '/import', label: 'Загрузить данные', short: 'Данные', icon: 'upload', roles: ['admin', 'dispatcher', 'technician'], key: 'i' },
  { name: 'check', path: '/check', label: 'Проверить фото', short: 'Фото', icon: 'camera', roles: ['admin', 'dispatcher', 'technician'], key: 'c' },
  { name: 'users', path: '/users', label: 'Пользователи', icon: 'user', roles: ['admin'], key: 'u' },
  { name: 'about', path: '/about', label: 'О системе', icon: 'layers', roles: ['admin', 'dispatcher', 'manager', 'technician'], key: 'a' },
];

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, ...PP],
  templateUrl: './app.html',
})
export class App {
  readonly auth = inject(AuthService);
  readonly store = inject(PoputnoStore);
  readonly shell = inject(Shell);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);

  readonly roleLabel = ROLE_LABEL;
  readonly theme = signal<'dark' | 'light'>((localStorage.getItem('poputno.theme') as 'dark' | 'light') || 'dark');
  readonly url = signal(this.router.url);
  readonly drawer = signal(false);
  readonly logo = signal<SafeHtml | null>(null);
  readonly searchQ = signal('');
  readonly searchActive = signal(0);
  readonly searchOpen = signal(false);

  /** Bare pages: login and the brigade's phone screen of one work order. */
  readonly bare = computed(() => this.url().startsWith('/login'));
  readonly route = computed(() => {
    const u = this.url().split('?')[0];
    if (u === '/' || u === '') return 'summary';
    const first = u.split('/')[1];
    return { orders: u.split('/').length > 2 ? 'order' : 'orders' }[first as 'orders'] ?? first;
  });
  readonly navActive = computed(() => (this.route() === 'order' ? 'orders' : this.route() === 'object' ? 'objects' : this.route()));

  readonly nav = computed(() => {
    const role = this.auth.user()?.role;
    return NAV.filter((n): n is NavItem => !('sep' in n) && !!role && n.roles.includes(role));
  });
  /** Nav with separators kept (sidebar). */
  readonly navWithSep = computed(() => {
    const role = this.auth.user()?.role;
    return NAV.filter((n) => 'sep' in n || (!!role && (n as NavItem).roles.includes(role)));
  });
  readonly stats = this.store.select((ds) => M.selectStats(ds), null as any);
  readonly counts = computed(() => ({ pending: this.stats()?.pending ?? 0, orders: this.stats()?.workOrders?.open ?? 0 }));
  readonly hot = computed(() => !!this.stats()?.criticalOpen);
  readonly results = computed(() => {
    const q = this.searchQ().trim();
    this.store.version();
    const ds = this.store.ds();
    return q && ds ? M.selectObjects(ds, { q, limit: 8 }) : [];
  });

  private gPending = 0;

  constructor() {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      this.url.set((e as NavigationEnd).urlAfterRedirects);
      this.drawer.set(false);
      document.body.dataset['route'] = this.route();
      // the brigade's work-order screen is a phone in daylight: light theme while it is open (not saved)
      document.documentElement.dataset['theme'] = this.route() === 'order' ? 'light' : this.theme();
      window.scrollTo(0, 0);
    });
    effect(() => {
      document.documentElement.dataset['theme'] = this.route() === 'order' ? 'light' : this.theme();
      try { localStorage.setItem('poputno.theme', this.theme()); } catch { /* private mode */ }
    });
    effect(() => document.body.classList.toggle('drawer-open', this.drawer()));
    // Load the data once logged in; forget it on logout.
    effect(() => {
      const u = this.auth.user();
      document.body.dataset['role'] = u?.role ?? '';
      if (u && !this.store.ds() && !this.store.loading()) this.store.load().catch(() => {});
      if (!u) this.store.reset();
    });
    // Critical alerts as toasts (not while the dispatcher is already in the queue).
    effect(() => {
      const a = this.store.alert();
      if (a && this.route() !== 'queue') {
        this.shell.toast({ title: `Критично: ${a.text}`, text: `${a.objectId} · ${fmt.time(a.at)}`, tone: 'critical', link: '/queue', actionLabel: 'В очередь' });
      }
    });
    fetch('/brand/logo/logo-dark.svg')
      .then((r) => (r.ok ? r.text() : null))
      .then((svg) => {
        if (!svg) return;
        const clean = svg
          .replace(/<title>.*?<\/title>/, '')
          .replace(/<svg /, '<svg class="pp-logo ux-logo__svg" aria-hidden="true" ')
          .replace(/ width="[^"]*" height="[^"]*"/, '');
        this.logo.set(this.sanitizer.bypassSecurityTrustHtml(clean));
      })
      .catch(() => {});
  }

  toggleTheme() {
    this.theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  async logout() {
    await this.auth.logout();
  }

  go(id: string) {
    this.searchQ.set('');
    this.searchOpen.set(false);
    (document.activeElement as HTMLElement | null)?.blur();
    this.router.navigate(['/objects', id]);
  }

  onSearchKey(e: KeyboardEvent) {
    const items = this.results();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      this.searchActive.update((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length);
    } else if (e.key === 'Enter' && items[this.searchActive()]) this.go(items[this.searchActive()].id);
    else if (e.key === 'Escape') {
      this.searchQ.set('');
      (e.target as HTMLElement).blur();
    }
  }

  /**
   * Global hotkeys. Screens listen on `document:keydown` and call preventDefault() for keys
   * they handle; this runs after them (window) and skips handled events.
   */
  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || this.bare()) return;
    if (this.shell.helpOpen()) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
    const k = e.key;
    if (this.gPending && Date.now() - this.gPending < 1200) {
      this.gPending = 0;
      const ru: Record<string, string> = { ы: 's', й: 'q', щ: 'o', т: 'n', л: 'k', ш: 'i', с: 'c', ф: 'a', г: 'u' };
      const n = this.nav().find((x) => x.key === (ru[k] || k.toLowerCase()));
      if (n) {
        e.preventDefault();
        this.router.navigateByUrl(n.path);
      }
      return;
    }
    this.gPending = 0;
    if (k === '/') {
      e.preventDefault();
      document.getElementById('global-search')?.focus();
    } else if (k === '?') {
      e.preventDefault();
      this.shell.helpOpen.set(true);
    } else if (k === 't' || k === 'е') this.toggleTheme();
    else if (k === 'g' || k === 'п') this.gPending = Date.now();
  }

  isNav(n: unknown): n is NavItem {
    return !!n && !('sep' in (n as object));
  }
  readonly hotkeyNav = computed(() => this.nav());
}
