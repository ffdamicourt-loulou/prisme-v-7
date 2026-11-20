# Packages v0.210 — CORRECTION IMPORTANTE (20/11/2026)

## Le bug
Chaque package commençait par une ligne :

    package Prisme 2 XX/XXX — v0.210 (charger via <script src>…)

Ce n'est pas du JavaScript valide (`package` suivi d'un identifiant = SyntaxError).
Or les packages se chargent via `<script src="packages/XX.js">` (00-const.js : chargerPackage).
**Résultat : TOUT chargement réel d'un package échouait silencieusement** (le harnais ne
l'avait jamais détecté car il n'exerce pas le chargement des packages).

## La correction (packages-v0210-corrige.zip)
- En-tête préfixé `// ` → commentaire valide.
- 135 gros packages reformattés sur plusieurs lignes (valeurs JSON **strictement identiques**,
  vérifié par comparaison canonique 135/135), pour passer les canaux de transfert texte.
- Validation : les 237 fichiers s'exécutent en VM et appellent __PR2_PKG_REG (237/237).

## Compléter ce dépôt
46 packages corrigés sont déjà poussés (lots A-B). Le reste se pousse localement (le
connecteur ne peut pas transférer ~70 Mo fidèlement). Dans le dossier dézippé de
packages-v0210-corrige.zip :

    git clone https://github.com/ffdamicourt-loulou/prisme-v-7.git
    cp *.js <clone>/packages/
    cd <clone> && git add -A && git commit -m "Packages v0.210 corrigés" && git push

md5 de référence du zip : 16842646eea863625798ac73f6f3d1ea
