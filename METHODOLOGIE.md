# Méthodologie du screening biométhane France

Ce document explique la logique de fonctionnement de l'outil et justifie chaque
choix de design : ce que l'outil filtre, pourquoi, sur quelle donnée et sur
quelle source. Il est tenu à jour à chaque PR qui modifie une règle. Le plan de
versions est dans `BACKLOG.md`, les seuils dans `tools/screening_params.json`.

Dernière mise à jour : 24 septembre 2026 (PR #15, distance au réseau GRDF et zonages de raccordement).

---

## 1. À quoi sert l'outil

Identifier, parmi les sites biométhane et les cogénérations biogaz recensés en
France, ceux qui peuvent devenir des actifs de la plateforme Nautilus, selon
deux voies :

- **brownfield cogénération** : rachat ou partenariat sur une cogénération
  biogaz en fin de contrat électrique, convertie vers l'injection ;
- **brownfield injection** : rachat d'un site injectant déjà, avec son contrat
  de tarif en cours ou une bascule vers les certificats de production de
  biogaz (CPB).

L'outil ne remplace pas la qualification terrain. Il produit un univers
filtré, puis une shortlist, que l'équipe enrichit de sa connaissance propre
(registre équipe, étape 8 du backlog).

## 2. Données

| Jeu | Source | Millésime | Précision géographique | Champs clés |
|---|---|---|---|---|
| Points d'injection (855) | ODRÉ, `points-dinjection-de-biomethane-en-france` (NaTran / GRDF) | 04/09/2026 | Coordonnées du site | type de site, capacité GWh PCS/an, année de MES, réseau, PITD, site ouvert, procédé |
| Électricité biogaz (1 225) | ODRÉ, registre national des installations de production d'électricité (RTE, Enedis, ELD), filière Bioénergies, édition mensuelle | au 31/07/2026 | Centroïde de la commune (code INSEE) | code combustible, technologie, puissance kWé, régime, dates de MES et de raccordement, énergie annuelle glissante injectée, code EIC |

Rafraîchissement : `tools/build_datasets.py` (ODRÉ, gratuit, sans clé) puis
`tools/check_geo.py --apply`. Les identifiants ODRÉ des points d'injection
(`id_unique_projet`) sont stables entre millésimes (818 sur 818 retrouvés entre
janvier 2025 et septembre 2026).

Limites connues : pas de coordonnées de site pour les installations
électriques, pas de tracé de réseau gaz en open data, dates de fin de contrat
estimées (durée réglementaire ajoutée à l'année de MES, avenants non captés),
13 installations sans date de MES, 3 communes non géocodées, outre-mer écarté.

## 3. Cadre réglementaire pris en compte (été 2026)

Détail dans l'annexe réglementaire du 24/09/2026 (OneDrive Nautilus,
`Biomethane France/Roadmap/`). Ce qui pèse sur le design de l'outil :

1. **Fin du guichet ouvert.** Arrêté du 10 août 2026 : tarif d'achat réservé
   aux installations de moins de 13 GWh PCS/an jusqu'au 31/12/2026, puis
   abrogé. Appel d'offres simplifié annoncé pour 2027 (moins de 19,5 GWh).
   Conséquence : la taille d'un site n'est plus un critère d'éligibilité à un
   tarif, c'est un critère financier.
2. **Une cogénération convertie n'a jamais accès au tarif d'achat**
   (définition renforcée de « nouvelle installation », position de la CRE).
   Son revenu est molécule + CPB + garanties d'origine, ou un BPA.
3. **Coefficient CPB 0,95** (arrêté du 26/12/2025) pour une installation de
   15 à 30 ans dont la première injection intervient avant le 31/12/2029 ;
   0,8 sinon. Conséquence : l'âge du site et le calendrier deviennent des
   critères de screening (étape 4).
4. **Caractère agricole** (articles L. 311-1 et D. 311-18 du code rural) :
   50 % d'intrants agricoles et capital majoritairement agricole, sinon pas
   de permis de construire en zone A. Conséquence : la structure du capital
   est un critère de qualification (étapes 8 et 9), et Nautilus ne peut
   dépasser 49 %.

## 4. Filtres : règle, donnée, justification, source

### 4.1 Électricité biogaz : périmètre de base

- **Règle** : code combustible `B.MET` (biogaz de méthanisation), régime
  « En service », **quelle que soit la technologie déclarée**.
- **Donnée** : `codecombustible`, `regime` du registre national ODRÉ.
- **Justification** : le registre national classe les installations biogaz
  sous des technologies hétérogènes (« Cogénération à combustion » 471,
  « Autre » 267, vide 108, turbines, moteurs à piston…). Le code combustible
  est le seul champ qui identifie la méthanisation sans ambiguïté ; `B.EPU`,
  `B.STO` et `BAGAS` (STEP, ISDND, bagasse) et les combustibles solides ou
  déchets sont hors cible de conversion.
- **Historique** : la v1 et l'étape 2 travaillaient sur un extrait filtré sur
  la technologie « Cogénération » (591 sites Bioénergies). Ce filtre écartait
  plus de la moitié du parc méthanisation (966 sites `B.MET` au registre),
  dont l'essentiel des sites 2007-2014. Corrigé à l'étape 5 (PR #14).
- **Source** : profil du registre national au 31/07/2026 ; BC 14/09/2026
  (STEP à écarter, prudence biodéchets).

### 4.2 Cogénérations : puissance minimale

- **Règle** : puissance installée ≥ 250 kWé (plancher) ; paliers 500 kWé
  (cible) et 1 000 kWé (priorité) disponibles en filtre.
- **Donnée** : `puissance_kw`.
- **Justification** : la v1 filtrait sur l'énergie injectée (≥ 1 GWh él/an),
  donnée de production variable et parfois absente. La puissance est la
  donnée que la filière utilise pour juger une conversion et elle est
  renseignée sur tous les sites sauf deux.
- **Source** : BC 14/09/2026 (« au moins 250 kW, idéalement 350 à 400 » ;
  « au-dessus de 1 MW, tu te poses pas de question ; en dessous de 250 kW,
  pas viable ») ; AdlF 18/09/2026 (confirmation) ; GRDF, guide de
  conversion, novembre 2025 (seuil d'étude 250 à 300 kWé).
- **Effet** (registre au 31/07/2026) : 966 méthaniseurs, 620 en service à
  ≥ 250 kWé, 247 à ≥ 500, 127 à ≥ 1 000. (Extrait de juin 2026 : 323 / 80 /
  31.)

### 4.3 Injection : types de sites

- **Règle** : agricole autonome, agricole territorial, industriel
  territorial. Exclus : STEP, ISDND, déchets ménagers et biodéchets,
  power-to-méthane.
- **Donnée** : `site` du registre ODRÉ.
- **Justification** : modèle d'intrants compatible avec la thèse brownfield
  (effluents, CIVE, résidus). STEP et ISDND ont des intrants et une
  gouvernance publique hors périmètre ; les biodéchets portent un risque
  qualité (inertes, PFAS).
- **Source** : note stratégie v2 (mai 2026), sections 1.2 et 3.2 ; weekly
  26/03/2026 avec AdlF. Inchangé depuis la v1.

### 4.4 Injection : site ouvert, capacité ≥ 5 GWh/an, sans plafond

- **Règle** : `site_ouvert` vrai, capacité ≥ 5 GWh PCS/an, pas de maximum.
- **Donnée** : `site_ouvert`, `capacite_de_production_gwh_an`.
- **Justification du plancher** : sous 5 GWh (moins de 60 Nm³/h), un site ne
  porte pas les coûts fixes d'une reprise. BC : le TRI equity de 12 % n'est
  pas atteignable sur des petits sites.
- **Justification de la suppression du plafond** : le plafond 25 GWh de la
  v1 mesurait l'éligibilité au guichet ouvert, pas la taille idéale d'un
  actif. Depuis l'arrêté du 10/08/2026 ce critère n'existe plus. Un site
  sous contrat conserve son tarif jusqu'au terme et peut basculer en CPB
  sans indemnité avant fin 2027, quelle que soit sa taille. La taille
  redevient un critère financier, traité dans le score (étape 7), pas dans
  le périmètre.
- **Source** : arrêté du 10/08/2026 ; délibération CRE n° 2026-171 du
  28/07/2026 ; annexe réglementaire 24/09/2026, section 3.1. Décision AG
  24/09/2026.
- **Effet** : 569 sites en v1, 713 en v2 sur le registre de janvier 2025,
  746 sur celui de septembre 2026. Les sites ajoutés par la suppression du
  plafond dépassent 25 GWh (jusqu'à 268 GWh). Point ouvert : ces grandes
  unités sont dans le périmètre réglementaire, pas nécessairement dans la
  capacité d'achat de la plateforme (5 à 7 M€ par objet selon BC).

### 4.5 Zone test

- **Règle** : interrupteur restreignant aux régions Hauts-de-France, Grand
  Est et Normandie. Aucune pondération régionale dans le score.
- **Donnée** : `region`.
- **Justification** : AdlF veut faire les premiers tests terrain hors de sa
  zone d'intervention (Centre), sur des terrains vierges où il observe du
  dynamisme, pour qu'un échec ne se sache pas. C'est un choix de
  séquencement commercial, pas un jugement sur la qualité des sites. Un
  bonus régional (v1 : Bretagne 20 points, Pays de la Loire 18) aurait
  déformé la vue nationale.
- **Source** : AdlF 18/09/2026, section 8 des notes ; choix « filtre plutôt
  que score » proposé par Claude, validé par AG le 24/09/2026.
- **Effet** (registres de septembre 2026) : 298 sites d'injection et 310
  installations électriques biogaz du périmètre.

### 4.6 Tranches d'échéance de contrat

- **Règle** : l'échéance estimée (année de MES + durée réglementaire :
  15 ans injection, 20 ans cogé biogaz, 12 ou 15 ans gaz naturel) est classée
  en quatre tranches : ≤ 2026, 2027-2028, 2029-2030, > 2030. Filtre exclusif ;
  un site sans estimation est exclu quand une tranche est choisie.
- **Donnée** : `annee_mes` des deux registres ; durées documentées dans
  `config.js` (`echeance`). Tranches dans `screening_params.json`.
- **Justification** : BC 14/09/2026, section 7 : « combien arrivent en fin de
  tarif dans 1, 2, 5, 10 ans ; pas tous adressables tout de suite ». Les
  tranches suivent le calendrier réglementaire : fin du guichet (2026),
  passerelle CPB sans indemnité (fin 2027), butoir du coefficient 0,95 (fin
  2029).
- **Limite** : la durée de 20 ans est une hypothèse (BG16 ; BG11 et BG06
  prolongés par l'arrêté du 24/02/2017) ; avenants et renégociations non
  captés ; à confirmer site par site en entretien.

### 4.7 Coefficient CPB et fenêtre 0,95

- **Règle** : pour une cogénération biogaz avec année de MES, l'outil calcule
  l'âge à une année de conversion par défaut (2028) et en déduit le
  coefficient CPB estimé : 1 avant 15 ans, 0,95 entre 15 et 30 ans si la
  première injection intervient avant le 31/12/2029, 0,8 sinon. Il calcule
  aussi la fenêtre d'années où 0,95 est atteignable : de max(année courante,
  MES + 15) à min(2029, MES + 30). Filtre « 0,95 atteignable » / « 0,8
  seulement » ; colonne du tableau ; six colonnes CSV. Sans effet sur les
  points d'injection.
- **Donnée** : `annee_mes` du registre EDF OA ; paramètres dans
  `screening_params.json` (`cpb`).
- **Justification** : le coefficient fixe le nombre de CPB par MWh injecté,
  donc directement le revenu d'une conversion (16 % d'écart entre 0,95 et
  0,8). La date butoir borne le calendrier du pipeline brownfield.
- **Source** : arrêté du 26/12/2025 modifiant l'arrêté du 6 juillet 2024
  (CPB), délibération CRE n° 2025-235 du 10/10/2025 ; annexe réglementaire
  24/09/2026, section 3.4.
- **Effet** (périmètre v2, registre au 31/07/2026) : 161 sites avec 0,95
  atteignable, 459 hors d'atteinte (491 sites de moins de 15 ans en 2028,
  coefficient 1). Tranches d'échéance : ≤ 2026 : 8 ; 2027-2028 : 16 ;
  2029-2030 : 26 ; > 2030 : 570.
- **Limite** : le coefficient 1 pour une cogé convertie avant 15 ans est
  l'application de la règle générale, à confirmer ; l'année de conversion
  par défaut est un paramètre à valider avec AdlF.

### 4.8 Distance au réseau GRDF, injection la plus proche, zonages

- **Règle** : pour chaque installation électrique biogaz, distance minimale à
  vol d'oiseau entre le centroïde de sa commune et le tronçon GRDF en service
  le plus proche (réseaux propane exclus, rayon de recherche 15 km). Filtre
  par paliers ≤ 2 / ≤ 5 / ≤ 10 km ou « > 10 km / inconnue ». Sans effet sur
  les points d'injection. En complément : distance au point d'injection ODRÉ
  le plus proche, et appartenance à un zonage de raccordement biométhane
  (libellé, maturité, capacité maximale, capacité en attente).
- **Donnée** : « Cartographie du réseau GRDF en service » (opendata.grdf.fr,
  3,7 M de tronçons, 24/03/2025) via l'API d'agrégation ; registre ODRÉ des
  points d'injection ; ODRÉ « cartographie d'accès aux réseaux méthane
  renouvelable » (zonages du droit à l'injection, 15/12/2020). Script
  `tools/enrich_grid.py`, cache `tools/cache/grid_cache.json`.
- **Justification** : « le nerf de la guerre est la rentabilité en fonction du
  coût de raccordement » (AdlF 18/09) ; 4 km recommandés par GRDF pour une
  conversion, 4 à 5 km selon BC. La distance au réseau est le premier filtre
  physique après la puissance. Un point d'injection proche signale un réseau
  déjà ouvert au biométhane ; un zonage validé signale une capacité
  d'accueil étudiée par les opérateurs.
- **Source** : BC 14/09/2026 ; AdlF 18/09/2026 ; GRDF, guide de conversion
  (novembre 2025) ; délibération CRE n° 2019-242 (droit à l'injection).
- **Effet** (électricité biogaz, 1222 sites) : ≤ 2 km : 490 ; ≤ 5 km :
  771 ; ≤ 10 km : 1074 ; > 15 km ou zone ELD : 54. Périmètre v2 :
  352 sites à ≤ 5 km.
- **Limites** : distance depuis le centroïde de commune (± quelques km), pas
  depuis le site ; réseau GRDF seulement (les zones ELD ressortent
  « inconnues ») ; pas de pression ni de capacité du tronçon ; zonages de
  2020. C'est un critère de tri ; le coût réel vient de l'étude détaillée
  GRDF, site par site, sur la shortlist.

### 4.9 Ce qui n'est volontairement pas filtré

| Critère | Pourquoi pas de filtre dur | Traitement prévu |
|---|---|---|
| Structure du capital, caractère agricole | Nécessite Pappers (payant) | Étape 9, shortlist seulement |
| Intrants et C-score | Pas de donnée publique au niveau du site | Registre équipe, étape 8 |
| Régime ICPE, zonage PLU | Rapprochements incertains | Étape 10, site par site |

## 5. Principes de design

1. **Les seuils sont de la configuration, pas du code.** Ils vivent dans
   `tools/screening_params.json`, chargé au démarrage ; `config.js` porte une
   copie de secours. Changer un seuil est une PR d'une ligne.
2. **Périmètre d'abord, score ensuite.** Un filtre exclut ce qui ne peut pas
   fonctionner (taille, filière, statut). Un score classe ce qui reste. Ne
   jamais mettre dans le périmètre un critère qui relève d'un jugement
   (région, taille idéale).
3. **Une règle réglementaire n'entre dans l'outil qu'avec sa source et sa
   date.** Elle est retirée quand le texte change (exemple : plafond 25 GWh).
4. **Les données publiques restent lisibles telles quelles.** L'outil
   n'altère pas les registres ; il ajoute des colonnes calculées et des
   drapeaux, toujours identifiables comme tels.
5. **Tout état est partageable par URL.** Un lien reproduit exactement une
   vue ; les anciens paramètres restent acceptés.
6. **Aucun appel payant sans accord préalable.** Voir la section « Coûts et
   appels d'API » du backlog.
7. **Une PR par règle.** Chaque PR décrit la règle, sa source, la
   vérification et les chiffres avant/après.

## 6. Journal des décisions

| Date | Décision | Source | PR |
|---|---|---|---|
| 26/03/2026 | STEP hors cible ; prudence biodéchets ; 5 régions prioritaires | Weekly AdlF | script v1 |
| 12/06/2026 | Filtre prospection 1 : injection 5-25 GWh, cogé ≥ 1 GWh él/an | Weekly AdlF | #6 |
| 27/07/2026 | Échéances estimées (15 ans injection, 20 ans BG, 12/15 ans C13/C16), lien Google Maps | Run 1 | #3 |
| 14/09/2026 | Filtres BC : 250 / 500 / 1 000 kW, 4-5 km, fin de tarif par tranche, capital agricole, C-score | Réunion BC, AdlF, AG | backlog |
| 18/09/2026 | Zone test Nord, Est, Normandie ; AdlF identifie une dizaine de sites ; critère raccordement déterminant | Reprise biométhane France | backlog |
| 24/09/2026 | Annexe réglementaire : seuil 13 GWh, fin du guichet, coefficient 0,95, 51/49 agricole | Recherche AG / Claude | #9 |
| 24/09/2026 | Suppression du plafond 25 GWh ; puissance à la place de l'énergie ; zone test en filtre et non en score | AG | #10 |
| 24/09/2026 | Vue satellite, rayon, contrôle géométrique (règle des 2 km), millésimes en données | Port de biomethane-germany | #12 |
| 24/09/2026 | Tranches d'échéance BC ; coefficient CPB estimé et fenêtre 0,95 à conversion 2028 | Arrêté 26/12/2025, BC 14/09 | #13 |
| 24/09/2026 | Registres ODRÉ de septembre 2026 ; périmètre électricité biogaz lu sur le code combustible B.MET et non sur la technologie ; outre-mer écarté | Profil du registre national | #14 |
| 24/09/2026 | Distance au réseau GRDF (open data GRDF, exact au tronçon, mesuré au centroïde de commune), injection la plus proche, zonages de raccordement | BC 14/09, AdlF 18/09, GRDF | #15 |

## 7. Questions ouvertes

- **Résolu à l'étape 5.** Le parc ancien n'était pas sous-représenté au
  registre, il était écarté par le filtre « technologie = Cogénération » de
  l'extrait de juin 2026. Sur le registre complet, 161 sites du périmètre
  peuvent atteindre le coefficient 0,95 (contre 27), et 50 arrivent en fin de
  contrat estimée d'ici 2030 (contre 11). La lecture reste valable : 570 sites
  du périmètre ont une échéance après 2030, et la cible brownfield se définit
  aussi par l'arbitrage économique du producteur (sortie anticipée sans
  pénalité, coefficient 1 avant 15 ans).
- 127 méthaniseurs d'au moins 1 MWé au registre (62 en technologie « Autre »,
  24 sans technologie) contre « une poignée » selon BC : à qualifier avec AdlF
  (sites territoriaux, industriels, moteurs cumulés ?).

- 31 méthaniseurs ≥ 1 MWé au registre contre « une poignée » selon BC :
  sites territoriaux ou industriels inclus, moteurs cumulés, ou périmètre
  « achetable » plus étroit ? À trancher avec AdlF (liste exportable depuis
  l'app, filtre ≥ 1 000).
- Les 144 sites d'injection de plus de 25 GWh : dans la thèse brownfield ou
  hors capacité d'achat ? À trancher avec AdlF et JT (modèle).
- Pondération du score v2, année de conversion par défaut (2028), seuil
  d'exclusion distance (10 km) : session AdlF du 25/09/2026.
