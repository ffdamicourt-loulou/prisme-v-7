// fuzz-navigation.cjs — v7.30 (plan point 5) : PARCOURS ALÉATOIRES de
// navigation (PRNG seedé mulberry32, JAMAIS Math.random : reproductible).
// Usage : node tests/fuzz-navigation.cjs [racine] [graineDébut] [nbGraines] [étapes/graine]
// Charge FR, DE, IT, US puis déroule des marches aléatoires (clic pays,
// clics zones, Maj+clic, retours, clics vides) en vérifiant après CHAQUE
// action : absence d'exception + les INVARIANTS de sélection du harnais
// (selVersion monotone, journal non vide, clefs qualifiées justifiées,
// fantômes d'homonymes exclus). Sortie : total d'actions, échecs, exit 1 si KO.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const RAC = process.argv[2] || path.join(__dirname, '..');
const GRAINE0 = parseInt(process.argv[3] || '1', 10);
const NB_GRAINES = parseInt(process.argv[4] || '12', 10);
const NB_ETAPES = parseInt(process.argv[5] || '120', 10);
const PAYS = ['FR', 'DE', 'IT', 'US'];

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
      if (o && o.series) (o.series || []).forEach(sr => { if (sr && sr.id === 'noms-zones') appels.etiquettes = sr.data || []; });
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
const doc = (function () {
  const body = el('body'); const d = {
    _els: {},
    getElementById: (id) => { const e = d._els[id] = d._els[id] || el(id); if (!e.parentNode) e.parentNode = body; return e; },
    createElement: (tag) => { const e = el(tag); if (tag === 'script') { appels._scripts.push(e); Object.defineProperty(e, 'src', { set(v) { e._src = v; appels.scripts.push(v); }, get() { return e._src; } }); } return e; },
    createTextNode: (t) => ({ nodeType: 3, textContent: t }),
    body,
  }; return d;
})();
const ctx = {
  window: { addEventListener: () => {}, __PR2_COMPLET: 'v0.210', __PR2_VBUILD: 'v7.30-fuzz', __PR2_THEME: { fond: '#eaf2f8', contour: '#ffffff', traitNiveaux: 0.6 } },
  document: doc, echarts: fauxEcharts,
  setTimeout: (fn) => { fn(); return 1; }, clearTimeout: () => {}, console: { log: () => {}, warn: () => {}, error: () => {} },
};
ctx.window.window = ctx.window;
vm.createContext(ctx);
vm.runInContext('window.__PR2_DATA = __D__;window.__PR2_ADMIN = __A__;window.__PR2_COULEURS = __C__;window.__PR2_PKGS = __P__;'
  .replace('__D__', JSON.stringify(DATA)).replace('__A__', JSON.stringify(ADMIN))
  .replace('__C__', JSON.stringify(coul)).replace('__P__', JSON.stringify({ base: '', manifest: pkgsMan })), ctx, { filename: 'boot.js' });
vm.runInContext(appCore + '\n' + comprehension + '\n' + greffon + '\n' + greffonSel, ctx, { filename: 'app.js' });

const P = ctx.window.__PR2;
// pré-chargement des pays parcourus (comme le fait le harnais)
function charge(id) {
  (fs.readdirSync(path.join(RAC, 'packages')).filter(n => (n.indexOf('n3-' + id + '-') === 0 || n.indexOf('n4-' + id + '-') === 0)).sort())
    .forEach(n => vm.runInContext(fs.readFileSync(path.join(RAC, 'packages', n), 'utf8'), ctx, { filename: n }));
  if (fs.existsSync(path.join(RAC, 'packages', id + '.js')))
    vm.runInContext(fs.readFileSync(path.join(RAC, 'packages', id + '.js'), 'utf8'), ctx, { filename: 'packages/' + id + '.js' });
  (appels._scripts || []).forEach(s => { if (s.onload && new RegExp(id).test(s._src || '')) { const cb = s.onload; s.onload = null; cb(); } });
}
PAYS.forEach(charge);

const clic = (name) => (appels.events.click || []).forEach(f => f({ componentType: 'series', seriesType: 'map', name }));
const clicMaj = (name) => (appels.events.click || []).forEach(f => f({ componentType: 'series', seriesType: 'map', name, event: { shiftKey: true } }));
const clicZone = (name) => {
  clic(name);
  const SEL = ctx.window.__PR2_SEL;
  if (SEL && SEL.descenteAttente && SEL.descenteAttente()) SEL.confirmerDescente();
};

