  var CACHE_SIGLES = { cle: null, table: null };
  function siglesVue(t, pxLon, pxLat) {
    var cle = (vue.nomMap || 'monde') + '|' + pxLon + '|' + t.etiquette;
    if (CACHE_SIGLES.cle === cle) return CACHE_SIGLES.table;
    var sigles = {};
    (function () {
      var cibles = [];
      listeVue().forEach(function (z) { cibles.push({ nom: z.nom, id: z.id }); });
      if (vue.type !== 'monde' && vue.soeurs) vue.soeurs.forEach(function (f) { cibles.push({ nom: f.nom, id: 'c-' + f.id }); });
      var groupes = {};
      cibles.forEach(function (c) {
        if (faitTient(c.nom, c.id, t, pxLon, pxLat)) return;
        var a = abrev(c.nom);
        (groupes[a] = groupes[a] || []).push(c.nom);
      });
      Object.keys(groupes).forEach(function (a) {
        var g = groupes[a];
        g.forEach(function (n) {
          sigles[n] = g.length > 1 ? abrevDistinct(n, g) : abrev(n);
        });
      });
    })();
    CACHE_SIGLES.cle = cle; CACHE_SIGLES.table = sigles;
    return sigles;
  }
