// harnais-navigation.cjs — simule : clic pays en vue monde → chargement package
// → clic sur une région → descente niveau 2. Usage : node tests/harnais-navigation.cjs [racine]
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const RAC = process.argv[2] || path.join(__dirname, '..');
const CORE = ['00-const','01-styles-couleurs','02-geo-ancres','03-etat-monde','04-frontieres',
  '05-sigles','06-peinture-regions','07-villes','08-etiquettes-zones','09-villes-continents',
  '10-options','11-survol-repaint','12-camera-cadrage','13-enclaves-outils',
  '14-vues-enregistrement','15-navigation','16-groupes-selection','17-demarrage'];
const appCore = CORE.map(n => fs.readFileSync(path.join(RAC, 'js/core', n + '.js'), 'utf8')).join('\n');
const comprehension = fs.readFileSync(path.join(RAC, 'js/app/couche-comprehension.js'), 'utf8');
const greffon = fs.readFileSync(path.join(RAC, 'js/app/greffon-pays.js'), 'utf8');

const DATA = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(RAC, 'data/monde.json.gz'))).toString());
const ADMIN = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(RAC, 'data/admin.json.gz'))).toString());
const coul = JSON.parse(fs.readFileSync(path.join(RAC, 'data/couleurs-continents.json'), 'utf8'));
const pkgsMan = JSON.parse(fs.readFileSync(path.join(RAC, 'data/manifest-pays.json'), 'utf8'));

