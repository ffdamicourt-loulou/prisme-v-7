(function () {
  'use strict';
  var branche = false;

  function conf() { return window.__PR2_PKGS || null; }

  // liste des pays disponibles, triée, sans dépendre du DOM pour les tests
  function liste() {
    var c = conf();
    if (!c || !c.manifest || !c.manifest.pays) return [];
    var A = window.__PR2, ids = [];
    // v7.2 : les ALIAS (FR-NA, FR-SA, US-009…) sont des morceaux de pays
    // déportés sur la carte monde, PAS des pays distincts : les exclure du
    // sélecteur sinon « France » y apparaissait trois fois et deux des trois
    // entrées étaient mortes (descendPossible refuse les ids à tiret).
    Object.keys(c.manifest.pays).forEach(function (id) {
      var fiche = c.manifest.pays[id];
      if (fiche && fiche.alias) return;
      if (A && A.parId && A.parId[id]) ids.push(id);
    });
    return ids.sort(function (a, b) {
      return String(A.parId[a].nom).localeCompare(String(A.parId[b].nom), 'fr');
    });
  }

  // v7.6 : DEUX TEMPS — un clic sur un pays en vue monde le SÉLECTIONNE
  // (niveau 1 : LE PAYS SEUL, cadré à 80 % de la hauteur, peint en teinte
  // d'origine -10 % de luminosité) ; un SECOND clic sur le pays déjà
  // sélectionné y DESCEND (niveau 2 : les régions, package à la demande,
  // cadrées à 60 %).
  function ouvrir(id, dansPays) {
    var A = window.__PR2;
    if (!A || !A.parId[id]) return { ok: false, raison: 'pays inconnu : ' + id };
    // v7.2 : résoudre l'alias vers le pays réel (FR-NA → FR) — sinon la
    // descente échoue toujours (les ids à tiret sont des outre-mer).
    var conf = window.__PR2_PKGS;
    var fiche = conf && conf.manifest && conf.manifest.pays ? conf.manifest.pays[id] : null;
    if (fiche && fiche.alias && A.parId[fiche.alias]) id = fiche.alias;
    if (!dansPays) {
      // NIVEAU 1 : sélection du pays seul (reinitialiserVers, centrage 80 %)
      var okSel = A.ouvrir ? A.ouvrir(id, 1, null) : false;
      return { ok: okSel, enAttente: false };
    }
    // NIVEAU 2 : descente dans les régions (package chargé à la demande,
    // mécanisme v0.80 : admin absent + package déclaré → __PR2_PKG_REG →
    // descente retentée).
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
    bOuvrir.addEventListener('click', function () { ouvrir(choix.value, !!(A.etat && A.etat.selection === choix.value)); });
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

    // v7.2 : bandeau d'information fin de descente (aucune donnée plus fine)
    var info = el('div', { id: 'prisme2-info' });
    info.style.cssText = 'display:none;margin-top:6px;padding:6px;background:#fff8e1'
      + ';border:1px solid #e0c97a;border-radius:4px;color:#6b5d2b';
    panneau.appendChild(info);

    ancrage.parentNode.insertBefore(panneau, ancrage.nextSibling);

    // ── NAVIGATION PAR CLIC (mode pays) : descendre là où on clique.
    // Niveau 1 → 2 : descente directe (le package se charge au besoin) ;
    // feuilles profondes : l'info-bulle de validation du noyau
    // (prisme2-demande) propose le niveau suivant — boutons câblés ici.
    var carte = A.carte();
    carte.on('click', function (e) {
      if (e.componentType !== 'series' || e.seriesType !== 'map') return;
      var V = A.vue();
      // v7.8 : Alt+clic → panneau de désélection du greffon sélection.
      if (e.event && e.event.altKey && window.__PR2_SEL) {
        window.__PR2_SEL.altClic(e);
        return;
      }
      // v7.8 : clic MER / ZONE VIDE (sans nom) → tout désélectionner,
      // SANS changer la vue ni le cadrage.
      if (!e.name && window.__PR2_SEL) {
        window.__PR2_SEL.clicVide();
        return;
      }
      if (V.type === 'monde') {
        // v7.9 : Maj+clic AJOUTE le pays à la sélection (vue combinée au
        // niveau 1 : le pays déjà sélectionné REJOINT la sélection —
        // conserver v0.34 du noyau, perdu depuis le passage en greffon).
        var maj = !!(e.event && e.event.shiftKey);
        if (e.name && A.parId[e.name]) {
          var idM = e.name;
          var fM = (conf().manifest && conf().manifest.pays) ? conf().manifest.pays[idM] : null;
          if (fM && fM.alias && A.parId[fM.alias]) idM = fM.alias;
          if (maj && A.reinitialiserVers && (!A.etat || A.etat.selection !== idM)) {
            A.reinitialiserVers(idM, 1, null, true);
            return;
          }
          ouvrir(e.name, !!(A.etat && A.etat.selection === e.name));
        }
        return;
      }
      if (e.name && e.name.slice(0, 6) === 'socle@') return; // le socle ne se parcourt pas
      // v7.5 : clic sur un PAYS EXTÉRIEUR (« x-ES »…) depuis une vue pays :
      // le nouveau pays s'ouvre au NIVEAU 1 (règle de navigation v7.5,
      // cadré à 80 % de la hauteur), même si l'on vient d'un niveau 2/3.
      if (e.name && e.name.slice(0, 2) === 'x-') {
        var idX = e.name.slice(2);
        var fx = (conf() && conf().manifest && conf().manifest.pays) ? conf().manifest.pays[idX] : null;
        if (fx && fx.alias && A.parId[fx.alias]) idX = fx.alias;
        // v7.9 : Maj+clic sur un pays extérieur = AJOUT À LA VUE COURANTE
        // au MÊME niveau (règle utilisateur : les divisions du nouveau
        // pays rejoignent celles du/des pays sélectionnés).
        if (e.event && e.event.shiftKey && A.ajouterAuGroupe) {
          if (ajouterPaysAuGroupe(idX)) return;
          // pas de subdivisions à ce niveau (ou package absent) : repli
          // sur la SÉLECTION du pays seul au niveau 1 (règle v7.5).
          if (A.parId[idX] && A.ouvrir) A.ouvrir(idX, 1, null);
          return;
        }
        if (A.parId[idX] && A.ouvrir) A.ouvrir(idX, 1, null);
        return;
      }
      // v7.9 : Maj+clic sur une SŒUR du niveau supérieur (règle v0.52) —
      // ses enfants REJOIGNENT la vue au niveau courant, bascule pour retirer.
      if (e.event && e.event.shiftKey && A.ajouterSousVue && V.soeurs) {
        var fzS = null;
        (V.soeurs || []).forEach(function (f) {
          if (!fzS && (f.id === e.name || f.nom === e.name || ('c-' + f.id) === e.name)) fzS = f;
        });
        if (fzS) { if (A.ajouterSousVue(fzS)) return; }
      }
      // v7.9 : Maj+clic sur une ZONE DE LA VUE : bascule la zone dans la
      // sélection de niveau (etat.selections) — peinte en séletion et
      // proposée par la demande multi-zones « Charger ».
      if (e.event && e.event.shiftKey && A.etat && V.parNom && V.parNom[e.name]) {
        var selZ = (A.etat.selections || []).slice();
        var posZ = selZ.indexOf(e.name);
        if (posZ !== -1) selZ.splice(posZ, 1); else selZ.push(e.name);
        A.etat.selections = selZ;
        if (window.__PR2_SEL && window.__PR2_SEL.validerTout === undefined) { }
        if (A.majEtiquettes) A.majEtiquettes();
        return;
      }
      // v7.8 : descente utilisateur n2→n3 — validation par info-bulle.
      if (window.__PR2_SEL && !window.__PR2_SEL.validerDescente(e.name)) return;
      if (!A.descendreSous(e.name)) {
        // pas d'enfants au niveau suivant : proposer le niveau déjà connu
        var demande = false;
        try { demande = A.demanderSous(e.name); } catch (err) { }
        // v7.2 : donner un RETOUR VISUEL quand aucune donnée plus fine
        // n'existe (fin de la chaîne des subdivisions disponibles).
        var info = document.getElementById('prisme2-info');
        if (!demande) {
          if (info) {
            info.textContent = (e.name ? '« ' + e.name + ' »' : 'Cette zone')
              + ' : aucune subdivision plus fine disponible dans les données.';
            info.style.display = 'block';
          }
        } else if (info) info.style.display = 'none';
      } else {
        var infoOk = document.getElementById('prisme2-info');
        if (infoOk) infoOk.style.display = 'none';
      }
    });
    var bOk = document.getElementById('prisme2-demande-ok');
    var bKo = document.getElementById('prisme2-demande-annuler');
    if (bOk) bOk.addEventListener('click', function () { A.validerDemande(); });
    if (bKo) bKo.addEventListener('click', function () { A.annulerDemande(); });
    // v7.8 : clic sur le FOND DE CARTE (geo) = zone vide → tout désélectionner
    carte.on('click', function (e) {
      if (!window.__PR2_SEL) return;
      if (e && (e.componentType === 'geo' || !e.name)) window.__PR2_SEL.clicVide();
    });
    try { if (carte.getZr) carte.getZr().on('contextmenu', function (ev) { try { ev.preventDefault && ev.preventDefault(); } catch (err) { } A.retour(); }); } catch (err) { }

    branche = true;
    return true;
  }

  // v7.9 : AJOUT D'UN PAYS EXTÉRIEUR À LA VUE COURANTE (Maj+clic x-…).
  // Essai direct du groupe (membre au niveau de la vue) ; si l'admin du
  // pays est absent, son PACKAGE est chargé à la demande (mécanisme
  // v0.80) puis l'ajout est RETENTÉ. Retour false = impossible (pas de
  // subdivisions au niveau courant, ou package non déclaré).
  function ajouterPaysAuGroupe(idX) {
    var A = window.__PR2;
    try { if (A.ajouterAuGroupe(idX)) return true; } catch (err) { }
    if (A.featuresNiv1 && !A.featuresNiv1(idX) && A.chargerPackage) {
      try {
        return A.chargerPackage(idX, function () {
          try { A.ajouterAuGroupe(idX); } catch (err) { }
        });
      } catch (err) { return false; }
    }
    return false;
  }

  // v7.8 : descente APRÈS validation n2→n3 (info-bulle du greffon sélection)
  // — même flux que le clic : descendre, sinon demanderSous (package).
  function descendreAvecDemande(nom) {
    var A = window.__PR2;
    if (!A) return false;
    if (!A.descendreSous(nom)) {
      var demande = false;
      try { demande = A.demanderSous(nom); } catch (err) { }
      var info = document.getElementById('prisme2-info');
      if (!demande) {
        if (info) {
          info.textContent = '« ' + nom + ' » : pas de subdivision plus fine disponible.';
          info.style.display = 'block';
          clearTimeout(info._t);
          info._t = setTimeout(function () { info.style.display = 'none'; }, 2600);
        }
        return false;
      }
    }
    return true;
  }

  window.__PR2_PAYS = { init: init, ouvrir: ouvrir, retourMonde: retourMonde, liste: liste,
    descendreAvecDemande: descendreAvecDemande, ajouterPaysAuGroupe: ajouterPaysAuGroupe };
  if (!init() && window.__PR2 && window.__PR2.apresDemarrage) {
    window.__PR2.apresDemarrage(init);
  }
})();
