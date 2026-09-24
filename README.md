# Biométhane France — Portail de suivi

Cartographie et analyse des **points d'injection de biométhane** (registre
ODRÉ, 855 sites au 04/09/2026) et des **installations de production
d'électricité à partir de biogaz** (registre national ODRÉ, filière Bioénergies,
1 225 installations au 31/07/2026), cibles de conversion vers l'injection.

Application statique — aucun backend, aucune dépendance externe au chargement
(librairies et fontes vendorisées ; seuls les fonds de carte Esri sont appelés en ligne).

## Lancer en local

```bash
python -m http.server 8000
```

puis ouvrir <http://localhost:8000>.

## Structure

| Chemin | Rôle |
|---|---|
| `js/config.js` | Source unique de vérité : palette, couleur par type, jeux de données, formats fr-FR, règles (échéances, coefficient CPB, prospection) |
| `js/filters.js` | État des filtres, KPI, synchronisation de l'URL (état partageable), rayon |
| `js/map.js` | Carte Leaflet : marqueurs ∝ capacité, légende dynamique cliquable, satellite, cercle de rayon |
| `js/charts.js` | Graphiques Chart.js (axe temps linéaire, unités homogènes) |
| `js/table.js` | Tableau trié/paginé, export CSV (`;` + BOM, compatible Excel FR) |
| `js/qualify.js` | Panneau « Qualifier » : identité du site + formulaire Airtable pré-rempli (registre équipe, voir `REGISTER.md`) |
| `data/` | Jeux de données JSON, `meta.json` (millésimes, écrits par l'ETL) et `pipeline.json` (registre équipe synchronisé) |
| `tools/screening_params.json` | Seuils du screening (puissance, tranches, CPB, zone test) : la config, jamais le code |
| `tools/build_datasets.py` | ETL : registres ODRÉ → `data/*.json` + `meta.json` (injection telle quelle ; électricité biogaz filtrée sur la filière Bioénergies, géocodée au centroïde de commune par code INSEE) |
| `tools/enrich_grid.py` | Enrichissement réseau : distance au tronçon GRDF en service le plus proche (open data GRDF), point d'injection le plus proche, zonage de raccordement (ODRÉ) ; cache dans `tools/cache/` |
| `tools/qualify_v2.py` | Score v2 sur 100 et priorités (pondération dans `screening_params.json`), écrits dans les données ; classeur Excel de shortlist pour l'équipe (OneDrive, `Biomethane France/Screening/`) |
| `tools/sync_register.py` | Registre équipe Airtable → `data/pipeline.json` (`REGISTER.md`) |
| `tools/geocode_icpe.py` | Position réelle et régime ICPE (Géorisques, rubrique 2781) ; `--restore` remet le centroïde de commune |
| `tools/check_geo.py` | Contrôle géométrique : chaque site testé contre les contours des régions (`tools/geo/regions.geo.json`) ; `--apply` corrige la région ou retire des coordonnées hors de France |

## Mettre à jour les données

```bash
python tools/build_datasets.py
python tools/geocode_icpe.py       # position ICPE (icpe_2781.json : couche WFS Géorisques filtrée sur 2781)
python tools/check_geo.py --apply
python tools/enrich_grid.py        # ~6 min la première fois (1 225 requêtes GRDF), cache ensuite
python tools/qualify_v2.py         # score v2 + classeur Excel
```

Puis commit des fichiers `data/` sur une branche et PR (chiffres avant/après
dans la description). Les deux jeux sont téléchargés depuis ODRÉ (licence
ouverte, sans clé) ; le registre électricité est réédité chaque mois.

## Unités

- Injection : **GWh PCS/an** (capacité de production).
- Électricité biogaz : **GWh électriques/an** (énergie annuelle glissante
  injectée, registre national) ; la **puissance en kWé** est le critère de
  screening. Jamais additionnés à l'injection.

## Périmètre « électricité biogaz »

Le registre national est filtré sur la filière Bioénergies. Le type de site est
lu sur le **code combustible** : `B.MET` = biogaz de méthanisation (cibles de
conversion), `B.EPU` / `B.STO` / `BAGAS` = STEP, ISDND, bagasse, le reste =
bois, déchets ménagers ou industriels, papeterie. La technologie déclarée
(« Cogénération à combustion », « Autre », « Moteur à piston », vide…) n'est
pas un critère : l'ancien radar (juin 2026) filtré sur « Cogénération »
écartait plus de la moitié du parc, dont l'essentiel des sites 2007-2014.

## Limites connues des données

- **Position des installations électriques** : le registre national ne fournit
  aucune coordonnée. Les méthaniseurs sont positionnés sur leur **installation
  classée** (Géorisques, rubrique 2781, rapprochement par commune puis nom :
  390 sites) ; les autres restent au **centroïde de leur commune**. La
  précision est indiquée dans les fiches et le CSV (`Précision géo`).
- **Échéances de contrat** : estimations (`année MES + durée réglementaire`) —
  injection 15 ans ; électricité biogaz 20 ans (BG16 ; BG11/BG06 prolongés,
  arrêté du 24/02/2017). Avenants et renégociations non captés ; 13
  installations sans date de MES. À confirmer en entretien.
- **Coefficient CPB** : estimation à l'année de conversion par défaut (arrêté
  du 26/12/2025), voir `METHODOLOGIE.md`.
- **Distance au réseau GRDF** : à vol d'oiseau depuis le centroïde de commune,
  réseau GRDF en service seulement (zones ELD « inconnues »), rayon 15 km ;
  critère de tri, pas un chiffrage de raccordement. Zonages de raccordement :
  édition ODRÉ de décembre 2020.
- **Filtre prospection v2** : périmètre thèse de la reprise du 18/09/2026 (détail
  dans l'app via le bouton ⓘ), seuils lus dans `tools/screening_params.json`.
- **Outre-mer** : 24 installations (Guadeloupe, Guyane…) écartées par l'ETL,
  hors du périmètre de la plateforme.

## Versioning v2 (septembre 2026)

Le plan de mise à jour du screening (cadre réglementaire de l'été 2026, filtres
Benoît Condoumi / Antoine de la Faire, apports de `biomethane-germany`) est tenu
dans [`BACKLOG.md`](BACKLOG.md) : une PR par étape, du plus simple au plus
incertain.
La logique de fonctionnement et les choix de design (règle, donnée, source de
chaque filtre, journal des décisions) sont dans [`METHODOLOGIE.md`](METHODOLOGIE.md).
Contexte réglementaire : note `Biomethane France/Roadmap/2026-09-24_Annexe_reglementaire_Biomethane_France.md` (OneDrive Nautilus).

---

© Nautilus — Tous droits réservés.
