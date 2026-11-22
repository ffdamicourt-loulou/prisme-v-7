// harnais-navigation.cjs — simule : clic pays en vue monde → chargement package
// → clic sur une région → descente niveau 2. Usage : node tests/harnais-navigation.cjs [racine]
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const RAC = process.argv[2] || path.join(__dirname, '..');
const CORE = ['00-const','00b-droms','00c-us-frontieres','00d-selection-etats','01-styles-couleurs','02-geo-ancres','03-etat-monde','04-frontieres',
  '05-sigles','06-peinture-regions','07-villes','08-etiquettes-zones','09-villes-continents',
  '10-options','11-survol-repaint','12-camera-cadrage','13-enclaves-outils',
  '14-vues-enregistrement','15-navigation','16-groupes-selection','17-demarrage'];
const appCore = CORE.map(n => fs.readFileSync(path.join(RAC, 'js/core', n + '.js'), 'utf8')).join('\n');
const comprehension = fs.readFileSync(path.join(RAC, 'js/app/couche-comprehension.js'), 'utf8');
const greffon = fs.readFileSync(path.join(RAC, 'js/app/greffon-pays.js'), 'utf8');
const greffonSel = fs.readFileSync(path.join(RAC, 'js/app/greffon-selection.js'), 'utf8');

const DATA = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(RAC, 'data/monde.json.gz'))).toString());
const ADMIN = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(RAC, 'data/admin.json.gz'))).toString());
const coul = JSON.parse(fs.readFileSync(path.join(RAC, 'data/couleurs-continents.json'), 'utf8'));
const pkgsMan = JSON.parse(fs.readFileSync(path.join(RAC, 'data/manifest-pays.json'), 'utf8'));

const appels = { events: {}, scripts: [], _scripts: [] };
const fauxEcharts = {
  registerMap: (nom) => { (appels.maps = appels.maps || []).push(nom); },
  init: () => ({
    setOption: (o) => { appels.setOption = (appels.setOption || 0) + 1;
      if (o && o.series) (o.series || []).forEach(sr => { if (sr && sr.id === 'noms-zones') appels.etiquettes = sr.data || []; if (sr && sr.type === 'map') appels.carteData = sr.data || []; if (sr && sr.id === 'frontieres-zones') appels.frontZones = sr; if (sr && sr.id === 'frontieres') appels.frontW = sr; });
      if (o && o.geo) { if (o.geo.zoom != null) appels.geoZoom = { zoom: o.geo.zoom, center: o.geo.center }; if (o.geo.regions) appels.regions = o.geo.regions; } },
    getOption: () => ({}),
    on: (ev, fn) => { (appels.events[ev] = appels.events[ev] || []).push(fn); },
    convertToPixel: (f, c) => [c[0] * 2, -c[1] * 2],
    convertFromPixel: (f, p) => [p[0] / 2, -p[1] / 2],
    getWidth: () => 800, getHeight: () => 600, dispatchAction: () => {}, resize: () => {},
    getZr: () => ({ on: () => {} }),
  }),
};
function el(id) { const e = { id, style: {}, setAttribute() {}, parentNode: null, innerHTML: '', textContent: '', children: [], appendChild(c) { c.parentNode = e; this.children.push(c); }, insertBefore(c) { c.parentNode = e; this.children.push(c); return c; }, addEventListener: () => {} }; return e; }
function fauxDocument() {
  const body = el('body');
  return {
    _els: {},
    getElementById: (id) => { const e = doc._els[id] = doc._els[id] || el(id); if (!e.parentNode) e.parentNode = body; return e; },
    createElement: (tag) => {
      const e = el(tag);
      e.parentNode = body;
      if (tag === 'script') { appels._scripts.push(e); Object.defineProperty(e, 'src', { set(v) { e._src = v; appels.scripts.push(v); }, get() { return e._src; } }); }
      return e;
    },
    createTextNode: (t) => ({ nodeType: 3, textContent: t }),
    body,
  };
}
const doc = fauxDocument();
const ctx = {
  window: { addEventListener: () => {}, __PR2_COMPLET: 'v0.210', __PR2_VBUILD: 'v7.3-test', __PR2_THEME: { fond: '#eaf2f8', contour: '#ffffff', traitNiveaux: 0.6 } },
  document: doc, echarts: fauxEcharts,
  setTimeout: (fn) => { fn(); return 1; }, clearTimeout: () => {}, console,
};
ctx.window.window = ctx.window;
vm.createContext(ctx);
vm.runInContext('window.__PR2_DATA = __D__;window.__PR2_ADMIN = __A__;window.__PR2_COULEURS = __C__;window.__PR2_PKGS = __P__;'
  .replace('__D__', JSON.stringify(DATA)).replace('__A__', JSON.stringify(ADMIN))
  .replace('__C__', JSON.stringify(coul)).replace('__P__', JSON.stringify({ base: '', manifest: pkgsMan })), ctx, { filename: 'boot.js' });
