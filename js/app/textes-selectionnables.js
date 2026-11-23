(function () {
  'use strict';
  // AUDIT v7.37 — couche de TEXTE SÉLECTIONNABLE posée par-dessus le canvas.
  // Les étiquettes natives (pays, niveaux 2/3, abréviations) restent inchangées :
  // cette couche duplique chaque étiquette visible (texte exact, position, taille)
  // en éléments SPAN transparents, synchronisés après chaque rendu via
  // __PR2.etiquettesDetail(). Glisser le curseur sur un nom le sélectionne
  // (surlignage bleu translucide) ; Ctrl+C copie le nom exactement affiché.
  var minuteur = setInterval(function () {
    if (window.__PR2 && window.__PR2.carte && window.__PR2.carte()) { clearInterval(minuteur); try { demarrer(); } catch (e) { } }
  }, 250);
  function demarrer() {
    var P = window.__PR2;
    var conteneur = document.getElementById('prisme2');
    if (!conteneur) return;
    var pos = '';
    try { pos = getComputedStyle(conteneur).position; } catch (e) { }
    if (pos !== 'relative' && pos !== 'absolute') conteneur.style.position = 'relative';
    var st = document.createElement('style');
    st.textContent = '.prisme2-textes{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9;}'
      + '.prisme2-textes span{position:absolute;transform:translate(-50%,-50%);color:transparent;'
      + 'user-select:text;-webkit-user-select:text;cursor:text;pointer-events:auto;'
      + 'font-family:sans-serif;font-weight:300;line-height:1.15;white-space:pre;text-align:center;}'
      + '.prisme2-textes span::selection{background:rgba(30,90,180,0.38);color:transparent;}'
      + '.prisme2-textes span::-moz-selection{background:rgba(30,90,180,0.38);color:transparent;}';
    var couche = document.createElement('div');
    couche.className = 'prisme2-textes';
    conteneur.appendChild(st); conteneur.appendChild(couche);
    var carte = P.carte();
    var signature = '';
    function rafraichir() {
      try {
        var det = P.etiquettesDetail ? P.etiquettesDetail() : [];
        var sortie = [];
        var sig = '';
        for (var i = 0; i < det.length; i++) {
          var e = det[i];
          if (!e || !e.cp || !e.texte) continue;
          var px = carte.convertToPixel({ geoIndex: 0 }, [e.cp[0], e.cp[1]]);
          if (!px || !isFinite(px[0]) || !isFinite(px[1])) continue;
          var left = Math.round(px[0] * 10) / 10, top = Math.round(px[1] * 10) / 10;
          sig += e.id + '@' + left + ',' + top + ',' + e.F + ',' + e.texte + ';';
          sortie.push([e.texte, left, top, e.F || 10]);
        }
        if (sig === signature) return; // rien n'a bougé : ne pas reconstruire (préserve une sélection en cours)
        signature = sig;
        var frag = document.createDocumentFragment();
        for (var j = 0; j < sortie.length; j++) {
          var s = document.createElement('span');
          s.textContent = sortie[j][0];
          s.style.left = sortie[j][1] + 'px';
          s.style.top = sortie[j][2] + 'px';
          s.style.fontSize = sortie[j][3] + 'px';
          frag.appendChild(s);
        }
        couche.innerHTML = '';
        couche.appendChild(frag);
      } catch (err) { /* silencieux : resynchronisé au prochain rendu */ }
    }
    carte.on('finished', rafraichir);
    carte.on('georoam', rafraichir);
    window.addEventListener('resize', function () { signature = ''; setTimeout(rafraichir, 400); });
    rafraichir();
  }
})();
