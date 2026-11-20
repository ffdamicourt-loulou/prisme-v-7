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
    e.selection = s.selection; e.selections = (s.selections || []).slice();
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
    S.etat.selections = [];
    S.etat.selectionZone = null;
    if (S.majEtiquettes) S.majEtiquettes(); // REPEINT la carte, caméra intacte
    return { ok: true };
  }

  // ---------- R2 : validation info-bulle de la descente n2→n3 ----------
  // Le greffon pays appelle validerDescente(nom) AVANT de descendre :
  // true → descente immédiate autorisée ; false → bloquée, l'info-bulle
  // attend la confirmation (seul cas bloqué : clic d'une zone dans la
  // vue du NIVEAU 1 app = régions/États, c.-à-d. la descente UTILISATEUR
  // « niveau 2 → niveau 3 » ; l'acceptation du package « Charger ? »
  // reste inchangée au niveau 2).
  function validerDescente(nom) {
    var S = A(), V = S.vue();
    if (V.type !== 'admin' || V.niveau !== 1) return true;
    // garde : seulement les zones qui ONT des enfants (le package du pays
    // est déjà chargé pour ouvrir la vue régions, ADMIN fait foi). Une zone
    // de fin de chaîne ne déclenche PAS d'info-bulle — l'information
    // « pas de subdivision plus fine » reste au clic simple.
    var enfants = null;
    try { enfants = S.enfantsDe ? S.enfantsDe(nom) : null; } catch (err) { enfants = null; }
    if (!enfants || !enfants.length) return true;
    enAttenteDescente = { nom: nom };
    ouvrirBoiteValidation(nom);
    return false;
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
      var selPays = [];
      if (e.selection) selPays.push(e.selection);
      (e.selections || []).forEach(function (id) { if (selPays.indexOf(id) === -1) selPays.push(id); });
      selPays.forEach(function (id) {
        opts.push({
          label: 'Désélectionner ' + nomPaysDe(id) + ' (' + id + ')',
          type: 'etat',
          appliquer: function () {
            if (e.selection === id) e.selection = null;
            e.selections = (e.selections || []).filter(function (x) { return x !== id; });
          }
        });
      });
      if (selPays.length) opts.push({
        label: 'Tout désélectionner (' + selPays.length + ' pays)',
        type: 'etat',
        appliquer: function () { e.selection = null; e.selections = []; }
      });
      return opts;
    }
    // ---- vue admin : pays courant (et groupe éventuel) ----
    var paysIds = (V.paysIds && V.paysIds.length) ? V.paysIds : [V.paysId];
    var multi = paysIds.length > 1 || (e.selections || []).length > 0;
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
        e.selection = null; e.selections = []; e.selectionZone = null;
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
    if (nom) clicNommeFlag = true;
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
        S.descendre(idP);                              // 2e clic : descente
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
    if (maj && S.ajouterSousVue && V.soeurs) {
      var fzS = null;
      (V.soeurs || []).forEach(function (f) {
        if (!fzS && (f.id === nom || f.nom === nom || ('c-' + f.id) === nom)) fzS = f;
      });
      if (fzS && S.ajouterSousVue(fzS)) return true;
    }
    // ── MAJ+ZONE DE LA VUE : bascule dans la sélection de niveau
    if (maj && S.etat && V.parNom && V.parNom[nom]) {
      var selZ = (S.etat.selections || []).slice();
      var posZ = selZ.indexOf(nom);
      if (posZ !== -1) selZ.splice(posZ, 1); else selZ.push(nom);
      S.etat.selections = selZ;
      if (S.majEtiquettes) S.majEtiquettes();
      return true;
    }
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
          info.textContent = '« ' + nom + ' » : aucune subdivision plus fine disponible dans les données.';
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
