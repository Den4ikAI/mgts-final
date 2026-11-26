/**
 * Hash router: '#/objects/MH-0101?status=critical' → { path:'/objects/MH-0101', name:'object', params:{id}, query }.
 */

export function parseHash(hash = location.hash) {
  const h = decodeURIComponent((hash || '').replace(/^#/, '')) || '/';
  const [path, qs = ''] = h.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  return { path: path || '/', query };
}

/**
 * @param {{name:string, pattern:string}[]} routes  pattern like '/objects/:id'
 */
export function matchRoute(routes, path) {
  const parts = path.replace(/\/+$/, '').split('/').filter(Boolean);
  for (const r of routes) {
    const rp = r.pattern.split('/').filter(Boolean);
    if (rp.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < rp.length; i++) {
      if (rp[i].startsWith(':')) params[rp[i].slice(1)] = parts[i];
      else if (rp[i] !== parts[i]) { ok = false; break; }
    }
    if (ok) return { route: r, params };
  }
  return null;
}

/** Builds '#/path?k=v' skipping empty values. */
export function href(path, query = {}) {
  const q = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== ''));
  const s = q.toString();
  return `#${path}${s ? `?${s}` : ''}`;
}

export function navigate(path, query, { replace = false } = {}) {
  const h = href(path, query);
  if (replace) history.replaceState(null, '', h);
  else location.hash = h;
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}
