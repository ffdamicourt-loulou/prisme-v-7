// Prisme 6 — chargeur de thème : lit les variables CSS de theme.css et les pose
// dans window.__PR2_THEME (interface stable du noyau, inchangée depuis v0.210).
// Doit être chargé APRÈS theme.css et AVANT js/app/demarrage.js.
(function () {
  'use strict';
  var DEFAUTS = { fond: '#eaf2f8', contour: '#ffffff', texteSurvol: '#000000' };
  function lit(nom) {
    var v = '';
    try { v = getComputedStyle(document.documentElement).getPropertyValue('--pr-' + nom).trim(); }
    catch (e) { /* environnement sans CSS : repli constantes */ }
    return v;
  }
  var t = {};
  var fond = lit('fond'); if (fond) t.fond = fond;
  var pays = lit('pays'); if (pays) t.pays = pays;
  var survol = lit('survol'); if (survol) t.survol = survol;
  var contour = lit('contour'); if (contour) t.contour = contour;
  var texte = lit('texte'); if (texte) t.texte = texte;
  var texteSurvol = lit('texte-survol'); if (texteSurvol) t.texteSurvol = texteSurvol;
  var trait = parseFloat(lit('trait')); if (isFinite(trait) && trait > 0) t.traitNiveaux = trait;
  var oRef = lit('ombre-couleur');
  if (oRef) {
    var o = { couleur: oRef };
    var dx = parseFloat(lit('ombre-x')), dy = parseFloat(lit('ombre-y')), f = parseFloat(lit('ombre-flou'));
    if (isFinite(dx)) o.dx = dx;
    if (isFinite(dy)) o.dy = dy;
    if (isFinite(f)) o.flou = f;
    t.ombre = o;
  }
  t.fond = t.fond || DEFAUTS.fond;
  t.contour = t.contour || DEFAUTS.contour;
  t.texteSurvol = t.texteSurvol || DEFAUTS.texteSurvol;
  window.__PR2_THEME = t;
})();
