  var cacheFrontieres = null;
  var cacheFrontieresVue = null;
  function distancePtSegment(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var l2 = dx * dx + dy * dy;
    var t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    return Math.sqrt((p[0] - a[0] - t * dx) * (p[0] - a[0] - t * dx)
      + (p[1] - a[1] - t * dy) * (p[1] - a[1] - t * dy));
  }
  function indexContourHote(geometries) {
    var CELL = 0.5, grille = {};
    geometries.forEach(function (g) {
      if (!g) return;
      var polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      polys.forEach(function (poly) {
        poly.forEach(function (ring) {
          for (var i = 0; i + 1 < ring.length; i++) {
            var a = ring[i], b = ring[i + 1];
            var k = Math.floor(a[0] / CELL) + '/' + Math.floor(a[1] / CELL);
            (grille[k] = grille[k] || []).push([a, b]);
          }
        });
      });
    });
    return { dist: function (p) {
      var dm = Infinity;
      var cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL);
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
        var arr = grille[(cx + dx) + '/' + (cy + dy)];
        if (!arr) continue;
        for (var i = 0; i < arr.length; i++) {
          var d = distancePtSegment(p, arr[i][0], arr[i][1]);
          if (d < dm) dm = d;
        }
      }
      return dm;
    } };
  }
  // v0.57 : sommets PARTAGÉS par ≥ 2 pays du monde (clé 0,001°) → ids des
  // pays ; sert à n'effacer que les segments de frontière IMPLIQUANT l'hôte.
  var cacheSommetsPartages = null;
  function indexSommetsPartages() {
    if (cacheSommetsPartages) return cacheSommetsPartages;
    var m = {};
    DATA.pays.forEach(function (p) {
      var polys = p.geometry.type === 'Polygon' ? [p.geometry.coordinates] : p.geometry.coordinates;
      polys.forEach(function (poly) { poly.forEach(function (ring) { ring.forEach(function (pt) {
        var k = pt[0].toFixed(3) + ',' + pt[1].toFixed(3);
        (m[k] = m[k] || {})[p.id] = 1;
      }); }); });
    });
    cacheSommetsPartages = m;
    return m;
  }
  function filtrerFrontieresHote(lignes, geometriesHote, paysHote) {
    var EPS = 0.05;
    var idx = indexContourHote(geometriesHote);
    var sp = indexSommetsPartages();
    var hotes = paysHote || [];
    var res = [];
    lignes.forEach(function (l) {
      if (!l || l.length < 2) return;
      var pres = [];
      for (var i = 0; i < l.length; i++) pres.push(idx.dist(l[i]) < EPS);
      // v0.57 : un segment collé au contour hôte n'est retiré QUE si la
      // frontière qu'il trace IMPLIQUE l'hôte (sommets partagés avec un des
      // pays hôtes) — les frontières VOISIN-VOISIN qui passent près de
      // l'hôte (AD/ES près des Pyrénées, BE/LU et DE/LU près de l'Aubange,
      // CH/DE près de Bâle) RESTITUENT leurs segments, sinon les pays
      // extérieurs voisins (même teinte continent, sans bordure propre)
      // semblaient FUSIONNÉS près de la France.
      var cour = null;
      for (var s = 0; s + 1 < l.length; s++) {
        var retirer = false;
        if (pres[s] && pres[s + 1]) {
          var sa = sp[l[s][0].toFixed(3) + ',' + l[s][1].toFixed(3)];
          var sb = sp[l[s + 1][0].toFixed(3) + ',' + l[s + 1][1].toFixed(3)];
          var cands = null;
          if (sa && sb) {
            cands = {};
            for (var id in sa) if (sb[id]) cands[id] = 1;
          }
          var implique = !cands; // attribution inconnue → repli (comportement v0.56)
          if (cands) {
            implique = false;
            for (var h = 0; h < hotes.length; h++) if (cands[hotes[h]]) { implique = true; break; }
          }
          retirer = implique;
        }
        if (retirer) {
          if (cour) { if (cour.length >= 2) res.push(cour); cour = null; }
          continue;
        }
        if (!cour) cour = [l[s]];
        cour.push(l[s + 1]);
      }
      if (cour && cour.length >= 2) res.push(cour);
    });
    return res.map(function (l) { return { coords: l }; });
  }
  function donneesFrontieres() {
    if (!cacheFrontieres) {
      cacheFrontieres = (DATA.frontieres || []).map(function (l) { return { coords: l }; });
    }
    if (vue.type === 'monde') return cacheFrontieres;
    var soclesGeo = [];
    if (vue.socleGeometry) soclesGeo.push(vue.socleGeometry);
    (vue.socles || []).forEach(function (s) { if (s.geometry) soclesGeo.push(s.geometry); });
    (vue.soclesHerites || []).forEach(function (s) { if (s.geometry) soclesGeo.push(s.geometry); }); // v0.100 : ancêtres
    if (!soclesGeo.length) return cacheFrontieres;
    if (!cacheFrontieresVue || cacheFrontieresVue.nomMap !== vue.nomMap) {
      cacheFrontieresVue = { nomMap: vue.nomMap, lignes: filtrerFrontieresHote(DATA.frontieres || [], soclesGeo, vue.paysIds && vue.paysIds.length ? vue.paysIds : [vue.paysId]) };
    }
    return cacheFrontieresVue.lignes;
  }
  // ── v7.34 : FRONTIÈRE UNIQUE DES ZONES VOISINES (niveau utilisateur 3) ──
  // SIGNALEMENT : aux niveaux 3 des pays européens (départements, comtés,
  // districts… = niveau app 2), les frontières INTERNES étaient tracées par
  // CHAQUE zone (borderWidth de son propre contour) : deux voisins issus
  // de sources différentes (packages GADM, compléments n3 injectés,
  // bascules de parents) simplifient leur arête partagée SÉPARÉMENT —
  // deux traits proches mais NON CONFONDUS (« doubles frontières qui ne
  // matchent pas l'une avec l'autre »).
  // SYSTÈME UNIQUE — le MÊME que celui des PAYS (v0.22, couche
  // « frontieres ») appliqué aux zones voisines du niveau courant :
  // • chaque arête du contour des zones (propres + sœurs affichées) est
  //   proposée à la couche lignes en POLYLIGNES ; une arête déjà tracée
  //   (ou QUASI déjà tracée : distance de Hausdorff < EPS ≈ 2·10⁻³°)
  //   est IGNORÉE — le segment partagé de deux voisins n'est dessiné
  //   QU'UNE SEULE fois, au premier passage ;
  // • les zones n'ont PLUS de bordure propre dans ces vues
  //   (06-peinture : borderWidth 0), le filet est porté par la couche
  //   « frontieres-zones » UNIQUE (couleur contour, TRAIT_NIVEAUX) ;
  // • PÉRIMÈTRE : vues admin de niveau app ≥ 2 des pays EUROPÉENS
  //   (continent 150) — la demande utilisateur ; hors Europe et aux
  //   autres niveaux, le trait par zone est inchangé.
  // EPS : tolérance de reconnaissance « quasi doublon » ; assez fine pour
  // ne fusionner QUE les arêtes partagées, assez large pour recoller les
  // simplifications divergentes de deux sources. Les arêtes sont indexées
  // et recherchées aux DEUX extrémités (une longue arête range sinon son
  // premier sommet dans une cellule éloignée du second : la requête au
  // seul second sommet ne la retrouvait pas et le doublon exact était
  // émis deux fois).
  var cacheFrontieresZones = null;
  function segProche(a1, b1, a2, b2, eps) {
    return distancePtSegment(a1, a2, b2) < eps && distancePtSegment(b1, a2, b2) < eps
      && distancePtSegment(a2, a1, b1) < eps && distancePtSegment(b2, a1, b1) < eps;
  }
  function frontiereUniqueZone() {
    // v7.38 : CARTE DÉFINITIVE — le filet unique s'applique désormais à
    // TOUTES les vues admin (TOUT niveau, TOUT continent), plus seulement
    // à l'Europe de niveau app ≥ 2 : chaque arête est tracée UNE seule
    // fois, partout dans le monde.
    return vue.type === 'admin';
  }
  function donneesFrontieresZones() {
    if (!frontiereUniqueZone()) return [];
    var cle = (vue.nomMap || '') + '#' + (vue.features || []).length + '|'
      + (vue.soeurs || []).map(function (f) { return f && f.__masquee ? 1 : 0; }).join('');
    if (cacheFrontieresZones && cacheFrontieresZones.cle === cle) return cacheFrontieresZones.res;
    var EPS = 0.002, CELL = 0.02;
    var grille = {};
    // indexation/recherche aux DEUX extrémités (cf. note v7.34 ci-dessus)
    function cellule(p) { return Math.floor(p[0] / CELL) + '/' + Math.floor(p[1] / CELL); }
    function auVoisinage(p, fn) {
      var cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL);
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
        var arr = grille[(cx + dx) + '/' + (cy + dy)];
        if (!arr) continue;
        for (var i = 0; i < arr.length; i++) fn(arr[i]);
      }
    }
    function dejaTrace(a, b) {
      var trouve = false;
      // v7.36 : EPS ADAPTATIF — la tolérance FIXE 0,002° (~220 m) pouvait
      // « avaler » des arêtes réelles plus courtes qu'elle (micro-zones :
      // Sarre, Brême, concelhos portugais…) : deux arêtes voisines mais
      // DISTINCTES de moins de 0,002° n'existent plus comme doublons, il
      // manquait un trait. La tolérance est maintenant plafonnée à 30 %
      // de l'arête la plus courte des DEUX : les longues arêtes partagées
      // (simplifications divergentes de deux sources) restent dédupliquées.
      var lab = Math.abs(a[0] - b[0]) * Math.cos(a[1] * Math.PI / 180) + Math.abs(a[1] - b[1]);
      function verif(seg) {
        if (trouve) return;
        var lseg = Math.abs(seg[0][0] - seg[1][0]) * Math.cos(seg[0][1] * Math.PI / 180)
          + Math.abs(seg[0][1] - seg[1][1]);
        var eps = Math.min(EPS, 0.30 * Math.min(lab, lseg));
        if (eps <= 0 || !isFinite(eps)) eps = 1e-7;
        if (segProche(a, b, seg[0], seg[1], eps)) trouve = true;
      }
      auVoisinage(a, verif);
      if (!trouve) auVoisinage(b, verif);
      return trouve;
    }
    function tracer(a, b) {
      var ka = cellule(a), kb = cellule(b);
      if (grille[ka]) grille[ka].push([a, b]); else grille[ka] = [[a, b]];
      if (kb !== ka) { if (grille[kb]) grille[kb].push([a, b]); else grille[kb] = [[a, b]]; }
    }
    // v7.38 : PASSE EXACTE AVANT LE BALAYAGE FLOU — les sources HOMOGÈNES
    // (comtés US, régions…) partagent EXACTEMENT leurs sommets : un
    // dictionnaire à clé canonique (extrémités triées) élimine ces
    // doublons en O(1), sans toucher à la grille. Le balayage flou
    // (dejaTrace, eps adaptatif) ne traite plus que les cas inter-sources.
    var vusExact = {};
    function cleExacte(a, b) {
      return (a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]))
        ? a[0] + ',' + a[1] + '|' + b[0] + ',' + b[1]
        : b[0] + ',' + b[1] + '|' + a[0] + ',' + a[1];
    }
    var res = [];
    // v7.38 : TRAITS NIVEAU-AU-DESSUS « COLLÉS » AU PARENT — une zone
    // voisine de niveau AU-DESSUS (région/canton/État voisin) redessinait
    // avec SA source la frontière qu'elle partage avec le PARENT, pendant
    // que les zones enfants la retraçaient avec LA LEUR (IGN vs GADM,
    // canton vs district…) : DEUX traits proches mais différents
    // (Lucerne, Aude/Pyrénées-Orientales, côtes ouest & sud…). Une arête
    // de sœur qui ÉPOUSE le contour du parent (les DEUX extrémités à
    // moins de HUG ° d'un point du contour parent) n'est PLUS émise : le
    // trait reste celui, unique, des zones enfants. Les arêtes de sœurs
    // LOIN du parent (leurs autres frontières) sont inchangées.
    var HUG = 0.05;
    var idxParent = vue.socleGeometry ? indexContourHote([vue.socleGeometry]) : null;
    function colleeAuParent(a, b) {
      if (!idxParent) return false;
      return idxParent.dist(a) < HUG && idxParent.dist(b) < HUG;
    }
    function ajouterGeom(g, estSoeur) {
      if (!g) return;
      var polys = g.type === 'Polygon' ? [g.coordinates]
        : (g.type === 'MultiPolygon' ? g.coordinates : []);
      polys.forEach(function (poly) {
        poly.forEach(function (ring) {
          var cour = null;
          for (var i = 0; i + 1 < ring.length; i++) {
            var a = ring[i], b = ring[i + 1];
            if (vusExact[cleExacte(a, b)]
              || (estSoeur && idxParent && colleeAuParent(a, b))
              || dejaTrace(a, b)) { // arête déjà tracée UNE fois (ou doublon du parent)
              if (cour && cour.length >= 2) res.push({ coords: cour });
              cour = null;
              continue;
            }
            if (!cour) cour = [a];
            cour.push(b);
            vusExact[cleExacte(a, b)] = 1;
            tracer(a, b);
          }
          if (cour && cour.length >= 2) res.push({ coords: cour });
        });
      });
    }
    (vue.features || []).forEach(function (f) { ajouterGeom(f && f.geometry, false); });
    (vue.soeurs || []).forEach(function (f) {
      if (f && f.geometry && !f.__masquee) ajouterGeom(f.geometry, true);
    });
    cacheFrontieresZones = { cle: cle, res: res };
    return res;
  }
  // v0.74 : teintes COURANTES (base + survol) de la zone hôte d'une enclave,
  // quelle que soit sa nature : zone propre de la vue, sœur « c- », pays
  // extérieur « x- » ou pays du monde. L'enclave reprend cette teinte -20 %.
  function couleursHote(cle, sel, enSelection) {
    var mC = /^c-(.+)$/.exec(cle), mX = /^x-(.+)$/.exec(cle);
    if (mC && vue.type !== 'monde' && vue.soeurs) {
      for (var i = 0; i < vue.soeurs.length; i++) {
        if (vue.soeurs[i].id === mC[1]) {
          var f = vue.soeurs[i], ct = f.__ct || vue.continent;
          return { base: (sel[cle] || sel[f.id]) ? selectionnes[ct] : COULEURS[ct], survol: assombris[ct] };
        }
      }
    }
    if (mX) {
      var pX = parId[mX[1]];
      if (pX) return { base: sel[pX.id] ? selectionnes[pX.continent] : COULEURS[pX.continent], survol: assombris[pX.continent] };
    }
    if (vue.type === 'monde') {
      var q = parId[cle];
      if (q) return { base: sel[q.id] ? selectionnes[q.continent] : COULEURS[q.continent], survol: assombris[q.continent] };
    }
    var lz = null;
    var feats = vue.features || [];
    for (var j = 0; j < feats.length; j++) if (feats[j].id === cle) { lz = feats[j]; break; }
    var ctz = lz ? (lz.__ct || vue.continent) : vue.continent;
    var zSel = enSelection && etat.selectionZone === cle;
    return { base: zSel ? assombrir(assombris[ctz]) : assombris[ctz], survol: assombrir(assombris[ctz]) };
  }
  // v0.80l : SIGLES DÉSAMBIGUÏSÉS — extraits de donneesRegions en helper
  // mémoïsé (partagé avec le layout bande v0.80l et donneesVilles).
