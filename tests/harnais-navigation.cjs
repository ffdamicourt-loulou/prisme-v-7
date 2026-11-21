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

// 1. vue monde au départ
test('départ : vue monde', P.vue().type === 'monde');

// 2. v7.6 — clic sur FR en vue monde : SÉLECTION (niveau 1 = pays seul)
const nbScriptsAvantSel = appels.scripts.length;
clic('FR');
test('1er clic FR en vue monde → SÉLECTION niveau 1 (pays seul, aucun package demandé)',
  P.etat.selection === 'FR' && P.vue().type === 'monde' && appels.scripts.length === nbScriptsAvantSel
  && appels.regions && appels.regions.some(r => r && r.name === 'FR' && r.itemStyle
    && /#[0-9a-f]{6}/i.test(r.itemStyle.areaColor || '') && P.assombris && P.selectionnes
    && P.selectionnes[P.parId.FR.continent] === r.itemStyle.areaColor));

// 3. second clic sur le pays sélectionné → descente demandée puis package
clic('FR');
test('2e clic FR (pays déjà sélectionné) → script packages/FR.js ajouté', appels.scripts.some(s => /FR/.test(s)));
charge('FR');
const v1 = P.vue();
test('après package : vue admin niv1 — régions (' + v1.type + '/' + v1.niveau + ')', v1.type === 'admin' && v1.niveau === 1);
const regsN1 = (appels.regions || []).filter(r => r && r.itemStyle
  && r.name && r.name.slice(0, 2) !== 'c-' && r.name.slice(0, 2) !== 'x-'
  && r.name.slice(0, 6) !== 'socle@' && r.name !== 'socle');
const tintSel = P.selectionnes[P.parId.FR.continent];
test('v7.11 : régions du PAYS SÉLECTIONNÉ (niveau 1) en teinte MI-CHEMIN sélection (' + regsN1.length + ' zones)',
  regsN1.length > 0 && regsN1.every(r => r.itemStyle.areaColor === tintSel));

// 4. clic sur une région → niv2
if (v1.type === 'admin' && v1.parNom) {
  const premiereRegion = Object.keys(v1.parNom)[0];
  clicZone(premiereRegion);
  const v2 = P.vue();
  test('clic région « ' + premiereRegion + ' » → niv2 (' + v2.type + '/' + v2.niveau + ')', v2.type === 'admin' && v2.niveau === 2);
} else test('clic région → niv2', false);

// 5. retour au monde
for (let i = 0; i < 5 && P.vue().type !== 'monde'; i++) P.retour();
test('retour → vue monde', P.vue().type === 'monde');

// 6. deuxième pays : clic DE (sélection) puis clic (descente)
clic('DE');
test('1er clic DE → sélection niveau 1 (pays seul)', P.etat.selection === 'DE');
clic('DE');
const deOk = appels.scripts.some(s => s && /DE/.test(s));
test('2e clic DE en vue monde → package DE demandé', deOk);
if (deOk) {
  charge('DE');
  const vd = P.vue();
  test('après package DE : vue niv1', vd.type === 'admin' && vd.niveau === 1);
  const reg = Object.keys(vd.parNom)[0];
  clicZone(reg);
  test('DE clic région « ' + reg + ' » → niv2', P.vue().type === 'admin' && P.vue().niveau === 2);
}

// 7. v7.2 — menu dédoublonné (les alias FR-NA, FR-SA… ne sont plus des pays)
const listePays = ctx.window.__PR2_PAYS ? ctx.window.__PR2_PAYS.liste() : [];
const noms2 = listePays.map(id => (P.parId[id] || {}).nom);
const doublons = noms2.filter((n, i) => noms2.indexOf(n) !== i);
test('menu : ' + listePays.length + ' pays, sans doublon (' + (doublons.length ? doublons.join(',') : 'OK') + ')',
  listePays.length > 220 && doublons.length === 0 && listePays.indexOf('FR-NA') === -1 && listePays.indexOf('FR-SA') === -1 && listePays.indexOf('US-009') === -1);
const rAlias = ctx.window.__PR2_PAYS.ouvrir('US-009'); // alias → sélection de US
test('ouvrir alias US-009 → SÉLECTION de US (résolution d\'alias, niveau 1)',
  rAlias.ok === true && P.etat.selection === 'US' && P.vue().type === 'monde');
clic('US'); // descente dans les régions/États
charge('US');
const vu = P.vue();
test('2e clic US (via alias) : descente → vue niv1 États-Unis', vu.type === 'admin' && vu.niveau === 1 && vu.paysId === 'US');

// 8. v7.2 — FRANCE : remontée au monde puis niveau 3 (arrondissements)
for (let i = 0; i < 8 && P.vue().type !== 'monde'; i++) P.retour();
clic('FR'); clic('FR'); // sélection puis descente
charge('FR');
const vfr1 = P.vue();
test('FR : vue niv1', vfr1.type === 'admin' && vfr1.niveau === 1);
clicZone('Auvergne-Rhône-Alpes');
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
test('changement de pays (ES) depuis une vue niv2 → SÉLECTION ES niveau 1 (retour monde, cadrage 80 %)',
  rEsp.ok === true && P.etat.selection === 'ES' && P.vue().type === 'monde');

// 8. v7.3 — RÉGRESSIONS du clic depuis la vue monde.
// (a) après retours au monde, un NOUVEAU clic pays ouvre bien le NIVEAU 1
for (let i = 0; i < 6 && P.vue().type !== 'monde'; i++) P.retour();
clic('IT'); test('clic IT (1er) → sélection', P.etat.selection === 'IT');
clic('IT'); charge('IT');
const vit = P.vue();
test('clic IT en vue monde (après historique complet) → niv1, jamais niv2',
  vit.type === 'admin' && vit.niveau === 1 && vit.paysId === 'IT');
// (b) double événement clic (deux dispatchs avant l arrivée du package)
for (let i = 0; i < 6 && P.vue().type !== 'monde'; i++) P.retour();
clic('BE'); clic('BE'); charge('BE');
const vbe = P.vue();
test('double clic BE en vue monde → niv1 (le 2e événement ne saute pas niv2)',
  vbe.type === 'admin' && vbe.niveau === 1 && vbe.paysId === 'BE');
// (c) pays au package DÉJÀ enregistré (PKG_FAIT) : re-clic monde → niv1
P.retour();
clic('FR'); clic('FR'); // 1er clic : sélection ; 2e : descente (package déjà enregistré plus haut)
const vfr = P.vue();
test('re-clic FR en vue monde (package déjà chargé) → niv1',
  vfr.type === 'admin' && vfr.niveau === 1 && vfr.paysId === 'FR');
// (d) l anti-cache est bien actif : les packages portent l identifiant de version
test('anti-cache : les <script> de package portent ?v=',
  appels.scripts.every(s => s.indexOf('?v=') !== -1));

// 9. v7.4 — clic sur un PAYS EXTÉRIEUR (x-…) depuis une vue pays.
for (let i = 0; i < 6 && P.vue().type !== 'monde'; i++) P.retour();
clic('FR'); clic('FR'); charge('FR');
let vF1 = P.vue();
test('FR ouvert (régions, niv1) pour le test x-', vF1.type === 'admin' && vF1.niveau === 1);
const selAvant = P.etat.selection;
clic('x-ES'); // Espagne voisine extérieure → SÉLECTION niveau 1 (v7.6)
test('clic x-ES depuis vue pays → ES SÉLECTIONNÉE au niveau 1 (retour monde, pays seul à 80 %)',
  P.etat.selection === 'ES' && selAvant !== 'ES' && P.vue().type === 'monde');
clic('ES'); charge('ES');
let vES = P.vue();
test('descente ES → vue niv1 Espagne',
  vES.type === 'admin' && vES.niveau === 1 && vES.paysId === 'ES'
  && (vES.parent === 'Espagne' || (P.parId['ES'] || {}).nom === 'Espagne'));
