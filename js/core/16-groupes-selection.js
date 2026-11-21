  function enregistrerGroupe(nom, features, socles, soeurs, paysIds) {
    cacheCp = {};
    var soc = socles.map(function (s) {
      return { type: 'Feature', id: 'socle@' + s.paysId,
        properties: { name: 'socle@' + s.paysId, socle: true }, geometry: s.geometry };
    });
    var propres = features.map(function (f) {
      return { type: 'Feature', id: f.id,
        properties: { name: f.id, nom: f.nom, cp: f.etq || cpDe(f.id, f.geometry) },
        geometry: f.geometry };
    });
    // v0.75 : une sœur MASQUÉE (sa zone est déjà ouverte en propres, ex.
    // Normandie dans une vue FR fusionnée) ne doit PAS être enregistrée :
    // dessinée après les propres, son polygone RECOUVRait les départements
    // (frontières internes écrasées, hover détourné). Même filtre que
    // enregistrerVue depuis v0.52.
    var soeursVisibles = (soeurs || []).filter(function (f) { return !f.__masquee; });
    var soeur = soeursVisibles.map(function (f) {
      return { type: 'Feature', id: 'c-' + f.id,
        properties: { name: 'c-' + f.id, nom: f.nom, contexte: true, cp: f.etq || cpDe(f.id, f.geometry) },
        geometry: f.geometry };
    });
    // v0.75 : mêmes règles que enregistrerVue v0.74 — enclaves dessinées
    // APRÈS leur hôte (visibles + survolables) et mémorisation de TOUS les
    // noms enregistrés pour la CEINTURE DE COMPLÉTUDE (aucune zone ne doit
    // rester sans entrée geo.regions : c'est la cause des « zones blanches »
    // intermittentes sur les vues combinées multi-pays).
    var itemsZones = propres.map(function (f) {
      return { cle: f.id, geometry: f.geometry, feat: f };
    }).concat(soeur.map(function (f) {
      return { cle: f.id, geometry: f.geometry, feat: f };
    }));
    var enc = detecterEnclaves(itemsZones);
    ENCLAVES_PAR_CARTE[nom] = enc;
    var zonesOrdonnees = ordonnerApresHotes(itemsZones, enc);
    var externes = DATA.pays.filter(function (p) { return paysIds.indexOf(p.id) === -1; })
      .map(function (p) {
        return { type: 'Feature', id: 'x-' + p.id,
          properties: { name: 'x-' + p.id, nom: p.nom, exterieur: true, cp: cpDe(p.id, p.geometry) },
          geometry: p.geometry };
      });
    var encExt = {};
    Object.keys(ENCLAVES_MONDE || {}).forEach(function (k) {
      encExt['x-' + k] = 'x-' + ENCLAVES_MONDE[k];
    });
    var externesOrdonnes = ordonnerApresHotes(externes.map(function (f) {
      return { cle: f.properties.name, feat: f };
    }), encExt);
    var tous = soc.concat(zonesOrdonnees).concat(externesOrdonnes);
    NOMS_CARTE[nom] = tous.map(function (f) { return f.properties.name; });
    echarts.registerMap(nom, { type: 'FeatureCollection',
      features: tous });
  }
  function construireVueGroupe(membres) {
    pile.push({ vue: vue, zoom: etat.zoom, centre: etat.centre, selection: etat.selection, selections: etat.selections.slice() });
    var features = [], soeurs = [], parPays = {}, parNom = {}, socles = [];
    var paysIds = [];
    membres.forEach(function (m) {
      paysIds.push(m.paysId);
      socles.push({ paysId: m.paysId, geometry: m.socle, continent: m.continent });
      m.features.forEach(function (f) {
        f.__ct = m.continent; // v0.37 : continent par zone (pays de continents différents)
        features.push(f); parPays[f.id] = m.paysId; parNom[f.id] = f;
      });
      m.soeurs.forEach(function (f) {
        f.__ct = m.continent;
        soeurs.push(f);
      });
    });
    var nomMap = 'prisme2-grp-' + paysIds.join('-');
    enregistrerGroupe(nomMap, features, socles, soeurs, paysIds);
    vue = {
      type: 'admin', niveau: membres[0].niveau, nomMap: nomMap,
      membres: membres, paysIds: paysIds, paysId: membres[0].paysId,
      features: features, soeurs: soeurs, socles: socles,
      continent: membres[0].continent,
      parent: membres.map(function (m) { return (parId[m.paysId] || {}).nom; }).join(' + '),
      boites: {}, sections: {}, parNom: parNom, parPays: parPays,

    };
    etat.selection = null;
    selVider('groupe-ouvrir'); // v7.30 : machine à états (l'ouverture d'un groupe repart d'une sélection vide)
    appliquerVue();
    etat.zoomEntree = etat.zoom;
    // Persistance au retour en vue monde : la snapshot du bas (monde) garde
    // TOUS les membres du groupe sélectionnés (règle : l'ajout persiste).
    if (pile.length) {
      var b = pile[0];
      var deja = (b.selections || []).slice();
      paysIds.forEach(function (id) {
        if (id !== b.selection && deja.indexOf(id) === -1) deja.push(id);
      });
      b.selections = deja;
    }
  }
  function membresDepuisVue() {
    var ms = [];
    (vue.paysIds && vue.paysIds.length ? vue.paysIds : [vue.paysId]).forEach(function (pid) {
      var feats = vue.features.filter(function (f) { return f.__pays === pid; });
      var soe = (vue.soeurs || []).filter(function (f) { return f.__pays === pid; });
      if (!feats.length && soe.length) { feats = soe; soe = []; }
      var sc = (vue.socles || []).filter(function (s) { return s.paysId === pid; })[0];
      ms.push({
        paysId: pid, features: feats, soeurs: soe,
        socle: sc ? sc.geometry : (parId[pid] || {}).geometry,
        niveau: vue.niveau, continent: (parId[pid] || {}).continent || vue.continent,
      });
    });
    return ms;
  }
  function ajouterAuGroupe(idPays, pt) {
    if (vue.type === 'monde' || !parId[idPays]) return false;
    var membres = vue.membres ? vue.membres.slice()
      : (vue.paysIds && vue.paysIds.length > 1 ? membresDepuisVue() : [membreCourant()]);
    for (var i = 0; i < membres.length; i++) {
      if (membres[i].paysId === idPays) return false; // déjà membre
    }
    var m = membreDuPays(idPays, vue.niveau, pt);
    if (!m) return false; // pas de subdivisions à ce niveau → repli navigation
    // garde-fou : collisions d'ids de zones entre membres (impossible à rendre)
    var ids = {};
    membres.forEach(function (mm) { mm.features.forEach(function (f) { ids[f.id] = 1; }); });
    for (var j = 0; j < m.features.length; j++) {
      if (ids[m.features[j].id]) return false;
    }
    membres.push(m);
    construireVueGroupe(membres);
    return true;
  }
  function retirerDuGroupe(idPays) {
    if (!vue.membres) return false;
    var reste = vue.membres.filter(function (m) { return m.paysId !== idPays; });
    if (!reste.length) return false;
    construireVueGroupe(reste);
    // le pays retiré disparaît aussi de la sélection persistée en vue monde
    if (pile.length && pile[0].selections) {
      pile[0].selections = pile[0].selections.filter(function (id) { return id !== idPays; });
    }
    return true;
  }

  // ---------- v0.63 : API des greffons (import de fichier, futures UI) ----------
  // Poser la sélection DE L'EXTÉRIEUR (import de fichier) : mêmes règles de
  // peinture que les clics — premier id = sélection primaire, le reste =
  // sélection additionnelle. Un id absent de la vue courante est simplement
  // ignoré par le rendu.
  // v0.70 : comme un CLIC SIMPLE, la sélection primaire d'une zone de la vue
  // courante est peinte plus sombre (etat.selectionZone) ; sans cela, une
  // sélection posée par un greffon (import) restait INVISIBLE en vue admin
  // (la peinture admin ne consulte que selectionZone, jamais sel[]).
  function definirSelection(liste) {
    var l = Object.prototype.toString.call(liste) === '[object Array]' ? liste.filter(Boolean) : [];
    etat.selection = l.length ? l[0] : null;
    selEnvoyer('definir', l.length > 1 ? l.slice(1) : []); // v7.30 : machine à états
    etat.selectionZone = null;
    if (etat.selection && vue.type !== 'monde') {
      var zs = listeVue();
      for (var i = 0; i < zs.length; i++)
        if (zs[i] && zs[i].id === etat.selection) { etat.selectionZone = etat.selection; break; }
    }
    majEtiquettes();
  }
  // Ouvrir un pays au niveau demandé (1 à 3) SANS clic — entrée programmatique
  // des greffons. pt (optionnel) désigne la zone d'entrée aux niveaux 2/3 ;
  // à défaut le cœur du pays est utilisé. Retour : la vue a bien changé.
  function ouvrir(idPays, niveau, pt) {
    if (!parId[idPays]) return false;
    reinitialiserVers(idPays, niveau || 1, pt || null, false);
    return true;
  }

  // Fil d'Ariane / bouton retour
  var fil = null;
  function majFil() {
    if (!fil) return;
    if (vue.type === 'monde') { fil.style.display = 'none'; return; }
    fil.style.display = '';
    var parent = pile.length ? pile[pile.length - 1].vue : null;
    var vers = parent && parent.type === 'monde' ? 'Monde' : (parent ? (parent.niveau === 1 ? MAJ(parent.parent) : parent.parent) : 'Monde');
    fil.innerHTML = '';
    var retourBtn = document.createElement('span');
    retourBtn.className = 'prisme2-fil-retour';
    retourBtn.innerHTML = '&larr; ' + vers;
    retourBtn.onclick = retour;
    var ici = document.createElement('span');
    ici.innerHTML = (vue.niveau === 1 ? MAJ(vue.parent) : vue.parent) + (vue.niveau >= 2 ? ' &mdash; ' + (vue.features.length) + ' divisions' : '');
    // v7.30 (point 7) : INFO-BULLE DU CHEMIN — la sélection multiple
    // (zones Maj+clic, clefs qualifiées « 2:a3¤parent¤nom ») est décrite
    // par son chemin qualifié : « USA > Texas > Washington ». L'uti-
    // lisateur voit EXACTEMENT quel Washington (le comté du Texas, pas
    // l'état) est sélectionné — plus d'ambiguïté d'homonymes à l'écran.
    var selTextes = [];
    var a3Nom = null;
    (etat.selections || []).forEach(function (n) {
      if (typeof n !== 'string' || n.slice(0, 2) !== '2:') return;
      var parties = n.slice(2).split('\u00A4');
      if (parties.length !== 3) return;
      // dénomination du pays : a3 → id (DATA.idversA3) → parId[id].nom
      if (!a3Nom) {
        a3Nom = {};
        try {
          Object.keys(DATA.idversA3 || {}).forEach(function (id2) {
            var a3 = DATA.idversA3[id2];
            if (!a3Nom[a3] && parId[id2] && parId[id2].nom) a3Nom[a3] = parId[id2].nom;
          });
        } catch (errN) { }
      }
      selTextes.push([(a3Nom[parties[0]] || parties[0]), parties[1], parties[2]]
        .filter(function (x) { return x != null && x !== ''; }).join(' > '));
    });
    var infos = [];
    if (selTextes.length) infos.push('Sélection : ' + selTextes.join(' ; '));
    // v7.30 (point 7) : BADGE « COUVERTURE PARTIELLE » — si le package du
    // pays courant ne fournit pas de subdivisions sous toutes ses premières
    // subdivisions (mesuré à l'enregistrement, window.__PR2_COUVERTURE),
    // l'utilisateur en est AVERTI au lieu de croire à un bug de clic.
    try {
      var a3C = DATA.idversA3 ? DATA.idversA3[vue.paysId] : null;
      var couv = a3C && window.__PR2_COUVERTURE ? window.__PR2_COUVERTURE[a3C] : null;
      if (couv && couv.partiel) {
        var badge = document.createElement('span');
        badge.className = 'prisme2-badge-partiel';
        badge.innerHTML = 'couverture partielle';
        badge.title = 'Données incomplètes : ' + couv.avec + ' subdivision(s) sur '
          + couv.n2 + ' possèdent des subdivisions plus fines ici.';
        fil.appendChild(retourBtn);
        fil.appendChild(badge);
        fil.appendChild(ici);
        return;
      }
    } catch (errBadge) { }
    if (infos.length) {
      var bulle = infos.join('\n');
      ici.title = bulle;
      try { retourBtn.title = bulle; } catch (errT) { }
    }
    fil.appendChild(retourBtn);
    fil.appendChild(ici);
  }
