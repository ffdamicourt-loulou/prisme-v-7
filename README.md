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

<!-- rebuild-pages 2026-11-20d -->

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
