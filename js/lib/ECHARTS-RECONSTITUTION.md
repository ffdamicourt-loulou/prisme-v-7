# echarts.min.js — reconstitution

Le connecteur GitHub ne peut pas envoyer en un morceau un fichier contenant des lignes > 64 Ko (echarts.min.js est minifié sur quasi une seule ligne). La bibliothèque est donc découpée en 23 parts de 50 000 octets, octet/octet identiques à la référence (1 121 882 octets au total, vérifié par reconstitution locale).

Pour reconstituer, à la racine du dépôt :

    cat js/lib/echarts.min.js.part-* > js/lib/echarts.min.js

(à faire une fois après le clonage ; vérification : 1 121 882 octets)
