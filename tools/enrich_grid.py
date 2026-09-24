# -*- coding: utf-8 -*-
"""
Enrichissement réseau gaz (étape 6 du backlog) -> data/cogenerations.json, data/points-injection.json
======================================================================================================
Trois informations, toutes issues de sources ouvertes et gratuites :

1. Distance au réseau de distribution GRDF en service
   Jeu « Cartographie du réseau GRDF en service » (opendata.grdf.fr, 3,7 M de
   tronçons, réseaux propane exclus). Pour chaque installation électrique
   biogaz, une requête d'agrégation renvoie la distance minimale (à vol
   d'oiseau) entre le point du site et les tronçons situés à moins de
   RAYON_MAX km. Au-delà : distance inconnue (> RAYON_MAX), ce qui couvre aussi
   les zones desservies par une ELD (Strasbourg, Bordeaux, Grenoble…) et non
   par GRDF. Les résultats sont mis en cache (tools/cache/grid_cache.json).

2. Distance au point d'injection de biométhane le plus proche
   Calcul local (haversine) sur le registre ODRÉ des points d'injection : un
   point d'injection à proximité signale un réseau déjà ouvert au biométhane
   (et parfois un rebours).

3. Zonage de raccordement biométhane
   Jeu ODRÉ « Cartographie d'accès aux réseaux méthane renouvelable » (1 289
   zonages définis par les opérateurs dans le cadre du droit à l'injection,
   édition décembre 2020) : point dans polygone -> libellé, maturité, capacité
   maximale, capacité en attente, potentiel, critère technico-économique.

Précision : les installations électriques sont géocodées au centroïde de leur
commune ; les distances sont donc à ± quelques km. Elles servent à trier, pas
à chiffrer un raccordement (étude détaillée GRDF site par site).

Usage : python tools/enrich_grid.py [--limit N] [--no-grdf]
"""
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DATA = REPO / "data"
CACHE = REPO / "tools" / "cache" / "grid_cache.json"
ZONAGES_URL = "https://odre.opendatasoft.com/api/explore/v2.1/catalog/datasets/cartographie-acces-biomethane/exports/geojson"
GRDF_URL = "https://opendata.grdf.fr/api/explore/v2.1/catalog/datasets/cartographie-du-reseau-grdf-en-service/records?"
UA = {"User-Agent": "biomethane-france-etl (Nautilus)"}
RAYON_MAX = 15  # km : au-delà, la distance n'est pas calculée


def fetch_json(url, timeout=120):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def grdf_min_distance(lat, lon, cache):
    key = f"{lat:.4f},{lon:.4f}"
    if key in cache:
        return cache[key]
    q = urllib.parse.urlencode({
        "where": f"distance(geo_point_2d, geom'POINT({lon} {lat})', {RAYON_MAX}km) and propane is null and etat_serv=\"En service\"",
        "select": f"count(*) as n, min(distance(geo_point_2d, geom'POINT({lon} {lat})')) as dmin",
        "limit": 1,
    })
    for attempt in range(3):
        try:
            r = fetch_json(GRDF_URL + q)
            res = r["results"][0] if r.get("results") else {}
            dmin = res.get("dmin")
            val = round(dmin / 1000, 2) if dmin is not None else None
            cache[key] = val
            return val
        except Exception as e:  # réseau ou quota : on réessaie puis on laisse vide
            time.sleep(2 + 3 * attempt)
            last = e
    print("   GRDF KO :", key, last)
    return None


def load_zonages():
    path = REPO / "tools" / "cache" / "zonages.geojson"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(ZONAGES_URL, headers=UA)
        with urllib.request.urlopen(req, timeout=300) as resp:
            path.write_bytes(resp.read())
    from shapely.geometry import shape, Point
    from shapely.prepared import prep
    gj = json.load(open(path, encoding="utf-8"))
    zones = []
    for f in gj["features"]:
        if not f.get("geometry"):
            continue
        p = f["properties"]
        zones.append((prep(shape(f["geometry"])), {
            "libelle": p.get("libelle"), "maturite": p.get("maturite"), "isurv": p.get("isurv"),
            "capamax": p.get("capamax"), "capaattent": p.get("capaattent"), "potzone": p.get("potzone"),
            "criteres": p.get("criteres_technico_economiques"), "nbprojet": p.get("nbprojet"),
        }))
    print(f"Zonages de raccordement : {len(zones)}")
    return zones, Point