vm.runInContext(appCore + '\n' + comprehension + '\n' + greffon + '\n' + greffonSel, ctx, { filename: 'app.js' });

const P = ctx.window.__PR2;
let ok = 0, ko = [];
// v7.30 (plan point 4) : INVARIANTS DE SÉLECTION, vérifiés après CHAQUE
// interaction (chaque appel à test() suit une interaction simulée) :
//   I1 selVersion MONOTONE (jamais de retour arrière de la machine à états) ;
//   I2 journal NON VIDE dès la première mutation (chaque mutation tracée) ;
//   I3 toute clef qualifiée '2:' de etat.selections est JUSTIFIÉE :
//      (a) résolue dans la vue courante (affichable) ou (b) sélection
//      persistante légitime existant dans ADMIN (restaurée au retour) ;
//   I4 toute sélection non qualifiée est un PAYS du référentiel parId,
//      ou une zone AFFICHÉE de la vue (clef legacy des zones sans ancres).
// NB : ligne débutant par « INV » => comptée KO comme les autres tests.
let SELV_MAX = (P.etat && P.etat.selVersion) || 0;
function invariantsSel(label) {
  const e = P.etat; if (!e || typeof P.selJournal !== 'function') return null;
  const v = e.selVersion || 0;
  if (v < SELV_MAX) return 'INV [' + label + '] selVersion NON monotone (' + v + ' < ' + SELV_MAX + ')';
  SELV_MAX = v;
  const j = P.selJournal();
  if (v > 0 && (!j || !j.length)) return 'INV [' + label + '] journal VIDE après mutation (v' + v + ')';
  const sels = e.selections || [];
  for (let i = 0; i < sels.length; i++) {
    const c = sels[i];
    if (typeof c === 'string' && c.slice(0, 2) === '2:') {
      const m = /^2:([A-Z0-9]{3})¤([^¤]*)¤(.+)$/.exec(c);
      if (!m) return 'INV [' + label + '] clef malformée : ' + c;
      const a3 = m[1], parent = m[2] === '' ? null : m[2], nom = m[3];
      if (P.zoneDeCleSel(c)) continue; // (a) résolue dans la vue : affichable
      // (b) hors vue : la zone doit exister dans ADMIN (vivante : rempli au
      // chargement des packages) — sinon c'est un FANTÔME d'homonyme.
      const ADM = ctx.window.__PR2_ADMIN || {};
      if (!ADM.niv2 || !ADM.niv2[a3]) return 'INV [' + label + '] pays inconnu dans la clef : ' + c;
      const n2 = (ADM.niv2[a3]) || {};
      if (parent === null) { if (!n2[nom]) return 'INV [' + label + '] zone N2 inconnue : ' + c; }
      else {
        const enfants = n2[parent]; // tableau d'enfants (zone n3)
        if (!Array.isArray(enfants) || !enfants.some(function (z) { return z && (z.nom || z.name) === nom; }))
          return 'INV [' + label + '] zone N3 inconnue (' + c + ') — fantôme ?';
      }
    } else if (!P.parId[c]) {
      // I4 : clef LEGACY JUSTIFIÉE si la zone est AFFICHÉE (features ou
      // sœurs) : repli prévu des zones sans ancres. FANTÔME sinon.
      const vn = String(c).replace(/^c-/, '');
      const disp = (P.vue() && (P.vue().features || []).concat(P.vue().soeurs || []) || [])
        .some(function (f) { return f && ((f.nom != null && f.nom === vn) || f.id === vn); });
      if (!disp) return 'INV [' + label + '] sélection FANTÔME (zone non affichée) : ' + String(c);
    }
  }
  return null;
}
const test = (n, c) => {
  const inv = invariantsSel(n);
  if (c && !inv) ok++; else ko.push(n);
  console.log(((c && !inv) ? 'OK  ' : 'KO  ') + n + (inv ? '  —  ' + inv : ''));
};

