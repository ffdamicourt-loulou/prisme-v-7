// harnais-apparence.cjs — Prisme 6 : simule le boot depuis les FICHIERS du dossier
// (js/core + couche comprehension + greffon, données data/). Usage :
//   node tests/harnais-apparence.cjs [dossierRacine] [fichierThemeCss]
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const RAC = process.argv[2] || path.join(__dirname, '..');
const CSS = process.argv[3] || path.join(RAC, 'css', 'theme.css');
const CORE = ['00-const','00b-droms','01-styles-couleurs','02-geo-ancres','03-etat-monde','04-frontieres',
  '05-sigles','06-peinture-regions','07-villes','08-etiquettes-zones','09-villes-continents',
  '10-options','11-survol-repaint','12-camera-cadrage','13-enclaves-outils',
  '14-vues-enregistrement','15-navigation','16-groupes-selection','17-demarrage'];

// ---- code concaténé (IIFE unique : ordre strict)
const appCore = CORE.map(n => fs.readFileSync(path.join(RAC, 'js/core', n + '.js'), 'utf8')).join('\n');
const comprehension = fs.readFileSync(path.join(RAC, 'js/app/couche-comprehension.js'), 'utf8');
const greffon = fs.readFileSync(path.join(RAC, 'js/app/greffon-pays.js'), 'utf8');
const appSrc = appCore + '\n' + comprehension + '\n' + greffon;
new vm.Script(appSrc, { filename: 'app-concat.js' }); // équivalent node --check
console.log('code concaténé : core=' + appCore.length + ' + compréhension=' + comprehension.length + ' + greffon=' + greffon.length + ' octets — syntaxe OK');

// ---- données
const DATA = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(RAC, 'data/monde.json.gz'))).toString());
const ADMIN = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(RAC, 'data/admin.json.gz'))).toString());
const coul = JSON.parse(fs.readFileSync(path.join(RAC, 'data/couleurs-continents.json'), 'utf8'));
const pkgsMan = JSON.parse(fs.readFileSync(path.join(RAC, 'data/manifest-pays.json'), 'utf8'));
console.log('données : pays=' + DATA.pays.length + ' · teintes=' + Object.keys(coul).length + ' · manifest pays=' + Object.keys(pkgsMan.pays).length);

// ---- thème : lecture des variables CSS (même logique que chargeur-theme.js)
const cssTxt = fs.readFileSync(CSS, 'utf8');
function lit(nom) {
  const m = cssTxt.match(new RegExp('--pr-' + nom + ':\\s*([^;]*);'));
  return m ? m[1].trim() : '';
}
const THEME = {};
const fond = lit('fond'); if (fond) THEME.fond = fond;
const pays = lit('pays'); if (pays) THEME.pays = pays;
const survol = lit('survol'); if (survol) THEME.survol = survol;
const contour = lit('contour'); if (contour) THEME.contour = contour;
const texte = lit('texte'); if (texte) THEME.texte = texte;
const tSurvol = lit('texte-survol'); if (tSurvol) THEME.texteSurvol = tSurvol;
const trait = parseFloat(lit('trait')); if (isFinite(trait) && trait > 0) THEME.traitNiveaux = trait;
const oC = lit('ombre-couleur');
if (oC) THEME.ombre = { couleur: oC, dx: parseFloat(lit('ombre-x')) || 0, dy: parseFloat(lit('ombre-y')) || 0, flou: parseFloat(lit('ombre-flou')) || 0 };
console.log('thème lu (' + path.basename(CSS) + ') : ' + JSON.stringify(THEME));

// ---- faux ECharts / DOM
const appels = { setOption: [], events: {} };
let derniereComplete = null;
const fauxEcharts = {
  registerMap: () => {},
  init: () => ({
    setOption: (o) => { appels.setOption.push('setOption'); if (o && o.series && o.geo && o.geo.map) derniereComplete = o; },
    getOption: () => ({}),
    on: (ev, fn) => { (appels.events[ev] = appels.events[ev] || []).push(fn); },
    convertToPixel: (f, c) => [c[0] * 2, -c[1] * 2],
    convertFromPixel: (f, p) => [p[0] / 2, -p[1] / 2],
    getWidth: () => 800, getHeight: () => 600, dispatchAction: () => {}, resize: () => {},
  }),
};
function el(id) { return { id, style: {}, innerHTML: '', textContent: '', children: [], appendChild(c) { this.children.push(c); }, addEventListener: () => {} }; }
const fauxDocument = { getElementById: (id) => el(id), createElement: () => el('script'), body: el('body') };
const ctx = {
  window: { addEventListener: () => {}, __PR2_COMPLET: 'v0.210', __PR2_THEME: THEME },
  document: fauxDocument, echarts: fauxEcharts,
  setTimeout: (fn) => { fn(); return 1; }, clearTimeout: () => {}, console,
};
ctx.window.window = ctx.window;
vm.createContext(ctx);
try {
  vm.runInContext('window.__PR2_DATA = ' + JSON.stringify(DATA)
    + ';\nwindow.__PR2_ADMIN = ' + JSON.stringify(ADMIN)
    + ';\nwindow.__PR2_COULEURS = ' + JSON.stringify(coul)
    + ';\nwindow.__PR2_PKGS = ' + JSON.stringify({ base: '', manifest: pkgsMan }) + ';\n', ctx, { filename: 'boot.js' });
  vm.runInContext(appCore, ctx, { filename: 'core.js' });
  vm.runInContext(comprehension, ctx, { filename: 'comprehension.js' });
  vm.runInContext(greffon, ctx, { filename: 'greffon.js' });
} catch (e) {
  console.error('EXCEPTION au chargement :', e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e.message);
  process.exit(1);
}
console.log('CHARGEMENT OK — setOption=' + appels.setOption.length + ' · events=' + Object.keys(appels.events).join(','));

