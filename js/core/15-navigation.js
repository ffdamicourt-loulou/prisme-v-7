  // v7.5 : crochet posé par demarrer() (17-demarrage.js) — ANNULER
  // l'interpolation de zoom (molette) en cours au moment d'un changement
  // de vue. Sans cela, l'animation encore active réappliquait ses geoRoam
  // APRÈS le cadrage de la nouvelle vue : la caméra revenait sur
  // l'ancienne sélection une demi-seconde plus tard — vécu comme « le
  // nouveau pays s'ouvre puis se referme sur l'ancienne sélection »,
  // surtout sur les vues très zoomées (comtés des États-Unis).
  var ANNULER_ZOOM_ANIM = function () { };
  function appliquerVue(sansAjustement) {
    try { ANNULER_ZOOM_ANIM(); } catch (eAnim) { }
    etat.selectionZone = null; // v0.58 : la sélection de zone ne survit pas au changement de vue
    ZOOM_CONTENU = null; // v0.46 : la porte code/nom se recalcule par vue
    carte.setOption(optionsBase());
    zoomDernierRepaint = etat.zoom; // v0.71 : le setOption complet vient de repeindre les étiquettes
    if (!sansAjustement) {
      var b = vue.type === 'monde'
        ? boiteEnsemble(DATA.pays.map(function (p) { return { geometry: p.geometry }; }))
        : (boiteGrappe(vue.features) || boiteEnsemble(vue.features));
      // v0.40 : les composantes détachées de grande taille de chaque pays de
      // la vue (vue combinée comprise) restent dans le cadrage.
      // v0.52 : NIVEAU 1 SEULEMENT — aux niveaux 2/3 (comtés d un État,
      // districts d un comté…), l Alaska n étend PLUS le cadrage : la vue
      // d un comté du Texas cadre le TEXAS, pas les États-Unis entiers.
      if (vue.type !== 'monde' && vue.niveau === 1) {
        (vue.paysIds || (vue.paysId ? [vue.paysId] : [])).forEach(function (id) {
          composantesDetachees(id).forEach(function (bd) {
            b = [Math.min(b[0], bd[0]), Math.min(b[1], bd[1]),
                 Math.max(b[2], bd[2]), Math.max(b[3], bd[3])];
          });
        });
      }
      // v7.6 : CADRAGE PAR NIVEAU UTILISATEUR — niveau 1 = LE PAYS SEUL à
      // 80 % de la hauteur (centrerSur, reinitialiserVers) ; les niveaux
      // 2 et 3 (régions, départements…) s'affichent à 60 % de la hauteur :
      // TOUTES les vues admin de subdivisions sont cadrées à 60 %.
      ajusterSur(b, vue.type !== 'monde' ? 0.60 : 0);
    }
    bornerRoam();
    majEtiquettes();
    majFil();
  }

  // Entrer dans le pays idPays (déjà sélectionné, second clic)
  // v0.67 : SOCLE DESCRIT PAR LES ZONES ELLES-MÊMES — le fond peint sous les
  // subdivisions suit exactement leur contour. Si la source admin (IGN)
  // diffère du contour mondial, l'ancien socle (géométrie du pays) traçait un
  // DEUXIÈME trait côtier/dépendant décalé. Références partagées : aucune
  // copie de points, MultiPolygon rendu comme l'union des zones.
  function socleZones(feats) {
    var polys = [];
    (feats || []).forEach(function (f) {
      var g = f && f.geometry;
      if (!g) return;
      if (g.type === 'Polygon') polys.push(g.coordinates);
      else if (g.coordinates) polys.push.apply(polys, g.coordinates);
    });
    return polys.length ? { type: 'MultiPolygon', coordinates: polys } : null;
  }
  function descendre(idPays) {
    // v0.80 : PACKAGE à la demande — admin absent mais package disponible :
    // on le charge et la descente est RETENTÉE à l'arrivée des données.
    if (!descendPossible(idPays) && chargerPackage(idPays, descendre)) return false;
    if (!descendPossible(idPays)) return false;
    var feats = featuresNiv1(idPays);
    if (!feats || !feats.length) return false;
    pile.push({ vue: vue, zoom: etat.zoom, centre: etat.centre, selection: etat.selection, selections: etat.selections.slice() });
    var pays = parId[idPays];
    var nomMap = 'prisme2-' + idPays;
    // v0.69 : le socle-union ne s'applique QUE si les zones viennent d'une
    // SOURCE DIFFÉRENTE du contour du pays (FR = IGN) : il suit alors leur
    // tracé (sinon trait côtier double). Pour les pays de la source mondiale
    // (Suisse…), les zones ne pavent PAS parfaitement le polygone du pays
    // (lamelles) : le socle DOIT rester la géométrie du pays, qui les recouvre
    // (sinon trous blancs, cf. Bodensee/Sankt Gallen).
    var socleGeo = (feats[0] && feats[0].src === 'ign') ? (socleZones(feats) || pays.geometry) : pays.geometry;
    enregistrerVue(nomMap, feats, idPays, socleGeo);
    vue = {
      type: 'admin', niveau: 1, nomMap: nomMap, features: feats,
      continent: pays.continent, parent: pays.nom, paysId: idPays,
      socleGeometry: socleGeo,
      boites: {}, sections: {}, parNom: {},
    };
    feats.forEach(function (f) { vue.parNom[f.id] = f; });
    etat.selection = null;
    etat.selections = [];
    appliquerVue();
    etat.zoomEntree = etat.zoom;
    // v7.17 : si un 2e clic pays attendait le package, la vue régions
    // existe enfin — sélectionner la région sous le curseur retenu.
    try { var SELh = window.__PR2_SEL; if (SELh && SELh.retenterPoint) SELh.retenterPoint(); } catch (err) { }
    return true;
  }
  // Entrer dans la subdivision nomSub (niveau 2, ex. régions françaises)
  function descendreSous(nomSub) {
    // v0.37 : dans une vue combinée, la zone appartient à un pays précis
    var idPays = (vue.parPays && vue.parPays[nomSub]) || vue.paysId;
    var a3 = DATA.idversA3 ? DATA.idversA3[idPays] : null;
    var enfants = a3 && ADMIN.niv2[a3] && ADMIN.niv2[a3][nomSub];
    // v7.29 : GARDE D'APPARTENANCE (homonymes inter-niveaux, cf.
    // enfantsDe) — le comté « Washington » du Texas ne peut pas
    // « descendre » dans les comtés de l'ÉTAT Washington : la descente
    // exige que les enfants recouvrent la zone cliquée.
    if (enfants && enfants.length
      && !enfantsDansZone({ geometry: (vue.features.filter(function (f) { return f.id === nomSub; })[0] || {}).geometry }, enfants)) {
      enfants = null;
    }
    // v0.80 : PACKAGE à la demande — sous-zones absentes mais package
    // disponible : chargement puis RETENTATIVE de la descente.
    if ((!enfants || !enfants.length) && chargerPackage(idPays, function () { descendreSous(nomSub); })) return false;
    if (!enfants || !enfants.length) return false;
    pile.push({ vue: vue, zoom: etat.zoom, centre: etat.centre, selection: etat.selection, selections: etat.selections.slice() });
    var nomMap = vue.nomMap + '-' + nomSub.replace(/[^A-Za-z0-9]/g, '');
    var parent = vue.features.filter(function (f) { return f.id === nomSub; })[0];
    // subdivisions sœurs : le reste du pays reste affiché normalement. À TOUT
    // niveau de descente, on reconduit aussi les sœurs des niveaux
    // supérieurs (règle générale : rien ne disparaît ni ne change, sauf la
    // sélection et le survol). v0.37 : depuis une vue combinée, les zones de
    // l'AUTRE pays rejoignent le contexte (rien ne disparaît).
    // v0.52 : les sœurs issues des features du niveau courant sont
    // ÉTIQUETÉES par leur niveau (__niv) — le Maj+clic sait si une sœur
    // est du niveau juste inférieur (ses enfants sont au niveau courant).
    var soeurs = vue.features.filter(function (f) {
      if (f.id === nomSub) return false;
      if (!vue.parPays || vue.parPays[f.id] === idPays) { f.__niv = vue.niveau; delete f.__masque; f.__pays = idPays; return true; }
      return false;
    }).concat(vue.soeurs || []);
    var autresPays = [];
    if (vue.parPays) {
      soeurs = soeurs.concat(vue.features.filter(function (f) {
        if (vue.parPays[f.id] !== idPays) { f.__niv = vue.niveau; delete f.__masque; f.__pays = vue.parPays[f.id]; return true; }
        return false;
      }));
      vue.features.forEach(function (f) {
        var p = vue.parPays[f.id];
        if (p && p !== idPays && autresPays.indexOf(p) === -1) autresPays.push(p);
      });
    }
    (vue.paysIds || []).forEach(function (pid) {
      if (pid !== idPays && autresPays.indexOf(pid) === -1) autresPays.push(pid);
    });
    var soclesAutres = (vue.socles || []).filter(function (s) { return s.paysId !== idPays; });
    var soclesNouveaux = soclesAutres.concat([{
      paysId: idPays, geometry: parent ? parent.geometry : null,
      continent: (parId[idPays] || {}).continent || vue.continent,
    }]);
    // v0.100 : PILE D'ANCÊTRES — le socle du niveau courant (vue.socleGeometry)
    // rejoint la pile héritée : en descente profonde (niveaux 3/4, ex.
    // districts d'ANGLETERRE), tout interstice entre enfants montre la
    // géométrie d'un ANCÊTRE peinte dessous, jamais le fond blanc du canevas.
    var heritesNouveaux = (vue.soclesHerites || []).slice();
    if (vue.socleGeometry) {
      heritesNouveaux.push({
        paysId: idPays + '~' + vue.niveau, geometry: vue.socleGeometry,
        continent: vue.continent,
      });
    }
    enfants.forEach(function (f) { f.__pays = idPays; });
    enregistrerVue(nomMap, enfants, idPays, parent ? parent.geometry : null, soeurs,
      (autresPays.length || heritesNouveaux.length)
        ? { exclus: autresPays, socles: soclesAutres.concat(heritesNouveaux) } : null);
    vue = {
      type: 'admin', niveau: vue.niveau + 1, nomMap: nomMap, features: enfants,
      continent: (parId[idPays] || {}).continent || vue.continent, parent: nomSub, paysId: idPays,
      paysIds: autresPays.length ? [idPays].concat(autresPays) : undefined,
      soeurs: soeurs, socleGeometry: parent ? parent.geometry : null,
      socles: autresPays.length ? soclesNouveaux : undefined,
      soclesHerites: heritesNouveaux.length ? heritesNouveaux : undefined,
      boites: {}, sections: {}, parNom: {},
    };
    enfants.forEach(function (f) { vue.parNom[f.id] = f; });
    etat.selection = null;
    // v7.17 : les sélections de N2 (etat.selections) SURVIVENT à la
    // descente — le mécanisme multi-régions : descendre dans les
    // départements d'une région ne doit pas dé-sélectionner les autres
    // régions choisies (elles deviennent sœurs « c- » peintes en sélection).
    appliquerVue();
    etat.zoomEntree = etat.zoom;
    return true;
  }
  // v0.52 : Maj+clic sur une SŒUR du niveau juste inférieur qui a des
  // enfants — ses enfants REJOIGNENT la vue au NIVEAU COURANT, sans quitter
  // la vue : districts de York + Maj+clic comté Lancaster → les districts
  // de Lancaster s'affichent dans la même vue (la sœur reste peinte en
  // sélection, comme en v0.31). Un nouveau Maj+clic les RETIRE (bascule) ;
  // rien ne disparaît : la sœur reste affichée comme contexte.
  function ajouterSousVue(fz) {
    var idPays = (vue.parPays && vue.parPays[fz.nom]) || vue.paysId;
    var a3 = DATA.idversA3 ? DATA.idversA3[idPays] : null;
    // v0.53 : COLLISIONS D'IDS — des sous-zones ajoutées peuvent porter un
    // id déjà présent dans la vue (comtés homonymes du Texas et de
    // l'Oklahoma : Jackson, Jefferson, Cherokee, Washington, Comanche,
    // Ellis, Stephens, Haskell) : le garde-fou « tout ou rien » voyait un
    // chevauchement PARTIEL et rejetait l'ajout (l'état s'affichait à
    // plat, sans ses comtés). Un enfant dont l'id existe déjà sur une
    // AUTRE zone (l'occupant n'est PAS l'enfant lui-même) est RENOMMÉ au
    // vol (préfixe du parent : « Oklahoma/Jackson ») — règle
    // déterministe : la présence, la bascule de retrait et le rendu
    // (ECharts clé les polygones par nom) restent cohérents ; le NOM
    // affiché (étiquettes, tooltip) est inchangé.
    var preR = String(fz.id).replace(/[^A-Za-z0-9]/g, '');
    var enf = a3 && ADMIN.niv2[a3] && ADMIN.niv2[a3][fz.nom];
    if ((!enf || !enf.length)
      && (fz.__niv === undefined || fz.__niv === vue.niveau - 1)) {
      // v7.20 : COMMUNAUTÉ UNIPROVINCIALE (Espagne : Madrid, Murcia,
      // Asturias, Cantabria, Navarra, La Rioja, Baleares, Ceuta,
      // Melilla…) — la sœur n'a PAS de subdivisions dans les données :
      // la zone du niveau courant EST la zone elle-même (province =
      // communauté). Elle rejoint la vue comme sa PROPRE fille
      // (marquée __uniprov : la bascule de retrait la retrouve même si
      // l'objet est reconstruit à chaque appel) ; avant, le clic sur
      // « c-Madrid » depuis une vue provinces échouait et affichait
      // « aucune subdivision plus fine disponible ».
      enf = [{ id: fz.id, nom: fz.nom, geometry: fz.geometry, __cp: fz.__cp, __uniprov: fz.id }];
    }
    if (!enf || !enf.length) return false;
    var enfR = enf.map(function (e) {
      var occupant = vue.parNom[e.id];
      // v7.20 → v7.28 : COLLISIONS ET IDENTITÉ.
      // (1) v7.20 : l'occupant peut être la zone UNIPROVINCIALE
      // elle-même (identique, pas de collision à renommer) — les deux
      // __uniprov sont alors définis ET égaux.
      // (2) v7.28 : BUG v7.20 RÉPARÉ — la comparaison « occupant.__uniprov
      // === e.__uniprov » entre DEUX undefined valait TOUJOURS vrai : le
      // renommage des HOMONYMES ordinaires était court-circuité. Dès qu'UN
      // comté du nouvel état portait un id déjà affiché (Humboldt en
      // Californie ET au Nevada, « Washington », « Orange »…), le garde-fou
      // « tout ou rien » voyait un chevauchement PARTIEL et rejetait TOUT
      // l'ajout en silence — impossible de combiner plusieurs états
      // américains ni d'ajouter les comtés d'un état à une vue qui en
      // affichait déjà un autre. Le marqueur __origine (préfixe du parent,
      // posé à l'ajout) distingue désormais NOTRE enfant déjà ajouté
      // (bascule de retrait, id conservé) d'un homonyme d'un AUTRE parent
      // (renommé « Parent/Id »).
      if (!occupant
        || occupant.__origine === preR
        || (e.__uniprov !== undefined && occupant.__uniprov !== undefined
          && occupant.__uniprov === e.__uniprov)) {
        e.__origine = preR;
        return e;
      }
      var r = { id: preR + '/' + e.id, nom: e.nom, geometry: e.geometry };
      r.__origine = preR;
      return r;
      return { id: preR + '/' + e.id, nom: e.nom, geometry: e.geometry };
    });
    var idsEnf = {};
    enfR.forEach(function (e) { idsEnf[e.id] = true; });
    // garde-fou : les enfants sont soit TOUS déjà affichés (bascule retrait),
    // soit AUCUN (ajout) ; un chevauchement partiel résiduel ne devrait
    // plus se produire (les collisions sont renommées ci-dessus) →
    // repli sur la bascule classique de sélection.
    var nbPresents = 0;
    vue.features.forEach(function (f) { if (idsEnf[f.id]) nbPresents++; });
    if (nbPresents !== 0 && nbPresents !== enfR.length) return false;
    var present = nbPresents === enfR.length;
    // v7.24 : CADRE DE BASCULE — un ajout/retrait de sœur ne crée PAS un
    // cran de « retour » : ces cadres sont sautés par retour() (sinon
    // chaque bascule rendait le retour muet ou changeait la vue « sans
    // raison claire » : la pile ne doit dépiler que les descentes).
    pile.push({ vue: vue, zoom: etat.zoom, centre: etat.centre, selection: etat.selection, selections: etat.selections.slice(), __bascule: true });
    var nouvelles;
    if (present) {
      nouvelles = vue.features.filter(function (f) { return !idsEnf[f.id]; });
      etat.selections = etat.selections.filter(function (n) { return n !== 'c-' + fz.id; });
    } else {
      nouvelles = vue.features.concat(enfR);
      if (etat.selections.indexOf('c-' + fz.id) === -1) etat.selections.push('c-' + fz.id);
    }
    // v0.54 : FRONTIÈRES DES ENFANTS AJOUTÉS — la sœur « c- » dont les
    // enfants rejoignent la vue est MASQUÉE de la carte enregistrée
    // (__masquee) : son polygone plein était peint PAR-DESSUS les enfants
    // (les sœurs sont concaténées après les propres dans le
    // FeatureCollection) et RECUVRAIT leurs frontières — la zone ajoutée
    // affichait les noms de ses sous-zones mais un aplat sans trait. La
    // sœur reste dans vue.soeurs (la bascule de retrait la retrouve) et
    // revient à la carte au retrait (bascule) ; le masque est levé au
    // recalage __niv d'une nouvelle vue (aucune fuite entre vues).
    if (present) delete fz.__masquee;
    else fz.__masquee = true;
    var autresPays2 = (vue.paysIds || []).filter(function (pid) { return pid !== idPays; });
    var soclesAutres2 = (vue.socles || []).filter(function (s) { return s.paysId !== idPays; });
    enfR.forEach(function (e) { e.__pays = idPays; });
    var soeurs = vue.soeurs || [];
    var nomMap = vue.nomMap + (present ? '~' : '+') + String(fz.id).replace(/[^A-Za-z0-9]/g, '');
    enregistrerVue(nomMap, nouvelles, idPays, vue.socleGeometry, soeurs,
      autresPays2.length ? { exclus: autresPays2, socles: soclesAutres2 } : null);
    var nVue = {
      type: 'admin', niveau: vue.niveau, nomMap: nomMap, features: nouvelles,
      continent: vue.continent, parent: vue.parent, paysId: idPays,
      paysIds: vue.paysIds, socles: vue.socles,
      soeurs: soeurs, socleGeometry: vue.socleGeometry,
      parPays: vue.parPays, membres: vue.membres,
      boites: {}, sections: {}, parNom: {},
    };
    nouvelles.forEach(function (f) { nVue.parNom[f.id] = f; });
    vue = nVue;
    majEtiquettes();
    appliquerVue();
    return true;
  }
  function enfantsDe(nomSub) {
    // v0.37 : pays de la zone (vue combinée)
    var idPays = (vue.parPays && vue.parPays[nomSub]) || vue.paysId;
    var a3 = DATA.idversA3 ? DATA.idversA3[idPays] : null;
    var e = a3 && ADMIN.niv2[a3] && ADMIN.niv2[a3][nomSub]
      ? ADMIN.niv2[a3][nomSub] : null;
    if (!e || !e.length) return null;
    // v7.29 : GARDE D'APPARTENANCE — HOMONYMES INTER-NIVEAUX. ADMIN.niv2
    // est indexé par NOM de zone : un comté « Washington » (Texas,
    // Nebraska, Iowa…) et l'ÉTAT Washington partagent la même clé.
    // Cliquer le comté « Washington » d'une vue comtés trouvait les 39
    // comtés DE L'ÉTAT et les affichait comme ses « enfants » ; dans le
    // même esprit, la demande multi-zones proposait les enfants de zones
    // sans rapport avec la chaîne courante (« charger les 99 zones de
    // l'Iowa » en cliquant Washington). Règle : les enfants d'une zone de
    // la vue DOIVENT recouvrir la zone cliquée (intersection des boîtes
    // englobantes) — un réallegage de niveau ne peut se produire que si
    // les enfants sont bien une SUBDIVISION de la zone survolée.
    var zoneF = (vue.parNom && vue.parNom[nomSub]) || null;
    if (zoneF && zoneF.geometry && !enfantsDansZone(zoneF, e)) return null;
    return e;
  }
  // v7.29 : vrai si les enfants recouvrent la zone (bboxes qui se
  // croisent) ; tolérant par construction pour les sources mixtes
  // (injections n3 GADM sur des zones d'une autre origine) : seule
  // l'ABSENCE TOTALE de recouvrement (billes à des centaines de km)
  // refuse la descente.
  function bboxGeo(g, b) {
    if (!g || !g.coordinates) return null;
    if (g.type === 'Polygon') g.coordinates.forEach(function (r) {
      r.forEach(function (v) {
        b[0] = Math.min(b[0], v[0]); b[1] = Math.min(b[1], v[1]);
        b[2] = Math.max(b[2], v[0]); b[3] = Math.max(b[3], v[1]);
      });
    });
    else (g.coordinates || []).forEach(function (p) {
      p.forEach(function (r) {
        r.forEach(function (v) {
          b[0] = Math.min(b[0], v[0]); b[1] = Math.min(b[1], v[1]);
          b[2] = Math.max(b[2], v[0]); b[3] = Math.max(b[3], v[1]);
        });
      });
    });
    return b;
  }
  function enfantsDansZone(zoneFeat, enfants) {
    try {
      var bz = bboxGeo(zoneFeat.geometry, [999, 999, -999, -999]);
      var be = [999, 999, -999, -999];
      var n = 0;
      for (var i = 0; i < enfants.length && n < 50; i++) {
        var gj = enfants[i] && enfants[i].geometry;
        if (!gj) continue;
        be = bboxGeo(gj, be); n++;
      }
      if (!n) return true; // pas de géométrie : ne pas bloquer (repli nominal)
      // v7.29b : CONVENTION DE LONGITUDE (±180 contre 0-360) — Samoa,
      // Fidji, Tonga : la source du package et le complément GADM (n3)
      // peuvent coder l'antiméridien de deux façons (le point est le
      // MÊME mais à ±360° près). On rapproche les bboxes avant de
      // comparer : la garde ne doit refuser que les recouvrements
      // ABSENTS (billes à des centaines de km), jamais un artifice
      // de longitude.
      var cx = (bz[0] + bz[2]) / 2, ce = (be[0] + be[2]) / 2;
      if (cx - ce > 180) { be[0] += 360; be[2] += 360; }
      else if (ce - cx > 180) { be[0] -= 360; be[2] -= 360; }
      var inter = Math.max(0, Math.min(bz[2], be[2]) - Math.max(bz[0], be[0]))
        * Math.max(0, Math.min(bz[3], be[3]) - Math.max(bz[1], be[1]));
      return inter > 0;
    } catch (err) { return true; } // en cas de doute : comportement historique
  }
  // ---------- Niveau le plus détaillé : chargement à la demande ----------
  // Un clic sur une subdivision qui possède des sous-zones n'y descend plus
  // directement : une fenêtre de validation apparaît (« Charger les N
  // sous-zones de X ? »). Charger / Annuler. Un clic ailleurs ou un retour
  // referme la fenêtre sans rien charger.
  var cibleDemande = null;
  // v0.60 : la proposition de chargement couvre la zone cliquée ET toutes
  // les zones Maj+sélectionnées (etat.selections) du niveau courant qui ont
  // des sous-zones — « Charger » descend dans TOUTES ces zones d'un coup
  // (règle validée : un clic sur une sélection de niveau N propose le
  // niveau N+1 pour l'ensemble des zones sélectionnées de niveau N).
  function listeDemande(nomSub) {
    var liste = [nomSub];
    (etat.selections || []).forEach(function (n) {
      var id = n && n.slice(0, 2) === 'c-' ? n.slice(2) : n; // sœurs « c- »
      if (liste.indexOf(id) === -1 && liste.indexOf(n) === -1) liste.push(id);
    });
    return liste.filter(function (n) {
      // v7.17 : la proposition ne couvre que les zones de la VUE COURANTE —
      // les N2 sélectionnées qui survivent à la descente (multi-régions)
      // ne viennent plus polluer la demande d'une zone de fin de chaîne.
      var idV = n && n.slice(0, 2) === 'c-' ? n.slice(2) : n;
      if (!vue.parNom || !vue.parNom[idV]) return false;
      var e = enfantsDe(n); return e && e.length;
    });
  }
  function demanderSous(nomSub) {
    var liste = listeDemande(nomSub);
    if (!liste.length) return false;
