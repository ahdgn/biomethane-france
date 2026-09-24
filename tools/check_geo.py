# -*- coding: utf-8 -*-
"""Contrôle géométrique des coordonnées (étape 3 du backlog).

Vérifie que chaque site tombe bien dans la région que le registre lui attribue,
en testant ses coordonnées contre les contours officiels des régions
(tools/geo/regions.geo.json, source france-geojson / IGN Admin Express, licence
ouverte). Règle, identique à celle de biomethane-germany :
  · point hors de France métropolitaine -> coordonnées jugées fausses
    (signalées ; supprimées avec --apply, la carte n'affiche plus le site) ;
  · point dans une autre région que celle déclarée, au-delà d'une tolérance
    frontalière (~2 km) -> la géométrie fait foi (région corrigée avec --apply) ;
  · à moins de 2 km d'une frontière régionale -> bénéfice du doute, inchangé.

Usage :
  python tools/check_geo.py            # rapport seulement (tools/geo_report.json)
  python tools/check_geo.py --apply    # applique les corrections dans data/*.json
"""
import json
import os
import sys

from shapely.geometry import Point, shape
from shapely.prepared import prep

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
BORDER_TOL_DEG = 0.02  # ~2 km

# Le registre ODRÉ et le registre EDF OA écrivent les régions comme l'INSEE ;
# france-geojson aussi. Table de secours pour les variantes rencontrées.
ALIASES = {
    "Ile-de-France": "Île-de-France",
    "Provence-Alpes-Côte d'Azur": "Provence-Alpes-Côte d'Azur",
    "Auvergne-Rhone-Alpes": "Auvergne-Rhône-Alpes",
}


def load_regions():
    gj = json.load(open(os.path.join(HERE, "geo", "regions.geo.json"), encoding="utf-8"))
    regions = [(f["properties"]["nom"], shape(f["geometry"])) for f in gj["features"]]
    return [(name, prep(geom), geom) for name, geom in regions]


def check_point(regions, declared, lat, lon):
    """Retourne (verdict, région géométrique).
    verdict : 'ok' | 'border' | 'mismatch' | 'outside' | 'nocoord'"""
    if lat is None or lon is None:
        return "nocoord", None
    pt = Point(lon, lat)
    inside = next((n for n, p, _ in regions if p.covers(pt)), None)
    if inside is None:
        return "outside", None
    declared = ALIASES.get(declared, declared)
    if not declared or inside == declared:
        return "ok", inside
    claimed = next((g for n, _, g in regions if n == declared), None)
    if claimed is not None and claimed.distance(pt) < BORDER_TOL_DEG:
        return "border", inside
    return "mismatch", inside


def run(apply):
    regions = load_regions()
    report = {"tolerance_deg": BORDER_TOL_DEG, "datasets": {}}

    # ---- injection (coordonnées de site, registre ODRÉ) ----
    path = os.path.join(DATA, "points-injection.json")
    inj = json.load(open(path, encoding="utf-8"))
    stats = {"n": len(inj), "ok": 0, "border": 0, "mismatch": 0, "outside": 0, "nocoord": 0, "details": []}
    for d in inj:
        c = d.get("coordonnees") or {}
        verdict, inside = check_point(regions, d.get("region"), c.get("lat"), c.get("lon"))
        stats[verdict] += 1
        if verdict in ("mismatch", "outside"):
            stats["details"].append({"nom": d.get("nom_du_projet"), "commune": d.get("commune"),
                                     "declaree": d.get("region"), "geometrie": inside,
                                     "lat": c.get("lat"), "lon": c.get("lon"), "verdict": verdict})
            if apply:
                if verdict == "mismatch":
                    d["region_registre"] = d.get("region")
                    d["region"] = inside
                else:
                    d["coordonnees_registre"] = d.get("coordonnees")
                    d["coordonnees"] = None
    report["datasets"]["injection"] = stats
    if apply:
        json.dump(inj, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=None)

    # ---- cogénérations (centroïde de commune, geo.api.gouv.fr) ----
    path = os.path.join(DATA, "cogenerations.json")
    cog = json.load(open(path, encoding="utf-8"))
    stats = {"n": len(cog), "ok": 0, "border": 0, "mismatch": 0, "outside": 0, "nocoord": 0, "details": []}
    for d in cog:
        verdict, inside = check_point(regions, d.get("region"), d.get("lat"), d.get("lon"))
        stats[verdict] += 1
        if verdict in ("mismatch", "outside"):
            stats["details"].append({"nom": d.get("nom"), "commune": d.get("commune"),
                                     "declaree": d.get("region"), "geometrie": inside,
                                     "lat": d.get("lat"), "lon": d.get("lon"), "verdict": verdict})
            if apply:
                if verdict == "mismatch":
                    d["region_registre"] = d.get("region")
                    d["region"] = inside
                else:
                    d["lat"], d["lon"] = None, None
    report["datasets"]["cogen"] = stats
    if apply:
        json.dump(cog, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=None)

    out = os.path.join(HERE, "geo_report.json")
    json.dump(report, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    for k, s in report["datasets"].items():
        print(f"{k}: n={s['n']} ok={s['ok']} border={s['border']} mismatch={s['mismatch']} "
              f"outside={s['outside']} nocoord={s['nocoord']}")
        for det in s["details"][:20]:
            print("   ", det["verdict"], "|", det["nom"], "|", det["commune"], "|",
                  det["declaree"], "->", det["geometrie"])
    print("rapport :", out, "| corrections appliquées" if apply else "| aucune modification (--apply pour corriger)")


if __name__ == "__main__":
    run(apply="--apply" in sys.argv)
