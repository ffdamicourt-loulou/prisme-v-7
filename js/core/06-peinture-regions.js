  // v7.16 : PEINTURE CEINTURÉE — la ceinture de complétude (v0.74) vivait
  // UNIQUEMENT dans majEtiquettes : le setOption de CHANGEMENT DE VUE
  // (optionsBase → regions: donneesRegions()) passait À CÔTÉ. Toute zone
  // sans entrée geo.regions est rendue avec l'itemStyle PAR DÉFAUT du geo
  // (quasi blanc) — c'est l'origine des « immenses zones blanches »
  // apparues en vrai navigateur après les sélections multiples (vues
  // combinées). Chaque nom enregistré (NOMS_CARTE) reçoit désormais une
  // entrée peinte à CHAQUE setOption, repli compris.
  function donneesRegionsCeinturees() {
    var noms = NOMS_CARTE[vue.type === 'monde' ? 'prisme2' : vue.nomMap] || [];
    var regions;
    try {
      regions = donneesRegions();
    } catch (e) {
      console.warn('[Prisme2] donneesRegions a échoué, repli de peinture', e);
      regions = noms.map(function (n) { return regionRepli(n); });
    }
    if (noms.length) {
      var vus = {};
      regions.forEach(function (r) { if (r && r.name) vus[r.name] = true; });
      noms.forEach(function (n) { if (!vus[n]) regions.push(regionRepli(n)); });
    }
    return regions;
  }
  function donneesRegions() {
    var t = tailles(etat.zoom);
    // v0.21 : en mode sélectionné (vue d'un pays, niveaux 1/2/3), les zones
    // propres GARDENT LA COULEUR DU SÉLECTIONNÉ (assombri -20 %) et sont
    // SÉLECTIONNÉES PAR DÉFAUT — un clic descend directement. Le survol
    // assombrit encore un peu (-20 % supplémentaires) pour rester perceptible.
    var enSelection = vue.type !== 'monde';
    // v7.5→v7.6 : DÉZOOM ×3,5 AUX NIVEAUX SÉLECTIONNÉS SUIVANTS (régions
    // fermées : départements, arrondissements…) — la sélection RESTE la
    // sélection courante, mais la vue ne dessine PLUS le détail fin :
    // frontières INTERNES ÉTEINTES et teinte UNIFORME du continent, les
    // zones se fondent en une seule tache = la RÉGION du NIVEAU SUPÉRIEUR
    // (le socle du niveau courant esquisse exactement son contour).
    // Re-zoomer sous le seuil réaffiche le détail tel quel.
    var dezoomN3 = vue.type !== 'monde' && vue.niveau >= 2
      && etat.zoomEntree > 0 && etat.zoom <= etat.zoomEntree / 3.5;
    // v0.41 : ensemble des entités sélectionnées (pays, zones « c- »),
    // partagé par toutes les branches ci-dessous.
    var sel = ensembleSelection();
    // v0.74 : relation d'enclaves de la vue courante (monde → relation
    // nationale précalculée). Une enclave est peinte 20 % PLUS SOMBRE que
    // la teinte COURANTE de son hôte (repos, sélection ou survol) : elle ne
    // se confond plus avec la zone qui l'entoure.
    var encV = vue.type === 'monde' ? (ENCLAVES_MONDE || {}) : (ENCLAVES_PAR_CARTE[vue.nomMap] || {});
    // v0.22 : les PAYS n'ont plus de bordure propre — les frontières entre
    // pays sont dessinées UNE SEULE FOIS par la couche « frontieres »
    // (série lines, segments dédupliqués). Les subdivisions (niveaux 1/2/3)
    // gardent leur trait.
    var epTrait = TRAIT_NIVEAUX; // v6 : filet UNIFORME aussi au repos (côtes visibles) et au survol/sélection
    // v7.34 : FRONTIÈRE UNIQUE — aux niveaux 3 utilisateur des pays
    // européens (départements, comtés, districts = app n2), les zones
    // n'ont PLUS de bordure propre : la frontière interne (voisin↔voisin,
    // notamment quand deux sources simplifient leur arête partagée
    // séparément → « doubles frontières ») est tracée UNE SEULE FOIS par
    // la couche « frontieres-zones » (même système que les PAYS, v0.22).
    var fzEurope = frontiereUniqueZone();
    // v0.28 : échelles px/degré courantes (le monde couvre 360° de lon et
    // ~350° projetés en lat à layoutSize×zoom px) pour le test « le nom tient
    // dans sa zone ? ».
    var layoutPx = tailleCarte() || 1200;
    var pxLon = layoutPx * etat.zoom / 360;
    var pxLat = layoutPx * etat.zoom / 350;
    // Nom affichable d'une entité : pays → code si trop grand, subdivision →
    // abréviation (3 lettres + point). Infobulles : toujours le nom complet.
    var nomPays = function (p) {
      // v0.80o : règle HISTORIQUE de largeur, Indépendante de tout layout :
      // nom complet (MAJUSCULES) dès que la section au centre le permet,
      // sinon ID. Ces formateurs geo restent pour les TESTS — l'affichage
      // réel vit dans la couche scatter « noms-zones » (position exacte).
      return faitTient(MAJ(p.nom), p.id, t, pxLon, pxLat) ? MAJ(p.nom) : p.id;
    };
    // v0.51 : ABRÉVIATIONS DÉSAMBIGUÏSÉES (helper mémoïsé siglesVue).
    var sigles = siglesVue(t, pxLon, pxLat);
    // v0.80o : plus de layout bande — une zone affiche son nom complet dès
    // qu'il tient au centre géometrique, sinon son sigle/abréviation.
    var nomZone = function (z) {
      return faitTient(z.nom, z.id, t, pxLon, pxLat) ? z.nom : (sigles[z.nom] || abrev(z.nom));
    };
    // v0.42 : PLUS DE PALIER « codes » — le nom complet d'un pays s'affiche
    // dès qu'il tient dans sa section (v0.40), MAIS en vue monde au zoom
    // initial la PORTE v0.42 impose le CODE pour tous (nom complet seulement
    // au zoom) ; une subdivision trop juste passe en abréviation (3 lettres
    // + point).
    var nomEtiquette = function (p) {
      return vue.type === 'monde' ? espaceLettres(nomPays(p)) : espaceLettres(nomZone(p));
    };
    var regions = listeVue().map(function (p) {
      try {
      var ct = textePays(p.continent);
      // v0.41 : la sélection est PEINTE — en vue monde, un pays sélectionné
      // (primaire ou additionnel) prend directement la teinte assombrie.
      // v0.58 : la zone SÉLECTIONNÉE par clic simple (etat.selectionZone) est
      // peinte PLUS SOMBRE que le fond sélectionné (-20 % de plus) et son
      // trait est épaissi — la sélection est visible AVANT de charger le
      // niveau suivant.
      var zoneSel = enSelection && etat.selectionZone === p.id;
      // v0.70 : épaisseur UNIFORME du filet — quel que soit l'état (repos,
      // sélection, survol) et quel que soit le niveau, le trait reste à
      // epTrait ; SEULE la couleur de fond change. Les logiques v0.58/v0.67
      // d'épaississement (1,2) sont supprimées.
      var epSel = epTrait;
      var epSurv = epTrait;
      // v7.6 : SÉLECTION = couleur d'origine -10 % de luminosité (distincte
      // du survol -20 %) ; la règle vaut à TOUS les niveaux.
      // v7.9 : en vue admin, une zone Maj+sélectionnée (etat.selections)
      // se peint en teinte de sélection (-10 %), comme la zone cliquée.
      // v7.11 : PAYS SÉLECTIONNÉ — à TOUS les niveaux (1, 2, 3 et 4 pour
      // GB), ses PROPres zones portent la teinte de sélection (mi-chemin
      // entre la teinte de repos et la teinte de survol) ; les sœurs
      // « c- », les extérieurs « x- » et les socles gardent leur teinte.
      var propre = enSelection && p.id.slice(0, 2) !== 'c-'
        && p.id.slice(0, 2) !== 'x-' && p.id.slice(0, 6) !== 'socle@'
        && p.id.slice(0, 5) !== 'socle';
      // v7.17 : SÉLECTION MULTIPLE DE N2 — au niveau des RÉGIONS (vue
      // niveau 1), une zone présente dans etat.selections (clic simple,
      // nouveau mécanisme) se peint PLUS SOMBRE (-20 %) que le fond
      // d'origine du pays sélectionné (-10 %) : la sélection de
      // plusieurs régions est VISIBLE d'un coup d'œil.
      var selN2 = vue.niveau === 1 && sel[p.id] && p.id.slice(0, 2) !== 'c-'
        && p.id.slice(0, 2) !== 'x-' && p.id.slice(0, 6) !== 'socle@'
        && p.id.slice(0, 5) !== 'socle';
      var base = enSelection
        ? (zoneSel ? selectionnes[p.continent]
           : selN2 ? assombris[p.continent]
           : (propre || sel[p.id] || sel['c-' + p.id]) ? selectionnes[p.continent] : COULEURS[p.continent])
        : (sel[p.id] ? selectionnes[p.continent] : COULEURS[p.continent]);
      // v7.7 : DÉZOOM FUSION — la tache (zones fondues = zone du NIVEAU
      // SUPÉRIEUR apparent) prend la couleur du PAYS SÉLECTIONNÉ à -10 % de
      // luminosité (TS L, assombrirFacteur × 0,90), comme toute sélection :
      // le socle visible est la zone sélectionnée du niveau au-dessus.
      // v7.7 : DÉZOOM FUSION — la tache (zones fondues = zone du NIVEAU
      // SUPÉRIEUR apparent) prend la couleur du PAYS SÉLECTIONNÉ à -10 % de
      // luminosité (TS L, assombrirFacteur × 0,90), comme toute sélection :
      // le socle visible est la zone sélectionnée du niveau au-dessus.
      // v7.17 : la fusion s'applique AUSSI aux zones sélectionnées
      // (zoneSel) : vue de loin, une sélection de niveau 3 (départements)
      // s'affiche comme un N2 sélectionné — UNE teinte uniforme, AUCUN
      // trait blanc interne (les traits blancs, vus de loin, formaient
      // une sorte de tache blanche).
      if (dezoomN3) base = selectionnes[p.continent];
      var survol = assombris[p.continent];
      // v0.80 : SURVOL PEINT PAR LE NOYAU — l'emphasis interne d'ECharts
      // re-rend les polygones géants du niveau 3 et, au sortir puis au
      // retour du pointeur, laissait DISPARAÎTRE des zones (Venezuela,
      // Amérique du Sud, ailleurs). La zone survolée est maintenant
      // assombrie DIRECTEMENT dans la peinture (survolNom, mis à jour par
      // initSurvol puis repaint majEtiquettes) et l'emphasis interne est
      // désactivé : plus aucun re-rendu fragile au survol.
      // v7.14 : LA SÉLECTION PRIME SUR LE SURVOL — un pays MEMBRE de la
      // sélection (vue monde : primaire ou additionnel) garde sa teinte
      // de sélection, MÊME si un état de survol survit au clic : dans un
      // vrai navigateur, le setOption qui suit un Maj+clic recrée la
      // série et ECharts ne renvoie pas de mouseout pour la zone sous le
      // pointeur — un survolNom résiduel repeignait le DERNIER pays
      // sélectionné en teinte de survol « sélection » au lieu de la
      // teinte commune de la sélection multiple. ICI c'est impossible par
      // construction : quel que soit l'état interne du survol, un membre
      // affiche exactement la teinte de sélection. (Le survol continue
      // de s'appliquer pleinement aux zones NON sélectionnées.)
      if (survolNom === p.id && !sel[p.id] && !sel['c-' + p.id]) base = survol;
      SURVOL_PAR_NOM[p.id] = survol; // v0.80e : survol chirurgical
      // v0.78 : ENCLAVE — MÊME TEINTE que n'importe quelle zone. La v0.74
      // l'assombrissait de 20 % de plus que son hôte : à l'écran elle
      // ressemblait à une zone DÉJÀ SÉLECTIONNÉE sans action de
      // l'utilisateur (Damas dans la vue Syrie, « Tart. »…). L'enclave
      // reste DEVANT son hôte (ordre de dessin v0.74) donc survolable et
      // cliquable ; sa frontière blanche la distingue de l'hôte.
      // (La teinte -20 % est conservée pour les PAYS extérieurs enclavés
      // — Lesotho, Saint-Marin… — sinon ils seraient invisibles, de la
      // même teinte de continent que leur hôte et sans bordure.)
      // v0.29 : ES-002 (Îles Canaries) — pas d'étiquette (le nom reste dans
      // l'infobulle au survol) ; graisse unifiée à 300 (noms et codes).
      var muet = p.id === 'ES-002';
      // v0.79 : EN VUE ADMIN (niveaux 1/2/3), l'étiquette d'une petite zone
      // reste TOUJOURS affichée (le formateur abrège déjà : « Occ. ») —
      // l'ancienne porte aire (25/zoom²) laissait des districts d'Israël,
      // des boroughs d'Alaska et des régions canadiennes SANS nom visible.
      // En vue monde, la porte historique est conservée.
      // v0.80d : EN VUE ADMIN (niveaux 1/2/3), l'étiquette d'une zone est
      // TOUJOURS affichée, quelle que soit sa taille — la porte aire
      // laissait SANS nom les petites zones de Russie au niveau 2 (villes
      // fermées Zelenogorsk/Solnetchnyi, okrougs urbains : des « enclaves
      // sans nom » visibles). Le formateur abrège déjà (« Zel. »). La porte
      // historique est conservée en vue monde.
      // v0.80o : TOUTES les étiquettes vivent dans la couche scatter
      // « noms-zones » (position exacte du centre géométrique) — les
      // labels des regions geo sont ÉTEINTS, le texte (formatter)
      // continue d alimenter les tests.
      var vis = false;
      return {
        name: p.id,
        itemStyle: { areaColor: base, color: base,
          // v7.32 : ÉPAISSEUR UNIFORME À TOUT ZOOM — l'ancienne règle
          // « dézoom ×3,5 → borderWidth 0 » (fusion v7.7) faisait
          // DISPARAÎTRE les frontières internes au dézoom ; l'utilisateur
          // demande que le filet garde TOUJOURS l'épaisseur générale
          // (epTrait) et la couleur du contour. La teinte uniforme et
          // l'étiquette du niveau supérieur (tache) sont conservées.
          borderColor: THEME.contour,
          // v7.34 : frontière unique — la couche « frontieres-zones » porte
          // le filet dans les vues européennes de niveau app 2 (borderWidth
          // 0 sur la zone, plus de double trait voisin↔voisin).
          borderWidth: fzEurope ? 0 : epSel, shadowColor: (THEME.ombre && THEME.ombre.couleur) || 'rgba(0,0,0,0)', shadowOffsetX: (THEME.ombre && THEME.ombre.dx) || 0, shadowOffsetY: (THEME.ombre && THEME.ombre.dy) || 0, shadowBlur: (THEME.ombre && THEME.ombre.flou) || 0 },
        emphasis: { disabled: true,
          itemStyle: { areaColor: survol, color: survol, borderColor: THEME.contour, borderWidth: epSurv },
          label: { show: false },
        },
        label: {
          show: vis,
          formatter: nomEtiquette(p),
          fontSize: t.etiquette, color: ct, fontWeight: STYLES.etiquette.fontWeight,
        },
      };
      } catch (e) {
        // v0.74 : ceinture par zone — un calcul qui échoue (géométrie
        // dégénérée d'une subdivision) ne laisse JAMAIS la zone en couleur
        // par défaut (blanc) : repli sur la teinte du continent.
        var tf = COULEURS[p.continent] || assombris[p.continent] || '#d9e2ec';
        return {
          name: p.id,
          itemStyle: { areaColor: tf, color: tf, borderColor: THEME.contour, borderWidth: fzEurope ? 0 : epTrait },
          emphasis: { disabled: true, itemStyle: { areaColor: tf, color: tf, borderColor: THEME.contour, borderWidth: epTrait }, label: { show: false } },
          label: { show: false },
        };
      }
    });
    // SOCLE : géométrie complète peinte SOUS les subdivisions — supprime les
    // interstices blancs entre frontières voisines (simplification Douglas-
    // Peucker). Même teinte que les subdivisions, bordure de même couleur.
    // v0.37 : vue combinée → UN SOCLE PAR PAYS MEMBRE ('socle@FR', etc.).
    if (vue.type !== 'monde') {
      var soclesListe = (vue.socles && vue.socles.length)
        ? vue.socles.map(function (s) {
          return { name: (s.paysId === vue.paysId && vue.socleGeometry) ? 'socle' : 'socle@' + s.paysId, continent: s.continent };
        })
        : [{ name: 'socle', continent: vue.continent }];
      // v0.100 : ANCIENS SOCLE (ancêtres) — peints EN DESSOUS du socle courant
      // (unshift inversé : ajoutés en tête de la liste = fond). Chaque niveau
      // garde sa géométrie propre : plus aucun interstice blanc en descente
      // profonde.
      (vue.soclesHerites || []).forEach(function (s) {
        soclesListe.push({ name: 'socle@' + s.paysId, continent: s.continent || vue.continent });
      });
      soclesListe.forEach(function (s) {
        var teinteSocle = COULEURS[s.continent];
        regions.unshift({
          name: s.name,
          // v0.68 : TRAIT DU SOCLE NUL — il ne sert que de FOND (boucher les
          // interstices) ; son contour 0,6 se superposait sous le trait des
          // zones : le contour d'une région (union de ses départements, ou
          // bord de la vue régions) paraissait DEUX FOIS plus épais que les
          // frontières internes. Toutes les lignes visibles viennent
          // désormais des zones seules — épaisseur uniforme.
          itemStyle: { areaColor: teinteSocle, color: teinteSocle, borderColor: teinteSocle, borderWidth: 0 },
          emphasis: { disabled: true, itemStyle: { areaColor: teinteSocle, color: teinteSocle, borderColor: teinteSocle, borderWidth: 0 }, label: { show: false } },
          label: { show: false },
        });
      });
    }
    // Subdivisions sœurs (niveau 2) : le reste du pays affiché NORMALEMENT
    // (teinte du continent, hover -20 %, non cliquable). Rien ne disparaît.
    if (vue.type !== 'monde' && vue.soeurs) {
      vue.soeurs.forEach(function (f) {
        if (f.__masquee) return; // v7.16 : sœur masquée (ses zones propres sont affichées) — pas d'entrée
        var ctSoeur = f.__ct || vue.continent; // v0.37 : continent du pays propriétaire
        var ctS = textePays(ctSoeur);
        // v0.80l : étiquette de sœur via le LAYOUT BANDE (anti-chevauchement)
        // v0.80o : plus de layout bande — sigle/abréviation si le nom ne
        // tient pas, l'affichage réel vit dans le scatter « noms-zones »
        var nS = espaceLettres(faitTient(f.nom, 'c-' + f.id, t, pxLon, pxLat) ? f.nom : (sigles[f.nom] || abrev(f.nom))); // v0.80 : +1px entre lettres
        var fS = t.etiquette;
        var visS = false;
        // v0.41 : une sœur ajoutée à la sélection par Maj+clic est peinte
        // en teinte de sélection (la sélection mémorise son nom de carte
        // « c-XXX » ; l'id nu est accepté aussi).
        var selS = (sel['c-' + f.id] || sel[f.id]) ? selectionnes[ctSoeur] : COULEURS[ctSoeur];
        var survS = assombris[ctSoeur];
        // v0.80 : survol peint par le noyau (voir donneesRegions principal)
        if (survolNom === f.id) selS = survS;
        // v0.74 : sœur enclavée → 20 % plus sombre que son hôte.
        if (encV['c-' + f.id]) {
          var chS = couleursHote(encV['c-' + f.id], sel, enSelection);
          selS = assombrir(chS.base); survS = assombrir(chS.survol);
        }
        SURVOL_PAR_NOM['c-' + f.id] = survS; // v0.80e : survol chirurgical
        regions.push({
          name: 'c-' + f.id,
          itemStyle: { areaColor: selS, color: selS, borderColor: THEME.contour, borderWidth: fzEurope ? 0 : TRAIT_NIVEAUX },
          emphasis: { disabled: true,
            itemStyle: { areaColor: survS, color: survS, borderColor: THEME.contour, borderWidth: TRAIT_NIVEAUX },
            label: { show: visS, formatter: nS, fontSize: fS, color: ctS, fontWeight: STYLES.etiquette.fontWeight },
          },
          // étiquette du contexte (masquée seulement par le layout bande)
          label: {
            show: visS,
            formatter: nS,
            fontSize: fS, color: ctS, fontWeight: STYLES.etiquette.fontWeight,
          },
        });
      });
    }
    // Arrière-plan : pays extérieurs affichés NORMALEMENT (teinte de leur
    // continent, comme en vue monde — rien n'est modifié hors de la
    // sélection). Le clic dessus reset les niveaux et sélectionne le pays ;
    // étiquettes du contexte TOUJOURS affichées.
    if (vue.type !== 'monde') {
      DATA.pays.forEach(function (p) {
        if (p.id === vue.paysId) return;
        if (vue.paysIds && vue.paysIds.indexOf(p.id) !== -1) return; // v0.37 : membre du groupe
        var ctExt = textePays(p.continent);
        // v0.45 : le nom complet d un pays extérieur suit LA MÊME RÈGLE DE
        // TAILLE que les autres entités (faitTient sur sa section de
        // polygone, à l ID DE CARTE « x-XX » — geometrieZone ne résolvait
        // pas l id nu en vue descente, la section valait [0, 0] et le CODE
        // s affichait à TOUT zoom) : nom complet quand il tient dans les
        // frontières, CODE quand le dézoom le fait sortir — majEtiquettes
        // repeint à chaque georoam.
        // v0.80n : le CODE d'un pays extérieur est RESPONSIVE et plus petit
        // que le nom (STYLES.pays.facteurCode) — ils se chevauchaient en
        // Europe au dézoom.
        var tientExt = faitTient(MAJ(p.nom), 'x-' + p.id, t, pxLon, pxLat);
        var nExt = espaceLettres(tientExt ? MAJ(p.nom) : p.id); // v0.80 : +1px entre lettres
        var fExt = tientExt ? t.etiquette : Math.max(7, Math.round(STYLES.pays.facteurCode * t.etiquette));
        var muetExt = p.id === 'ES-002'; // v0.29 : pas d'étiquette sur les Canaries
        // v0.41 : un pays extérieur ajouté à la sélection (Maj+clic) est
        // peint en teinte de sélection.
        var baseExt = sel[p.id] ? selectionnes[p.continent] : COULEURS[p.continent];
        var survExt = assombris[p.continent];
        // v0.80 : survol peint par le noyau (voir donneesRegions principal)
        if (survolNom === p.id) baseExt = survExt;
        // v0.74 : pays extérieur enclavé (Lesotho, Saint-Marin…) → 20 %
        // plus sombre que son hôte, à l'état courant de celui-ci.
        if (ENCLAVES_MONDE && ENCLAVES_MONDE[p.id]) {
          var chE = couleursHote('x-' + ENCLAVES_MONDE[p.id], sel, enSelection);
          baseExt = assombrir(chE.base); survExt = assombrir(chE.survol);
        }
        SURVOL_PAR_NOM['x-' + p.id] = survExt; // v0.80e : survol chirurgical
        regions.push({
          name: 'x-' + p.id,
          // v0.80c : FILET BLANC UNIFORME — les pays extérieurs portaient
          // borderWidth 0 : la frontière entre le pays affiché (niveau 1)
          // et ses voisins n'avait AUCUN filet. Ils portent désormais le
          // MÊME filet blanc (couleur et épaisseur) que les frontières
          // entre régions : TRAIT_NIVEAUX partout, tous niveaux.
          itemStyle: { areaColor: baseExt, color: baseExt, borderColor: THEME.contour, borderWidth: TRAIT_NIVEAUX, shadowColor: (THEME.ombre && THEME.ombre.couleur) || 'rgba(0,0,0,0)', shadowOffsetX: (THEME.ombre && THEME.ombre.dx) || 0, shadowOffsetY: (THEME.ombre && THEME.ombre.dy) || 0, shadowBlur: (THEME.ombre && THEME.ombre.flou) || 0 },
          emphasis: { disabled: true,
            itemStyle: { areaColor: survExt, color: survExt, borderColor: THEME.contour, borderWidth: TRAIT_NIVEAUX },
            label: { show: false },
          },
          // v0.83 : l'étiquette vit dans le scatter « noms-zones » au
          // CENTRE GÉOMÉTRIQUE — le label geo (centre de bbox ECharts)
          // est éteint, le texte (formatter) reste pour les tests.
          label: {
            show: false,
            formatter: nExt,
            fontSize: fExt, color: ctExt, fontWeight: STYLES.etiquette.fontWeight,
          },
        });
      });
    }
    return regions;
  }
  function donneesCarte() {
    var out = listeVue().map(function (p) {
      if (vue.type === 'monde') return { name: p.id, nom: p.nom, continent: p.continent, capitale: p.capital };
      // v7.32 : parent RÉEL de la zone (listeVue expose __parent en
      // secours de vue.parent) — l'infobulle des zones ajoutées par
      // bascule attribuait TOUTES les zones de la vue au parent de la vue.
      return { name: p.id, nom: p.nom, subdivision: vue.type,
        parent: (p.parent != null ? p.parent : vue.parent) };
    });
    // infobulles des subdivisions sœurs (leur nom seul) et des pays
    // extérieurs (leur nom seul)
    if (vue.type !== 'monde') {
      if (vue.soeurs) vue.soeurs.forEach(function (f) {
        if (f.__masquee) return; // v7.16 : pas de donnée carte pour une sœur masquée
        // v7.32 : parent réel de la sœur pour l'infobulle
        out.push({ name: 'c-' + f.id, nom: f.nom, contexte: true,
          parent: (f.__parent != null ? f.__parent : undefined) });
      });
      DATA.pays.forEach(function (p) {
        if (p.id !== vue.paysId && !(vue.paysIds && vue.paysIds.indexOf(p.id) !== -1)) {
          out.push({ name: 'x-' + p.id, nom: p.nom, exterieur: true });
        }
      });
    }
    return out;
  }
  // v0.80l : CAPITALES DE TOUS LES PAYS — ADMIN.capitales[a3] (générées par
  // gen-etiquettes.cjs : table de connaissances validée pour le niveau 1,
  // ville la plus peuplée du pays pour le niveau 2 et en repli). Affichées
  // dans toute vue descendue d'un pays (JAMAIS en vue monde).
