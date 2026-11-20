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
  // v0.74 : teintes COURANTES (base + survol) de la zone hôte d'une enclave,
  // quelle que soit sa nature : zone propre de la vue, sœur « c- », pays
  // extérieur « x- » ou pays du monde. L'enclave reprend cette teinte -20 %.
  function couleursHote(cle, sel, enSelection) {
    var mC = /^c-(.+)$/.exec(cle), mX = /^x-(.+)$/.exec(cle);
    if (mC && vue.type !== 'monde' && vue.soeurs) {
      for (var i = 0; i < vue.soeurs.length; i++) {
        if (vue.soeurs[i].id === mC[1]) {
          var f = vue.soeurs[i], ct = f.__ct || vue.continent;
          return { base: (sel[cle] || sel[f.id]) ? assombris[ct] : COULEURS[ct], survol: assombris[ct] };
        }
      }
    }
    if (mX) {
      var pX = parId[mX[1]];
      if (pX) return { base: sel[pX.id] ? assombris[pX.continent] : COULEURS[pX.continent], survol: assombris[pX.continent] };
    }
    if (vue.type === 'monde') {
      var q = parId[cle];
      if (q) return { base: sel[q.id] ? assombris[q.continent] : COULEURS[q.continent], survol: assombris[q.continent] };
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
