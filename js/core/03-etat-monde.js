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
    selectionZone: null }; // v0.58 : zone sélectionnée par clic simple dans la vue admin
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
  function ensembleSelection() {
    var s = {};
    if (etat.selection) s[etat.selection] = 1;
    for (var i = 0; i < etat.selections.length; i++) s[etat.selections[i]] = 1;
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
    return vue.features.map(function (f) { return { id: f.id, nom: f.nom, continent: f.__ct || vue.continent }; });
  }

  // Étiquettes des pays extérieurs (arrière-plan d'une descente) : affichées
  // en contexte (label.show: true), sans test de taille.