// PRNG mulberry32 — déterministe, seedé, reproductible
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// INVARIANTS (cf. harnais-navigation) : I1 monotone, I2 journal, I3 clefs
// qualifiées justifiées (vue ou ADMIN vivant), I4 legacy = pays ou zone AFFICHÉE
let SELV_MAX = (P.etat && P.etat.selVersion) || 0;
function invariantsSel(label) {
  const e = P.etat; if (!e) return 'état absent';
  const v = e.selVersion || 0;
  if (v < SELV_MAX) return label + ' : selVersion NON monotone (' + v + ' < ' + SELV_MAX + ')';
  SELV_MAX = v;
  const j = P.selJournal();
  if (v > 0 && (!j || !j.length)) return label + ' : journal VIDE après mutation';
  const sels = e.selections || [];
  for (let i = 0; i < sels.length; i++) {
    const c = sels[i];
    if (typeof c === 'string' && c.slice(0, 2) === '2:') {
      const m = /^2:([A-Z0-9]{3})¤([^¤]*)¤(.+)$/.exec(c);
      if (!m) return label + ' : clef malformée : ' + c;
      const a3 = m[1], parent = m[2] === '' ? null : m[2], nom = m[3];
      if (P.zoneDeCleSel(c)) continue; // résolue dans la vue : affichable
      const ADM = ctx.window.__PR2_ADMIN || {};
      if (!ADM.niv2 || !ADM.niv2[a3]) return label + ' : pays inconnu dans la clef : ' + c;
      const n2 = (ADM.niv2[a3]) || {};
      if (parent === null) { if (!n2[nom]) return label + ' : zone N2 inconnue : ' + c; }
      else {
        const enfants = n2[parent];
        if (!Array.isArray(enfants) || !enfants.some(function (z) { return z && (z.nom || z.name) === nom; }))
          return label + ' : zone N3 inconnue (' + c + ') — fantôme ?';
      }
    } else if (!P.parId[c]) {
      // I4 : clef LEGACY ('c-X' ou nom) JUSTIFIÉE si la zone est AFFICHÉE
      // dans la vue courante (features ou sœurs) : c'est le cas des
      // zones profondes non étampées (niveaux GADM 4+), pour lesquelles
      // le repli 'c-' est le MÉCANISME PRÉVU. FANTÔME sinon.
      const vn = String(c).replace(/^c-/, '');
      const disp = (P.vue() && (P.vue().features || []).concat(P.vue().soeurs || []) || [])
        .some(function (f) { return f && ((f.nom != null && f.nom === vn) || f.id === vn); });
      if (!disp) {
        const vf = (P.vue() && P.vue().features || []).filter(function (f) { return f && (f.nom || f.id) === vn; })[0];
        const vv = P.vue() || {};
        return label + ' : sélection FANTÔME (zone non affichée) : ' + String(c)
          + ' {vue a3=' + (vv.paysId || '?') + ' niveau=' + (vv.niveau != null ? vv.niveau : '?')
          + ' pile=' + ((P.pile && P.pile.length) || 0)
          + ' ; feature __a3=' + (vf ? vf.__a3 : 'ABSENTE-f') + ' __parent=' + (vf ? vf.__parent : '?') + '}';
      }
    }
  }
  return null;
}

// noms de zones cliquables de la vue courante (features + éventuelles sœurs)
function zonesCliquables() {
  const v = P.vue();
  const t = [];
  (v && v.features || []).forEach(function (f) { if (f && (f.nom || f.name)) t.push(f.nom || f.name); });
  (v && v.soeurs || []).forEach(function (f) { if (f && (f.nom || f.name)) t.push(f.nom || f.name); });
  return t;
}

let actionsOk = 0; const echecs = [];
function etape(gen, graine, i, action) {
  const label = 'graine ' + graine + ' étape ' + i + ' (' + action.desc + ')';
  try {
    action.run(gen);
  } catch (e) {
    echecs.push(label + ' : EXCEPTION ' + (e && e.message));
    return false;
  }
  const inv = invariantsSel(label);
  if (inv) { echecs.push(inv); return false; }
  actionsOk++;
  return true;
}

let total = 0;
for (let g = 0; g < NB_GRAINES; g++) {
  const graine = GRAINE0 + g;
  const gen = mulberry32(graine);
  // remise au monde entre les graines (robustesse du retour lui-même testée)
  for (let i = 0; i < 20 && P.vue() && P.vue().type !== 'monde'; i++) P.retour();
  P.selVider('fuzz-graine-' + graine);
  for (let i = 0; i < NB_ETAPES; i++) {
    total++;
    const v = P.vue();
    if (!v) { echecs.push('graine ' + graine + ' étape ' + i + ' : vue ABSENTE'); break; }
    const zones = zonesCliquables();
    const r = gen();
    let action;
    if (v.type === 'monde') {
      // au monde : clic pays (déjà chargé ou non), Maj+clic, clic vide, retour
      if (r < 0.55) { const pays = PAYS[Math.floor(gen() * PAYS.length)]; action = { desc: 'clic pays ' + pays, run: () => { clic(pays); /* 2e clic → descente */ if (gen() < 0.7) { clic(pays); charge(pays); } } }; }
      else if (r < 0.7) { const pays = PAYS[Math.floor(gen() * PAYS.length)]; action = { desc: 'Maj+clic pays ' + pays, run: () => clicMaj(pays) }; }
      else if (r < 0.85) action = { desc: 'clic vide', run: () => clic(null) };
      else action = { desc: 'retour au monde', run: () => P.retour() };
    } else {
      if (!zones.length) { action = { desc: 'retour', run: () => P.retour() }; }
      else {
        const z = zones[Math.floor(gen() * zones.length)];
        if (r < 0.4) action = { desc: 'clic zone ' + z, run: () => clicZone(z) };
        else if (r < 0.65) action = { desc: 'clic simple ' + z, run: () => clic(z) };
        else if (r < 0.85) action = { desc: 'Maj+clic zone ' + z, run: () => clicMaj(z) };
        else action = { desc: 'retour depuis ' + z, run: () => P.retour() };
      }
    }
    if (!etape(gen, graine, i, action)) break;
  }
}

console.log('fuzz-navigation v7.30 : ' + NB_GRAINES + ' graines × ' + NB_ETAPES + ' étapes max — ' + total + ' actions tentées, ' + actionsOk + ' OK');
if (echecs.length) {
  echecs.slice(0, 20).forEach(e => console.log('KO  ' + e));
  console.log('TOTAL FUZZ : ' + echecs.length + ' échec(s)');
  process.exit(1);
}
console.log('TOTAL FUZZ : 0 échec');
