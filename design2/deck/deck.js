/* Дека защиты «Попутно» · v4
   Движок по мотивам двух референсов команды:
     LOTIVE  — сцена 1920×1080 с масштабом, классы .on/.play (анимации стартуют при показе),
               провода между узлами с бегущими пакетами (connect), счётчики [data-count];
     «Узел»  — треки, шаги [data-step], ?static / ?print, переход по #id.
   Параметры: ?track=5 (по умолчанию, основной) | 3 | all;  ?static — последний кадр без движения;
   ?print — все слайды подряд для PDF (deck/tools/export-pdf.cjs).
   Клавиши: → пробел PgDn Enter вперёд, ← PgUp назад, Home/End, R повторить анимацию, F полный экран.
   Слайды не своего трека уходят в конец как приложения, так что в треке 3 ничего не теряется. */
(() => {
  const root = document.documentElement;
  const P = new URLSearchParams(location.search);
  const PRINT = P.has("print");
  const STATIC = PRINT || P.has("static") || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TRACK = ["3", "5", "all"].includes(P.get("track")) ? P.get("track") : "5";
  if (STATIC) root.classList.add("is-static");
  if (PRINT) root.classList.add("is-print");
  root.dataset.track = TRACK;

  const NS = "http://www.w3.org/2000/svg";
  const stage = document.getElementById("stage");
  const all = [...stage.querySelectorAll(":scope > .slide")];
  const markTpl = document.getElementById("brand-mark").content.firstElementChild;

  /* ---------- трек: основные, затем приложения (в т. ч. основные чужого трека) ---------- */
  const inTrack = (s) => TRACK === "all" || (s.dataset.tracks || "3 5").split(/\s+/).includes(TRACK);
  const main = all.filter((s) => !s.classList.contains("appendix") && inTrack(s));
  const extra = all.filter((s) => !s.classList.contains("appendix") && !inTrack(s));
  const apps = all.filter((s) => s.classList.contains("appendix"));
  extra.forEach((s) => { s.classList.add("appendix", "extra"); s.dataset.label = "+"; });
  // финал остаётся последним среди основных, доп. слайды идут сразу после него
  const slides = [...main, ...extra, ...apps];
  slides.forEach((s) => stage.append(s));
  all.forEach((s) => { if (!slides.includes(s)) s.classList.add("off-track"); });
  // элементы только для одного трека
  stage.querySelectorAll("[data-track-only]").forEach((el) => { if (el.dataset.trackOnly !== TRACK) el.remove(); });

  /* ---------- хром: знак и номер (LOTIVE) ---------- */
  slides.forEach((s, i) => {
    if (s.hasAttribute("data-bare")) { s.classList.add("bare"); return; }
    const b = document.createElement("div");
    b.className = "chrome-brand";
    b.append(markTpl.cloneNode(true));
    const w = document.createElement("span"); w.textContent = "попутно"; b.append(w);
    s.prepend(b);
    const n = document.createElement("span");
    n.className = "num";
    n.textContent = s.classList.contains("appendix")
      ? (s.dataset.label === "+" ? "доп." : s.dataset.label)
      : `${String(i + 1).padStart(2, "0")} / ${String(main.length).padStart(2, "0")}`;
    s.append(n);
    if (s.classList.contains("appendix") && s.dataset.label && s.dataset.label !== "+") {
      const t = document.createElement("span"); t.className = "app-tag"; t.textContent = "Приложение " + s.dataset.label; s.append(t);
    }
  });
  stage.querySelectorAll("[data-mark]").forEach((h) => { const m = markTpl.cloneNode(true); m.classList.add("mk"); h.replaceWith(m); });

  /* ---------- слова по буквам ---------- */
  stage.querySelectorAll(".wordmark").forEach((w) => {
    const text = w.textContent.trim(); w.textContent = "";
    [...text].forEach((ch, i) => { const sp = document.createElement("span"); sp.textContent = ch; sp.style.setProperty("--i", i); w.append(sp); });
  });

  /* ---------- картинки: заглушка, если файла ещё нет ---------- */
  stage.querySelectorAll("img").forEach((img) => {
    const bad = () => img.classList.add("broken");
    if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) bad();
    img.addEventListener("error", bad);
  });

  /* ---------- счётчики ---------- */
  const fmt = (v, dec) => new Intl.NumberFormat("ru-RU", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v).replace(/ /g, " ");
  const ease = (t) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
  const counters = (slide) => {
    slide.querySelectorAll("[data-count]").forEach((el) => {
      const to = Number(el.dataset.count), dec = Number(el.dataset.dec || 0);
      if (STATIC) { el.textContent = fmt(to, dec); return; }
      const t0 = performance.now() + Number(el.dataset.d || 0) * 1000, dur = 1300;
      el.textContent = fmt(0, dec);
      const tick = (now) => {
        if (!slide.classList.contains("on")) return;
        const k = ease((now - t0) / 1300);
        el.textContent = fmt(to * k, dec);
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  };

  /* ---------- провода между узлами (LOTIVE connect) ---------- */
  const posIn = (el, anc) => { let x = 0, y = 0, n = el; while (n && n !== anc) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; } return { x, y, w: el.offsetWidth, h: el.offsetHeight }; };
  const anchor = (r, s) => s === "r" ? [r.x + r.w, r.y + r.h / 2] : s === "l" ? [r.x, r.y + r.h / 2] : s === "t" ? [r.x + r.w / 2, r.y] : [r.x + r.w / 2, r.y + r.h];
  const curve = (a, b, sa, sb) => {
    const [x1, y1] = a, [x2, y2] = b;
    const k = Math.max(40, Math.min(170, Math.hypot(x2 - x1, y2 - y1) * 0.45));
    const v = (s) => s === "r" ? [k, 0] : s === "l" ? [-k, 0] : s === "t" ? [0, -k] : [0, k];
    const [ax, ay] = v(sa), [bx, by] = v(sb);
    return `M${x1.toFixed(1)} ${y1.toFixed(1)} C${(x1 + ax).toFixed(1)} ${(y1 + ay).toFixed(1)} ${(x2 + bx).toFixed(1)} ${(y2 + by).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  const el = (parent, tag, attrs) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); parent.append(n); return n; };
  const connect = (slide) => {
    const spec = WIRES[slide.id];
    if (!spec || slide.dataset.wired) return;
    slide.dataset.wired = "1";
    const host = document.createElement("div"); host.className = "wire-host"; slide.append(host);
    const svg = el(host, "svg", { class: "wires", viewBox: "0 0 1920 1080", "aria-hidden": "true" });
    spec.forEach((l) => {
      const A = slide.querySelector(l.a), B = slide.querySelector(l.b);
      if (!A || !B) return;
      const p1 = anchor(posIn(A, slide), l.sa || "r"), p2 = anchor(posIn(B, slide), l.sb || "l");
      if (l.oa) { p1[0] += l.oa[0]; p1[1] += l.oa[1]; }
      if (l.ob) { p2[0] += l.ob[0]; p2[1] += l.ob[1]; }
      const d = curve(p1, p2, l.sa || "r", l.sb || "l");
      const tone = l.tone ? " tone-" + l.tone : "";
      el(svg, "path", { d, class: "ln" + tone, pathLength: 1, style: `--d:${l.d || 0}s;--t:${l.t || .7}s` });
      if (l.dash) el(svg, "path", { d, class: "flow" + tone, style: `--d:${(l.d || 0) + .6}s` });
      const n = l.dots || 0;
      for (let i = 0; i < n; i++) {
        const t = document.createElement("i");
        t.className = "travel" + (l.pkt ? " pkt" : "") + (l.dot ? " tone-" + l.dot : l.tone ? " tone-" + l.tone : "");
        t.style.cssText = `--p:path('${d}');--d:${((l.td || 1.6) + i * (l.period || 2.2) / n).toFixed(2)}s;--t:${l.period || 2.2}s`;
        host.append(t);
      }
    });
  };
  // описания проводов по слайдам: a/b селекторы узлов, sa/sb стороны, d задержка, dots бегущие пакеты
  const WIRES = {
    solution: [
      { a: "#sol-shot", b: "#sol-model", d: .7, dots: 2, pkt: true, td: 1.6, period: 2.2, tone: "accent" },
      { a: "#sol-model", b: "#rc-critical", d: 1.5, dots: 1, td: 2.2, period: 2.4, tone: "critical" },
      { a: "#sol-model", b: "#rc-review", d: 1.6, dots: 1, td: 2.4, period: 2.4, tone: "suspected" },
      { a: "#sol-model", b: "#rc-ok", d: 1.7, dots: 1, td: 2.6, period: 2.4, tone: "ok" },
      { a: "#sol-model", b: "#rc-none", d: 1.8, dash: true, tone: "muted" },
    ],
    pipeline: [
      { a: "#pl-src1", b: "#pl-api", d: .6, dots: 1, pkt: true, td: 1.6, period: 2.4 },
      { a: "#pl-src2", b: "#pl-api", d: .65, dots: 1, pkt: true, td: 1.9, period: 2.4 },
      { a: "#pl-src3", b: "#pl-api", d: .7, dash: true },
      { a: "#pl-api", b: "#pl-kafka", d: 1.0, dots: 1, pkt: true, td: 2.2, period: 2.4, tone: "accent" },
      { a: "#pl-api", b: "#pl-s3", sa: "b", sb: "l", d: 1.05, dots: 1, td: 2.3, period: 2.4 },
      { a: "#pl-kafka", b: "#pl-ml", d: 1.3, dots: 2, pkt: true, td: 2.6, period: 2.4, tone: "accent" },
      { a: "#pl-s3", b: "#pl-ml", sa: "r", sb: "b", ob: [-70, 0], d: 1.4, dash: true },
      { a: "#pl-ml", b: "#pl-r1", d: 1.7, dots: 1, td: 3.0, period: 2.4, tone: "critical" },
      { a: "#pl-ml", b: "#pl-r2", d: 1.75, dots: 1, td: 3.2, period: 2.4, tone: "suspected" },
      { a: "#pl-ml", b: "#pl-r3", d: 1.8, dots: 1, td: 3.4, period: 2.4, tone: "ok" },
      { a: "#pl-ml", b: "#pl-r4", d: 1.85, dash: true, tone: "muted" },
      { a: "#pl-ml", b: "#pl-out", sa: "b", sb: "t", oa: [60, 0], ob: [-100, 0], d: 2.0, dots: 1, td: 3.6, period: 2.4, tone: "accent", dot: "scan" },
    ],
  };

  /* ---------- шаги ---------- */
  const maxStep = (s) => Math.max(0, ...[...s.querySelectorAll("[data-step]")].map((e) => +e.dataset.step || 0));
  const applyStep = (s, k) => {
    s.dataset.cur = k;
    s.querySelectorAll("[data-step]").forEach((e) => e.classList.toggle("step-off", (+e.dataset.step || 0) > k));
    const fn = STEP_FX[s.id]; if (fn) fn(s, k);
  };
  // слайд «Сайт»: шаг переключает экран в браузерной рамке и подсвечивает пункт списка
  const STEP_FX = {
    site: (s, k) => {
      const items = [...s.querySelectorAll(".scr-item")], imgs = [...s.querySelectorAll(".browser .scr img")];
      const idx = Math.min(k, items.length - 1);
      items.forEach((it, i) => it.classList.toggle("on", i === idx));
      imgs.forEach((im, i) => im.classList.toggle("on", i === idx));
    },
  };
  const stepsOf = (s) => (s.id === "site" ? s.querySelectorAll(".scr-item").length - 1 : maxStep(s));

  /* ---------- показ ---------- */
  let cur = 0, step = 0;
  const play = (s) => {
    s.classList.remove("play");
    void s.offsetWidth;
    connect(s);
    s.classList.add("play");
    counters(s);
  };
  const show = (n, atEnd = false) => {
    cur = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach((s, i) => { s.classList.toggle("on", i === cur); if (i !== cur) s.classList.remove("play"); });
    const s = slides[cur];
    step = atEnd || STATIC ? stepsOf(s) : 0;
    play(s);
    applyStep(s, s.id === "site" && STATIC ? 2 : step);
    const h = "#" + s.id;
    if (location.hash !== h) history.replaceState(null, "", location.search + h);
  };
  const next = () => { const s = slides[cur]; if (step < stepsOf(s)) { step++; applyStep(s, step); } else if (cur < slides.length - 1) show(cur + 1); };
  const prev = () => { const s = slides[cur]; if (step > 0) { step--; applyStep(s, step); } else if (cur > 0) show(cur - 1, true); };

  const fit = () => { const k = Math.min(innerWidth / 1920, innerHeight / 1080); stage.style.transform = `translate(-50%, -50%) scale(${k})`; };

  if (PRINT) {
    slides.forEach((s) => { s.classList.add("on", "play"); connect(s); counters(s); applyStep(s, s.id === "site" ? 2 : stepsOf(s)); });
    document.fonts.ready.then(() => { root.dataset.ready = "1"; });
    return;
  }
  addEventListener("resize", fit);
  addEventListener("keydown", (e) => {
    if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) { e.preventDefault(); next(); }
    else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) { e.preventDefault(); prev(); }
    else if (e.key === "Home") show(0);
    else if (e.key === "End") show(slides.length - 1);
    else if (e.key === "r" || e.key === "R" || e.key === "к" || e.key === "К") { play(slides[cur]); applyStep(slides[cur], step); }
    else if (e.key === "f" || e.key === "F" || e.key === "а" || e.key === "А") { if (document.fullscreenElement) document.exitFullscreen(); else root.requestFullscreen?.(); }
  });
  addEventListener("click", (e) => { if (e.target.closest("a")) return; if (e.clientX < innerWidth / 3) prev(); else next(); });
  addEventListener("hashchange", () => { const i = slides.findIndex((s) => "#" + s.id === location.hash); if (i >= 0 && i !== cur) show(i); });
  fit();
  const fromHash = () => { const h = decodeURIComponent(location.hash.slice(1)); const i = slides.findIndex((s) => s.id === h); return i < 0 ? 0 : i; };
  document.fonts.ready.then(() => { show(fromHash()); root.dataset.ready = "1"; });
})();
