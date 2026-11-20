  // v0.91 : l AFFICHAGE DES VILLES EST SUPPRIMÉ (les données restent dans
  // data-geo.json pour l outillage). v0.96 : le MOTEUR est retiré du
  // noyau (index VILLES_PAYS sur ~7 300 villes, hit-test local, sélection
  // des capitales — plus aucun consommateur depuis v0.91) ; il ne reste que
  // l API villesAffichees(), vide, dont dépendent core/09 et le harnais.
  function villesAffichees() { return []; }
