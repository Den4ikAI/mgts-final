/* Попутно · brandbook.js · v1.0 · 26.11.2026
   Механика брендбука: тема, навигация, копирование, живые демо, контраст, токены.
   Цвета организатора ниже записаны как данные для печати (раздел «Референсы»). */
(function () {
  'use strict';
  var root = document.documentElement;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var prefersLight = window.matchMedia('(prefers-color-scheme: light)');
  var cs = function (n, el) { return getComputedStyle(el || root).getPropertyValue(n).trim(); };
  var ms = function (n) { var v = cs(n); return v.indexOf('ms') > -1 ? parseFloat(v) : parseFloat(v) * 1000; };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  /* ------------------------------------------------------------ тост и копирование */
  function toast(title, text) {
    var host = $('#toasts');
    var t = document.createElement('div');
    t.className = 'pp-toast pp-toast--ok';
    t.setAttribute('role', 'status');
    t.innerHTML = '<svg class="pp-toast__icon"><use href="#i-check"/></svg><div><div class="pp-toast__title">' + esc(title) + '</div>' +
      (text ? '<div class="pp-toast__text"><span class="pp-mono">' + esc(text) + '</span></div>' : '') + '</div>';
    host.appendChild(t);
    while (host.children.length > 3) host.removeChild(host.firstChild);
    setTimeout(function () { t.classList.add('is-out'); setTimeout(function () { t.remove(); }, 260); }, 2200);
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
  }
  function copy(text, label) {
    var done = function () { toast(label || 'Скопировано', text.length > 64 ? text.slice(0, 61) + '…' : text); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    else { fallbackCopy(text); done(); }
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-copy]');
    if (el) copy(el.getAttribute('data-copy'), el.getAttribute('data-copy-label'));
  });

  /* ------------------------------------------------------------ тема */
  function themeSetting() { return root.getAttribute('data-theme') || 'system'; }
  function themeEffective() { var t = root.getAttribute('data-theme'); return t || (prefersLight.matches ? 'light' : 'dark'); }
  function markTheme() {
    $$('[data-theme-set]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-set') === themeSetting())); });
  }
  function applyTheme(t) {
    root.classList.add('is-switching');
    if (t === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
    try { localStorage.setItem('pp-theme', t); } catch (e) {}
    markTheme();
    requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.remove('is-switching'); }); });
    onTheme();
  }
  function switchTheme(t, btn, ev) {
    var can = document.startViewTransition && !reduce.matches && ev && ev.detail > 0 && btn;
    if (!can) { applyTheme(t); return; }
    var r = btn.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    var R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    var vt = document.startViewTransition(function () { applyTheme(t); });
    vt.ready.then(function () {
      root.animate({ clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + R + 'px at ' + x + 'px ' + y + 'px)'] },
        { duration: ms('--dur-reveal') || 560, easing: cs('--ease-in-out') || 'ease-in-out', pseudoElement: '::view-transition-new(root)' });
    }).catch(function () {});
  }
  $$('[data-theme-set]').forEach(function (b) {
    b.addEventListener('click', function (e) { switchTheme(b.getAttribute('data-theme-set'), b, e); });
  });
  $$('[data-theme-flip]').forEach(function (b) {
    b.addEventListener('click', function (e) { switchTheme(themeEffective() === 'dark' ? 'light' : 'dark', b, e); });
  });
  markTheme();
  prefersLight.addEventListener('change', function () { onTheme(); });

  /* ------------------------------------------------------------ навигация */
  var links = $$('.nav__link'), ind = $('#nav-ind'), nav = $('#nav');
  var secs = links.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); });
  var active = -1;
  function setActive(i) {
    if (i === active) return; active = i;
    links.forEach(function (a, j) { if (j === i) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    var li = links[i].parentElement;
    ind.style.setProperty('--y', li.offsetTop + 'px');
    var top = li.offsetTop, bottom = top + li.offsetHeight;
    if (nav.scrollHeight > nav.clientHeight) {
      if (top < nav.scrollTop + 40) nav.scrollTop = top - 40;
      else if (bottom > nav.scrollTop + nav.clientHeight - 80) nav.scrollTop = bottom - nav.clientHeight + 80;
    }
  }
  var spyQueued = false, lock = -1, lockT = 0;
  /* Клик по разделу: индикатор сразу встаёт на цель и не бегает по промежуточным разделам во время плавной прокрутки */
  function lockTo(i) {
    lock = i; setActive(i); clearTimeout(lockT);
    lockT = setTimeout(function () { lock = -1; spy(); }, 1600);
  }
  function unlock() { if (lock > -1) { lock = -1; clearTimeout(lockT); } }
  addEventListener('scrollend', function () { if (lock > -1) { clearTimeout(lockT); lockT = setTimeout(function () { lock = -1; spy(); }, 60); } });
  ['wheel', 'touchstart', 'keydown'].forEach(function (ev) { addEventListener(ev, unlock, { passive: true }); });
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a) return;
    var i = secs.indexOf(document.getElementById(a.getAttribute('href').slice(1)));
    if (i > -1) lockTo(i);
  });
  function spy() {
    spyQueued = false;
    if (lock > -1) return;
    var line = (parseFloat(cs('--header-height')) || 56) + 140, idx = 0;
    for (var i = 0; i < secs.length; i++) { if (secs[i] && secs[i].getBoundingClientRect().top <= line) idx = i; }
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) idx = secs.length - 1;
    setActive(idx);
  }
  addEventListener('scroll', function () { if (!spyQueued) { spyQueued = true; requestAnimationFrame(spy); } }, { passive: true });
  addEventListener('resize', function () { active = -1; spy(); });
  spy();

  var menu = $('#menu'), scrim = $('#scrim');
  function drawer(open) {
    document.body.classList.toggle('nav-open', open);
    menu.setAttribute('aria-expanded', String(open));
  }
  menu.addEventListener('click', function () { drawer(!document.body.classList.contains('nav-open')); });
  scrim.addEventListener('click', function () { drawer(false); });
  links.forEach(function (a) { a.addEventListener('click', function () { drawer(false); }); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') drawer(false);
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName)) {
      var q = $('#tok-q'); if (q) { e.preventDefault(); q.focus(); }
    }
  });

  /* ------------------------------------------------------------ сетки-подложки */
  function lines(g, from, to, step, cls, strongEvery, strongCls) {
    var ns = 'http://www.w3.org/2000/svg';
    for (var v = from; v <= to; v += step) {
      ['x', 'y'].forEach(function (axis) {
        var l = document.createElementNS(ns, 'line');
        var strong = strongEvery && (v - from) % strongEvery === 0;
        l.setAttribute('class', strong ? strongCls : cls);
        if (axis === 'x') { l.setAttribute('x1', v); l.setAttribute('x2', v); l.setAttribute('y1', from); l.setAttribute('y2', to); }
        else { l.setAttribute('y1', v); l.setAttribute('y2', v); l.setAttribute('x1', from); l.setAttribute('x2', to); }
        g.appendChild(l);
      });
    }
  }
  var cg = $('#cg-grid'); if (cg) lines(cg, 0, 64, 4, 'cg-grid', 8, 'cg-grid8');
  var ia = $('#ia-grid'); if (ia) lines(ia, 0, 24, 1, 'ia-grid');
  var hg = $('#hero-grid');
  if (hg) {
    var ns = 'http://www.w3.org/2000/svg';
    for (var x = 20; x < 400; x += 20) { var l = document.createElementNS(ns, 'line'); l.setAttribute('x1', x); l.setAttribute('x2', x); l.setAttribute('y1', 0); l.setAttribute('y2', 368); hg.appendChild(l); }
    for (var y = 24; y < 368; y += 20) { var k = document.createElementNS(ns, 'line'); k.setAttribute('y1', y); k.setAttribute('y2', y); k.setAttribute('x1', 0); k.setAttribute('x2', 400); hg.appendChild(k); }
  }

  /* ------------------------------------------------------------ знак: повтор */
  function replayMark(el) {
    if (!el) return;
    el.classList.remove('pp-mark-anim'); void el.getBoundingClientRect(); el.classList.add('pp-mark-anim');
  }
  $$('[data-replay]').forEach(function (b) {
    b.addEventListener('click', function () { replayMark(document.getElementById(b.getAttribute('data-replay'))); });
  });

  /* ------------------------------------------------------------ цвет: разбор и контраст */
  var probe = document.createElement('i'); probe.style.display = 'none'; document.body.appendChild(probe);
  var themeProbe = {};
  ['dark', 'light'].forEach(function (t) {
    var d = document.createElement('div'); d.setAttribute('data-theme', t); d.setAttribute('aria-hidden', 'true');
    d.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden';
    var c = document.createElement('i'); d.appendChild(c); document.body.appendChild(d); themeProbe[t] = c;
  });
  function parseColor(str) {
    var m = (str.match(/[\d.]+/g) || [0, 0, 0]).map(Number);
    if (str.indexOf('color(') === 0) m = m.map(function (v, i) { return i < 3 ? v * 255 : v; });
    return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1];
  }
  function colorIn(theme, token) {
    var el = theme ? themeProbe[theme] : probe;
    el.style.color = ''; el.style.color = 'var(' + token + ')';
    return parseColor(getComputedStyle(el).color);
  }
  function over(f, b) { var a = f[3]; return [f[0] * a + b[0] * (1 - a), f[1] * a + b[1] * (1 - a), f[2] * a + b[2] * (1 - a), 1]; }
  function lum(c) {
    var x = c.slice(0, 3).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * x[0] + 0.7152 * x[1] + 0.0722 * x[2];
  }
  function ratio(a, b) { var l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
  function hexOf(c) { return '#' + c.slice(0, 3).map(function (v) { return Math.round(v).toString(16).padStart(2, '0'); }).join('').toUpperCase(); }
  function hexToRgb(h) { h = h.replace('#', ''); return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }).concat(1); }

  /* палитра */
  var scales = [
    ['navy', 'основа', [50, 100, 200, 300, 400, 500, 600, 700, 800, 850, 900, 925, 950, 1000], 950],
    ['signal', 'бренд-синий', [50, 100, 200, 300, 400, 500, 550, 600, 700, 800, 900, 950], 500],
    ['scan', 'циан, редко', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950], 400],
    ['slate', 'нейтрали', [0, 25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 850, 900, 950], 400],
    ['ok', 'Норма', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950], 500],
    ['suspected', 'Проверить', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950], 500],
    ['defect', 'Дефект', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950], 500],
    ['critical', 'Критично', [50, 100, 200, 300, 400, 500, 550, 600, 700, 800, 900, 950], 500],
    ['unseen', 'Не наблюдается', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900], 400]
  ];
  var ramps = $('#ramps');
  if (ramps) {
    var white = hexToRgb(cs('--p-slate-0')), ink = hexToRgb(cs('--p-navy-950'));
    scales.forEach(function (s) {
      var row = document.createElement('div'); row.className = 'ramp'; row.style.setProperty('--n', s[2].length);
      row.innerHTML = '<div class="ramp__name">' + s[0] + '<span>' + s[1] + '</span></div>';
      s[2].forEach(function (st) {
        var name = '--p-' + s[0] + '-' + st, hex = cs(name).toUpperCase(), rgb = hexToRgb(hex);
        var onW = ratio(white, rgb), onI = ratio(ink, rgb), useWhite = onW >= onI;
        var b = document.createElement('button'); b.type = 'button';
        b.className = 'sw' + (st === s[3] ? ' is-key' : '');
        b.setAttribute('data-copy', 'var(' + name + ')'); b.setAttribute('aria-label', name + ' ' + hex + ', скопировать');
        b.title = name + ' · ' + hex;
        b.style.background = 'var(' + name + ')';
        b.style.color = useWhite ? 'var(--p-slate-0)' : 'var(--p-navy-950)';
        b.innerHTML = '<span class="sw__aa">Aa<small>' + (useWhite ? onW : onI).toFixed(1) + '</small></span><span>' + st + '<br><span class="hex">' + hex.replace('#', '') + '</span></span>';
        row.appendChild(b);
      });
      ramps.appendChild(row);
    });
  }

  /* смысловые токены: [токен, вид, подложка или текст, назначение]
     вид: s поверхность · t текст на подложке (4.5) · p пара заливка+текст (4.5) · f графика к фону (3) · n без проверки */
  var SEM = [
    ['Поверхности'],
    ['--surface-base', 's', '', 'Фон страницы'],
    ['--surface-raised', 's', '', 'Карточка, панель'],
    ['--surface-sunken', 's', '', 'Подложка демо, поле ввода'],
    ['--surface-overlay', 's', '', 'Меню, тост, диалог'],
    ['--surface-selected', 's', '', 'Выбранная строка и карточка'],
    ['--surface-inverse', 'p', '--text-inverse', 'Подсказка'],
    ['Текст'],
    ['--text-primary', 't', '--surface-raised', 'Основной текст'],
    ['--text-secondary', 't', '--surface-raised', 'Описание, значения в таблице'],
    ['--text-muted', 't', '--surface-raised', 'Мета, подписи, время'],
    ['--text-accent', 't', '--surface-raised', 'Акцентный текст, номер раздела'],
    ['--text-link', 't', '--surface-raised', 'Ссылка'],
    ['--text-disabled', 'n', '', 'Неактивное: смысл не несёт'],
    ['Действия и фокус'],
    ['--action-primary', 'p', '--text-on-accent', 'Основная кнопка'],
    ['--action-danger', 'p', '--text-on-accent', 'Опасное действие'],
    ['--accent', 'f', '--surface-base', 'Акцентная графика'],
    ['--focus-ring', 'f', '--surface-base', 'Кольцо фокуса'],
    ['--route-line', 'f', '--surface-base', 'Линия маршрута'],
    ['--scan', 'f', '--surface-base', '«Модель видит»'],
    ['Статусы объекта'],
    ['--status-ok-fg', 't', '--status-ok-bg', 'Пилюля «Норма»'],
    ['--status-suspected-fg', 't', '--status-suspected-bg', 'Пилюля «Проверить»'],
    ['--status-defect-fg', 't', '--status-defect-bg', 'Пилюля «Дефект»'],
    ['--status-critical-fg', 't', '--status-critical-bg', 'Пилюля «Критично»'],
    ['--status-not-observed-fg', 't', '--status-not-observed-bg', 'Пилюля «Не наблюдается»'],
    ['--status-critical-solid', 'p', '--status-on-solid', 'Метка на карте, одинакова в темах'],
    ['Детекция и происхождение'],
    ['--detect-tag-bg', 'p', '--detect-tag-fg', 'Бирка находки на кадре'],
    ['--prov-model-fg', 't', '--prov-model-bg', '«Найдено моделью»'],
    ['--prov-human-fg', 't', '--prov-human-bg', '«Подтверждено человеком»'],
    ['Графики'],
    ['--chart-accent', 'f', '--surface-raised', 'Один акцент на графике'],
    ['--chart-series', 'n', '', 'Остальные ряды, значения подписаны'],
    ['Карта'],
    ['--map-land', 's', '', 'Подложка карты'],
    ['--map-block', 's', '', 'Кварталы'],
    ['--map-label', 't', '--map-land', 'Подписи улиц, с ореолом --map-label-halo'],
    ['--map-water', 's', '', 'Вода'],
    ['--map-pin-ring', 'n', '', 'Кольцо метки, цвет подложки'],
    ['--map-pin-ring-suspected', 'n', '', 'Кольцо жёлтой метки: на светлой подложке тёмное'],
    ['--map-coverage', 'n', '', 'Покрытие проездами']
  ];
  function evalRow(row, theme) {
    var tok = row[0], kind = row[1], other = row[2];
    var base = colorIn(theme, '--surface-base'), raised = colorIn(theme, '--surface-raised');
    var c = colorIn(theme, tok), res = { hex: hexOf(c) + (c[3] < 1 ? ' · ' + Math.round(c[3] * 100) + '%' : ''), r: null, min: 0 };
    if (kind === 't') {
      var bg = over(colorIn(theme, other), other === '--surface-raised' ? base : raised);
      res.r = ratio(over(c, bg), bg); res.min = 4.5; res.chipBg = other; res.chipFg = tok;
    } else if (kind === 'p') {
      var bgp = over(c, base), fg = over(colorIn(theme, other), bgp);
      res.r = ratio(fg, bgp); res.min = 4.5; res.chipBg = tok; res.chipFg = other;
    } else if (kind === 'f') {
      var b2 = over(colorIn(theme, other), base);
      res.r = ratio(over(c, b2), b2); res.min = 3; res.chipBg = tok;
    } else res.chipBg = tok;
    return res;
  }
  function crBadge(r, min) {
    if (r == null) return '';
    var ok = r >= min;
    return '<span class="cr ' + (ok ? 'cr--ok' : 'cr--bad') + '" title="порог ' + min + '"><svg class="pp-icon"><use href="#i-' + (ok ? 'check' : 'alert') + '"/></svg>' + r.toFixed(1) + '</span>';
  }
  function semCell(theme, res) {
    var chip = '<span class="sem-chip" style="background:var(' + res.chipBg + ')' + (res.chipFg ? ';color:var(' + res.chipFg + ')">Аа' : '">') + '</span>';
    return '<td><div class="theme-col sem-cell" data-theme="' + theme + '" style="background:var(--surface-raised)">' + chip +
      '<span class="sem-hex">' + res.hex + '</span>' + crBadge(res.r, res.min) + '</div></td>';
  }
  function renderSem() {
    var tb = $('#sem-table tbody'); if (!tb) return;
    var html = '';
    SEM.forEach(function (row) {
      if (row.length === 1) { html += '<tr class="grp"><td colspan="4">' + row[0] + '</td></tr>'; return; }
      html += '<tr><td><button class="copy tok" style="color:var(--text-primary)" type="button" data-copy="var(' + row[0] + ')">' + row[0] + '</button>' +
        (row[2] && row[1] !== 'f' ? '<div class="tok" style="margin-top:2px">на ' + row[2] + '</div>' : '') + '</td>' +
        semCell('dark', evalRow(row, 'dark')) + semCell('light', evalRow(row, 'light')) + '<td>' + row[3] + '</td></tr>';
    });
    tb.innerHTML = html;
  }
  renderSem();

  /* переключатели «без цвета» */
  $$('[data-nocolor]').forEach(function (b) {
    b.addEventListener('click', function () {
      var on = b.getAttribute('data-nocolor') === 'on';
      b.getAttribute('data-target').split(' ').forEach(function (id) { var t = document.getElementById(id); if (t) t.classList.toggle('nocolor', on); });
      $$('[data-target="' + b.getAttribute('data-target') + '"]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    });
  });

  /* ------------------------------------------------------------ отступы, длительности */
  var SP = [['0-5', 2, 'зазор в сегментах'], ['1', 4, 'иконка и текст в пилюле'], ['2', 8, 'кнопки в группе'], ['3', 12, 'элементы карточки'],
    ['4', 16, 'поля формы, сетка карточек'], ['5', 20, 'внутри карточки'], ['6', 24, 'поля страницы'], ['8', 32, 'поля на широком экране'],
    ['10', 40, 'между демо'], ['12', 48, 'между группами'], ['16', 64, 'между блоками раздела'], ['20', 80, 'между разделами'], ['24', 96, 'низ страницы']];
  var spEl = $('#spaces');
  if (spEl) spEl.innerHTML = SP.map(function (s) {
    return '<div class="space-row"><button class="copy tok" type="button" data-copy="var(--space-' + s[0] + ')">--space-' + s[0] + '</button><span class="tok">' + s[1] +
      '</span><span style="display:flex;align-items:center;gap:var(--space-3);min-width:0"><span class="bar" style="width:var(--space-' + s[0] + ');flex:none"></span><span class="use">' + s[2] + '</span></span></div>';
  }).join('');

  var DUR = [['--dur-instant', 'отклик на наведение'], ['--dur-release', 'отпускание'], ['--dur-press', 'нажатие'], ['--dur-fast', 'цвет, hover'],
    ['--dur-base', 'подсказка, смена содержимого'], ['--dur-panel', 'панель, тост'], ['--dur-slow', 'рамка детекции, прогресс'],
    ['--dur-reveal', 'смена темы'], ['--dur-grow', 'рамка детекции вырастает'], ['--dur-mark', 'знак целиком'], ['--dur-draw', 'прорисовка маршрута'], ['--dur-pulse', 'пульс «Критично»'], ['--dur-shimmer', 'мерцание скелетона']];
  function renderDur() {
    var el = $('#durs'); if (!el) return;
    el.innerHTML = DUR.map(function (d) {
      var v = ms(d[0]);
      return '<div class="dur-row"><button class="copy tok" type="button" data-copy="var(' + d[0] + ')">' + d[0] + '</button><span class="tok">' + Math.round(v) + ' мс</span><span><i class="bar" style="display:block;width:' + Math.max(0.6, v / 16) + '%"></i></span><span class="use">' + d[1] + '</span></div>';
    }).join('');
  }
  renderDur();

  /* ------------------------------------------------------------ иконки */
  var ICON_GROUPS = [
    ['Статусы объекта', function (n) { return n.indexOf('status-') === 0; }],
    ['Объекты и дефекты', function (n) { return ['cabinet', 'board', 'corrosion', 'dent', 'mount'].indexOf(n) > -1; }],
    ['Поле и съёмка', function (n) { return ['camera', 'car', 'route', 'map-pin', 'frame', 'layers'].indexOf(n) > -1; }],
    ['В запасе: колодцы и опоры', function (n) { return ['manhole', 'pole'].indexOf(n) > -1; }],
    ['Люди', function (n) { return n.indexOf('user') === 0; }],
    ['Интерфейс', function () { return true; }]
  ];
  var ig = $('#icon-groups');
  if (ig) {
    var names = $$('symbol[id^="i-"]').map(function (s) { return s.id.slice(2); }), used = {};
    ig.innerHTML = ICON_GROUPS.map(function (g) {
      var list = names.filter(function (n) { if (used[n] || !g[1](n)) return false; used[n] = 1; return true; });
      return '<div class="icon-group"><h4>' + g[0] + ' · ' + list.length + '</h4><div class="icons">' + list.map(function (n) {
        return '<button type="button" class="icon-cell' + (n.indexOf('status-') === 0 ? ' st-' + n.slice(7) : '') + '" data-copy="icons.svg#i-' + n + '" aria-label="Скопировать иконку ' + n + '"><svg class="pp-icon pp-icon--lg"><use href="#i-' + n + '"/></svg><span>' + n + '</span></button>';
      }).join('') + '</div></div>';
    }).join('');
  }

  /* ------------------------------------------------------------ кривые */
  function sizeCurves() { $$('.curve').forEach(function (c) { var t = $('.curve__track', c); c.style.setProperty('--tw', t.getBoundingClientRect().width + 'px'); }); }
  sizeCurves(); addEventListener('resize', sizeCurves);
  $$('.curve').forEach(function (c) { c.addEventListener('click', function () { c.classList.toggle('is-run'); }); });

  /* ------------------------------------------------------------ каталог движений */
  function restart(el) { el.classList.remove('is-play'); void el.offsetWidth; el.classList.add('is-play'); }
  var timers = new WeakMap();
  function later(card, fn, t) { var a = timers.get(card) || []; a.push(setTimeout(fn, t)); timers.set(card, a); }
  function clear(card) { (timers.get(card) || []).forEach(clearTimeout); timers.set(card, []); }
  var PLAY = {
    mark: function (c) { replayMark($('[data-mc-mark]', c)); },
    scan: function (c) { c.classList.remove('is-done'); restart(c); later(c, function () { c.classList.add('is-done'); }, ms('--dur-draw') + ms('--dur-grow') + 200); },
    status: function (c) {
      var pills = $$('.m-status__pill > *', c), meta = $('[data-status-meta]', c);
      var steps = [[0, 'Модель · 26.11 10:42'], [1, 'Диспетчер подтвердил · 10:44'], [2, 'Наряд закрыт · 27.11 14:05']];
      steps.forEach(function (s, i) {
        later(c, function () { pills.forEach(function (p, j) { p.classList.toggle('is-on', j === s[0]); }); meta.textContent = s[1]; }, i * 1100);
      });
    },
    queue: function (c) { restart(c); },
    route: function (c) { restart(c); },
    skel: function (c) { c.classList.remove('is-done'); later(c, function () { c.classList.add('is-done'); }, 1200); },
    toast: function (c) {
      var st = $('[data-toast-stage]', c); st.innerHTML = '';
      var t = document.createElement('div'); t.className = 'pp-toast'; t.style.width = '88%';
      t.innerHTML = '<svg class="pp-toast__icon"><use href="#i-check"/></svg><div><div class="pp-toast__title">Наряд создан</div><div class="pp-toast__text"><span class="pp-mono">ТКШ-38060694</span> · бригада 3</div></div><span></span>';
      st.appendChild(t);
      later(c, function () { t.style.transitionDuration = cs('--dur-panel-exit'); t.style.opacity = '0'; t.style.transform = 'translateY(8px)'; }, 2600);
    }
  };
  function playCard(card) { var k = card.getAttribute('data-mc'); if (!PLAY[k]) return; clear(card); card._last = Date.now(); PLAY[k](card); }
  $$('.mc').forEach(function (card) {
    var b = $('[data-mc-replay]', card); if (b) b.addEventListener('click', function () { playCard(card); });
  });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting && (!en.target._last || Date.now() - en.target._last > 6000)) playCard(en.target); });
    }, { threshold: 0.55 });
    $$('.mc').forEach(function (c) { io.observe(c); });
  } else $$('.mc').forEach(playCard);
  var rt = $('#reduce-toggle');
  if (rt) rt.addEventListener('click', function () {
    var on = rt.getAttribute('aria-pressed') !== 'true';
    rt.setAttribute('aria-pressed', String(on)); $('#mcat').classList.toggle('reduce-sim', on);
    $$('.mc').forEach(playCard);
  });

  /* ------------------------------------------------------------ матрица кнопок */
  var variants = [['Основная', 'primary', 'Создать наряд'], ['Вторичная', 'secondary', 'Открыть объект'], ['Тихая', 'ghost', 'Пропустить'], ['Опасная', 'danger', 'Удалить находку']];
  var tb = $('#btn-matrix');
  if (tb) variants.forEach(function (v) {
    var cls = 'pp-btn pp-btn--sm pp-btn--' + v[1], tr = document.createElement('tr');
    tr.innerHTML = '<td>' + v[0] + '<span class="tok">--' + v[1] + '</span></td>' +
      '<td><button type="button" class="' + cls + '">' + v[2] + '</button></td>' +
      '<td><button type="button" class="' + cls + '" style="background:var(--btn-bg-hover)' + (v[1] === 'ghost' ? ';color:var(--text-primary)' : '') + '">' + v[2] + '</button></td>' +
      '<td><button type="button" class="' + cls + '" style="background:var(--btn-bg-press);transform:scale(var(--press-scale))">' + v[2] + '</button></td>' +
      '<td><button type="button" class="' + cls + '" style="outline:var(--focus-ring-width) solid var(--focus-ring);outline-offset:var(--focus-ring-offset)">' + v[2] + '</button></td>' +
      '<td><button type="button" class="' + cls + '" aria-busy="true"><span>' + v[2] + '</span></button></td>' +
      '<td><button type="button" class="' + cls + '" disabled>' + v[2] + '</button></td>';
    tb.appendChild(tr);
  });

  /* ------------------------------------------------------------ графики */
  var NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs, text) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; }
  function barPath(x, y, w, h, r) { r = Math.min(r, w, h / 2); return 'M' + x + ' ' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + r) + 'V' + (y + h - r) + 'Q' + (x + w) + ' ' + (y + h) + ' ' + (x + w - r) + ' ' + (y + h) + 'H' + x + 'Z'; }
  function hbars(svg, data, opt) {
    if (!svg) return;
    var W = opt.w, x0 = opt.x0, x1 = W - 40, max = opt.max, rh = opt.rh, bh = opt.bh, top = opt.top || 6;
    var sx = function (v) { return x0 + (x1 - x0) * v / max; };
    opt.ticks.forEach(function (t) {
      svg.appendChild(svgEl('line', { class: 'grid-l', x1: sx(t), x2: sx(t), y1: top - 4, y2: top + data.length * rh }));
      svg.appendChild(svgEl('text', { class: 'lbl-m', x: sx(t), y: top + data.length * rh + 14, 'text-anchor': 'middle' }, t));
    });
    data.forEach(function (d, i) {
      var y = top + i * rh + (rh - bh) / 2, acc = d[2];
      svg.appendChild(svgEl('text', { class: acc ? 'cat-acc' : 'cat', x: x0 - 10, y: y + bh / 2 + 4.5, 'text-anchor': 'end' }, d[0]));
      var p = svgEl('path', { class: acc ? 'bar-a' : 'bar-g', d: barPath(x0, y, sx(d[1]) - x0, bh, 4), 'data-tip': d[0] + ': ' + d[1] + (opt.unit || '') });
      svg.appendChild(p);
      svg.appendChild(svgEl('text', { class: acc ? 'val-acc' : 'val', x: sx(d[1]) + 6, y: y + bh / 2 + 4 }, d[1]));
    });
    svg.appendChild(svgEl('line', { class: 'axis-l', x1: x0, x2: x0, y1: top - 4, y2: top + data.length * rh }));
  }
  hbars($('#chart-bars'), [['Повреждение ЛКП', 20, 1], ['Механическое повреждение', 17], ['Нарушение крепления', 4]],
    { w: 460, x0: 186, max: 22, rh: 48, bh: 22, ticks: [0, 5, 10, 15, 20], unit: ' фото' });
  hbars($('#chart-reasons'), [['Соседний шкаф', 14, 1], ['Блик', 9], ['Грязь', 6], ['Плохой кадр', 5], ['Не дефект', 3]],
    { w: 360, x0: 96, max: 16, rh: 24, bh: 14, ticks: [0, 5, 10, 15], unit: ' отклонений' });

  /* матрица ошибок */
  var CM_L = ['Норма', 'ЛКП', 'МП', 'Крепление'];
  var CM = [[.95, .05, 0, 0], [0, 1, 0, 0], [.12, 0, .82, .06], [.25, 0, 0, .75]];  /* прогон dss-final2, доли строки */
  var cm = $('#cm');
  if (cm) {
    var h = '<span></span>' + CM_L.map(function (l) { return '<span class="cm__h">' + l + '</span>'; }).join('');
    CM.forEach(function (r, i) {
      h += '<span class="cm__r">' + CM_L[i] + '</span>' + r.map(function (v, j) {
        return '<span class="cm__c' + (v > 0.5 ? ' hi' : '') + (i === j ? ' diag' : '') + '" style="--v:' + v + '" data-tip="' + CM_L[i] + ' → ' + CM_L[j] + ': ' + v.toFixed(2) + '">' + v.toFixed(2) + '</span>';
      }).join('');
    });
    cm.innerHTML = h;
  }

  /* статусы: сегментированная полоса */
  var ST = [['ok', 'Норма', 312, 'pin-ok'], ['suspected', 'Проверить', 24, 'pin-suspected'], ['defect', 'Дефект', 11, 'pin-defect'], ['critical', 'Критично', 3, 'pin-critical'], ['not-observed', 'Не наблюдается', 47, 'pin-unseen']];
  var sb = $('#stack-bar'), sl = $('#stack-legend');
  if (sb) {
    sb.innerHTML = ST.map(function (s) {
      var bg = s[0] === 'not-observed' ? 'repeating-linear-gradient(135deg, var(--status-not-observed-solid) 0 3px, transparent 3px 7px)' : 'var(--status-' + s[0] + '-solid)';
      return '<i style="flex:' + Math.max(s[2], 6) + ';background:' + bg + '" data-tip="' + s[1] + ': ' + s[2] + '"></i>';
    }).join('');
    sl.innerHTML = ST.map(function (s) { return '<span><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><use href="#' + s[3] + '"/></svg>' + s[1] + ' <b>' + s[2] + '</b></span>'; }).join('');
  }

  /* покрытие по неделям */
  var ln = $('#chart-line');
  if (ln) {
    var W = [['н41', 38], ['н42', 44], ['н43', 47], ['н44', 52], ['н45', 55], ['н46', 61], ['н47', 65], ['н48', 71]];
    var X0 = 44, X1 = 430, Y0 = 158, Y1 = 14, sx2 = function (i) { return X0 + (X1 - X0) * i / (W.length - 1); }, sy = function (v) { return Y0 - (Y0 - Y1) * v / 100; };
    [0, 25, 50, 75, 100].forEach(function (t) {
      ln.appendChild(svgEl('line', { class: 'grid-l', x1: X0, x2: X1, y1: sy(t), y2: sy(t) }));
      ln.appendChild(svgEl('text', { class: 'lbl-m', x: X0 - 8, y: sy(t) + 4, 'text-anchor': 'end' }, t + (t === 100 ? ' %' : '')));
    });
    ln.appendChild(svgEl('line', { class: 'axis-l', x1: X0, x2: X1, y1: Y0, y2: Y0 }));
    ln.appendChild(svgEl('path', { class: 'line-a', d: W.map(function (w, i) { return (i ? 'L' : 'M') + sx2(i) + ' ' + sy(w[1]); }).join('') }));
    W.forEach(function (w, i) {
      ln.appendChild(svgEl('text', { class: 'lbl-m', x: sx2(i), y: Y0 + 18, 'text-anchor': 'middle' }, w[0]));
      ln.appendChild(svgEl('rect', { x: sx2(i) - 22, y: Y1, width: 44, height: Y0 - Y1, fill: 'transparent', 'data-tip': 'Неделя ' + w[0].slice(1) + ': ' + w[1] + ' %' }));
    });
    var last = W[W.length - 1];
    ln.appendChild(svgEl('circle', { class: 'dot-a', cx: sx2(W.length - 1), cy: sy(last[1]), r: 5 }));
    ln.appendChild(svgEl('text', { class: 'val-acc', x: sx2(W.length - 1) - 8, y: sy(last[1]) - 12, 'text-anchor': 'end' }, last[1] + ' %'));
    ln.appendChild(svgEl('text', { class: 'val', x: sx2(0), y: sy(W[0][1]) - 12, 'text-anchor': 'start' }, W[0][1] + ' %'));
  }

  /* подсказка на графиках */
  var tip = $('#chart-tip');
  document.addEventListener('mousemove', function (e) {
    var t = e.target.closest && e.target.closest('[data-tip]');
    if (!t || !tip) { if (tip) tip.classList.remove('is-on'); return; }
    tip.textContent = t.getAttribute('data-tip');
    tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + 'px';
    tip.style.top = (e.clientY - 36) + 'px';
    tip.classList.add('is-on');
  });

  /* ------------------------------------------------------------ карта */
  var mapSvg = $('#map-svg');
  if (mapSvg) {
    var seed = 7; var rnd = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    var XS = [0, 140, 300, 460, 630, 800, 920, 1000], YS = [0, 130, 300, 560];
    var blocks = $('#map-blocks');
    for (var i = 0; i < XS.length - 1; i++) for (var j = 0; j < YS.length - 1; j++) {
      var bx = XS[i] + 10, by = YS[j] + 10, bw = XS[i + 1] - XS[i] - 20, bh = YS[j + 1] - YS[j] - 20;
      var cols = bw > 140 ? 2 : 1, rows = bh > 150 ? 3 : 2, gw = (bw - (cols - 1) * 8) / cols, gh = (bh - (rows - 1) * 8) / rows;
      for (var c = 0; c < cols; c++) for (var r = 0; r < rows; r++) {
        var rx = bx + c * (gw + 8), ry = by + r * (gh + 8);
        if (rx > 620 && rx < 800 && ry > 380) continue;
        if (rnd() < 0.12) continue;
        var shrink = rnd() * 10;
        blocks.appendChild(svgEl('rect', { class: 'm-block', x: rx, y: ry, width: Math.max(10, gw - shrink), height: Math.max(10, gh - shrink * 0.6), rx: 3 }));
      }
    }
    var roads = $('#map-roads');
    [[140, 9], [300, 9], [630, 9], [800, 9], [920, 7]].forEach(function (v) { roads.appendChild(svgEl('path', { class: 'm-road', d: 'M' + v[0] + ' 0V560', 'stroke-width': v[1] })); });
    roads.appendChild(svgEl('path', { class: 'm-road', d: 'M0 130H1000', 'stroke-width': 9 }));
    roads.appendChild(svgEl('path', { class: 'm-road-major', d: 'M460 0V560', 'stroke-width': 15 }));
    roads.appendChild(svgEl('path', { class: 'm-road-major', d: 'M0 300H1000', 'stroke-width': 17 }));
    var PINS = [[100, 286, 'ok'], [200, 314, 'ok'], [262, 286, 'unseen'], [344, 314, 'ok'], [420, 286, 'suspected'], [476, 236, 'ok'], [444, 176, 'ok'],
      [600, 144, 'ok'], [646, 206, 'defect'], [614, 256, 'ok'], [700, 314, 'ok'], [802, 286, 'suspected'], [836, 314, 'unseen'],
      [154, 196, 'ok'], [286, 94, 'ok'], [314, 214, 'unseen'], [126, 360, 'defect'], [816, 230, 'ok'], [700, 116, 'suspected'], [956, 210, 'ok']];
    var pins = $('#map-pins');
    PINS.forEach(function (p) { pins.appendChild(svgEl('use', { href: '#pin-' + p[2], x: p[0] - 11, y: p[1] - 11, width: 22, height: 22 })); });
    pins.appendChild(svgEl('circle', { class: 'pin-cluster', cx: 880, cy: 160, r: 15 }));
    pins.appendChild(svgEl('text', { class: 'pin-cluster-t', x: 880, y: 164 }, '12'));
    pins.appendChild(svgEl('use', { href: '#pin-critical', x: 528, y: 104, width: 24, height: 24 }));
    pins.appendChild(svgEl('path', { class: 'pin-sel', d: 'M522 105V98H529M547 98H554V105M554 123V130H547M529 130H522V123' }));
    var mr = $('#map-replay'), mf = $('#map-frame');
    var playMap = function () { mf.classList.remove('map-play'); void mf.offsetWidth; mf.classList.add('map-play'); };
    mr.addEventListener('click', playMap);
    if ('IntersectionObserver' in window) {
      var mio = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { playMap(); mio.disconnect(); } }, { threshold: 0.4 });
      mio.observe(mf);
    }
  }

  /* ------------------------------------------------------------ референсы */
  var ORG = [
    ['Фон «Кода города»', '#051B29'], ['Navy памятки', '#030E24'], ['Фон, середина', '#04223C'], ['Карточка, верх', '#013578'],
    ['Карточка, низ', '#00A2E4'], ['Синий МГТС', '#008AE0'], ['Ярлык капсом', '#009BFE'], ['Циан памятки', '#28D8ED'],
    ['Грань куба-логотипа', '#00C5F7'], ['Оранжевый куб', '#EC7A1C'], ['Градиент заголовка', '#5B9BD5'], ['Конец градиента', '#8BE1ED'],
    ['Светлый фон', '#F6F8FB'], ['Заголовок, светлый', '#0B1F33'], ['Приглушённый текст', '#61748A']
  ];
  var op = $('#org-pal');
  if (op) op.innerHTML = ORG.map(function (o) {
    return '<button type="button" class="org-sw copy" style="margin:0;padding:0;border-radius:0" data-copy="' + o[1] + '"><i style="display:block;background:' + o[1] + ';height:64px"></i><div><b>' + o[0] + '</b><span>' + o[1] + '</span></div></button>';
  }).join('');
  var TF = [
    ['Ночной navy', '#051B29', '--p-navy-950', 'navy-950', 'Та же ночь, свой оттенок, без голубой вспышки снизу. Основа тёмной темы и деки.'],
    ['Синий МГТС', '#008AE0', '--p-signal-500', 'signal-500', 'Рядом, но не он: на обложке с логотипом МГТС не спорят два одинаковых синих. Для текста на светлом signal-600, 5.6 : 1.'],
    ['Циан памятки', '#28D8ED', '--p-scan-400', 'scan-400', 'Их тонкая линия-разделитель стала нашим «камера заметила»: точка знака, рамка детекции, фокус.'],
    ['Оранжевый куб', '#EC7A1C', '--p-defect-500', 'defect-500', 'Тот же оранжевый, но со смыслом: у нас он значит только «дефект, нужен ремонт».'],
    ['MTS Wide', 'font', '', 'Unbounded', 'Широкий гротеск со свободной лицензией и полной кириллицей. Фирменные шрифты МТС не берём.'],
    ['Стеклянные кубы', 'icon:layers', '', 'Уголки рамки', 'Куб, «кирпичик города», стал рамкой детекции: тот же квадрат, но про компьютерное зрение.'],
    ['Плашка-вывод внизу', 'icon:list', '', 'Вывод в заголовке', 'Вывод читается первым: он стоит в заголовке слайда и выделен цветом signal, отдельная плашка не нужна.'],
    ['Градиентный заголовок', 'grad', '', 'Сплошной цвет', 'Не берём: сплошной цвет читается с проектора и не копирует шаблон.']
  ];
  var tfEl = $('#transform');
  function swatch(kind, v) {
    if (kind === 'font') return '<i style="display:grid;place-items:center;font-family:var(--font-display);font-weight:700;font-size:15px;color:var(--text-primary);background:var(--surface-sunken)">Аа</i>';
    if (kind.indexOf('icon:') === 0) return '<i style="display:grid;place-items:center;color:var(--text-secondary);background:var(--surface-sunken)"><svg class="pp-icon"><use href="#i-' + kind.slice(5) + '"/></svg></i>';
    if (kind === 'grad') return '<i style="background:linear-gradient(90deg,#5B9BD5,#75C0E1,#8BE1ED)"></i>';
    return '<i style="background:' + (v ? 'var(' + v + ')' : kind) + '"></i>';
  }
  if (tfEl) tfEl.insertAdjacentHTML('beforeend', TF.map(function (t) {
    var theirs = '<div class="tf-side">' + swatch(t[1]) + '<span><b>' + t[0] + '</b><span>' + (t[1].charAt(0) === '#' ? t[1] : t[1] === 'grad' ? '#5B9BD5 → #8BE1ED' : 'организатор') + '</span></span></div>';
    var oursKind = t[2] ? t[1] : (t[1] === 'font' ? 'font' : t[1] === 'grad' ? 'icon:close' : t[1] === 'icon:layers' ? 'icon:frame' : 'icon:list');
    var ours = '<div class="tf-side">' + (t[2] ? swatch('', t[2]) : swatch(oursKind)) + '<span><b>' + t[3] + '</b><span>' + (t[2] ? cs(t[2]).toUpperCase() + ' · ' + t[2] : t[3] === 'Unbounded' ? '--font-display' : t[3] === 'Уголки рамки' ? '.pp-corners' : t[3] === 'Сплошной цвет' ? 'не используем' : '.slide__sum') + '</span></span></div>';
    return '<div class="tf-row">' + theirs + '<svg class="pp-icon"><use href="#i-arrow-right"/></svg>' + ours + '<p>' + t[4] + '</p></div>';
  }).join(''));

  /* ------------------------------------------------------------ токены */
  var SRC = ($('#tokens-src') || {}).textContent || '';
  SRC = SRC.replace(/^\s*<!--TOKENS-->/, '').replace(/<!--\/TOKENS-->\s*$/, '');
  function parseTokens(text) {
    var clean = text.replace(/\/\*[\s\S]*?\*\//g, ''), out = { primitives: {}, global: {}, dark: {}, light: {}, reduced: {} }, seenRoot = false;
    var re = /([^{}]+)\{([^{}]*)\}/g, m;
    while ((m = re.exec(clean))) {
      var sel = m[1].trim(), body = m[2], target = null;
      if (/^:root,\s*\[data-theme="dark"\]$/.test(sel)) target = 'dark';
      else if (sel === '[data-theme="light"]') target = 'light';
      else if (sel === ':root' && !seenRoot) { target = 'global'; seenRoot = true; }
      else if (sel === ':root') target = 'reduced';
      if (!target) continue;
      body.replace(/(--[\w-]+)\s*:\s*([^;]+);/g, function (_, k, v) {
        v = v.replace(/\s+/g, ' ').trim();
        if (target === 'global' && k.indexOf('--p-') === 0) out.primitives[k] = v; else out[target][k] = v;
      });
    }
    return out;
  }
  var TOK = parseTokens(SRC);
  var TG = [
    ['Палитра · navy', /^--p-navy/], ['Палитра · signal', /^--p-signal/], ['Палитра · scan', /^--p-scan/], ['Палитра · slate', /^--p-slate/],
    ['Палитра · статусы', /^--p-(ok|suspected|defect|critical|unseen)/], ['Поверхности', /^--surface/],
    ['Текст', /^--text-(primary|secondary|muted|disabled|inverse|accent|link|on|danger)/], ['Линии', /^--border/],
    ['Акцент и действия', /^--(accent|scan|action)/], ['Фокус', /^--focus/], ['Статусы объекта', /^--status/], ['Опасность', /^--sev/],
    ['Детекция и происхождение', /^--(detect|prov|stroke-detect)/], ['Маршрут и графики', /^--(route|chart|stroke-route)/],
    ['Логотип и поверх фото', /^--(logo|on-media)/], ['Тени и выделение', /^--(shadow|selection|scrollbar)/],
    ['Шрифты и шкала', /^--(font|weight|text-|tracking|numeric)/], ['Отступы', /^--space/], ['Радиусы и линии', /^--(radius|hairline|stroke-icon)/],
    ['Размеры', /^--(control|target|icon|header|sidebar|prose|content)/], ['Слои и брейкпоинты', /^--(z-|bp-)/],
    ['Движение', /^--(ease|dur|stagger|press|enter|snap|shift|delay|toast|transition)/], ['Прочее', /./]
  ];
  function renderTokens() {
    var host = $('#tok-groups'); if (!host) return;
    var q = (($('#tok-q') || {}).value || '').trim().toLowerCase();
    var names = Object.keys(TOK.primitives).concat(Object.keys(TOK.global), Object.keys(TOK.dark));
    var uniq = names.filter(function (n, i) { return names.indexOf(n) === i; });
    var groups = TG.map(function (g) { return [g[0], []]; }), total = 0;
    uniq.forEach(function (n) {
      if (q && n.toLowerCase().indexOf(q) < 0) return;
      for (var i = 0; i < TG.length; i++) if (TG[i][1].test(n)) { groups[i][1].push(n); break; }
      total++;
    });
    host.innerHTML = groups.filter(function (g) { return g[1].length; }).map(function (g) {
      return '<div class="tok-group"><h4>' + g[0] + '<span>' + g[1].length + '</span></h4><div class="tok-list">' + g[1].map(function (n) {
        var v = cs(n), isColor = v && !/^[\d.]+(px|ms|rem|em)?$/.test(v) && CSS.supports('color', v);
        return '<button type="button" class="tok-item" data-copy="var(' + n + ')" title="' + esc(n + ': ' + v) + '"><i class="' + (isColor ? '' : 'nc') + '"' + (isColor ? ' style="background:var(' + n + ')"' : '') + '></i><span class="n">' + n + '</span><span class="v">' + esc(v) + '</span></button>';
      }).join('') + '</div></div>';
    }).join('');
    var c = $('#tok-count'); if (c) c.textContent = total + ' из ' + uniq.length + ' токенов';
  }
  renderTokens();
  var tq = $('#tok-q'); if (tq) tq.addEventListener('input', renderTokens);
  var tcc = $('#tok-copy-css'); if (tcc) tcc.addEventListener('click', function () { copy(SRC, 'tokens.css скопирован'); });
  var tj = $('#tok-json');
  if (tj) tj.addEventListener('click', function () {
    var data = { name: 'poputno-tokens', version: '1.0', date: '2026-11-26', source: 'brand/tokens.css',
      primitives: TOK.primitives, global: TOK.global, themes: { dark: TOK.dark, light: TOK.light }, reducedMotion: TOK.reduced };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'poputno-tokens.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('JSON собран', 'poputno-tokens.json · ' + (Object.keys(TOK.primitives).length + Object.keys(TOK.global).length + Object.keys(TOK.dark).length) + ' токенов');
  });

  /* ------------------------------------------------------------ доступность */
  var crun = $('#contrast-run');
  if (crun) crun.addEventListener('click', function () {
    var n = 0, fails = [], worst = { r: 99 };
    ['dark', 'light'].forEach(function (t) {
      SEM.forEach(function (row) {
        if (row.length === 1 || row[1] === 'n' || row[1] === 's') return;
        var res = evalRow(row, t); n++;
        if (res.r < res.min) fails.push(row[0] + ' (' + t + ')');
        if (res.min === 4.5 && res.r < worst.r) worst = { r: res.r, tok: row[0], t: t };
      });
    });
    $('#contrast-out').innerHTML = 'Проверено пар: <b>' + n + '</b> в двух темах.<br>Минимум для текста: <b>' + worst.r.toFixed(2) + '</b> у ' + worst.tok + ' (' + (worst.t === 'dark' ? 'тёмная' : 'светлая') + ').<br>' +
      (fails.length ? 'Ниже порога: <b>' + fails.join(', ') + '</b>' : '<b>Все пары проходят порог.</b>');
  });
  function motionInfo() {
    var el = $('#motion-out'); if (!el) return;
    el.innerHTML = 'Сейчас: <b>' + (reduce.matches ? 'меньше движения включено' : 'обычное движение') + '</b><br>--dur-mark = <b>' + cs('--dur-mark') + '</b><br>--shift-rise = <b>' + cs('--shift-rise') + '</b>';
  }
  if (crun) crun.click();
  motionInfo(); reduce.addEventListener('change', function () { motionInfo(); renderDur(); });

  /* ------------------------------------------------------------ реакция на тему */
  function onTheme() { renderTokens(); }
})();
