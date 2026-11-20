// Prisme 6 — démarrage : charge les données puis le code, dans l'ordre.
// Ordre strict imposé par le noyau (une seule IIFE répartie sur
// js/core/00-17) : tous les fragments core sont concaténés puis injectés
// en UN seul <script> ; viennent ensuite la couche compréhension et le
// greffon pays.
(function () {
  'use strict';
  var CORE = [
    '00-const', '01-styles-couleurs', '02-geo-ancres', '03-etat-monde',
    '04-frontieres', '05-sigles', '06-peinture-regions', '07-villes',
    '08-etiquettes-zones', '09-villes-continents', '10-options',
    '11-survol-repaint', '12-camera-cadrage', '13-enclaves-outils',
    '14-vues-enregistrement', '15-navigation', '16-groupes-selection',
    '17-demarrage'
  ];
  function bandeau(msg) {
    var b = document.getElementById('prisme2-bandeau');
    if (b) b.innerHTML = 'Prisme 6 <b>· ERREUR — ' + String(msg).replace(/</g, '&lt;') + '</b>';
  }
  window.addEventListener('error', function (e) {
    bandeau((e && e.message ? e.message : e) + (e && e.filename ? ' (' + e.filename.split('/').pop() + ':' + e.lineno + ')' : ''));
  });
  function fetchGz(url) {
    return fetch(cb(url))
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' sur ' + url); return r.arrayBuffer(); })
      .then(function (buf) {
        return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
      })
      .then(function (txt) { return JSON.parse(txt); });
  }
  // v7.3 : ANTI-CACHE — chaque chargement (core, app, données, manifest)
  // porte l'identifiant de version en paramètre : un navigateur qui garde
  // un ancien js en cache HTTP ne peut plus JAMAIS exécuter un noyau périmé
  // mêlé aux nouveaux fragments (cause de bugs fantômes : menu doublé,
  // niveaux de descente incohérents entre deux versions du code).
  var BUILD = window.__PR2_VBUILD || 'dev';
  function cb(url) { return url + (url.indexOf('?') === -1 ? '?' : '&') + 'v=' + encodeURIComponent(BUILD); }
  function fetchTxt(url) {
    return fetch(cb(url)).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' sur ' + url); return r.text(); });
  }
  function injecte(code) {
    var s = document.createElement('script');
    s.textContent = code;
    document.body.appendChild(s);
  }
  Promise.all([
    fetchGz('data/monde.json.gz'),
    fetchGz('data/admin.json.gz'),
    fetchTxt('data/manifest-pays.json').then(function (t) { return JSON.parse(t); }),
    fetchTxt('data/couleurs-continents.json').then(function (t) { return JSON.parse(t); }),
    Promise.all(CORE.map(function (n) { return fetchTxt('js/core/' + n + '.js'); })).then(function (t) { return t.join('\n'); }),
    fetchTxt('js/app/couche-comprehension.js'),
    fetchTxt('js/app/greffon-pays.js')
  ]).then(function (r) {
    window.__PR2_DATA = r[0];
    window.__PR2_ADMIN = r[1];
    window.__PR2_PKGS = { base: '', manifest: r[2] };
    window.__PR2_COULEURS = r[3];
    injecte(r[4]);   // noyau complet (IIFE 00→17, fenêtrée par window.__PR2)
    injecte(r[5]);   // couche compréhension
    injecte(r[6]);   // greffon pays : window.__PR2_PAYS puis démarrage
  }).catch(function (e) {
    bandeau(e && e.message ? e.message : e);
    throw e;
  });
})();
