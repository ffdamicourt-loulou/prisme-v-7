// Remplace les géométries des zones MK listées (EuroGeographics via
// geoBoundaries — source des 84 opštini du package) : Douglas-Peucker
// 0,003°, 3 décimales, __cp/__alt/__sec/etq recalculés.
const fs = require('node:fs');
const path = require('node:path');
const PATCH = (process.argv[2] || '').split(',').filter(Boolean);
if (!PATCH.length) { console.error('usage: node fix-zones-mk.cjs "Zone1,Zone2"'); process.exit(1); }
const MK = path.join(__dirname, '..', 'packages', 'MK.js');
const SRC = process.env.AERO_SRC || '/home/user/work/mks.geojson';
const gb = JSON.parse(fs.readFileSync(SRC, 'utf8'));

function perp(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  if (!l2) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function dp(pts, eps) {
  if (pts.length < 5) return pts.slice();
  let im = 0, dmax = 0;
  for (let i = 1; i + 1 < pts.length; i++) { const d = perp(pts[i], pts[0], pts[pts.length - 1]); if (d > dmax) { dmax = d; im = i; } }
  if (dmax < eps) return [pts[0], pts[pts.length - 1]];
  return dp(pts.slice(0, im + 1), eps).slice(0, -1).concat(dp(pts.slice(im), eps));
}
function centroide(r) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const cr = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    a += cr; cx += (r[j][0] + r[i][0]) * cr; cy += (r[j][1] + r[i][1]) * cr;
  }
  a *= 0.5; return [cx / (6 * a), cy / (6 * a)];
}
function dedans(pt, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) c = !c;
  }
  return c;
}
function coupes(r, horizontal, v) {
  const xs = [];
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[j], b = r[i];
    const va = horizontal ? a[1] : a[0], vb = horizontal ? b[1] : b[0];
    if ((va > v) !== (vb > v)) {
      const pa = horizontal ? a[0] : a[1], pb = horizontal ? b[0] : b[1];
      xs.push(pa + (pb - pa) * (v - va) / (vb - va));
    }
  }
  return xs.sort((p, q) => p - q);
}
function intervalle(xs, c) {
  for (let k = 0; k + 1 < xs.length; k += 2) if (c >= xs[k] && c <= xs[k + 1]) return xs[k + 1] - xs[k];
  return 0;
}
const arr = (x) => Number(x.toFixed(15));
let s = fs.readFileSync(MK, 'utf8');
for (const nom of PATCH) {
  const feat = gb.features.find(f => f.properties.shapeName === nom);
  if (!feat) { console.error('introuvable dans la source : ' + nom); process.exit(1); }
  let multi = [];
  const ring0s = feat.geometry.type === 'Polygon' ? [feat.geometry.coordinates[0]] : feat.geometry.coordinates.map(p => p[0]);
  for (let ring0 of ring0s) {
    if (ring0[0][0] !== ring0[ring0.length - 1][0] || ring0[0][1] !== ring0[ring0.length - 1][1]) ring0 = ring0.concat([ring0[0].slice()]);
    let ring = dp(ring0, 0.003);
    if (ring.length < 6) ring = dp(ring0, 0.0015);
    ring = ring.map(p => [+p[0].toFixed(3), +p[1].toFixed(3)]);
    const clean = [ring[0]];
    for (let i = 1; i < ring.length; i++) if (ring[i][0] !== ring[i - 1][0] || ring[i][1] !== ring[i - 1][1]) clean.push(ring[i]);
    if (clean[0][0] === clean[clean.length - 1][0] && clean[0][1] === clean[clean.length - 1][1]) clean.pop();
    clean.push(clean[0].slice());
    ring = clean;
    let aext = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) aext += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    aext = Math.abs(aext / 2);
    if (aext < 1e-6) continue; // fragments microscopiques
    multi.push(ring);
  }
  multi.sort((a, b) => Math.abs(a.length) - Math.abs(b.length));
  // anneau principal = plus grande aire
  let best = multi[0], bestA = -1;
  for (const r of multi) {
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
    a = Math.abs(a / 2);
    if (a > bestA) { bestA = a; best = r; }
  }
  const ring = best;
  const cp = centroide(ring);
  if (!dedans(cp, ring)) { console.error(nom + ' : centroïde hors polygone'); process.exit(1); }
  const ys = ring.map(p => p[1]), xs2 = ring.map(p => p[0]);
  let sLon = 0, sLat = 0;
  for (let f = -0.6; f <= 0.601; f += 0.2) {
    sLon = Math.max(sLon, intervalle(coupes(ring, true, cp[1] + f * (Math.max(...ys) - Math.min(...ys))), cp[0]));
    sLat = Math.max(sLat, intervalle(coupes(ring, false, cp[0] + f * (Math.max(...xs2) - Math.min(...xs2))), cp[1]));
  }
  const geometry = { type: 'Polygon', coordinates: [ring], __cp: [arr(cp[0]), arr(cp[1])], __alt: [arr(cp[0]), arr(cp[1])], __sec: [arr(sLon), arr(sLat)] };
  const nouvelle = { id: nom, nom, geometry, etq: [arr(cp[0]), arr(cp[1])], __a3: 'MKD', etqL: arr(sLon) };
  let i = s.indexOf('{"id":"' + nom + '"');
  if (i < 0) { console.error('entrée introuvable : ' + nom); process.exit(1); }
  let prof = 0, j = i;
  for (; j < s.length; j++) { if (s[j] === '{') prof++; else if (s[j] === '}') { prof--; if (!prof) break; } }
  const vieux = s.slice(i, j + 1);
  const ancien = JSON.parse(vieux);
  s = s.slice(0, i) + JSON.stringify(nouvelle) + s.slice(j + 1);
  console.log(nom + ' : ' + anciens(ancien) + ' → ' + ring.length + ' pts, ' + Math.round(bestA * 12321) + ' km², cp ' + cp.map(v => v.toFixed(3)).join(','));
}
function anciens(z) {
  const r = z.geometry.type === 'Polygon' ? z.geometry.coordinates[0] : z.geometry.coordinates[0][0];
  return r.length + ' pts';
}
fs.writeFileSync(MK, s);
console.log('packages/MK.js réécrit (' + s.length + ' octets)');
