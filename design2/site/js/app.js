/**
 * «Попутно» product UI: shell, roles, theme, source, router, hotkeys, live feed.
 * Views live in js/views/*.js and export { title, render(root, ctx) → {update?, destroy?, keydown?} }.
 */
import * as data from './data/index.js';
import { parseHash, matchRoute, href, navigate } from './router.js';
import { html, raw, mount, $, $$, icon, onAction, isTyping, debounce, esc, plural } from './ui/dom.js';
import { loader, hydratePhotos, statusPill, mark, forgetMissingPhotos } from './ui/components.js';

const { openSource, selectObjects, selectStats, fmt, ROLE } = data;

/* ------------------------------------------------------------------ roles */

const PERMS = {
  admin: ['objects_read', 'review', 'stats_read', 'work_orders_manage', 'work_orders_own', 'import', 'dev_tools'],
  dispatcher: ['objects_read', 'review', 'stats_read', 'work_orders_manage', 'import'],
  manager: ['objects_read', 'stats_read'],
  technician: ['objects_read', 'work_orders_own'],
};
const START = { admin: '/queue', dispatcher: '/queue', manager: '/', technician: '/orders' };

/** Navigation: path, label, icon, who sees it. */
const NAV = [
  { name: 'summary', path: '/', label: 'Сводка', icon: 'chart', roles: ['admin', 'dispatcher', 'manager'], key: 's' },
  { name: 'queue', path: '/queue', label: 'Очередь проверки', short: 'Очередь', icon: 'queue', roles: ['admin', 'dispatcher', 'manager'], key: 'q', count: 'pending' },
  { name: 'objects', path: '/objects', label: 'Объекты', icon: 'list', roles: ['admin', 'dispatcher', 'manager', 'technician'], key: 'o' },
  { name: 'orders', path: '/orders', label: 'Наряды', icon: 'route', roles: ['admin', 'dispatcher', 'manager', 'technician'], key: 'n', count: 'orders' },
  { name: 'quality', path: '/quality', label: 'Качество модели', short: 'Качество', icon: 'eye', roles: ['admin', 'dispatcher', 'manager'], key: 'k' },
  { sep: true },
  { name: 'import', path: '/import', label: 'Загрузить данные', short: 'Данные', icon: 'upload', roles: ['admin', 'dispatcher', 'manager'], key: 'i' },
  { name: 'check', path: '/check', label: 'Проверить фото', short: 'Фото', icon: 'camera', roles: ['admin', 'dispatcher', 'manager'], key: 'c' },
  { name: 'about', path: '/about', label: 'О системе', icon: 'layers', roles: ['admin', 'dispatcher', 'manager', 'technician'], key: 'a' },
];

const ROUTES = [
  { name: 'summary', pattern: '/', view: () => import('./views/summary.js') },
  { name: 'queue', pattern: '/queue', view: () => import('./views/queue.js') },
  { name: 'objects', pattern: '/objects', view: () => import('./views/objects.js') },
  { name: 'object', pattern: '/objects/:id', nav: 'objects', view: () => import('./views/object.js') },
  { name: 'orders', pattern: '/orders', view: () => import('./views/orders.js') },
  { name: 'order', pattern: '/orders/:id', nav: 'orders', view: () => import('./views/order.js') },
  { name: 'quality', pattern: '/quality', view: () => import('./views/quality.js') },
  { name: 'import', pattern: '/import', view: () => import('./views/import.js') },
  { name: 'check', pattern: '/check', view: () => import('./views/check.js') },
  { name: 'about', pattern: '/about', view: () => import('./views/about.js') },
];

/* ------------------------------------------------------------------ settings */

const store = {
  get(k, d = null) { try { return localStorage.getItem(`poputno.${k}`) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`poputno.${k}`, v); } catch { /* private mode */ } },
};

const app = {
  data,
  src: null,
  ds: null,
  role: 'dispatcher',
  theme: 'dark',
  view: null,
  route: null,
  live: null,
  listeners: new Set(),
};
window.__poputno = app;

app.can = (perm) => (PERMS[app.role] || []).includes(perm);
app.navigate = navigate;
app.href = href;
app.hydrate = (root) => hydratePhotos(root, app.src);
app.onChange = (fn) => { app.listeners.add(fn); return () => app.listeners.delete(fn); };

