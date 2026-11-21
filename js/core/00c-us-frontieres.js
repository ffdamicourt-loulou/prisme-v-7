  // v7.29 : FRONTIÈRES NEBRASKA — Sarpy/Douglas. Le bord sud du comté
  // Douglas était une ligne droite alors que Sarpy portait un sommet
  // intermédiaire (−95,8956 ; 41,1952) → fuseau blanc d environ 1,2 km
  // sur 35 km ; Sarpy portait en outre un deuxième polygone-triangle
  // (rustine antérieure) qui ne pavait rien. packages/US.js est trop
  // volumineux (2,86 Mo) pour être repoussé : la RÉPARATION passe par
  // ce correctif appliqué AU MOMENT de l enregistrement du package
  // (données corrigées avant toute peinture). IDEMPOTENT : si le
  // package est déjà réparé (13 sommets / 1 polygone), ne rien faire.
  (function () {
    var regOrig = window.__PR2_PKG_REG;
    if (typeof regOrig !== 'function') return;
    var V_SARPY = [-95.89556488046168, 41.19518417147568];
    window.__PR2_PKG_REG = function (idPays, donnees) {
      try {
        if (idPays === 'US' && donnees && donnees.niv2 && donnees.niv2.Nebraska) {
          donnees.niv2.Nebraska.forEach(function (z) {
            if (!z || !z.geometry) return;
            // Douglas : insérer le sommet de Sarpy entre
            // (-95,90749 ; 41,20056) et (-96,308 ; 41,181) si absent.
            if (z.id === 'Douglas' && z.geometry.type === 'Polygon') {
              var ring = z.geometry.coordinates && z.geometry.coordinates[0];
              if (ring && ring.length === 12) {
                for (var i = 0; i + 1 < ring.length; i++) {
                  if (Math.abs(ring[i][0] + 95.90749381698268) < 1e-6
                    && Math.abs(ring[i][1] - 41.20056059356966) < 1e-6
                    && Math.abs(ring[i + 1][0] + 96.308) < 1e-6
                    && Math.abs(ring[i + 1][1] - 41.181) < 1e-6) {
                    ring.splice(i + 1, 0, [V_SARPY[0], V_SARPY[1]]);
                    z.__fix729 = true;
                    break;
                  }
                }
              }
            }
            // Sarpy : retirer le 2e polygone (triangle-rustine
            // [[-96.308,41.181],[-95.89556,41.19518],[-95.90749,41.20056]]).
            if (z.id === 'Sarpy' && z.geometry.type === 'MultiPolygon'
              && z.geometry.coordinates && z.geometry.coordinates.length === 2) {
              z.geometry.coordinates = [z.geometry.coordinates[0]];
              z.__fix729 = true;
            }
          });
        }
      } catch (errFix) { /* en cas de doute : comportement historique */ }
      return regOrig.call(this, idPays, donnees);
    };
  })();
