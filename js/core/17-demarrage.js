  function demarrer(conteneur) {
    conteneurCarte = conteneur;
    echarts.registerMap('prisme2', fc);
    carte = echarts.init(conteneur, null, { renderer: 'canvas' });
    var optDemarrage = optionsBase();
    carte.setOption(optDemarrage);
    try { cacherRegions((optDemarrage.geo && optDemarrage.geo.regions) || []); } catch (eCache) { }
      // v0.80e : le cache du survol chirurgical existe dès le premier paint —
      // sinon le TOUT PREMIER survol tombait dans le repli complet et, avec
      // survolNom déjà posé, enregistrait la couleur de survol comme couleur
      // de repos (le survol « collait » ensuite à la zone : plus de retour).
    initSurvol();
    if (typeof document !== 'undefined') {
      fil = document.getElementById('prisme2-fil');
      if (fil) fil.style.display = 'none';
    }

    carte.on('georoam', function () {
      // v0.80g : PENDANT l'animation d'un cran, chaque frame interpole le
      // rendu — etat porte déjà la CIBLE (posée synchrone). Resynchroniser
      // etat sur la valeur INTERMÉDIAIRE, borner et repeindre à chaque
      // frame (getOption sur l'option complète = clonage lourd) ferait
      // dériver la cible et ramer. On ne fait RIEN jusqu'à la fin.
      if (zoomAnim) return;
      var o = carte.getOption();
      var geo = o.geo && o.geo[0];
      if (geo && geo.zoom) { etat.zoom = geo.zoom; if (geo.center) etat.centre = geo.center; }
      majCompteurZoom(); // v0.99 : compteur à chaque molette
      // La carte du monde est le cadre : largeur max = celle du monde, pan
      // borné (impossible en vue monde quand la carte remplit l'écran).
      bornerRoam();
      // v0.78 : PLUS DE REMONTÉE AUTOMATIQUE au dézoom. La v0.28 ramenait
      // automatiquement à la vue monde dès que le zoom passait sous
      // l'échelle d'entrée du niveau 1 : la sélection paraissait « perdue »
      // (le pays restait seul, en teinte de sélection, sans ses
      // subdivisions — signalé v0.78). La vue et la sélection sont
      // désormais CONSERVÉES à tout niveau jusqu'à une action EXPLICITE :
      // clic sur un autre pays, Alt+clic, bouton retour du fil d'Ariane,
      // ou clic droit (v0.78, greffon sélection).
      // v0.52 : aux niveaux 2/3, le dézoom CONSERVE la vue courante (la
      // sélection peinte et les abréviations suivent le zoom).
      // v0.71 : la sélection peinte EST conservée par le transform natif —
      // un repaint n'est utile que si le ZOOM a changé (visibilité, taille
      // et abréviations des étiquettes) ou si le bornage l'a corrigé ; à
      // zoom constant (pan pur) on ne re-projette plus les ~67 000 segments
      // de frontières toutes les 90 ms.
      // v0.46 : THROTTLE à bord descendant avec REPAINT TRAÎNANT —
      // l'ancien « clearTimeout + setTimeout(90) » REMETTAIT le compteur à
      // zéro à CHAQUE georoam : pendant les orages d'événements (animation
      // de 450 ms du bornage → setOption → nouveau georoam…), le repaint
      // était repoussé indéfiniment et les étiquettes restaient périmées
      // après plusieurs zoom/dézoom. Désormais le PREMIER événement peint
      // sous 90 ms, et un dernier repaint est garanti après le dernier
      // événement de la rafale.
      // v0.80e : pendant l'animation d'un cran de molette (zoomAnim), le
      // repaint complet des étiquettes est SUSPENDU — il n'a lieu qu'UNE
      // fois, à la fin de l'animation (pas un par cran, d'où les saccades).
      if (!zoomAnim && etat.zoom !== zoomDernierRepaint) planifierEtiquettes();
    });

    // ── v0.65 : MOLETTE — CRAN FIN + CHEMIN NATIF ───────────────────────────
    // (v0.64 : l'effet de rebond a été retiré à la demande de l'utilisateur —
    // retour au cran simple v0.63.) Deux règles, intégrées au noyau :
    //
    // (1) CRAN FIN — l'app prend en main la molette (preventDefault en
    //     capture : le zoom interne d'ECharts ne s'applique pas) et applique
    //     ×1,30 (défilement rapide), ×1,15 (cran standard), ×1,075 (cran
    //     lent). v0.52 appliquait ×1,75/×1,5/×1,375 : un cran était un saut
    //     brutal. La molette devient progressive (≈5 crans pour le zoom
    //     d'avant).
    //
    // (2) CHEMIN NATIF — chaque cran est envoyé par l'ACTION « geoRoam »
    //     d'ECharts, avec l'ancre sous le curseur : le MÊME chemin de
    //     calcul et d'affichage que le PAN (transform de canvas
    //     « updateTransform », zéro reprojection — les frontières glissent
    //     avec le reste). ECharts écrit lui-même le zoom/centre dans le
    //     modèle et émet « georoam » : le handler existant resynchronise
    //     etat, borne le cadrage, applique la règle dézoom → monde et
    //     rafraîchit les étiquettes — le flux exact du glisser. (Un
    //     setOption direct, lui, repasse par le pipeline complet :
    //     reprojection des ~67 000 segments de frontières à chaque cran,
    //     d'où les saccades des versions précédentes.)
    // ── v0.80e : ZOOM ANIMÉ (molette fluide) ──────────────────────────────
    // Chaque cran est INTERPOLÉ sur 180 ms (ease-out cubique) par petites
    // étapes « geoRoam » natives (transform canvas : zéro reprojection,
    // ancre sous le curseur), et le REPAINT complet des étiquettes
    // n'intervient qu'UNE FOIS, à la fin. Avant v0.80e, chaque cran
    // appliquait un saut sec ×1,075 PUIS un repaint complet synchrone :
    // à la molette en rafale l'écran se gelait à chaque cran (saccades).
    // Sans requestAnimationFrame (harnais), l'ancien chemin immédiat
    // est conservé à l'identique.
    var zoomAnim = null;   // { t0, z0, zPrev } interpolation en cours
    var cibleZoom = null;  // { z, c, ox, oy } état final visé
    var ZOOM_DUREE = 180;  // ms
    // v0.80g : HORLOGE UNIQUE. Dans le navigateur, le timestamp de rAF est
    // « performance.now » (petites valeurs depuis le chargement de la page),
    // PAS « Date.now » (epoch) : le mélange des deux laissait t à 0 pour
    // toujours — chaque frame émettait un geoRoam facteur 1 (no-op) en
    // boucle et, zoomAnim ne devenant jamais null, le repaint restait
    // suspendu : LE ZOOM ÉTAIT MORT. On ignore le paramètre ts et on lit
    // la même horloge des deux côtés.
    var horlogeAnime = function () {
      try { return (window.performance && typeof window.performance.now === 'function') ? window.performance.now() : Date.now(); } catch (e) { return Date.now(); }
    };
    function demarrerZoomAnime(nz, centre, ox, oy) {
      try {
        var o = carte.getOption();
        var zr = o && o.geo && o.geo[0] && o.geo[0].zoom;
        if (!isFinite(zr) || !(zr > 0)) return false;
        cibleZoom = { z: nz, c: centre, ox: ox, oy: oy };
        if (zoomAnim) { zoomAnim.z0 = zoomAnim.zPrev; zoomAnim.t0 = horlogeAnime(); return true; }
        zoomAnim = { t0: horlogeAnime(), z0: zr, zPrev: zr };
        window.requestAnimationFrame(pasZoomAnime);
        return true;
      } catch (e) { return false; }
    }
    function pasZoomAnime() {
      if (!zoomAnim || !cibleZoom) { zoomAnim = null; return; }
      var t = Math.min(1, Math.max(0, (horlogeAnime() - zoomAnim.t0) / ZOOM_DUREE));
      var ease = 1 - Math.pow(1 - t, 3); // ease-out cubique
      var zNow = zoomAnim.z0 * Math.pow(cibleZoom.z / zoomAnim.z0, ease);
      if (!(zNow > 0) || !isFinite(zNow)) { zoomAnim = null; planifierEtiquettes(); return; }
      var facteur = zNow / zoomAnim.zPrev;
      try {
        carte.dispatchAction({ type: 'geoRoam', componentType: 'geo', geoIndex: 0,
          zoom: facteur, originX: cibleZoom.ox, originY: cibleZoom.oy });
      } catch (err) { zoomAnim = null; planifierEtiquettes(); return; }
      zoomAnim.zPrev = zNow;
      if (t >= 1) {
        zoomAnim = null;
        // v0.80g : le bornage (monde entier visible, pan limité) est
        // appliqué à la fin de l'animation, comme sur l'ancien chemin
        // immédiat où chaque georoam passait par bornerRoam().
        try { bornerRoam(); } catch (e) { }
        // une SEULE passe complète d'étiquettes, après l'animation
        planifierEtiquettes();
        return;
      }
      window.requestAnimationFrame(pasZoomAnime);
    }
    function pasMolette(deltaY) {
      var r = Math.abs(deltaY) / 40; // zrDelta ECharts (±120 de wheelDelta / 3)
      return r > 3 ? 1.3 : r > 1 ? 1.15 : 1.075;
    }
    function zoomMolette(deltaY, px, py) {
      if (!isFinite(deltaY) || deltaY === 0) return false;
      var s = pasMolette(deltaY);
      var f = deltaY < 0 ? s : 1 / s; // facteur du cran (relatif au rendu)
      var z = etat.zoom;
      var nz = deltaY < 0 ? z * s : z / s;
      if (!isFinite(nz) || nz <= 0) return false;
      nz = Math.max(0.85, Math.min(600, nz)); // v0.98 : même borne que scaleLimit (600 : sélections n3 profondes)
      var cx = etat.centre[0], cy = etat.centre[1];
      var g = null;
      if (typeof px === 'number' && typeof py === 'number') {
        try { g = carte.convertFromPixel({ geoIndex: 0 }, [px, py]); } catch (e) { g = null; }
      }
      if (g && isFinite(g[0]) && isFinite(g[1])) {
        // le point sous le curseur reste à l'écran : c' = g + (z/z')·(c − g)
        var k = z / nz;
        cx = g[0] + k * (cx - g[0]);
        cy = g[1] + k * (cy - g[1]);
      }
      // L'ÉTAT est posé de façon SYNCHRONE (contrat : etat.zoom/centre
      // exacts dès le cran — harnais et greffons indifférents). Le RENDU,
      // lui, suit le chemin natif décrit ci-dessus ; l'événement georoam
      // resynchronise ensuite etat sur les valeurs autoritaires.
      etat.zoom = nz; etat.centre = [cx, cy];
      var ox = (typeof px === 'number') ? px : carte.getWidth() / 2;
      var oy = (typeof py === 'number') ? py : carte.getHeight() / 2;
      // v0.80e : ZOOM ANIMÉ — interpoler le cran (180 ms, ease-out) au lieu
      // du saut sec, et ne repeindre les étiquettes qu'à la fin. L'ÉTAT
      // reste posé SYNCHRONONE (contrat harnais/greffons : etat.zoom/centre
      // exacts dès le cran) : seule la VITESSE du rendu change.
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
        && demarrerZoomAnime(nz, [cx, cy], ox, oy)) return true;
      try {
        carte.dispatchAction({ type: 'geoRoam', componentType: 'geo', geoIndex: 0,
          zoom: f, originX: ox, originY: oy });
      } catch (e) {
        // repli (sans action geoRoam) : setOption direct + bornage
        carte.setOption({ geo: { zoom: nz, center: [cx, cy] } });
        bornerRoam();
        planifierEtiquettes();
        return true;
      }
      // v0.71 : les étiquettes (taille, abréviation, code/nom) suivent le
      // cran DANS LA MÊME IMAGE — repeintes immédiatement, plus 90 ms plus
      // tard : aucun étiquetage périmé pendant un dézoom en rafale.
      majEtiquettes();
      return true;
    }
    try {
      var domMolette = carte.getDom ? carte.getDom() : null;
      if (domMolette && domMolette.addEventListener) {
        domMolette.addEventListener('wheel', function (ev) {
          if (!ev || ev.defaultPrevented) return;
          ev.preventDefault();
          ev.stopPropagation();
          var rect = (domMolette.getBoundingClientRect && domMolette.getBoundingClientRect()) || null;
          var px = rect ? ev.clientX - rect.left : null;
          var py = rect ? ev.clientY - rect.top : null;
          zoomMolette(ev.deltaY, px, py);
        }, { passive: false, capture: true });
      }
    } catch (eMolette) { }
    zoomMoletteRef = zoomMolette; // export harnais (voir __PR2)
    // v7.5 : annulation de l'interpolation en cours — branchée dans
    // appliquerVue (15-navigation.js) : tout changement de vue (ouverture
    // de pays, descente, retour, autre pays cliqué) INTERROMPT l'anim de
    // zoom, sinon ses geoRoam traînants ramenaient la caméra sur
    // l'ancienne sélection (demi-seconde après l'ouverture du nouveau).
    ANNULER_ZOOM_ANIM = function () { zoomAnim = null; cibleZoom = null; };

    window.addEventListener('resize', function () { ZOOM_CONTENU = null; carte.resize(); carte.setOption({ geo: { layoutSize: tailleCarte() } }); bornerRoam(); majEtiquettes(); });
    for (var iDm = 0; iDm < apresDemarrageFns.length; iDm++) {
      try { apresDemarrageFns[iDm](carte); } catch (eDm) { }
    }
    return carte;
  }

  // Exports pour le harnais de test
  window.__PR2 = {
    version: VERSION, assombrir: assombrir, boite: boite, sectionsZone: sectionsZone, faitTient: faitTient,
    tailles: tailles, tientDansZone: tientDansZone, MARGE_ETIQ: MARGE_ETIQ, // v0.86 : intérieur des étiquettes
    cpDe: cpDe, // v0.87 : ancre de zone (centre géométrique) — test d uniformité n1/n2/n3
    etiquettesDetail: function () { return ETQ_DETAIL; },
    etqPx: function () { return ETQ_PX; },
    zoomAffiche: function () { return compteurZoom ? compteurZoom.textContent : null; }, // v0.99 : compteur de zoom
    plafondZones: function (t) { return plafondZones(t); }, // v0.92 : plafond dynamique des noms de zones // v0.88 : anti-chevauchement zone↔ville
    altDe: altDe, // v0.89 : point le plus profond (meilleur effort de contenance)
    boitePrincipale: boitePrincipale, boiteGrappe: boiteGrappe, boiteNormalee: boiteNormalee,
    composantesDetachees: composantesDetachees, aireGeo: aireGeo, couleurTexte: couleurTexte,
    zoomContenuMonde: zoomContenuMonde, planifierEtiquettes: planifierEtiquettes,
    etiquetteVisible: etiquetteVisible, etat: etat, demarrer: demarrer, parId: parId,
    couleurs: COULEURS, assombris: assombris, selectionnes: selectionnes, textes: textes, DATA: DATA,
    vue: function () { return vue; }, pile: pile, descendre: descendre,
    descendreSous: descendreSous, retour: retour, featuresNiv1: featuresNiv1,
    reduireAuPays: reduireAuPays, bornerRoam: bornerRoam, bboxMonde: bboxMonde,
    descendPossible: descendPossible, lonOural: lonOural, coteOural: coteOural,
    idsExterne: function () {
      return vue.type === 'monde' ? [] : DATA.pays.filter(function (p) { return p.id !== vue.paysId; }).map(function (p) { return 'x-' + p.id; });
    },
    villesVisibles: function () { return villesAffichees(); }, // v0.80h : TEST villes de France seule
    demanderSous: demanderSous, validerDemande: validerDemande, annulerDemande: annulerDemande,
    demandeEnCours: function () { return cibleDemande && cibleDemande.length === 1 ? cibleDemande[0] : cibleDemande; },
    zoomMolette: function () { return zoomMoletteRef ? zoomMoletteRef.apply(null, arguments) : false; },
    carte: function () { return carte; },
    majEtiquettes: majEtiquettes, centrerSur: centrerSur, ajusterSur: ajusterSur,
    boiteEnsemble: boiteEnsemble, enfantsDe: enfantsDe, ouvrirAuNiveau: ouvrirAuNiveau,
    reinitialiserVers: reinitialiserVers, ajouterSousVue: ajouterSousVue,
    ajouterAuGroupe: ajouterAuGroupe, retirerDuGroupe: retirerDuGroupe,
    membreCourant: membreCourant,
    definirSelection: definirSelection, ouvrir: ouvrir,
    apresDemarrage: function (fn) { if (carte) { try { fn(carte); } catch (e) { } } else apresDemarrageFns.push(fn); },
  };
  if (typeof document !== 'undefined' && document.getElementById('prisme2')) {
    demarrer(document.getElementById('prisme2'));
  }
})();