// depuis ES niv2, cliquer le voisin FR : nouvelle SÉLECTION niveau 1
const prov = Object.keys(P.vue().parNom)[0]; clicZone(prov);
const vES2 = P.vue();
if (vES2.niveau === 2) { clic('x-FR'); }
test('depuis ES niv2, clic x-FR → FR SÉLECTIONNÉE niveau 1 (l\'US/ES ne bloque plus)',
  P.etat.selection === 'FR' && P.vue().type === 'monde');

// 10. v7.4 — ancre Auvergne-Rhône-Alpes : correction du noyau (cpDe),
// l'étiquette descend au centre vertical du territoire (45,25°N).
for (let i = 0; i < 6 && P.vue().type !== 'monde'; i++) P.retour();
clic('FR'); clic('FR'); charge('FR');
vF1 = P.vue();
const etqAura = (appels.etiquettes || []).filter(t => t && t.etqId === 'Auvergne-Rhône-Alpes')[0];

test('étiquette Auvergne-Rhône-Alpes : valeur de la série = [4.5242, 45.2514]',
  !!etqAura && Array.isArray(etqAura.value)
  && Math.abs(etqAura.value[0] - 4.524247353084002) < 1e-6
  && Math.abs(etqAura.value[1] - 45.25144749960415) < 1e-6);

// 11. v7.5 — CADRAGE PAR NIVEAU : 80 % (niv 1) vs 60 % (niv 2/3)
// bbox fine (bw=bh) → cadrage borné par la HAUTEUR : ratio attendu 0,60/0,80 = 0,75
const bp = [20, 40, 26, 46];
P.ajusterSur(bp, 0.80); const z80 = appels.geoZoom && appels.geoZoom.zoom;
P.ajusterSur(bp, 0.60); const z60 = appels.geoZoom && appels.geoZoom.zoom;
test('cadrage : niv 1 à 80 %, niv 2/3 à 60 % de la hauteur (ratio 0,75)',
  isFinite(z80) && isFinite(z60) && Math.abs(z60 / z80 - 0.75) < 1e-6);

// 12. v7.5 — depuis les États-Unis (niveau 2 comtés), clic x-autre-pays
for (let i = 0; i < 8 && P.vue().type !== 'monde'; i++) P.retour();
clic('US'); clic('US'); charge('US');
let vUS = P.vue();
test('US ouverte en niv1', vUS.type === 'admin' && vUS.niveau === 1 && vUS.paysId === 'US');
const etatUS = Object.keys(vUS.parNom)[0]; clicZone(etatUS); charge('US'); // 2e cran au cas où
vUS = P.vue();
if (vUS.niveau === 1) { clicZone(etatUS); } // descente directe : comtés de l État
vUS = P.vue();
if (vUS.niveau === 2) { clic('x-DE'); }
test('depuis US niv2 (comtés), clic x-DE → DE SÉLECTIONNÉE (niveau 1), l\'US ne bloque plus',
  P.etat.selection === 'DE' && P.vue().type === 'monde');

// 13. v7.5 — dézoom ×3,5 en niveau 3 : seules les frontières éteintes, teinte uniforme
for (let i = 0; i < 8 && P.vue().type !== 'monde'; i++) P.retour();
clic('FR'); clic('FR'); charge('FR');
for (let n = 0; n < 6 && P.vue().niveau < 3; n++) { clicZone('Auvergne-Rhône-Alpes'); clic('Ain'); }
const vAvant = P.vue();
if (vAvant.niveau >= 2 && P.zoomMolette) {
  for (let k = 0; k < 7; k++) P.zoomMolette(600, null, null); // dézoom ×1.3 x7 ≈ ×6.3
  const regs = appels.regions || [];
  const zones = regs.filter(r => r && r.name && r.name.indexOf('socle') !== 0 && r.name.indexOf('x-') !== 0 && r.name.indexOf('c-') !== 0);
  // v7.7 : la tache = couleur du pays -10 % (TSL) et porte le NOM de la
  // zone du niveau supérieur (vue.parent), en blanc au centre du socle.
  const etqFusion = (appels.etiquettes || []).filter(t => t && t.etqId === 'fusion-' + vAvant.parent)[0];
  test('dézoom ×3,5 : tache = teinte Sélection -10 % (TSL, P.selectionnes)',
    zones.length > 0 && zones.every(r => r.itemStyle && r.itemStyle.borderWidth === 0)
    && zones.every(r => r.itemStyle.areaColor === zones[0].itemStyle.areaColor)
    && zones.every(r => r.itemStyle.areaColor === P.selectionnes[P.parId.FR.continent]));
  test('dézoom ×3,5 : nom du niveau supérieur (« ' + vAvant.parent + ' ») affiché sur la tache (blanc)',
    !!etqFusion && etqFusion.name === vAvant.parent
    && etqFusion.label && etqFusion.label.color === '#ffffff'
    && P.vue().niveau >= 2); // la sélection/niveau reste courant
  // v7.12 : le nom du pays de la sélection (fusion) a la MÊME TAILLE de
  // police que les autres pays visibles au même niveau de zoom.
  const etqXP = (appels.etiquettes || []).filter(t2 => t2 && t2.etqId
    && String(t2.etqId).indexOf('x-') === 0 && t2.label)[0];
  test('v7.12 : nom de la sélection au dézoom à la MÊME taille que les autres pays ('
    + (etqFusion && etqFusion.label ? etqFusion.label.fontSize : '?') + ' vs '
    + (etqXP && etqXP.label ? etqXP.label.fontSize : '?') + ')',
    !!etqFusion && !!etqXP && etqFusion.label.fontSize === etqXP.label.fontSize);
  } else test('dézoom ×3,5 (vue niv>=2 atteinte)', false);

// 14. v7.23 — DESCENTE EN UN SEUL CLIC (suppression sélection v7.17 + info-bulle v7.8)
for (let i = 0; i < 8 && P.vue().type !== 'monde'; i++) P.retour();
clic('FR'); clic('FR'); charge('FR');
const SEL = ctx.window.__PR2_SEL;
clic('Auvergne-Rhône-Alpes');
test('v7.23 : 1er clic sur une région → DESCENTE IMMÉDIATE (vue niv2, aucune info-bulle)',
  P.vue().type === 'admin' && P.vue().niveau === 2
  && P.vue().parent === 'Auvergne-Rhône-Alpes'
  && SEL.descenteAttente() === false
  && (P.etat.selections || []).indexOf('Auvergne-Rhône-Alpes') === -1);
clic('c-Occitanie'); // sœur : ses départements rejoignent la vue (v7.19 inchangé)
test('v7.23 : ajout sœur « c-Occitanie » conserve v7.19 (ses départements rejoignent la vue)',
  P.vue().type === 'admin' && P.vue().niveau === 2
  && (P.vue().features || []).some(f => f && f.nom === 'Hérault'));
P.retour(); // retour à la vue régions
// retour PROPRE à la vue régions (la descente AURA reste dans la pile)
for (let i = 0; i < 8 && P.vue().type !== 'monde'; i++) P.retour();
clic('FR'); clic('FR'); charge('FR');
clicMaj('Auvergne-Rhône-Alpes');
clicMaj('Occitanie');
test('v7.23 : Maj+clic régions → MULTI-N2 conservé (les deux sélectionnées, vue inchangée)',
  P.vue().niveau === 1
  // v7.30 : les zones sont désignées par leurs CLEFS QUALIFIÉES « 2:a3¤¤nom »
  && (P.etat.selections || []).indexOf('2:FRA\u00A4\u00A4Auvergne-Rhône-Alpes') !== -1
  && (P.etat.selections || []).indexOf('2:FRA\u00A4\u00A4Occitanie') !== -1);
test('v7.23 : région sélectionnée (Maj+clic) peinte PLUS SOMBRE que le fond du pays (-20 % vs -10 %)',
  (() => { const r = (appels.regions || []).filter(x => x && x.name === 'Auvergne-Rhône-Alpes')[0];
    return !!r && !!r.itemStyle && r.itemStyle.areaColor === P.assombris[P.parId.FR.continent]; })());