const appels = { events: {}, scripts: [], _scripts: [] };
const fauxEcharts = {
  registerMap: (nom) => { (appels.maps = appels.maps || []).push(nom); },
  init: () => ({
    setOption: () => { appels.setOption = (appels.setOption || 0) + 1; },
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
  window: { addEventListener: () => {}, __PR2_COMPLET: 'v0.210', __PR2_THEME: { fond: '#eaf2f8', contour: '#ffffff', traitNiveaux: 0.6 } },
  document: doc, echarts: fauxEcharts,
  setTimeout: (fn) => { fn(); return 1; }, clearTimeout: () => {}, console,
};
ctx.window.window = ctx.window;
vm.createContext(ctx);
vm.runInContext('window.__PR2_DATA = __D__;window.__PR2_ADMIN = __A__;window.__PR2_COULEURS = __C__;window.__PR2_PKGS = __P__;'
  .replace('__D__', JSON.stringify(DATA)).replace('__A__', JSON.stringify(ADMIN))
  .replace('__C__', JSON.stringify(coul)).replace('__P__', JSON.stringify({ base: '', manifest: pkgsMan })), ctx, { filename: 'boot.js' });
vm.runInContext(appCore + '\n' + comprehension + '\n' + greffon, ctx, { filename: 'app.js' });

const P = ctx.window.__PR2;
let ok = 0, ko = [];
const test = (n, c) => { if (c) ok++; else ko.push(n); console.log((c ? 'OK  ' : 'KO  ') + n); };

const clic = (name) => (appels.events.click || []).forEach(f => f({ componentType: 'series', seriesType: 'map', name }));
const charge = (id) => {
  vm.runInContext(fs.readFileSync(path.join(RAC, 'packages', id + '.js'), 'utf8'), ctx, { filename: 'packages/' + id + '.js' });
  (appels._scripts || []).forEach(s => { if (s.onload && new RegExp(id).test(s._src || '')) s.onload(); });
};

// 1. vue monde au départ
test('départ : vue monde', P.vue().type === 'monde');

// 2. clic sur FR en vue monde → package demandé
clic('FR');
test('clic FR en vue monde → script packages/FR.js ajouté', appels.scripts.some(s => /FR/.test(s)));

// 3. arrivée du package (comme le ferait <script src>) → vue niv1
charge('FR');
const v1 = P.vue();
test('après package : vue admin niv1 (' + v1.type + '/' + v1.niveau + ')', v1.type === 'admin' && v1.niveau === 1);

// 4. clic sur une région → niv2
if (v1.type === 'admin' && v1.parNom) {
  const premiereRegion = Object.keys(v1.parNom)[0];
  clic(premiereRegion);
  const v2 = P.vue();
  test('clic région « ' + premiereRegion + ' » → niv2 (' + v2.type + '/' + v2.niveau + ')', v2.type === 'admin' && v2.niveau === 2);
} else test('clic région → niv2', false);

// 5. retour au monde
for (let i = 0; i < 5 && P.vue().type !== 'monde'; i++) P.retour();
test('retour → vue monde', P.vue().type === 'monde');

// 6. deuxième pays : clic DE en vue monde
clic('DE');
const deOk = appels.scripts.some(s => s && /DE/.test(s));
test('clic DE en vue monde → package DE demandé', deOk);
if (deOk) {
  charge('DE');
  const vd = P.vue();
  test('après package DE : vue niv1', vd.type === 'admin' && vd.niveau === 1);
  const reg = Object.keys(vd.parNom)[0];
  clic(reg);
  test('DE clic région « ' + reg + ' » → niv2', P.vue().type === 'admin' && P.vue().niveau === 2);
}

// 7. v7.2 — menu dédoublonné (les alias FR-NA, FR-SA… ne sont plus des pays)
const listePays = ctx.window.__PR2_PAYS ? ctx.window.__PR2_PAYS.liste() : [];
const noms2 = listePays.map(id => (P.parId[id] || {}).nom);
const doublons = noms2.filter((n, i) => noms2.indexOf(n) !== i);
test('menu : ' + listePays.length + ' pays, sans doublon (' + (doublons.length ? doublons.join(',') : 'OK') + ')',
  listePays.length > 220 && doublons.length === 0 && listePays.indexOf('FR-NA') === -1 && listePays.indexOf('FR-SA') === -1 && listePays.indexOf('US-009') === -1);
const rAlias = ctx.window.__PR2_PAYS.ouvrir('US-009'); // alias → doit demander US (enAttente)
test('ouvrir alias US-009 → package US demandé (résolution d\'alias)',
  rAlias.enAttente === true && appels.scripts.some(s => /US/.test(s)));
if (rAlias.enAttente) {
  charge('US');
  const vu = P.vue();
  test('après package US (via alias) : vue niv1 États-Unis', vu.type === 'admin' && vu.niveau === 1 && vu.paysId === 'US');
}

// 8. v7.2 — FRANCE : remontée au monde puis niveau 3 (arrondissements)
for (let i = 0; i < 8 && P.vue().type !== 'monde'; i++) P.retour();
clic('FR');
charge('FR');
const vfr1 = P.vue();
test('FR : vue niv1', vfr1.type === 'admin' && vfr1.niveau === 1);
clic('Auvergne-Rhône-Alpes');
const vfr2 = P.vue();
test('FR : clic région → niv2', vfr2.type === 'admin' && vfr2.niveau === 2);
const nbScriptsAvant = appels.scripts.length;
clic('Ain');
const vfr3 = P.vue();
test('FR : clic département Ain → niv3 arrondissements (' + vfr3.niveau + ', ' + vfr3.features.length + ' zones)',
  vfr3.type === 'admin' && vfr3.niveau === 3 && vfr3.features.length >= 2);
// pas de re-téléchargement du package sur un clic sans suite (fin de chaîne)
clic('Belley');
const apres = P.vue();
const info = doc._els['prisme2-info'];
test('clic sur un arrondissement (fin de chaîne) : aucune re-télécharge, message affiché',
  apres === vfr3 && appels.scripts.length === nbScriptsAvant && info && info.style.display !== 'none');
// changement de niveau 2 SANS remonter au monde : depuis la vue niv2
// (départements d'Auvergne-Rhône-Alpes), les autres régions sont des sœurs
for (let i = 0; i < 2 && P.vue().type !== 'monde' && P.vue().niveau !== 2; i++) P.retour();
clic('Bourgogne-Franche-Comté');
const vAutre = P.vue();
test('depuis niv2 : clic région sœur → vue des départements de Bourgogne (' + (vAutre.features || []).length + ' zones)',
  vAutre.type === 'admin' && vAutre.features.length > 0
  && vAutre.features.every(f => !f.__masque || true)
  && (vAutre.parent === 'Bourgogne-Franche-Comté' || vAutre.nomMap.indexOf('Bourgogne') !== -1));
// et depuis ce niveau, sélectionner un AUTRE pays via le panneau (descendre direct)
const rEsp = ctx.window.__PR2_PAYS.ouvrir('ES');
test('sélection d\'un autre pays (ES) depuis une vue niv2 → package chargé, vue ouverte',
  rEsp.enAttente === true || rEsp.ok === true);
if (rEsp.enAttente) charge('ES');
const ves = P.vue();
test('après ES : vue niv1 Espagne', ves.type === 'admin' && ves.niveau === 1 && ves.paysId === 'ES');

console.log('\nTOTAL : ' + ok + ' OK / ' + ko.length + ' KO' + (ko.length ? ' → ' + ko.join(' | ') : ''));
process.exit(ko.length ? 1 : 0);
