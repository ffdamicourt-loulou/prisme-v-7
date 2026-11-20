# Données binaires non versionnées

Le connecteur GitHub ne transmet pas fidèlement les fichiers binaires. Deux fichiers de `data/` ne sont donc PAS dans le dépôt ; ils sont identiques à ceux validés (harnais 11/11, v0.210) et disponibles :

- **data/monde.json.gz** (1,9 Mo) : contours + frontières du monde (ex data-geo-v0210.json.gz)
- **data/admin.json.gz** (36 octets) : admin quasi vide en mode packages : contenu exact `{"niv1":{},"niv2":{}}`

Où les récupérer :
1. Archive **prisme6-v010.zip** (2,3 Mo, aussi sur Drive : prisme V6 / archives) — elle contient les deux fichiers dans prisme6/data/.
2. Après le clonage : copier les deux fichiers dans `data/`.

Vérification : `python3 -c "import gzip; print(gzip.open('data/admin.json.gz').read())"` doit afficher `{"niv1":{},"niv2":{}}`.

Le gros admin complet (admin-complet-v210.json.gz, 14,4 Mo, optionnel) reste dans prisme V6 / archives / parts sur Drive.
