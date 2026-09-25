# Backlog — Biométhane France, screening tool v2

Sources : reprise biométhane France du 18/09/2026 (AG, AdlF, JT), enseignements
Benoît Condoumi du 14/09/2026, annexe réglementaire du 24/09/2026
(`Biomethane France/Roadmap/2026-09-24_Annexe_reglementaire_Biomethane_France.md`),
retours de l'équipe allemande sur `biomethane-germany` (09/09 et 21/09/2026).

Principe : une PR par étape, du plus simple au plus incertain. Chaque PR décrit
la règle appliquée, sa source, la vérification faite et les chiffres avant/après.
Les seuils vivent dans `tools/screening_params.json`, jamais dans le code.
Les exports Excel destinés à AdlF sont copiés dans
`Biomethane France/Screening/` avec un suffixe de version.
Chaque PR qui modifie une règle met à jour `METHODOLOGIE.md` (règle, donnée,
justification, source, journal des décisions).

## Ce qui change de v1 à v2 (cadre réglementaire, été 2026)

- Le guichet ouvert est réservé aux installations de moins de 13 GWh PCS/an
  jusqu'au 31/12/2026, puis abrogé. Le critère « < 25 GWh = guichet » du filtre
  prospection 1 est obsolète.
- Une cogénération convertie n'aura jamais de tarif d'achat : revenu =
  molécule + CPB (coefficient 0,95 si 15 à 30 ans et première injection avant
  le 31/12/2029, sinon 0,8) + GO ou BPA.
- Le caractère agricole (50 % d'intrants agricoles, capital majoritairement
  agricole) conditionne le permis de construire en zone A.

## Étape 1 — chore : backlog v2 + paramètres en config (cette PR)

- [x] Ce fichier
- [x] `tools/screening_params.json` : seuils BC / AdlF (puissance, distance,
      tranches d'échéance, fenêtre coefficient 0,95, zone test)
- [x] README : pointeur vers le backlog et la note réglementaire

Assurance : très élevée. Aucun changement de comportement.

## Étape 2 — fix : périmètre cogé et filtre prospection v2 (PR #10)

- [x] Cogé : filière Bioénergies, en service, combustible non renseigné
      (méthanisation), puissance ≥ 250 kW (plancher BC) ; filtre segmenté
      ≥ 250 / ≥ 500 / ≥ 1 000 kWé
- [x] Injection : suppression du plafond 25 GWh ; types agricoles et
      industriel territorial, site ouvert, ≥ 5 GWh/an
- [x] Interrupteur « zone test » (Hauts-de-France, Grand Est, Normandie),
      sans pondération régionale
- [x] Bouton ⓘ mis à jour ; l'app lit `tools/screening_params.json`
      (valeurs de secours dans `config.js`)
- Chiffres (registres au 01/01/2025 et mi-2026) : prospection v1 = 569
  injection + 325 cogé ; v2 = 713 injection (+144 sites > 25 GWh) + 323 cogé
  (≥ 250 kWé ; 80 à ≥ 500, 31 à ≥ 1 000). Zone test : 287 injection, 169 cogé
  (Grand Est 113, Normandie 37, Hauts-de-France 19).
- À vérifier avec AdlF : 31 cogés ≥ 1 MWé au registre contre « une poignée »
  selon BC ; 2 cogés sans puissance renseignée.

Assurance : élevée. Données déjà présentes (`puissance_kw`, `filiere`,
`combustible`). Vérification : comptages avant/après (ci-dessus), app
ouverte en local, liens partagés v1 (`p=1`) toujours acceptés.

## Étape 3 — feat : apports faciles de l'outil allemand (PR #12)

- [x] Vue satellite (Esri World Imagery, sans clé), bascule Carte / Satellite
- [x] Recherche par rayon : lien « ⌖ 50 km autour » dans chaque popup, curseur
      5-150 km, cercle et zoom qui suivent le geste, URL partageable (`rad=`)
- [x] Contrôle géométrique : `tools/check_geo.py` teste chaque site contre les
      contours des régions (`tools/geo/regions.geo.json`, france-geojson / IGN
      Admin Express, licence ouverte). Résultat : injection 817/818 dans la
      bonne région (1 sans coordonnées) ; cogé 995/1002, 6 sans coordonnées,
      1 centroïde en mer (Perros-Guirec, thermique) dont les coordonnées ont
      été retirées. Aucune région corrigée.
- [x] Millésimes dans `data/meta.json`, lus par l'app pour la note de source
      (ODRÉ 01/01/2025, EDF OA 03/06/2026) ; à écrire par l'ETL à l'étape 5
- Déjà en place côté France : lien Google Maps par site (Run 1, 27/07/2026)

Assurance : très élevée. Code porté de l'outil allemand ; contrôle géométrique
sans surprise. Vérification : app en local, rayon 50 km autour de Loudéac
(28 injection, 15 cogé), bascule satellite, réinitialisation.

## Étape 4 — feat : fenêtre CPB 0,95 et tranches d'échéance (PR #13)

- [x] Âge de l'installation à l'année de conversion par défaut (2028, paramètre)
      et coefficient CPB estimé : 1 avant 15 ans, 0,95 entre 15 et 30 ans avec
      conversion avant le 31/12/2029, 0,8 sinon
- [x] Fenêtre « 0,95 atteignable » : première année = max(année courante,
      MES + 15), dernière = min(2029, MES + 30) ; atteignable si première ≤
      dernière (soit MES entre 1996 et 2014)
- [x] Tranches d'échéance lues dans `screening_params.json` (≤ 2026,
      2027-2028, 2029-2030, > 2030) ; anciens liens `w=echue|2026-2029|2030+`
      convertis
