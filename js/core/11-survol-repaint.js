  var survolNom = null;
  // v0.80e : SURVOL CHIRURGICAL — cache du dernier tableau geo.regions peint
  // et, pour chaque zone, sa couleur de REPOS et sa couleur de SURVOL. Entrer
  // ou sortir du pointeur ne repeint QUE les zones concernées (repaintSurvol) :
  // plus aucun repaint complet (reprojection des ~67 000 segments) au survol.
  var REGIONS_DERNIERES = null;
  var BASE_PAR_NOM = {};
  var SURVOL_PAR_NOM = {};
  // v7.30 : LE CACHE DE SURVOL EST VERSIONNÉ PAR LA SÉLECTION — BASE_PAR_NOM
  // capture la teinte de chaque zone à l'instant du dernier paint complet.
  // Si la sélection change SANS repaint complet (mutation par la machine à
  // états 00d : selEnvoyer/selAjouter/selRetirer/selVider), le cache est
  // PÉRIMÉ : une teinte de sélection y manque encore. repaintSurvol ne doit
  // JAMAIS repeindre depuis un cache périmé : il se dégrade en repaint
  // complet (majEtiquettes, qui recache à la version courante). Règle :
  // « repeindre toujours depuis etat, jamais depuis un cache daté ».
  var SELV_BASE = 0;
  // v0.80e : cache commun (démarrage + majEtiquettes). La zone COURAMMENT
  // survolée n'écrit JAMAIS sa couleur dans BASE_PAR_NOM : son entrée peinte
  // est la couleur de SURVOL, pas de repos (sinon le premier survol, qui
  // passait par le repaint complet, empoisonnait le cache pour toujours).
  function cacherRegions(regions) {
    REGIONS_DERNIERES = regions;
    // v7.30 : version de la machine à états au moment du cache — tout
    // écart détecté dans repaintSurvol invalide le cache (full repaint).
    SELV_BASE = (etat && etat.selVersion) || 0;
    var nu = function (n) { return (n || '').replace(/^[cx]-/, ''); };
    var nSurv = nu(survolNom);
    // v7.29 : LES ZONES SÉLECTIONNÉES SONT TOUJOURS CACHÉES — la règle
    // « la zone survolée n'écrit jamais sa couleur » datait du temps où
    // la couleur peinte d'une zone survolée était la teinte de SURVOL.
    // Depuis v7.14, LA SÉLECTION PRIME SUR LE SURVOL : une zone de la
    // sélection est peinte en teinte de sélection MÊME survolée. Or le
    // Maj+clic survole forcément la zone cliquée : après un Maj+clic, le
    // full repaint peignait la zone cliquée en teinte de sélection mais
    // cacherRegions REFUSAIT de la cacher (présumée « couleur de survol »)
    // → BASE_PAR_NOM gardait l'ANCIENNE teinte de REPOS ; dès que le
    // pointeur quittait la zone, repaintSurvol la repeignait en teinte de
    // REPOS : « les zones sélectionnées perdent leur statut ». La zone
    // survolée n'est écartée du base QUE si elle N'EST PAS sélectionnée.
    var selC = (typeof ensembleSelection === 'function') ? ensembleSelection() : {};
    (regions || []).forEach(function (r) {
      if (!r || !r.name || !r.itemStyle || !r.itemStyle.areaColor) return;
      var rn = nu(r.name);
      var estSel = !!(selC[r.name] || selC['c-' + rn] || selC[rn]);
      if (rn === nSurv && nSurv !== '' && !estSel) return; // zone survolée non sélectionnée : couleur ≠ repos
      BASE_PAR_NOM[r.name] = r.itemStyle.areaColor;
    });
  }
  // v0.80e : SURVOL CHIRURGICAL — réexpédie le cache en ne recolorant que la
  // zone qui vient d'être survolée (et celle qu'on quitte). Chirurgie O(1) :
  // l'assombrissement est instantané, même sur la carte du monde complète.
  function repaintSurvol(ancien, nouveau) {
    if (!carte || !REGIONS_DERNIERES) { try { majEtiquettes(); } catch (err) { } return; }
    // v7.30 : CACHE PÉRIMÉ ? Si la machine à états a muté la sélection
    // depuis le dernier paint complet, BASE_PAR_NOM est daté : repeindre
    // depuis lui repeindrait une zone fraîchement sélectionnée en sa
    // vieilles teinte de repos (bug « les sélections se perdent », cause
    // n°2). On SE DÉGRADE en repaint complet, qui repeint depuis etat et
    // recache à la version courante — jamais depuis un cache daté.
    if (((etat && etat.selVersion) || 0) !== SELV_BASE) {
      try { majEtiquettes(); } catch (err) { }
      return;
    }
    var nu = function (n) { return (n || '').replace(/^[cx]-/, ''); };
    var a = nu(ancien), n2 = nu(nouveau);
    // v7.29 : LA SÉLECTION PRIME SUR LE SURVOL AUSSI ICI — entrer du
    // pointeur sur une zone SÉLECTIONNÉE ne doit PAS la repeindre en
    // teinte de survol (règle de peinture v7.14) : sa couleur affichée
    // reste celle du cache de base, qui depuis v7.29 contient bien la
    // teinte de sélection.
    var selR = (typeof ensembleSelection === 'function') ? ensembleSelection() : {};
    var ok = true;
    var regs = REGIONS_DERNIERES.map(function (r) {
      var rn = nu(String((r && r.name) || ''));
      if (rn === '' || (rn !== a && rn !== n2)) return r;
      var estSel = !!(selR[(r && r.name) || ''] || selR['c-' + rn] || selR[rn]);
      var c = (rn === n2 && !estSel) ? SURVOL_PAR_NOM[r.name] : BASE_PAR_NOM[r.name];
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
      // v7.36 : en VUES ADMIN, les étiquettes de zones, sœurs et EXTÉRIEURS
      // sont toutes BLANCHES en repos COMME en survol/sélection (cf.
      // donneesNomsZones) : réexpédier les données d'étiquettes à CHAQUE
      // entrée/sortie de survol ne changeait AUCUNE couleur et forçait un
      // re-rendu complet du niveau (« au Portugal/England, toutes les
      // frontières se redessinent à chaque sortie de zone »). Vue monde
      // inchangée : c'est là que le texte survolé change de teinte.
      if (ETQ_SORTIE && ETQ_SORTIE.length && vue && vue.type === 'monde') {
        // v7.4 : aux NIVEAUX 1/2/3 (vues admin), les états SURVOLÉ et
        // SÉLECTIONNÉ conservent les textes en BLANC : la peinture de ces
        // états est la teinte assombrie du continent, le blanc y est
        // toujours lisible (en vue monde, texteSurvol du thème).
        var adminN123 = vue && vue.type !== 'monde';
        var selNu = function (n) { return String(n || '').replace(/^c-/, ''); };
        var ndN = ETQ_SORTIE.map(function (it) {
          if (!it || !it.label) return it;
          var iu = nu(String(it.etqId != null ? it.etqId : it.name));
          if (iu !== a && iu !== n2) {
            // v7.4 : zone SÉLECTIONNÉE (hors survol) : blanc en vues admin
            if (adminN123 && etat.selectionZone && iu === selNu(etat.selectionZone)) {
              var cS = {}; for (var kS in it) cS[kS] = it[kS];
              cS.label = {}; for (var kLS in it.label) cS.label[kLS] = it.label[kLS];
              cS.label.color = '#ffffff';
              return cS;
            }
            return it;
          }
          var c2 = {}; for (var kk in it) c2[kk] = it[kk];
          c2.label = {}; for (var k3 in it.label) c2.label[k3] = it.label[k3];
          c2.label.color = (iu === n2)
            ? (adminN123 ? '#ffffff' : THEME.texteSurvol)
            : (THEME.texte || '#ffffff');
          return c2;
        });
        carte.setOption({ series: [{ id: 'noms-zones', data: ndN }] });
      }
    } catch (errNoms) { }
  }
  // v7.12 : EFFACER LE SURVOL « COLLÉ ». Au clic qui change la sélection,
  // le setOption recrée la série : ECharts ne renvoie PAS mouseout pour la
  // zone sous le pointeur — survolNom restait posé et la zone se repeignait
  // en teinte de SURVOL (-20 %) au lieu de la teinte de sélection. Tout
  // clic interprété (traiteClic) éteint l'état de survol AVANT l'action.
  function effacerSurvol() { survolNom = null; }
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
      // v7.16 : repli ERREUR + CEINTURE DE COMPLÉTUDE factorisés dans
      // donneesRegionsCeinturees (06) — partagés avec optionsBase, qui
      // passait à côté de la ceinture (trous blancs au changement de vue).
      regions = donneesRegionsCeinturees();
    } catch (e) {
      console.warn('[Prisme2] ceinture de peinture a échoué', e);
      regions = [];
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
