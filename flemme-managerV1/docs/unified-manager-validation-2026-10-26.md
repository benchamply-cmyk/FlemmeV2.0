# Validation — Flemme Manager unique — 26/10/2026

## Résultats locaux

| Vérification | Résultat |
| --- | --- |
| Base backend main vérifiée avant refactoring | 218 tests Python réussis |
| Suite Python après refactoring | 239 tests réussis |
| Compilation Python | réussie |
| Suite JavaScript | 44 tests réussis |
| Syntaxe scripts formulaires/plans | réussie |
| E2E navigateur local | non exécuté jusqu'au parcours : Chromium absent ; Chrome système quitte au lancement (SIGABRT, EPERM dans l'environnement restreint) |
| Nouvelle exécution PostgreSQL locale | non réalisée ; aucun SQL modifié, job PostgreSQL 16 existant conservé en CI |
| Appel OpenAI réel sur cette branche | aucun |
| Migration / déploiement | aucun |

Python : interpréteur Python 3.12 de l'environnement de validation V4 déjà installé, avec pythonpath sur le nouveau dossier src. Aucun paquet ajouté. Commandes reproductibles dans le projet : `uv sync --locked --extra dev`, puis `uv run --locked pytest -q` et `uv run --locked python -m compileall -q src`. JavaScript : `node --test flemme-web-beta/tests/*.test.mjs` à la racine.

Les nouveaux tests couvrent : qualification leasing sans marque/ville obligatoires, budget absent, clarification à partir des seuls messages utilisateur sauvegardés, refus des actions engageantes, API canonique plan/approbation/exécution, rôle client refusé sur les outils, projection sans mutation des événements, reprise native/legacy sur le même stockage, taille de corps, absence d'écho de données sensibles, budgets invalides, prix total web, union OpenAPI discriminée, session transmise par l'adaptateur Netlify, origine HTTPS et validation de sa réponse. Les tests de calculs, devises/taxes/bases, citations, sécurité HTTPS/SSRF et parseurs existants continuent à passer.

Les fixtures navigateur sont adaptées au nouvel espace API et au choix explicite total/mensuel. Elles simulent les fournisseurs ; même une future CI verte ne remplacera pas une validation réelle autorisée sur les sources commerciales. Les cas du 21/10 sont reconstruits/anonymisés depuis le rapport de validation ; aucune donnée client ni historique distant n'a été extrait ou réécrit.

## Limites avant validation de déploiement

- La cause exacte des deux 502 du 21/10 n'est pas prouvée. La régression connue évite le modèle pour ce brief et ses précisions couvertes ; elle ne supprime pas toutes les causes possibles de 502.
- La recherche ne garantit pas trois offres lisibles, actuelles et éligibles. Les inconnues et refus de lecture restent visibles. Extraction V4 conservatrice français/EUR, sans OCR.
- Pas de nouvelle file de travaux durable : les tentatives sont réservées et persistées, mais une exécution reste liée à la requête. Reprise administrative explicite, pas relance automatique payante.
- Budget par admission estimée, pas cumul monétaire mensuel ni garantie fournisseur. Les tarifs, droits modèle et crédits doivent être vérifiés avant activation.
- Le stockage historique Netlify reste distinct de fm_v2/v3/v4. La qualification est centralisée par défaut ; la migration des historiques se fait par références, sans copie automatique ni effacement.
- L'API canonique et le nouveau frontend doivent être déployés dans l'ordre documenté, après approbation. Cette PR ne modifie pas la production.

Références : [architecture et migration](unified-manager-2026-10-26.md), [base main](https://github.com/benchamply-cmyk/FlemmeV2.0/commit/5d36ceac7242e4cb69735ce2a2d9146af03dd1f4), [FLEMME-6](https://benchp.atlassian.net/browse/FLEMME-6).