/* ------------------------------------------------------------------ theme */

function applyTheme(t) {
  app.theme = t;
  document.documentElement.dataset.theme = t;
  store.set('theme', t);
  const b = $('#theme-toggle');
  if (b) {
    b.innerHTML = String(icon(t === 'dark' ? 'sun' : 'moon'));
    b.setAttribute('aria-label', t === 'dark' ? 'Светлая тема' : 'Тёмная тема');
    b.title = `${t === 'dark' ? 'Светлая тема' : 'Тёмная тема'} (T)`;
  }
}

/* ------------------------------------------------------------------ toasts */

app.toast = ({ title, text = '', tone = '', href: link, actionLabel, life = 4500 }) => {
  const host = $('#toasts');
  const el = document.createElement('div');
  el.className = `pp-toast ${tone ? `pp-toast--${tone}` : ''} ux-toast`;
  el.setAttribute('role', tone === 'critical' ? 'alert' : 'status');
  const ic = tone === 'critical' ? 'status-critical' : tone === 'ok' ? 'check' : 'alert';
  el.innerHTML = String(html`<svg class="pp-toast__icon" aria-hidden="true"><use href="../brand/icons.svg#i-${ic}"/></svg>
    <div><div class="pp-toast__title">${title}</div>${text ? html`<div class="pp-toast__text">${text}</div>` : ''}</div>
    <div class="ux-toast__actions">${link ? html`<a class="pp-btn pp-btn--ghost pp-btn--sm" href="${link}">${actionLabel || 'Открыть'}</a>` : ''}<button class="pp-btn pp-btn--ghost pp-btn--icon pp-btn--sm" aria-label="Закрыть">${icon('close')}</button></div>`);
  const close = () => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 220); };
  el.querySelector('button[aria-label="Закрыть"]').addEventListener('click', close);
  el.querySelector('a')?.addEventListener('click', close);
  host.append(el);
  while (host.children.length > 3) host.firstElementChild.remove();
  setTimeout(close, life);
};

/* ------------------------------------------------------------------ shell */