- [x] Filtre « Coefficient CPB » (tous / 0,95 atteignable / 0,8 seulement),
      popup, colonne du tableau, 6 colonnes CSV
- Chiffres (périmètre v2, 323 cogés biogaz ≥ 250 kWé, toutes avec date de
  MES) : 0,95 atteignable pour **27 sites** seulement ; 296 hors d'atteinte,
  dont 300 sites qui auraient un coefficient 1 en 2028 parce qu'ils ont moins
  de 15 ans. Tranches d'échéance (MES + 20 ans) : ≤ 2026 : 1 ; 2027-2028 : 2 ;
  2029-2030 : 8 ; > 2030 : 312.
- **Constat de l'étape 4, expliqué à l'étape 5** : l'extrait de juin 2026
  (technologie « Cogénération ») écartait l'essentiel des sites 2007-2014. Sur
  le registre complet, 161 sites du périmètre peuvent atteindre 0,95 et 50
  arrivent en fin de contrat estimée d'ici 2030. La lecture « arbitrage
  économique du producteur » reste valable pour les 570 sites à échéance après
  2030 (sortie anticipée sans pénalité, coefficient 1 avant 15 ans).

Assurance : élevée sur la règle (arrêté du 26/12/2025), moyenne sur la donnée
(durée BG 20 ans = hypothèse, avenants non captés ; coefficient 1 avant 15 ans
à confirmer pour une cogé convertie). Vérification : comptages Python = app,
popup, tableau, liens v1.

## Étape 5 — data : rafraîchissement des registres (PR #14)

- [x] `tools/build_datasets.py` : les deux jeux téléchargés depuis ODRÉ (gratuit,
      sans clé). Injection : 855 sites au 04/09/2026 (818 → 855, identifiants
      stables 818/818, 37 nouveaux, 53 capacités révisées, 16,4 TWh/an).
- [x] Électricité biogaz : registre national des installations de production
      d'électricité, filière Bioénergies, édition au 31/07/2026 (mensuelle) :
      1 225 installations en métropole (agrégats < 36 kW et outre-mer écartés),
      géocodées au centroïde de commune par code INSEE (3 non géocodées).
      Remplace l'extrait « radar » de juin 2026 (`build_cogen_json.py` supprimé).
- [x] **Périmètre lu sur le code combustible B.MET, plus sur la technologie.**
      L'extrait de juin filtrait « technologie = Cogénération » et écartait plus
      de la moitié du parc méthanisation : 966 sites B.MET au registre contre
      591 Bioénergies dans l'extrait ; périmètre v2 620 sites (contre 323),
      dont ≥ 500 kWé 247 (80), ≥ 1 MWé 127 (31), zone test 310 (169) ;
      0,95 atteignable 161 (27) ; échéances ≤ 2026 : 8, 2027-28 : 16,
      2029-30 : 26, > 2030 : 570. Le constat de l'étape 4 est expliqué.
- [x] Types de site renommés : « Élec. biogaz — méthanisation », « Élec. biogaz
      — STEP / ISDND », « Élec. bioénergies — autres combustibles » ; les cogés
      gaz naturel (thermique) ne sont plus chargées. Colonnes CSV : puissance,
      code combustible, technologie.
