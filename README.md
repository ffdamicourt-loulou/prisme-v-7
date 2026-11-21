# Prisme 6 — architecture en fichiers

 même application que prisme 2 v0.210, mais **découpée en fichiers par fonction** : plus de gros HTML de 3,7 Mo embarquant tout. Nécessite un petit serveur local (fetch interdit en file://).

## Démarrer
    cd prisme6
    python -m http.server 8000
    → ouvrir <http://localhost:8000/>

## Arborescence
- `index.html` — chrome DOM (bandeau, fil d'Ariane, conteneur carte)
- `css/prisme.css` — style du chrome (inchangé v0.210)
- `css/theme.css` — **thème actif** (clair par défaut). Toutes les couleurs/ombres/traits sont des variables CSS `--pr-*` modifiables ici, sans toucher au code.
- `css/theme-black.css` — variante noire v7. Pour l'activer : changer le `href` de la balise `<link id="prisme6-theme">` dans index.html.
- `js/lib/echarts.min.js` — bibliothèque (statique, jamais retouchée)
- `js/theme/chargeur-theme.js` — lit les variables CSS → `window.__PR2_THEME`
- `js/app/demarrage.js` — bootstrap : charge données + code dans l'ordre, erreurs affichées dans le bandeau
- `js/core/00-17` — noyau (une seule IIFE répartie en 18 fragments, chargés en ordre strict) : 00-const ouvre l'IIFE, 17-demarrage la ferme (d'où l'impossibilité de tester ces 2 fragments isolément)
- `js/app/couche-comprehension.js` — guichet sens/intitulés (v0.200)
- `js/app/greffon-pays.js` — mode packages (chargement pays à la demande)
- `data/monde.json.gz` — contours + frontières (ex data-geo-v0210)
- `data/admin.json.gz` — admin quasi vide en mode packages ({\"niv1\":{},\"niv2\":{}}) ; `data/admin-complet-v210.json.gz` = gros admin v0.210 complet, optionnel
- `data/manifest-pays.json` — 237 pays + alias (FR-NA, ES-002… → packages canoniques)
- `data/couleurs-continents.json` — teintes par continent (défauts prisme 4 : Europe #2e5479…, sélection #2555e5)
- `tests/harnais-apparence.cjs` — banc VM : `node --max-old-space-size=1200 tests/harnais-apparence.cjs . css/theme.css` (11 contrôles, refaire tourner theme-black.css aussi)

## À côté du dossier
- `packages/` — les 237 packages pays + 6 alias (archive packages-v0210.zip, 18,6 Mo) : décompresser **au même niveau que index.html**, le manifest pointe vers `packages/XX.js`.

## Tests par couche ( rappel méthode )
- retouche thème (css/) → harnais-apparence seul, les 2 thèmes.
- retouche étiquettes/greffon/compréhension → harnais-apparence + ouverture manuelle.
- retouche noyau (js/core) → revalidation complète (bench-noir v7 + harnais-apparence).

## Validation en cours
- Concat core reconstruit = noyau v7 (181 825 octets, 4 lignes vides de coupe perdues, syntaxe byte-identique au plan fonctionnel).
- Harnais : clair 11/11, noir 11/11.

<!-- rebuild-pages 2026-11-21zd -->

## v7.3 — anti-cache (2026-11-20c)
Les chargements (core, app, données, manifest, packages) portent `?v=<version>`
(`window.__PR2_VBUILD` dans index.html) : un navigateur ne peut plus exécuter
un ancien noyau servi par le cache HTTP mêlé aux nouveaux fragments — cause de
comportements incohérents (menu doublé, descente directe au niveau 2 au clic monde).
Harnais navigation : 4 contrôles de régression ajoutés (22/22).

## v7.4 — navigateur + ancres (2026-11-20d)
- **Survol et sélection aux niveaux 1/2/3** : les textes des zones restent
  BLANCS sur la peinture assombrie (repaint chirurgical + "noms-zones").
- **Changement de pays rétabli** : le clic sur un pays extérieur visible
  (« x-ES »…) depuis une vue pays ouvre le nouveau pays AU MÊME NIVEAU
  (règle v0.31 du noyau, perdue dans le passage en greffon).
- **Étiquette Auvergne-Rhône-Alpes** : décalage +0,5° supprimé, ancre posée au
  centroïde d'aire via `CORRECTIONS_CP` (02-geo-ancres.js) — table générale
  des corrections d'étiquettes, prioritaire sur les `__cp` des packages.
- Harnais navigation : 30 sections (119 contrôles) ; apparence 11/11 ×2 thèmes.

## v7.29 — FRANCHIR LES FRONTIÈRES DES HOMONYMES : trois réparations États-Unis (2026-11-22za)

- **Frontière Sarpy/Douglas (Nebraska) réparée** (js/core/00c-us-frontieres.js) : le bord sud du comté Douglas était une ligne droite de 35 km alors que Sarpy portait un sommet intermédiaire (−95,8956 ; 41,1952) → fuseau blanc d environ 1,2 km. packages/US.js (2,86 Mo) étant trop volumineux pour être repoussé tel quel, la réparation passe par un nouveau fragment du cœur qui intercepte l enregistrement du package US et corrige les données au vol : le sommet est inséré dans l anneau Douglas (12 → 13 sommets) et le polygone-triangle « rustine » ajouté antérieurement à Sarpy est retiré (1 seul polygone). Chaîne partagée désormais identique des deux côtés. Correctif IDEMPOTENT (ne rien faire si le package est déjà réparé).
- **Sélection qui « décrochait » au Maj+clic réparée** (js/core/11-survol-repaint.js) : cacherRegions refusait de cacher la couleur de la zone survolée ; or un Maj+clic survole forcément la zone cliquée, peinte en teinte de sélection (règle v7.14 « la sélection prime sur le survol ») → le cache gardait l ancienne teinte de repos et repeignait la zone en repos au mouseout. Désormais cacherRegions ne saute la zone survolée que si elle N EST PAS sélectionnée, et repaintSurvol ne peint jamais une zone sélectionnée en survol.
- **« Cliquer Washington charge les 99 comtés de l Iowa » réparé** (js/core/15-navigation.js) : ADMIN.niv2 est indexé par NOM ; les homonymes inter-niveaux (le COMTÉ Washington, présent au Texas, au Nebraska, en Iowa… partage sa clé avec l ÉTAT Washington et ses 39 comtés) traversaient les niveaux lors de la descente. Nouvelle garde enfantsDansZone : les enfants proposés pour une zone doivent recouvrir sa bbox (tolérance au changement de convention de longitude ±180 contre 0-360 pour Samoa, Fidji, Tonga).
- Harnais : sections 31-34 (sélection persistante sous survol ; homonyme Washington sans fausse descente ; Harris fin de chaîne propre ; Douglas 13 sommets + Sarpy 1 polygone ; correctif 00c vérifié sur la géométrie PRÉ-réparation d un navigateur au cache périmé) — navigation 127 OK / 0 KO ; apparence 11/11 ×2.

## v7.28 — SÉLECTIONS MULTIPLES ÉTATS-UNIS : homonymes réparés (2026-11-21zd)

- **Bug v7.20 réparé** (`ajouterSousVue`, 15-navigation.js) : la comparaison « occupant.__uniprov === e.__uniprov » entre deux `undefined` valait toujours vrai → le renommage des zones HOMONYMES (v0.53) était court-circuité. Dès qu'UNE zone du parent ajouté portait un id déjà affiché (comtés « Humboldt » en Californie ET au Nevada, « Washington », « Orange »…), le garde-fou « tout ou rien » voyait un chevauchement partiel et rejetait TOUT l'ajout en silence.
- Symptômes vécus sur la carte des États-Unis : impossible de combiner plusieurs états (niveau 2), impossible d'ajouter les comtés d'un état (niveau 3) quand ceux d'un autre étaient affichés.
- **Correctif** : marqueur `__origine` (préfixe du parent) posé à l'ajout — l'occupant qui est NOTRE enfant déjà ajouté garde son id (bascule de retrait intacte) ; un homonyme d'un AUTRE parent est renommé « Parent/Id » comme prévu en v0.53. Cas uniprovincial (v7.20) inchangé (deux `__uniprov` définis et égaux).
- Harnais : section 30 (États-Unis : sélection multiple d'états au Maj+clic, ajout Texas/Nevada/Oregon en cascade, bascules de retrait) — navigation 119 OK / 0 KO ; apparence 11/11 ×2.

## v7.27 — FINITION NIVEAU 3 : 12 pays complétés + artefacts GADM retirés (2026-11-21zc)

- 12 fragments packages/n3-*.js (Corée du Sud : 38 gu des 3 villes spéciales ; Belgique : 19 communes de Bruxelles-Capitale ; Cambodge : 12 khan de Phnom Penh ; Suriname : 50 resorts des 8 districts ; Samoa : 37 sous-districts ; Tonga : 7 districts de Tongatapu ; Zanzibar : 4 districts ; Brunei : 8 mukims de Belait ; Fidji : 5 tikina de Central ; Panama : 4 corregimientos de Kuna Yala ; Guinée équatoriale : 8 districts ; Uruguay : municipio d'Ismael Cortinas).
- Matching avec descente de chaîne GADM (enfant unique → niveau plus profond, ex. Bruxelles → communes via région/arrondissement) et garde anti-homonyme (« n.a. », enfants auto-référencés).
- js/core/00-const.js : retrait des artefacts GADM « COL+99? », « MEX+99? » et « UNDOF » des premières subdivisions (Colombie, Mexique, Syrie).
- Taïwan (districts absents de GADM 4.1) et Wallis « Sigave » (donnée dégénérée chez GADM) restent sans complément possible via GADM.
- Harnais navigation : 29 sections, 109 contrôles ; apparence 11/11 ×2.

## v7.26 — NIVEAU 4 COMPLÉTÉ : 30 pays dotés de sous-zones GADM 4.1 (2026-11-21zb)

- 212 fragments packages/n4-*.js (districts vietnamiens 9 472, sous-districts thaïlandais 4 247, freguesias portugaises 3 969, communes burundaises 2 302, paroisses britanniques 2 182, blocs indiens 2 182, etc.) chargés paresseusement AVANT les n3 et le package (manifest « n4 », même mécanisme async=false que v7.25).
- js/core/00-const.js : deuxième injection (window.__PR2_NIV4X) fusionnée aux enfants de niveau 3 existants — les zones déjà dotées d'enfants natifs ne sont PAS doublées, les compléments ajoutent {id, nom, geometry, src:'gadm', __a3}.
- Matching par nom normalisé + repli spatial centroïde (Douglas-Peucker eps 0.0008–0.005, coords 3 décimales).
- Récoltes maigres pour RU (90/2321 raïons), Canada (8/76), Allemagne (18/38), Pologne (65/380), Soudan (25/188) : noms GADM non appariés. ~62 des 93 pays à niveau 4 partiel sans complément possible (niveau GADM final déjà atteint : USA, Japon, Mexique, Algérie, etc.).
- Harnais navigation : 28 sections, 98 contrôles ; section GB vérifiée manuellement (Angleterre → comtés → districts → 28 zones niveau 4).

## v7.25 — NIVEAU 3 COMPLÉTÉ : 17 pays dotés de sous-zones GADM 4.1 (2026-11-21za)

- 33 fragments packages/n3-*.js (districts suisses, kabupaten indonésiens, sous-comtés ougandais, provinces philippines, etc.) chargés paresseusement AVANT le package du pays (async=false, manifest « n3 »).
- js/core/00-const.js : injection des compléments dans niv2 au moment de l enregistrement du package (niv2 créé si absent — « niv2 »: null chez CH…).
- 52 pays restent sans niveau 3 (absents de GADM ou dernier niveau atteint) : voir rapport.
## v7.24 — PILE DE NAVIGATION : le retour saute les bascules d'ajouts (2026-11-21z)

**Signalement** : des parties de la carte « disparaissent sans raison
claire » ; piste utilisateur : une sélection aux niveaux 2 et 3 en même
temps produit un bug.

**Diagnostic** : chaque ajout/retrait de sœur (clic sur une région voisine
d'une vue départements, mécanisme v7.19) empilait une vue dans la pile de
navigation. Les actions en chaîne (ajout, retrait, ré-ajout…) créaient
des vues combinées persistantes (noms de carte du type
« prisme2-FR-Corse+HautsdeFrance~HautsdeFrance++… » qui s'allongent
indéfiniment), et le bouton retour ne dépilait qu'UNE bascule : la vue ne
changeait quasiment pas (retrait d'un ajout), changeait « sans raison
claire », ou laissait l'utilisateur coincé dans des états mixtes — la
carte affichait alors plusieurs régions à des niveaux différents.
La peinture elle-même est saine (vérifié : chaque nom de carte enregistré
reçoit bien une entrée peinte, combinée et dézoomée comprises).

**Correctifs (15-navigation.js)** :
- les cadres empilés par `ajouterSousVue` sont marqués `__bascule` ;
- `retour()` saute toute chaîne de cadres `__bascule` consécutifs et
  restaure la dernière vraie étape de DESCENTE : une seule pression
  ramène à la vue parente, quel que soit le nombre d'ajouts/retraits.

**Harnais** : nouvelle section 26 (chaîne de bascules Corse/HdF :
1 pression retour → vue régions, puis monde) ; section 24 adaptée à la
nouvelle sémantique. Navigation 90/90 ; apparence 11/11 ×2.

## v7.23 — DESCENTE EN UN SEUL CLIC, NIVEAU 3 CONFIRMÉ COMPLET (2026-11-21y)

**Signalements** : (1) « il semble manquer des données de niveau 3, Occitanie
ou Bretagne » ; (2) « l'ajout d'une région demande deux clics au lieu d'un ».

**Diagnostic** : les données FR de niveau 3 (arrondissements) sont COMPLÈTES
dans le package GADM (Occitanie 36, Bretagne 15… aucun département sans
enfants). Le ressenti « deux clics » venait du mécanisme v7.17+v7.8 : le
premier clic sur une région la SÉLECTIONNAIT (sans rien ouvrir), le second
ouvrait une info-bulle « Afficher le niveau 3 ? », le troisième seul ouvrait
la vue. Ce flux en trois interactions donnait aussi l'impression de données
manquantes.

**Correctifs (greffon-selection.js)** :
- v7.17 retiré : clic simple sur une région à la vue « régions » = DESCENTE
  IMMÉDIATE vers ses subdivisions (un seul clic, comme à tous les niveaux).
- v7.8 retiré : l'info-bulle de confirmation `validerDescente` n'apparaît
  plus (les données sous-zones sont déjà chargées avec le package du pays —
  elle n'apportait aucune protection réelle). Les fonctions
  `descenteAttente`/`confirmerDescente` restent exportées inertes.
- L'auto-sélection de la région sous le curseur au 2e clic pays est
  également retirée (un clic pour tout).
- Maj+clic bascule toujours la SÉLECTION multi-N2 manuellement ; la
  sélection N2 peinte -20 % et le multi-N2 persistant après descente sont
  conservés ; v7.19 (clic sœur = ajout/retrait des enfants) et v7.20
  (repli uniprovincial) inchangés.

**Harnais** : sections 14 et 20 réécrites pour la nouvelle sémantique,
nouvelle section 25 : Occitanie → Hérault puis Bretagne → Morbihan en 2
clics simples, arrondissements présents ET peints (aucun trou blanc).
Navigation 86/86 ; apparence 11/11 ×2.

## v7.22 — SOURCE UNIQUE GADM 4.1 aux niveaux 1/2/3, frontières communes (2026-11-21x)

**Objectif** : zéro donnée IGN nulle part, une SEULE source (GADM 4.1,
celle des autres pays) pour les trois niveaux français, et des frontières
communes en un seul tracé (imbrication parfaite).

- **Nouveau fragment `js/core/00b-droms.js`** : les 5 régions
  ultrapériphériques (Guadeloupe, Martinique, Guyane française,
  La Réunion, Mayotte) reconstruites depuis les données officielles
  **GADM 4.1** (`gadm41_GLP/MTQ/GUF/REU/MYT`, niveaux 0 et 1) — la même
  source généalogique que le reste de la France. Le niveau 0 est
  l'UNION EXACTE des unités de niveau 1 (arrondissements, cantons) :
  frontière commune partagée en UN SEUL tracé, pavage sans trou ni
  doublon — les unités deviennent les subdivisions de niveau 2 de
  chaque région (Guadeloupe → Basse-Terre/Pointe-à-Pitre, Martinique →
  4 arrondissements, Guyane → Cayenne/Saint-Laurent-du-Maroni,
  La Réunion → 4 unités, Mayotte → 17 cantons).
- **00-const.js** : après le filtre anti-IGN (v7.21), `__PR2_PKG_REG`
  réinjecte ces régions GADM dans `niv1`/`niv2` AVANT l'affectation à
  ADMIN — la France affiche 18 régions toutes `src:"gadm"`, aucun
  `src:"ign"`, quel que soit le contenu (inerte) de `packages/FR.js`.
- **Ordre de chargement** : le fragment est ajouté juste après
  `00-const` dans `js/app/demarrage.js` (et dans les deux harnais).
- Frontières : la règle du socle v0.69 s'applique désormais uniformément
  (feats[0] = Auvergne-Rhône-Alpes, gadm) ; socle-union vs contour du
  pays ne peuvent plus « doubler » un trait côtier de source étrangère.
- Harnais : navigation **82/82** (section 24 : ultrapériphériques
  GADM, descentes, ajout de sœurs entre DROM), apparence 11/11.

## v7.21 — suppression de TOUTES les données IGN (2026-11-21w)

**Diagnostic du bug d'affichage** (capture : zones blanches non peintes,
info-bulle « aucune subdivision plus fine ») : les contours des cinq
régions ultrapériphériques (Guadeloupe, Martinique, Guyane française,
La Réunion, Mayotte) sont la SEULE source IGN du projet (`"src":"ign"`),
au milieu de données GADM 4.1 partout ailleurs. Source mixte = conflits
de pavage (socle-union vs contour pays, régions surcroquis non issus de
la même source généalogique) et paquets « alias » FR-NA / FR-SA
doublons complets de la France (même `a3` "FRA") qui pouvaient ÉCRASER
`ADMIN.niv2["FRA"]` par une version tronquée.

- **js/core/00-const.js — FILTRE `src:"ign"`** : `__PR2_PKG_REG` retire
  toute zone `src:"ign"` du `niv1` et purge ses clés `niv2`. La vue
  régions de la France affiche les **13 régions métropolitaines GADM**,
  quelle que soit la source du package. C'est ce filtre qui agit sur le
  site (paquets par `<script>` ; en mode embarqué, ADMIN est déjà
  débarrassé de ces entrées).
- **packages/FR-NA.js / FR-SA.js SUPPRIMÉS** : paquets alias orphelins
  de la France (même `a3` "FRA", donc ÉCRASEMENT potentiel de
  `ADMIN.niv2["FRA"]` par une version tronquée, contours IGN à l'appui)
  — le manifest les redirige déjà vers `packages/FR.js` depuis v7.2.
- Les octets IGN encore présents dans `packages/FR.js` côté dépôt sont
  inertes : le filtre les retire avant toute utilisation.
- Aucune autre donnée IGN dans le projet (`data/admin.json.gz`,
  `data/monde.json.gz`, autres packages : zéro `src:"ign"`).
- Harnais : navigation **78/78** (section 23 : 13 régions GADM, aucune
  zone `src:"ign"`, descentes Corse et Île-de-France OK), apparence
  11/11.
- DROM : la France reste dessinée avec ses territoires en vue MONDE
  (contour de `monde.json`) ; côté subdivisions, ils n'ont plus de zone.

## v7.20 — communautés uniprovinciales : sélection de Madrid (2026-11-21v)

L'Espagne compte des communautés UNIPROVINCIALES (Madrid, Murcia,
Asturias, Cantabria, Navarra, La Rioja, Baleares, Ceuta, Melilla) : la
zone n'a PAS de tableau de subdivisions — la province EST la
communauté. Le clic sur « c-Madrid » depuis une vue provinces échouait
dans ajouterSousVue (aucun enfant) et affichait « aucune subdivision
plus fine disponible » : impossible de sélectionner Madrid au niveau 3.
Repli uniprovincial : la zone rejoint la vue comme sa PROPRE fille
(marquage __uniprov pour la bascule de retrait) ; un nouveau clic la
retire. Harnais navigation : 75/75 ; apparence 11/11 ×2.

## v7.19 — clic simple sur une région sœur : ses subdivisions rejoignent la vue (2026-11-20u)

Sélection multi-N2 → descente dans les départements d'une région → clic
simple sur une AUTRE région (sœur « c- » de la vue) : le clic tombait dans
la descente, échouait sur le nom « c-XXX » (absent des données) et
affichait « aucune subdivision plus fine disponible ». Désormais, un clic
simple sur une sœur du niveau juste inférieur (ayant des enfants) fait
REJOINDRE ses enfants à la vue courante (même mécanique que le Maj+clic
v0.52, sœur masquée + teinte sélection) ; un nouveau clic les RETIRE
(bascule). Harnais navigation : 73/73 ; apparence 11/11 ×2.

## v7.18 — sélecteur de pays supprimé, étiquettes des régions voisines rétablies (2026-11-20t)

1. **Le sélecteur de pays du panneau en haut à gauche est SUPPRIMÉ**
   (liste déroulante « Pays (packages à la demande) » et boutons
   Ouvrir / Monde) : la sélection vit entièrement sur la carte. Le
   panneau garde l'export PNG/HTML, la compréhension et l'info-bulle.
2. **Rétablissement des noms des régions voisines** : la directive v7.16
   (« au niveau 3, efface les noms de niveaux 2 ») visait UNIQUEMENT la
   région de la zone descendue/cliquée (une sœur __masquee — son nom
   apparaissait par-dessus ses propres départements). Les AUTRES régions
   du pays conservent leurs étiquettes à tous les niveaux. La fusion du
   nom du parent (tache au dézoom) est inchangée. Harnais : 71/71 ;
   apparence 11/11 ×2.

## v7.17 — désélection zone vide, dézoom « comme un n2 », nouveau mécanisme de sélection (2026-11-20s)

Quatre changements :
1. **Désélection dans une zone vide réparée** : le socle (fond/mer de la vue)
   posait le drapeau « clic nommé », le clic zrender du même clic physique
   était consommé silencieusement — rien ne se désélectionnait. Le socle
   n'est plus une zone nommée : clic dans le vide = tout désélectionner.
2. **Dézoom d'une sélection niveau 3 = affichage « n2 sélectionné »** : la
   fusion de dézoom s'applique aussi aux zones sélectionnées — UNE teinte
   uniforme, AUCUN trait blanc interne (les traits blancs, vus de loin,
   formaient une sorte de tache blanche).
3. **Nouveau mécanisme de sélection** : 1er clic = pays ; 2e clic (curseur
   sur le pays) = affichage des régions ET sélection immédiate de la région
   sous le clic (hit-test pixel → lon/lat → zone, `zoneAuPoint`). À partir
   de là, dans la vue régions, un clic simple sur une autre région
   l'AJOUTE à la sélection (multi-N2) ; un second clic sur une région déjà
   sélectionnée déclenche la descente vers ses départements (info-bulle
   conservée). Les N2 sélectionnées se peignent plus sombres (-20 %) que
   le fond du pays sélectionné (-10 %).
4. **Multi-N2 persistant** : descendre dans les départements d'une région
   ne dé-sélectionne plus les autres (elles restent peintes en sélection en
   tant que sœurs « c- ») ; la proposition multi-zones ne propose plus que
   les zones de la vue courante. Harnais navigation : 71/71 ; apparence
   11/11 ×2.

## v7.16 — doublon d'étiquettes, noms du niveau supérieur, ceinture de peinture à chaque setOption (2026-11-20r)

Trois correctifs :
1. **Sœur masquée = étiquette masquée** (doublon « Côte-d'Or » + « Bourgogne-Franche-Comté »
   sur le même territoire) : dans une vue combinée, la sœur ajoutée est __masquée
   (ses propres zones s'affichent), mais son étiquette restait ancrée au centre de son
   territoire, PAR-DESSUS les départements affichés. Elle ne porte plus ni étiquette,
   ni entrée geo.regions, ni donnée carte (06 + 08).
2. **Noms du niveau supérieur effacés au niveau 3+** : en vue départements (niveau ≥ 2),
   les étiquettes des régions (niveau 2, id « c- ») ne s'affichent plus — seules les
   étiquettes du niveau courant restent (08). Supprime les chevauchements
   région/département constatés dans les vues combinées du sud.
3. **Ceinture de peinture à CHAQUE setOption** (immenses zones blanches) : la ceinture
   de complétude (v0.74) ne vivait que dans majEtiquettes ; le setOption de CHANGEMENT
   DE VUE (optionsBase → regions: donneesRegions()) passait à côté. Toute zone sans
   entrée geo.regions est rendue avec la couleur PAR DÉFAUT du geo (blanc cassé) —
   d'où les trous blancs en vrai navigateur après les sélections multiples.
   La ceinture est factorisée dans donneesRegionsCeinturees (06, repli d'erreur
   compris) et utilisée par optionsBase ET majEtiquettes ; le défaut du geo passe
   d'un blanc cassé à une teinte neutre (#d9e2ec) : plus aucune zone ne peut rester
   invisible. Harnais navigation : 65/65 ; apparence 11/11 ×2.

## v7.15 — polices pays revues : -15 % depuis la taille courant (2026-11-20q)

Le +30 % (v7.13) sur les noms et codes des pays entre zoom 5× et 40× est
réduit de 15 % depuis la taille courante : facteur net 1,3 × 0,85 ≈ 1,105
(soit +10,5 % sur la taille d'origine). Plage (5×–40×) et coefficients
inchangés ailleurs. Harnais navigation : 61/61 ; apparence 11/11 ×2.

## v7.14 — la sélection PRIME sur le survol (bug récurrent du dernier pays) (2026-11-20p)

Nouveau signalement : « le dernier pays sélectionné garde la couleur
selected au lieu de prendre la couleur sélection multiple ». La v7.12
éteignait l'état de survol au clic, mais un état de survol résiduel peut
encore survivre dans un vrai navigateur (le setOption recrée la série,
ECharts re-émet mouseover, et les chemins Alt/panneau ne passent pas par
traiteClic). Correctif PAR CONSTRUCTION, indépendant de l'état interne du
survol : dans la peinture (06-peinture-regions.js), un pays MEMBRE de la
sélection (primaire ou additionnel, vue monde) garde TOUJOURS sa teinte de
sélection ; la teinte de survol ne s'applique plus qu'aux pays NON
sélectionnés. Quel que soit l'état résiduel du survol, aucun membre ne
peut plus afficher une teinte différente de la sélection multiple.
Ajout diagnostic : la version exécutée s'affiche dans le bandeau
(l'index.html peut lui-même être servi depuis le cache HTTP du
navigateur — « je teste bien v7.14 ? » se vérifie d'un coup d'œil).
Harnais navigation : 61/61 (nouveau contrôle : survol résiduel sur un
membre repeint, teinte de sélection intacte) ; apparence 11/11 ×2.

## v7.13 — cadrage multi-sélection, Alt+clic ciblé, polices pays +30 % (2026-11-20o)

Trois demandes utilisateur :
1. **Cadrage de sélection multiple** (vue monde, Maj+clic) : l'ENSEMBLE
   des pays sélectionnés est désormais cadré — centré horizontalement,
   occupant 80 % de la hauteur du viewport (même règle que le pays
   seul). Avant, seul le DERNIER pays cliqué était cadré : les autres
   membres sortaient du champ. Nouvelle fonction `cadrerGroupe`
   (12-camera-cadrage.js), modèle analytique de `centrerSur` : boîtes
   principales + composantes détachées, chaque pays replacé au multiple
   de 360° qui minimise la largeur de l'union (FR+US sans tour du
   globe) ; appelée par `reinitialiserVers` quand l'ajout conserve la
   sélection.
2. **Alt+clic sur un pays d'une sélection multiple** : le panneau
   propose de désélectionner UNIQUEMENT le pays cliqué (plus
   « Tout désélectionner »), au lieu de la liste entière des membres.
   Alt+clic SANS pays ciblé garde la liste complète (greffon-selection :
   cible transmise en vue monde + priorité `cSel`).
3. **Polices des pays** : noms ET codes des pays +30 % entre zoom 5× et
   40× (08-etiquettes-zones.js, `boostPays`) ; hors de cette plage les
   tailles sont inchangées.
Harnais navigation : 60/60 (4 nouveaux contrôles) ; apparence 11/11 ×2.

## v7.12 — nom de sélection au dézoom à taille commune + survol « collé » (2026-11-20n)

Deux corrections signalées et validées par l'utilisateur :
1. **Étiquette de la sélection au dézoom** (niveau 3 masqué, tache fondue) :
   le nom du pays portant la sélection avait sa propre règle de taille
   (test de contenance avec cible +44 %) — il « criait » plus fort que
   ses voisins. Il suit désormais EXACTEMENT la règle des autres pays au
   même niveau de zoom (règle des extérieurs « x- » : `t.etiquette − 2`,
   réduite au prorata du dézoom, plancher 6 px), nom si la boîte tient
   (centre puis point profond), sinon SIGLE/ID à la même taille
   (08-etiquettes-zones.js, bloc fusionN23).
2. **Couleur du dernier pays ajouté à une sélection multiple** : au clic,
   le `setOption` du changement de sélection recrée la série et ECharts
   ne renvoie PAS de `mouseout` pour la zone sous le pointeur —
   `survolNom` restait posé et le pays cliqué se repeignait en teinte de
   SURVOL (-20 %) au lieu de rejoindre la teinte de sélection multiple
   (mi-chemin). Tout clic interprété par `traiteClic` éteint maintenant
   l'état de survol AVANT l'action (11-survol-repaint.js :
   `effacerSurvol`, exporté dans 17-demarrage.js, appelé dans
   greffon-selection.js). Invisible pour les harnais sans événements de
   pointeur : le contrôle simule désormais le mouseover posé avant le
   Maj+clic (le test « DEUX pays peints » devient le test de
   non-régression de ce bug).
Harnais navigation : 56/56 ; apparence 11/11 ×2.

## v7.11 — teinte mi-chemin étendue aux niveaux du pays sélectionné (2026-11-20m)

Précision utilisateur : quand un pays est sélectionné, le pays ET ses
niveaux 1, 2, 3 (et 4 pour GB) prennent la teinte à **mi-chemin entre la
couleur non sélectionnée et la couleur de survol/sélection** (-10 % de
luminosité, exactement le milieu entre repos et survol -20 %). Auparavant
seuls le pays en vue monde, les zones Maj+sélectionnées et la tache de
dézoom portaient cette teinte : les niveaux ouverts restaient en teinte
de repos. Désormais **toutes les zones propres du pays ouvert** la portent
(`06-peinture-regions.js`, garde `propre`) ; les sœurs « c- », extérieurs
« x- » et socles gardent leur teinte. Harnais navigation : 55/55 (nouveau
contrôle : les 18 régions du pays sélectionné à la teinte mi-chemin) ;
apparence 11/11 ×2.

## v7.10 — gestionnaire de sélection UNIQUE + vraies causes racines (2026-11-20k)

Réponse à l'analyse d'architecture : oui, l'éclatement de la sémantique de
sélection/désélection entre greffon-pays et greffon-sélection était la cause
des régressions en cascade. **Toute l'interprétation des clics vit désormais
dans un SEUL fichier** : `js/app/greffon-selection.js` (fonction
`traiteClic`), et `greffon-pays.js` délègue systématiquement (trampoline).
Causes racines corrigées (invisibles pour les harnais à événements plats) :
1. **Enveloppe d'événement nichée** : dans un vrai navigateur, ECharts livre
   `e.event` = enveloppe zrender et l'événement DOM est niché plus bas
   (`e.event.event`, `.rawEvent`…). La lecture directe
   `e.event.shiftKey`/`altKey` valait TOUJOURS `undefined` : Maj et Alt ne
   marchaient QUE dans les harnais. La nouvelle fonction
   `touche(e, cle)` descend la chaîne d'enveloppes (6 niveaux max).
2. **Clic en mer** : ECharts n'émet AUCUN événement série/geo quand on
   clique l'océan, seulement au niveau zrender. Le clic « vide » est donc
   branché sur `carte.getZr().on('click')` (fonction `zrClic`) : un clic
   qui a touché une zone nommée pose un drapeau consommé par le zr, seul
   un clic n'ayant touché AUCUNE zone désélectionne tout (vue conservée).
3. **Double gestionnaire** : le second `carte.on('click')` « fond de
   carte » de greffon-pays est supprimé ; le message de fin de chaîne
   (« aucune subdivision plus fine ») est désormais persistant, géré par
   `traiteClic` elle-même.
Harnais navigation : 54/54 (4 nouveaux contrôles v7.10 : enveloppe nichée,
Maj+enveloppe, drapeau de clic nommé, clic vide zrender) ; apparence 11/11 ×2.

## v7.9b — correctif critique : clic de zone désélectionnait tout (2026-11-20j)

Le gestionnaire « clic fond de carte » traitait TOUT événement geo comme un
clic vide : or dans un vrai navigateur, le clic sur une RÉGION déclenche
AUSSI un événement geo PORTANT LE NOM de la zone. Résultat réel : chaque
clic de zone désélectionnait tout et annulait l'info-bulle de validation
n2→n3 — sites inutilisables, tests verts car le harnais ne simule pas ce
double événement. Correctif : « zone vide » = événement SANS NOM
uniquement.

## v7.9 — Maj+clic : l'ajout à la sélection réparé et généralisé (2026-11-20i)

Le modificateur Maj n'était PLUS transmis au noyau depuis le passage en
greffon (v7.6) : « ajouter un pays à la sélection » ne fonctionnait plus.

- **Maj+clic pays en vue monde** : le pays rejoint la sélection (vue
  combinée au niveau 1) ; le pays déjà sélectionné est conservé, les deux
  peints en teinte sélection (-10 %) — réutilise le paramètre `conserver`
  v0.34 de `reinitialiserVers`.
- **Maj+clic pays extérieur (x-…) en vue pays** : les divisions du nouveau
  pays REJOIGNENT la vue au MÊME niveau (vue combinée FR + DE : régions +
  länder côte à côte) ; package du pays chargé à la demande si absent
  (`chargerPackage` exporté, ajout retenté) ; repli sur la sélection
  niveau 1 si le pays n'a pas de subdivisions à ce niveau.
- **Maj+clic sœur (règle v0.52 restaurée)** : les enfants de la sœur
  du niveau supérieur rejoignent la vue ; nouveau Maj+clic les retire.
- **Maj+clic zone de la vue** : bascule dans la sélection de niveau —
  peinte en teinte sélection (-10 %) comme la zone cliquée, et proposée
  par la demande multi-zones « Charger les sous-zones ».
- **Purge** : un pays retiré du groupe (panneau Alt+clic) est retiré de la
  sélection persistée — le retour au monde ne le ressuscite pas.
- Harnais navigation : 50 contrôles (7 nouveaux : Maj monde, peinture
  double sélection, vue combinée FR+DE, retrait groupe avec aperçu,
  persistance/purge au retour monde).

## v7.8 — module unique de sélection/désélection (2026-11-20h)

**Nouveau fichier `js/app/greffon-selection.js`** : TOUTES les règles de
sélection/désélection vivent désormais dans un seul module (le noyau reste
fournisseur d'état et de primitives). Règles implémentées :

- **Clic mer / zone vide → TOUT désélectionner**, SANS changer la vue ni
  le cadrage (caméra et zoom conservés).
- **Descente n2→n3 VALIDÉE par info-bulle** (« Afficher le niveau 3 de X ? ») :
  le clic région est bloqué jusqu'à la confirmation ; la demande de package
  « Charger les sous-zones ? » reste inchangée au niveau 2. Les zones en
  fin de chaîne ne déclenchent pas d'info-bulle.
- **Alt+clic → pop-up PERSISTANTE et contextuelle** de désélection :
  propositions par radio-boutons (zone cliquée, remonter d'un cran, retour
  au niveau 1, désélectionner le pays, retirer un pays d'un groupe…),
  étiquettes avec les NOMS des zones/pays concernés, **aperçu complet en
  direct** à chaque bascule (restauration par journal d'inverses),
  boutons Valider / Annuler, positionnée hors de la zone cliquée.
- **Généralité** : propositions indexées sur les niveaux RÉELS de la vue —
  la Grande-Bretagne à 4 niveaux (ou tout pays plus profond) marche sans
  cas particulier.
- Harnais navigation : 43 contrôles (9 nouveaux : blocage/validation n2→n3,
  clic vide cadrage conservé, panneau Alt : options, aperçus, restauration).

## v7.7 — dézoom fusion : nom du niveau supérieur + teinte sélection (2026-11-20g)

- **Nom de la zone apparente** : au dézoom ×3,5 (niveaux 2+), quand les
  subdivisions disparaissent, la tache affiche le NOM de la zone du niveau
  supérieur (région, département…) au centre géométrique de son socle
  (repli au point profond, coupe sur deux lignes puis sigle), en BLANC.
- **Teinte de la tache** : couleur du PAYS SÉLECTIONNÉ à -10 % de
  luminosité (TSL, `assombrirFacteur` × 0,90) — la tache est une SÉLECTION,
  cohérente avec la règle v7.6 des sélections à tous les niveaux.
- Harnais navigation : 34 contrôles (2 nouveaux sur la fusion).

## v7.6 — niveaux utilisateur, sélection -10 %, cadrages 80/60 (2026-11-20f)

- **Niveaux utilisateur redéfinis** : le niveau 1 est LE PAYS SEUL sélectionné
  (contour, cadré à 80 % de la hauteur du viewport) ; le niveau 2 = régions,
  le niveau 3 = départements/équivalent. Un clic sur un pays en vue monde le
  SÉLECTIONNE au niveau 1 ; un SECOND clic sur le pays déjà sélectionné y
  descend (régions). Plus jamais d'ouverture directe en niveau 2.
- **Changement de pays** : depuis n'importe quel niveau (1, 2, 3), cliquer un
  autre pays (ou un pays extérieur « x-… ») le sélectionne au NIVEAU 1
  (80 % de la hauteur). Fini le retour rapide sur la sélection initiale (US).
- **Couleur de sélection** : à TOUS les niveaux, la zone/pays sélectionné(e)
  est peint(e) en teinte d'origine MOINS 10 % de luminosité (le survol reste
  à -20 %) — distinction nette entre survol et sélection.
- **Cadrages** : pays sélectionné à 80 % de la hauteur ; toutes les vues de
  subdivisions (régions, départements, arrondissements) à 60 % de la hauteur
  pour mieux visualiser les détails et les petites zones.
- **Dézoom ×3,5 étendu** : en cascade à tous les sous-niveaux (départements →
  région apparente, arrondissements → département apparent), frontières
  internes éteintes et teinte uniforme pour éviter la tache illisible.
- Harnais navigation étendu (33 contrôles, sémantique deux clics) ; thème
  noir vérifié (11/11).

## v7.5 — navigation, cadrages, dézoom niv3 (2026-11-20e)
- **Pays sélectionné : TOUJOURS le niveau 1** — depuis la vue monde comme
  depuis un niveau 2/3 d'un autre pays (l'ancienne règle « même niveau »
  est retirée). Le greffon passe par `A.ouvrir(id, 1)`.
- **Cadrage par niveau** : niveau 1 = 80 % de la hauteur du viewport,
  niveaux 2/3 = 60 % (`appliquerVue`, v0.79 → v7.5).
- **Dézoom ×3,5 en niveau 3** : la sélection reste courante mais les
  frontières internes s'éteignent, teinte uniforme — seule la région de
  niveau 2 apparaît (fini la tache illisible).
- **Caméra rendue** : toute interpolation de zoom (molette) en cours est
  ANNULÉE au changement de vue — ses geoRoam traînants ramenaient la
  caméra sur l'ancienne sélection ½ seconde après l'ouverture du nouveau
  pays (surtout visible sur les comtés des États-Unis).
- Harnais : `charge()` ne rejoue plus un onload consommé (sémantique
  navigateur) ; 31/31 navigation, 11/11 apparence ×2 thèmes.
