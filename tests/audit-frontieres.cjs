// audit-frontieres.cjs — contrôle qualité géométrique des packages pays Prisme.
// Pur node (aucune dépendance, npm interdit). Usage :
//   node tests/audit-frontieres.cjs [racine] [--DETAILS]
//
// Philosophie : on ne signale PAS ce qui est de la vraie géographie
// (provinces allongées comme le corridor de Wakhan, îles, anneaux laissés
// ouverts par convention du format). On signale ce qui ressemble à un
// DÉFAUT DE GÉNÉRATION, résolu au niveau ZONE (agrégation des polygones) :
//   D1 POLYGONE-FRAG SUSPECT : un polygone dont l aire < 5 % de l aire
//      totale de la zone ET dont l indice d allongement périmètre²/(4π·aire)
//      dépasse 25 (la rustine-triangle Sarpy : 0,5 % du comté, indice 46 ;
//      une vraie petite île est compacte, indice faible, non signalée) ;
//   D2 ANNEAU DÉGÉNÉRÉ : moins de 4 sommets (segment, point) ;
//   D3 AIRE NULLE : polygone plat (lacet = 0) ;
//   D4 SOMMETS CONSÉCUTIFS DUPLIQUÉS (un sommet répété colla à lui-même) ;
//   D5 ZONE SANS GÉOMÉTRIE ou type inconnu ;
//   D6 FICHIER QUI NE S ÉVALUE PAS dans un contexte-browser minimal.
// Convention (non signalée, mais comptée en information) :
//   C1 anneau non refermé (premier sommet ≠ dernier) — toléré par le rendu.
// Sortie : anomalies par package + TOTAL global, exit 1 si anomalie.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAC = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(__dirname, '..');
const DETAILS = process.argv.includes('--DETAILS');
const DIR = path.join(RAC, 'packages');

const anomalies = [];
const infos = { C1: 0 };
function anomalie(fichier, idZone, code, msg) { anomalies.push({ fichier: fichier, zone: idZone, code: code, msg: msg }); }

// --- une géométrie → liste plate de polygones [{ring, aire}]
function geometrieVersPolys(geom) {
  const polys = [];
  if (!geom) return polys;
  if (geom.type === 'Polygon') (geom.coordinates || []).forEach(r => polys.push(r));
  else if (geom.type === 'MultiPolygon') (geom.coordinates || []).forEach(p => p.forEach(r => polys.push(r)));
  else if (geom.type === 'LineString' || (geom.coordinates && !geom.type)) return polys; // silencieux
  return polys;
}
function aireAnneau(ring) {
  let a = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return Math.abs(a / 2);
}
function perimetreAnneau(ring) {
  let p = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) {
    const dx = ring[i + 1][0] - ring[i][0], dy = ring[i + 1][1] - ring[i][1];
    p += Math.sqrt(dx * dx + dy * dy);
  }
  return p;
}