const P = ctx.window.__PR2;
let ok = 0, ko = [];
const test = (n, c) => { if (c) ok++; else ko.push(n); console.log((c ? 'OK  ' : 'KO   ') + n); };

// ---- références dérivées du thème
test('thème appliqué : fond=' + THEME.fond, P && ctx.window.__PR2_THEME.fond === THEME.fond);

const zstyle = (derniereComplete && derniereComplete.geo.regions || []).map(r => r.itemStyle).filter(Boolean);
test('monde peint (option complète)', !!derniereComplete && zstyle.length > 100);
if (derniereComplete) {
  test('fond de carte ' + THEME.fond, derniereComplete.backgroundColor === THEME.fond);
  test('filet ' + (THEME.traitNiveaux || 0.6) + 'px au repos', zstyle.every(s => s.borderWidth === (THEME.traitNiveaux || 0.6)));
  test('contour ' + (THEME.contour || '#ffffff'), zstyle.every(s => s.borderColor === (THEME.contour || '#ffffff')));
  const couleurZones = THEME.pays || Object.values(coul)[0];
  test('Europe teinte prisme 4 #2e5479 présente', THEME.pays ? true : zstyle.some(s => s.areaColor === '#2e5479'));
  test('zones peintes (' + (THEME.pays ? 'thème' : 'teintes continents') + ')', THEME.pays ? zstyle.every(s => s.areaColor === THEME.pays) : zstyle.some(s => s.areaColor === coul['150']));
  if (THEME.ombre) test('ombre dx=' + THEME.ombre.dx + ' flou=' + THEME.ombre.flou, zstyle.every(s => s.shadowColor === THEME.ombre.couleur && s.shadowOffsetX === THEME.ombre.dx && s.shadowBlur === THEME.ombre.flou));
  else test('pas d\u2019ombre (clair)', zstyle.every(s => !s.shadowColor || s.shadowColor === 'rgba(0,0,0,0)'));
}

// ---- survol FR : zone + étiquette
(function () {
  const c = P.carte();
  const orig = c.setOption.bind(c);
  let capReg = null, capEtq = null, capReg2 = null, capEtq2 = null;
  c.setOption = (o) => { if (o && o.geo && o.geo.regions) capReg = o.geo.regions; if (o && o.series) capEtq = o.series[0] && o.series[0].data; orig(o); };
  appels.events.mouseout.forEach(f => f({ componentType: 'series', seriesType: 'map', name: 'FR' }));
  appels.events.mouseover.forEach(f => f({ componentType: 'series', seriesType: 'map', name: 'FR' }));
  const survAttendu = THEME.survol || null;
  const fr = (capReg || []).filter(r => r && String(r.name).replace(/^[cx]-/, '') === 'FR');
  test('survol : zone FR modifiée' + (survAttendu ? ' (' + survAttendu + ')' : ''), fr.length === 1 && fr[0].itemStyle && (!survAttendu || fr[0].itemStyle.areaColor === survAttendu));
  if (capEtq) {
    const ts = THEME.texteSurvol || '#000000';
    const sur = capEtq.filter(d => d && d.label && d.label.color === ts);
    const autres = THEME.texte ? capEtq.filter(d => d && d.label && d.label.color === THEME.texte) : capEtq.filter(d => d && d.label && d.label.color && d.label.color !== ts);
    test('survol FR : texte ' + ts + ' (' + sur.length + '/' + autres.length + ')', sur.length >= 1 && autres.length >= 100);
  } else test('survol : étiquettes capturées', false);
  c.setOption = (o) => { if (o && o.geo && o.geo.regions) capReg2 = o.geo.regions; if (o && o.series) capEtq2 = o.series[0] && o.series[0].data; orig(o); };
  appels.events.mouseout.forEach(f => f({ componentType: 'series', seriesType: 'map', name: 'FR' }));
  if (capEtq2) test('sortie de survol : pas de texte ' + (THEME.texteSurvol || '#000000') + ' restant', capEtq2.filter(d => d && d.label && d.label.color === (THEME.texteSurvol || '#000000')).length === 0);
})();

console.log('\nTOTAL : ' + ok + ' OK / ' + ko.length + ' KO' + (ko.length ? ' → ' + ko.join(' | ') : ''));
process.exit(ko.length ? 1 : 0);
