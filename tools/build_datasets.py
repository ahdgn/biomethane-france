# -*- coding: utf-8 -*-
"""
ETL registres ODRÉ -> data/*.json (étape 5 du backlog)
======================================================
Deux jeux, téléchargés directement depuis le portail ODRÉ (Open Data Réseaux
Énergies, licence ouverte, gratuit, sans clé) :

1. Points d'injection de biométhane en service
   dataset `points-dinjection-de-biomethane-en-france` (NaTran / GRDF).
   Écrit tel quel (mêmes champs que le registre) dans data/points-injection.json.

2. Installations de production d'électricité à partir de biogaz
   dataset `registre-national-installation-production-stockage-electricite-agrege`
   (RTE, Enedis, ELD ; édition mensuelle, « au 31/07/2026 » à la date de
   l'étape 5). Filtre : filière Bioénergies. Écrit dans data/cogenerations.json
   avec le schéma historique de l'app, plus le code combustible et la
   technologie.

   Le code combustible est la clé du périmètre : B.MET = biogaz de
   méthanisation, quelle que soit la technologie déclarée (« Cogénération à
   combustion », « Autre », « Moteur à piston », vide…). L'ancien radar
   (juin 2026) ne retenait que la technologie « Cogénération », ce qui
   écartait plus de la moitié du parc, dont l'essentiel des sites 2007-2014.
   Les lignes « Agrégation des installations de moins de 36 kW » (sans
   commune) sont écartées.

   Géocodage au centroïde de la commune par code INSEE (geo.api.gouv.fr),
   repli par nom + département pour les codes obsolètes.

3. data/meta.json : millésimes et dates de traitement, lus par l'app.

Usage : python tools/build_datasets.py
Puis  : python tools/check_geo.py --apply
"""
import json
import sys
import unicodedata
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DATA = REPO / "data"
API = "https://odre.opendatasoft.com/api/explore/v2.1/catalog/datasets/"
DS_INJ = "points-dinjection-de-biomethane-en-france"
DS_ELEC = "registre-national-installation-production-stockage-electricite-agrege"
GEO_COMMUNES = "https://geo.api.gouv.fr/communes?fields=nom,code,centre,codeDepartement&format=json"
UA = {"User-Agent": "biomethane-france-etl (Nautilus)"}


def fetch_json(url, timeout=180):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def dataset_meta(ds):
    m = fetch_json(API + ds)["metas"]["default"]
    return {"title": m.get("title"), "modified": str(m.get("modified"))[:10],
            "data_processed": str(m.get("data_processed"))[:10],
            "records_count": m.get("records_count")}


def norm(s):
    if not isinstance(s, str):
        return ""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower().replace("-", " ").replace("'", " ").replace("’", " ")
    s = " ".join(s.split())
    for a, b in ((" st ", " saint "), (" ste ", " sainte ")):
        s = f" {s} ".replace(a, b).strip()
    if s.startswith("st "):
        s = "saint " + s[3:]
    if s.startswith("ste "):
        s = "sainte " + s[4:]
    return s


DOM = {"Guadeloupe", "Martinique", "Guyane", "La Réunion", "Mayotte"}


def commune_base(name):
    """'Zœbersdorf (commune déléguée)' -> 'Zœbersdorf' ; 'Lyon 2e Arrondissement' -> 'Lyon'."""
    if not isinstance(name, str):
        return ""
    n = name.split(" (")[0]
    if "arrondissement" in n.lower():
        n = " ".join(w for w in n.split() if not w.lower().rstrip("er").isdigit()
                     and w.lower() != "arrondissement")
    return n


def iso_date(fr):
    """'26/02/2024' -> '2024-02-26' ; None sinon."""
    if not fr or not isinstance(fr, str) or len(fr) < 10:
        return None
    d, m, y = fr[:10].split("/")
    return f"{y}-{m}-{d}"


def build_injection():
    meta = dataset_meta(DS_INJ)
    rows = fetch_json(API + DS_INJ + "/exports/json")
    rows.sort(key=lambda r: (r.get("id_unique_projet") is None, r.get("id_unique_projet")))
    out = DATA / "points-injection.json"
    json.dump(rows, open(out, "w", encoding="utf-8"), ensure_ascii=False)
    n_open = sum(1 for r in rows if r.get("site_ouvert") == "True")
    cap = sum(r.get("capacite_de_production_gwh_an") or 0 for r in rows)
    print(f"Injection : {len(rows)} sites ({n_open} ouverts), {cap:,.0f} GWh/an, "
          f"traitement ODRÉ {meta['data_processed']}")
    return {"source": meta["title"], "dataset": DS_INJ, "extraction": meta["data_processed"],
            "records": len(rows), "geo": "coordonnées de site"}