function verifieZone(fichier, idZone, geom) {
  if (!geom || !geom.type) { anomalie(fichier, idZone, 'D5', 'zone sans géométrie'); return; }
  if (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') { anomalie(fichier, idZone, 'D5', 'type inconnu : ' + geom.type); return; }
  const polys = geometrieVersPolys(geom);
  if (!polys.length) { anomalie(fichier, idZone, 'D5', 'géométrie sans coordonnées'); return; }
  const aires = [];
  for (const ring of polys) {
    if (!Array.isArray(ring) || ring.length === 0) { anomalie(fichier, idZone, 'D2', 'anneau vide'); aires.push(0); continue; }
    if (ring.length < 4) anomalie(fichier, idZone, 'D2', 'anneau dégénéré (' + ring.length + ' sommets)');
    const p0 = ring[0], pN = ring[ring.length - 1];
    if (Math.abs(p0[0] - pN[0]) > 1e-9 || Math.abs(p0[1] - pN[1]) > 1e-9) infos.C1++;
    for (let i = 0; i < ring.length - 1; i++) {
      if (ring[i][0] === ring[i + 1][0] && ring[i][1] === ring[i + 1][1]) { anomalie(fichier, idZone, 'D4', 'sommets consécutifs identiques'); break; }
    }
    const a = aireAnneau(ring);
    if (a === 0) anomalie(fichier, idZone, 'D3', 'aire nulle (polygone plat)');
    aires.push(a);
  }
  // D1 : polygone-frag suspendu à une zone plus grande (rustine de
  // génération : petit ET allongé ; une île compacte n est pas signalée).
  const total = aires.reduce((x, y) => x + y, 0);
  if (polys.length > 1 && total > 0) {
    aires.forEach((a, idx) => {
      if (a === 0 || a / total >= 0.05) return;
      const per = perimetreAnneau(polys[idx]);
      const sliver = (per * per) / (4 * Math.PI * a);
      if (sliver > 25) {
        anomalie(fichier, idZone, 'D1', 'polygone n°' + (idx + 1) + ' : frag suspect (' + (100 * a / total).toFixed(2) + ' % de la zone, allongement ' + Math.round(sliver) + ')');
      }
    });
  }
}

function verifieDonnees(fichier, donnees, stats) {
  (donnees.niv1 || []).forEach(z => { stats.zones++; verifieZone(fichier, ((z && (z.id || z.nom)) || '?'), z && z.geometry); });
  Object.keys(donnees.niv2 || {}).forEach(parent => {
    const arr = (donnees.niv2 || {})[parent];
    if (!Array.isArray(arr)) return;
    arr.forEach(z => { stats.zones++; verifieZone(fichier, parent + '/' + ((z && (z.id || z.nom)) || '?'), z && z.geometry); });
  });
}

// Bouchon browser minimal : les fragments n3/n4 écrivent
// window.__PR2_NIV3X['VEN'][...]=... → Proxy auto-créant les maps par pays.
function autoMap() { return new Proxy({}, { get(t, k) { if (typeof k !== 'string') return undefined; if (!(k in t)) t[k] = {}; return t[k]; } }); }

const fichiers = fs.readdirSync(DIR).filter(f => f.endsWith('.js')).sort();
let totalZones = 0, pkgsOk = 0, pkgsKo = 0;
for (const f of fichiers) {
  const code = fs.readFileSync(path.join(DIR, f), 'utf8');
  const captures = [];
  const win = { __PR2_PKG_REG: (id, d) => { captures.push(d); }, __PR2_NIV3X: autoMap(), __PR2_NIV4X: autoMap() };
  win.window = win;
  const ctxx = { window: win, console: { log: () => {} } };
  try { vm.createContext(ctxx); vm.runInContext(code, ctxx, { filename: f }); }
  catch (e) { anomalies.push({ fichier: f, zone: '-', code: 'D6', msg: 'ERREUR d évaluation : ' + e.message }); }
  const stats = { zones: 0 };
  captures.forEach(d => verifieDonnees(f, d || {}, stats));
  // fragments n3/n4 : les compléments sont des maps parent->[zones]
  [['__PR2_NIV3X', 3], ['__PR2_NIV4X', 4]].forEach(([k]) => {
    const m = win[k] || {};
    Object.keys(m).forEach(pays => {
      const o = m[pays] || {};
      Object.keys(o).forEach(parent => {
        const arr = o[parent];
        if (!Array.isArray(arr)) return;
        arr.forEach(z => { stats.zones++; verifieZone(f, pays + '/' + parent + '/' + ((z && (z.id || z.nom)) || '?'), z && z.geometry); });
      });
    });
  });
  totalZones += stats.zones;
  if (anomalies.filter(a => a.fichier === f).length) pkgsKo++; else pkgsOk++;
}

const parF = {};
anomalies.forEach(a => { (parF[a.fichier] = parF[a.fichier] || []).push(a); });
Object.keys(parF).sort().forEach(f => {
  console.log('\n== ' + f + ' : ' + parF[f].length + ' anomalie(s)');
  parF[f].slice(0, 10).forEach(a => console.log('   [' + a.code + '] ' + a.zone + ' — ' + a.msg));
  if (parF[f].length > 10) console.log('   … + ' + (parF[f].length - 10) + ' (relancer avec --DETAILS)');
  if (DETAILS) parF[f].slice(10).forEach(a => console.log('   [' + a.code + '] ' + a.zone + ' — ' + a.msg));
});
const parCode = {};
let parCodePrinc = {}, parCodeComp = {};
anomalies.forEach(a => { parCode[a.code] = (parCode[a.code] || 0) + 1; const c = /^n[34]-/.test(a.fichier) ? parCodeComp : parCodePrinc; c[a.code] = (c[a.code] || 0) + 1; });
function ligne(c, lbl) { return lbl + ' : ' + (Object.keys(c).map(k => k + '=' + c[k]).join(' ') || 'aucune'); }
console.log('\nTOTAL : ' + fichiers.length + ' fichiers audités, ' + totalZones + ' zones, ' + pkgsOk + ' packages sains / ' + pkgsKo + ' avec anomalies, ' + anomalies.length + ' anomalies.');
console.log('Convention (tolérée, non signalée) : anneaux non refermés = ' + infos.C1 + '.');
console.log(ligne(parCodePrinc, 'Packages PRINCIPAUX (XX.js) '));
console.log(ligne(parCodeComp, 'Compléments n3/n4 (GADM simplifié)'));
process.exit(anomalies.length ? 1 : 0);