clic('Occitanie'); // SEUL clic → descente immédiate, OCCITANIE déjà sélectionnée ou non
test('v7.23 : clic simple sur une région (même sélectionnée) → descente SANS info-bulle',
  P.vue().type === 'admin' && P.vue().niveau === 2 && SEL.descenteAttente() === false);
test('v7.23 : les AUTRES N2 RESTENT sélectionnées après la descente (multi-N2 persistant)',
  (P.etat.selections || []).indexOf('2:FRA\u00A4\u00A4Auvergne-Rhône-Alpes') !== -1
  && P.vue().parent === 'Occitanie');

// 15. v7.8 — clic MER / ZONE VIDE : tout désélectionner, cadrage conservé
const zAvantVide = P.etat.zoom, vueAvantVide = P.vue();
const rVide = SEL.clicVide();
test('v7.8 : clic zone vide → tout désélectionné, vue et cadrage CONSERVÉS',
  rVide.ok === true && P.etat.selection === null && (P.etat.selections || []).length === 0
  && P.vue() === vueAvantVide && P.etat.zoom === zAvantVide
  && P.vue().paysId === vueAvantVide.paysId);

// 16. v7.8 — panneau Alt+clic : propositions contextuelles + aperçu + annuler
// (remonter au n2 avec le pays sélectionné, puis Alt+clic sur le département Ain)
for (let i = 0; i < 8 && P.vue().type !== 'monde'; i++) P.retour();
clic('FR'); clic('FR'); charge('FR'); clicZone('Auvergne-Rhône-Alpes');
const nivOrig16 = P.vue().niveau;
SEL.altClic({ name: 'Ain', event: { offsetX: 600, offsetY: 300 } });
const opts = SEL.options();

test('v7.8 : panneau Alt+clic ouvert, propositions contextuelles (' + opts.length + ')',
  SEL.ouvert() === true && opts.length >= 4
  && opts.some(o => o.indexOf('zone « Ain »') !== -1)
  && opts.some(o => o.indexOf('remonter au niveau 2') !== -1)
  && opts.some(o => o.indexOf('Retour au niveau 1') !== -1)
  && opts.some(o => o.indexOf('pays « France »') !== -1));
// aperçu : remonter d'un cran (régions apparentes)
SEL.choisir(opts.findIndex(o => o.indexOf('remonter au niveau 2') !== -1));
test('v7.8 : aperçu radio « remonter au niveau 2 » → vue n1 effective en direct',
  P.vue().type === 'admin' && P.vue().niveau === nivOrig16 - 1 && P.vue().paysId === 'FR');
// revenir à « conserver » : restauration du chemin d'origine
SEL.choisir(0);
test('v7.8 : bascule « conserver » → retour à l\'état d\'ouverture (même niveau, même pays)',
  P.vue().type === 'admin' && P.vue().niveau === nivOrig16 && P.vue().paysId === 'FR');
// aperçu « désélectionner le pays » = retour à la vue monde sans sélection
SEL.choisir(opts.findIndex(o => o.indexOf('retour à la vue monde') !== -1));
test('v7.8 : aperçu « désélectionner le pays » → vue monde, aucune sélection',
  P.vue().type === 'monde' && P.etat.selection === null && (P.etat.selections || []).length === 0);
// annuler referme sans rien garder
SEL.choisir(opts.findIndex(o => o.indexOf('Retour au niveau 1') !== -1));SEL.annuler();test('v7.8 : Annuler → retour à l\'état d\'ouverture (vue admin n2 FR), panneau fermé',
  SEL.ouvert() === false && P.vue().type === 'admin' && P.vue().niveau === nivOrig16
  && P.vue().paysId === 'FR');

// 17. v7.9 — MAJ+CLIC : ajout d'un pays à la sélection
// en vue monde : sélection FR, puis Maj+clic DE → DE sélectionné, FR conservé
for (let i = 0; i < 8 && P.vue().type !== 'monde'; i++) P.retour();
SEL.clicVide(); // repartir d'un monde SANS sélection : le clic FR = sélection
// v7.12 : comme dans le VRAI navigateur, le POINTEUR est sur DE au moment
// du clic — mouseover posé, ECharts ne renverra pas de mouseout quand le
// setOption recréera la série. Sans l'effacement du survol au clic, DE
// resterait peint en teinte de SURVOL (-20 %) au lieu de la teinte de
// sélection multiple (le test « DEUX pays peints » ci-dessous échouerait).
(appels.events.mouseover || []).forEach(f => f({ componentType: 'series', seriesType: 'map', name: 'DE' }));
clic('FR'); // sélection niveau 1
(appels.events.click || []).forEach(f => f({ componentType: 'series', seriesType: 'map',
  name: 'DE', event: { shiftKey: true } }));
test('v7.9 : Maj+clic DE en vue monde → DE sélectionné, FR CONSERVÉ dans la sélection',
  P.etat.selection === 'DE' && (P.etat.selections || []).indexOf('FR') !== -1
  && P.vue().type === 'monde');
test('v7.9 : les DEUX pays peints en teinte sélection (-10 %)',
  (appels.regions || []).some(r => r && r.name === 'FR'
    && r.itemStyle.areaColor === P.selectionnes[P.parId.FR.continent])
  && (appels.regions || []).some(r => r && r.name === 'DE'
    && r.itemStyle.areaColor === P.selectionnes[P.parId.DE.continent]));
// v7.13 : cadrage de la sélection multiple = l'ENSEMBLE FR+DE, centré
// horizontalement, 80 % de la hauteur (pas le seul DE).
const cf13 = P.boitePrincipale(P.parId.FR.geometry), cd13 = P.boitePrincipale(P.parId.DE.geometry);
const cxGrp13 = (Math.min(cf13[0], cd13[0]) + Math.max(cf13[2], cd13[2])) / 2;
const gz13 = appels.geoZoom || {};
test('v7.13 : cadrage multi-sélection FR+DE : ENSEMBLE centré horizontalement (centre ' + (gz13.center ? gz13.center[0].toFixed(1) : '?') + '°, attendu ' + cxGrp13.toFixed(1) + '°)',
  gz13.center && Math.abs(gz13.center[0] - cxGrp13) < 0.5
  && gz13.center[0] > (cf13[0] + cf13[2]) / 2 + 1);
// v7.13 : Alt+clic sur DE (FR+DE sélectionnés) → proposer UNIQUEMENT DE
const rAlt13 = ctx.window.__PR2_SEL.altClic({ name: 'DE', event: { offsetX: 300, offsetY: 300 } });
const opts13 = ctx.window.__PR2_SEL.options().join(' | ');
test('v7.13 : Alt+clic sur DE (multi FR+DE) → désélectionner UNIQUEMENT le pays cliqué',
  rAlt13 && rAlt13.ok === true && opts13.indexOf('(FR)') === -1
  && opts13.indexOf('(DE)') !== -1 && opts13.indexOf('Tout désélectionner') !== -1);
ctx.window.__PR2_SEL.annuler();

// en vue pays : FR n1 (régions) + Maj+clic x-DE → VUE COMBINÉE niveau 2 (régions)
for (let i = 0; i < 8 && P.vue().type !== 'monde'; i++) P.retour();
SEL.clicVide(); // monde sans sélection : clic FR = sélection, 2e clic = descente
clic('FR'); clic('FR'); // sélection puis descente (package FR déjà enregistré)
(appels.events.click || []).forEach(f => f({ componentType: 'series', seriesType: 'map',
  name: 'x-DE', event: { shiftKey: true } }));
const vg = P.vue();
const paysG = (vg.paysIds || []);
test('v7.9 : Maj+clic x-DE depuis FR n1 → VUE COMBINÉE FR + DE (régions + länder)',
  vg.type === 'admin' && vg.niveau === 1 && paysG.indexOf('FR') !== -1
  && paysG.indexOf('DE') !== -1 && vg.features.length > 15
  && (vg.parPays['Sachsen'] === 'DE' || vg.parPays['Auvergne-Rhône-Alpes'] === 'FR'));
