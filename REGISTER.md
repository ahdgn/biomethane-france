# Registre équipe (Airtable)

Le registre est la couche éditable par l'équipe au-dessus des données
publiques : statut de la relation, connaissance du site, difficulté de
raccordement appréciée, structure du capital, régime ICPE, intrants, notes
classées. L'équipe édite les fiches dans Airtable ; `tools/sync_register.py`
les rapatrie dans `data/pipeline.json` (commité via PR comme toute donnée).
Port de `biomethane-germany` (REGISTER.md, base app1HPXkXIa9xYSin).

## Base Airtable

Base **« Biomethane France Screening tool »** (`app2bwaGaaTnIBUVq`), table
**Sites** (`tblbkofITxXCYaptN`), créée le 24/09/2026 dans l'espace de travail
« Espace de travail », vide au départ.

| Champ | Type | Valeurs |
|---|---|---|
| Clé | Texte (champ principal) | code EIC (élec. biogaz, ex. `17W000000063231R`) ou identifiant ODRÉ `id_unique_projet` (injection, ex. `1`), tel qu'affiché dans le panneau Qualifier et la colonne « Clé registre » du CSV |
| Base | Sélection | Élec. biogaz · Injection |
| Nom du site, Commune | Texte | pour la lecture seulement (pré-remplis) |
| Projet | Texte | nom de projet Nautilus ; **renseigné = le site entre dans le pipeline** (halo ambre, filtre « Pipeline Nautilus seulement ») |
| Statut relation | Sélection | Exploitant connu · Fournisseurs d'intrants à proximité · En cours d'évaluation · Évalué et écarté |
| Tags équipe | Sélection multiple | On connaît l'exploitant · Déjà travaillé sur le site · Élus / collectivité connus · Bureau d'études connu |
| Difficulté raccordement | Sélection | Facile · Moyenne · Difficile (appréciation de l'équipe, pas la distance calculée) |
| Part agricole du capital | Sélection | ≥ 51 % agricole · < 51 % agricole · Inconnue (condition du permis en zone A) |
| Régime ICPE | Sélection | Autorisation · Enregistrement · Déclaration · Inconnu |
| Intrants | Texte | mix connu ou estimé (effluents, CIVE, déchets, %) |
| Confiance | Sélection | confirmé · probable · alternative |
| Notes intrants, Notes opérateur gaz, Notes permis, Notes politique locale, Notes libres | Texte long | notes classées par catégorie (demande de Daniel, 21/09) |

Les noms de champs doivent rester exactement ceux-ci : la synchronisation
s'appuie dessus.

**Règle du pipeline** : un site fait partie du « pipeline Nautilus » **seulement
si son champ Projet est renseigné**. Une fiche sans projet enrichit le site
(statut, tags, notes, capital, ICPE dans les popups et les filtres) sans le
mettre au pipe. Les sites écartés restent dans la base à dessein : cette
mémoire évite de les réévaluer plus tard.

## Synchronisation

```bash
set AIRTABLE_TOKEN=pat...        # jeton personnel, portée data.records:read sur la base
set AIRTABLE_BASE=app2bwaGaaTnIBUVq
python tools/sync_register.py    # réécrit data/pipeline.json
```

Puis commit de `data/pipeline.json` sur une branche et PR. Les sites absents
du registre ont par défaut la relation « Non évalué » et pas de note de
raccordement. En session Claude, la lecture peut aussi passer par le connecteur
Airtable (base et table ci-dessus) et produire le même fichier.

## Formulaire de qualification (panneau dans l'app)

Les fiches de la carte portent un lien **✎ Qualifier** qui ouvre un panneau
latéral : identité du site (données publiques, lecture seule, avec score,
réseau et coefficient) + le formulaire partagé Airtable, pré-rempli avec la
clé, la base, le nom et la commune. Pour le brancher (une fois) :

1. Dans Airtable, ouvrir la table **Sites** → barre latérale des vues →
   **Formulaire** → créer.
2. Garder les champs : Clé, Base, Nom du site, Commune, Projet, Statut
   relation, Tags équipe, Difficulté raccordement, Part agricole du capital,
   Régime ICPE, Intrants, Confiance, les cinq Notes. Laisser **Clé dans le
   formulaire** (l'app la pré-remplit et la cache).
3. **Partager le formulaire** → copier le lien
   (https://airtable.com/app2bwaGaaTnIBUVq/shr… ou https://airtable.com/shr…).
4. Le coller dans `REGISTER_FORM_URL` de `js/config.js`, incrémenter le
   `?v=` de `index.html`, PR.

Tant que le lien est vide, le panneau affiche l'identité du site et explique
que le formulaire n'est pas branché. Chaque envoi crée une nouvelle fiche ; si
plusieurs fiches partagent une clé, la synchronisation garde la plus récente.