def build_elec():
    meta = dataset_meta(DS_ELEC)
    where = urllib.parse.quote('filiere="Bioénergies"')
    rows = fetch_json(API + DS_ELEC + f"/exports/json?where={where}")
    print(f"Registre électricité, filière Bioénergies : {len(rows)} lignes")

    # ---- référentiel communes (code INSEE -> centre ; nom+dept -> centre) ----
    communes = fetch_json(GEO_COMMUNES)
    by_code, by_dept = {}, {}
    for c in communes:
        centre = c.get("centre")
        if not centre:
            continue
        lon, lat = centre["coordinates"]
        by_code[c["code"]] = (lat, lon)
        by_dept[(c.get("codeDepartement"), norm(c["nom"]))] = (lat, lon)
    print(f"Référentiel : {len(communes)} communes")

    records, dropped_agg, dropped_dom, unmatched = [], 0, 0, []
    for r in rows:
        if (r.get("nbinstallations") or 1) > 1 or str(r.get("nominstallation") or "").startswith("Agrégation"):
            dropped_agg += 1
            continue
        if r.get("region") in DOM:
            dropped_dom += 1  # hors périmètre (métropole continentale + Corse)
            continue
        code = r.get("codeinseecommuneimplantation") or r.get("codeinseecommune")
        hit = by_code.get(code) if code else None
        if not hit:
            hit = by_dept.get((r.get("codedepartement"), norm(commune_base(r.get("commune")))))
        if not hit and r.get("commune"):
            unmatched.append(f"{r.get('commune')} ({r.get('codedepartement')}, {code})")
        lat, lon = hit if hit else (None, None)
        mes = r.get("datemiseenservice_date") or iso_date(r.get("datemiseenservice"))
        e = r.get("energieannuelleglissanteinjectee")
        records.append({
            "nom": r.get("nominstallation") or "Confidentiel",
            "commune": r.get("commune") or "",
            "code_insee": code,
            "departement": r.get("departement") or "",
            "region": r.get("region") or "",
            "filiere": r.get("filiere") or "",
            "combustible": r.get("combustible") or "",
            "code_combustible": r.get("codecombustible") or "",
            "technologie": r.get("technologie") or "",
            "puissance_kw": r.get("puismaxinstallee"),
            "statut": r.get("regime") or "",
            "gestionnaire": r.get("gestionnaire") or "",
            "date_mes": mes,
            "annee_mes": int(mes[:4]) if mes else None,
            "date_raccordement": iso_date(r.get("dateraccordement")),
            "energie_gwh_an": round(e / 1e6, 3) if e else None,
            "code_eic": r.get("codeeicresourceobject"),
            "lat": round(lat, 4) if lat is not None else None,
            "lon": round(lon, 4) if lon is not None else None,
            "geo_precision": "commune",
        })

    records.sort(key=lambda d: (d["region"], d["departement"], d["nom"]))
    out = DATA / "cogenerations.json"
    json.dump(records, open(out, "w", encoding="utf-8"), ensure_ascii=False)

    bmet = [d for d in records if d["code_combustible"] == "B.MET"]
    print(f"Écrit {len(records)} installations (agrégats < 36 kW écartés : {dropped_agg}, "
          f"outre-mer écartés : {dropped_dom}) ; "
          f"méthanisation (B.MET) : {len(bmet)}, dont ≥ 250 kW : "
          f"{sum(1 for d in bmet if (d['puissance_kw'] or 0) >= 250)} ; "
          f"sans date de MES : {sum(1 for d in records if not d['annee_mes'])} ; "
          f"non géocodées : {len(unmatched)}")
    for u in unmatched[:15]:
        print("   non géocodée :", u)
    # millésime : le titre du jeu porte « (au JJ/MM/AAAA) »
    title = meta["title"] or ""
    edition = title[title.rfind("(au ") + 4:title.rfind(")")] if "(au " in title else None
    edition_iso = iso_date(edition) if edition else meta["data_processed"]
    return {"source": title, "dataset": DS_ELEC, "extraction": edition_iso,
            "data_processed": meta["data_processed"], "records": len(records),
            "geo": "centroïde de commune (geo.api.gouv.fr, code INSEE)"}


def main():
    meta = {
        "_comment": "Millésimes des jeux de données, écrits par tools/build_datasets.py. Lus par app.js pour la note de source.",
        "build_date": date.today().isoformat(),
    }
    meta["injection"] = build_injection()
    meta["cogen"] = build_elec()
    json.dump(meta, open(DATA / "meta.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("meta.json écrit :", {k: v.get("extraction") for k, v in meta.items() if isinstance(v, dict)})


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
