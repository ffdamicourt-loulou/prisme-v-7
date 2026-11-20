# Données binaires — PRISME v-7

Les données binaires sont désormais **dans le dépôt** :

- `data/monde.json.gz` : géométrie mondiale (1 905 512 octets), issue de `data-geo-v0210.json.gz`.
- `data/admin.json.gz` : bornes admin (36 octets) = `{"niv1":{},"niv2":{}}` (mode packages).

Chargées par `js/app/demarrage.js` via `fetch` + `DecompressionStream("gzip")`.

La version complète des bornes admin (15 Mo) reste optionnelle et hors dépôt :
`prisme6/data/admin-complet-v210.json.gz` (Drive « prisme V6 » / archives locales).

Les packages de `packages/` (237 + manifest, version corrigée v0.210) sont chargés dynamiquement.
