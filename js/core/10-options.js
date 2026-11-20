  function optionsBase() {
    return {
      backgroundColor: THEME.fond,
      // v0.71 : SYNCHRONISME STRICT DES COUCHES — 0 ms partout. L'animation
      // de transition (450 ms) animait le geo (polygones + étiquettes)
      // pendant que la couche « frontieres » (animation: false, cf. v0.63)
      // sautait IMMÉDIATEMENT à sa position finale : pendant le pan (clamp
      // de bornage) et le dézoom (retour monde, descentes), blocs pays et
      // noms glissaient d'un côté pendant que les traces de frontière se
      // repropaient de l'autre. Tout change de position ou de zoom
      // STRICTEMENT AU MÊME MOMENT : plus aucune couche ne décalle.
      animationDurationUpdate: 0,
      tooltip: {
        trigger: 'item',
        formatter: function (params) {
          var d = params.data;
          if (params.name === 'socle') return '';
          if (vue.type !== 'monde') {
            if (d && d.pop) return '<b>' + d.nom + '</b><br>' + d.pop.toLocaleString('fr-FR') + ' hab.';
            if (d && d.exterieur) return '<b>' + MAJ(d.nom) + '</b>';
            if (d && d.nom) return '<b>' + d.nom + '</b>' + (d.parent ? '<br>' + d.parent : '');
            return params.name;
          }
          if (!d || !d.nom) return params.name;
          return '<b>' + MAJ(d.nom) + '</b><br>' + DATA.continents[d.continent]
            + (d.capitale ? '<br>Capitale : ' + d.capitale.nom : '');
        },
      },
      geo: {
        map: vue.type === 'monde' ? 'prisme2' : vue.nomMap,
        roam: true,
        layoutCenter: ['50%', '50%'],
        layoutSize: tailleCarte(),
        zoom: etat.zoom,
        center: etat.centre,
        scaleLimit: { min: 0.85, max: 600 },
        // v7.16 : défaut du geo en TEINTE NEUTRE (et non blanc cassé) —
        // une zone sans entrée regions ne peut plus former de « trou
        // blanc » invisible ; les entrées sont ceinturées (06).
        itemStyle: { areaColor: '#d9e2ec', borderColor: THEME.contour, borderWidth: 0 },
        regions: donneesRegionsCeinturees(),
      },
      series: [
        {
          // v0.22 : frontières entre pays dessinées UNE SEULE FOIS (chaque
          // segment partagé par deux voisins a été dédupliqué à la préparation
          // — plus de double trait ni de trace entre pays adjacents).
          // v0.63 : BUG « grandes lignes blanches » — les données de cette
          // série changent à CHAQUE changement de vue (filtrage du contour
          // hôte) : ECharts applique alors son animation de transition aux
          // éléments INDEX PAR INDEX, en interpolant entre polylignes SANS
          // RAPPORT (frontière d'Argentine ↔ côte de Norvège…) — pendant les
          // 450 ms de l'animation, d'immenses traits blancs balaient l'écran
          // avant que la couche ne se stabilise. animation: false : la couche
          // se redessine IMMÉDIATEMENT à sa position finale (elle suit de
          // toute façon la projection du geo pendant le zoom/pan animé).
          id: 'frontieres', type: 'lines', coordinateSystem: 'geo', geoIndex: 0,
          animation: false,
          polyline: true, silent: true, z: 4,
          lineStyle: { color: THEME.contour, width: TRAIT_NIVEAUX, opacity: 1 },
          tooltip: { show: false },
          data: donneesFrontieres(),
        },
        {
          id: 'carte', type: 'map', map: vue.type === 'monde' ? 'prisme2' : vue.nomMap, geoIndex: 0,
          selectedMode: false, // v0.41 : l'app peint la sélection — ECharts ne mémorise plus rien
          data: donneesCarte(),
        },
        {
          // v0.80o : NOMS DE ZONES — pays en vue monde, zones niv 1/2/3 et
          // sœurs en vue admin, ancrés au CENTRE GÉOMÉTRIQUE de leur
          // zone (position exacte) ; nom complet dès que la largeur au
          // centre le permet, sinon ID (pays) ou sigle/abréviation (zone).
          id: 'noms-zones', type: 'scatter', coordinateSystem: 'geo', geoIndex: 0,
          symbol: 'circle', symbolSize: 0, silent: true, tooltip: { show: false },
          data: donneesNomsZones(),
          z: 5,
        },
        {
          id: 'continents', type: 'scatter', coordinateSystem: 'geo', geoIndex: 0,
          symbol: 'circle', data: donneesContinents(), silent: true, tooltip: { show: false },
          z: 5,
        },
        // v0.91 : série « villes » SUPPRIMÉE (affichage des villes retiré).
      ],
    };
  }

  // v0.53 : SURVOL PERSISTANT — chaque repaint (setOption) efface l état
  // « highlight » d ECharts : en survolant une zone puis en zoomant, la
  // zone perdait son assombrissement. La zone survolée est mémorisée
  // (mouseover / mouseout / globalout) et le surlignage est RÉ-ÉMIS
  // après chaque majEtiquettes.
  // v0.80 : SURVOL PEINT PAR LE NOYAU. L'emphasis interne d'ECharts
  // re-rend les polygones du niveau 3 à CHAQUE entrée/sortie de pointeur :
  // sur les géométries lourdes ce re-rendu est fragile et, au sort puis au
  // retour du pointeur, des zones DISPARAISSAIENT (Venezuela, Amérique du
  // Sud, ailleurs dans le monde). Le survol est maintenant peint par
  // nous-mêmes : survolNom mémorise la zone (préfixes c-/x- ignorés),
  // donneesRegions l'assombrit directement et un repaint majEtiquettes
  // est émis à chaque changement ; l'emphasis interne est désactivé
  // (emphasis.disabled) donc plus AUCUN re-rendu ECharts au survol.
