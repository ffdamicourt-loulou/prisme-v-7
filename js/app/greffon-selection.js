// ─────────────────────────────────────────────────────────────────
// Prisme 6 — greffon SÉLECTION (v7.8) : LE module unique des règles de
// sélection / désélection. Le noyau (js/core) reste le FOURNISSEUR
// d'état et de primitives (etat, vue, pile, descendreSous, retour,
// reinitialiserVers, ajouter/retirerDuGroupe, majEtiquettes) ; toutes
// les règles métier vivent ici :
//   R1. clic mer / zone vide → tout désélectionner, SANS toucher à la
//       vue ni au cadrage (caméra conservée).
//   R2. descente utilisateur n2→n3 (clic une région dans la vue
//       régions) → validation par info-bulle AVANT l'affichage.
//   R3. Alt+clic → pop-up PERSISTANTE et contextuelle de désélection,
//       propositions par radio-boutons, APERÇU EN DIRECT à chaque
//       bascule, bouton Valider pour appliquer, Annuler pour revenir.
//       Les propositions s'indexent sur les niveaux RÉELS de la vue :
//       aucun cas particulier (Grande-Bretagne à 4 niveaux, ou plus,
//       marche sans code dédié).
// Chargé après le greffon pays ; s'auto-branche sans DOM (tests).
// ─────────────────────────────────────────────────────────────────
(function () {
  'use strict';
  var A = function () { return window.__PR2; };

  // ---------- état du panneau ----------
  var panneau = null;         // div#prisme2-sel (radio + Valider/Annuler)
  var origine = null;         // { vueAdmin, paysId, etat, chaine, journal }
  var options = [];           // [{ label, type, appliquer(journal) }]
  var choisi = 0;             // index radio sélectionné
  var enAttenteDescente = null; // { nom } validation n2→n3 en cours
  var boiteValidation = null; // div#prisme2-validation (info-bulle)

  // ---------- petite boîte à outils DOM ----------
  function el(tag, attrs) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) if (attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    return e;
  }
  function txt(t) { return document.createTextNode(String(t)); }

  // ---------- état noyau : snapshot / restauration ----------
  function etatSnapshot() {
    var S = A(), e = S.etat;
    return { selection: e.selection, selections: (e.selections || []).slice(),
             selectionZone: e.selectionZone };
  }
  function restaurerEtat(s) {
    var S = A(), e = S.etat;
    e.selection = s.selection;
    // v7.30 : restauration VIA LA MACHINE À ÉTATS (copie propre + version)
    if (typeof S.selEnvoyer === 'function') S.selEnvoyer('restaurer-etat', (s.selections || []).slice());
    else e.selections = (s.selections || []).slice();
    e.selectionZone = s.selectionZone;
    if (S.majEtiquettes) S.majEtiquettes(); // repeint sans toucher la caméra
  }
  // chaîne des zones de la vue courante (niveaux 2+) : le chemin exact
  // pour REJOUER la descente depuis le niveau pays après un aller-retour.
  function chaineZones() {
    var S = A(), out = [], V = S.vue();
    (S.pile || []).forEach(function (it) {
      if (it && it.vue && it.vue.type === 'admin' && it.vue.niveau >= 2) out.push(it.vue.parent);
    });
    // la vue COURANTE (hormis n1 : payer le pays ne se re-descend pas)
    // apporte aussi sa zone d'entrée — sinon la restauration d'une vue
    // de niveau 2 s'arrêtait au niveau 1.
    if (V && V.type === 'admin' && V.niveau >= 2) out.push(V.parent);
    return out;
  }
  function nomPaysDe(id) { var S = A(); var p = (S.parId || {})[id] || {}; return p.nom || id; }

  // ---------- restaurer l'état d'OUVERTURE du panneau ----------
  function restaurerOrigine() {
    if (!origine) return;
    var S = A();
    for (var i = origine.journal.length - 1; i >= 0; i--) {
      try { origine.journal[i].inverse(); }
      catch (err) { try { console.warn('[Prisme6 SEL] restauration : ' + err); } catch (e2) { } }
    }
    origine.journal.length = 0;
    restaurerEtat(origine.etat); // état peint sans navigation
  }

  // ---------- R1 : clic zone vide / mer → tout désélectionner ----------
  function clicVide() {
    var S = A();
    annulerDescente();          // clic en mer : la validation en attente se referme aussi
    if (!S || !S.etat) return { ok: false, raison: 'noyau absent' };
    S.etat.selection = null;
    if (typeof S.selVider === 'function') S.selVider('clic-vide'); // v7.30
    else S.etat.selections = [];
    S.etat.selectionZone = null;
    if (S.majEtiquettes) S.majEtiquettes(); // REPEINT la carte, caméra intacte
    return { ok: true };
  }

  // ---------- R2 : validation de la descente n2→n3 ----------
  // v7.23 : la descente se fait DÉSORMAIS en UN SEUL clic — l'info-bulle
  // de confirmation v7.8 (« Afficher le niveau 3 ? ») est retirée : les
  // données des sous-zones d'un pays sont déjà chargées avec le package
  // du pays (l'écran « régions » n'existe que package chargé), la
  // confirmation n'apportait aucune protection réelle et créait le
  // « double clic » rapporté. validerDescente true → descente immédiate.
  // Les fonctions descenteAttente/confirmerDescente/annulerDescente
  // restent exportées (toujours inertes) pour compatibilité.
  function validerDescente(nom) {
    return true;
  }
  function ouvrirBoiteValidation(nom) {
    if (typeof document === 'undefined' || !document.body) return;
    fermerBoiteValidation();
    boiteValidation = el('div', { id: 'prisme2-validation' });
    boiteValidation.style.cssText = 'position:fixed;z-index:85;background:#fff;border:1px solid #bbb'
      + ';border-radius:6px;padding:10px;font:13px system-ui;max-width:300px;box-shadow:0 2px 8px rgba(0,0,0,.18)';
    boiteValidation.appendChild(txt('Afficher le niveau 3 de «\u00a0' + nom + '\u00a0» ?'));
    var b = el('div', {}); b.style.marginTop = '8px';
    var bOui = el('button', { type: 'button' }); bOui.textContent = 'Afficher';
    bOui.addEventListener('click', confirmerDescente);
    var bNon = el('button', { type: 'button' }); bNon.textContent = 'Annuler';
    bNon.style.marginLeft = '8px';
    bNon.addEventListener('click', annulerDescente);
    b.appendChild(bOui); b.appendChild(bNon);
    boiteValidation.appendChild(b);
    document.body.appendChild(boiteValidation);
    position(boiteValidation, dernierPoint.x, dernierPoint.y);
  }
  function fermerBoiteValidation() {
    if (boiteValidation && boiteValidation.parentNode && boiteValidation.parentNode.removeChild)
      boiteValidation.parentNode.removeChild(boiteValidation);
    boiteValidation = null;
  }
  function descenteAttente() { return !!enAttenteDescente; }
  function confirmerDescente() {
    var d = enAttenteDescente; enAttenteDescente = null;
    fermerBoiteValidation();
    if (!d) return false;
    var pays = window.__PR2_PAYS;
    if (pays && pays.descendreAvecDemande) { pays.descendreAvecDemande(d.nom); return true; }
    var S = A(); return !!S.descendreSous(d.nom);
  }
  function annulerDescente() { enAttenteDescente = null; fermerBoiteValidation(); }

  // ---------- R3 : panneau Alt+clic, contextuel et persistant ----------
  function niveauUtilisateur() { // niveaux UTILISATEUR : 1 = pays, 2 = régions…
    var V = A().vue();
    return V.type === 'monde' ? 0 : (V.niveau || 1) + 1;
  }
  // construit les propositions selon le CONTEXTE (vue + sélection + clic)
  function construireOptions(cible) {
    var S = A(), V = S.vue(), e = S.etat, opts = [];
    opts.push({ label: 'Conserver en l\u2019état actuel', type: 'rien', appliquer: function () { } });
    if (V.type === 'monde') {
      // v7.30 : les CLEFS QUALIFIÉES « 2:a3¤parent¤nom » (zones) ne sont
      // pas des PAYS : le panneau monde ne propose que les pays ; les
      // mutations passent par LA MACHINE À ÉTATS (journal + version).
      var selPays = [];
      if (e.selection) selPays.push(e.selection);
      (e.selections || []).forEach(function (id) {
        if (typeof id === 'string' && id.slice(0, 2) === '2:') return; // zone qualifiée : pas un pays
        if (selPays.indexOf(id) === -1) selPays.push(id);
      });
      var selViderIci = function (op) {
        e.selection = null;
        if (typeof S.selVider === 'function') S.selVider(op);
        else e.selections = [];
      };
      // v7.13 : si le clic porte sur UN PAYS DE LA SÉLECTION, proposer
      // UNIQUEMENT ce pays (désélection ciblée) — plus « tout » ; la
      // liste complète ne reste que pour un Alt+clic SANS pays ciblé.
      var cSel = (cible && selPays.indexOf(cible) !== -1) ? cible : null;
      if (cSel) {
        opts.push({
          label: 'Désélectionner ' + nomPaysDe(cSel) + ' (' + cSel + ')',
          type: 'etat',
          appliquer: function () {
            if (e.selection === cSel) e.selection = null;
            if (typeof S.selRetirer === 'function') S.selRetirer(cSel, 'deselect-pays');
            else e.selections = (e.selections || []).filter(function (x) { return x !== cSel; });
          }
        });
        if (selPays.length > 1) opts.push({
          label: 'Tout désélectionner (' + selPays.length + ' pays)',
          type: 'etat',
          appliquer: function () { selViderIci('tout-deselect'); }
        });
        return opts;
      }
      selPays.forEach(function (id) {
        opts.push({
          label: 'Désélectionner ' + nomPaysDe(id) + ' (' + id + ')',
          type: 'etat',
          appliquer: function () {
            if (e.selection === id) e.selection = null;
            if (typeof S.selRetirer === 'function') S.selRetirer(id, 'deselect-pays');
            else e.selections = (e.selections || []).filter(function (x) { return x !== id; });
          }
        });
      });
      if (selPays.length) opts.push({
        label: 'Tout désélectionner (' + selPays.length + ' pays)',
        type: 'etat',
        appliquer: function () { selViderIci('tout-deselect'); }
      });
      return opts;
    }
    // ---- vue admin : pays courant (et groupe éventuel) ----
    var paysIds = (V.paysIds && V.paysIds.length) ? V.paysIds : [V.paysId];
    // v7.30 : le drapeau multi ne compte que les PAYS (les zones qualifiées
    // gérées par la vue admin n'y figurent plus).
    var multi = paysIds.length > 1 || (e.selections || []).some(function (x) { return typeof x !== 'string' || x.slice(0, 2) !== '2:'; });
    var nU = niveauUtilisateur();
    if (nU >= 3 && cible) {
      opts.push({
        label: 'Désélectionner la zone « ' + cible + ' »',
        type: 'etat',
        appliquer: function () { e.selectionZone = null; }
      });
      opts.push({
        label: 'Supprimer toutes les zones de niveau ' + nU + ' → remonter au niveau ' + (nU - 1),
        type: 'nav',
        appliquer: function (journal) {
          journal.push({ inverse: function () { S.descendreSous(V.parent); } });
          S.retour();
        }
      });
    }
    if (nU >= 2) opts.push({
      label: 'Retour au niveau 1 (sélection du pays « ' + nomPaysDe(V.paysId) + ' »)',
      type: 'nav',
      appliquer: function (journal) {
        var ch = chaineZones();
        journal.push({ inverse: function () {
          // rejouer la descente complète : rouvrir le pays au NIVEAU
          // UTILISATEUR 2 (régions) puis ré-emprunter la chaîne des zones.
          S.ouvrir(V.paysId, 2, null);
          ch.forEach(function (z) { S.descendreSous(z); });
        } });
        S.reinitialiserVers(V.paysId, 1, null, false);
      }
    });
    // v7.8 : en vue admin, le « pays sélectionné » EST la vue ouverte
    // (descendre() efface etat.selection) : désélectionner le pays =
    // REVENIR À LA VUE MONDE sans sélection (règle utilisateur).
    opts.push({
      label: 'Désélectionner le pays « ' + nomPaysDe(V.paysId) + ' » (retour à la vue monde)',
      type: 'nav',
      appliquer: function (journal) {
        var ch = chaineZones();
        journal.push({ inverse: function () {
          S.ouvrir(V.paysId, 2, null);
          ch.forEach(function (z) { S.descendreSous(z); });
        } });
        while (S.vue().type !== 'monde') S.retour();
        e.selection = null; e.selectionZone = null;
        if (typeof S.selVider === 'function') S.selVider('retour-monde'); // v7.30
        else e.selections = [];
        if (S.definirSelection) { try { S.definirSelection([]); } catch (err) { } }
      }
    });
    if (V.membres && paysIds.length > 1) paysIds.forEach(function (pid) {
      if (pid === V.paysId && paysIds.length === 1) return;
      opts.push({
        label: 'Retirer ' + nomPaysDe(pid) + ' de la sélection groupée',
        type: 'nav',
        appliquer: function (journal) {
          journal.push({ inverse: function () { S.ajouterAuGroupe(pid); } });
          S.retirerDuGroupe(pid);
        }
      });
    });
    return opts;
  }

  // capture du point de clic pour POSITIONNER la pop-up HORS de la zone
  var dernierPoint = { x: 80, y: 90 };
  function position(node, x, y) {
    try {
      var w = window.innerWidth || 1200, h = window.innerHeight || 800;
      var nw = 320, nh = 240;
      var gauche = x + 18, haut = y - 20;
      if (x > w / 2) gauche = x - nw - 18;   // à droite si zone à gauche
      gauche = Math.max(8, Math.min(w - nw - 8, gauche));
      haut = Math.max(8, Math.min(h - nh - 8, haut));
      node.style.left = gauche + 'px';
      node.style.top = haut + 'px';
    } catch (err) { }
  }

  function altClic(e) {
    var S = A();
    if (!S) return { ok: false, raison: 'noyau absent' };
    var V = S.vue();
    var nom = (e && e.name) || null;
    if (e && e.event && typeof e.event.offsetX === 'number') {
      dernierPoint = { x: e.event.offsetX, y: (e.event.offsetY || 60) + 46 };
    }
    // cible : zone cliquée (admin), pays extérieur « x- », ou pays (monde)
    var cible = null;
    if (V.type !== 'monde') {
      if (nom && nom.slice(0, 6) === 'socle@') return { ok: true };
      cible = nom && nom.slice(0, 2) === 'x-' ? nomPaysDe(nom.slice(2)) : nom;
    } else if (nom && S.parId[nom]) {
      // v7.13 : la CIBLE du clic en vue monde est le PAYS cliqué — le
      // panneau proposera de désélectionner UNIQUEMENT celui-ci, pas
      // la liste entière de la sélection multiple.
      cible = nom;
    }
    ouvrirPanneau(cible);
    return { ok: true, optionCount: options.length };
  }

  function ouvrirPanneau(cible) {
    var S = A(), V = S.vue();
    origine = { vueAdmin: V.type !== 'monde', paysId: V.paysId,
                etat: etatSnapshot(), chaine: chaineZones(), journal: [] };
    options = construireOptions(cible);
    choisi = 0;
    if (panneau && panneau.parentNode && panneau.parentNode.removeChild)
      panneau.parentNode.removeChild(panneau);
    if (typeof document !== 'undefined' && document.body) dessinerPanneau();
  }

  function dessinerPanneau() {
    panneau = el('div', { id: 'prisme2-sel' });
    panneau.style.cssText = 'position:fixed;z-index:84;background:#fff;border:1px solid #bbb'
      + ';border-radius:6px;padding:10px;font:13px system-ui;width:320px;max-height:70vh'
      + ';overflow:auto;box-shadow:0 2px 8px rgba(0,0,0,.18)';
    var t = el('div', {}); t.innerHTML = '<b>Désélection</b> — propositions du contexte :';
    panneau.appendChild(t);
    var nomGroupe = (options[0] && options.length > 1) ? '' : ' (aucune autre proposition : Alt+clic sans sélection multiple)';
    for (var i = 0; i < options.length; i++) {
      var ligne = el('div', {}); ligne.style.marginTop = '6px';
      var r = el('input', { type: 'radio', name: 'prisme2-sel-opt', value: String(i) });
      r.checked = i === choisi;
      (function (idx) {
        r.addEventListener('change', function () { choisir(idx); });
      })(i);
      ligne.appendChild(r);
      ligne.appendChild(txt(' ' + options[i].label));
      panneau.appendChild(ligne);
    }
    var boutons = el('div', {}); boutons.style.marginTop = '10px';
    var bVal = el('button', { type: 'button' }); bVal.textContent = 'Valider';
    bVal.addEventListener('click', valider);
    var bAnn = el('button', { type: 'button' }); bAnn.textContent = 'Annuler';
    bAnn.style.marginLeft = '8px';
    bAnn.addEventListener('click', annuler);
    boutons.appendChild(bVal); boutons.appendChild(bAnn);
    boutons.appendChild(txt('  (aperçu se met à jour à chaque bascule)'));
    panneau.appendChild(boutons);
    document.body.appendChild(panneau);
    position(panneau, dernierPoint.x, dernierPoint.y);
  }

  // bascule radio : restaurer l'ORIGINAL puis appliquer la proposition
  // choisie = APERÇU COMPLET EN DIRECT (peinture navigation incluse)
  function choisir(idx) {
    if (!origine || !options[idx]) return false;
    choisi = idx;
    restaurerOrigine();
    if (idx > 0) {
      try { options[idx].appliquer(origine.journal); } catch (err) {
        try { console.warn('[Prisme6 SEL] aperçu échoué : ' + err); } catch (e2) { }
      }
    }
    return true;
  }
  function valider() {
    if (!origine) return false;
    restaurerOrigine();
    var ok = true;
    if (choisi > 0 && options[choisi]) try { options[choisi].appliquer(origine.journal); } catch (err) { ok = false; }
    origine.journal.length = 0;
    origine = null;
    fermerPanneau();
    return ok;
  }
  function annuler() {
    restaurerOrigine();
    origine = null;
    fermerPanneau();
  }
  function fermerPanneau() {
    if (panneau && panneau.parentNode && panneau.parentNode.removeChild)
      panneau.parentNode.removeChild(panneau);
    panneau = null;
  }
  function ouvert() { return !!origine; }

  // ---------- v7.10 : INTERPRÉTATION UNIQUE DES CLICS ----------
  // Dans un VRAI navigateur, ECharts envoie e.event = ENVELOPPE zrender,
  // l'événement DOM est niché plus bas (e.event.event, .rawEvent…). La
  // lecture directe e.event.shiftKey était TOUJOURS undefined : Maj et
  // Alt ne marchaient que dans les harnais (événements plats). On
  // descend la chaîne d'enveloppes jusqu'à l'événement DOM.
  function touche(e, cle) {
    var ev = e && e.event, n = 0;
    while (ev && n++ < 6) {
      if (ev[cle] !== undefined) return !!ev[cle];
      ev = ev.event || ev.rawEvent || ev.originalEvent || null;
    }
    return false;
  }
  // Drapeau posé par TOUT clic sur une zone NOMMÉE : seul un clic
  // « vide » (zr sans aucune zone touchée) déclenche la désélection
  // totale. Ordre garanti : greffon-pays (série) est branché AVANT le
  // zr du greffon-sélection dans le vrai navigateur — le drapeau est
  // donc déjà posé quand zrClic s'exécute.
  var clicNommeFlag = false;
  // v7.17 : point du 2e clic pays en attente d'arrivée du package (la
  // descente async re-tentera la sélection de la région sous le curseur).
  var pendPoint = null;
  // v7.17 : AJOUT d'une zone (région) à la sélection multiple de niveaux 2
  // — mécanisme : 1er clic pays, 2e clic pays = régions + région du clic
  // sélectionnée, clics suivants sur d'autres régions = ajout (multi-N2).
  function selectionnerZone(S, idZone) {
    if (!idZone || !S.etat) return false;
    var selZ = (S.etat.selections || []).slice();
    if (selZ.indexOf(idZone) !== -1) return false;
    selZ.push(idZone);
    if (typeof S.selEnvoyer === 'function') S.selEnvoyer('clic-zone', selZ); // v7.30
    else S.etat.selections = selZ;
    if (S.effacerSurvol) S.effacerSurvol();
    if (S.majEtiquettes) S.majEtiquettes();
    return true;
  }
  // v7.17 : appelé par le noyau en FIN de descente réussie — si un point
  // était en attente (package chargé après le 2e clic), la région sous le
  // curseur rejoint la sélection maintenant que la vue régions existe.
  function retenterPoint() {
    if (!pendPoint) return;
    var px = pendPoint.px; pendPoint = null;
    var S = A();
    if (!S || !S.zoneAuPoint) return;
    var fz = S.zoneAuPoint(px);
    if (fz) selectionnerZone(S, fz.id);
  }
  function ajouterPays(idX) {
    var S = A();
    try { if (S.ajouterAuGroupe(idX)) return true; } catch (err) { }
    if (S.chargerPackage) {
      try {
        return S.chargerPackage(idX, function () {
          try { S.ajouterAuGroupe(idX); } catch (err) { }
        });
      } catch (err) { return false; }
    }
    return false;
  }
  // TOUTE la sémantique d'un clic carte : Alt (panneau), Maj (ajouts :
  // pays, extérieur, sœur, zone), sélection/descente pays, x-pays,
  // validation n2→n3. C'EST LE GESTIONNAIRE UNIQUE — greffon-pays
  // délègue ici (trampoline) dès que __PR2_SEL.traiteClic existe.
  function traiteClic(e) {
    var S = A(); if (!S || !S.vue) return false;
    var V = S.vue();
    var estSerie = !!(e && e.componentType === 'series' && e.seriesType === 'map');
    var nom = (e && e.name) || null;
    var maj = touche(e, 'shiftKey'), alt = touche(e, 'altKey');
    // Drapeau « clic nommé » :
    // v7.17 : le SOCLE (mer autour des pays, fond de la vue) n'est PAS une
    // « zone nommée » : il posait le drapeau et le clic zrender suivant
    // (même clic physique dans le vide) était consommé silencieusement —
    // la DESÉLECTION par clic dans une zone vide ne fonctionnait plus.
    if (nom && nom !== 'socle' && nom.slice(0, 6) !== 'socle@') clicNommeFlag = true;
    // v7.12 : un clic INTERPRÉTÉ éteint le survol — sinon, la série étant
    // recréée par le setOption du changement de sélection, ECharts ne
    // renvoie pas mouseout et le pays cliqué restait en teinte de SURVOL
    // au lieu de rejoindre la teinte de sélection multiple (mi-chemin).
    if (nom && S.effacerSurvol) S.effacerSurvol();
    if (!estSerie || !nom) return true; // geo déjà vu côté série ; vide → zr
    // ── ALT : panneau de désélection (pas de réouverture en cascade)
    if (alt) { if (!origine) altClic(e); return true; }
    function alias(id) {
      var pkgs = window.__PR2_PKGS || {};
      var f = pkgs.manifest && pkgs.manifest.pays ? pkgs.manifest.pays[id] : null;
      return (f && f.alias && S.parId[f.alias]) ? f.alias : id;
    }
    // ── VUE MONDE : Maj=AJOUT, pays déjà sélectionné=descente, sinon=SÉLECTION
    if (V.type === 'monde') {
      if (!S.parId[nom]) return true;
      var idP = alias(nom);
      if (maj && S.reinitialiserVers && (!S.etat || S.etat.selection !== idP)) {
        S.reinitialiserVers(idP, 1, null, true);      // AJOUT pays supplémentaire
      } else if (S.etat && S.etat.selection === idP) {
        // v7.23 : 2e clic — descente aux régions, SANS auto-sélection
        // de la région sous le curseur (le retour au un-clic retire
        // l'étape « sélection » à TOUS les niveaux : la région cliquée
        // s'ouvre désormais en un clic depuis la vue régions).
        S.descendre(idP);
      } else {
        S.reinitialiserVers(idP, 1, null, false);      // 1er clic : sélection
      }
      return true;
    }
    if (nom.slice(0, 6) === 'socle@' || nom === 'socle') return true;
    // ── PAYS EXTÉRIEUR x- : Maj=vue combinée au même niveau, sinon sélection
    if (nom.slice(0, 2) === 'x-') {
      var idX = alias(nom.slice(2));
      if (maj && S.ajouterAuGroupe) {
        if (ajouterPays(idX)) return true;
        if (S.parId[idX] && S.ouvrir) S.ouvrir(idX, 1, null); // repli n1
        return true;
      }
      if (S.parId[idX] && S.ouvrir) S.ouvrir(idX, 1, null);
      return true;
    }
    // ── MAJ+SŒUR (v0.52) : les enfants de la sœur rejoignent la vue
    // v7.30 : PRÉCÉDENCE ZONE DE LA VUE — un nom qui est AUSSI celui d'une
    // zone de la vue désigne la ZONE (jamais la sœur homonyme).
    if (maj && S.ajouterSousVue && V.soeurs && !(V.parNom && V.parNom[nom])) {
      var fzS = null;
      (V.soeurs || []).forEach(function (f) {
        if (!fzS && (f.id === nom || f.nom === nom || ('c-' + f.id) === nom)) fzS = f;
      });
      if (fzS && S.ajouterSousVue(fzS)) return true;
    }
    // ── v7.19 : CLIC SIMPLE SUR UNE SŒUR du niveau JUSTE INFÉRIEUR — ses
    // enfants REJOIGNENT la vue au niveau courant (multi-N2 au niveau 3 :
    // sélection de plusieurs régions, descente dans les départements de
    // l'une, puis clic simple sur une autre région pour afficher AUSSI ses
    // départements). Avant, ce clic tombait dans la descente, échouait sur
    // le nom « c-XXX » (absent des données) et affichait « aucune
    // subdivision plus fine disponible ». La sœur doit être du niveau
    // immédiatement supérieur (__niv = niveau de la vue - 1) et avoir des
    // enfants ; un nouveau clic les RETIRE (bascule, comme au Maj+clic).
    // v7.31 : PLUS DE GARDE __niv — l'étiquette est PÉRIMABLE (les sœurs
    // reconduites après bascules/retours gardent celle de l'ancienne
    // vue : le clic simple tombait alors dans le repli de descente,
    // affichait « aucune subdivision plus fine » et il fallait cliquer
    // DEUX fois). Le CŒUR (ajouterSousVue) décide seul via la PROFONDEUR
    // ADMIN : descendants ajoutés au niveau de la vue, quel que soit le
    // niveau réel de la sœur.
    if (!maj && S.ajouterSousVue && V.soeurs
        && (!V.parNom || !V.parNom[nom])) {
      var fzC = null;
      (V.soeurs || []).forEach(function (f) {
        if (!fzC && (f.nom === nom || ('c-' + f.id) === nom
          || (f.id === nom && String(nom).slice(0, 2) !== 'c-'))) fzC = f;
      });
      if (fzC && S.ajouterSousVue(fzC)) return true;
    }
    // ── MAJ+ZONE DE LA VUE : bascule dans la sélection de niveau
    // v7.30 : la zone est désignée par sa CLEF QUALIFIÉE « 2:a3¤parent¤nom »
    // (S.cleSel) — deux homonymes ne partagent plus leur entrée ; repli nom
    // pour les zones sans ancres. Mutation VIA LA MACHINE À ÉTATS.
    if (maj && S.etat && V.parNom && V.parNom[nom]) {
      var fzQ = V.parNom[nom];
      var cleQ = (typeof S.cleSel === 'function') ? S.cleSel(fzQ) : null;
      if (!cleQ) cleQ = nom;
      var selZ = (S.etat.selections || []).slice();
      var posZ = selZ.indexOf(cleQ);
      if (posZ !== -1) selZ.splice(posZ, 1); else selZ.push(cleQ);
      if (typeof S.selEnvoyer === 'function') S.selEnvoyer('maj-zone', selZ);
      else S.etat.selections = selZ;
      if (S.majEtiquettes) S.majEtiquettes();
      return true;
    }
    // ── v7.23 : VUE RÉGIONS (admin niveau 1) — clic simple = DESCENTE
    // IMMÉDIATE (retour au un-clic, suppression de l'étape « sélection »
    // v7.17 et de l'info-bulle de confirmation v7.8 : les packages pays
    // étant chargés au premier écran du pays, les données des sous-zones
    // sont déjà présentes — la confirmation n'apportait rien et donnait
    // l'impression d'un « double clic » obligatoire, voire de données
    // manquantes au niveau 3). Maj+clic bascule toujours la sélection
    // multi-N2 manuellement ; les niveaux plus profonds descendent comme
    // avant.
    // ── DESCENTE : validation n2→n3 d'abord, puis descente/demande
    if (!validerDescente(nom)) return true; // info-bulle ouverte : bloqué
    if (!S.descendreSous(nom)) {
      // pas d'enfants au niveau suivant : proposer le niveau déjà
      // connu, et donner un RETOUR VISUEL en fin de chaîne (v7.2 :
      // message persistant, sans masquage automatique — la vue ne
      // change pas).
      var demande = false;
      try { demande = S.demanderSous(nom); } catch (err) { }
      var info = (typeof document !== 'undefined') ? document.getElementById('prisme2-info') : null;
      if (!demande) {
        if (info) {
          // v7.33 : PLAFOND NIVEAU 4 — depuis une vue de niveau app 2
          // (départements / comtés), le message dit que le niveau
          // utilisateur 4 n'est plus proposé.
          var Vinf = (typeof S.vue === 'function') ? S.vue() : null;
          info.textContent = (Vinf && Vinf.type !== 'monde' && (Vinf.niveau || 1) >= 2)
            ? 'Les niveaux 4 (arrondissements, districts…) ne sont plus proposés — l\u2019application s\u2019arrête au niveau 3.'
            : '« ' + nom + ' » : aucune subdivision plus fine disponible dans les données.';
          info.style.display = 'block';
        }
      } else if (info) info.style.display = 'none';
    } else {
      var infoOk = (typeof document !== 'undefined') ? document.getElementById('prisme2-info') : null;
      if (infoOk) infoOk.style.display = 'none';
    }
    return true;
  }
  // ── CLIC « VIDE » AU NIVEAU ZRENDER : ECharts n'émet AUCUN événement
  // série quand on clique la mer ; seul le zr voit passer le clic. Zr
  // d'un clic nommé : drapeau déjà posé → consommé silencieusement.
  function zrClic() {
    if (clicNommeFlag) { clicNommeFlag = false; return; }
    clicVide();
  }
  function brancherZr(carte) {
    try { if (carte && carte.getZr) carte.getZr().on('click', zrClic); } catch (err) { }
  }

  // ---------- export : LE point d'entrée unique des règles ----------
  window.__PR2_SEL = {
    clicVide: clicVide, altClic: altClic,
    validerDescente: validerDescente, descenteAttente: descenteAttente,
    confirmerDescente: confirmerDescente, annulerDescente: annulerDescente,
    ouvrirPanneau: ouvrirPanneau, choisir: choisir, valider: valider,
    infoBulleOuverte: function () { return !!boiteValidation; },
    traiteClic: traiteClic, touche: touche, zrClic: zrClic, brancherZr: brancherZr,
    selectionnerZone: selectionnerZone, retenterPoint: retenterPoint, // v7.17
    annuler: annuler, ouvert: ouvert,
    options: function () { return options.map(function (o) { return o.label; }); },
    journalTaille: function () { return origine && origine.journal ? origine.journal.length : -1; }
  };
  // v7.10 : brancher le clic zr (clic vide) dès que la carte existe
  (function () {
    var S = window.__PR2;
    if (S && S.carte && S.carte()) { brancherZr(S.carte()); return; }
    if (S && S.apresDemarrage) S.apresDemarrage(brancherZr);
  })();
})();