- [x] `data/meta.json` écrit par l'ETL (millésimes, dates de traitement),
      note de source de l'app mise à jour.

Assurance : élevée. Vérification : comptages Python = app, contrôle
géométrique 1 222/1 225 (3 sans coordonnées, 0 hors région), 540 des 554 sites
Bioénergies de l'extrait de juin retrouvés (14 absents : agrégats, thermiques,
outre-mer, sites sortis du registre).

## Étape 6 — feat : distance au réseau GRDF, injection la plus proche, zonages (PR #15)

Mieux que prévu : les tracés du réseau de distribution GRDF **sont** en open
data (« Cartographie du réseau GRDF en service », 3,7 M de tronçons, licence
ouverte). Le proxy « commune desservie » n'a plus lieu d'être.

- [x] `tools/enrich_grid.py` : pour chaque installation électrique biogaz,
      distance minimale à vol d'oiseau au tronçon GRDF en service le plus
      proche (API opendata.grdf.fr, réseaux propane exclus, rayon 15 km, cache
      `tools/cache/grid_cache.json`) ; distance au point d'injection ODRÉ le
      plus proche (haversine) ; zonage de raccordement biométhane (ODRÉ,
      cartographie d'accès aux réseaux, 1 289 zonages, décembre 2020) en point
      dans polygone, pour les deux bases
- [x] Filtre « Réseau GRDF (distance) » : ≤ 2 / ≤ 5 / ≤ 10 km / > 10 km ou
      inconnue, paliers dans `screening_params.json` ; popup, colonne
      « Réseau (km) » triable, 7 colonnes CSV
- Chiffres (électricité biogaz, 1222 sites géocodés) : distance GRDF connue
  1168 ; ≤ 2 km : 490 ; ≤ 5 km : 771 ; ≤ 10 km : 1074 ; > 15 km ou
  zone ELD : 54. Périmètre prospection v2 (620) : 352 sites à ≤ 5 km,
  26 au-delà de 15 km ; zone test à ≤ 5 km : 174. Zonage de
  raccordement renseigné : 1059 installations électriques (1059 dans
  un zonage validé), 835 points d'injection.

Assurance : moyenne-haute. La distance est exacte au tronçon près, mais
mesurée depuis le centroïde de la commune (± quelques km) ; les zones ELD
(Strasbourg, Bordeaux, Grenoble…) apparaissent « inconnues ». Tri, pas
chiffrage : l'étude détaillée GRDF reste indispensable sur la shortlist. Le
jeu zonages date de 2020 (à surveiller pour une réédition).

## Étape 7 — feat : score v2 /100 et export Excel shortlist (PR #16)

- [x] `tools/qualify_v2.py` remplace `qualification_sites.py` (OneDrive,
      10/06/2026) : pondérations et seuils de priorité dans
      `screening_params.json` (`score_v2`), grilles par critère dans le script
      et dans la feuille « Méthodologie » du classeur
- [x] Électricité biogaz (620 sites du périmètre) : puissance 25, fenêtre
      d'échéance 25, coefficient CPB 15, réseau GRDF 20, facteur de charge 15
      (proxy d'exploitation en attendant les intrants) ; région 0
- [x] Injection (746 sites) : capacité 30, tarif restant 35, type 20,
      augmentation prévue 15
- [x] Priorités calibrées par base pour A ≈ 13 % des sites scorés : élec.
      A ≥ 75 / B ≥ 60 / C ≥ 45 ; injection A ≥ 92 / B ≥ 85 / C ≥ 75.
      Résultat : élec. A 78, B 259, C 225, D 58 (zone test : A 30, B 130) ;
      injection A 94, B 243, C 193, D 216
- [x] Score, priorité et détail dans les données de l'app : filtre
      « Score v2 · priorité » (A / A+B / A+B+C, URL `pr=`), popup, colonne
      « Score » triable, 3 colonnes CSV
- [x] Classeur `Nautilus_Qualification_Sites_v2_2026-09-24.xlsx` dans
      `Biomethane France/Screening/` (OneDrive) : Méthodologie, Top 50 élec.,
      Top 50 injection, Top 30 zone test, listes complètes scorées, colonnes
      Contact / Statut prospection / Commentaires AdlF vides

Assurance : moyenne. La pondération est une proposition ; à contrôler sur
la dizaine de sites qu'AdlF identifiera (action du 18/09). Limite visible dans
le top : des unités territoriales ou de déchets ménagers (AMETYST Montpellier,
IDEX Amiens) scorent haut sur la taille ; le type d'intrants viendra du
registre équipe (étape 8).

## Étape 8 — feat : registre équipe Airtable et panneau Qualifier (PR #17)

- [x] Base Airtable **« Biomethane France Screening tool »** (`app2bwaGaaTnIBUVq`,
      table Sites `tblbkofITxXCYaptN`) créée le 24/09/2026, vide. Clé = code
      EIC (élec. biogaz) ou `id_unique_projet` (injection). Champs : base,
      nom, commune, projet, statut relation, tags équipe, difficulté
      raccordement, part agricole du capital, régime ICPE, intrants,
      confiance, cinq notes classées (intrants, opérateur gaz, permis,
      politique locale, libres). Schéma dans `REGISTER.md`.
- [x] `js/qualify.js` : panneau latéral « ✎ Qualifier » depuis chaque fiche
      (identité publique + score + réseau + coefficient, formulaire Airtable
      pré-rempli). `tools/sync_register.py` : Airtable → `data/pipeline.json`.
- [x] App : halo ambre pour les sites du pipeline (projet renseigné),
      interrupteur « Pipeline Nautilus seulement », filtre « Statut de
      relation », popup (projet, relation, connaissance équipe, capital,
      ICPE, intrants, notes), 4 colonnes CSV (clé, projet, statut, tags).
- [ ] **À faire par Ahmed (une fois)** : créer le formulaire partagé dans la
      table Sites et coller son lien dans `REGISTER_FORM_URL` (`js/config.js`),
      voir REGISTER.md. Tant que le lien est vide, le panneau explique que le
      formulaire n'est pas branché.
- [ ] Premières fiches : les sites qu'AdlF connaît (dizaine, action du 18/09)
      et les 30 A de la zone test, à qualifier depuis l'app.

Assurance : moyenne-haute. Mécanique identique à l'outil allemand (validée le
18/09) ; vérification en local avec une fiche de test (halo, filtres, popup,
panneau), retirée avant commit. Le registre reste vide tant que l'équipe ne
l'alimente pas.

## Étape 9 — feat : enrichissement Pappers (étage 2)

- [ ] Port de `etage2_succession.py` : SIREN, forme, dirigeants, âge, signal de
      succession, résultat net ; ajout de la structure du capital (part
      agricole) quand les bénéficiaires effectifs sont lisibles
- [ ] Sur la shortlist v2 uniquement (quota API)

Assurance : moyenne. Fiabilité du rapprochement nom de site → SIREN notée
HAUTE / MOYENNE / FAIBLE, à revoir manuellement sur la shortlist.

## Étape 10 — feat : géocodage ICPE, régime, recalcul des distances (PR #22)

Étape élargie (décision AG 24/09) : la base ICPE sert d'abord à **positionner
les installations** (le centroïde de commune faussait liens, marqueurs et
distances), puis à lire le régime.

- [x] Source : Géorisques, base des installations classées, couche WFS BRGM
      `ms:InstallationsClassees` (mapsref.brgm.fr, licence ouverte, édition
      2026 ; l'API REST Géorisques était indisponible le 24/09). Filtre
      rubrique 2781 (méthanisation) : 904 installations dans
      840 communes (`tools/cache/icpe_2781.json`).
- [x] `tools/geocode_icpe.py` : rapprochement par code INSEE puis similarité de
      nom ; position Lambert 93 convertie en WGS84 ; `lat_commune` /
      `lon_commune` conservés, `geo_precision` = « site (ICPE) », champ `icpe`
      (nom, régime, adresse, SIRET, code AIOT, fiche, confiance).
      **`--restore` remet le centroïde** ; tag git `v2-etapes-1-8` = point de
      retour.
- [x] Résultat sur 966 méthaniseurs (B.MET) : 390 positionnés
      (340 candidat unique dans la commune, 25 par nom, 25
      ambigus), 576 sans ICPE 2781 dans leur commune (centroïde conservé).
      Régimes : Enregistrement 284, Autorisation 106.
- [x] Distances GRDF recalculées depuis la vraie position (390 sites) :
      périmètre v2 à ≤ 5 km 348 (avant 352) ; score v2
      recalculé, priorités A : 78 (avant 78) ; nouveau classeur daté.
- [x] Popup (position ICPE, régime, fiche Géorisques), 4 colonnes CSV,
      classeur (régime, nom ICPE, confiance, précision géo).
- [ ] Zonage PLU du site via `cadastre-nautilus` : reporté (position réelle
      désormais disponible pour le faire site par site sur la shortlist).
- [ ] Complément OpenStreetMap pour les sites sans ICPE : à évaluer (Overpass
      indisponible le 24/09).

Assurance : moyenne-haute sur la position (candidat unique dans la commune =
cas majoritaire), moyenne sur les cas ambigus (confiance affichée), le régime
suit le rapprochement. À contrôler sur la shortlist avec les liens Google Maps
et la fiche Géorisques.

## Étape 11 — UX palier 1 : correctifs et gestes du quotidien

Audit du 25/09/2026 (code + mesures Playwright desktop / portable / mobile).
Palier « le plus simple d'abord » : aucune refonte, aucune nouvelle donnée.

- [x] **Popup mobile invisible** : la feuille basse était un `position: fixed`
      dans un calque Leaflet transformé (calculée hors écran, rect top −396 px).
      Le résumé du site est désormais rendu dans le body (`openSheet`, js/map.js),
      au-dessus du panneau bas ; la popup Leaflet reste sur desktop.
- [x] **Filtrage plus fluide** : curseurs d'année debounce (160 ms, comme le
      rayon) et popups construites à l'ouverture (`bindPopup(fn)`). Mesures :
      bascule prospection 240-570 ms → 65-130 ms ; 10 crans de curseur
      2 775 ms → < 5 ms (le filtrage suit après relâchement).
- [x] **Score visible** : colonne Score juste après Projet ; tri par défaut
      score décroissant quand le filtre prospection est actif (capacité sinon),
      le tri choisi par l'utilisateur prime ; Région et Statut masquées sous
      1 300 px.
- [x] **Vocabulaire** : plus de chemin de fichier ni de statut interne dans
      les libellés ; explications du score et de la distance réseau derrière
      un bouton ⓘ (barre de filtres 1 777 → 1 566 px).
- [x] **Lien direct vers un site** : `#…&site=<id>` ouvre la fiche et zoome ;
      bouton « Copier le lien » dans la fiche (filtres inclus).
- [x] **Recherche** élargie au département et à la clé registre (code EIC ou
      id ODRÉ, celle du classeur Excel).
- Ménage : clé registre calculée une fois (`d.key`, `CONFIG.siteKey`), seuil
  mobile partagé (`CONFIG.isMobile`), règles CSS mortes retirées.

Assurance : élevée. Vérification Playwright (Chromium) : 30 contrôles
automatisés, desktop 1440, portable 1280, mobile 390, lien direct ; aucune
erreur console. Suite proposée (palier 2) : présélections « Vue screening » /
« Shortlist zone test », regroupement des filtres avec section Avancé repliée,
carte sans clustering sous ~400 sites, KPI orientés screening, iframe Airtable
chargée seulement en mode Qualifier.

## Étape 12 — UX palier 2 : présélections, filtres regroupés, carte et fiche au service du tri

Suite de l'audit du 25/09/2026. Réorganisation de l'existant, sans nouvelle
donnée ni nouvelle règle.

- [x] **Présélections** en tête de la barre : « Vue screening » (prospection),
      « Shortlist zone test » (prospection + zone + A), « Élec. ≤ 5 km du
      réseau » (prospection + base élec. + ≤ 5 km). Un clic au lieu de cinq ;
      second clic = retour à l'état neutre ; l'URL reste le partage.
- [x] **Filtres regroupés** en quatre sections : Périmètre et priorité,
      Géographie, Élec. biogaz seulement, Avancé (repliée, dépliée si un lien
      y met un filtre). Un filtre élec. actif avec l'injection affichée
      déclenche un avis et un lien « n'afficher que l'élec. biogaz »
      (fin des « 1 071 sites » pour « ≥ 1 MWé »). Barre : 1 566 → 1 263 px.
- [x] **Carte** : sous 400 sites positionnés, plus de clustering (chaque site
      de la shortlist visible au zoom national) ; couleur des marqueurs par
      priorité du score dès que la prospection est active (échelle une teinte
      navy → teal → bleu clair, gris D, hors périmètre estompé ; palette
      validée pour la vision des couleurs), bascule Type / Priorité dans la
      légende ; taille des losanges élec. en kWé (GWh à pleine charge) et non
      plus en GWh électriques injectés.
- [x] **KPI screening** quand la prospection est active : sites du périmètre,
      priorité A (· B), élec. ≤ 5 km du réseau, au pipeline (· évalués).
- [x] **Fiche** : iframe Airtable chargée seulement en mode Qualifier (bouton
      « ✎ Qualifier ce site » en lecture) ; la colonne principale se resserre
      au lieu d'être recouverte, le tableau reste visible ; navigation
      précédent / suivant (et flèches clavier) dans la liste filtrée, ligne
      surlignée, carte recentrée sans popup.
- [x] **Analyse** : « Échéances de contrat estimées » (par tranche, empilé par
      base) et « Priorités du score v2 » remplacent le top 10 départements.

Assurance : élevée. Vérification Playwright : 34 contrôles palier 2 + 30
contrôles palier 1 (régression), desktop, portable, mobile, lien partagé ;
aucune erreur console ; comptages inchangés. Palier 3 (si l'usage le
justifie) : registre déclaratif des filtres, test de fumée en CI, données
allégées, mode terrain mobile.

## Étape 13 — chore : test de fumée en CI (palier 3, point 14 de l'audit)

- [x] `tests/smoke.js` (Playwright + Chromium, serveur statique intégré) :
      18 contrôles en une minute. Les comptages attendus sont lus dans
      `data/*.json`, jamais recopiés : total, périmètre prospection v2 = sites
      scorés (invariant avec `tools/qualify_v2.py`), priorité A, base élec.
      Gestes rejoués : présélection, tri par score, popup depuis le tableau,
      fiche (sans iframe en lecture, `site=` dans l'URL), navigation, onglet
      Analyse sans graphique vide, export CSV (en-tête + une ligne par site,
      BOM), lien direct, feuille mobile. Aucune erreur console tolérée.
- [x] `.github/workflows/smoke.yml` : à chaque PR et sur `main`
      (`npm ci`, Chromium, `npm test`). `package.json` + lockfile, Playwright
      en dépendance de développement seulement : l'application reste sans build.
- [x] README : section « Tests ».

Assurance : très élevée. Aucun changement de comportement. Vérification :
18/18 en local ; un contrôle en échec fait sortir le script en erreur (vu
pendant l'écriture, sur un filtre replié).

Points 15 et 16 de l'audit, parqués avec leur mesure :
- Alléger les données : GitHub Pages compresse déjà ; élec. biogaz 133 kB
  compressés aujourd'hui, 108 kB une fois les champs inutilisés retirés.
  Un quart de seconde sur une connexion moyenne : pas rentable.
- Mode terrain mobile (fiche plein écran, liste par distance à ma position) :
  à décider quand l'équipe aura réellement utilisé le téléphone sur site.

## Coûts et appels d'API

Règle : aucun appel payant sans accord préalable d'Ahmed, avec le nombre
d'appels et le coût estimé annoncés avant le lancement.

| Ressource | Étapes | Coût |
|---|---|---|
| Registre ODRÉ, registre EDF OA, geo.api.gouv.fr, open data GRDF, Géorisques, cadastre Etalab | 4, 5, 10 | Gratuit |
| Fonds de carte Esri (gris, satellite) | 3 | Gratuit sans clé, usage léger |
| GitHub, GitHub Pages | toutes | Gratuit (dépôt public) |
| Airtable (base registre) | 8 | Plan existant, pas de coût marginal |
| **Pappers API** (SIREN, dirigeants, bénéficiaires effectifs, comptes) | **9** | **Payant, facturé à l'appel (crédits). Étage 2 v1 du 10/06/2026 déjà passé par là. Limité à la shortlist ; accord explicite avant chaque lot** |
| Tracés de réseau GRDF / Natran | parqué | Payant ou sur demande, décision après les ratios d'AdlF |

## Parqués

- [ ] Tracés de réseau GRDF / Natran (payant ou sur demande) : décision après
      les ratios d'AdlF
- [ ] Carte par zones colorées pour les investisseurs (exhibit de deck, pas de
      sites précis)
- [ ] Notes dictées et classées automatiquement (demande Daniel, 21/09)
- [ ] Contrôle d'accès : GitHub Pages reste public ; rehébergement derrière
      Cloudflare Access si l'outil devient propriétaire