// retrait via le panneau Alt+clic : « Retirer Allemagne de la sélection groupée »
SEL.altClic({ name: 'Sachsen', event: { offsetX: 300, offsetY: 300 } });
const optRet = SEL.options();
const iRet = optRet.findIndex(o => o.indexOf('Retirer Allemagne') !== -1);
test('v7.9 : panneau Alt propose « Retirer Allemagne de la sélection groupée »',
  iRet !== -1);
if (iRet !== -1) {
  SEL.choisir(iRet);
  const vp = P.vue();
  test('v7.9 : APERÇU du retrait → vue groupe FR seulement (DE retiré en direct)',
    vp.type === 'admin' && (vp.paysIds || []).length === 1 && vp.paysIds[0] === 'FR');
  SEL.valider();
  const vf7 = P.vue();
  test('v7.9 : VALIDATION → le groupe ne contient plus que la France',
    vf7.type === 'admin' && (vf7.paysIds || []).length === 1 && vf7.paysIds[0] === 'FR');
} else { test('v7.9 : retrait de groupe', false); }

// retour au monde : la addition PERSISTE (les membres restent sélectionnés)
for (let i = 0; i < 6 && P.vue().type !== 'monde'; i++) P.retour();
const selApres = (P.etat.selections || []);
test('v7.9 : retour au monde — la France persiste (sélection primaire), le pays RETIRÉ est purgé',
  P.vue().type === 'monde' && (P.etat.selection === 'FR' || selApres.indexOf('FR') !== -1)
  && selApres.indexOf('DE') === -1 && P.etat.selection !== 'DE'); // la désélection purge

// 17. v7.10 — GESTIONNAIRE UNIQUE + causes racines du VRAI navigateur.
// (a) Dans un vrai navigateur ECharts, l'événement DOM est NICHÉ dans
// des enveloppes zrender (e.event.event.rawEvent…) : la lecture directe
// e.event.shiftKey valait TOUJOURS undefined — Maj ne marchait jamais.
const SEL10 = ctx.window.__PR2_SEL;
const clicBrut = (ev) => (appels.events.click || []).forEach(f => f(ev));
if (SEL10 && SEL10.touche && SEL10.traiteClic) {
  test('v7.10 : touche() lit shiftKey à 3 niveaux d\'enveloppe (le vrai navigateur)',
    SEL10.touche({ event: { event: { event: { shiftKey: true } } } }, 'shiftKey') === true
    && SEL10.touche({ event: { shiftKey: false } }, 'shiftKey') === false
    && SEL10.touche({}, 'shiftKey') === false);
  const selAvant = (P.etat.selections || []).slice();
  clicBrut({ componentType: 'series', seriesType: 'map', name: 'DE',
    event: { event: { event: { shiftKey: true } } } });
  // v7.14 : survol RÉSIDUEL sur DE (mouse RE-fire après le setOption du
  // clic, comme dans le vrai navigateur) puis REPEINTURE COMPLÈTE : un
  // MEMBRE de la sélection multiple doit garder la teinte de sélection,
  // quoi qu'il arrive — la sélection prime sur le survol.
  (appels.events.mouseover || []).forEach(f => f({ componentType: 'series', seriesType: 'map', name: 'DE' }));
  P.majEtiquettes();
  const survCollant = (appels.regions || []).filter(r => r && r.name === 'DE')[0];
  test('v7.14 : survol résiduel sur un MEMBRE : teinte de sélection INTACTE ('
    + (survCollant && survCollant.itemStyle ? survCollant.itemStyle.areaColor : '?') + ')',
    survCollant && survCollant.itemStyle
    && survCollant.itemStyle.areaColor === P.selectionnes[P.parId.DE.continent]);
  const selDE = (P.etat.selections || []);
  test('v7.10 : Maj+clic DE avec enveloppe NICHÉE → DE sélectionné, FR AJOUTÉ au groupe',
    P.etat.selection === 'DE' && selDE.indexOf('FR') !== -1);
  // (b) v7.17 : un clic sur le SOCLE (zone vide) n'est PAS une « zone
  // nommée » — il posait le drapeau et le clic zrender qui suit (le même
  // clic physique dans le vide) était consommé silencieusement : la
  // DÉSÉLECTION par clic dans une zone vide ne fonctionnait plus.
  SEL10.zrClic(); // consomme un éventuel drapeau résiduel des clics nommés précédents
  clicBrut({ componentType: 'series', seriesType: 'map', name: 'socle' });
  SEL10.zrClic();
  test('v7.17 : clic ZONE VIDE (socle) + zr → TOUT déselectionné (le socle ne pose plus le drapeau)',
    !P.etat.selection && (P.etat.selections || []).length === 0);
  SEL10.zrClic(); // v7.17 : direct, sans clic nommé au préalable
  test('v7.10 : clic VIDE (zrender, sans zone) → tout reste déselectionné',
    !P.etat.selection && (P.etat.selections || []).length === 0);
} else { test('v7.10 : gestionnaire unique exporté (traiteClic/touche/zrClic)', false); }

// 18. v7.13 — tailles des NOMS/CODES de pays : +30 % entre zoom 5× et 40×.
P.etat.zoom = 20; P.majEtiquettes();
const tPx13 = P.tailles(20).etiquette;
const boost13 = Math.max(7, Math.round(Math.min(16, 8 * Math.sqrt(20) + 3) * 1.105));
test('v7.15 : noms de pays ×1,105 (1,3 revu -15 %) au zoom 20 (attendu ' + boost13 + ' px, base ' + tPx13 + ')',
  (appels.etiquettes || []).some(t2 => t2 && t2.label && t2.label.fontSize === boost13));
P.etat.zoom = 45; P.majEtiquettes();
test('v7.13 : hors plage (zoom 45) → tailles de pays INCHANGÉES (' + tPx13 + ' px)',
  (appels.etiquettes || []).some(t2 => t2 && t2.label && t2.label.fontSize === tPx13));

// 19. v7.16 — noms du niveau supérieur EFFACÉS en vue départements ; sœur
// masquée sans étiquette (fusion BFC / Côte-d'Or) ; ceinture de peinture.
for (let i = 0; i < 8 && P.vue().type !== 'monde'; i++) P.retour();
clic('FR'); clic('FR'); charge('FR');
clicZone('Auvergne-Rhône-Alpes'); // vue départements (niveau 2)
const v716 = P.vue();
P.majEtiquettes();
const etq716 = appels.etiquettes || [];
test('v7.18 : vue départements — les autres régions (sœurs « c- ») CONSERVENT leurs noms',
  v716.type === 'admin' && v716.niveau === 2
  && (v716.soeurs || []).some(f => f && f.id === 'Occitanie' && !f.__masquee)
  && etq716.some(t => t && t.etqId === 'c-Occitanie'));
const regs716 = appels.regions || [];
const par716 = {}; regs716.forEach(r => { if (r && r.name) par716[r.name] = r; });
const trous716 = (v716.features || []).filter(f => f && f.id
  && !(par716[f.id] && par716[f.id].itemStyle && par716[f.id].itemStyle.areaColor
       && par716[f.id].itemStyle.areaColor !== '#eaf2f8'));
test('v7.16 : ceinture — chaque zone propre de la vue a une entrée peinte (' + (v716.features || []).length + ' propres, ' + trous716.length + ' trou(s))',
  v716.niveau === 2 && (v716.features || []).length > 0 && trous716.length === 0);
// Maj+sœur → vue combinée : la sœur ajoutée est masquée (ses zones propres
// s'affichent) mais ne porte PLUS son étiquette par-dessus ses départements.
const nbAv716 = (v716.features || []).length;
SEL.traiteClic({ componentType: 'series', seriesType: 'map', name: 'c-Bourgogne-Franche-Comté',
  event: { event: { shiftKey: true } } });
