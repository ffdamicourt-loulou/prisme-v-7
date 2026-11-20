  // v0.96 : donneesVilles() est morte depuis v0.91 (affichage supprimé) —
  // stub : l API est conservée, la série est toujours vide.
  function donneesVilles() { return []; }
  function donneesContinents() {
    // v0.100 : NOMS DE CONTINENTS SUPPRIMÉS (AFRIQUE, EUROPE…) — la série
    // reste déclarée (options/survol) mais TOUJOURS vide.
    return [];
    if (vue.type !== 'monde') return [];
    var visibles = etat.zoom < 1.8;
    // v0.80o : centres géométriques pondérés par l'aire (centreContinent).
    // EXCEPTION Europe : seule la partie RUSSIE D'OURAL de la Russie y
    // entre (le clip Oural évite un centre tombé en Sibérie).
    if (!CENTRES_CALCULES) {
      CENTRES_CALCULES = {};
      Object.keys(CENTRES).forEach(function (k) {
        CENTRES_CALCULES[k] = centreContinent(k);
      });
    }
    var layoutPx = tailleCarte() || 1200;
    return Object.keys(CENTRES).map(function (k) {
      var lat = CENTRES_CALCULES[k][1]; // v0.80g : ancre fixe, centrée sur le continent
      return {
        name: k,
        value: [CENTRES_CALCULES[k][0], lat, DATA.continents[k].toUpperCase()],
        symbolSize: 0,
        // v0.80h : Amériques sur DEUX LIGNES (le libellé d'une ligne déborde
        // des côtes de l'Amérique du Sud à toute latitude)
        label: { show: visibles, lineHeight: 15,
          formatter: function (d) {
            var t = d.value[2];
            if (t === 'AMÉRIQUE DU NORD') return espaceLettres('AMÉRIQUE') + '\n' + espaceLettres('DU NORD');
            if (t === 'AMÉRIQUE DU SUD') return espaceLettres('AMÉRIQUE') + '\n' + espaceLettres('DU SUD');
            return espaceLettres(t);
          },
          fontSize: STYLES.continents.fontSize, fontWeight: STYLES.continents.fontWeight, color: THEME.texte || BLANC, position: 'inside' }, // v0.85 : centrage reel ; v0.80 : 14 px (+1) et lettres espacées
        itemStyle: { color: 'transparent' },
      };
    });
  }
