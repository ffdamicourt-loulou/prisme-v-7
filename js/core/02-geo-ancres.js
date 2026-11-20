  var vue = { type: 'monde', boites: {}, sections: {} };
  var pile = []; // { vue, zoom, centre, selection }

  function geometrieZone(id) {
    if (id.slice(0, 2) === 'c-') {
      var soeur = (vue.soeurs || []).filter(function (s) { return s.id === id.slice(2); })[0];
      return soeur ? soeur.geometry : null;
    }
    if (id.slice(0, 2) === 'x-') {
      var ext = parId[id.slice(2)];
      return ext ? ext.geometry : null;
    }
    if (vue.type === 'monde') {
      var p = parId[id];
      return p ? p.geometry : null;
    }
    var f = vue.parNom[id];
    return f ? f.geometry : null;
  }

  function boiteZone(id) {
    if (!vue.boites[id]) {
      var geo = geometrieZone(id);
      vue.boites[id] = geo ? boite(geo) : [0, 0, 0, 0];
    }
    return vue.boites[id];
  }

  function etiquetteVisible(id, zoom) {
    var b = boiteZone(id);
    var aire = (b[2] - b[0]) * (b[3] - b[1]);
    return aire > 25 / (zoom * zoom);
  }

  // v0.32 : AJUSTEMENT À LA POLYGONE (plus seulement à la boîte). La boîte
  // de Norvège ou du Royaume-Uni couvre le voisin : « NORVÈGE » tombait sur
  // la Suède. Le nom complet ne s'affiche maintenant que s'il tient dans la
  // SECTION du polygone principal au point d'ancre : largeur disponible =
  // intervalle du polygone coupé par la latitude de l'ancre, hauteur =
  // intervalle coupé par la longitude. Sinon : pays → CODE (FR, NO…),
  // subdivision → abréviation (OCC.). La section est en degrés, indépendante
  // du zoom : cache par vue. Le nom complet réapparaît dès que le zoom le
  // permet — au monde comme aux niveaux 1/2/3 (même code).
  // v0.43 : ignorer les ARTICLES INITIAUX (arabe Al/Az/Ash/An/As/At/Ad/Ar,
  // El ; anglais The ; français Le/La/Les/L) : « Al Humaydat » (Yémen)
  // s'abrège en « Hum. » et non plus en « Al . » — les districts arabes
  // abrégés redeviennent lisibles et distincts.
  function abrev(nom) {
    var mots = String(nom || '').trim().split(/\s+/);
    while (mots.length > 1 && /^(Al|Az|Ash|An|As|At|Ad|Ar|Adh|El|The|Le|La|Les|L)$/i.test(mots[0])) mots.shift();
    var sig = mots.join(' ');
    return sig.length > 3 ? sig.slice(0, 3) + '.' : sig;
  }
  // v0.51 : SIGLE DISTINGUANT — quand plusieurs zones d'une même vue
  // abrègent pareil (« Appenzell Ausserrhoden » / « Appenzell Innerrhoden »
  // → « App. » ×2, « Basel-Stadt » / « Basel-Landschaft » → « Bas. » ×2,
  // « Al-Basrah » / « Al-Muthannia » → « Al-. » ×2…), le préfixe de tokens
  // COMMUN À TOUT le groupe (espace OU trait d'union) est sauté et le
  // PREMIER MOT DISTINGUANT est abrégé : « Aus. » / « Inn. », « Sta. » /
  // « Lan. », « Bas. » / « Mut. ». La longueur monte de 3 à 6 lettres si
  // la collision persiste (« San Juan » / « Santa Cruz » → « San. » /
  // « Sant. »). Repli sur l'abréviation simple si le groupe est
  // indissociable (noms identiques).
  function abrevDistinct(nom, groupe) {
    // v0.51 : tokens UNIFIÉS — espace OU trait d'union, articles de tête
    // sautés comme dans abrev (« Al Khalaq » → [Khalaq], « Al-Basrah » →
    // [Basrah] : l'Irak n'affiche plus « Al-. » ×n).
    var tok = function (n) {
      var t = String(n || '').trim().split(/[\s\-]+/).filter(Boolean);
      var eff = t.filter(function (m) { return !/^(Al|Az|Ash|An|As|At|Ad|Ar|Adh|El|The|Le|La|Les|L)$/i.test(m); });
      return eff.length ? eff : t;
    };
    var tg = groupe.map(tok);
    var pref = 0;
    while (tg[0] && tg[0][pref] !== undefined) {
      var t0 = tg[0][pref], commun = true;
      for (var i = 1; i < tg.length; i++) if (tg[i][pref] !== t0) { commun = false; break; }
      if (!commun) break;
      pref++;
    }
    var t = tok(nom);
    var base = t.length > pref ? t[pref] : t[t.length - 1];
    var autres = [];
    for (var j = 0; j < tg.length; j++) {
      if (groupe[j] === nom) continue;
      var tj = tg[j];
      autres.push(tj.length > pref ? tj[pref] : tj[tj.length - 1]);
    }
    var L = 3;
    while (L < 6 && autres.some(function (a) { return String(a).slice(0, L) === base.slice(0, L); })) L++;
    var sig = base.length > L ? base.slice(0, L) : base;
    return sig + '.';
  }
  // intervalles du polygone (anneau externe + trous) coupés par une ligne
  // horizontale (lat donnée) ou verticale (lon donné), appariés en pair/impair
  function coupes(rings, horizontal, v) {
    var xs = [];
    for (var r = 0; r < rings.length; r++) {
      var ring = rings[r];
      for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        var a = ring[j], b = ring[i];
        var va = horizontal ? a[1] : a[0], vb = horizontal ? b[1] : b[0];
        if ((va > v) !== (vb > v)) {
          var pa = horizontal ? a[0] : a[1], pb = horizontal ? b[0] : b[1];
          xs.push(pa + (pb - pa) * (v - va) / (vb - va));
        }
      }
    }
    xs.sort(function (p, q) { return p - q; });
    return xs; // [début, fin, début, fin, …] (pair/impair)
  }
  function intervalleContenant(xs, c) {
    for (var k = 0; k + 1 < xs.length; k += 2)
      if (c >= xs[k] && c <= xs[k + 1]) return xs[k + 1] - xs[k];
    return 0;
  }
  function sectionsZone(id) {
    if (!vue.sections[id]) {
      var geo = geometrieZone(id);
      // v0.90 : sections précalculées (__sec) — repli : balayage ci-dessous
      if (geo && geo.__sec) { vue.sections[id] = geo.__sec; return geo.__sec; }
      if (!geo) vue.sections[id] = [0, 0];
      else {
        var cp = cpDe(id, geo);
        var principal = polygonePrincipal(geo);
        // v0.38 : coupe ÉLARGIE — la coupe exacte à l'ancre peut être
        // étriquée par une baie, une péninsule ou un bras de mer (le
        // Royaume-Uni et l'Irlande ne montraient JAMAIS leur nom complet,
        // même quand la zone était assez grande) : on balaie ±60 % des
        // dimensions de la zone autour de l'ancre et on garde la coupe la
        // plus large (intervalleContenant renvoie un NOMBRE, pas un
        // intervalle — piège).
        var b = boite(geo);
        var sLon = 0, sLat = 0;
        for (var f = -0.6; f <= 0.601; f += 0.2) {
          var lon = coupes(principal, true, cp[1] + f * (b[3] - b[1]));
          var ic = intervalleContenant(lon, cp[0]);
          if (ic > sLon) sLon = ic;
          var lat = coupes(principal, false, cp[0] + f * (b[2] - b[0]));
          var ic2 = intervalleContenant(lat, cp[1]);
          if (ic2 > sLat) sLat = ic2;
        }
        vue.sections[id] = [sLon, sLat];
      }
    }
    return vue.sections[id];
  }
  function faitTient(nom, id, t, pxLon, pxLat) {
    var s = sectionsZone(id);
    // v0.47 : LARGEUR RÉALISTE DES MAJUSCULES — l'ancien 0,55 em/caractère
    // sous-estimait d'environ 25 % le rendu réel des capitales sans-serif
    // (~0,70 em) : les noms complets débordaient des frontières alors que le
    // modèle les jugeait « tenants » — au dézoom les noms restaient affichés
    // bien après la taille limite du pays. 0,70 em = mesure moyenne des
    // capitales (le passage nom → code arrive ~27 % plus tôt en zoom).
    var w = 0.70 * t.etiquette * String(nom).length
           + Math.max(0, String(nom).length - 1); // v0.80 : +1 px d'espacement par lettre (U+200A)
    var h = 1.25 * t.etiquette;
    return w <= s[0] * pxLon * 0.98 && h <= s[1] * pxLat * 0.95;
  }

  // Subdivisions de niveau 1 d'un pays (Russie : côté de l'Oural du clic)
  function featuresNiv1(idPays) {
    var a3 = DATA.idversA3 ? DATA.idversA3[idPays] : null;
    var feats = a3 && ADMIN.niv1[a3];
    if (!feats) return null;
    // v0.79 : RUSSIE UNIFIÉE — plus de découpe Oural côté RU/RU-142 :
    // RU-142 est fusionné dans RU, toutes les zones niv1 sont servies.
    return feats;
  }
  function descendPossible(idPays) {
    if (idPays.indexOf('-') !== -1 && idPays !== 'RU-142') return false; // outre-mer : pas de descente
    return featuresNiv1(idPays) !== null;
  }

  // ---------- Données dérivées ----------
  var parId = {};
  DATA.pays.forEach(function (p) { parId[p.id] = p; });
  var assombris = {}, selectionnes = {}, textes = {};
  Object.keys(COULEURS).forEach(function (k) {
    if (THEME.pays) COULEURS[k] = THEME.pays;                 // thème : pays/zones
    assombris[k] = THEME.survol || assombrir(COULEURS[k]);   // survol : -20 % de luminosité
    // v7.6 : SÉLECTION = couleur d'origine -10 % de luminosité — à tous les
    // niveaux (pays sélectionné, zone sélectionnée) ; distincte du survol.
    selectionnes[k] = assombrirFacteur(COULEURS[k], 0.90);   // sélection : -10 %
    textes[k] = THEME.texte || couleurTexte(COULEURS[k]);    // thème : textes
  });
  // v0.49 : ÉTIQUETTES DES PAYS D AFRIQUE ET D ASIE EN BLANC — demandé
  // pour la lisibilité sur les teintes continentales orange (002) et
  // verte (142) ; le choix automatique (couleurTexte) donnait du noir.
  // S applique aux NOMS COMPLETS et aux CODES, en vue monde comme en
  // descente (pays propres, sœurs « c- », extérieurs « x- ») ; les grands
  // libellés de CONTINENTS gardent leur couleur d origine.
  var textePays = function (continent) {
    return (continent === '002' || continent === '142') ? BLANC : textes[continent];
  };

  // v0.31 : ancre d'étiquette ROBUSTE. Le centre de la boîte principale
  // tombait HORS du pays pour les formes en « L » ou arquées (la boîte de la
  // Norvège continentale, du Finnmark au sud, a son centre en SUÈDE :
  // l'étiquette « NORVÈGE » s'affichait sur la Suède). L'ancre est maintenant
  // le CENTROÏDE D'AIRE du polygone principal, validé PAR TEST D'INTÉRIORITÉ ;
  // s'il est dehors (pays concave), on cherche par grille le point intérieur
  // le plus ÉLOIGNÉ du contour (pôle d'inaccessibilité approché).
  function centroideAire(ring) {
    var x = 0, y = 0, a = 0;
    for (var i = 0; i < ring.length - 1; i++) {
      var f = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
      x += (ring[i][0] + ring[i + 1][0]) * f;
      y += (ring[i][1] + ring[i + 1][1]) * f;
      a += f;
    }
    if (!a) {
      var mx = 0, my = 0;
      for (var j = 0; j < ring.length; j++) { mx += ring[j][0]; my += ring[j][1]; }
      return [mx / ring.length, my / ring.length];
    }
    return [x / (3 * a), y / (3 * a)];
  }
  function pointDansGeometry(pt, geometry) {
    var polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    var inside = false;
    for (var i = 0; i < polys.length; i++)
      for (var k = 0; k < polys[i].length; k++) {
        var ring = polys[i][k];
        for (var j = 0, m = ring.length - 1; j < ring.length; m = j++) {
          if (((ring[j][1] > pt[1]) !== (ring[m][1] > pt[1]))
            && pt[0] < (ring[m][0] - ring[j][0]) * (pt[1] - ring[j][1]) / (ring[m][1] - ring[j][1]) + ring[j][0]) inside = !inside;
        }
      }
    return inside;
  }
  function distAuRing(pt, ring) {
    var d2min = Infinity;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var ax = ring[j][0], ay = ring[j][1], bx = ring[i][0], by = ring[i][1];
      var dx = bx - ax, dy = by - ay;
      var t = dx || dy ? ((pt[0] - ax) * dx + (pt[1] - ay) * dy) / (dx * dx + dy * dy) : 0;
      t = Math.max(0, Math.min(1, t));
      var d2 = Math.pow(pt[0] - ax - t * dx, 2) + Math.pow(pt[1] - ay - t * dy, 2);
      if (d2 < d2min) d2min = d2;
    }
    return Math.sqrt(d2min);
  }
  // even-odd sur UN polygone [extérieur, trous…] — assez pour l'ancre (elle
  // doit tomber dans le polygone principal, pas dans une île lointaine)
  function pointDansPoly(pt, poly) {
    var inside = false;
    for (var k = 0; k < poly.length; k++) {
      var ring = poly[k];
      for (var j = 0, m = ring.length - 1; j < ring.length; m = j++) {
        if (((ring[j][1] > pt[1]) !== (ring[m][1] > pt[1]))
          && pt[0] < (ring[m][0] - ring[j][0]) * (pt[1] - ring[j][1]) / (ring[m][1] - ring[j][1]) + ring[j][0]) inside = !inside;
      }
    }
    return inside;
  }
  // v0.72 : distance de pt au PLUS PROCHE des anneaux du polygone (extérieur
  // et trous) — le « contour réel » vu par une étiquette.
  function distTousAnneaux(pt, poly) {
    var d = Infinity;
    for (var k = 0; k < poly.length; k++) {
      var dk = distAuRing(pt, poly[k]);
      if (dk < d) d = dk;
    }
    return d;
  }
  function ancreInterne(principal, geometry, b) {
    var N = 16, meilleur = null, distMax = -1;
    for (var i = 1; i < N; i++) for (var j = 1; j < N; j++) {
      var pt = [b[0] + (b[2] - b[0]) * i / N, b[1] + (b[3] - b[1]) * j / N];
      if (!pointDansPoly(pt, principal)) continue;
      // v0.72 : le pôle d'inaccessibilité s'éloigne de TOUTES les frontières,
      // y compris les bords des trous (enclaves) : l'étiquette ne vient plus
      // se plaquer contre une enclave nichée dans la zone.
      var d = distTousAnneaux(pt, principal);
      if (d > distMax) { distMax = d; meilleur = pt; }
    }
    return meilleur || centroideAire(principal[0]);
  }
  // v0.32 : polygone principal = plus grande AIRE RÉELLE (partagé par l'ancre
  // et le test d'ajustement des étiquettes).
  // v0.91 : CONSOLIDATION GÉOMÉTRIQUE — airePolygone/aireGeo vivent ICI,
  // à côté de polygonePrincipal/simples qui les utilisent. Auparavant
  // airePolygone était dans 01 (styles !) et aireGeo dans 14 (vues !), la
  // résolution passant par le hoisting implicite de la concaténation —
  // cause directe du bug v0.90 (FRANCE→FR : l extracteur de précalcul
  // lisait la « mauvaise » aireGeo). Toute la géométrie est dans ce fragment.
  function aireGeo(geometry) {
    var polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    var s = 0;
    polys.forEach(function (poly) {
      var ring = poly[0];
      for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        s += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      }
    });
    return Math.abs(s / 2);
  }
  function airePolygone(poly) { return aireGeo({ type: 'Polygon', coordinates: poly }); }
  // v0.91 : CONSOLIDATION GÉOMÉTRIQUE — airePolygone/aireGeo vivent ICI,
  // à côté de polygonePrincipal/simples qui les utilisent. Auparavant
  // airePolygone était dans 01 (styles !) et aireGeo dans 14 (vues !), la
  // résolution passant par le hoisting implicite de la concaténation —
  // cause directe du bug v0.90 (FRANCE→FR : l extracteur de précalcul
  // lisait la « mauvaise » aireGeo). Toute la géométrie est dans ce fragment.
  function aireGeo(geometry) {
    var polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    var s = 0;
    polys.forEach(function (poly) {
      var ring = poly[0];
      for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        s += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      }
    });
    return Math.abs(s / 2);
  }
  function airePolygone(poly) { return aireGeo({ type: 'Polygon', coordinates: poly }); }
  function polygonePrincipal(geometry) {
    var polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    var meilleure = polys[0], aireMax = -1;
    polys.forEach(function (poly) {
      var a = airePolygone(poly);
      if (a > aireMax) { aireMax = a; meilleure = poly; }
    });
    return meilleure;
  }
  var cacheCp = {};
  // v0.32 : cache par GÉOMÉTRIE (WeakMap) — les pays extérieurs « x- », les
  // sœurs « c- » et les vues monde partagent les mêmes objets géométrie :
  // l'ancre (coûteuse : grille de pôle d'inaccessibilité) n'est calculée
  // qu'UNE fois par géométrie, quel que soit l'identifiant.
  var cacheCpGeo = typeof WeakMap === 'function' ? new WeakMap() : null;
  // v7.4 : CORRECTIONS D'ANCRE D'ÉTIQUETTE — quand une position précalculée
  // du package (__cp) est manifestement mal posée, la valeur du noyau PRIME.
  // Référence : Auvergne-Rhône-Alpes (FR niv1), __cp à 45,51°N trop au nord
  // de son territoire (44,12–46,80°N) : l'étiquette flottait au-dessus du
  // centre ; le centroïde d'aire (règle v0.82) la ramène au centre vertical.
  var CORRECTIONS_CP = {
    'Auvergne-Rhône-Alpes': [4.524247353084002, 45.25144749960415],
  };
  function cpDe(id, geometry) {
    // v7.4 : correction du noyau AVANT toute autre source (packages compris).
    if (CORRECTIONS_CP[id]) {
      if (cacheCpGeo && geometry) cacheCpGeo.set(geometry, CORRECTIONS_CP[id]);
      cacheCp[id] = CORRECTIONS_CP[id];
      return CORRECTIONS_CP[id];
    }
    // v0.90 : POSITIONS PRÉCALCULÉES DANS LES DONNÉES (packages) — le champ
    // __cp vient de gen-positions.cjs ; repli : calcul ci-dessous (identique).
    if (geometry && geometry.__cp) {
      if (cacheCpGeo) cacheCpGeo.set(geometry, geometry.__cp);
      cacheCp[id] = geometry.__cp;
      return geometry.__cp;
    }
    if (cacheCpGeo && cacheCpGeo.has(geometry)) return cacheCpGeo.get(geometry);
    if (cacheCp[id]) return cacheCp[id];
    var principal = polygonePrincipal(geometry);
    var b = boite({ type: 'Polygon', coordinates: principal });
    var c = centroideAire(principal[0]);
    // v0.82 : L'ANCRE EST LE CENTROÏDE D'AIRE, PARTOUT, À TOUTES LES ÉCHELLES.
    // La règle v0.32 « trop proche du contour → pôle d'inaccessibilité » est
    // SUPPRIMÉE : elle déplaçait l'étiquette de la moitié des pays (NO, GB,
    // SE, FI, DE, IT, GR, UA…) loin du centre géométrique — visible au
    // premier coup d'œil. Le nom est positionné sur le CENTRE de sa zone,
    // un point c'est tout. SEUL repli : centroïde mathématiquement hors de
    // la zone (forme concave) → point intérieur le plus profond.
    if (!pointDansPoly(c, principal)) c = ancreInterne(principal, geometry, b);
    cacheCp[id] = c;
    if (cacheCpGeo) cacheCpGeo.set(geometry, c);
    return c;
  }

  // v0.74 : ENCLAVES & CEINTURE DE COMPLÉTUDE.
  // ENCLAVES_MONDE : pays entièrement contenus dans un autre (Lesotho,
  // Saint-Marin, Vatican…), calculés une fois à la préparation du monde.
  // ENCLAVES_PAR_CARTE : relation { zone → hôte } par carte enregistrée
  // (une enclave est DESSINÉE APRÈS son hôte et peinte 20 % plus sombre
  // que la teinte courante de cet hôte — elle reste visible et survolable).
  // NOMS_CARTE : liste des noms de features de chaque carte enregistrée —
  // garantit que TOUTE feature a une entrée geo.regions (sans entrée,
  // ECharts rend la couleur PAR DÉFAUT, blanc : les « trous blancs » des
  // sélections lourdes USA/Italie).
