# -*- coding: utf-8 -*-
"""
ETL cogénérations — radar ACREnergy -> data/cogenerations.json
==============================================================
Source : ACREnergy_CogenFrance_Radar.xlsx (feuille « Données », registre EDF OA),
1002 installations sans coordonnées GPS. Le script géocode chaque installation
au centroïde de sa commune via le référentiel geo.api.gouv.fr (une seule
requête), en s'appuyant sur le couple commune + département pour lever les
homonymies. Les colonnes de scoring du radar (Score conversion, Priorité) sont
volontairement ignorées : le dashboard présente la donnée brute.

Usage : python tools/build_cogen_json.py [chemin_du_xlsx]
Sortie : data/cogenerations.json  (géo_precision = "commune")
"""
import json
import sys
import unicodedata
import urllib.request
from pathlib import Path

import pandas as pd

REPO = Path(__file__).resolve().parent.parent
DEFAULT_XLSX = (
    r"C:\Users\ahmed\OneDrive\Bureau\__Nautilus\2__Pipeline\Active"
    r"\ACREnergy\Biomethane France\Screening\ACREnergy_CogenFrance_Radar.xlsx"
)
OUT = REPO / "data" / "cogenerations.json"

GEO_COMMUNES = "https://geo.api.gouv.fr/communes?fields=nom,code,centre,codeDepartement&format=json"
GEO_DEPTS = "https://geo.api.gouv.fr/departements?fields=nom,code&format=json"


# communes fusionnées depuis l'édition du radar -> nom de la commune nouvelle
ALIASES = {
    "le merlerault": "merlerault le pin",          # 61, fusion
    "sainte hermine": "saint jean d hermine",      # 85, fusion
}


def norm(s):
    """Normalisation pour appariement : minuscules, sans accents ni tirets."""
    if not isinstance(s, str):
        return ""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower().replace("-", " ").replace("'", " ").replace("’", " ")
    s = " ".join(s.split())
    # abréviations usuelles du registre
    for a, b in ((" st ", " saint "), (" ste ", " sainte ")):
        s = f" {s} ".replace(a, b).strip()
    if s.startswith("st "):
        s = "saint " + s[3:]
    if s.startswith("ste "):
        s = "sainte " + s[4:]
    return s


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "biomethane-france-etl"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    xlsx = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_XLSX
    df = pd.read_excel(xlsx, sheet_name="Données")

    print(f"Radar : {len(df)} installations")

    # ---- Référentiels géographiques ----
    depts = fetch_json(GEO_DEPTS)
    dept_code = {norm(d["nom"]): d["code"] for d in depts}

    communes = fetch_json(GEO_COMMUNES)
    by_dept = {}   # (code_dept, nom normalisé) -> (lat, lon)
    by_name = {}   # nom normalisé -> liste de (lat, lon)
    for c in communes:
        centre = c.get("centre")
        if not centre:
            continue
        lon, lat = centre["coordinates"]
        key = norm(c["nom"])
        by_dept[(c.get("codeDepartement"), key)] = (lat, lon)
        by_name.setdefault(key, []).append((lat, lon))
    print(f"Référentiel : {len(communes)} communes, {len(depts)} départements")

    # ---- Construction des enregistrements ----
    mes = pd.to_datetime(df["Date MES"], dayfirst=True, errors="coerce")
    records, unmatched = [], []
    for i, row in df.iterrows():
        commune = row.get("Commune")
        dept = row.get("Département")
        key = norm(commune)
        code = dept_code.get(norm(dept))

        # les arrondissements (Marseille 9e Arrondissement…) portent le nom de la ville
        key_ville = key.split(" arrondissement")[0]
        key_ville = " ".join(w for w in key_ville.split() if not w.rstrip("er").isdigit())
        key = ALIASES.get(key, key)

        lat = lon = None
        hit = by_dept.get((code, key)) or by_dept.get((code, key_ville))
        if hit:
            lat, lon = hit
        else:
            # repli 1 : commune fusionnée / renommée -> préfixe dans le même département
            pref = [v for (dc, k), v in by_dept.items()
                    if dc == code and key and (k.startswith(key) or key.startswith(k))]
            # repli 2 : nom unique au niveau national
            cand = pref or by_name.get(key, [])
            if len(cand) == 1:
                lat, lon = cand[0]
            elif key:
                unmatched.append(f"{commune} ({dept})")

        d = mes.iloc[i]
        energie = row.get("Énergie injectée (kWh/an)")
        puissance = row.get("Puissance installée (kW)")
        records.append({
            "nom": row.get("Nom installation") or "Confidentiel",
            "commune": commune if isinstance(commune, str) else "",
            "departement": dept if isinstance(dept, str) else "",
            "region": row.get("Région") if isinstance(row.get("Région"), str) else "",
            "filiere": row.get("Filière") if isinstance(row.get("Filière"), str) else "",
            "combustible": row.get("Combustible") if isinstance(row.get("Combustible"), str) else "",
            "technologie": row.get("Technologie") if isinstance(row.get("Technologie"), str) else "",
            "puissance_kw": round(float(puissance), 1) if pd.notna(puissance) else None,
            "statut": row.get("Statut") if isinstance(row.get("Statut"), str) else "",
            "gestionnaire": row.get("Gestionnaire réseau") if isinstance(row.get("Gestionnaire réseau"), str) else "",
            "date_mes": d.strftime("%Y-%m-%d") if pd.notna(d) else None,
            "annee_mes": int(d.year) if pd.notna(d) else None,
            "energie_gwh_an": round(float(energie) / 1e6, 3) if pd.notna(energie) else None,
            "lat": round(lat, 6) if lat is not None else None,
            "lon": round(lon, 6) if lon is not None else None,
            "geo_precision": "commune" if lat is not None else None,
        })

    OUT.write_text(json.dumps(records, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    geocoded = sum(1 for r in records if r["lat"] is not None)
    print(f"OK -> {OUT}")
    print(f"Géocodage : {geocoded}/{len(records)} ({len(unmatched)} non appariées)")
    if unmatched:
        for u in unmatched[:20]:
            print("  ?", u)


if __name__ == "__main__":
    main()
