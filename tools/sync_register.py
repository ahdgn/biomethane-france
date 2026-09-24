# -*- coding: utf-8 -*-
"""
Synchronise le registre équipe (Airtable) vers data/pipeline.json.
==================================================================
L'équipe édite les fiches dans Airtable (schéma : REGISTER.md) ; ce script les
rapatrie pour que l'app reste statique. À lancer quand le registre a changé,
puis commit de data/pipeline.json via PR.

Env : AIRTABLE_TOKEN (jeton personnel, portée data.records:read sur la base),
      AIRTABLE_BASE (app…), AIRTABLE_TABLE (défaut « Sites »).
"""
import json
import os
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "pipeline.json")

EVAL_MAP = {
    "Exploitant connu": "owners",
    "Fournisseurs d'intrants à proximité": "feedstock",
    "Évalué et écarté": "rejected",
    "En cours d'évaluation": "evaluating",
}
GRID_MAP = {"Facile": "easy", "Moyenne": "medium", "Difficile": "hard"}
TAG_MAP = {
    "On connaît l'exploitant": "owners",
    "Déjà travaillé sur le site": "worked",
    "Élus / collectivité connus": "politicians",
    "Bureau d'études connu": "engineering",
}
CAPITAL_MAP = {"≥ 51 % agricole": "agri", "< 51 % agricole": "nonagri", "Inconnue": ""}
ICPE_MAP = {"Autorisation": "A", "Enregistrement": "E", "Déclaration": "D", "Inconnu": ""}


def main():
    token = os.environ.get("AIRTABLE_TOKEN")
    base = os.environ.get("AIRTABLE_BASE")
    table = os.environ.get("AIRTABLE_TABLE", "Sites")
    if not token or not base:
        sys.exit("AIRTABLE_TOKEN et AIRTABLE_BASE doivent être définis — voir REGISTER.md. "
                 "data/pipeline.json inchangé.")

    records, offset = [], None
    while True:
        qs = {"pageSize": 100}
        if offset:
            qs["offset"] = offset
        url = (f"https://api.airtable.com/v0/{base}/{urllib.parse.quote(table)}"
               f"?{urllib.parse.urlencode(qs)}")
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
        page = json.load(urllib.request.urlopen(req))
        records += page.get("records", [])
        offset = page.get("offset")
        if not offset:
            break

    # Le formulaire crée toujours une nouvelle fiche : en cas de doublon sur
    # une clé, la plus récente l'emporte.
    records.sort(key=lambda r: r.get("createdTime", ""))
    by_site = {}
    for r in records:
        f = r.get("fields", {})
        site = str(f.get("Clé") or "").strip()
        if not site:
            continue
        e = {"site": site}
        if f.get("Base"):
            e["base"] = f["Base"]
        if f.get("Projet"):
            e["project"] = f["Projet"]
        if f.get("Confiance"):
            e["confidence"] = f["Confiance"]
        if f.get("Statut relation"):
            e["status"] = f["Statut relation"]
            e["eval"] = EVAL_MAP.get(f["Statut relation"], "evaluating")
        if f.get("Difficulté raccordement"):
            e["grid"] = GRID_MAP.get(f["Difficulté raccordement"])
        tags = [TAG_MAP[t] for t in f.get("Tags équipe", []) if t in TAG_MAP]
        if tags:
            e["tags"] = tags
        if f.get("Part agricole du capital"):
            e["capital"] = f["Part agricole du capital"]
        if f.get("Régime ICPE"):
            e["icpe"] = f["Régime ICPE"]
        if f.get("Intrants"):
            e["intrants"] = f["Intrants"]
        notes = {k: f[k] for k in ("Notes intrants", "Notes opérateur gaz", "Notes permis",
                                   "Notes politique locale", "Notes libres") if f.get(k)}
        if notes:
            e["notes"] = notes
        by_site[site] = e
    entries = list(by_site.values())
    entries.sort(key=lambda e: (e.get("project") or "~", e["site"]))
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(entries, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    print(f"pipeline.json : {len(entries)} fiches du registre synchronisées depuis Airtable")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
