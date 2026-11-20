  var survolNom = null;
  // v0.80e : SURVOL CHIRURGICAL — cache du dernier tableau geo.regions peint
  // et, pour chaque zone, sa couleur de REPOS et sa couleur de SURVOL. Entrer
  // ou sortir du pointeur ne repeint QUE les zones concernées (repaintSurvol) :
  // plus aucun repaint complet (reprojection des ~67 000 segments) au survol.
  var REGIONS_DERNIERES = null;
  var BASE_PAR_NOM = {};
  var SURVOL_PAR_NOM = {};
  // v0.80e : cache commun (démarrage + majEtiquettes). La zone COURAMMENT
  // survolée n'écrit JAMAIS sa couleur dans BASE_PAR_NOM : son entrée peinte
  // est la couleur de SURVOL, pas de repos (sinon le premier survol, qui
  // passait par le repaint complet, empoisonnait le cache pour toujours).
  function cacherRegions(regions) {
    REGIONS_DERNIERES = regions;
    var nu = function (n) { return (n || '').replace(/^[cx]-/, ''); };
    var nSurv = nu(survolNom);
    (regions || []).forEach(function (r) {
      if (!r || !r.name || !r.itemStyle || !r.itemStyle.areaColor) return;
      if (nu(r.name) === nSurv && nSurv !== '') return; // zone survolée : couleur ≠ repos
      BASE_PAR_NOM[r.name] = r.itemStyle.areaColor;
    });
  }
  // v0.80e : SURVOL CHIRURGICAL — réexpédie le cache en ne recolorant que la
  // zone qui vient d'être survolée (et celle qu'on quitte). Chirurgie O(1) :
  // l'assombrissement est instantané, même sur la carte du monde complète.
  function repaintSurvol(ancien, nouveau) {
    if (!carte || !REGIONS_DERNIERES) { try { majEtiquettes(); } catch (err) { } return; }
    var nu = function (n) { return (n || '').replace(/^[cx]-/, ''); };
    var a = nu(ancien), n2 = nu(nouveau);
    var ok = true;
    var regs = REGIONS_DERNIERES.map(function (r) {
      var rn = nu(String((r && r.name) || ''));
      if (rn === '' || (rn !== a && rn !== n2)) return r;
      var c = (rn === n2) ? SURVOL_PAR_NOM[r.name] : BASE_PAR_NOM[r.name];
      if (!c) { ok = false; return r; }
      var r2 = {}; for (var k in r) r2[k] = r[k];
      r2.itemStyle = { areaColor: c, color: c,
        borderColor: r.itemStyle && r.itemStyle.borderColor,
        borderWidth: r.itemStyle && r.itemStyle.borderWidth };
      return r2;
    });
    if (!ok) { try { majEtiquettes(); } catch (err) { } return; }
    try { carte.setOption({ geo: { regions: regs } }); } catch (err) { try { majEtiquettes(); } catch (err2) { } }
    // thème : le texte de la zone survolée passe en texteSurvol, textes sinon
    try {
      if (ETQ_SORTIE && ETQ_SORTIE.length) {
        var ndN = ETQ_SORTIE.map(function (it) {
          if (!it || !it.label) return it;
          var iu = nu(String(it.etqId != null ? it.etqId : it.name));
          if (iu !== a && iu !== n2) return it;
          var c2 = {}; for (var kk in it) c2[kk] = it[kk];
          c2.label = {}; for (var k3 in it.label) c2.label[k3] = it.label[k3];
          c2.label.color = (iu === n2) ? THEME.texteSurvol : (THEME.texte || '#ffffff');
          return c2;
        });
        carte.setOption({ series: [{ id: 'noms-zones', data: ndN }] });
      }
    } catch (errNoms) { }
  }
  function initSurvol() {
    var nu = function (n) { return (n || '').replace(/^[cx]-/, ''); };
    // v0.80e : chaque entrée/sortie de pointeur appelle repaintSurvol
    // (chirurgique) ; le repli complet majEtiquettes ne se déclenche que
    // si le cache manque (jamais en pratique après le premier paint).
    carte.on('mouseover', function (e) {
      if (e && e.componentType === 'series' && e.seriesType === 'map' && nu(survolNom) !== nu(e.name)) {
        var ancien = survolNom; survolNom = e.name; repaintSurvol(ancien, survolNom);
      }
    });
    carte.on('mouseout', function (e) {
      if (e && e.componentType === 'series' && e.seriesType === 'map' && nu(survolNom) === nu(e.name)) {
        var ancien = survolNom; survolNom = null; repaintSurvol(ancien, null);
      }
    });
    carte.on('globalout', function () { if (survolNom) { var ancien = survolNom; survolNom = null; repaintSurvol(ancien, null); } });
  }
  // v0.71 : zoom au moment du DERNIER majEtiquettes — un pan pur (zoom
  // constant) ne change RIEN aux étiquettes (visibilité, abréviations et
  // tailles ne dépendent que du zoom et de la vue) : le repaint tous les
  // 90 ms re-projetait inutilement les ~67 000 segments de frontières et
  // hachait le pan.
  var zoomDernierRepaint = null;
  function majEtiquettes() {
    zoomDernierRepaint = etat.zoom;
    if (typeof majCompteurZoom === 'function') majCompteurZoom(); // v0.99
    var regions;
    try {
      regions = donneesRegions();
    } catch (e) {
      // v0.74 : peinture de REPLI — si le calcul des régions échoue
      // entièrement, on repeint quand même toutes les zones connues de la
      // carte en teinte de continent : jamais de carte blanche.
      console.warn('[Prisme2] donneesRegions a échoué, repli de peinture', e);
      regions = (NOMS_CARTE[vue.type === 'monde' ? 'prisme2' : vue.nomMap] || []).map(function (n) {
        return regionRepli(n);
      });
    }
    // v0.74 : CEINTURE DE COMPLÉTUDE — toute feature enregistrée dans la
    // carte DOIT avoir une entrée geo.regions : sans entrée, ECharts la
    // rend avec la couleur PAR DÉFAUT (blanc). C'est l'origine des
    // « trous blancs » sur les sélections lourdes (comtés américains,
    // provinces italiennes). Un nom manquant reçoit la teinte de repli.
    var noms = NOMS_CARTE[vue.type === 'monde' ? 'prisme2' : vue.nomMap] || [];
    if (noms.length) {
      var vus = {};
      regions.forEach(function (r) { vus[r.name] = true; });
      noms.forEach(function (n) {
        if (!vus[n]) regions.push(regionRepli(n));
      });
    }
    // v0.80e : cache du survol chirurgical — tableau courant + couleurs
    // de repos ; les couleurs de SURVOL sont posées dans donneesRegions.
    cacherRegions(regions);
    carte.setOption({
      geo: { regions: regions },
      series: [
        { id: 'carte', data: donneesCarte() },
        { id: 'noms-zones', data: donneesNomsZones() }, // v0.80o : étiquettes zones (pays + niv 1/2/3 + sœurs)
        { id: 'continents', data: donneesContinents() },
      ],
    });
    // v0.80 : plus de dispatchAction highlight — le survol est peint par le noyau.
  }
  // v0.74 : entrée geo.regions de repli pour un nom de zone (teinte du
  // continent, sans étiquette) — utilisée par la ceinture de complétude
  // et le repli d'erreur : aucune zone ne peut rester blanche.
  function regionRepli(n) {
    var socle = n === 'socle' || n.indexOf('socle@') === 0;
    var pid = socle ? null : n.replace(/^c-/, '').replace(/^x-/, '');
    var p = pid ? parId[pid] : null;
    var tf = p ? (COULEURS[p.continent] || assombris[p.continent] || '#d9e2ec')
      : (COULEURS[vue.continent] || '#d9e2ec');
    if (socle) tf = COULEURS[vue.continent] || '#d9e2ec';
    return {
      name: n,
      itemStyle: { areaColor: tf, color: tf, borderColor: socle ? tf : '#ffffff', borderWidth: socle ? 0 : TRAIT_NIVEAUX },
      emphasis: { disabled: true, itemStyle: { areaColor: tf, color: tf, borderColor: socle ? tf : '#ffffff', borderWidth: socle ? 0 : TRAIT_NIVEAUX }, label: { show: false } },
      label: { show: false },
    };
  }
  // v0.46 : planification des repaints — throttle : premier repaint à 90 ms,
  // puis au plus un tous les 90 ms, ET un repaint TRAÎNANT garanti après la
  // dernière rafale de georoam (plus de remise-à-zéro qui repousse sans fin).