function sourceChip() {
  const src = app.src, meta = app.ds?.meta || {};
  if (meta.fallbackFrom) return html`<a class="ux-chip ux-chip--warn" href="#/import" title="${meta.fallbackReason || ''}">${icon('alert', 'pp-icon--sm')}API недоступно</a>`;
  if (src.kind === 'demo') return html`<a class="ux-chip ux-chip--demo" href="#/import" title="${meta.note || ''}"><span class="ux-chip__dot"></span>Демо-данные</a>`;
  if (src.kind === 'file') return html`<a class="ux-chip ux-chip--file" href="#/import" title="${(meta.files || []).join(', ')}">${icon('layers', 'pp-icon--sm')}${meta.empty ? 'Нет данных' : meta.base ? `Датасет${meta.own ? ` + ${meta.own}` : ''}` : 'Загрузки'}</a>`;
  return html`<a class="ux-chip ux-chip--api" href="#/import" title="${src.base || 'тот же адрес'}"><span class="ux-chip__dot"></span>API${src.base ? html` · <span class="pp-mono">${src.base.replace(/^https?:\/\//, '')}</span>` : ''}</a>`;
}

function navCounts() {
  const st = app.ds ? selectStats(app.ds) : null;
  return { pending: st?.pending ?? 0, orders: st?.workOrders.open ?? 0 };
}

function navItems(mobile = false) {
  const counts = navCounts();
  const cur = app.route?.route.nav || app.route?.route.name;
  return NAV.filter((n) => n.sep || n.roles.includes(app.role)).map((n) => {
    if (n.sep) return mobile ? '' : html`<li class="ux-nav__sep" role="separator"></li>`;
    const c = n.count ? counts[n.count] : 0;
    return html`<li><a class="ux-nav__item${cur === n.name ? ' is-active' : ''}" href="#${n.path}" ${cur === n.name ? raw('aria-current="page"') : ''} data-nav="${n.name}">
      ${icon(n.icon)}<span class="ux-nav__label">${mobile ? n.short || n.label : n.label}</span>${c ? html`<span class="ux-nav__count pp-mono${n.name === 'queue' && selectStats(app.ds).criticalOpen ? ' is-hot' : ''}">${c}</span>` : ''}</a></li>`;
  });
}

function renderShell() {
  const root = $('#app');
  mount(root, html`
  <a class="ux-skip" href="#view">К содержимому</a>
  <aside class="ux-side" id="side" aria-label="Меню">
    <div class="ux-side__brand"><a href="#/" class="ux-logo" aria-label="Попутно, на главную" id="logo-slot">${mark('', 28)}<span class="ux-logo__word">попутно</span></a></div>
    <nav class="ux-nav"><ul id="nav">${navItems()}</ul></nav>
    <div class="ux-side__foot">
      <label class="ux-role"><span class="pp-micro pp-muted">Роль</span>
        <span class="pp-select"><select id="role-select" aria-label="Роль">${Object.entries(ROLE).filter(([k]) => PERMS[k]).map(([k, v]) => html`<option value="${k}" ${k === app.role ? raw('selected') : ''}>${v}</option>`)}</select>
        <svg class="pp-select__chevron" aria-hidden="true"><use href="../brand/icons.svg#i-chevron-down"/></svg></span></label>
      <div id="live-slot"></div>
      <div class="ux-side__row"><span id="source-chip">${sourceChip()}</span>
        <button class="pp-btn pp-btn--ghost pp-btn--icon pp-btn--sm" id="theme-toggle"></button>
        <button class="pp-btn pp-btn--ghost pp-btn--icon pp-btn--sm" id="help-open" aria-label="Горячие клавиши" title="Горячие клавиши (?)"><span class="ux-q">?</span></button></div>
    </div>
  </aside>
  <div class="ux-scrim" id="scrim" hidden></div>
  <div class="ux-main">
    <header class="ux-top">
      <button class="pp-btn pp-btn--ghost pp-btn--icon ux-top__menu" id="menu-open" aria-label="Меню">${icon('list')}</button>
      <a class="ux-top__brand" href="#/" aria-label="Попутно">${mark('', 24)}</a>
      <h1 class="ux-top__title" id="page-title"></h1>
      <div class="ux-search" role="search">
        <label class="pp-search"><svg class="pp-search__icon" aria-hidden="true"><use href="../brand/icons.svg#i-search"/></svg>
          <input class="pp-input" id="global-search" type="search" placeholder="Найти объект по ID" autocomplete="off" aria-label="Поиск объекта" aria-controls="search-results"><span class="pp-kbd">/</span></label>
        <ul class="ux-search__results" id="search-results" role="listbox" hidden></ul>
      </div>
      <span class="ux-top__chip" id="source-chip-top">${sourceChip()}</span>
    </header>
    <div id="banner"></div>
    <main id="view" class="ux-view" tabindex="-1"></main>
  </div>
  <nav class="ux-tabbar" aria-label="Разделы"><ul id="tabbar"></ul></nav>
  <div class="ux-toasts" id="toasts" aria-live="polite"></div>
  <dialog class="ux-dialog" id="help">
    <div class="ux-dialog__head"><h2 class="pp-title">Горячие клавиши</h2><button class="pp-btn pp-btn--ghost pp-btn--icon pp-btn--sm" data-close aria-label="Закрыть">${icon('close')}</button></div>
    <div class="ux-keys">
      <section><h3 class="pp-label pp-muted">Везде</h3><dl>
        <dt><span class="pp-kbd">/</span></dt><dd>Поиск объекта</dd>
        <dt><span class="pp-kbd">?</span></dt><dd>Эта подсказка</dd>
        <dt><span class="pp-kbd">T</span></dt><dd>Сменить тему</dd>
        ${NAV.filter((n) => n.key).map((n) => html`<dt><span class="pp-kbd">G</span> <span class="pp-kbd">${n.key.toUpperCase()}</span></dt><dd>${n.label}</dd>`)}
      </dl></section>
      <section><h3 class="pp-label pp-muted">Очередь проверки</h3><dl>
        <dt><span class="pp-kbd">Y</span></dt><dd>Подтвердить</dd>
        <dt><span class="pp-kbd">N</span></dt><dd>Ложное, затем причина <span class="pp-kbd">1</span>…<span class="pp-kbd">6</span></dd>
        <dt><span class="pp-kbd">R</span></dt><dd>Нужен кадр</dd>
        <dt><span class="pp-kbd">J</span> <span class="pp-kbd">K</span></dt><dd>Следующий и предыдущий кадр</dd>
        <dt><span class="pp-kbd">Enter</span></dt><dd>Открыть объект</dd>
        <dt><span class="pp-kbd">Esc</span></dt><dd>Отменить выбор причины</dd>
      </dl><p class="pp-caption pp-muted">В русской раскладке работают Н, Т, К.</p></section>
    </div>
  </dialog>`);

  // logo: inline the real wordmark so it takes token colours
  fetch('../brand/logo/logo-dark.svg').then((r) => (r.ok ? r.text() : null)).then((svg) => {
    if (!svg) return;
    const slot = $('#logo-slot');
    slot.innerHTML = svg.replace(/<title>.*?<\/title>/, '').replace(/<svg /, '<svg class="pp-logo ux-logo__svg" aria-hidden="true" ').replace(/ width="[^"]*" height="[^"]*"/, '');
  }).catch(() => {});

  applyTheme(app.theme);
  $('#theme-toggle').addEventListener('click', () => applyTheme(app.theme === 'dark' ? 'light' : 'dark'));
  $('#help-open').addEventListener('click', () => $('#help').showModal());
  $('#help').addEventListener('click', (e) => { if (e.target.matches('[data-close], [data-close] *') || e.target === $('#help')) $('#help').close(); });
  $('#role-select').addEventListener('change', (e) => setRole(e.target.value, { go: true }));
  $('#menu-open').addEventListener('click', () => openDrawer(true));
  $('#scrim').addEventListener('click', () => openDrawer(false));
  $('#nav').addEventListener('click', () => openDrawer(false));
  bindSearch();
  renderLive();
}

function openDrawer(open) {
  document.body.classList.toggle('drawer-open', open);
  $('#scrim').hidden = !open;
}

function refreshChrome() {
  if (!$('#nav')) return;
  $('#nav').innerHTML = String(html`${navItems()}`);
  const mobileNav = navItems(true).filter(Boolean);
  $('#tabbar').innerHTML = String(html`${mobileNav.slice(0, 4)}<li><button class="ux-nav__item" id="tab-more">${icon('layers')}<span class="ux-nav__label">Ещё</span></button></li>`);
  $('#tab-more').addEventListener('click', () => openDrawer(true));
  $('#source-chip').innerHTML = String(sourceChip());
  $('#source-chip-top').innerHTML = String(sourceChip());
  renderBanner();
}

function renderBanner() {
  const meta = app.ds?.meta || {};
  const b = $('#banner');
  if (meta.fallbackFrom) {
    b.innerHTML = String(html`<div class="ux-banner ux-banner--warn">${icon('alert', 'pp-icon--sm')}<span><b>API недоступно</b>, показан датасет и загрузки из браузера. ${meta.fallbackReason || ''}</span><a class="pp-link" href="#/import">Источник данных</a></div>`);
  } else if (meta.demo) {
    b.innerHTML = String(html`<div class="ux-banner ux-banner--demo"><span class="ux-banner__tag pp-mono">ДЕМО</span><span>${meta.note || 'Демо-данные'}${meta.title ? html`<span class="ux-banner__title"> · <span class="pp-secondary">${meta.title}</span></span>` : ''}</span><a class="pp-link" href="#/import">Загрузить датасет</a></div>`);
  } else b.innerHTML = '';
  document.documentElement.style.setProperty('--banner-h', `${b.offsetHeight}px`);
}

function renderLive() {
  const slot = $('#live-slot');
  if (!slot) return;
  if (typeof app.src?.simulate !== 'function') { slot.innerHTML = ''; return; }
  const on = !!app.live;
  slot.innerHTML = String(html`<button class="ux-live${on ? ' is-on' : ''}" id="live-toggle" aria-pressed="${on}" title="Демо: машины проезжают мимо объектов, новые кадры приходят в очередь">
    <span class="ux-live__dot"></span><span>Живые проезды</span><span class="ux-live__state pp-mono">${on ? 'вкл' : 'выкл'}</span></button>`);
  $('#live-toggle').addEventListener('click', () => setLive(!app.live));
}

function setLive(on) {
  if (app.live) { app.live(); app.live = null; }
  if (on && app.src?.simulate) app.live = app.src.simulate({ intervalMs: 5000, defectShare: 0.3 });
  renderLive();
}

function setRole(r, { go = false } = {}) {
  if (!PERMS[r]) r = 'dispatcher';
  app.role = r;
  store.set('role', r);
  document.body.dataset.role = r;
  if ($('#role-select')) $('#role-select').value = r;
  refreshChrome();
  if (go) navigate(START[r]);
}
app.startPath = () => START[app.role];

/** Persists the source choice and reloads the page (data-layer switchSource only changes the URL, which does not reload when nothing but the hash differs). */
app.switchSource = (kind, opts = {}) => {
  data.switchSource(kind, { ...opts, reload: false });
  const u = new URL(location.href);
  u.searchParams.delete('source');
  u.searchParams.delete('api');
  if (u.toString() === location.href) location.reload();
  else location.href = u.toString();
};

/* ------------------------------------------------------------------ search */

function bindSearch() {
  const input = $('#global-search');
  const list = $('#search-results');
  let items = [], active = 0;
  const paint = () => {
    const q = input.value.trim();
    if (!q || !app.ds) { list.hidden = true; return; }
    items = selectObjects(app.ds, { q, limit: 8 });
    active = 0;
    list.hidden = false;
    list.innerHTML = items.length
      ? String(html`${items.map((o, i) => html`<li role="option" id="sr-${i}" aria-selected="${i === active}" data-id="${o.id}">
          <span class="pp-id">${o.id}</span><span class="ux-search__addr">${o.kindLabel}</span>${statusPill(o.displayStatus, o.displayStatusLabel, { sm: true })}</li>`)}`)
      : String(html`<li class="ux-search__none">Ничего не нашли по «${q}»</li>`);
  };
  const go = (id) => { input.value = ''; list.hidden = true; input.blur(); navigate(`/objects/${encodeURIComponent(id)}`); };
  input.addEventListener('input', debounce(paint, 80));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      $$('li[data-id]', list).forEach((li, i) => li.setAttribute('aria-selected', i === active));
    } else if (e.key === 'Enter' && items[active]) go(items[active].id);
    else if (e.key === 'Escape') { input.value = ''; list.hidden = true; input.blur(); }
  });
  list.addEventListener('mousedown', (e) => { const li = e.target.closest('li[data-id]'); if (li) { e.preventDefault(); go(li.dataset.id); } });
  input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 120));
}