const v716c = P.vue(); P.majEtiquettes();
const etq716c = appels.etiquettes || [];
test('v7.16 : Maj+sœur → vue combinée : sœur MASQUÉE, sans étiquette (fin du doublon Côte-d\'Or/BFC)',
  v716c.type === 'admin' && v716c.niveau === 2 && (v716c.features || []).length > nbAv716
  && (v716c.soeurs || []).some(f => f && f.id === 'Bourgogne-Franche-Comté' && f.__masquee)
  && !etq716c.some(t => t && t.etqId === 'c-Bourgogne-Franche-Comté'));
const regs716c = appels.regions || [];
const par716c = {}; regs716c.forEach(r => { if (r && r.name) par716c[r.name] = r; });
const trous716c = (v716c.features || []).filter(f => f && f.id
  && !(par716c[f.id] && par716c[f.id].itemStyle && par716c[f.id].itemStyle.areaColor
       && par716c[f.id].itemStyle.areaColor !== '#eaf2f8'));
test('v7.16 : vue combinée — ceinture : TOUS les départements (y c. ajoutés) peints (0 trou blanc)',
  (v716c.features || []).length > nbAv716 && trous716c.length === 0);

// 20. v7.17 — 2e clic pays AVEC POSITION du curseur : la région sous le clic
// est sélectionnée d'office (mécanisme : 1er clic = pays, 2e clic = régions).
for (let i = 0; i < 8 && P.vue().type !== 'monde'; i++) P.retour();
SEL.clicVide();
clic('FR');
test('v7.17 : préambule — 1er clic FR → sélection (vue monde)', P.etat.selection === 'FR');
clicBrut({ componentType: 'series', seriesType: 'map', name: 'FR',
  event: { offsetX: 2 * 1.44, offsetY: -2 * 43.6 } }); // curseur sur Toulouse
charge('FR');
test('v7.23 : 2e clic FR (curseur sur Toulouse) → vue régions, SANS auto-sélection',
  P.vue().type === 'admin' && P.vue().niveau === 1
  && (P.etat.selections || []).length === 0);
test('v7.17 : zoneAuPoint([pixel de Toulouse]) → Occitanie (test direct du hit-test)',
  (() => { const fz = P.zoneAuPoint([2 * 1.44, -2 * 43.6]);
    return !!fz && fz.id === 'Occitanie'; })());

// 21. v7.19 — clic simple sur une SŒUR : ses enfants rejoignent la vue
// (fin du « aucune subdivision plus fine disponible » en multi-N2 niveau 3),
// puis bascule de retrait au clic suivant.
clicZone('Auvergne-Rhône-Alpes'); // depuis la vue régions (Occitanie sélectionnée) → départements
const nAv719 = (P.vue().features || []).length;
const soeursOcc = (P.vue().soeurs || []).filter(s => s && s.id === 'Occitanie');
clic('c-Occitanie'); // clic SIMPLE sur la sœur (pas de Maj)
const v719 = P.vue();
test('v7.19 : clic simple sur sœur « c-Occitanie » → ses départements REJOIGNENT la vue (plus de message « aucune subdivision »)',
  soeursOcc.length === 1 && v719.niveau === 2
  && (v719.features || []).length > nAv719
  && (v719.soeurs || []).some(f => f && f.id === 'Occitanie' && f.__masquee));
clic('c-Occitanie'); // clic suivant : bascule de RETRAIT
test('v7.19 : nouveau clic sur la sœur ajoutée → RETRAIT (bascule)',
  (P.vue().features || []).length === nAv719
  && !((P.vue().soeurs || []).some(f => f && f.id === 'Occitanie' && f.__masquee)));

// 22. v7.20 — Espagne UNIPROVINCIALE : sélection de Madrid depuis une vue provinces
for (let i = 0; i < 8 && P.vue().type !== 'monde'; i++) P.retour();
SEL.clicVide();
clic('ES'); clic('ES'); charge('ES'); // 2e clic ES → vue communautés
clicZone('Andalucía'); // sélection + descente → vue provinces d'Andalucía
const nAvES = (P.vue().features || []).length;
clic('c-Madrid'); // sœur UNIPROVINCIALE (pas de subdivisions dans les données)
const v720 = P.vue();
test('v7.20 : clic sur « c-Madrid » (uniprovinciale) depuis la vue provinces → Madrid REJOINT la vue au niveau courant',
  v720.niveau === 2 && (v720.features || []).some(f => f && f.id === 'Madrid')
  && (v720.features || []).length === nAvES + 1
  && (v720.soeurs || []).some(f => f && f.id === 'Madrid' && f.__masquee));
clic('c-Madrid'); // bascule de retrait
test('v7.20 : nouveau clic → RETRAIT de Madrid (bascule)',
  !((P.vue().features || []).some(f => f && f.id === 'Madrid'))
  && (P.vue().features || []).length === nAvES);

// 23. v7.21 — DONNÉES IGN SUPPRIMÉES : la France n'a plus que ses
// 13 régions métropolitaines GADM (Guadeloupe, Martinique, Guyane
// française, La Réunion, Mayotte retirées), et la descente marche
// partout (Corse, Île-de-France).
for (let i = 0; i < 8 && P.vue().type !== 'monde'; i++) P.retour();
SEL.clicVide();
clic('FR'); clic('FR'); charge('FR');
const v721 = P.vue();
test('v7.21/v7.22 : 18 régions (13 métropole + 5 ultrapériphériques GADM), AUCUNE zone src "ign"',
  v721.type === 'admin' && v721.niveau === 1
  && Object.keys(v721.parNom).length === 18
  && !(v721.features || []).some(f => f && f.src === 'ign')
  && v721.parNom['Île-de-France'] && v721.parNom['Corse']);
clicZone('Corse'); // était citée dans le bug des zones blanches
test('v7.21 : descente Corse → 2 départements, aucune zone blanche en filière',
  P.vue().type === 'admin' && P.vue().niveau === 2
  && (P.vue().features || []).filter(f => f && f.id === 'Corse-du-Sud' || f.id === 'Haute-Corse').length === 2);
P.retour(); // retour à la vue régions
clicZone('Île-de-France');
test('v7.21 : descente Île-de-France → 8 départements (info-bulle « aucune subdivision » réglée côté données)',
  P.vue().type === 'admin' && P.vue().niveau === 2
  && (P.vue().features || []).filter(f => f && ['Essonne','Hauts-de-Seine','Paris','Seine-et-Marne','Seine-Saint-Denis','Val-d\'Oise','Val-de-Marne','Yvelines'].indexOf(f.id) !== -1).length === 8);

// 24. v7.22 — SOURCE UNIQUE GADM AUX TROIS NIVEAUX : les ultrapériphériques
// sont DE RETOUR, contour GADM 4.1 (gadm41_{GLP,MTQ,GUF,REU,MYT}), avec
// leurs unités de niveau 1 GADM comme subdivisions (arrondissements,
// cantons) — le niveau 0 est l'union exacte des unités : frontière
// commune en un seul tracé, imbrication parfaite.
for (let i = 0; i < 8 && P.vue().type !== 'monde'; i++) P.retour();
clic('FR'); clic('FR'); charge('FR');
const dromVerif = P.vue();
test('v7.22 : les 5 régions ultrapériphériques sont GADM (src gadm partout, zéro ign)',
  dromVerif.type === 'admin' && dromVerif.niveau === 1
  && ['Guadeloupe','Martinique','Guyane française','La Réunion','Mayotte'].every(n =>
    dromVerif.parNom[n] && dromVerif.parNom[n].src === 'gadm')
  && (dromVerif.features || []).every(f => !f || f.src !== 'ign'));
clicZone('Guadeloupe');
test('v7.22 : descente Guadeloupe → 2 arrondissements GADM (Basse-Terre, Pointe-à-Pitre)',
  P.vue().type === 'admin' && P.vue().niveau === 2
  && (P.vue().features || []).filter(f => f && (f.id === 'Basse-Terre' || f.id === 'Pointe-à-Pitre')).length === 2
  && (P.vue().features || []).every(f => !f || f.src !== 'ign'));
