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

<!-- rebuild-pages 2026-11-20i -->

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
- Harnais navigation : 27/27 (5 nouveaux contrôles) ; apparence 11/11 ×2 thèmes.

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