/* ------------------------------------------------------------------ hotkeys */

let gPending = 0;
function onKey(e) {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
  if ($('#help')?.open) return;
  if (isTyping(e)) return;
  const k = e.key;
  if (gPending && Date.now() - gPending < 1200) {
    gPending = 0;
    const ru = { ы: 's', й: 'q', щ: 'o', т: 'n', л: 'k', ш: 'i', с: 'c', ф: 'a' };
    const n = NAV.find((x) => x.key === (ru[k] || k.toLowerCase()) && x.roles.includes(app.role));
    if (n) { e.preventDefault(); navigate(n.path); }
    return;
  }
  gPending = 0;
  if (app.view?.keydown && app.view.keydown(e) === true) return;
  if (k === '/') { e.preventDefault(); $('#global-search').focus(); return; }
  if (k === '?') { e.preventDefault(); $('#help').showModal(); return; }
  if (k === 't' || k === 'е') { applyTheme(app.theme === 'dark' ? 'light' : 'dark'); return; }
  if (k === 'g' || k === 'п') { gPending = Date.now(); }
}

/* ------------------------------------------------------------------ routing */

let renderSeq = 0;
async function route() {
  const { path, query } = parseHash();
  const m = matchRoute(ROUTES, path);
  if (!m) { navigate(START[app.role], {}, { replace: true }); return; }
  const seq = ++renderSeq;
  app.view?.destroy?.();
  app.view = null;
  app.route = { route: m.route, params: m.params, query };
  document.body.dataset.route = m.route.name;
  // brigade screen is a phone in daylight: light theme for the whole page while it is open (not saved)
  document.documentElement.dataset.theme = m.route.name === 'order' ? 'light' : app.theme;
  refreshChrome();
  // fresh element per screen: views bind listeners on their root, they must not pile up
  const stale = $('#view');
  const root = stale.cloneNode(false);
  stale.replaceWith(root);
  root.className = 'ux-view';
  root.removeAttribute('data-theme');
  let mod;
  try {
    mod = (await m.route.view()).default;
  } catch (err) {
    console.error(err);
    mount(root, html`<div class="ux-page"><p class="pp-body">Экран не загрузился: ${err.message}</p></div>`);
    return;
  }
  if (seq !== renderSeq) return;
  const title = typeof mod.title === 'function' ? mod.title(m.params) : mod.title;
  $('#page-title').textContent = title;
  document.title = `${title} · Попутно`;
  root.innerHTML = '';
  try {
    app.view = (await mod.render(root, ctx(m.params, query))) || {};
  } catch (err) {
    console.error(err);
    mount(root, html`<div class="ux-page"><div class="ux-banner ux-banner--warn">${icon('alert', 'pp-icon--sm')}<span>Экран не открылся: ${err.message}</span></div></div>`);
  }
  if (seq !== renderSeq) return;
  app.hydrate(root);
  // keyboard and screen-reader users land on the new screen, not on <body>
  const ae = document.activeElement;
  if (!ae || ae === document.body || ae.closest?.('#nav, #tabbar')) root.focus({ preventScroll: true });
  if (!m.route.name.startsWith('queue')) root.scrollTop = 0;
  window.scrollTo(0, 0);
}

