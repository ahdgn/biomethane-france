# Méthodologie du screening biométhane France

Ce document explique la logique de fonctionnement de l'outil et justifie chaque
choix de design : ce que l'outil filtre, pourquoi, sur quelle donnée et sur
quelle source. Il est tenu à jour à chaque PR qui modifie une règle. Le plan de
versions est dans `BACKLOG.md`, les seuils dans `tools/screening_params.json`.

Dernière mise à jour : 24 septembre 2026 (PR #10, filtre prospection v2).

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
| Points d'injection (818) | Registre ODRÉ des installations de production de biométhane | 01/01/2025 | Coordonnées du site | type de site, capacité GWh PCS/an, année de MES, réseau, PITD, site ouvert |
| Cogénérations (1 002) | Registre EDF OA des installations sous obligation d'achat électricité | mi-2026 | Centroïde de la commune | filière, combustible, technologie, puissance kWé, statut, date de MES, énergie injectée |

Limites connues : pas de coordonnées de site pour les cogénérations, pas de
tracé de réseau gaz en open data, dates de fin de contrat estimées (durée
réglementaire ajoutée à l'année de MES, avenants non captés), 70 cogénérations
sans date de MES, 2 sans puissance.

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

### 4.1 Cogénérations : périmètre de base

- **Règle** : filière « Bioénergies », statut « En service », combustible non
  renseigné.
- **Donnée** : `filiere`, `statut`, `combustible` du registre EDF OA.
- **Justification** : le registre mélange toutes les cogénérations, y compris
  les centrales thermiques au gaz naturel. Seule la filière Bioénergies
  contient des méthaniseurs. Dans cette filière, le combustible n'est
  renseigné que pour le bois, les déchets ménagers ou industriels, la
  papeterie et le biogaz de STEP, tous hors cible de conversion. Un
  combustible vide correspond à la méthanisation agricole ou territoriale.
- **Source** : structure du registre (591 Bioénergies, dont 527 sans
  combustible) ; BC 14/09/2026 (STEP à écarter, prudence biodéchets).
  Règle héritée de la v1 (weekly 12/06/2026).

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
- **Effet** : 522 méthaniseurs en service, 323 à ≥ 250 kWé, 80 à ≥ 500,
  31 à ≥ 1 000.

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
- **Effet** : 569 sites en v1, 713 en v2. Les 144 sites ajoutés dépassent
  25 GWh (jusqu'à 268 GWh). Point ouvert : ces grandes unités sont dans le
  périmètre réglementaire, pas nécessairement dans la capacité d'achat de la
  plateforme (5 à 7 M€ par objet selon BC).

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
- **Effet** : 287 sites d'injection et 169 cogénérations (Grand Est 113,
  Normandie 37, Hauts-de-France 19).

### 4.6 Ce qui n'est volontairement pas filtré

| Critère | Pourquoi pas de filtre dur | Traitement prévu |
|---|---|---|
| Distance au réseau gaz (4 à 5 km) | Pas de tracé en open data ; cogés au centroïde de commune | Proxy à l'étape 6 (commune desservie, distance au point d'injection le plus proche), colonne et non exclusion |
| Fenêtre d'échéance et âge du site (coefficient 0,95) | Règle claire, donnée incertaine (70 cogés sans MES) | Étape 4, drapeaux et tranches |
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

## 7. Questions ouvertes

- 31 méthaniseurs ≥ 1 MWé au registre contre « une poignée » selon BC :
  sites territoriaux ou industriels inclus, moteurs cumulés, ou périmètre
  « achetable » plus étroit ? À trancher avec AdlF (liste exportable depuis
  l'app, filtre ≥ 1 000).
- Les 144 sites d'injection de plus de 25 GWh : dans la thèse brownfield ou
  hors capacité d'achat ? À trancher avec AdlF et JT (modèle).
- Pondération du score v2, année de conversion par défaut (2028), seuil
  d'exclusion distance (10 km) : session AdlF du 25/09/2026.