def zonage_for(zones, Point, lat, lon):
    pt = Point(lon, lat)
    for prepared, props in zones:
        if prepared.covers(pt):
            return props
    return None


def main():
    limit = None
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])
    do_grdf = "--no-grdf" not in sys.argv

    inj = json.load(open(DATA / "points-injection.json", encoding="utf-8"))
    elec = json.load(open(DATA / "cogenerations.json", encoding="utf-8"))
    cache = json.load(open(CACHE, encoding="utf-8")) if CACHE.exists() else {}
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    zones, Point = load_zonages()

    inj_pts = [(d["coordonnees"]["lat"], d["coordonnees"]["lon"], d.get("nom_du_projet"), d.get("id_unique_projet"))
               for d in inj if d.get("coordonnees")]

    # ---- points d'injection : zonage seulement ----
    n_zon = 0
    for d in inj:
        c = d.get("coordonnees")
        z = zonage_for(zones, Point, c["lat"], c["lon"]) if c else None
        d["zonage"] = z
        n_zon += bool(z)
    print(f"Injection : {len(inj)} sites, {n_zon} dans un zonage de raccordement")

    # ---- installations électriques ----
    todo = [d for d in elec if d.get("lat") is not None]
    if limit:
        todo = todo[:limit]
    t0 = time.time()
    n_grdf = n_z = 0
    for i, d in enumerate(todo):
        lat, lon = d["lat"], d["lon"]
        best = min(((haversine(lat, lon, la, lo), nom, pid) for la, lo, nom, pid in inj_pts), default=(None, None, None))
        d["dist_injection_km"] = round(best[0], 1) if best[0] is not None else None
        d["injection_proche"] = best[1]
        d["injection_proche_id"] = best[2]
        z = zonage_for(zones, Point, lat, lon)
        d["zonage"] = z
        n_z += bool(z)
        if do_grdf:
            d["dist_grdf_km"] = grdf_min_distance(lat, lon, cache)
            n_grdf += d["dist_grdf_km"] is not None
            if (i + 1) % 50 == 0:
                json.dump(cache, open(CACHE, "w", encoding="utf-8"))
                print(f"   {i + 1}/{len(todo)} sites, {time.time() - t0:.0f} s")
    json.dump(cache, open(CACHE, "w", encoding="utf-8"))

    json.dump(elec, open(DATA / "cogenerations.json", "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(inj, open(DATA / "points-injection.json", "w", encoding="utf-8"), ensure_ascii=False)

    meta_path = DATA / "meta.json"
    meta = json.load(open(meta_path, encoding="utf-8"))
    meta["reseau"] = {
        "grdf": "Cartographie du réseau GRDF en service (opendata.grdf.fr, 24/03/2025), distance minimale à vol d'oiseau, réseaux propane exclus, rayon de recherche %d km" % RAYON_MAX,
        "zonages": "ODRÉ, cartographie d'accès aux réseaux méthane renouvelable (zonages de raccordement, 15/12/2020)",
        "injection_proche": "distance au point d'injection ODRÉ le plus proche (haversine)",
        "enrichissement": date.today().isoformat(),
    }
    json.dump(meta, open(meta_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    dists = [d["dist_grdf_km"] for d in todo if d.get("dist_grdf_km") is not None]
    print(f"Électricité biogaz : {len(todo)} sites traités ; zonage {n_z} ; distance GRDF connue {n_grdf} "
          f"(≤ 2 km : {sum(1 for x in dists if x <= 2)}, ≤ 5 km : {sum(1 for x in dists if x <= 5)}, "
          f"≤ 10 km : {sum(1 for x in dists if x <= 10)}) ; > {RAYON_MAX} km ou inconnu : {len(todo) - n_grdf}")
    print(f"Durée : {time.time() - t0:.0f} s")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
