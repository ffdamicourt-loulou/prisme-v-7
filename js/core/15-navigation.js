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
      // v7.20 : l'occupant peut être la zone uniprovinciale elle-même
      // (identique, pas de collision à renommer) ;
      if (!occupant || occupant.__uniprov === e.__uniprov) return e;
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
    return a3 && ADMIN.niv2[a3] && ADMIN.niv2[a3][nomSub] ? ADMIN.niv2[a3][nomSub] : null;
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
    if (cibleDemande) annulerDemande();
    cibleDemande = liste;
    var total = 0;
    liste.forEach(function (n) { total += enfantsDe(n).length; });
    if (typeof document !== 'undefined') {
      var boite = document.getElementById('prisme2-demande');
      if (boite) {
        var bNombre = document.getElementById('prisme2-demande-nombre');
        var bNom = document.getElementById('prisme2-demande-nom');
        if (bNombre) bNombre.textContent = total;
        if (bNom) bNom.textContent = liste.join(', ');
        boite.style.display = 'block';
      }
    }
    return true;
  }
  function validerDemande() {
    var c = cibleDemande;
    annulerDemande();
    if (!c || !c.length) return false;
    // v0.60 : chargement MULTI-ZONES — on descend dans la première zone,
    // puis les enfants de chaque autre zone sélectionnée REJOIGNENT la vue
    // au même niveau (ajouterSousVue sur la sœur devenue du niveau juste
    // inférieur — même mécanisme que le Maj+clic v0.52).
    if (!descendreSous(c[0])) return false;
    for (var i = 1; i < c.length; i++) {
      var nomZ = c[i];
      var fzS = null;
      (vue.soeurs || []).forEach(function (s) { if (s.id === nomZ) fzS = s; });
      if (fzS && fzS.__niv === vue.niveau - 1) ajouterSousVue(fzS);
    }
    return true;
  }
  function annulerDemande() {
    cibleDemande = null;
    if (typeof document !== 'undefined') {
      var boite = document.getElementById('prisme2-demande');
      if (boite) boite.style.display = 'none';
    }
  }
  function retour() {
    if (cibleDemande) annulerDemande();
    if (!pile.length) return;
    var e = pile.pop();
    // v7.24 : SAUT DE LA CHAÎNE DE BASCULES — les cadres __bascule (ajouts/
    // retraits de sœurs, cf. ajouterSousVue) sont des états ÉPHÉMÈRES du
    // MÊME niveau : retour ne doit pas les redonner un par un (l'utilisateur
    // pressait retour et la carte « ne faisait rien » ou enlevait/rajoutait
    // sœurs au hasard). On dépile toute la chaîne de bascules consécutives
    // et l'on restaure le premier cadre de DESCENTE dessous.
    while (e.__bascule && pile.length) e = pile.pop();
    vue = e.vue;
    etat.zoom = e.zoom; etat.centre = e.centre; etat.selection = e.selection;
    etat.selections = e.selections || [];
    appliquerVue(true);
    etat.zoomEntree = etat.zoom;
  }
  // Dézoom sous l'échelle du pays (entre pays et continent) : la descente se
  // referme et l'on RETOURNE À L'ÉTAT INITIAL du niveau monde (v0.41 : la
  // vue monde entière est RECADRÉE comme au démarrage — l'ancien comportement
  // conservait le zoom courant, si proche du zoom du pays qu'on croyait ne
  // jamais revenir au monde) ; le pays quitté reste sélectionné (peint).
  function reduireAuPays() {
    var idPays = vue.paysId;
    if (cibleDemande) annulerDemande();
    var base = null;
    while (pile.length) base = pile.pop(); // dernier dépilé = vue monde initiale
    if (base) {
      vue = base.vue;
      etat.selections = [];
      // le pays quitté reste sélectionné (peint) en vue monde
      etat.selection = (idPays && parId[idPays]) ? idPays : null;
      // v0.41 : VRAI retour à l'état initial du niveau monde — cadrage
      // COMPLET du monde (zoom/centre de démarrage), quel que soit le zoom
      // d'où l'on vient.
      appliquerVue();
    }
    etat.zoomEntree = etat.zoom;
  }
  // v0.31 : clic sur un autre pays aux niveaux 2/3 → le NOUVEAU PAYS S'OUVRE
  // AU MÊME NIVEAU : on descend d'abord ses régions (niveau 1), puis la zone
  // contenant le POINT DE CLIC (ou le cœur du pays), et encore un cran si le
  // niveau demandé est 3 — en s'arrêtant à la profondeur réellement
  // disponible (un pays sans subdivisions reste sélectionné en vue monde).
  function zoneSuivante(feats, pt, pays) {
    var i;
    if (pt) {
      for (i = 0; i < feats.length; i++) if (pointDansGeometry(pt, feats[i].geometry)) return feats[i];
    }
    if (pays) {
      var c = cpDe(pays.id, pays.geometry);
      for (i = 0; i < feats.length; i++) if (pointDansGeometry(c, feats[i].geometry)) return feats[i];
    }
    var meilleur = null, aMax = -1;
    feats.forEach(function (f) {
      var a = aireGeo(f.geometry);
      if (a > aMax) { aMax = a; meilleur = f; }
    });
    return meilleur;
  }
  function ouvrirAuNiveau(idPays, niveau, pt) {
    if (!descendre(idPays)) return false; // niveau 1
    if (niveau < 2) return true;
    var feats = featuresNiv1(idPays);
    if (!feats) return true;
    var z1 = zoneSuivante(feats, pt, parId[idPays]);
    if (!z1 || !enfantsDe(z1.nom)) return true;
    if (!descendreSous(z1.nom)) return true; // niveau 2
    if (niveau < 3) return true;
    var z2 = zoneSuivante(vue.features, pt, null);
    if (!z2 || !enfantsDe(z2.nom)) return true;
    descendreSous(z2.nom); // niveau 3
    return true;
  }
  // Règle générale (v7.6) : un clic sur le NOUVEAU PAYS, à TOUT niveau, le
  // SÉLECTIONNE au NIVEAU 1 (le pays seul, cadré à 80 % de la hauteur) —
  // la descente (régions, niveau 2) se fait par un second clic sur le pays
  // déjà sélectionné. v0.34 : le 4e argument CONSERVER (Maj+clic) ajoute au
  // lieu de remplacer.
  function reinitialiserVers(idPays, niveau, pt, conserver) {
    if (cibleDemande) annulerDemande();
    var ancien = vue.type !== 'monde' ? vue.paysId : etat.selection;
    var garder = conserver ? etat.selections.slice() : null;
    var base = null;
    while (pile.length) base = pile.pop(); // dernier dépilé = vue monde initiale
    if (base) {
      vue = base.vue; etat.zoom = base.zoom; etat.centre = base.centre;
      etat.selection = null;
      etat.selections = [];
      appliquerVue(true);
    }
    if (!parId[idPays]) return;
    etat.selection = idPays;
    var restaurer = function () {
      if (!conserver) return;
      etat.selections = garder || [];
      if (ancien && ancien !== idPays
        && etat.selections.indexOf(ancien) === -1) etat.selections.push(ancien);
    };
    // avant la descente : la snapshot de la pile gardera les sélections, et
    // le retour en vue monde les restaurera (l'ajout persiste)
    restaurer();
    // v7.6 : NIVEAUX UTILISATEUR — le niveau 1 est LE PAYS SEUL, SÉLECTIONNÉ
    // et cadré à 80 % de la hauteur du viewport, SANS descendre dans ses
    // régions ; le niveau 2 = régions (app n1), le niveau 3 = départements
    // (app n2) : on ouvre jusqu'au niveau APP = niveau − 1.
    var nivU = niveau || 1;
    if (nivU >= 2 && ouvrirAuNiveau(idPays, nivU - 1, pt)) { restaurer(); return; }
    // v7.13 : SÉLECTION MULTIPLE au niveau 1 — l'ENSEMBLE des pays
    // sélectionnés est centré horizontalement, à 80 % de la hauteur du
    // viewport ; pays seul : cadrage inchangé (centrerSur 0,80).
    if (conserver && garder && garder.length) cadrerGroupe([idPays].concat(garder));
    else centrerSur(parId[idPays], 0.80); // niveau 1 : le pays seul, 80 % de la hauteur
    restaurer();
    majEtiquettes(); // peindre la (nouvelle) sélection
  }

  // ---------- v0.37 : VUE COMBINÉE — Maj+clic AJOUTE le pays à la vue ----------
  // « France > régions » + Maj+clic sur l'Allemagne = les DEUX pays côte à
  // côte, leurs subdivisions du MÊME NIVEAU (régions + länder). Le clic
  // simple sur un pays extérieur reste un RESET ; Alt+clic retire le pays
  // ciblé du groupe ; retour ← = la vue d'avant (un seul pays).
  function enfantZone(idPays, nomSub) {
    var a3 = DATA.idversA3 ? DATA.idversA3[idPays] : null;
    return a3 && ADMIN.niv2[a3] && ADMIN.niv2[a3][nomSub] ? ADMIN.niv2[a3][nomSub] : null;
  }
  // Tranche d'un pays au niveau demandé : niveau 1 → ses régions ; niveau ≥ 2
  // → les subdivisions de la zone contenant le POINT DE CLIC (ou le cœur du
  // pays), en s'arrêtant à la profondeur réellement disponible.
  function membreDuPays(idPays, niveau, pt) {
    var pays = parId[idPays];
    if (!pays) return null;
    if (!descendPossible(idPays)) return null; // v0.37 : outre-mer etc. → ajout impossible
    var feats1 = featuresNiv1(idPays);
    if (!feats1 || !feats1.length) return null; // pas de subdivisions → ajout impossible
    var membre = {
      paysId: idPays, features: feats1.slice(), soeurs: [],
      socle: (feats1[0] && feats1[0].src === 'ign') ? (socleZones(feats1) || pays.geometry) : pays.geometry, niveau: 1, continent: pays.continent,
    };
    if (niveau >= 2) {
      var z1 = zoneSuivante(feats1, pt, pays);
      var enfants = z1 ? enfantZone(idPays, z1.id != null ? z1.id : z1.nom) : null;
      if (z1 && enfants && enfants.length) {
        membre = {
          paysId: idPays, features: enfants.slice(),
          soeurs: feats1.filter(function (f) { return f !== z1; }),
          socle: z1.geometry, niveau: 2, continent: pays.continent,
        };
      }
    }
    return membre;
  }
  function membreCourant() {
    return {
      paysId: vue.paysId, features: vue.features.slice(),
      soeurs: (vue.soeurs || []).slice(),
      socle: vue.socleGeometry || (parId[vue.paysId] || {}).geometry,
      niveau: vue.niveau, continent: vue.continent,
    };
  }
