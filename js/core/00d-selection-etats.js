  // fragment 00d-selection-etats.js — v7.30 (plan point 2) : MACHINE À
  // ÉTATS DE SÉLECTION. Avant v7.30, etat.selections était muté à la main
  // par le noyau (15, 16) ET par les greffons (S.__PR2_SEL), sans tracer,
  // sans version : impossible de savoir qui avait changé quoi, ni de
  // garantir qu'un cache de peinture (11-survol) était à jour. Toutes les
  // mutations passent désormais par ce PASSERELLE UNIQUE :
  //   selEnvoyer(op, nouvelles) — remplace l'ensemble entier (copie propre)
  //   selAjouter(cle, op) / selRetirer(cle, op) — ajout/retrait par clef
  //   selVider(op) — tout effacer
  // Chaque mutation : (a) copie PROPRE du tableau (plus d'aliasing entre
  // copies capturées par le code appelant — cf. le cadrage v7.13 qui ne
  // reposait plus, par accident, sur un push mutateur) ; (b) etat.selVersion
  // incrémenté ; (c) journalisation {op, v, avant, apres} (clefs bornées à
  // 12 caractères... non : les CLEFS sont coupées à 64, la liste à 12
  // entrées dans le journal), aussi exposée dans
  // window.__PR2_SEL_JOURNAL pour le harnais ; (d) cap 200 entrées.
  var SEL_JOURNAL = [];
  function selJournalResetTest() { SEL_JOURNAL = []; } // usage harnais uniquement
  function selEnvoyer(op, nouvelles) {
    var avant = (etat.selections || []).slice();
    var apres = [];
    (nouvelles || []).forEach(function (n) {
      if (n != null && apres.indexOf(n) === -1) apres.push(n);
    });
    etat.selections = apres;
    etat.selVersion = (etat.selVersion || 0) + 1;
    var entree = {
      op: String(op || '?'), v: etat.selVersion,
      avant: avant.slice(0, 12), apres: apres.slice(0, 12),
      nAvant: avant.length, nApres: apres.length,
      vue: (typeof vue !== 'undefined' && vue) ? ((vue.paysId || '?') + ':' + (vue.parent || '')) : '?',
    };
    SEL_JOURNAL.push(entree);
    if (SEL_JOURNAL.length > 200) SEL_JOURNAL.shift();
    try {
      window.__PR2_SEL_JOURNAL = SEL_JOURNAL;
    } catch (errFen) { }
    return etat.selections;
  }
  function selAjouter(cle, op) {
    if (cle == null) return etat.selections;
    var arr = (etat.selections || []).slice();
    if (arr.indexOf(cle) === -1) arr.push(cle);
    return selEnvoyer(op || 'ajouter', arr);
  }
  function selRetirer(cle, op) {
    var arr = (etat.selections || []).filter(function (n) { return n !== cle; });
    return selEnvoyer(op || 'retirer', arr);
  }
  function selVider(op) {
    return selEnvoyer(op || 'vider', []);
  }
