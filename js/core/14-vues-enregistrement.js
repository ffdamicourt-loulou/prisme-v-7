  function enregistrerVue(nom, features, paysId, socleGeometry, freres, extra) {
    // v0.29 : les ids de zones peuvent se répéter entre cartes — le cache
    // d'ancres est vidé à chaque nouvelle vue enregistrée.
    cacheCp = {};
    // Carte combinée : le SOCLE (géométrie complète du pays ou de la
    // subdivision parente, peint dessous — supprime les interstices blancs
    // laissés par la simplification entre subdivisions voisines), puis les
    // subdivisions du pays, puis les subdivisions SŒURS du même pays (préfixe
    // 'c-', contexte affiché normalement — le reste du pays ne disparaît
    // pas), puis tous les autres pays du monde en arrière-plan (préfixe
    // 'x-'), visibles à tout niveau de zoom.
    var socle = socleGeometry ? [{
      type: 'Feature', id: 'socle',
      properties: { name: 'socle', socle: true }, geometry: socleGeometry,
    }] : [];
    var propres = features.map(function (f) {
      return { type: 'Feature', id: f.id, properties: { name: f.id, nom: f.nom, cp: f.etq || cpDe(f.id, f.geometry) }, geometry: f.geometry };
    });
    var soeurs = (freres || []).filter(function (f) { return !f.__masquee; }).map(function (f) {
      return { type: 'Feature', id: 'c-' + f.id, properties: { name: 'c-' + f.id, nom: f.nom, contexte: true, cp: f.etq || cpDe(f.id, f.geometry) }, geometry: f.geometry };
    });
    var excl = (extra && extra.exclus) || [];
    var externes = DATA.pays.filter(function (p) {
      return p.id !== paysId && excl.indexOf(p.id) === -1;
    }).map(function (p) {
      return { type: 'Feature', id: 'x-' + p.id, properties: { name: 'x-' + p.id, nom: p.nom, exterieur: true, cp: cpDe(p.id, p.geometry) }, geometry: p.geometry };
    });
    var soclesExtra = ((extra && extra.socles) || []).map(function (s) {
      return { type: 'Feature', id: 'socle@' + s.paysId,
        properties: { name: 'socle@' + s.paysId, socle: true }, geometry: s.geometry };
    });
    // v0.74 : ORDRE DE DESSIN DES ENCLAVES — une zone entièrement contenue
    // dans une autre (municipalité enclavée de Bulgarie, comté enclavé
    // américain, canton dans son hôte…) est DESSINÉE APRÈS son hôte : au
    // lieu d'être recouverte par le polygone hôte (invisible, hover et clic
    // impossibles), elle apparaît au-dessus et redevient interactive.
    // La relation est mémorisée pour la peinture (teinte -20 % de l'hôte).
    var itemsZones = propres.map(function (f) {
      return { cle: f.id, geometry: f.geometry, feat: f };
    }).concat(soeurs.map(function (f) {
      return { cle: f.id, geometry: f.geometry, feat: f };
    }));
    var enc = detecterEnclaves(itemsZones);
    ENCLAVES_PAR_CARTE[nom] = enc;
    var zonesOrdonnees = ordonnerApresHotes(itemsZones, enc);
    // v0.74 : les pays extérieurs enclavés (Lesotho, Saint-Marin…) sont
    // eux aussi dessinés après leur hôte, d'après la relation du monde.
    var encExt = {};
    Object.keys(ENCLAVES_MONDE || {}).forEach(function (k) {
      encExt['x-' + k] = 'x-' + ENCLAVES_MONDE[k];
    });
    var externesOrdonnes = ordonnerApresHotes(externes.map(function (f) {
      return { cle: f.properties.name, feat: f };
    }), encExt);
    var tous = socle.concat(soclesExtra).concat(zonesOrdonnees).concat(externesOrdonnes);
    // v0.74 : liste des noms enregistrés — la ceinture de complétude de
    // majEtiquettes garantit que CHACUN a une entrée geo.regions.
    NOMS_CARTE[nom] = tous.map(function (f) { return f.properties.name; });
    echarts.registerMap(nom, { type: 'FeatureCollection',
      features: tous });
  }
  function boiteEnsemble(features) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    features.forEach(function (f) {
      var bb = boite(f.geometry);
      b[0] = Math.min(b[0], bb[0]); b[1] = Math.min(b[1], bb[1]);
      b[2] = Math.max(b[2], bb[2]); b[3] = Math.max(b[3], bb[3]);
    });
    return b;
  }
  // Grappe principale : boîte du plus grand amas de subdivisions proches
  // (écart ≤ 20°), « plus grand » mesuré par la SOMME des superficies réelles
  // des subdivisions de l'amas. Évite de centrer sur un pays « étalé » (France
  // avec Guyane/Réunion, USA avec Alaska/Hawaï, Pays-Bas Antilles…) : la vue
  // se cale sur le cœur du pays, l'outre-mer reste accessible en dézoomant.
  // v0.91 : aireGeo déménage dans core/02 (géométrie) — plus de définition
  // dupliquée à distance, résolue par hoisting implicite.
  // v0.39 : BOÎTES À LONGITUDES NORMALISÉES — une pièce stockée au-delà de
  // l'antiméridien (les Aléoutiennes, lon 191° = -169°) étale la boîte de
  // l'Alaska sur ~360° et empoisonnait TOUT le cadrage des vues USA (le
  // centre glissait jusqu'au Pacifique sud). principal : seul l'anneau
  // externe de plus grande aire (boîte de cadrage d'une zone).
  function boiteNormalee(geometry, principal) {
    var polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    if (principal) {
      var meilleure = null, aireMax = -1;
      polys.forEach(function (poly) {
        var aire = airePolygone(poly);
        if (aire > aireMax) { aireMax = aire; meilleure = poly; }
      });
      polys = meilleure ? [meilleure] : polys;
    }
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    polys.forEach(function (poly) {
      for (var i = 0; i < poly[0].length; i++) {
        var x = poly[0][i][0]; if (x > 180) x -= 360;
        if (x < b[0]) b[0] = x; if (x > b[2]) b[2] = x;
        var y = poly[0][i][1];
        if (y < b[1]) b[1] = y; if (y > b[3]) b[3] = y;
      }
    });
    return b;
  }
  function boiteGrappe(features, ecart) {
    if (ecart === undefined) ecart = 20;
    var boites = features.map(function (f) { return boiteNormalee(f.geometry, false); });
    var n = boites.length;
    if (!n) return null;
    // 1) amas par proximité (transitive) des boîtes
    var marques = new Array(n);
    for (var i = 0; i < n; i++) marques[i] = false;
    var grappes = [];
    for (var i2 = 0; i2 < n; i2++) {
      if (marques[i2]) continue;
      marques[i2] = true;
      var b = boites[i2].slice();
      var membres = [i2];
      var grandi = true;
      while (grandi) {
        grandi = false;
        for (var j = 0; j < n; j++) {
          if (marques[j]) continue;
          var c = boites[j];
          if (c[0] <= b[2] + ecart && c[2] >= b[0] - ecart &&
              c[1] <= b[3] + ecart && c[3] >= b[1] - ecart) {
            marques[j] = true; grandi = true; membres.push(j);
            b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]);
            b[2] = Math.max(b[2], c[2]); b[3] = Math.max(b[3], c[3]);
          }
        }
      }
      grappes.push(membres);
    }
    // 2) amas principal = plus grande somme de superficies réelles
    var aires = features.map(function (f) { return aireGeo(f.geometry); });
    var meilleur = null, aireMax = -1;
    grappes.forEach(function (membres) {
      var a = 0;
      membres.forEach(function (m) { a += aires[m]; });
      if (a > aireMax) { aireMax = a; meilleur = membres; }
    });
    // 2bis v0.44 : COMPOSANTE PRINCIPALE — dans l'amas, des îles lointaines
    //    (Canaries, outre-mers français, Galápagos…) tiraient le cadrage et
    //    rapetissaient le continent. On sépare l'amas en composantes dont
    //    les boîtes sont reliées par un écart ≤ 7,15° et on ne CADRE QUE la
    //    composante de plus grande aire : les archipels compacts restent
    //    (Baléares, Sardaigne/Corse/Sicile, Bornéo malais à 7,01° du
    //    continent, Alaska à 6,29° — règle v0.40), les confettis océaniques
    //    sortent du CADRE (Canaries à 7,30°, Galápagos à 8,24°, Guyane et
    //    autres outre-mers français à > 58°, Hawaï à 30°) mais RESTENT
    //    AFFICHÉS. Les données admin sont figées : le seuil est stable.
    {
      var lien = 7.15;
      var marquesC = {};
      meilleur.forEach(function (m) { marquesC[m] = false; });
      var composantes = [];
      meilleur.forEach(function (m0) {
        if (marquesC[m0]) return;
        marquesC[m0] = true;
        var membres = [m0];
        var grandi2 = true;
        while (grandi2) {
          grandi2 = false;
          meilleur.forEach(function (j) {
            if (marquesC[j]) return;
            for (var mi = 0; mi < membres.length; mi++) {
              var bm = boites[membres[mi]], c2 = boites[j];
              var dx2 = Math.max(bm[0] - c2[2], c2[0] - bm[2], 0);
              var dy2 = Math.max(bm[1] - c2[3], c2[1] - bm[3], 0);
              if (Math.hypot(dx2, dy2) <= lien) { marquesC[j] = true; membres.push(j); grandi2 = true; break; }
            }
          });
        }
        composantes.push(membres);
      });
      if (composantes.length > 1) {
        var airesComp = composantes.map(function (membres) {
          return membres.reduce(function (s, m) { return s + aires[m]; }, 0);
        });
        var iComp = 0;
        airesComp.forEach(function (s, kc) { if (s > airesComp[iComp]) iComp = kc; });
        meilleur = composantes[iComp];
      }
    }
    // 3) retirer les « confettis lointains » : subdivision minuscule (< 3 % de
    //    la superficie de l'amas) dont la boîte est à PLUS DE 15° de TOUTE
    //    autre subdivision de l'amas. v0.39 : la distance se mesure au PLUS
    //    PROCHE VOISIN (plus au centroïde global) — avec l'Alaska dans l'amas
    //    des États-Unis, le centroïde glissait si loin que le filtre supprimait
    //    des États entiers de la Nouvelle-Angleterre du cadrage.
    var aireAs = 0;
    meilleur.forEach(function (m) { aireAs += aires[m]; });
    var gardes = meilleur.filter(function (m) {
      if (aires[m] >= 0.03 * aireAs) return true;
      var bm = boites[m];
      for (var j = 0; j < n; j++) {
        if (j === m || meilleur.indexOf(j) === -1) continue;
        var c = boites[j];
        var dx = Math.max(bm[0] - c[2], c[0] - bm[2], 0);
        var dy = Math.max(bm[1] - c[3], c[1] - bm[3], 0);
        if (Math.hypot(dx, dy) <= 15) return true;
      }
      return false;
    });
    if (!gardes.length) gardes = meilleur;
    // 4) boîte d'ajustement : anneaux PRINCIPAUX de chaque subdivision
    //    (ex. la région Valparaíso contient l'île de Pâques : sa partie
    //    continentale seule doit cadrer la vue)
    var bb = [Infinity, Infinity, -Infinity, -Infinity];
    gardes.forEach(function (m) {
      var bp = boiteNormalee(features[m].geometry, true);
      bb[0] = Math.min(bb[0], bp[0]); bb[1] = Math.min(bb[1], bp[1]);
      bb[2] = Math.max(bb[2], bp[2]); bb[3] = Math.max(bb[3], bp[3]);
    });
    return bb;
  }

  // v0.40 : COMPOSANTES DÉTACHÉES DE GRANDE TAILLE d'un pays — amas de
  // subdivisions de niveau 1 SANS CONTACT de boîtes (écart > 0,25°) avec
  // l'amas principal, et d'aire planaire ≥ 100°². Seule l'ALASKA (~279°²)
  // franchit ce seuil dans le monde : Hawaï, les outre-mers, Terre-Neuve,
  // le Sabah… sont des composantes mineures (elles restent accessibles en
  // dézoomant). Une telle composante fait partie intégrante du pays : elle
  // reste DANS LE CADRAGE de toutes les vues de descente — sélectionner les
  // États-Unis montre l'Alaska aux niveaux 1, 2 et 3, même au fond d'un
  // comté du Colorado. Cache par pays (les subdivisions ne bougent pas).
  var SEUIL_COMPOSANTE = 100; // °² planaires
  var cacheComposantes = {};
  function composantesDetachees(idPays) {
    if (cacheComposantes[idPays]) return cacheComposantes[idPays];
    var boites = [];
    var feats = featuresNiv1(idPays) || [];
    var n = feats.length;
    if (n) {
      var bzs = feats.map(function (f) { return boiteNormalee(f.geometry, false); });
      var aires = feats.map(function (f) { return aireGeo(f.geometry); });
      // amas par contact de boîtes (transitif, écart 0,25°)
      var marques = new Array(n);
      for (var i = 0; i < n; i++) marques[i] = false;
      var amas = [];
      for (var i2 = 0; i2 < n; i2++) {
        if (marques[i2]) continue;
        marques[i2] = true;
        var membres = [i2];
        var b = bzs[i2].slice();
        var grandi = true;
        while (grandi) {
          grandi = false;
          for (var j = 0; j < n; j++) {
            if (marques[j]) continue;
            var c = bzs[j];
            if (c[0] <= b[2] + 0.25 && c[2] >= b[0] - 0.25 && c[1] <= b[3] + 0.25 && c[3] >= b[1] - 0.25) {
              marques[j] = true; membres.push(j); grandi = true;
              b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]);
              b[2] = Math.max(b[2], c[2]); b[3] = Math.max(b[3], c[3]);
            }
          }
        }
        amas.push(membres);
      }
      // l'amas principal (plus grande aire) est déjà cadré par la grappe ;
      // les AUTRES amas ≥ 100°² étendent le cadrage (anneaux principaux).
      var airesAmas = amas.map(function (membres) {
        return membres.reduce(function (s, m) { return s + aires[m]; }, 0);
      });
      var iPrincipal = 0;
      for (var k = 1; k < airesAmas.length; k++) if (airesAmas[k] > airesAmas[iPrincipal]) iPrincipal = k;
      amas.forEach(function (membres, iAmas) {
        if (iAmas === iPrincipal || airesAmas[iAmas] < SEUIL_COMPOSANTE) return;
        var bb = [Infinity, Infinity, -Infinity, -Infinity];
        membres.forEach(function (m) {
          var bp = boiteNormalee(feats[m].geometry, true);
          bb[0] = Math.min(bb[0], bp[0]); bb[1] = Math.min(bb[1], bp[1]);
          bb[2] = Math.max(bb[2], bp[2]); bb[3] = Math.max(bb[3], bp[3]);
        });
        boites.push(bb);
      });
    }
    cacheComposantes[idPays] = boites;
    return boites;
  }
