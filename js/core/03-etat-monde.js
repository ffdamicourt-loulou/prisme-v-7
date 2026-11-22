  var ENCLAVES_MONDE = null, ENCLAVES_PAR_CARTE = {}, NOMS_CARTE = {};

  var fc = {
    type: 'FeatureCollection',
    features: DATA.pays.map(function (p) {
      return { type: 'Feature', id: p.id, properties: { name: p.id, nom: p.nom, continent: p.continent, capital: p.capital, cp: cpDe(p.id, p.geometry) }, geometry: p.geometry };
    }),
  };
  // v0.74 : ordre de dessin du monde — un pays enclave est enregistré APRÈS
  // son hôte, sinon le polygone hôte le recouvre (invisible, hover impossible).
  ENCLAVES_MONDE = detecterEnclaves(DATA.pays.map(function (p) {
    return { cle: p.id, geometry: p.geometry };
  }));
  fc.features = ordonnerApresHotes(fc.features.map(function (f) {
    return { cle: f.properties.name, feat: f };
  }), ENCLAVES_MONDE);
  NOMS_CARTE['prisme2'] = fc.features.map(function (f) { return f.properties.name; });

  // Ancres des étiquettes de continents (coordonnées géographiques : suivent la carte)
  // v0.80h : AMÉRIQUES SUR DEUX LIGNES — le libellé espacé « AMÉRIQUE DU NORD »
  // sur une ligne (~38-49° selon l'écran) est PLUS LARGE que l'Amérique du Sud
  // à toute latitude (max 45,5°) : il débordait forcément sur les océans. Les
  // deux Amériques passent sur DEUX LIGNES (« AMÉRIQUE » / « DU NORD »),
  // ≈ 23-26° de large : AMÉRIQUE tient à la latitude la plus large.
  // Ancre = centre horizontal de l'emprise continentale à cette latitude, sur
  // terre : NA lat 45 (emprise -124..-61, centre -92,4, milieu vertical du
  // mainland) ; SA lat -7 (emprise -80..-35, centre -57,5, la plus large).
  var CENTRES = { '150': [16, 50], '002': [20, 6], '142': [92, 44], 'NA': [-92.4, 45], 'SA': [-57.5, -7], '009': [134, -25] }; // v0.80 : latitudes conservées ; longitudes recalculées (moyenne pondérée par aire)
  var CENTRES_CALCULES = null; // v0.80 : centres horizontaux pondérés par aire, calculés une fois

  var etat = { zoom: 1, centre: [11, 22], selection: null, selections: [], zoomEntree: 1,
    selectionZone: null, selVersion: 0 }; // v0.58 : zone sélectionnée par clic simple dans la vue admin
  // v7.30 : selVersion — VERSION DE LA MACHINE À ÉTATS de sélection
  // (cf. 00d-selection-etats.js) : incrémentée à CHAQUE mutation. Le cache
  // de survol (11-survol-repaint) s'invalide sur écart : repeindre toujours
  // depuis etat, jamais depuis un cache daté.
  var zoomMoletteRef = null; // v0.52 : fonction zoom molette, posée par demarrer()
  var carte = null, delaiEtiquettes = null, conteneurCarte = null;
  var apresDemarrageFns = []; // v0.63 : greffons à brancher une fois la carte créée

  // v0.41 : SÉLECTION — L'APPLICATION EST LA SEULE SOURCE DE VÉRITÉ.
  // L'état de sélection INTERNE d'ECharts (selectedMode « multiple ») est
  // abandonné : il basculait à CHAQUE clic de l'utilisateur, sa mémoire
  // persistait entre les vues (une zone ou un pays désélectionné pouvait
  // réapparaître « sélectionné » à la ré-ouverture d'une vue ou lors d'une
  // autre sélection), et sa ré-affirmation après pan/zoom échouait en silence
  // sur les noms préfixés ('x-FR'). La sélection est maintenant PUREMENT
  // PEINTE : `etat.selection` (sélection primaire, celle qui pilote la
  // descente) + `etat.selections` (sélections additionnelles, Maj+clic)
  // → donneesRegions peint chaque région selon cet état, majEtiquettes
  // repeint. Sélectionner autre chose = VRAI RESET visuel : l'ancien
  // repaint en teinte de base, rien ne peut réapparaître. selectedMode est
  // coupé : ECharts ne mémorise plus rien.
  // v7.30 : SÉLECTION QUALIFIÉE « 2:a3¤parent¤nom » (séparateur U+00A4 ¤).
  // Une zone désignée par sa clef QUALIFIÉE ne peut plus être confondue
  // avec un homonyme d'un autre niveau ou d'un autre parent : le comté
  // Washington du Texas (2:USA¤Texas¤Washington) n'est plus l'État de
  // Washington (2:USA¤¤Washington) ni le comté Washington de l'Iowa.
  // cleSel(fz) : clef d'une zone de la vue ; repli 'c-'+id pour les zones
  // sans ancres (pays du monde, zones profondes non étampées).
  function cleSel(fz) {
    if (!fz) return null;
    var nom = (fz.nom != null ? fz.nom : fz.id) || '';
    if (!nom) return null;
    if (fz.__a3) return '2:' + fz.__a3 + '\u00A4' + (fz.__parent || '') + '\u00A4' + nom;
    return 'c-' + fz.id;
  }
  // zoneDeCleSel(k) : résout une clef qualifiée contre la VUE COURANTE
  // (features + sœurs) — la clef désigne la zone AFFICHABLE qu'elle peint.
  function zoneDeCleSel(n) {
    if (typeof n !== 'string' || n.slice(0, 2) !== '2:') return null;
    var parties = n.slice(2).split('\u00A4');
    var fs = (typeof vue !== 'undefined' && vue && vue.features) ? vue.features : [];
    var sw = (typeof vue !== 'undefined' && vue && vue.soeurs) ? vue.soeurs : [];
    for (var k = 0; k < fs.length + sw.length; k++) {
      var f = k < fs.length ? fs[k] : sw[k - fs.length];
      if (f && f.__a3 === parties[0] && (f.__parent || '') === parties[1]
        && ((f.nom != null && f.nom === parties[2]) || f.id === parties[2])) return f;
    }
    return null;
  }
  function ensembleSelection() {
    var s = {};
    if (etat.selection) s[etat.selection] = 1;
    for (var i = 0; i < etat.selections.length; i++) {
      var n = etat.selections[i];
      // v7.30 : les clefs QUALIFIÉES « 2:a3¤parent¤nom » sont résolues
      // contre la vue : la peinture marque la zone affichée (id) ET son
      // entrée 'c-' de compatibilité (les peintres cherchent les deux).
      // Entrées LEGACY (pays, 'c-x', noms) : acceptées telles quelles.
      if (typeof n === 'string' && n.slice(0, 2) === '2:') {
        var fq = zoneDeCleSel(n);
        if (fq) { s[fq.id] = 1; s['c-' + fq.id] = 1; s[n] = 1; }
        else s[n] = 1; // sélection persistante hors vue (restaurée au retour)
      } else s[n] = 1;
    }
    return s;
  }

  function tailles(zoom) {
    return {
      etiquette: Math.max(11, Math.min(16, 8 * Math.sqrt(zoom) + 3)), // v0.80h3 : régions +3 px
    };
  }

  function tailleCarte() {
    if (!conteneurCarte) return undefined;
    var w = conteneurCarte.clientWidth, h = conteneurCarte.clientHeight;
    // v0.25 : le monde doit tenir EN HAUTEUR aussi. layoutSize borne la
    // LARGEUR de la carte, et ECharts rend l'axe lat avec aspectScale 0.75
    // par défaut → hauteur = layoutSize / 1,942 (mesuré). L'ancien plafond
    // h*3,05 laissait la hauteur dépasser l'écran (vue monde tronquée).
    return Math.min(Math.round(w * 0.98), Math.round(h * 1.87));
  }

  // Liste affichée dans la vue courante : [{ id, nom, continent }]
  function listeVue() {
    if (vue.type === 'monde') return DATA.pays;
    // v7.32 : `parent` — la VRAIE appartenance de la zone (__parent, ancre
    // d'identité v7.30) quand elle est connue : l'infobulle des zones
    // AJOUTÉES par bascule affichait le parent de la VUE (ex. les
    // arrondissements de Paris « appartenant au Loiret » dans une vue
    // ouverte depuis le Loiret) au lieu de leur parent réel.
    return vue.features.map(function (f) {
      return { id: f.id, nom: f.nom, continent: f.__ct || vue.continent,
        parent: (f.__parent != null ? f.__parent : vue.parent) };
    });
  }

  // Étiquettes des pays extérieurs (arrière-plan d'une descente) : affichées
  // en contexte (label.show: true), sans test de taille.