const clic = (name) => (appels.events.click || []).forEach(f => f({ componentType: 'series', seriesType: 'map', name }));
const clicMaj = (name) => (appels.events.click || []).forEach(f => f({ componentType: 'series', seriesType: 'map', name, event: { shiftKey: true } }));
// v7.8 : clic zone + confirmation automatique si la validation n2→n3 s'ouvre
const SELAjax = () => ctx.window.__PR2_SEL;
const clicZone = (name) => {
  clic(name);
  const SEL = ctx.window.__PR2_SEL;
  // v7.23 : un SEUL clic descend directement — plus ni sélection
  // préalable (v7.17) ni info-bulle à confirmer (v7.8). Le rappel de
  // confirmation reste par inertie face aux éventuelles bulles futures.
  if (SEL && SEL.descenteAttente && SEL.descenteAttente()) SEL.confirmerDescente();
};
const charge = (id) => {
  // v7.25 : les compléments niveau 3 (packages/n3-<ID>-k.js) sont évalués
  // AVANT le package — comme le fait le chargeur du navigateur.
  (fs.readdirSync(path.join(RAC, 'packages')).filter(n => (n.indexOf('n3-' + id + '-') === 0 || n.indexOf('n4-' + id + '-') === 0)).sort())
    .forEach(n => vm.runInContext(fs.readFileSync(path.join(RAC, 'packages', n), 'utf8'), ctx, { filename: n }));
  vm.runInContext(fs.readFileSync(path.join(RAC, 'packages', id + '.js'), 'utf8'), ctx, { filename: 'packages/' + id + '.js' });
  // v7.5 : comme dans un vrai navigateur, le onload d un script ne tire
  // QU UNE FOI — relancer un rappel déjà consommé réempilait des vues.
  (appels._scripts || []).forEach(s => { if (s.onload && new RegExp(id).test(s._src || '')) { const cb = s.onload; s.onload = null; cb(); } });
};

// ═══════ audit-coherence.cjs — PROTOCOLE « CARTE DÉFINITIVE » ═══════
// Pour chaque vue testée :
//  M1 « TRACES EN COHABITATION n2/n3 » : paires de segments (features↔sœurs)
//     émises par la couche frontieres-zones, Hausdorff dans ]0,0008° ; 0,08°]
//     → DEUX traces PROCHES mais DIFFÉRENTES du même trait (le défaut Lucerne).
//  M2 « DOUBLES INTER-COUCHES (maritimes) » : paires (monde ↔ zones) Hausdorff
//     dans ]0,002° ; 0,12°] → le contour mondial du pays côtoie sans se
//     confondre le trait des zones (le défaut côte ouest/sud FR).
//  M3 « SOCLE-FANTÔME » : régions socle@ NOMMÉES accessibles (info-bulle
//     « socle@FR 1 » d'Aude/Pyrénées-Orientales) + étiquettes socle.
//  M4 « LAMELLES » : couverture de la géométrie parente par l'union des
//     enfants (aire), < 99 % → socle qui déborde sur la mer / blancs.
const AIRE = (geo) => {
  let a = 0;
  const polys = geo.type === 'Polygon' ? [geo.coordinates] : (geo.coordinates || []);
  polys.forEach(function (poly) {
    for (let r = 0; r < poly.length; r++) {
      const ring = poly[r]; let s = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        s += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
      }
      a += Math.abs(s / 2);
    }
  });
  return a;
};
const HAUS = (a1, b1, a2, b2) => Math.max(
  Math.max(dPS(a1, a2, b2), dPS(b1, a2, b2)),
  Math.max(dPS(a2, a1, b1), dPS(b2, a1, b1)));
