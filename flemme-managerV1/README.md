# Flemme Manager V1

Backend Python modulaire pour Flemme Manager V1, organisé en agents, prompts,
workflows, outils, routes et services. Flemme Manager qualifie les demandes
avec une sortie Pydantic structurée et un catalogue fermé de workflows.

## Prérequis

- Python 3.12
- `pip`

## Installation

Depuis ce dossier :

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
```

Copiez `.env.example` vers `.env`, puis renseignez `OPENAI_API_KEY` dans ce fichier local. Ne partagez pas cette clé.

## Vérification

```bash
python -m pytest
```

L'API expose `GET /health` et `POST /api/manager/analyze`. Le manager ne dispose
d'aucun outil externe et ne peut pas réserver, acheter ni envoyer de message.

Pour appeler le modèle réel manuellement (consomme des crédits API) :

```bash
python tests/manual_manager_live.py
```