function ctx(params, query) {
  return {
    app, params, query,
    src: app.src, ds: app.ds, tax: app.ds.taxonomy,
    can: app.can, navigate, href, toast: app.toast, hydrate: app.hydrate,
    setTitle: (t) => { $('#page-title').textContent = t; document.title = `${t} · Попутно`; },
  };
}

/* ------------------------------------------------------------------ live changes */

let pendingEvents = [];
const flush = debounce(() => {
  const evs = pendingEvents;
  pendingEvents = [];
  refreshChrome();
  for (const fn of app.listeners) { try { fn(evs); } catch (e) { console.error(e); } }
  try { app.view?.update?.(evs); } catch (e) { console.error(e); }
  if (app.view) app.hydrate($('#view'));
}, 250);

function onSourceEvent(e) {
  pendingEvents.push(e);
  if (e.type === 'critical_alert_raised' && e.source !== 'local.review' && app.route?.route.name !== 'queue') {
    app.toast({ title: `Критично: ${e.text}`, text: `${e.objectId} · ${fmt.time(e.at)}`, tone: 'critical', href: '#/queue', actionLabel: 'В очередь' });
  }
  flush();
}

/** Re-open the dataset after an import / source switch without a reload. */
app.reload = async () => {
  forgetMissingPhotos();
  app.ds = await app.src.load();
  refreshChrome();
  await route();
};