clic('c-La Réunion');
test('v7.22 : ajout sœur « c-La Réunion » → ses 4 unités rejoignent la vue (même source, pavage exact)',
  (P.vue().features || []).filter(f => f && ['Saint-Benoît','Saint-Denis','Saint-Paul','Saint-Pierre'].indexOf(f.id) !== -1).length === 4);
P.retour(); // v7.24 : UNE seule pression saute la chaîne de bascules → vue régions
test('v7.24 : après bascules (ajout sœur), UNE pression retour → vue régions (Guadeloupe reste peinte)',
  P.vue().type === 'admin' && P.vue().niveau === 1);
clicZone('Mayotte');
test('v7.22 : descente Mayotte → 17 cantons GADM',
  P.vue().type === 'admin' && P.vue().niveau === 2
  && (P.vue().features || []).length >= 17
  && (P.vue().features || []).every(f => f && f.src !== 'ign'));

// 25. v7.23 — NIVEAU 3 COMPLET, UN SEUL CLIC PAR ÉTAPE (les données
// Occitanie/Bretagne « manquantes » du signalement n'étaient qu'un
// artefact du double clic/info-bulle : vérifié, arrondissements présents
// ET peints à l'écran, en 2 clics depuis la vue régions)
for (let i = 0; i < 8 && P.vue().type !== 'monde'; i++) P.retour();
clic('FR'); clic('FR'); charge('FR');
clic('Occitanie');
test('v7.23 : clic Occitanie (UN clic) → vue départements (niveau 2)',
  P.vue().type === 'admin' && P.vue().niveau === 2 && P.vue().parent === 'Occitanie');
clic('Hérault');
test('v7.23 : clic Hérault (UN clic, aucune info-bulle) → arrondissements niveau 3 (Béziers, Lodève, Montpellier)',
  P.vue().type === 'admin' && P.vue().niveau === 3 && SEL.descenteAttente() === false
  && (P.vue().features || []).filter(f => f && ['Béziers','Lodève','Montpellier'].indexOf(f.id) !== -1).length === 3);
const regs25 = (appels.regions || []).slice(-40).filter(r => r && r.name);
const par25 = {}; (appels.regions || []).forEach(r => { if (r && r.name) par25[r.name] = r; });
test('v7.23 : les 3 arrondissements de l Hérault sont TOUS peints (aucun trou blanc)',
  (P.vue().features || []).every(f => f && par25[f.id] && par25[f.id].itemStyle
    && par25[f.id].itemStyle.areaColor && par25[f.id].itemStyle.areaColor !== '#eaf2f8'));
for (let i = 0; i < 6 && P.vue().niveau > 1; i++) P.retour();
clic('Bretagne');
clic('Morbihan');
test('v7.23 : Bretagne → Morbihan en 2 clics simples → arrondissements niveau 3 présents et peints',
  (() => { const p25b = {}; (appels.regions || []).forEach(r => { if (r && r.name) p25b[r.name] = r; });
    return P.vue().type === 'admin' && P.vue().niveau === 3 && P.vue().parent === 'Morbihan'
    && (P.vue().features || []).length >= 3
    && (P.vue().features || []).every(f => f && p25b[f.id] && p25b[f.id].itemStyle
      && p25b[f.id].itemStyle.areaColor && p25b[f.id].itemStyle.areaColor !== '#eaf2f8'); })());

// 26. v7.24 — CHAÎNE DE BASCULES : le retour saute les ajouts/retraits,
// pas les descentes (bug « retour muet / vue qui change sans raison »)
for (let i = 0; i < 8 && P.vue().type !== 'monde'; i++) P.retour();
clic('FR'); clic('FR'); charge('FR');
clic('Corse');
clic('c-Hauts-de-France'); // ajout sœur (cadre __bascule)
clic('c-Hauts-de-France'); // retrait (cadre __bascule)
clic('c-Hauts-de-France'); // ré-ajout (cadre __bascule)
test('v7.24 : 3 bascules → vue combinée (7 features : Corse + HdF)',
  P.vue().type === 'admin' && P.vue().niveau === 2 && (P.vue().features || []).length === 7);
P.retour();
test('v7.24 : UNE pression retour saute TOUTE la chaîne de bascules ET la descente → vue RÉGIONS',
  P.vue().type === 'admin' && P.vue().niveau === 1
  && P.vue().nomMap.indexOf('+') === -1 && P.vue().nomMap.indexOf('~') === -1);
P.retour();
test('v7.24 : retour suivant → vue monde (pile cohérente)',
  P.vue().type === 'monde');

// 27. v7.25 — NIVEAU 3 COMPLÉTÉ POUR LES PAYS « SANS DESCENTE » : les
// compléments GADM (packages/n3-<ID>-k.js, manifest « n3 », chargés AVANT
// le package) remplissent niv2 des zones auparavant sans enfants.
for (let i = 0; i < 8 && P.vue().type !== 'monde'; i++) P.retour();
clic('CH'); clic('CH'); charge('CH');
test('v7.25 : Suisse — vue cantons apres chargement (niv1)', P.vue().type === 'admin' && P.vue().niveau === 1 && Object.keys(P.vue().parNom).length >= 26);
clic('Bern');
test('v7.25 : Suisse — clic canton « Bern » → DESCENTE vers ses districts (niveau 3, complément GADM)',
  P.vue().type === 'admin' && P.vue().niveau === 2 && (P.vue().features || []).length >= 5
  && (P.vue().features || []).every(f => !f || f.src !== 'ign'));
for (let i = 0; i < 6 && P.vue().type !== 'monde'; i++) P.retour();
clic('CH'); clic('CH'); charge('CH');
clic(Object.keys(P.vue().parNom)[0]);
const vCH2 = P.vue();
test('v7.25 : Suisse — n importe quel canton descend (complément complet)',
  vCH2.type === 'admin' && vCH2.niveau === 2 && (vCH2.features || []).length > 0);
for (let i = 0; i < 6 && P.vue().type !== 'monde'; i++) P.retour();
clic('UG'); clic('UG'); charge('UG');
test('v7.25 : Ouganda — vue districts chargee', P.vue().type === 'admin' && P.vue().niveau === 1);
clic(Object.keys(P.vue().parNom)[0]);
test('v7.25 : Ouganda — clic district → sous-comtés GADM (raccord spatial, noms différents du GADM)',
  P.vue().type === 'admin' && P.vue().niveau === 2 && (P.vue().features || []).length > 0);
for (let i = 0; i < 6 && P.vue().type !== 'monde'; i++) P.retour();


// 28. v7.26 — NIVEAU 4 COMPLÉTÉ : les compléments GADM (packages/n4-<ID>-k.js,
// manifest « n4 », chargés AVANT le package) remplissent les zones de niveau 3
// dépourvues d'enfants.
function vN4(id, paysNom) {
  for (let i = 0; i < 10 && P.vue().type !== 'monde'; i++) P.retour();
  clic(id); clic(id); charge(id);
  const v1 = P.vue();
  if (v1.type !== 'admin' || v1.niveau !== 1) { test('v7.26 : ' + paysNom + ' — vue niv1', false); return; }
  const zpays = P.vue().parNom;
  const nomsZones = Object.keys(zpays);
  let descendu = null, enfN4 = 0;
  for (const nz of nomsZones) {
    // descendre via clic puis vérifier les enfants de la zone de niveau 3
    clic(nz);
    if (P.vue().niveau === 2) {
      const v3 = P.vue();
      const nm3 = Object.keys(v3.parNom || {});
      if (nm3.length) {
        clic(nm3[0]);
        if (P.vue().type === 'admin' && P.vue().niveau >= 3 && (P.vue().features || []).length) { descendu = nz; enfN4 = (P.vue().features || []).length; }
        for (let i = 0; i < 3 && P.vue().type !== 'monde' && P.vue().parNom !== zpays; i++) P.retour();
      }
    } else break;
    for (let i = 0; i < 3 && P.vue().type !== 'monde' && P.vue().parNom !== zpays; i++) P.retour();
    if (descendu) break;
  }
  test('v7.26 : ' + paysNom + ' — descente au niveau 4 (complément GADM) via « ' + descendu + ' »',
    !!descendu && enfN4 > 0);
}
vN4('SN', 'Sénégal');
vN4('PE', 'Pérou');
vN4('LU', 'Luxembourg');
for (let i = 0; i < 10 && P.vue().type !== 'monde'; i++) P.retour();

