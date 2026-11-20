  // v0.99 : COMPTEUR DE ZOOM — badge en bas à droite du viewport.
  var compteurZoom = null;
  function majCompteurZoom() {
    try {
      if (!compteurZoom) {
        compteurZoom = document.getElementById('prisme2-zoom');
        if (!compteurZoom) {
          compteurZoom = document.createElement('div');
          compteurZoom.id = 'prisme2-zoom';
          compteurZoom.style.position = 'absolute';
          compteurZoom.style.right = '12px';
          compteurZoom.style.bottom = '10px';
          compteurZoom.style.font = '12px/1.4 system-ui, sans-serif';
          compteurZoom.style.color = '#3a5a78';
          compteurZoom.style.background = 'rgba(255,255,255,0.8)';
          compteurZoom.style.padding = '2px 9px';
          compteurZoom.style.borderRadius = '9px';
          compteurZoom.style.pointerEvents = 'none';
          compteurZoom.style.zIndex = 30;
          var cont = document.getElementById('prisme2') || document.body;
          if (cont && cont.appendChild) cont.appendChild(compteurZoom);
        }
      }
      if (compteurZoom) compteurZoom.textContent = 'zoom ' + (Math.round(etat.zoom * 10) / 10) + '×';
    } catch (e) { }
  }
  var etiquettesEnAttente = false;
  function planifierEtiquettes() {
    if (delaiEtiquettes) { etiquettesEnAttente = true; return; }
    delaiEtiquettes = setTimeout(function () {
      delaiEtiquettes = null;
      try { majEtiquettes(); } catch (e) { }
      if (etiquettesEnAttente) {
        etiquettesEnAttente = false;
        planifierEtiquettes();
      }
    }, 90);
  }

  function ajusterSur(b, fractionHauteur) {
    var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    var w = carte.getWidth(), h = carte.getHeight();
    var z = etat.zoom;
    var p1 = carte.convertToPixel({ geoIndex: 0 }, [b[0], b[1]]);
    var p2 = carte.convertToPixel({ geoIndex: 0 }, [b[2], b[3]]);
    if (p1 && p2 && isFinite(p1[0]) && isFinite(p1[1]) && isFinite(p2[0]) && isFinite(p2[1])) {
      var bw = Math.max(Math.abs(p2[0] - p1[0]) / etat.zoom, 8);
      var bh = Math.max(Math.abs(p2[1] - p1[1]) / etat.zoom, 8);
      // v0.79 : MODE « FRACTION DE HAUTEUR » (fractionHauteur = 0,80) —
      // demandé pour TOUTES les vues de niveaux 1/2/3 : la sélection occupe
      // 80 % de la HAUTEUR du viewport, la largeur n'est plus qu'une borne
      // (0,98) pour ne pas sortir de l'écran. L'ancien min(w/bw, h/bh) à
      // 0,62 limitait le zoom par la LARGEUR des zones étalées (oblast de
      // Tomsk, Nord-du-Québec…) : le passage au niveau inférieur faisait un
      // DÉZOOM « sans raison ». Vue monde : comportement inchangé (0,62).
      if (fractionHauteur) {
        z = Math.max(1, Math.min(60, Math.min(fractionHauteur * h / bh, 0.98 * w / bw)));
      } else {
        z = Math.max(1, Math.min(60, 0.62 * Math.min(w / bw, h / bh)));
      }
    }
    etat.zoom = z; etat.centre = [cx, cy];
    carte.setOption({ geo: { zoom: z, center: [cx, cy] } });
    majEtiquettes();
  }

  // Clic sur un pays : centrage, le pays occupe 65 % de la HAUTEUR du viewport
  // v0.45 : (1) les COMPOSANTES DÉTACHÉES de grande taille (seule l'Alaska
  // dans le monde, ~279°²) comptent dans le cadre — boitePrincipale ne garde
  // que le plus grand anneau (le CONUS des États-Unis) et la SÉLECTION de
  // niveau 1 des États-Unis se cadrait SANS l'Alaska, alors que les descentes
  // la comptent (règle v0.40) ; (2) borne de LARGEUR : une boîte très étendue
  // en longitude (Alaska → Maine, ~101°) dépassait l'écran en largeur au zoom
  // « 65 % de la hauteur » et l'Alaska ou le Maine restait hors champ — le
  // zoom est plafonné pour que la boîte tienne aussi en largeur (0,90).
  function centrerSur(pays, fraction, borneZoom) {
    // v0.98 : BORNE PARAMÉTRABLE — les sélections de NIVEAU 3 (petites
    // feuilles) peuvent être cadrées au-delà du zoom maxi historique (60)
    // pour occuper fraction (0,70) de la hauteur du viewport.
    // v0.73 : FRACTION DE HAUTEUR PARAMÉTRABLE — la règle de sélection
    // v0.73 cadre un pays sélectionné à 80 % de la hauteur du viewport
    // (fraction 0,80) ; le cadrage interne du noyau (reinitialiserVers)
    // reste à 65 % par défaut.
    // v0.80m : RUSSIE ET ANTIMÉRIDIEN — la Russie est stockée « dépliée »
    // jusqu'à 190° (Tchoukotka). L'ancien calcul normalisait les longitudes
    // > 180 (boîte étalée sur ~360°, centre au milieu de l'Atlantique) et
    // la sélection débordait du viewport à gauche et à droite. Désormais :
    // (1) la boîte PRINCIPALE reste en longitudes BRUTES (19,6→190,4 pour
    // la Russie → cadrage continu, centre à 105°) ; (2) chaque composante
    // détachée (Alaska, Tchoukotka) est replacée au multiple de 360° qui
    // MINIMISE la largeur de l'union ; (3) le zoom est calculé
    // ANALYTIQUEMENT avec le modèle de projection du noyau (tailleCarte,
    // 360° en largeur, 350° en hauteur) — plus de convertToPixel, qui
    // mélange l'échelle réelle d'ECharts, le roam et le zoom courant.
    var FR = fraction || 0.65;
    var b = boitePrincipale(pays.geometry);
    composantesDetachees(pays.id).forEach(function (bd0) {
      var meilleur = null;
      [0, 360, -360].forEach(function (s) {
        var bd = [bd0[0] + s, bd0[1], bd0[2] + s, bd0[3]];
        var wu = Math.max(b[2], bd[2]) - Math.min(b[0], bd[0]);
        if (!meilleur || wu < meilleur.wu) meilleur = { bd: bd, wu: wu };
      });
      b = [Math.min(b[0], meilleur.bd[0]), Math.min(b[1], meilleur.bd[1]),
           Math.max(b[2], meilleur.bd[2]), Math.max(b[3], meilleur.bd[3])];
    });
    var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    var LS = tailleCarte() || 1200;
    var w = carte.getWidth(), h = carte.getHeight();
    var bh = Math.max(b[3] - b[1], 1e-6) * LS / 350;
    var bw = Math.max(b[2] - b[0], 1e-6) * LS / 360;
    var z = Math.min(borneZoom || 60, FR * h / bh, 0.90 * w / bw);
    etat.zoom = z; etat.centre = [cx, cy];
    carte.setOption({ geo: { zoom: z, center: [cx, cy] } });
    majEtiquettes();
  }

  // ---------- Borne du pan/zoom : la carte du monde est le cadre absolu ----------
  // La largeur maximale affichable est celle de la carte du monde : jamais de
  // dézoom laissant des espaces vides à droite et à gauche (le monde remplit
  // la largeur de l'écran), et le pan est borné à l'étendue du monde — en vue
  // monde, quand la carte remplit l'écran, le pan est impossible.
  var BBOX_MONDE = null;
  function bboxMonde() {
    if (!BBOX_MONDE) BBOX_MONDE = boiteEnsemble(DATA.pays.map(function (p) { return { geometry: p.geometry }; }));
    return BBOX_MONDE;
  }
  // v0.46 : ZOOM « CONTENIR » DU MONDE — le zoom auquel le monde ENTIER
  // remplit exactement le viewport (dimension limitante). C'est la référence
  // STABLE de la porte code/nom de la vue monde : calculée depuis la carte
  // (bbox du monde + projection), elle ne dépend d'AUCUN historique de
  // navigation, contrairement à « zoomEntree » qui était réassigné à chaque
  // entrée de descente/retour. Invalidation au resize et à chaque changement
  // de vue (appliquerVue).
  var ZOOM_CONTENU = null;
  function zoomContenuMonde() {
    if (ZOOM_CONTENU != null) return ZOOM_CONTENU;
    if (!carte || typeof carte.convertToPixel !== 'function') return etat.zoomEntree;
    try {
      var b = bboxMonde();
      var w = carte.getWidth(), h = carte.getHeight();
      var z = etat.zoom || 1;
      // v0.80 : ENROULEMENT ANTIMÉRIDIEN — la bbox du monde monte à
      // lon 190 (fragments d'enroulement de la Russie fusionnée) : dans un
      // vrai navigateur, convertToPixel(190) S'ENROULE vers l'intérieur de
      // la carte, la « largeur » du monde devenait minuscule et le zoom de
      // contenue dérivait vers ~2,4 : la porte code/nom laissait TOUS les
      // pays en code (IDs persistants), surtout visibles sur l'Asie.
      // La largeur de référence est l'étendue RÉELLE -180→+180 SANS
      // enroulement ; les latitudes restent celles de la bbox du monde.
      var lonG = Math.max(b[0], -180), lonD = Math.min(b[2], 180);
      if (lonD <= lonG) { lonG = -180; lonD = 180; }
      var pG = carte.convertToPixel({ geoIndex: 0 }, [lonG, etat.centre[1]]);
      var pD = carte.convertToPixel({ geoIndex: 0 }, [lonD, etat.centre[1]]);
      var pH = carte.convertToPixel({ geoIndex: 0 }, [etat.centre[0], b[3]]);
      var pB = carte.convertToPixel({ geoIndex: 0 }, [etat.centre[0], b[1]]);
      if (!pG || !pD || !pH || !pB || !isFinite(pG[0]) || !isFinite(pD[0])
        || !isFinite(pH[1]) || !isFinite(pB[1]) || z <= 0) return etat.zoomEntree;
      var largeur = Math.abs(pD[0] - pG[0]) / z;
      var hauteur = Math.abs(pH[1] - pB[1]) / z;
      if (!(largeur > 0) || !(hauteur > 0)) return etat.zoomEntree;
      ZOOM_CONTENU = Math.min(w / largeur, h / hauteur);
      return ZOOM_CONTENU;
    } catch (e) { return etat.zoomEntree; } // v0.46 : jamais bloquant
  }
  function bornerRoam() {
    if (!carte || typeof carte.convertToPixel !== 'function'
      || typeof carte.convertFromPixel !== 'function') return;
    var b = bboxMonde();
    var w = carte.getWidth(), h = carte.getHeight();
    var proj = function (lon, lat) { return carte.convertToPixel({ geoIndex: 0 }, [lon, lat]); };
    var pG = proj(b[0], etat.centre[1]), pD = proj(b[2], etat.centre[1]);
    var pH = proj(etat.centre[0], b[3]), pB = proj(etat.centre[0], b[1]);
    if (!pG || !pD || !pH || !pB) return;
    var largeur = Math.abs(pD[0] - pG[0]), hauteur = Math.abs(pH[1] - pB[1]);
    // 1) zoom minimal « contenir » : le monde ENTIER tient dans l'écran —
    //    largeur ET hauteur (v0.25 : l'ancien remplissage de la largeur seule
    //    rognait le haut et le bas des continents). On agrandit jusqu'à ce
    //    que la dimension LIMITANTE remplisse l'écran ; l'autre reste visible.
    var kCont = Math.min(w / largeur, h / hauteur);
    if (largeur > 0 && hauteur > 0 && kCont > 1) {
      etat.zoom = Math.min(60, etat.zoom * kCont);
      carte.setOption({ geo: { zoom: etat.zoom } });
      pG = proj(b[0], etat.centre[1]); pD = proj(b[2], etat.centre[1]);
      pH = proj(etat.centre[0], b[3]); pB = proj(etat.centre[0], b[1]);
      largeur = Math.abs(pD[0] - pG[0]); hauteur = Math.abs(pH[1] - pB[1]);
    }
    // 2) pan borné : aucun espace vide autour de la carte du monde
    var dxMax = Math.max(0, (largeur - w) / 2), dyMax = Math.max(0, (hauteur - h) / 2);
    var cMonde = proj((b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
    var dx = cMonde[0] - w / 2, dy = cMonde[1] - h / 2;
    var dx2 = Math.max(-dxMax, Math.min(dxMax, dx));
    var dy2 = Math.max(-dyMax, Math.min(dyMax, dy));
    if (dx2 !== dx || dy2 !== dy) {
      // ramener le centre du monde à (w/2+dx2, h/2+dy2) : on convertit le
      // pixel dont l'ÉCART au centre du monde vaut exactement dx - dx2
      var nc = carte.convertFromPixel({ geoIndex: 0 }, [w / 2 + dx - dx2, h / 2 + dy - dy2]);
      if (nc && isFinite(nc[0]) && isFinite(nc[1])) {
        etat.centre = [nc[0], nc[1]];
        carte.setOption({ geo: { center: etat.centre } });
      }
    }
  }

  // ---------- Descente administrative ----------
  // v0.56 : extra = { exclus: [ids de pays à NE PAS réenregistrer comme
  // extérieurs], socles: [socles des AUTRES membres d'une vue combinée] }.
  // Depuis une vue combinée, descendre dans un membre ne doit pas repeindre
  // l'autre membre en pays extérieur SANS BORDURE par-dessus ses zones
  // sœurs « c- » (les frontières intérieures disparaissaient, les noms
  // restaient — seules les étiquettes survivaient).
  // v0.74 : ENCLAVES — détection générique des territoires enclavés.
  // Une zone A est enclave d'une zone B si la bbox de A est incluse dans
  // celle de B ET que deux points de A (le centroïde de son plus grand
  // anneau et le sommet le plus éloigné de ce centroïde) sont à l'intérieur
  // de B. L'hôte retenu est le PLUS PETIT des conteneurs (l'enclave directe).