/* ------------------------------------------------------------------ boot */

async function boot() {
  app.theme = store.get('theme', 'dark');
  document.documentElement.dataset.theme = app.theme;
  const root = $('#app');
  mount(root, html`<div class="ux-boot">${loader('Загружаем данные')}</div>`);
  try {
    app.src = await openSource();
    app.ds = app.src.dataset;
  } catch (err) {
    console.error(err);
    mount(root, html`<div class="ux-boot"><div class="pp-empty"><div class="pp-empty__icon pp-corners">${icon('alert')}</div>
      <h2 class="pp-empty__title">Данные не загрузились</h2><p class="pp-empty__text">${err.message}. Проверьте, что сайт открыт через HTTP-сервер из папки design2, а не как файл.</p>
      <div class="pp-empty__actions"><button class="pp-btn pp-btn--primary" onclick="localStorage.removeItem('poputno.source');location.reload()">Открыть датасет</button></div></div></div>`);
    return;
  }
  const qRole = new URLSearchParams(location.search).get('role');
  app.role = PERMS[qRole] ? qRole : store.get('role') || app.ds.user?.role || 'dispatcher';
  if (!PERMS[app.role]) app.role = 'dispatcher';
  document.body.dataset.role = app.role;
  renderShell();
  app.src.subscribe(onSourceEvent);
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', onKey);
  if (new URLSearchParams(location.search).get('live') === '1') setLive(true);
  if (!location.hash || location.hash === '#') navigate(START[app.role], {}, { replace: true });
  else route();
}

boot();

export default app;
export { esc, plural };
