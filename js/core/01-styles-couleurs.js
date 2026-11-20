  var COULEURS = window.__PR2_COULEURS;   // { '002': '#d95d2f', ... } teintes v16
  var VERSION = 'v0.210'; // v0.92 : noms n2/n3 à taille zoom-dépendante + nom entier sur 2 lignes
  // v0.80m : STYLES CENTRAUX — source unique de la typographie et des traits.
  // ECharts dessine les étiquettes DANS le canvas : le CSS ne peut pas les
  // styliser. Ce bloc joue le rôle de « feuille de style » du canvas, et le
  // chrome DOM (bandeau, fil, fenêtre) vit dans prisme2.css (media queries
  // pour le responsive). Pour adapter la carte à un écran étroit, il suffit
  // de modifier STYLES au runtime (les vues se recalculent au repaint).
  var STYLES = {
    trait: { niveaux: 0.6 },            // filet blanc uniforme (référence : niveau 3)
    etiquette: { fontWeight: 300 },     // noms de pays, régions, sous-régions
    continents: { fontSize: 14, fontWeight: 600 },
    villes: {
      fontSize: 12.3,                   // v0.80l : −15 %
      fontWeight: 300,
      espacementLettres: 1,             // px entre caractères (espaces fines U+200A)
      cercle: 1.5,                      // v0.80l : épaisseur du contour −25 %
    },
    // v0.80n : facteur de taille du CODE des pays (FR, CH…) relatif au nom
    // (codes plus petits : anti-chevauchement en Europe en vue monde)
    pays: { facteurCode: 0.72 },
  };
  // v0.80 : ÉPAISSEUR UNIFORME DU FILET — la référence est le niveau 3 : tous les niveaux (1, 2, 3), tous les états (repos, sélection, survol) et la couche « frontieres » partagent TRAIT_NIVEAUX = 0,6 px.
  var TRAIT_NIVEAUX = (window.__PR2_THEME && window.__PR2_THEME.traitNiveaux != null) ? window.__PR2_THEME.traitNiveaux : STYLES.trait.niveaux;
  var BLANC = '#ffffff', NOIR = '#1a1a1a';
  // THÈME (fichier d apparence) : posé par <script id="prisme2-theme">
  var THEME = (window.__PR2_THEME = Object.assign({
    fond: '#eaf2f8', pays: null, survol: null, contour: '#ffffff',
    texte: null, texteSurvol: '#000000', ombre: null
  }, window.__PR2_THEME || {}));
  var ETQ_SORTIE = null; // cache des étiquettes (texte du survol)
  // v0.27 : les noms de PAYS s'affichent en MAJUSCULES (subdivisions inchangées)
  function MAJ(s) { return s ? s.toUpperCase() : s; }
  // v0.80 : ESPACEMENT DES NOMS (+1 px) — ECharts ne gère pas letterSpacing
  // sur les étiquettes geo : l'espacement est inséré manuellement sous
  // forme d'espaces FINES (U+200A, ≈1 px) entre les caractères de TOUT nom
  // affiché (pays, régions, sous-régions, continents). faitTient en tient
  // compte (+1 px/caractère). Les infobulles gardent le nom complet normal.
  function espaceLettres(s) {
    if (!s) return s;
    var t = String(s).split('');
    return t.join('\u200A');
  }

  // ---------- Tracé de l'Oural (limite Europe/Asie de la Russie) ----------
  function lonOural(lat) {
    var U = DATA.ural;
    if (lat <= U[0][0]) return U[0][1];
    var n = U.length;
    if (lat >= U[n - 1][0]) return U[n - 1][1];
    for (var i = 1; i < n; i++) {
      if (lat <= U[i][0]) {
        var a = U[i - 1], b = U[i];
        return a[1] + (b[1] - a[1]) * (lat - a[0]) / (b[0] - a[0]);
      }
    }
    return U[n - 1][1];
  }
  function coteOural(pt) { return pt[0] - lonOural(pt[1]); }

  // ---------- Fonctions pures (testables, exposées sous window.__PR2) ----------
  function hexVersRgb(h) {
    h = h.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function luminance(hex) {
    var c = hexVersRgb(hex);
    return (Math.max(c[0], c[1], c[2]) + Math.min(c[0], c[1], c[2])) / 2 / 255;
  }
  function couleurTexte(teinte) {
    return luminance(teinte) <= 0.5 ? BLANC : NOIR;
  }
  function rgbVersHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    var h = 0, s = 0, l = (max + min) / 2;
    if (d) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }
  function hslVersHex(h, s, l) {
    function t2c(p, q, t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    var r, g, b;
    if (!s) { r = g = b = l; }
    else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      r = t2c(p, q, h + 1 / 3); g = t2c(p, q, h); b = t2c(p, q, h - 1 / 3);
    }
    var to = function (x) { var v = Math.round(x * 255).toString(16); return v.length === 1 ? '0' + v : v; };
    return '#' + to(r) + to(g) + to(b);
  }
  function assombrir(hex) {
    var c = hexVersRgb(hex), hsl = rgbVersHsl(c[0], c[1], c[2]);
    return hslVersHex(hsl[0], hsl[1], Math.max(0, hsl[2] * 0.80));
  }
  function boite(geometry) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    function anneaux(polys) {
      for (var i = 0; i < polys.length; i++)
        for (var j = 0; j < polys[i].length; j++) {
          var pt = polys[i][j];
          if (pt[0] < b[0]) b[0] = pt[0];
          if (pt[1] < b[1]) b[1] = pt[1];
          if (pt[0] > b[2]) b[2] = pt[0];
          if (pt[1] > b[3]) b[3] = pt[1];
        }
    }
    if (geometry.type === 'Polygon') anneaux(geometry.coordinates);
    else for (var k = 0; k < geometry.coordinates.length; k++) anneaux(geometry.coordinates[k]);
    return b;
  }
  // v0.31 : le polygone PRINCIPAL est celui de plus grande AIRE RÉELLE (et
  // plus de la plus grande BOÎTE) — la boîte des Açores était plus large que
  // celle de la métropole portugaise : ancre et cadrage partaient au milieu
  // de l'Atlantique.
  // v0.91 : airePolygone/aireGeo déménagent dans core/02 (géométrie).
  function boitePrincipale(geometry) {
    var polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    var meilleure = null, aireMax = -1;
    polys.forEach(function (poly) {
      var aire = airePolygone(poly);
      if (aire > aireMax) { aireMax = aire; meilleure = poly; }
    });
    return boite({ type: 'Polygon', coordinates: meilleure });
  }
  // ---------- Vues (monde / subdivisions) ----------
