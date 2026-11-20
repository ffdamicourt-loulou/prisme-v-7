  function pointDansGeometrie(pt, geometry) {
    if (!geometry) return false;
    var polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    for (var i = 0; i < polys.length; i++) if (pointDansPoly(pt, polys[i])) return true;
    return false;
  }
  function aireAnneau(ring) {
    var s = 0;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++)
      s += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    return Math.abs(s / 2);
  }
  function pointRepresentatif(geometry) {
    var polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    var ring = null, aMax = -1;
    polys.forEach(function (p) {
      var r = p && p[0];
      if (!r || r.length < 3) return;
      var a = aireAnneau(r);
      if (a > aMax) { aMax = a; ring = r; }
    });
    if (!ring) return null;
    var sx = 0, sy = 0;
    for (var k = 0; k < ring.length; k++) { sx += ring[k][0]; sy += ring[k][1]; }
    var c = [sx / ring.length, sy / ring.length], loin = ring[0], dl = -1;
    for (var k2 = 0; k2 < ring.length; k2++) {
      var d2 = (ring[k2][0] - c[0]) * (ring[k2][0] - c[0]) + (ring[k2][1] - c[1]) * (ring[k2][1] - c[1]);
      if (d2 > dl) { dl = d2; loin = ring[k2]; }
    }
    return { centre: c, extreme: loin };
  }
  // v0.78 : ÉCHANTILLONNAGE des sommets d'une géométrie (anneaux externes,
  // au plus max points, pas régulier) — base de la détection d'enclaves.
  function sommetsEchantillon(geometry, max) {
    var pts = [];
    var polys = geometry.type === 'Polygon' ? [geometry.coordinates] : (geometry.coordinates || []);
    polys.forEach(function (p) {
      var r = p && p[0];
      if (r) for (var k = 0; k < r.length; k++) pts.push(r[k]);
    });
    if (pts.length <= max) return pts;
    var pas = pts.length / max, res = [];
    for (var i = 0; i < max; i++) res.push(pts[Math.floor(i * pas)]);
    return res;
  }
  // v0.78 : un sommet POSÉ SUR la frontière commune (tolérance eps en
  // degrés) compte comme intérieur — deux vrais voisins partagent leurs
  // sommets exactement ; une enclave, elle, a ses sommets dans l'hôte.
  function presqueDansGeometrie(pt, geometry, eps) {
    if (pointDansGeometrie(pt, geometry)) return true;
    var polys = geometry.type === 'Polygon' ? [geometry.coordinates] : (geometry.coordinates || []);
    for (var i = 0; i < polys.length; i++) {
      var r = polys[i] && polys[i][0];
      if (!r) continue;
      for (var k = 0; k < r.length - 1; k++) {
        var s1 = r[k], s2 = r[k + 1];
        if (Math.min(s1[0], s2[0]) - eps > pt[0] || Math.max(s1[0], s2[0]) + eps < pt[0] ||
            Math.min(s1[1], s2[1]) - eps > pt[1] || Math.max(s1[1], s2[1]) + eps < pt[1]) continue;
        var vx = s2[0] - s1[0], vy = s2[1] - s1[1];
        var L = vx * vx + vy * vy;
        var t = L ? ((pt[0] - s1[0]) * vx + (pt[1] - s1[1]) * vy) / L : 0;
        if (t < 0) t = 0; if (t > 1) t = 1;
        var dx = pt[0] - (s1[0] + t * vx), dy = pt[1] - (s1[1] + t * vy);
        if (dx * dx + dy * dy <= eps * eps) return true;
      }
    }
    return false;
  }
  function detecterEnclaves(items) {
    var res = {}, geo = {};
    items.forEach(function (it) { geo[it.cle] = it.geometry; });
    for (var i = 0; i < items.length; i++) {
      var a = items[i];
      if (!a.geometry) continue;
      var ba = boite(a.geometry), pr = pointRepresentatif(a.geometry);
      if (!ba || !pr) continue;
      for (var j = 0; j < items.length; j++) {
        if (i === j) continue;
        var b = items[j];
        if (!b.geometry) continue;
        var bb = boite(b.geometry);
        if (!bb) continue;
        if (ba[0] < bb[0] - 1e-9 || ba[1] < bb[1] - 1e-9 || ba[2] > bb[2] + 1e-9 || ba[3] > bb[3] + 1e-9) continue;
        // v0.78 : ÉCHANTILLONNAGE COMPLET — les deux seuls points témoins
        // (centre + extrême) de la v0.74 laissaient passer des FAUX
        // POSITIFS : une zone simplement ADJACENTE à une grande sœur dont
        // la bbox l'englobe (Damas dans Rif Dimachq) était classée enclave
        // et peinte « déjà sélectionnée ». Une enclave réelle a (quasi)
        // TOUS ses sommets dans l'hôte ; il faut au moins 97 % des sommets
        // échantillonnés à l'intérieur (frontière commune comprise, à
        // 2e-4° ≈ 20 m près).
        if (!pointDansGeometrie(pr.centre, b.geometry)) continue;
        var sommets = sommetsEchantillon(a.geometry, 80);
        if (!sommets.length) continue;
        var dedans = 0;
        for (var s = 0; s < sommets.length; s++) {
          if (presqueDansGeometrie(sommets[s], b.geometry, 2e-4)) dedans++;
        }
        if (dedans / sommets.length < 0.97) continue;
        if (!res[a.cle] || aireGeo(b.geometry) < aireGeo(geo[res[a.cle]])) res[a.cle] = b.cle;
      }
    }
    return res;
  }
  // Profondeur dans la chaîne d'enclaves (garde-fou anti-cycle : 8 max).
  function profondeurEnclave(cle, enc) {
    var n = 0;
    while (enc[cle] && n < 8) { cle = enc[cle]; n++; }
    return n;
  }
  // Réordonne : hôte AVANT enclave (l'enclave est dessinée PAR-DESSUS).
  function ordonnerApresHotes(items, enc) {
    return items.slice().sort(function (x, y) {
      return profondeurEnclave(x.cle, enc) - profondeurEnclave(y.cle, enc);
    }).map(function (it) { return it.feat; });
  }