// 29. v7.27 — FINITION NIVEAU 3 : 12 pays dont certaines zones restaient
// sans enfants alors que GADM les possède (Corée du Sud, Bruxelles, Phnom
// Penh, Zanzibar, Suriname, Samoa, Tonga…), + retrait des artefacts
// « COL+99? », « MEX+99? », « UNDOF ».
function vN27(id, paysNom, zoneCible, mini) {
  for (let i = 0; i < 10 && P.vue().type !== 'monde'; i++) P.retour();
  clic(id); clic(id); charge(id);
  const zp = P.vue().parNom || {};
  test('v7.27 : ' + paysNom + ' — la zone « ' + zoneCible + ' » a maintenant des enfants',
    !!(zp[zoneCible]));
  clic(zoneCible);
  test('v7.27 : ' + paysNom + ' — clic « ' + zoneCible + ' » → descente niveau 3 (complément GADM)',
    P.vue().type === 'admin' && P.vue().niveau === 2 && (P.vue().features || []).length >= mini);
  for (let i = 0; i < 4 && P.vue().type !== 'monde'; i++) P.retour();
}
vN27('KR', 'Corée du Sud', 'Séoul', 20);
vN27('BE', 'Belgique', 'Bruxelles-Capitale', 19);
vN27('SR', 'Suriname', 'Paramaribo', 10);
vN27('WS', 'Samoa', 'Tuamasaga', 2);
vN27('KH', 'Cambodge', 'Phnom Penh', 10);
for (let i = 0; i < 10 && P.vue().type !== 'monde'; i++) P.retour();
clic('CO'); clic('CO'); charge('CO');
test('v7.27 : Colombie — artefact « COL+99? » retiré (33 zones réelles, pas 34)',
  (P.vue().features || []).length === 33 && !P.vue().parNom['COL+99?']);
for (let i = 0; i < 4 && P.vue().type !== 'monde'; i++) P.retour();
clic('MX'); clic('MX'); charge('MX');
test('v7.27 : Mexique — artefact « MEX+99? » retiré', !P.vue().parNom['MEX+99?']);
for (let i = 0; i < 4 && P.vue().type !== 'monde'; i++) P.retour();
clic('SY'); clic('SY'); charge('SY');
test('v7.27 : Syrie — zone « UNDOF » retirée', !P.vue().parNom['UNDOF']);
// 30. v7.28 — ÉTATS-UNIS : SÉLECTIONS MULTIPLES aux niveaux 2 et 3.
// Bug v7.20 : la comparaison « occupant.__uniprov === e.__uniprov » entre
// deux undefined valait toujours vrai → le RENOMMAGE des homonymes était
// court-circuité → dès qu'UN comté du nouvel état portait un id déjà
// affiché (Humboldt en Californie ET au Nevada, « Washington », « Orange »…),
// ajouterSousVue rejetait TOUT l'ajout en silence. Symptômes réels :
// impossible de combiner plusieurs états (niveau 2), impossible d'ajouter
// les comtés d'un état (niveau 3) quand ceux d'un autre sont déjà affichés.
for (let i = 0; i < 30 && P.vue().type !== 'monde'; i++) P.retour();
clic('US'); clic('US'); charge('US');
test('v7.28 : US — vue niv1 (51 États) depuis la vue monde', P.vue().type === 'admin' && P.vue().niveau === 1 && (P.vue().features || []).length === 51);

// (a) sélection multiple de N2 au Maj+clic (états)
clicMaj('California'); clicMaj('Texas'); clicMaj('Oregon');
test('v7.28 : US — Maj+clic ×3 → sélection multiple de N2 (3 états)',
  (P.etat.selections || []).length === 3
    && P.etat.selections.indexOf('2:USA\u00A4\u00A4California') !== -1
    && P.etat.selections.indexOf('2:USA\u00A4\u00A4Texas') !== -1
    && P.etat.selections.indexOf('2:USA\u00A4\u00A4Oregon') !== -1);
clicMaj('California'); // bascule retrait
test('v7.28 : US — Maj+clic sur un état sélectionné → retrait (bascule)',
  (P.etat.selections || []).length === 2 && P.etat.selections.indexOf('2:USA\u00A4\u00A4California') === -1);

// (b) descente dans un état → comtés ; les comtés d'un AUTRE état
// rejoignent la vue au clic simple sur sa sœur (v7.19) — homonymes
// renommés (California a un comté « Humboldt », le Nevada aussi)
clic('California');
const vUS3 = P.vue();
test('v7.28 : US — clic Californie → comtés (niveau 3, 58)',
  vUS3.type === 'admin' && vUS3.niveau === 2 && (vUS3.features || []).length === 58);
const nbAvant = (P.vue().features || []).length;
clic('c-Texas');
test('v7.28 : US — clic sœur Texas → comtés du Texas AJOUTÉS (homonymes renommés, 58+N)',
  (P.vue().features || []).length > nbAvant + 200);
const nbApresTx = (P.vue().features || []).length;
clic('c-Nevada');
test('v7.28 : US — 2e ajout (Nevada, comté Humboldt homonyme) réussi sous le 1er',
  (P.vue().features || []).length > nbApresTx + 10);
// (c) bascule retrait : re-cliquer la sœur ajoutée retire SES comtés
const nbAvantRetrait = (P.vue().features || []).length;
clic('c-Nevada');
test('v7.28 : US — re-clic sœur Nevada → retrait de ses comtés (bascule)',
  (P.vue().features || []).length < nbAvantRetrait
  && P.etat.selections.indexOf('c-Nevada') === -1 && P.etat.selections.indexOf('2:USA\u00A4\u00A4Nevada') === -1);
// (d) Maj+clic sur une sœur : même ajout (v0.52)
const nbAvantMaj = (P.vue().features || []).length;
clicMaj('c-Oregon');
test('v7.28 : US — Maj+clic sœur Oregon → comtés ajoutés',
  (P.vue().features || []).length > nbAvantMaj + 10);
for (let i = 0; i < 10 && P.vue().type !== 'monde'; i++) P.retour();

