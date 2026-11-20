// v0.200 — COUCHE COMPRÉHENSION (dictionnaires + guichet sélectif).
// Ce module pose la couche « sens » de Prisme v5 : un intitulé de colonne ou
// de zone passe par le GUICHET (index léger, 84 Ko) qui décide quelles
// bibliothèques de vocabulaire charger ; seules celles-là voyagent
// (finance 141 Ko, démographie 27 Ko…), depuis le dossier dictionnaires/
// servi à côté du HTML. Rien ne rentre jamais dans le fichier d'export
// interactif : les dictionnaires restent côté application.
//
// Trois sources de données, dans l'ordre :
//   1. window.__PR2_DICO_BIBS / __PR2_DICO_INDEX : préchargements de test
//      (harnais) — court-circuitent le réseau ;
//   2. fetch() vers __PR2_DICO_CONF.base (dossier dictionnaires/, servi
//      par HTTP ou par l'hôte bureau) ;
//   3. l'absence totale (mode tout-embarqué sans lecteurs) : chaque appel
//      répond { ok: false, raison: '…' } sans jamais lever.
(function () {
  'use strict';

  var MANIFESTE = null;      // manifest des bibliothèques (nom → { fichier, lecteur, chargement })
  var INDEX_CHARGE = false;  // guichet index prêt ?

  function pret() {
    return !!(window.Vocabulaire && window.Guichet);
  }
  function base() {
    var c = window.__PR2_DICO_CONF || {};
    return c.base || 'dictionnaires/';
  }
  function nomFichier(nom) {
    for (var i = 0; MANIFESTE && i < MANIFESTE.length; i++) {
      if (MANIFESTE[i].nom === nom) return MANIFESTE[i].fichier;
    }
    return 'data/dictionnaires/' + nom + '_v01.json';
  }

  function chargerBibliotheque(nom) {
    // 1. préchargé (harnais) → immédiat
    if (window.__PR2_DICO_BIBS && window.__PR2_DICO_BIBS[nom]) {
      window.Vocabulaire.charger(window.__PR2_DICO_BIBS[nom]);
      return Promise.resolve(window.__PR2_DICO_BIBS[nom]);
    }
    // 2. réseau (mode pays servi par HTTP)
    if (typeof fetch === 'function') {
      return fetch(base() + nomFichier(nom)).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (j) {
        window.Vocabulaire.charger(j); // la bibliothèque est ENREGISTRÉE au moment même où elle arrive
        return j;
      });
    }
    return Promise.reject(new Error('aucune source pour « ' + nom + ' »'));
  }

  function chargerManifeste() {
    if (MANIFESTE) return Promise.resolve(MANIFESTE);
    if (window.__PR2_DICO_MANIFESTE) { MANIFESTE = window.__PR2_DICO_MANIFESTE.dictionnaires; return Promise.resolve(MANIFESTE); }
    if (typeof fetch !== 'function') return Promise.reject(new Error('fetch indisponible'));
    return fetch(base() + 'data/manifest.json').then(function (r) { return r.json(); }).then(function (m) {
      MANIFESTE = m.dictionnaires || [];
      return MANIFESTE;
    });
  }

  function chargerIndex() {
    if (!pret()) return Promise.resolve({ ok: false, raison: 'lecteurs de vocabulaire absents de ce build' });
    if (INDEX_CHARGE) return Promise.resolve({ ok: true });
    var poser = function (index) {
      window.Guichet.charger(index);
      INDEX_CHARGE = true;
      return { ok: true };
    };
    if (window.__PR2_DICO_INDEX) return Promise.resolve(poser(window.__PR2_DICO_INDEX));
    if (typeof fetch !== 'function') return Promise.resolve({ ok: false, raison: 'fetch indisponible' });
    return fetch(base() + 'data/guichet_index.json').then(function (r) { return r.json(); })
      .then(poser).catch(function (e) { return { ok: false, raison: String(e && e.message || e) }; });
  }

  // Analyser sans rien charger : quelles bibliothèques ces titres réclament-ils ?
  function besoins(titres) {
    return chargerIndex().then(function (r) {
      if (!r.ok) return r;
      return { ok: true, besoins: window.Guichet.besoins(titres || []) };
    });
  }

  // Le cycle complet de la vision import : index → bibliothèques utiles
  // SEULEMENT → fiches de compréhension titre par titre (terme, spécialistes,
  // incompris). Base du futur « Prisme propose, l'utilisateur tranche ».
  function preparer(titres) {
    titres = (titres || []).filter(function (t) { return t && String(t).trim(); });
    return chargerIndex().then(function (r) {
      if (!r.ok) return r;
      return chargerManifeste().then(function () {
        return window.Guichet.preparer(titres, null, null, { chargeur: function (nom) { return chargerBibliotheque(nom); } });
      }).then(function (res) {
        res.ok = true;
        return res;
      }).catch(function (e) { return { ok: false, raison: String(e && e.message || e) }; });
    });
  }

  // Fiche d'UN intitulé : { bibliotheque, id, libelle, nature, unite, definition, additif } ou null.
  function comprendre(titre) {
    return preparer([titre]).then(function (r) {
      if (!r.ok) return r;
      var c = (r.colonnes || [])[0] || null;
      return { ok: true, fiche: c && c.terme ? c.terme : null, incompris: r.incompris || [] };
    });
  }

  // Additivité — appelé un jour par les renderers pour refuser un total
  // sur un taux (le moteur de la carte ne l'appelle pas encore : v5).
  function peutAgreger(titre, agregat, opts) {
    if (!pret()) return { ok: true, inconnu: true, raison: 'couche compréhension absente' };
    return window.Guichet.peutAgreger(titre, agregat, opts || {});
  }

  // Chemin SYNCHRONE : uniquement quand tout est déjà présent (index chargé +
  // bibliothèques réclamées préchargées) — utilisé par le harnais et par
  // un futur cache chaud. Renvoie null si le moindre chargement manquait.
  function preparerImmediate(titres) {
    if (!pret() || !INDEX_CHARGE) return null;
    titres = (titres || []).filter(function (t) { return t && String(t).trim(); });
    var b = window.Guichet.besoins(titres);
    var pre = window.__PR2_DICO_BIBS || {};
    for (var i = 0; i < b.noms.length; i++) {
      if (!pre[b.noms[i]]) return null;
      window.Vocabulaire.charger(pre[b.noms[i]]);
    }
    var fiches = titres.map(function (t) { return { titre: t, fiche: window.Guichet.comprendre(t) }; });
    return {
      bibliotheques: b.noms.slice(),
      fiches: fiches,
      incompris: fiches.filter(function (f) { return !f.fiche; }).map(function (f) { return f.titre; }),
    };
  }

  window.__PR2_DICO = {
    pret: pret,
    chargerIndex: chargerIndex,
    besoins: besoins,
    preparer: preparer,
    preparerImmediate: preparerImmediate,
    comprendre: comprendre,
    peutAgreger: peutAgreger,
    bibliotheques: function () { return pret() ? window.Vocabulaire.bibliotheques() : []; },
  };
})();
// v0.200 — BASES DE L'EXPORT (modèle v5) : deux canaux, un même point d'entrée.
//   __PR2_EXPORT.png()        → image fixe haute résolution (canvas → dataURL) ;
//   __PR2_EXPORT.interactif() → UN SEUL FICHIER HTML autonome : ECharts
//     embarqué + la carte enregistrée (seule la géométrie de la vue utile
//     voyage, pas les 240 pays) + l'option courante. Zoom/pan/survol
//     fonctionnent hors ligne, sans serveur, sans aucune dépendance.
//   Base du futur menu « image / interactif » : chaque renderer (carte,
//   courbes, camemberts…) héritera des deux canaux en sérialisant son
//   option ; le module ne connaît ni la carte ni les séries.
(function () {
  'use strict';

  function api() { return window.__PR2; }
  function optionCourante(remplacement) {
    if (remplacement) return remplacement;
    var A = api();
    if (A && A.carte && A.carte() && typeof A.carte().getOption === 'function') return A.carte().getOption();
    return null;
  }

  // Le texte d'ECharts voyage dans le build (balise <script> en ligne) :
  // le retrouver évite de dupliquer la bibliothèque dans l'export.
  function texteEcharts(remplacement) {
    if (remplacement) return remplacement;
    try {
      var scripts = document.querySelectorAll('script');
      var meilleur = null;
      for (var i = 0; i < scripts.length; i++) {
        var t = scripts[i].textContent || '';
        if (t.indexOf('registerMap') >= 0 && t.indexOf('echarts') >= 0 && (!meilleur || t.length > meilleur.length)) meilleur = t;
      }
      return meilleur;
    } catch (e) { return null; }
  }

  // Géométrie de la vue en cours : celle du registre ECharts (et ELLE
  // SEULE — pas les 240 pays) quand l'API l'expose, sinon un remplacement
  // explicite (harnais). La carte du monde n'a qu'une version des contours.
  function geoVue(nomCarte, remplacement) {
    try {
      var m = (typeof echarts !== 'undefined' && echarts.getMap && echarts.getMap(nomCarte)) || null;
      if (m && (m.geoJson || m.map)) return m.geoJson || m.map;
    } catch (e) { }
    return remplacement || null;
  }

  // ── IMAGE (PNG) ────────────────────────────────────────────────
  function png(opt) {
    opt = opt || {};
    var A = api();
    var c = A && A.carte && A.carte();
    if (!c || typeof c.getDataURL !== 'function') {
      return { ok: false, raison: 'rendu canvas absent (environnement de test)' };
    }
    var url;
    try {
      url = c.getDataURL({ type: 'png', pixelRatio: opt.ratio || 2, backgroundColor: opt.fond || '#ffffff' });
    } catch (e) { return { ok: false, raison: String(e && e.message || e) }; }
    if (opt.telecharger !== false && typeof document !== 'undefined') {
      var a = document.createElement('a');
      a.href = url; a.download = (opt.nom || 'prisme2-carte') + '.png';
      document.body.appendChild(a); a.click();
      try { document.body.removeChild(a); } catch (e) { }
    }
    return { ok: true, dataUrl: url, octets: url.length };
  }

  // ── HTML INTERACTIF AUTONOME ────────────────────────────────────
  function interactif(opt) {
    opt = opt || {};
    var o = optionCourante(opt.option);
    if (!o || !o.geo || !o.geo.map) return { ok: false, raison: 'aucune option de carte en cours' };
    var nomCarte = o.geo.map;
    var geo = geoVue(nomCarte, opt.geoJson);
    if (!geo) return { ok: false, raison: 'géométrie de la vue introuvable (echarts.getMap absent)' };
    var echartsTexte = texteEcharts(opt.echartsTexte);
    if (!echartsTexte) return { ok: false, raison: 'texte du ECharts introuvable (pas de balise embarquée)' };
    var charge = { option: o, carte: nomCarte, geoJson: geo, titre: opt.titre || 'Prisme 2 · export interactif' };
    var html = '<!DOCTYPE html>\n<html lang="fr"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width, initial-scale=1">'
      + '<title>' + charge.titre + '</title>'
      + '<style>html,body{margin:0;height:100%;background:#ffffff}'
      + '#prisme2-x{position:absolute;inset:0}</style></head><body>'
      + '<div id="prisme2-x"></div>'
      + '<script>' + echartsTexte + '<\/script>'
      + '<script>window.__PR2X = ' + JSON.stringify(charge) + ';\n'
      + 'echarts.registerMap(__PR2X.carte, __PR2X.geoJson);\n'
      + 'var c = echarts.init(document.getElementById("prisme2-x"), null, { renderer: "canvas" });\n'
      + 'c.setOption(__PR2X.option);\n'
      + 'window.addEventListener("resize", function () { c.resize(); });\n'
      + '<\/script></body></html>';
    if (opt.telecharger !== false && typeof document !== 'undefined' && typeof Blob === 'function') {
      var blob = new Blob([html], { type: 'text/html' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (opt.nom || 'prisme2-interactif') + '.html';
      document.body.appendChild(a); a.click();
      try { document.body.removeChild(a); URL.revokeObjectURL(a.href); } catch (e) { }
    }
    return { ok: true, html: html, octets: html.length, carte: nomCarte, vueZones: (geo.features || []).length };
  }

  window.__PR2_EXPORT = { png: png, interactif: interactif };
})();

// Prisme 2 — GREFFON PAYS (v0.200) — LES PACKAGES PAYS SONT LA BASE.
// Ce mode retourne la vision v5 : la couche partagée (contours du monde,
// frontières) est embarquée, mais TOUTE subdivision vit dans packages/<ISO2>.js
// et ne voyage qu'à la demande (un pays ≈ quelques centaines de Ko, contre
// tous les pays d'un coup). Le panneau pays remplace la carte monde comme
// écran d'accueil de la donnée : choisir un pays → son package se charge →
// ses régions s'ouvrent. Le bouton Monde ramène la vue d'ensemble.
