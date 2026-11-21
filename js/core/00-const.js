// Prisme 2 — application carte (v0.54 : FRONTIÈRES DES ENFANTS AJOUTÉS +
// ÎLES MINEURES ÉLOIGNÉES DES ÉTATS-UNIS SUPPRIMÉES — (1) quand les enfants
// d une sœur « c- » rejoignent la vue par Maj+clic (comtés d Oklahoma dans
// la vue Texas, districts de Lancaster dans la vue York), le polygone
// PLEIN de la sœur restait peint PAR-DESSUS ses propres enfants (les
// sœurs sont enregistrées après les propres dans le FeatureCollection) :
// la zone ajoutée affichait les NOMS de ses sous-zones mais un APLAT
// SANS FRONTIÈRES ; la sœur est désormais MASQUÉE de la carte enregistrée
// tant que ses enfants sont affichés (__masquee, levé au retrait par
// bascule et au recalage __niv des nouvelles vues) — ses enfants,
// eux, montrent leurs frontières (trait blanc 0,6) ; (2) le pays « Îles
// mineures éloignées des États-Unis » (UM — Midway, Johnston, Kingman,
// Palmyra, Jarvis : 7 îlots quasi ponctuels du Pacifique, sans
// frontières, sans admin, sans villes) est RETIRÉ de la carte monde
// (R26 dans regles-monde.cjs : 243 → 242 pays). Succède à la v0.53 :
// COLLISIONS D'IDS EN SÉLECTION COMBINÉE + SURVOL PERSISTANT AU ZOOM +
// CONTINENTS EN BLANC + COUTURE ALPES — (1) quand des sous-zones ajoutées par Maj+clic portent des
// ids déjà présents dans la vue (comtés homonymes du Texas et de
// l Oklahoma : Jackson, Jefferson, Cherokee, Washington, Comanche,
// Ellis, Stephens, Haskell), l ajout échouait silencieusement (garde-
// fou « tout ou rien ») et l état s affichait à plat, sans ses comtés ;
// les enfants en collision sont désormais RENOMMÉS au vol (préfixe du
// parent : « Oklahoma/Jackson ») : le rendu, la présence et la bascule
// de retrait restent cohérents, le NOM affiché est inchangé ; la règle
// générale « l ajout se fait toujours au niveau initialement
// sélectionné » tient sur tous les chemins ; (2) le SOULIGNÉ DE
// SURVOL survit au zoom/pan : la zone sous le curseur est mémorisée
// (mouseover/mouseout/globalout) et le surlignage est RÉ-ÉMIS après
// chaque repaint (le setOption d ECharts efface l état « highlight ») ;
// (3) les LIBELLÉS DE CONTINENTS passent en BLANC (Afrique et Asie
// comprises) ; (4) R25 (regles-monde.cjs) : couture des frontières
// TERRESTRES de l ITALIE, de la SUISSE et reprise de la France avec
// tolérance 0,1° — Italie, Suisse et Auvergne-Rhône-Alpes laissaient
// des fentes visibles avec les pays adjacents en descente.
// Succède à la v0.52 : DÉZOOM CONSERVE LES NIVEAUX +
// PAS DE MOLETTE +25 % + CADRAGE ÉTAT SANS ALASKA + SŒUR OUVERTE AU
// NIVEAU COURANT — (1) en descente, le DÉZOOM sous l échelle d entrée
// CONSERVE les niveaux 2/3 affichés (retour au comportement v0.44 : on
// dézoome dans la vue courante, la sélection peinte et les abréviations
// suivent) ; seul le niveau 1 redescend à la vue monde (règle v0.28) ;
// (2) la MOLETTE est prise en main par l app : cran FIN v0.63
// (×1,3 cran rapide, ×1,15 cran standard, ×1,075 cran lent), le point
// sous le curseur reste sous le
// curseur (recalage du centre), borné à la carte ; (3) CADRAGE : les
// composantes détachées du pays (l Alaska) n étendent PLUS le cadrage
// des niveaux 2/3 — cliquer un comté du Texas cadre le TEXAS (plus la
// vue américaine entière) ; le niveau 1 garde l Alaska (v0.45) ;
// (4) Maj+clic sur une SŒUR « c- » du niveau juste inférieur qui a des
// enfants : ses enfants REJOIGNENT la vue au NIVEAU COURANT (districts
// de York + Maj+clic comté Lancaster → les districts de Lancaster
// s affichent dans la même vue, la sœur reste peinte en sélection et
// un nouveau Maj+clic les retire). Succède à la v0.51 : SIGLES
// DISTINGUANTS + RECADRAGE DE LA SÉLECTION MULTIPLE EN DESCENTE —
// RECADRAGE DE LA SÉLECTION MULTIPLE EN DESCENTE —
// (1) quand plusieurs zones d'une même vue abrègent pareil
// (« Appenzell Ausserrhoden » / « Appenzell Innerrhoden » → « App. » ×2,
// « Basel-Stadt » / « Basel-Landschaft » → « Bas. » ×2, « Al-Basrah » /
// « Al-Muthannia » → « Al-. » ×2…), le préfixe de tokens commun au groupe
// (espace ou trait d'union) est sauté et le PREMIER MOT DISTINGUANT est
// abrégé (« Aus. » / « Inn. », « Sta. » / « Lan. », « Bas. » / « Mut. »),
// en rallongeant de 3 à 6 lettres si la collision persiste
// (« San Juan » / « Santa Cruz » → « San. » / « Sant. ») ; un nom qui tient
// dans sa zone reste complet ; (2) aux niveaux 1/2/3, le Maj+clic qui
// sélectionne des zones RECADRE la vue sur l'ENSEMBLE des zones
// sélectionnées (propres et sœurs), comme en vue monde — le pays hôte
// n'entre pas dans le cadrage. Succède à la v0.50 :
// CHYPRE UNIFIÉE + ANGLETERRE COMTÉS
// HISTORIQUES — (1) R23 (regles-monde.cjs) : les bases souveraines d'Akrotiri
// (WSB) et de Dhekelia (ESB) ne sont plus des pays séparés : fusionnées dans
// Chypre (CY) au monde, avec retrait des frontières qui suivaient leurs
// contours et suppression de leur admin (pays 245 → 243, frontières 195 →
// 192) ; (2) R24 : le niveau 2 de l'Angleterre devient les 39 COMTÉS
// HISTORIQUES de la carte fournie (York unique, Sussex unique,
// Cornouailles, Middlesex, Huntingdon, Cumberland, Westmorland, Lancaster,
// Gloucester…), d'après le Historic County Borders Project (Definition A,
// WGS84) — les 152 districts forment le niveau 3, répartis par chevauchement
// d'aire maximal (et R24a répare le district source « Suffolk » qui
// contenait le Norfolk en doublon) — succède à la v0.49 :
// ÉTIQUETTES AFRIQUE/ASIE BLANCHES + DÉZOOM REFERME LES NIVEAUX —
// (1) R19c (regles-monde.cjs) : la couture des zones admin françaises au
// contour monde FR, jusque-là limitée à l Est (lon > 5,9), est GÉNÉRALISÉE à
// toutes les frontières TERRESTRES (Belgique, Luxembourg, Allemagne,
// Suisse, Italie, Monaco, Espagne, Andorre) : ~316 sommets en écart de
// 30 m à 3 km — surtout frontière belge (Nord, Hauts-de-France, Ardennes)
// et Pyrénées — sont projetés sur le contour, plus de traits parasites
// entre les régions françaises et les pays adjacents ; les écarts CÔTIERS
// sont laissés tels quels (aucun voisin à l océan, aucun artefact).
// (2) les NOMS et CODES des pays d AFRIQUE (continent 002) et d ASIE
// (142) passent en BLANC à tous les niveaux (pays propres, sœurs,
// extérieurs) — les libellés de continents gardent leur couleur.
// (3) DÉZOOM EN DESCENTE : sous l échelle d entrée du niveau courant, la
// vue se REFERME d un niveau (2/3 → niveau précédent, 1 → vue monde) —
// les niveaux ne restent plus affichés au dézoom (retour au comportement
// empilé ; la v0.44 conservait la vue, corrigé sur demande).
// v0.48 : ANGLETERRE À 4 NIVEAUX —
// Royaume-Uni → 4 nations → COMTÉS cérémonieux → districts : le niveau 2
// de l Angleterre devient les 47 comtés cérémonieux (R22, regles-monde :
// Kent, East Sussex, West Sussex, Greater London… ; la City of London
// reste le borough « City » du Greater London comme dans la source) et
// le niveau 3 les districts actuels (152, dont Wirral et St Helens
// renommés depuis des zones source mal étiquetées) ; hiérarchie générique,
// aucune logique spécifique ici ; v0.47 : largeur RÉALISTE des MAJUSCULES dans
// le test « le nom tient » — 0,70 em/caractère au lieu de 0,55 qui
// sous-estimait le rendu réel d environ 25 % : les noms complets débordaient
// des frontières et restaient affichés au dézoom bien après la taille
// limite du pays ; les bascules nom → code arrivent ~27 % plus tôt ;
// v0.46 : porte code/nom des pays STABLE —
// le seuil « vue monde initiale » est le ZOOM « CONTENIR » DU MONDE calculé
// depuis la carte, plus « zoomEntree » qui dérivait avec l historique de
// navigation ; repaint des étiquettes en THROTTLE avec repaint traînant
// garanti, plus de remise-à-zéro du compteur qui figeait les étiquettes
// pendant les rafales de georoam des zoom/dézoom répétés ;
// v0.45 : cadrage de la SÉLECTION niveau 1 —
// les COMPOSANTES DÉTACHÉES du pays (l'Alaska) comptent dans le cadre du
// premier clic et une borne de LARGEUR empêche une boîte étendue en
// longitude (ÉTATS-UNIS Alaska → Maine) de sortir de l'écran ; étiquettes
// des pays EXTÉRIEURS des descentes : la même règle de taille que partout
// (nom complet quand il tient dans les frontières, CODE quand le dézoom le
// fait sortir) — auparavant l'id nu ne résolvait pas la section et le code
// s'affichait à tout zoom ;
// v0.44 : cadrage par COMPOSANTE PRINCIPALE —
// les îles lointaines d'un pays (Canaries, outre-mers français…) restent
// affichées mais ne comptent plus dans le cadrage de la descente ; sélection
// niveau 2/3 CONSERVÉE au dézoom ; Marne/Aube réparées (règle R21) et îles
// portugaises retirées de l'admin (règle R20, cadrage continental) ;
// v0.43 : clic extérieur en descente = RESET +
// initiaux (Al, Ash, The…) sont sautés (« Al Humaydat » → « Hum. ») ;
// v0.42 : vue monde au zoom initial tous les pays en CODE, nom complet au
// zoom quand la section le permet ; v0.41 : SÉLECTION PEINTE — l'application est
// la seule source de vérité, plus aucun état de sélection ECharts : un reset
// est un VRAI reset, rien ne peut réapparaître ; dézoom depuis une descente =
// retour à l'ÉTAT INITIAL du niveau monde, monde entier recadré, pays quitté
// sélectionné ; nations du Royaume-Uni en français (Angleterre, Écosse,
// Pays de Galles, Irlande du Nord) ; l'Alaska reste dans le cadrage aux
// niveaux 1/2/3 (composantes détachées ≥ 100°²) ; plus de palier « codes »,
// plus aucune capitale sur la carte ; extrême est américain (> 160°) et
// récifs contestés (Scarborough, Spratley) supprimés.)
// Règles : couleurs continents v16 uniquement ; hover et sélection = teinte -20 %
// de luminosité, sans ombre portée. Étiquettes noires ou blanches selon luminance.
// Clic sur un pays sélectionné → subdivisions (régions/États/provinces) ;
// clic sur une subdivision → niveau inférieur si disponible (France : départements).
(function () {
  'use strict';
  // v0.63 — NOYAU Prisme 2 : la géométrie, le rendu, la caméra, les vues et
  // la navigation administrative vivent ici. Les MÉCANISMES DE SÉLECTION
  // interactifs (clics) sont extraits dans prisme2-selection.js ; les
  // imports de fichiers (mode A) parlent au noyau par
  // window.__PR2.definirSelection / __PR2.ouvrir. La sélection de l'app
  // reste PUREMENT PEINTE (v0.41) : etat.selection (primaire) +
  // etat.selections (additionnelles) → ensembleSelection() → donneesRegions.
  var DATA = window.__PR2_DATA;           // { continents, ural, idversA3, pays }
  var ADMIN = window.__PR2_ADMIN || { niv1: {}, niv2: {} }; // subdivisions
  // v0.80 : GESTION DES CARTES PAR PACKAGE (mode import uniquement) —
  // la couche des contours partagés (data-geo : pays + frontières) est
  // UNIQUE : le contour extérieur n'a qu'UNE SEULE version, commune au
  // monde, au niveau 1 et au niveau 3. Les SUBDIVISIONS d'un pays peuvent
  // arriver par PACKAGE à la demande : packages/<ISO2>.js appelle
  // __PR2_PKG_REG(id, { niv1, niv2, villes… }) qui injecte dans ADMIN ;
  // la descente est alors RETENTÉE. Chargement par <script src> (contourne
  // le CORS file://). En HTML tout-embarqué, ADMIN est déjà complet et ce
  // mécanisme ne fait RIEN (window.__PR2_PKGS absent).
  var PKG_EN_COURS = {};
  var PKG_FAIT = {}; // v7.2 : a3 déjà enregistrés par __PR2_PKG_REG
  window.__PR2_PKG_REG = function (idPays, donnees) {
    if (!donnees || !donnees.a3) return false;
    // v7.21 : DONNÉES IGN SUPPRIMÉES — les seules zones marquées
    // "src":"ign" (contours IGN des régions ultrapériphériques, ex.
    // Guadeloupe/Martinique) sont retirées du niv1 ET du niv2 : toute
    // la France est GADM 4.1, source unique, plus de conflit de pavage
    // ni d'écrasement d'ADMIN.niv2["FRA"] par les paquets alias (les
    // fichiers FR-NA.js/FR-SA.js, doublons portant le même a3, sont
    // supprimés du dépôt ; le manifest les redirige vers FR.js).
    if (donnees.niv1 && donnees.niv1.length) {
      var ignIds = [];
      donnees.niv1.forEach(function (f) { if (f && f.src === 'ign') ignIds.push(f.id); });
      if (ignIds.length) {
        donnees.niv1 = donnees.niv1.filter(function (f) { return !(f && f.src === 'ign'); });
        if (donnees.niv2) ignIds.forEach(function (id) { delete donnees.niv2[id]; });
      }
    }
    // v7.22 : RÉGIONS ULTRAPÉRIPHÉRIQUES GADM 4.1 — remplacement définitif
    // des contours IGN supprimés. Les 5 territoires (Guadeloupe,
    // Martinique, Guyane française, La Réunion, Mayotte) viennent du
    // fragment 00b-droms.js : SOURCE UNIQUE GADM 4.1, la même que le
    // reste de la France et des autres pays. Le niveau 0 y est l'UNION
    // EXACTE des unités de niveau 1 (frontières communes en UN SEUL
    // tracé, imbrication parfaite) ; ses unités deviennent les
    // subdivisions de niveau 2 de la région. Ajout APRÈS les régions
    // métropolitaines (feats[0] reste 'Auvergne-Rhône-Alpes', src gadm,
    // pour la règle du socle v0.69) et AVANT l'affectation à ADMIN.
    try {
      var droms = window.__PR2_DROMS && window.__PR2_DROMS[donnees.a3];
      if (droms && donnees.niv1) {
        droms.forEach(function (d) {
          var dejaLa = donnees.niv1.some(function (f) { return f && f.id === d.id; });
          if (dejaLa) return; // niv1 déjà régénéré proprement
          donnees.niv1.push({ id: d.id, nom: d.nom, geometry: d.geometry,
            __cp: d.__cp, etq: d.etq, src: 'gadm', __a3: donnees.a3 });
          if (donnees.niv2) donnees.niv2[d.id] = d.enfants.map(function (e) {
            return { id: e.id, nom: e.nom, geometry: e.geometry, src: 'gadm', __a3: donnees.a3 };
          });
        });
      }
    } catch (errDrom) { /* repli : France sans ultrapériphériques */ }
    if (donnees.niv1) ADMIN.niv1[donnees.a3] = donnees.niv1;
    if (donnees.niv2) ADMIN.niv2[donnees.a3] = donnees.niv2;
    PKG_FAIT[donnees.a3] = true;
    delete PKG_EN_COURS[idPays];
    // v0.210 : DÉDUPLICATION PAR a3 — un alias (FR-NA, FR-SA, ES-002,
    // NL-NA, US-009, VE-NA) charge le FICHIER CANONIQUE (FR.js…) : purger
    // AUSSI son propre id de PKG_EN_COURS, sinon l'alias reste bloqué et
    // toute rechargement ultérieur est refusé.
    var conf = window.__PR2_PKGS;
    if (conf && conf.manifest && conf.manifest.pays)
      Object.keys(conf.manifest.pays).forEach(function (k) {
        if (conf.manifest.pays[k].a3 === donnees.a3) delete PKG_EN_COURS[k];
      });
    return true;
  };
  function chargerPackage(idPays, rappel) {
    var conf = window.__PR2_PKGS;
    if (!conf || !conf.manifest || !conf.manifest.pays) return false;
    var fiche = conf.manifest.pays[idPays];
    if (!fiche || !fiche.fichier || PKG_EN_COURS[idPays]) return false;
    // v7.2 : déjà enregistré → JAMAIS re-télécharger (sans ce garde, chaque
    // clic sur une zone sans sous-niveau re-téléchargeait le package entier).
    if (PKG_FAIT[fiche.a3]) return false;
    PKG_EN_COURS[idPays] = true;
    var s = document.createElement('script');
    // v7.3 : anti-cache — le package porte aussi l'identifiant de version.
    var bld = window.__PR2_VBUILD;
    s.src = (conf.base || '') + fiche.fichier + (bld ? '?v=' + encodeURIComponent(bld) : '');
    s.onload = function () { delete PKG_EN_COURS[idPays]; try { if (rappel) rappel(idPays); } catch (err) { } };
    s.onerror = function () { delete PKG_EN_COURS[idPays]; };
    document.body.appendChild(s);
    return true;
  }
