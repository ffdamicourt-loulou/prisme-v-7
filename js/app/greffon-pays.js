(function () {
  'use strict';
  var branche = false;

  function conf() { return window.__PR2_PKGS || null; }

  // liste des pays disponibles, triée, sans dépendre du DOM pour les tests
  function liste() {
    var c = conf();
    if (!c || !c.manifest || !c.manifest.pays) return [];
    var A = window.__PR2, ids = [];
    Object.keys(c.manifest.pays).forEach(function (id) { if (A && A.parId && A.parId[id]) ids.push(id); });
    return ids.sort(function (a, b) {
      return String(A.parId[a].nom).localeCompare(String(A.parId[b].nom), 'fr');
    });
  }

  function ouvrir(id) {
    var A = window.__PR2;
    if (!A || !A.parId[id]) return { ok: false, raison: 'pays inconnu : ' + id };
    // descendre() charge le package à la demande (mécanisme v0.80 du noyau :
    // admin absent + package déclaré → __PR2_PKG_REG → descente retentée),
    // même réponse que la sélection par clic (true = vue niv1 ouverte).
    var r = A.descendre(id);
    return { ok: r === true, enAttente: r === false };
  }

  function retourMonde() {
    var A = window.__PR2, n = 0;
    while (A && A.vue && A.vue().type !== 'monde' && n++ < 12) A.retour();
    return { ok: window.__PR2.vue().type === 'monde' };
  }

  // ── PANNEAU ─────────────────────────────────────────────────────
  function el(tag, attrs) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) if (attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    return e;
  }

  function init() {
    if (branche) return true;
    var A = window.__PR2;
    if (!A || !A.carte || !A.carte()) return false;
    if (typeof document === 'undefined' || !conf()) return (branche = true);
    var ancrage = document.getElementById('prisme2-bandeau');
    if (!ancrage || !ancrage.parentNode) return (branche = true);

    var panneau = el('div', { id: 'prisme2-pays-panneau' });
    panneau.style.cssText = 'position:fixed;top:44px;left:8px;z-index:60;background:#fff'
      + ';border:1px solid #bbb;border-radius:6px;padding:8px;font:12px system-ui;max-height:70vh;overflow:auto';

    var titre = el('div', {}); titre.innerHTML = '<b>Pays</b> (packages à la demande)';
    panneau.appendChild(titre);

    var choix = el('select', { id: 'prisme2-pays-choix' });
    var ids = liste();
    for (var i = 0; i < ids.length; i++) {
      var op = el('option', { value: ids[i] });
      op.textContent = A.parId[ids[i]].nom;
      choix.appendChild(op);
    }
    panneau.appendChild(choix);

    var boite = el('div', {});
    var bOuvrir = el('button', { type: 'button' }); bOuvrir.textContent = 'Ouvrir';
    bOuvrir.addEventListener('click', function () { ouvrir(choix.value); });
    var bMonde = el('button', { type: 'button' }); bMonde.textContent = 'Monde';
    bMonde.addEventListener('click', function () { retourMonde(); });
    boite.appendChild(bOuvrir); boite.appendChild(document.createTextNode(' ')); boite.appendChild(bMonde);
    panneau.appendChild(boite);

    // ── EXPORT (bases v0.200) : image fixe ou HTML interactif autonome
    var ex = el('div', {});
    var bPng = el('button', { type: 'button' }); bPng.textContent = 'Image PNG';
    bPng.addEventListener('click', function () { window.__PR2_EXPORT.png({ telecharger: true }); });
    var bHtml = el('button', { type: 'button' }); bHtml.textContent = 'HTML interactif';
    bHtml.addEventListener('click', function () { window.__PR2_EXPORT.interactif({ telecharger: true }); });
    ex.appendChild(bPng); ex.appendChild(document.createTextNode(' ')); ex.appendChild(bHtml);
    panneau.appendChild(ex);

    // ── COMPRÉHENSION (couche v0.200) : « Prisme propose » — un intitulé,
    // sa fiche de sens (terme, bibliothèque, nature), les incompris en vue
    // du futur module d'import (qui branchera les MÊMES appels sur les
    // colonnes du tableau importé).
    var cp = el('div', {});
    var intitule = el('input', { id: 'prisme2-dico-intitule', placeholder: 'Comprendre un intitulé…' });
    var bComprendre = el('button', { type: 'button' }); bComprendre.textContent = 'Comprendre';
    var sortie = el('div', { id: 'prisme2-dico-sortie' });
    bComprendre.addEventListener('click', function () {
      sortie.textContent = '…';
      window.__PR2_DICO.comprendre(intitule.value || '').then(function (r) {
        if (!r.ok) { sortie.textContent = 'compréhension indisponible : ' + r.raison; return; }
        if (!r.fiche) { sortie.textContent = '« ' + intitule.value + ' » : incompris (base de l apprentissage)'; return; }
        var f = r.fiche;
        sortie.innerHTML = '<b>' + (f.libelle || f.id) + '</b> · ' + f.bibliotheque
          + '<br>' + (f.definition || '')
          + '<br>' + (f.unite ? 'unité : ' + f.unite + ' · ' : '') + 'additif : ' + (f.additif ? 'oui' : 'non');
      });
    });
    cp.appendChild(intitule); cp.appendChild(document.createTextNode(' ')); cp.appendChild(bComprendre);
    cp.appendChild(sortie);
    panneau.appendChild(cp);

    ancrage.parentNode.insertBefore(panneau, ancrage.nextSibling);

    // ── NAVIGATION PAR CLIC (mode pays) : descendre là où on clique.
    // Niveau 1 → 2 : descente directe (le package se charge au besoin) ;
    // feuilles profondes : l'info-bulle de validation du noyau
    // (prisme2-demande) propose le niveau suivant — boutons câblés ici.
    var carte = A.carte();
    carte.on('click', function (e) {
      if (e.componentType !== 'series' || e.seriesType !== 'map') return;
      var V = A.vue();
      if (V.type === 'monde') return; // en vue monde, le panneau gouverne l'ouverture
      if (e.name && e.name.slice(0, 6) === 'socle@') return; // le socle ne se parcourt pas
      if (!A.descendreSous(e.name)) {
        // pas d'enfants au niveau suivant : proposer le niveau déjà connu
        try { A.demanderSous(e.name); } catch (err) { }
      }
    });
    var bOk = document.getElementById('prisme2-demande-ok');
    var bKo = document.getElementById('prisme2-demande-annuler');
    if (bOk) bOk.addEventListener('click', function () { A.validerDemande(); });
    if (bKo) bKo.addEventListener('click', function () { A.annulerDemande(); });
    try { if (carte.getZr) carte.getZr().on('contextmenu', function (ev) { try { ev.preventDefault && ev.preventDefault(); } catch (err) { } A.retour(); }); } catch (err) { }

    branche = true;
    return true;
  }

  window.__PR2_PAYS = { init: init, ouvrir: ouvrir, retourMonde: retourMonde, liste: liste };
  if (!init() && window.__PR2 && window.__PR2.apresDemarrage) {
    window.__PR2.apresDemarrage(init);
  }
})();