// 31. v7.29 — SURVOL ET SÉLECTION : une zone Maj+sélectionnée (le clic
// survollant forcément la zone) ne doit PAS retomber en teinte de repos
// quand le pointeur la quitte. Bug : cacherRegions refusait de cacher la
// zone survolée (couleur présumée « de survol ») → au mouseout, repaintSurvol
// repeignait avec l'ANCIENNE teinte de repos ; la sélection « disparaissait ».
{
  clic('US'); clic('US'); charge('US');
  clic('California');
  const zonePrem = (P.vue().features || [])[0].id;
  (appels.events.mouseover || []).forEach(f => f({ componentType: 'series', seriesType: 'map', name: zonePrem }));
  clicMaj(zonePrem);
  (appels.events.mouseout || []).forEach(f => f({ componentType: 'series', seriesType: 'map', name: zonePrem }));
  const regsV29 = appels.regions || [];
  const rV29 = regsV29.find(r => r && r.name === zonePrem);
  const tonSelV29 = P.selectionnes[P.parId.US.continent];
  test('v7.29 : zone Maj+sélectionnée puis quittée par le pointeur → RESTE en teinte sélection',
    !!(rV29 && rV29.itemStyle && rV29.itemStyle.areaColor === tonSelV29));
  for (let i = 0; i < 10 && P.vue().type !== 'monde'; i++) P.retour();

  // 32. v7.29 — HOMONYMES INTER-NIVEAUX : le comté « Washington » (Texas)
  // ne doit PAS « descendre » dans les comtés de l'ÉTAT Washington ni
  // déclencher une demande hors chaîne (le fameux « charger les 99 zones
  // de l'Iowa » en cliquant Washington). Garde : les enfants doivent
  // recouvrir la zone cliquée (intersection des bboxes).
  clic('US'); clic('US'); charge('US');
  clic('Texas');
  const nAvantW = (P.vue().features || []).length;
  test('v7.29 : vue comtés du Texas (254, dont comté Washington)', nAvantW > 250 && !!P.vue().parNom['Washington']);
  clic('Washington');
  test('v7.29 : clic comté « Washington » (homonyme de l état) → AUCUNE fausse descente',
    P.vue().niveau === 2 && (P.vue().features || []).length === nAvantW && P.vue().parent === 'Texas');
  // une vraie descente légitime passe toujours (un autre comté réel du Texas
  // n a pas d enfants : rien ne se charge — vérifié par la vue inchangée)
  clic('Harris');
  test('v7.29 : clic comté sans enfants (Harris) → vue inchangée (fin de chaîne propre)',
    P.vue().niveau === 2 && (P.vue().features || []).length === nAvantW);
  for (let i = 0; i < 10 && P.vue().type !== 'monde'; i++) P.retour();

  // 33. v7.29 — GÉOMÉTRIE Douglas/Sarpy (Nebraska) : frontière réparée.
  clic('US'); clic('US'); charge('US');
  clic('Nebraska');
  const dV = P.vue().parNom && P.vue().parNom['Douglas'];
  const sV = P.vue().parNom && P.vue().parNom['Sarpy'];
  const dVerts = dV ? (dV.geometry.type === 'Polygon' ? dV.geometry.coordinates[0].length : dV.geometry.coordinates[0][0].length) : 0;
  const sPolys = sV ? (sV.geometry.type === 'MultiPolygon' ? sV.geometry.coordinates.length : 1) : 0;
  test('v7.29 : Douglas (Nebraska) — le sommet intermédiaire de Sarpy est INSÉRÉ (13 sommets)',
    dVerts === 13);
  test('v7.29 : Sarpy — le triangle-fantôme est RETIRÉ (1 seul polygone)',
    sPolys === 1);
  // 34. v7.29 — CORRECTIF 00c-survol/US : le fragment 00c-us-frontieres
  // répare AU MOMENT de l enregistrement la version NON réparée de
  // packages/US.js encore déployée (Douglas 12 sommets, Sarpy
  // 2 polygones). C est le chemin réel d un navigateur fraîchement
  // mis à jour sur un cache HTTP périmé.
  const dAv = [[-96.454,41.39],[-96.329,41.393],[-95.94170427753453,41.39407645671943],[-95.958,41.338],[-95.87,41.309],[-95.917,41.266],[-95.924,41.208],[-95.90749381698268,41.20056059356966],[-96.308,41.181],[-96.356,41.236],[-96.362,41.297],[-96.454,41.39]];
  const sMain = [[-96.308,41.181],[-95.89556488046168,41.19518417147568],[-95.853,41.176],[-95.876,41.167],[-95.862,41.106],[-95.882,41.065],[-95.87438118811882,41.05568811881188],[-95.906,41.063],[-96.047,41.065],[-96.212,41.009],[-96.285,41.041],[-96.307,41.07],[-96.314,41.106],[-96.308,41.181]];
  const sTri = [[-96.308,41.181],[-95.89556,41.19518],[-95.90749,41.20056],[-96.308,41.181]];
  const donneesAv = { id: 'US-TEST', a3: 'ZZ729', niv1: [], niv2: { Nebraska: [
    { id: 'Douglas', nom: 'Douglas', geometry: { type: 'Polygon', coordinates: [dAv] } },
    { id: 'Sarpy', nom: 'Sarpy', geometry: { type: 'MultiPolygon', coordinates: [sMain, sTri] } },
  ] } };
  try { ctx.window.__PR2_PKG_REG('US', donneesAv); } catch (eReg) { }
  test('v7.29 : correctif 00c — Douglas PRÉ-v7.29 (12 sommets) → sommet Sarpy inséré (13)',
    dAv.length === 13 && Math.abs(dAv[8][0] + 95.89556488046168) < 1e-9 && Math.abs(dAv[8][1] - 41.19518417147568) < 1e-9);
  test('v7.29 : correctif 00c — Sarpy PRÉ-v7.29 (2 polygones) → triangle retiré (1)',
    donneesAv.niv2.Nebraska[1].geometry.coordinates.length === 1);
  for (let i = 0; i < 10 && P.vue().type !== 'monde'; i++) P.retour();
}

// 35. v7.30 — SÉLECTION QUALIFIÉE « 2:a3¤parent¤nom » : les HOMONYMES
// entre niveaux (comté Washington du TEXAS vs ÉTAT Washington) ne
// partagent plus leur entrée de sélection ; le retour ne peint jamais
// l'homonyme de l'autre niveau (FANTÔME ÉLIMINÉ).
{
  for (let i = 0; i < 10 && P.vue().type !== 'monde'; i++) P.retour();
  clic('US'); clic('US'); charge('US');
  test('v7.30 : étampage des comtés (ex. Texas) — __a3 et __parent posés à l enregistrement',
    (() => { const f = (P.vue().features || []).filter(x => x && x.id === 'Texas')[0];
      const enf = f && P.enfantsDe && P.enfantsDe('Texas');
      return !!enf && enf.length > 200 && enf.every(function (z) { return z && z.__a3 === 'USA' && z.__parent === 'Texas'; }); })());
  clic('Texas');
  test('v7.30 : descente Texas → comtés (niveau 3)', P.vue().type === 'admin' && P.vue().niveau === 2 && P.vue().parent === 'Texas');
  clicMaj('Washington'); // le COMTÉ Washington du TEXAS
  test('v7.30 : Maj+clic comté Washington (Texas) → clef qualifiée avec parent 2:USA¤Texas¤Washington',
    (P.etat.selections || []).indexOf('2:USA\u00A4Texas\u00A4Washington') !== -1);
  // retrait par bascule, puis re-ajout pour la suite
  clicMaj('Washington');
  test('v7.30 : re-Maj+clic → la clef qualifiée est retirée',
    (P.etat.selections || []).indexOf('2:USA\u00A4Texas\u00A4Washington') === -1);
  clicMaj('Washington'); // re-ajout : la sélection doit survivre au retour
  P.retour();
  test('v7.30 : retour UNIQUE → vue états (Washington = l ÉTAT, sans __parent)',
    (() => { const v = P.vue(); return v.type === 'admin' && v.niveau === 1
      && (v.features || []).some(function (f) { return f && f.id === 'Washington' && !f.__parent; }); })());
  test('v7.30 : FANTÔME ÉLIMINÉ — la clef du COMTÉ ne peint pas l ÉTAT Washington',
    (() => { const ens = P.ensembleSelection();
      return ens['Washington'] === undefined && ens['c-Washington'] === undefined; })());
  test('v7.30 : après retour, plus AUCUNE trace de Washington (le comté cliqué sous la descente appartient au cadre dépassé)',
    (P.etat.selections || []).every(function (x) { return typeof x !== 'string' || x.indexOf('Washington') === -1; }));
  test('v7.30 journal : machine à états — chaque mutation est tracée (op, version)',
    (() => { const j = P.selJournal(); return j.length > 0
      && j.every(function (x) { return x && x.op && typeof x.v === 'number' && x.v >= 1
        && x.avant != null && x.apres != null; }); })());
  clicMaj('Washington'); // l ÉTAT Washington, en vue états
  test('v7.30 : Maj+clic l ÉTAT Washington → clef qualifiée SANS parent 2:USA¤¤Washington',
    (P.etat.selections || []).indexOf('2:USA\u00A4\u00A4Washington') !== -1);
  for (let i = 0; i < 10 && P.vue().type !== 'monde'; i++) P.retour();
}
console.log('\nTOTAL : ' + ok + ' OK / ' + ko.length + ' KO' + (ko.length ? ' → ' + ko.join(' | ') : ''));
process.exit(ko.length ? 1 : 0);
