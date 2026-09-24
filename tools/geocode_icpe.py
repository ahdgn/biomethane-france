# -*- coding: utf-8 -*-
"""
Géocodage des installations électriques biogaz par la base ICPE (étape 10)
=========================================================================
Source : Géorisques, base des installations classées, couche WFS BRGM
`ms:InstallationsClassees` (mapsref.brgm.fr, licence ouverte), filtrée sur la
rubrique 2781 (méthanisation) -> tools/cache/icpe_2781.json (téléchargement
séparé). Champs utiles : nom_ets, adresse, cd_insee, x/y Lambert 93,
cd_regime / lib_regime (A / E / D), rubriques par régime, num_siret, code_aiot,
url_fiche, date_modification.

Rapprochement, pour chaque installation électrique B.MET (méthanisation) :
  1. candidats ICPE 2781 de la même commune (code INSEE) ;
  2. un seul candidat -> retenu (confiance « commune ») ;
  3. plusieurs -> similarité de nom (jeton commun nom_ets / nom du site) ;
     sinon le premier par régime (A > E > D) avec confiance « commune, ambigu » ;
  4. aucun -> inchangé (centroïde de commune).

Écriture (réversible) : `lat_commune` / `lon_commune` conservent le centroïde ;
`lat` / `lon` prennent la position ICPE ; `geo_precision` = « site (ICPE) » ;
`icpe` = {nom, regime, lib_regime, adresse, siret, code_aiot, url, confiance}.
`--restore` remet le centroïde et retire `icpe`.

Usage : python tools/geocode_icpe.py [--restore]
Ensuite : check_geo.py --apply, enrich_grid.py, qualify_v2.py.
"""
import json
import math
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DATA = REPO / "data"
ICPE = REPO / "tools" / "cache" / "icpe_2781.json"


# ---- Lambert 93 (EPSG:2154) -> WGS84, formules IGN (précision < 1 m) ----
def lambert93_to_wgs84(x, y):
    a, e = 6378137.0, 0.0818191910428158
    n, c, xs, ys = 0.7256077650532670, 11754255.426096, 700000.0, 12655612.049876
    lon0 = math.radians(3.0)
    R = math.hypot(x - xs, ys - y)
    gamma = math.atan2(x - xs, ys - y)
    lon = lon0 + gamma / n
    lat_iso = -math.log(R / c) / n
    phi = 2 * math.atan(math.exp(lat_iso)) - math.pi / 2
    for _ in range(8):
        esin = e * math.sin(phi)
        phi = 2 * math.atan(((1 + esin) / (1 - esin)) ** (e / 2) * math.exp(lat_iso)) - math.pi / 2
    return round(math.degrees(phi), 6), round(math.degrees(lon), 6)


STOP = {"sas", "sarl", "earl", "gaec", "scea", "sa", "snc", "sci", "societe", "société", "de", "du", "des", "la", "le",
        "les", "et", "biogaz", "biogas", "methanisation", "méthanisation", "metha", "energie", "energies", "energy",
        "bio", "ferme", "centrale", "unite", "unité", "d", "l", "en"}


def tokens(s):
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode()
    return {t for t in re.split(r"[^a-z0-9]+", s.lower()) if len(t) > 2 and t not in STOP}


def regime_rank(p):
    return {"A": 0, "E": 1, "D": 2}.get((p.get("cd_regime") or "").upper(), 3)


def main():
    elec = json.load(open(DATA / "cogenerations.json", encoding="utf-8"))
    if "--restore" in sys.argv:
        n = 0
        for d in elec:
            if "lat_commune" in d:
                d["lat"], d["lon"] = d.pop("lat_commune"), d.pop("lon_commune")
                d["geo_precision"] = "commune"
                d.pop("icpe", None)
                n += 1
        json.dump(elec, open(DATA / "cogenerations.json", "w", encoding="utf-8"), ensure_ascii=False)
        print(f"Restauration : {n} sites remis au centroïde de commune")
        return

    icpe = json.load(open(ICPE, encoding="utf-8"))
    by_insee = defaultdict(list)
    for p in icpe:
        if p.get("cd_insee") and p.get("x") and p.get("y"):
            by_insee[str(p["cd_insee"]).zfill(5)].append(p)
    print(f"ICPE 2781 : {len(icpe)} installations, {len(by_insee)} communes")

    stats = {"cibles": 0, "unique": 0, "nom": 0, "ambigu": 0, "aucun": 0}
    for d in elec:
        if d.get("code_combustible") != "B.MET":
            continue
        stats["cibles"] += 1
        insee = str(d.get("code_insee") or "").zfill(5)
        cands = by_insee.get(insee, [])
        if not cands:
            stats["aucun"] += 1
            continue
        if len(cands) == 1:
            best, conf = cands[0], "commune (candidat unique)"
            stats["unique"] += 1
        else:
            tk = tokens(d.get("nom"))
            scored = sorted(cands, key=lambda p: (-len(tk & tokens(p.get("nom_ets"))), regime_rank(p)))
            if tk and tk & tokens(scored[0].get("nom_ets")):
                best, conf = scored[0], "commune + nom"
                stats["nom"] += 1
            else:
                best, conf = scored[0], "commune, ambigu (%d candidats)" % len(cands)
                stats["ambigu"] += 1
        lat, lon = lambert93_to_wgs84(float(best["x"]), float(best["y"]))
        if "lat_commune" not in d:
            d["lat_commune"], d["lon_commune"] = d.get("lat"), d.get("lon")
        d["lat"], d["lon"] = lat, lon
        d["geo_precision"] = "site (ICPE)"
        d["icpe"] = {"nom": best.get("nom_ets"), "regime": best.get("cd_regime"), "lib_regime": best.get("lib_regime"),
                     "adresse": best.get("adresse"), "siret": best.get("num_siret"), "code_aiot": best.get("code_aiot"),
                     "url": best.get("url_fiche"), "maj": (best.get("date_modification") or "")[:10], "confiance": conf,
                     "rubriques_A": best.get("rubriques_autorisation"), "rubriques_E": best.get("rubriques_enregistrement"),
                     "rubriques_D": best.get("rubriques_declaration")}
    json.dump(elec, open(DATA / "cogenerations.json", "w", encoding="utf-8"), ensure_ascii=False)
    print("Rapprochement :", stats)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
