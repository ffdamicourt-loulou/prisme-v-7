  var ETQ_BOITES = [];
  // v0.86 : détail des étiquettes affichées (id, ancre, géométrie, boîte
  // demi-dimensions en degrés) — testé par le harnais (contrôle d'intériorité).
  var ETQ_DETAIL = [];
  var MARGE_ETIQ = 2; // px de MARGE TOUT AUTOUR du texte, entre la frontière et le nom
  function demiBoitePx(texte, F) {
    var L = String(texte).length;
    return [(0.70 * F * L + Math.max(0, L - 1)) / 2 + MARGE_ETIQ, F / 2 + MARGE_ETIQ];
  }
  // v0.92 : PLAFOND DE TAILLE QUI SUIT LE ZOOM. Dans une vue drillée, le zoom
  // d'entrée sature déjà le plafond historique (16 px) : à cadrage égal la
  // taille ne bougeait plus jamais. Référence : Hauts-de-France — à partir du
  // cadrage d'entrée, chaque niveau d'agrandissement fait GRANDIR le nom :
  // plafond = plafond d'entrée × √(zoom / zoomEntrée), borné à ×3.
  function plafondZones(t) {
    var zRef = etat.zoomEntree || etat.zoom || 1;
    var croissance = (etat.zoom || 1) > zRef ? Math.sqrt((etat.zoom || 1) / zRef) : 1;
    // v0.97 : +20 % — les noms de régions et de sous-régions ont un plafond
    // un cinquième plus haut (la place disponible et le F commun restent
    // maîtres : une zone trop étroite garde un nom entier plus petit).
    return Math.round(t.etiquette * 1.44 * Math.min(3, Math.max(1, croissance))); // v0.100 : +20 % encore
  }
  // v0.92 : NOM ENTIER SUR DEUX LIGNES — coupe équilibrée à l'espace ou au
  // trait d'union (« Pas-de- / Calais », « Charente- / Maritime »). Renvoie
  // null si le découpage ne gagne rien en largeur.
  function deuxLignes(nom) {
    var segs = String(nom).split(/([ -]+)/);
    if (segs.length < 3) return null;
    var meilleure = null, ecart = 1e9;
    for (var i = 1; i < segs.length; i += 2) {
      var l1 = segs.slice(0, i + 1).join(''); // séparateur collé à la 1re ligne
      var l2 = segs.slice(i + 1).join('');
      if (!l2) continue;
      var e = Math.abs(l1.length - l2.length);
      if (e < ecart) { ecart = e; meilleure = [l1, l2]; }
    }
    if (!meilleure) return null;
    var sans = function (s) { return String(s).replace(/[\s-]/g, ''); };
    return sans(meilleure[0]).length + sans(meilleure[1]).length === sans(nom).length
      && Math.max(meilleure[0].length, meilleure[1].length) < String(nom).length ? meilleure : null;
  }
  // v0.92 : demi-boîte d'une étiquette DEUX lignes : la plus large des lignes
  // porte la largeur, la hauteur couvre 2 lignes (interligne 1,15).
  function demiBoiteLignes(lignes, F) {
    var L = Math.max(lignes[0].length, lignes[1].length);
    return [(0.70 * F * L + Math.max(0, L - 1)) / 2 + MARGE_ETIQ, 1.15 * F + MARGE_ETIQ];
  }
  // v0.92 : formatage multi-lignes (espaceLettres ligne par ligne).
  function formatterEtiquette(texte) {
    var lignes = String(texte).split('\n');
    for (var i = 0; i < lignes.length; i++) lignes[i] = espaceLettres(lignes[i]);
    return lignes.join('\n');
  }
  var ETQ_PX = [1, 1]; // derniers pxLon/pxLat utilisés (exposés au harnais)
  // v0.98 : ANCRE ÉPINGLÉE par zone. Une étiquette placée au POINT PROFOND
  // au cadrage d entrée (Nouvelle-Aquitaine) ne doit PAS sauter au centre
  // quand le zoom grandit (et inversement) : la position est mémorisée pour
  // toute la durée de la vue (cle = id de zone, réinitialisée par vue).
  var ANCRAGE_vue = null, ANCRAGE_map = {};
  // v0.89b : point le plus profond, EN CACHÉ PAR GÉOMÉTRIE (WeakMap) — la
  // grille d ancreInterne est coûteuse (contours lourds) : une seule fois
  // par géométrie, identique à travers les repaints et les zooms.
  var cacheAltGeo = typeof WeakMap === 'function' ? new WeakMap() : null;
  function altDe(geometry) {
    if (geometry && geometry.__alt) return geometry.__alt; // v0.90 : précalculé
    if (cacheAltGeo && cacheAltGeo.has(geometry)) return cacheAltGeo.get(geometry);
    var principalLocal = polygonePrincipal(geometry);
    var alt = ancreInterne(principalLocal, geometry, boite({ type: 'Polygon', coordinates: principalLocal })); // v0.89e : TABLEAU d'anneaux (ancreInterne(principal, …) comme cpDe)
    if (cacheAltGeo) cacheAltGeo.set(geometry, alt);
    return alt;
  }
  function pointDansGeo(pt, geo) {
    var polys = geo.type === 'Polygon' ? [geo.coordinates] : geo.coordinates;
    for (var i = 0; i < polys.length; i++) if (pointDansPoly(pt, polys[i])) return true;
    return false;
  }
  // v0.86 : la BOÎTE (texte + marge) centrée sur l'ancre est-elle ENTIÈREMENT
  // dans la zone ? 8 points de contrôle : 4 côtés + 4 coins (les baies et les
  // formes en L mordent les COINS, pas seulement les axes).
  function tientDansZone(geo, cp, hwDeg, hhDeg) {
    var x = cp[0], y = cp[1];
    var pts = [[x - hwDeg, y], [x + hwDeg, y], [x, y - hhDeg], [x, y + hhDeg],
               [x - hwDeg, y - hhDeg], [x + hwDeg, y - hhDeg], [x + hwDeg, y + hhDeg], [x - hwDeg, y + hhDeg]];
    for (var i = 0; i < 8; i++) if (!pointDansGeo(pts[i], geo)) return false;
    return true;
  }
  function boiteEtiquette(x, y, texte, F, pxLon, pxLat) {
    // v0.92 : multi-lignes — la plus large des lignes porte la largeur,
    // la hauteur couvre 2 lignes si nécessaire.
    var lignes = String(texte).split('\n');
    var L = lignes[0].length;
    for (var i = 1; i < lignes.length; i++) if (lignes[i].length > L) L = lignes[i].length;
    var w = (0.70 * F * L + Math.max(0, L - 1)) / pxLon / 2;
    var h = (lignes.length > 1 ? 2.3 : 1.0) * F / pxLat / 2;
    return { x0: x - w, x1: x + w, y0: y - h, y1: y + h };
  }
  function donneesNomsZones() {
    ETQ_BOITES = [];
    ETQ_DETAIL = [];
    var t = tailles(etat.zoom);
    var layoutPx = tailleCarte() || 1200;
    var pxLon = layoutPx * etat.zoom / 360, pxLat = layoutPx * etat.zoom / 350;
    var enSelection = !!(etat.selections && etat.selections.length) || !!etat.selection;
    if (ANCRAGE_vue !== vue.nomMap) { ANCRAGE_vue = vue.nomMap; ANCRAGE_map = {}; } // v0.98
    // v0.97 : DÉCALAGE D ANCRE manuel (degrés). Le centroïde pondéré d
    // v7.4 : LE DÉCALAGE +0,5° D'Auvergne-Rhône-Alpes EST SUPPRIMÉ — il
    // plaçait le nom trop au nord. La correction d'ancre CORRECTIONS_CP du
    // noyau (02-geo-ancres.js) pose désormais l'étiquette au centroïde
    // d'aire, au centre vertical du territoire, sans décalage.
    var DECAL_NOMS = { };
    var sigles = siglesVue(t, pxLon, pxLat);
    ETQ_PX = [pxLon, pxLat];
    // v0.96 : plus de boîtes de villes (affichage des villes supprimé v0.91,
    // moteur retiré v0.96).
    // v0.83 : items [id carte, nom, géométrie, continent, estPays, ]
    // TOUS les textes vivent ici, ancrés au CENTRE GÉOMÉTRIQUE : pays (vue
    // monde), zones + sœurs (vue admin) et PAYS EXTÉRIEURS « x- » (vue
    // admin) — leurs étiquettes geo, placées par ECharts au centre de la
    // BBOX, s'éteignent : plus qu'un seul placement, le centre de zone.
    var items = [];
    if (vue.type === 'monde') {
      DATA.pays.forEach(function (p) {
        if (p.geometry && p.id !== 'ES-002') items.push([p.id, p.nom, p.geometry, p.continent, true]);
      });
    } else {
      (vue.features || []).forEach(function (f) {
        if (f && f.geometry) items.push([f.id, f.nom, f.geometry, f.__ct || vue.continent, false]);
      });
      (vue.soeurs || []).forEach(function (f) {
        if (f && f.geometry) items.push(['c-' + f.id, f.nom, f.geometry, f.__ct || vue.continent, false]);
      });
      // v0.83 : extérieurs — même règle nom-si-tient / code, même cp
      DATA.pays.forEach(function (p) {
        if (!p.geometry || p.id === vue.paysId) return;
        if (vue.paysIds && vue.paysIds.indexOf(p.id) !== -1) return; // v0.37 : membre du groupe
        if (p.id === 'ES-002') return; // v0.29 : pas d'étiquette sur les Canaries
        items.push(['x-' + p.id, p.nom, p.geometry, p.continent, true]);
      });
    }
    // v0.93 : TAILLE UNIFORME PAR NIVEAU — PASSE 1. Pour chaque ZONE de la
    // vue (zones + soeurs ; les pays extérieurs gardent leur propre taille)
    // on calcule le F MAX auquel son nom ENTIER tient au CENTRE
    // géométrique : d abord sur 1 ligne (≤ plafond du zoom, ≥ 9 px), sinon
    // sur 2 lignes (coupe équilibrée, ≥ 8 px). À la passe 2 toutes les
    // zones du niveau afficheront leur nom au PLUS PETIT de ces F max :
    // plus aucune zone ne « crie » plus fort que sa soeur la plus étroite
    // (fini Nord 9 px contre Aisne 16 px dans la même vue).
    var Fcommun = null;
    if (vue.type !== 'monde') {
      var plafond = plafondZones(t);
      items.forEach(function (it) {
        if (it[4]) return; // pays extérieur : taille libre, pas d harmonisation
        var gz = it[2];
        var cpz = cpDe(it[0].replace(/^c-/, ''), gz);
        var nomz = it[1];
        var fz = null;
        for (var Fe = plafond; Fe >= 9; Fe -= 1) {
          var dbz = demiBoitePx(nomz, Fe);
          if (tientDansZone(gz, cpz, dbz[0] / pxLon, dbz[1] / pxLat)) { fz = Fe; break; }
        }
        // v0.99 : 1 ligne au POINT PROFOND (Aveyron : le centre est trop
        // proche d une concavité de frontière) — le niveau ne doit pas
        // descendre à la taille de la seule zone « mal centrée ».
        if (fz == null) {
          var altc = altDe(gz);
          if (altc) {
            for (var Fec = plafond; Fec >= 9; Fec -= 1) {
              var dbc = demiBoitePx(nomz, Fec);
              if (tientDansZone(gz, altc, dbc[0] / pxLon, dbc[1] / pxLat)) { fz = Fec; break; }
            }
          }
        }
        if (fz == null) {
          var dz = deuxLignes(nomz);
          if (dz) {
            for (var Fe2 = plafond; Fe2 >= 8; Fe2 -= 1) {
              var db2z = demiBoiteLignes(dz, Fe2);
              if (tientDansZone(gz, cpz, db2z[0] / pxLon, db2z[1] / pxLat)) { fz = Fe2; break; }
            }
          }
        }
        if (fz != null) Fcommun = Fcommun == null ? fz : Math.min(Fcommun, fz);
      });
    }
    // v0.94 : DÉZOOM — en n2/n3, sous le cadrage d entrée les NOMS de zones
    // laissent place aux ID (sigles), taille uniforme du niveau ; à DÉZOOM
    // DE −60 % (zoom ≤ 0,4 × zoomEntrée) les étiquettes n2/n3 DISPARAISSENT.
    var zEntree = etat.zoomEntree || etat.zoom || 1;
    var zCour = etat.zoom || 1;
    var nivVue = vue.niveau || 1;
    // v0.96 : avec une SÉLECTION la mécanique des noms → ID s applique
    // AUSSI au niveau 1 (sans sélection, n1 garde ses noms).
    var enDezoom = vue.type !== 'monde' && (nivVue >= 2 || enSelection) && zCour < zEntree * 0.995;
    // v0.96 : DISPARITION PROGRESSIVE D UNE SÉLECTION — à −60 % du cadrage
    // d entrée les étiquettes de ZONES s éteignent : il ne reste que l ID
    // du/des PAYS de la SÉLECTION, centré sur la géométrie du pays.
    var selFondue = vue.type !== 'monde' && enSelection && zCour <= zEntree * 0.4;
    var cacheN23 = vue.type !== 'monde' && nivVue >= 2 && zCour <= zEntree * 0.4;
    // v0.95 : DÉZOOM → taille PROPORTIONNELLE : chaque label d une vue admin
    // est multiplié par zoom/zoomEntrée sous le cadrage d entrée (plancher
    // 6 px). Et N1/N2 gagnent un BONUS LINÉAIRE de zoom, +3 px au zoom
    // MAXI de l app (60), nul au cadrage d entrée.
    var coeffDezoom = zCour < zEntree ? (zCour / zEntree) : 1;
    var bonusRond = (vue.type !== 'monde' && nivVue <= 2 && zCour > zEntree)
        ? Math.min(3, Math.round(3 * (zCour - zEntree) / Math.max(1e-9, 60 - zEntree)))
        : 0;
    var sortie = items.map(function (it) {
      var id = it[0], nom = it[1], geometry = it[2], continent = it[3], estPays = it[4];
      var decalage = (!estPays && DECAL_NOMS[nom]) || null; // v0.97
      if (selFondue && !estPays && id.indexOf('c-') !== 0) return null; // v0.96/v0.97 : zones éteintes, place à l ID pays ; les régions voisines restent
      var cp = cpDe(id.replace(/^c-/, ''), geometry);
      if (decalage) cp = [cp[0] + decalage[0], cp[1] + decalage[1]]; // v0.97
      // v0.98 : ancre épinglée — si le premier calcul (au cadrage d entrée)
      // a posé l étiquette au POINT PROFOND, on REPREND cette position à
      // tous les zooms : plus aucun déplacement en fonction du zoom.
      var cleA = id.replace(/^c-/, '');
      var ancreFixe = (!estPays && ANCRAGE_map[cleA]) || null;
      if (ancreFixe) cp = [ancreFixe[0], ancreFixe[1]];
      var complet = estPays ? MAJ(nom) : nom;
      var nomEntier = faitTient(complet, id, t, pxLon, pxLat);
      var defaut = estPays ? id.replace(/^x-/, '') : (sigles[nom] || abrev(nom));
      // v0.93 : dans les VUES ADMIN le CODE d un pays extérieur a la MÊME
      // taille que son nom (et que les zones du niveau) : fini le ×0,72.
      // Vue monde : comportement historique inchangé (codes compact).
      // v0.94 : PAYS (vues admin) — noms ET codes des pays extérieurs
      // 2 px PLUS PETITS : t.etiquette − 2. Vue monde inchangée.
      // v7.13 : +30 % sur les NOMS et les CODES des pays entre zoom 5× et
      // 40× (demande utilisateur) — hors de cette plage, tailles inchangées.
      var boostPays = (etat.zoom >= 5 && etat.zoom <= 40) ? 1.3 : 1;
      var FPaysAdmin = vue.type === 'monde'
        ? Math.max(7, Math.round(t.etiquette * boostPays))
        : Math.max(7, Math.round((t.etiquette - 2) * boostPays));
      var Fdefaut = estPays ? (vue.type === 'monde'
          ? Math.max(7, Math.round(STYLES.pays.facteurCode * t.etiquette * boostPays))
          : FPaysAdmin) : t.etiquette;
      // v0.86 : LE NOM NE DOIT PAS DÉBORDER DE SA ZONE. La boîte élargie par
      // la marge doit rester ENTIÈREMENT intérieure (8 points de contrôle sur
      // la frontière). Nom complet prioritaire, mais s'il mord la frontière
      // (zone trop étroite/basse, baie, forme en L) on RETOMBE sur code (pays)
      // ou sigle (subdivision).
      var texte, F, lignes = 1; // v0.92 : lignes = 2 quand le nom est coupé
      var d1 = demiBoitePx(complet, FPaysAdmin);
      if (estPays) {
        // v0.89 : un pays dont l étiquette ne tient pas au CENTRE GÉOMÉTRIQUE
        // ( Croatie croissant, forme en L, baie…) reçoit son étiquette au
        // POINT LE PLUS PROFOND de sa zone (pôle d inaccessibilité approché,
        // ancreInterne) : ID comme nom complet restent CONTENUS dans la zone.
        // Essais, dans l'ordre : nom au centre, ID au centre, nom au point
        // profond, ID au point profond ; dernier recours : ID au centre.
        var choisi = false;
        var alt = null;
        if (nomEntier && tientDansZone(geometry, cp, d1[0] / pxLon, d1[1] / pxLat)) {
          texte = complet; F = FPaysAdmin; choisi = true;
        }
        // v0.98 : ordre REVU — le NOM COMPLET est essayé au POINT LE PLUS
        // PROFOND AVANT de retomber sur l ID au centre : un pays étroit ou
        // côtier (Royaume-Uni : le centre géométrique touche la mer)
        // affichait indéfiniment son code, même zoomé à fond.
        if (!choisi) {
          alt = altDe(geometry); // v0.89b : caché par géométrie
          if (alt) {
            var da = demiBoitePx(complet, FPaysAdmin);
            if (nomEntier && tientDansZone(geometry, alt, da[0] / pxLon, da[1] / pxLat)) {
              cp = alt; texte = complet; F = FPaysAdmin; choisi = true;
            }
          }
        }
        if (!choisi) {
          var dc = demiBoitePx(defaut, Fdefaut);
          if (tientDansZone(geometry, cp, dc[0] / pxLon, dc[1] / pxLat)) {
            texte = defaut; F = Fdefaut; choisi = true;
          }
        }
        if (!choisi && alt) {
          var dca = demiBoitePx(defaut, Fdefaut);
          if (tientDansZone(geometry, alt, dca[0] / pxLon, dca[1] / pxLat)) {
            cp = alt; texte = defaut; F = Fdefaut; choisi = true;
          }
        }
        if (!choisi && alt) { cp = alt; texte = defaut; F = Fdefaut; } // v0.89d : dernier recours ID au point le PLUS PROFOND
        if (!choisi && !alt) { texte = defaut; F = Fdefaut; } // dernier recours : ID au centre
      } else {
        // v0.92 : le PLAFOND suit le zoom (plafondZones) : à cadrage d'entrée
        // il vaut exactement le plafond v0.91 (référence Hauts-de-France),
        // puis croît avec l'agrandissement au lieu de saturer.
        var plafond = plafondZones(t);
        // v0.88 : NOM DE ZONE AFFICHÉ EN ENTIER SI POSSIBLE. On cherche le
        // PLUS GRAND F (≤ plafond du zoom, ≥ 9 px) tel que la boîte du nom
        // complet + marge tienne DANS la zone (8 points de contrôle) ET ne
        // chevauche AUCUN nom de ville-capitale du niveau (n2/n3).
        // v0.93 : PASSE 2 — CHAQUE ZONE AU F COMMUN DU NIVEAU (passe 1),
        // TOUJOURS au CENTRE géométrique : 1 ligne si sa boîte y tient.
        // v0.94 : à dézoom −60 % l étiquette de zone n2/n3 DISPARAÎT.
        // v0.97 : les SOEURS (les régions voisines du niveau supérieur,
        // id « c- ») RESTENT affichées même à dézoom −60 % : seules les
        // étiquettes du niveau courant disparaissent.
        if (cacheN23 && id.indexOf('c-') !== 0) return null;
        // v0.93/94 : nom entier AU F UNIFORME du niveau, priorité au nom
        // ENTIER. En n2/n3 le niveau affiche 1 px PLUS GRAND que le F commun
        // v0.93 (F+1, plafonné au plafond du zoom) ; si une zone ne tient pas
        // à F+1 elle reste ENTIERE à F : écart ≤ 1 px, jamais de sigle forcé.
        // En DÉZOOM : ID (sigle) à la place du nom, taille uniforme.
        var essaieNomZ = function (FF) {
          var d1z = demiBoitePx(complet, FF);
          if (tientDansZone(geometry, cp, d1z[0] / pxLon, d1z[1] / pxLat))
            return { texte: complet, F: FF, lignes: 1, cp: cp };
          // v0.99 : 1 ligne au POINT PROFOND (référence Aveyron), ancre
          // épinglée comme en v0.98 — même mécanique, même stabilité.
          if (!ancreFixe && !ANCRAGE_map[cleA]) {
            var altz1 = altDe(geometry);
            if (altz1 && tientDansZone(geometry, altz1, d1z[0] / pxLon, d1z[1] / pxLat)) {
              ANCRAGE_map[cleA] = [altz1[0], altz1[1]];
              return { texte: complet, F: FF, lignes: 1, cp: altz1 };
            }
          }
          var dez = deuxLignes(complet);
          if (dez) {
            var dlz = demiBoiteLignes(dez, FF);
            if (tientDansZone(geometry, cp, dlz[0] / pxLon, dlz[1] / pxLat))
              return { texte: dez[0] + String.fromCharCode(10) + dez[1], F: FF, lignes: 2, cp: cp };
            // v0.98 : le point profond n est essayé QUE si l ancre n est pas
            // déjà épinglée, et l ancre retenue est MÉMORISÉE par zone.
            if (!ancreFixe && !ANCRAGE_map[cleA]) {
              var altz = altDe(geometry);
              if (altz && tientDansZone(geometry, altz, dlz[0] / pxLon, dlz[1] / pxLat)) {
                ANCRAGE_map[cleA] = [altz[0], altz[1]];
                return { texte: dez[0] + String.fromCharCode(10) + dez[1], F: FF, lignes: 2, cp: altz };
              }
            }
          }
          return null;
        };
        texte = complet; F = null;
        if (enDezoom && id.indexOf('c-') !== 0) { // v0.97 : soeurs = noms conservés
          // v0.94 : DÉZOOM en n2/n3 — le NOM laisse place à l ID (sigle),
          // à la taille uniforme du niveau, au CENTRE géométrique.
          texte = defaut; F = Fcommun != null ? Fcommun : Fdefaut;
        } else if (Fcommun != null) {
          // v0.97 : +20 % — la CIBLE de taille des noms de régions et de
          // sous-régions est F commun × 1,2 (au moins les bonus de niveaux
          // v0.94/95 : n3 +3, n2 +1, zoom +3). REPLI GRADUEL de la cible
          // jusqu à F commun : le nom ENTIER reste prioritaire, seule une
          // zone trop étroite descend d un cran, jamais de sigle forcé.
          var plafondZ = plafond || plafondZones(t);
          var bonusBase = nivVue >= 3 ? 3 : (nivVue >= 2 ? 1 : 0);
          var cibleZ = Math.min(Math.max(Math.round(Fcommun * 1.44), Fcommun + bonusBase) + bonusRond, plafondZ + bonusRond); // v0.100 : +20 % encore
          var rz = null;
          if (cibleZ > Fcommun) {
            for (var bz = cibleZ; bz > Fcommun && !rz; bz -= 1) {
              rz = essaieNomZ(Math.min(bz, plafondZ + bonusRond));
            }
          }
          if (!rz && cibleZ !== Fcommun) rz = essaieNomZ(Fcommun);
          // v0.210 : DÉZOOM SANS SÉLECTION — le nom entier tombe parfois
          // sous le seuil à la taille d'entrée mais PAS à la taille dézoomée :
          // réessayer le nom entier à Fdz (plancher 6) AVANT le sigle.
          if (!rz && coeffDezoom < 1) {
            var Fdz = Math.max(6, Math.round(Fcommun * coeffDezoom));
            if (Fdz < Fcommun) rz = essaieNomZ(Fdz);
          }
          if (rz) { texte = rz.texte; F = rz.F; lignes = rz.lignes; cp = rz.cp; }
        }
        if (F == null) { texte = defaut; F = Fcommun != null ? Fcommun : Fdefaut; } // dernier recours : sigle au centre, à F commun
      }
      // vue monde en sélection : même porte aire que les étiquettes historiques
      if (vue.type === 'monde' && enSelection && !etiquetteVisible(id, etat.zoom)) return null;
      // v0.95 : DÉZOOM — diminution PROPORTIONNELLE au dézoom (vue admin).
      if (vue.type !== 'monde' && coeffDezoom < 1) {
        F = Math.max(6, Math.round(F * coeffDezoom));
      }
      var demi = lignes === 2 ? demiBoiteLignes(String(texte).split('\n'), F) : demiBoitePx(texte, F);
      ETQ_DETAIL.push({ id: id, cp: cp, geo: geometry, texte: texte, F: F,
                       lignes: lignes,
                       hwDeg: demi[0] / pxLon, hhDeg: demi[1] / pxLat,
                       entier: lignes === 2 || texte === complet });
      ETQ_BOITES.push(boiteEtiquette(cp[0], cp[1], texte, F, pxLon, pxLat));
      // v7.4 : zone SÉLECTIONNÉE en vues admin (niveaux 1/2/3) : son texte
      // reste BLANC sur la teinte assombrie de la sélection.
      var labelTexte = textePays(continent);
      if (vue.type !== 'monde' && etat.selectionZone
          && id.replace(/^c-/, '') === String(etat.selectionZone).replace(/^c-/, ''))
        labelTexte = '#ffffff';
      var label = { show: true, position: 'inside', /* v0.85 : 'inside' = centrage
                 REEL sur le point (text-anchor:middle) */
                 formatter: formatterEtiquette(texte), fontSize: F, // v0.92 : multi-lignes
                 color: labelTexte, fontWeight: STYLES.etiquette.fontWeight };
      if (lignes === 2) label.lineHeight = Math.round(F * 1.15);
      return {
        name: nom,
        etqId: id,
        value: [cp[0], cp[1]],
        symbolSize: 0,
        label: label,
      };
    }).filter(Boolean);
    // v0.96 : FIN DE DISPARITION — étiquette ID du/des PAYS sélectionnés,
    // au centre géométrique du pays (repli au point profond), taille
    // proportionnelle au dézoom comme tous les labels (plancher 6 px).
    if (selFondue) {
      var idsSel = (vue.paysIds && vue.paysIds.length) ? vue.paysIds : [vue.paysId];
      idsSel.forEach(function (pid) {
        var pays = null;
        for (var ip = 0; ip < DATA.pays.length; ip++) if (DATA.pays[ip].id === pid) { pays = DATA.pays[ip]; break; }
        if (!pays || !pays.geometry) return;
        var FP = Math.max(6, Math.round(t.etiquette * (zCour < zEntree ? zCour / zEntree : 1)));
        var dp = demiBoitePx(pid, FP);
        var cpP = cpDe(pid, pays.geometry);
        if (!tientDansZone(pays.geometry, cpP, dp[0] / pxLon, dp[1] / pxLat)) {
          var altp = altDe(pays.geometry); if (altp) cpP = altp;
        }
        ETQ_DETAIL.push({ id: pid, cp: cpP, geo: pays.geometry, texte: pid, F: FP, lignes: 1,
                         hwDeg: dp[0] / pxLon, hhDeg: dp[1] / pxLat, entier: true });
        ETQ_BOITES.push(boiteEtiquette(cpP[0], cpP[1], pid, FP, pxLon, pxLat));
        sortie.push({ name: pid, etqId: pid, value: [cpP[0], cpP[1]], symbolSize: 0,
          label: { show: true, position: 'inside', formatter: formatterEtiquette(pid),
                   fontSize: FP, color: textePays(pays.continent),
                   fontWeight: STYLES.etiquette.fontWeight } });
      });
    }
    // v7.7 : DÉZOOM FUSION (zoom ≤ zoomEntrée/3,5 en n2/n3) — les
    // étiquettes du niveau courant sont éteintes (cacheN23) et la tache
    // uniforme représente la zone du NIVEAU SUPÉRIEUR : son NOM apparaît
    // au centre géométrique de son socle (repli au point profond), taille
    // ajustée par le test de contenance comme les autres noms, en BLANC
    // sur la teinte de sélection (-10 %).
    var fusionN23 = vue.type !== 'monde' && (vue.niveau || 1) >= 2
      && etat.zoomEntree > 0 && zCour <= etat.zoomEntree / 3.5
      && vue.socleGeometry && vue.parent;
    if (fusionN23) {
      var geoF = vue.socleGeometry;
      var nomF = vue.parent;
      var cpF = cpDe('fusion', geoF);
      var texteF = nomF;
      // v7.12 : MÊME TAILLE que les autres pays au même niveau de zoom —
      // exactement la règle des pays extérieurs « x- » (t.etiquette − 2,
      // réduite au prorata du dézoom, plancher 6 px), nom si la boîte
      // tient (centre puis point profond), sinon SIGLE/ID à la MÊME
      // taille. Fini le grossissement +44 % qui faisait « crier » le nom
      // de la sélection plus fort que ses voisins.
      var FF = Math.max(6, Math.round(Math.max(7, t.etiquette - 2) * coeffDezoom));
      var dnF = demiBoitePx(nomF, FF);
      if (!tientDansZone(geoF, cpF, dnF[0] / pxLon, dnF[1] / pxLat)) {
        var altF = altDe(geoF), gardeNom = false;
        if (altF) {
          var daF = demiBoitePx(nomF, FF);
          if (tientDansZone(geoF, altF, daF[0] / pxLon, daF[1] / pxLat)) { cpF = altF; gardeNom = true; }
        }
        if (!gardeNom) texteF = sigles[nomF] || abrev(nomF);
      }
      var lignesF = 1;
      var demiF = demiBoitePx(texteF, FF);
      ETQ_DETAIL.push({ id: 'fusion-' + nomF, cp: cpF, geo: geoF, texte: texteF, F: FF,
                        lignes: lignesF, hwDeg: demiF[0] / pxLon, hhDeg: demiF[1] / pxLat,
                        entier: texteF === nomF });
      ETQ_BOITES.push(boiteEtiquette(cpF[0], cpF[1], texteF, FF, pxLon, pxLat));
      var labelF = { show: true, position: 'inside', formatter: formatterEtiquette(texteF),
                     fontSize: FF, color: '#ffffff', fontWeight: STYLES.etiquette.fontWeight };
      if (lignesF === 2) labelF.lineHeight = Math.round(FF * 1.15);
      sortie.push({ name: nomF, etqId: 'fusion-' + nomF, value: [cpF[0], cpF[1]],
                    symbolSize: 0, label: labelF });
    }
    ETQ_SORTIE = sortie; // thème : cache des étiquettes (texte du survol)
    return sortie;
  }

  // ---------- v0.80o : CONTINENTS AU CENTROÏDE DE LEUR TERRE ----------
  // Centroïde pondéré par l'aire des anneaux principaux des pays du
  // continent. EXCEPTION Europe (« 150 ») : la Russie ne compte que par
  // sa partie À L'OUEST DE L'OURAL (clip interpolé sur DATA.ural) — sinon
  // le « centre » de l'Europe tombait en Sibérie occidentale.
  function russieEuropeenne(geometry) {
    var ring = polygonePrincipal(geometry)[0];
    var out = [];
    var n = ring.length;
    for (var i = 0; i < n; i++) {
      var a = ring[i], b = ring[(i + 1) % n];
      var ca = a[0] - lonOural(a[1]), cb = b[0] - lonOural(b[1]);
      if (ca <= 0) {
        out.push(a);
        if (cb > 0) {
          var t2 = ca / (ca - cb);
          out.push([a[0] + t2 * (b[0] - a[0]), a[1] + t2 * (b[1] - a[1])]);
        }
      } else if (cb <= 0) {
        var t3 = ca / (ca - cb);
        out.push([a[0] + t3 * (b[0] - a[0]), a[1] + t3 * (b[1] - a[1])]);
      }
    }
    return out.length >= 3 ? { type: 'Polygon', coordinates: [out] } : null;
  }
  function centreContinent(k) {
    var slx = 0, sly = 0, sa = 0;
    DATA.pays.forEach(function (p) {
      if (p.continent !== k || !p.geometry) return;
      var ring = polygonePrincipal(p.geometry)[0];
      if (k === '150' && (p.id === 'RU' || p.id === 'RU-142')) {
        var geo = russieEuropeenne(p.geometry);
        if (geo) ring = polygonePrincipal(geo)[0];
      }
      var cx = 0, cy = 0, a2 = 0;
      for (var i = 0; i < ring.length - 1; i++) {
        var f2 = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
        cx += (ring[i][0] + ring[i + 1][0]) * f2;
        cy += (ring[i][1] + ring[i + 1][1]) * f2;
        a2 += f2;
      }
      if (!a2) return;
      var ar = Math.abs(a2) / 2;
      slx += (cx / (3 * a2)) * ar; sly += (cy / (3 * a2)) * ar; sa += ar;
    });
    return sa > 0 ? [slx / sa, sly / sa] : CENTRES[k];
  }
