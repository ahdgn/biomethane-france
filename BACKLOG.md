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

## Étape 4 — feat : fenêtre CPB 0,95 et tranches d'échéance

- [ ] Âge de l'installation à une date de conversion paramétrable (défaut 2028)
- [ ] Drapeau « coefficient 0,95 possible » : 15 ≤ âge ≤ 30 ans à la conversion
      et conversion avant le 31/12/2029, donc MES entre 1997 et 2014 pour une
      conversion en 2029
- [ ] Tranche d'échéance de contrat : ≤ 2026, 2027-2028, 2029-2030, > 2030
- [ ] Popup, tableau et CSV enrichis

Assurance : élevée sur la règle (arrêté du 26/12/2025), moyenne sur la donnée
(70 cogés sans date de MES ; durée BG 20 ans = hypothèse, avenants non captés).

## Étape 5 — data : rafraîchissement des registres

- [ ] Registre ODRÉ injection : millésime 01/01/2025 → dernier millésime 2026
      (ETL à écrire dans `tools/build_injection_json.py`, aujourd'hui absent)
- [ ] Registre cogé : ré-extraction et re-géocodage
- [ ] Date d'extraction écrite dans les données (SOURCE_NOTE automatique)

Assurance : moyenne-haute. Mécanique, mais les identifiants ODRÉ peuvent
changer entre millésimes : vérifier la stabilité de `id_unique_projet`.

## Étape 6 — feat : desserte gaz et distance au réseau (proxy)

- [ ] Jointure « commune desservie en gaz » (open data GRDF / ELD) par code
      INSEE : oui / non / inconnu
- [ ] Distance à vis d'oiseau au point d'injection ODRÉ le plus proche et au
      PITD/PITP : ≤ 5 km, 5-10 km, > 10 km
- [ ] Filtres et colonnes correspondants

Assurance : moyenne. C'est un proxy : une commune desservie n'implique pas une
canalisation à moins de 5 km du site, et les cogés sont géocodées au centroïde
de commune. Les tracés GRDF ne sont pas en open data ; ratios de coût au km
attendus d'AdlF. À remplacer par les études GRDF site par site sur la shortlist.

## Étape 7 — feat : score v2 /100 et export Excel shortlist

- [ ] Port de `qualification_sites.py` (OneDrive, 10/06/2026) dans
      `tools/qualify_v2.py`, lecture des seuils dans `screening_params.json`
- [ ] Pondération proposée, à valider avec AdlF : puissance 25, fenêtre
      d'échéance 25, fenêtre 0,95 15, desserte gaz 20, type et intrants 15 ;
      région neutre
- [ ] Sorties : `Nautilus_Qualification_Sites_v2.xlsx` (top 50 cogé, top 50
      injection, zone test) copié dans `Biomethane France/Screening/`
- [ ] Filtre prospection v2 = score ≥ seuil

Assurance : moyenne. La pondération est une décision d'équipe ; le classement
sera contrôlé sur les sites connus d'AdlF (dizaine de sites, action du 18/09).

## Étape 8 — feat : registre équipe Airtable et panneau Qualifier

- [ ] Port de `js/qualify.js`, `REGISTER.md`, `tools/sync_register.py` depuis
      `biomethane-germany`
- [ ] Clé : `id_unique_projet` (injection) ou nom d'installation (cogé) ;
      champs : projet, statut relation, tags équipe (on connaît l'exploitant,
      déjà travaillé sur le site, élus connus), difficulté raccordement,
      part agricole du capital, régime ICPE, intrants, confiance, notes
      catégorisées (intrants, opérateur gaz, permis, politique locale)
- [ ] Base Airtable « Biomethane France Screening tool » à créer et semer

Assurance : moyenne. Mécanique validée en Allemagne le 18/09 ; dépend de la
création de la base (connecteur Airtable en écriture).

## Étape 9 — feat : enrichissement Pappers (étage 2)

- [ ] Port de `etage2_succession.py` : SIREN, forme, dirigeants, âge, signal de
      succession, résultat net ; ajout de la structure du capital (part
      agricole) quand les bénéficiaires effectifs sont lisibles
- [ ] Sur la shortlist v2 uniquement (quota API)

Assurance : moyenne. Fiabilité du rapprochement nom de site → SIREN notée
HAUTE / MOYENNE / FAIBLE, à revoir manuellement sur la shortlist.

## Étape 10 — feat : régime ICPE et zonage PLU

- [ ] Base Géorisques ICPE (rubrique 2781) : régime autorisation /
      enregistrement / déclaration, jointure par commune et nom
- [ ] Zonage PLU du site via `cadastre-nautilus` (zone A, N, U, AU)

Assurance : moyenne-faible. Rapprochements incertains, à valider site par site.

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