function dPS(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
const segsDe = (sr) => {
  const out = [];
  (((sr && sr.data) || []).forEach(function (pl) {
    (pl.coords || []).forEach(function (c) {
      if (c.length === 2) out.push([c[0], c[1]]);
      else for (let i = 0; i + 1 < c.length; i++) out.push([c[i], c[i + 1]]);
    });
  }));
  return out;
};
function pairesProches(A, B, dmin, dmax, maxRap) {
  // index grille : paires a<->b dont la distance HAUSDORFF est dans ]dmin;dmax]
  // pré-filtre : ne comparer A que dans la bbox globale de B
  let bx0=-1e9,by0=-1e9,bx1=1e9,by1=1e9;
  if (B.length) {
    bx0=Math.min.apply(null,B.map(function(s){return Math.min(s[0][0],s[1][0]);}))-dmax-0.2;
    by0=Math.min.apply(null,B.map(function(s){return Math.min(s[0][1],s[1][1]);}))-dmax-0.2;
    bx1=Math.max.apply(null,B.map(function(s){return Math.max(s[0][0],s[1][0]);}))+dmax+0.2;
    by1=Math.max.apply(null,B.map(function(s){return Math.max(s[0][1],s[1][1]);}))+dmax+0.2;
    A=A.filter(function(s){return Math.max(s[0][0],s[1][0])>bx0&&Math.min(s[0][0],s[1][0])<bx1&&Math.max(s[0][1],s[1][1])>by0&&Math.min(s[0][1],s[1][1])<by1;});
  }
  const G = 0.2, cell = {};
  const key = (s) => Math.floor((s[0][0] + s[1][0]) / 2 / G) + '/' + Math.floor((s[0][1] + s[1][1]) / 2 / G);
  const cs = (s) => Math.abs(s[0][0] - s[1][0]) * 0.5 + Math.abs(s[0][1] - s[1][1]) * 0.85 + 0.02;
  B.forEach(function (sb) {
    const k = key(sb);
    (cell[k] = cell[k] || []).push(sb);
  });
  const res = [];
  A.forEach(function (sa) {
    const r = cs(sa);
    const gi = key(sa).split('/');
    for (let gx = -1; gx <= 1; gx++) for (let gy = -1; gy <= 1; gy++) {
      const arr = cell[(+gi[0] + gx) + '/' + (+gi[1] + gy)]; if (!arr) continue;
      arr.forEach(function (sb) {
        // rejet bbox rapide avant Hausdorff
                if (Math.max(sa[0][0], sa[1][0]) < Math.min(sb[0][0], sb[1][0]) - dmax) return;
        if (Math.min(sa[0][0], sa[1][0]) > Math.max(sb[0][0], sb[1][0]) + dmax) return;
        if (Math.max(sa[0][1], sa[1][1]) < Math.min(sb[0][1], sb[1][1]) - dmax) return;
        if (Math.min(sa[0][1], sa[1][1]) > Math.max(sb[0][1], sb[1][1]) + dmax) return;
        const h = HAUS(sa[0], sa[1], sb[0], sb[1]);
        if (h > dmin && h < dmax && h < maxRap * Math.min(cs(sa), cs(sb))) res.push([sa, sb, h]);
      });
    }
  });
  return res;
}
const fmt = (h) => h.toFixed(4);
let DEFAUTS = 0, VUES = 0;
function rreport(l, m) { console.log('  ' + l.padEnd(46) + ' ' + m); }
function audite(label, paysId, region, opts) {
  opts = opts || {};
  clic(paysId); clic(paysId);
  if (!appels.scripts.some((s) => s.indexOf(paysId) !== -1)) {
    if (P.vue().type === 'admin' && P.vue().niveau === 1 && !region) {
      // déjà chargé
    } else { console.log('(saute ' + label + ' : package ' + paysId + ' indisponible)'); return null; }
  } else charge(paysId);
  let v = P.vue();
  if (region) {
    if (!v.parNom || !v.parNom[region]) { console.log('(saute ' + label + ' : région ' + region + ' absente)'); return null; }
    clicZone(region);
    v = P.vue();
    if (v.type !== 'admin' || v.niveau !== 2) { console.log('(saute ' + label + ' : pas de vue niveau 3 (' + v.type + '/' + v.niveau + '))'); return null; }
  }
  VUES++;
  console.log('──────── ' + label + ' (vue ' + (v.nomMap || 'monde') + ', ' + (v.features || []).length + ' zones, ' + (v.soeurs || []).length + ' sœurs)');
  // M4 : lamelles — union des enfants vs parent
  if (v.socleGeometry) {
    const ap = AIRE(v.socleGeometry);
    let ac = 0; (v.features || []).forEach(function (f) { ac += AIRE(f.geometry); });
    const cov = ap > 0 ? (100 * ac / ap) : 0;
    // v7.38 : au NIVEAU 1, une faible couverture est STRUCTURELLE
    // (territoires nationaux sans subdivision : Groenland danois, eaux
    // canadiennes…) — non comptée. Aux niveaux ≥ 2, les enfants doivent
    // paver leur parent (sources homogènes).
    const mauvais = cov < 99 && (v.niveau || 1) >= 2;
    if (mauvais) DEFAUTS++;
    rreport('M4 couverture du socle par les zones :', cov.toFixed(2) + ' %' + (mauvais ? '  ← LAMELLES' : ''));
  }
  // couche zones émise ? segments sources
  const ZF = (v.features || []).flatMap(function (f) { return ringsDe(f && f.geometry); });
  const ZS = (v.soeurs || []).flatMap(function (f) { return (f && !f.__masquee && f.geometry) ? ringsDe(f.geometry) : []; });
  function ringsDe(g) {
    if (!g) return [];
    const polys = g.type === 'Polygon' ? [g.coordinates] : (g.coordinates || []);
    const out = [];
    polys.forEach(function (p) { p.forEach(function (r) { for (let i = 0; i + 1 < r.length; i++) out.push([r[i], r[i + 1]]); }); });
    return out;
  }
  // M1 : cohabitation de DEUX traces différentes DANS LA COUCHE ÉMISE
  //      (ce que l'écran dessine réellement — v7.38 règle à l'émission).
  const fz = appels.frontZones;
  if (fz && fz.data && fz.data.length) {
    const Zt = segsDe(fz);
    const p1 = pairesProches(Zt, Zt, 0.0008, 0.06, 0.4)
      .filter(function (pp) { return pp[0] !== pp[1]; });
    if (p1.length) { DEFAUTS++;
      rreport('M1 deux traces différentes dessinées :', p1.length + ' paires (' + fmt(p1[0][2]) + '°, ex. ' + p1[0][0][0][0].toFixed(3) + ',' + p1[0][0][0][1].toFixed(3) + ')  ← TRAITS DOUBLÉS');
    } else rreport('M1 deux traces différentes dessinées :', '0 (' + Zt.length + ' segments)');
  } else rreport('M1 (couche zones non émise) :', v.type === 'admin' ? '— (vue n1 avant v7.38 ?)' : 'n/a');
  // M2 : monde↔zones
  const W = segsDe(appels.frontW);
  if (W.length && (fz && fz.data && fz.data.length)) {
    const Zt = segsDe(fz);
    const p2 = pairesProches(W, Zt, 0.002, 0.06, 0.5);
    if (p2.length) { DEFAUTS++;
      rreport('M2 doubles inter-couches (maritimes…) :', p2.length + ' paires (' + fmt(p2[0][2]) + '°, ex. ' + p2[0][0][0][0].toFixed(3) + ',' + p2[0][0][0][1].toFixed(3) + ')  ← TRAIT MONDE ÉGARÉ');
    } else rreport('M2 doubles inter-couches :', '0');
  } else if (v.type === 'admin') rreport('M2 (aucune couche monde↔zones à comparer) :', '—');
  // M3 : socle-fantôme
  const soclesNommes = (appels.regions || []).filter(function (r) { return r && r.name && String(r.name).indexOf('socle') === 0 && r.name !== 'socle'; });
  // v7.38 : ces régions existent (fonds hérités légitimes) mais l'info-bulle
  // les masque (10-options) — le défaut ne subsiste qu'en étiquette visible.
  rreport('M3 régions socle@ (bulle masquée par 10-options) :', soclesNommes.length ? soclesNommes.map(function (r) { return r.name; }).join(', ') : '0');
  const etS = (appels.etiquettes || []).filter(function (e) { return /socle/i.test(e.name || ''); });
  if (etS.length) { DEFAUTS++; rreport('M3 étiquettes socle :', etS.length); }
  while (P.vue().type !== 'monde') P.retour();
  return v;
}
// ── PANNEAU ──
// v7.38 : cascade — niveau 1 PUIS première région possédant des enfants
// (niveau 3 utilisateur) si elle existe.
function premiereAvecEnfants() {
  const vn = P.vue();
  if (!vn.parNom) return null;
  const noms = Object.keys(vn.parNom);
  for (let i = 0; i < noms.length; i++) {
    const z = vn.parNom[noms[i]];
    if (z && z.zones && z.zones.length) return noms[i];
  }
  return null;
}
function auditeCascade(paysId) {
  audite(paysId + ' niveau 1', paysId, null);
  // retrouver la vue n1 (audite est déjà remonté au monde) :
  clic(paysId); clic(paysId);
  if (appels.scripts.some((sc) => sc.indexOf(paysId) !== -1)) charge(paysId);
  const reg = premiereAvecEnfants();
  if (reg) { while (P.vue().type !== 'monde') P.retour(); audite(paysId + ' ' + reg + ' (niveau 3)', paysId, reg); }
  else { while (P.vue().type !== 'monde') P.retour(); rreport('(pas de niveau 3 disponible pour ' + paysId + ')', '—'); }
}
audite('FR niveau 1 (régions)', 'FR', null);
audite('FR Occitanie (départements)', 'FR', 'Occitanie');
audite('FR Nouvelle-Aquitaine (côte ouest)', 'FR', 'Nouvelle-Aquitaine');
audite('FR Bretagne (côte ouest)', 'FR', 'Bretagne');
audite('CH Lucerne (districts)', 'CH', 'Lucerne');
audite('CH Zürich (districts)', 'CH', 'Zürich');
audite('CH Bern (districts)', 'CH', 'Bern');
audite('DE Bayern', 'DE', 'Bayern');
audite('IT Lombardia', 'IT', 'Lombardia');
audite('ES Galicia (côte)', 'ES', 'Galicia');
audite('PT Porto', 'PT', 'Porto');
audite('AT Niederösterreich', 'AT', 'Niederösterreich');
audite('US Californie (côte Pacifique)', 'US', 'California');
// ── PANNEAU ÉTENDU (v7.38) ──
['PL','CZ','NL','BE','SE','RO','DK','HU','SK','HR','SI','IE','GR','BG','LU','LI','MC','AD','SM','VA']
  .forEach(function (cpays) { auditeCascade(cpays); });
['US','CA','MX','BR','AR','JP','CN','IN','AU','ZA','MA','TR','RU','NO','FI','EE','LV','LT']
  .forEach(function (cpays) { audite(cpays + ' niveau 1', cpays, null); });

console.log('\nTOTAL AUDIT : ' + VUES + ' vues analysées, ' + DEFAUTS + ' défauts de cohérence');
process.exit(DEFAUTS ? 1 : 0);
