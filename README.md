# Biométhane France — Portail de suivi

Cartographie et analyse des **points d'injection de biométhane** (registre ODRÉ,
818 sites) et des **cogénérations** (registre EDF OA, 1 002 installations) en France.

Application statique — aucun backend, aucune dépendance externe au chargement
(librairies et fontes vendorisées ; seul le fond de carte CARTO est appelé en ligne).

## Lancer en local

```bash
python -m http.server 8000
```

puis ouvrir <http://localhost:8000>.

## Structure

| Chemin | Rôle |
|---|---|
| `js/config.js` | Source unique de vérité : palette, couleur par type, jeux de données, formats fr-FR |
| `js/filters.js` | État des filtres, KPI, synchronisation de l'URL (état partageable) |
| `js/map.js` | Carte Leaflet : marqueurs ∝ capacité, légende dynamique cliquable |
| `js/charts.js` | Graphiques Chart.js (axe temps linéaire, unités homogènes) |
| `js/table.js` | Tableau trié/paginé, export CSV (`;` + BOM, compatible Excel FR) |
| `data/` | Jeux de données JSON |
| `tools/build_cogen_json.py` | ETL du radar cogé : Excel → JSON, géocodage au centroïde de commune (geo.api.gouv.fr) |

## Mettre à jour les cogénérations

```bash
python tools/build_cogen_json.py "chemin/vers/ACREnergy_CogenFrance_Radar.xlsx"
```

Les positions cogé sont au **centroïde de la commune** (le registre ne fournit pas
de coordonnées) ; l'imprécision est signalée dans l'interface. Les colonnes de
scoring du radar sont ignorées.

## Unités

- Injection : **GWh PCS/an** (capacité de production).
- Cogénérations : **GWh électriques/an** (énergie injectée). Jamais additionnés.

---

© Nautilus — Tous droits réservés.
