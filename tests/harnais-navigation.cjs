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
const test = (n, c) => { if (c) ok++; else ko.push(n); console.log((c ? 'OK  ' : 'KO  ') + n); };

const clic = (name) => (appels.events.click || []).forEach(f => f({ componentType: 'series', seriesType: 'map', name }));
// v7.8 : clic zone + confirmation automatique si la validation n2→n3 s'ouvre
const SELAjax = () => ctx.window.__PR2_SEL;
const clicZone = (name) => {
  clic(name);
  const SEL = ctx.window.__PR2_SEL;
  if (SEL && SEL.descenteAttente && SEL.descenteAttente()) SEL.confirmerDescente();
};
const charge = (id) => {
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

// 14. v7.8 — VALIDATION n2→n3 par info-bulle (bloqué jusqu'à confirmation)
for (let i = 0; i < 8 && P.vue().type !== 'monde'; i++) P.retour();
clic('FR'); clic('FR'); charge('FR');
const SEL = ctx.window.__PR2_SEL;
clic('Auvergne-Rhône-Alpes'); // SANS confirmer : la descente doit être BLOQUÉE
test('v7.8 : clic région (n2→n3 utilisateur) BLOQUÉ tant que l\'info-bulle attend la validation',
  P.vue().niveau === 1 && SEL.descenteAttente() === true);
test('v7.8 : info-bulle de validation affichée (prisme2-validation)',
  SEL.descenteAttente() === true && SEL.infoBulleOuverte() === true);
SEL.confirmerDescente();
test('v7.8 : confirmation → descente effective au niveau suivant, info-bulle fermée',
  P.vue().type === 'admin' && P.vue().niveau === 2 && SEL.descenteAttente() === false);

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
  const selDE = (P.etat.selections || []);
  test('v7.10 : Maj+clic DE avec enveloppe NICHÉE → DE sélectionné, FR AJOUTÉ au groupe',
    P.etat.selection === 'DE' && selDE.indexOf('FR') !== -1);
  // (b) un clic NOMMÉ pose le drapeau : le zr correspondant ne déselectionne RIEN
  clicBrut({ componentType: 'series', seriesType: 'map', name: 'socle' });
  SEL10.zrClic();
  test('v7.10 : clic sur zone nommée puis zrClic → RIEN n\'est déselectionné',
    (P.etat.selection !== null && P.etat.selection !== undefined)
    || (P.etat.selections || []).length > 0);
  // (c) clic « vide » (zr SANS zone) → tout déselectionné, vue conservée
  SEL10.zrClic();
  test('v7.10 : clic VIDE (zrender, sans zone) → tout déselectionné',
    !P.etat.selection && (P.etat.selections || []).length === 0);
} else { test('v7.10 : gestionnaire unique exporté (traiteClic/touche/zrClic)', false); }

// 18. v7.13 — tailles des NOMS/CODES de pays : +30 % entre zoom 5× et 40×.
P.etat.zoom = 20; P.majEtiquettes();
const tPx13 = P.tailles(20).etiquette;
const boost13 = Math.max(7, Math.round(Math.min(16, 8 * Math.sqrt(20) + 3) * 1.3));
test('v7.13 : noms de pays ×1,3 au zoom 20 (attendu ' + boost13 + ' px, base ' + tPx13 + ')',
  (appels.etiquettes || []).some(t2 => t2 && t2.label && t2.label.fontSize === boost13));
P.etat.zoom = 45; P.majEtiquettes();
test('v7.13 : hors plage (zoom 45) → tailles de pays INCHANGÉES (' + tPx13 + ' px)',
  (appels.etiquettes || []).some(t2 => t2 && t2.label && t2.label.fontSize === tPx13));

console.log('\nTOTAL : ' + ok + ' OK / ' + ko.length + ' KO' + (ko.length ? ' → ' + ko.join(' | ') : ''));
process.exit(ko.length ? 1 : 0);
