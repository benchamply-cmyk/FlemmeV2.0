# Affectations, scripts et validation administrateur — 21/10/2026

## Décisions et comportement
La console /manager impose désormais trois étapes distinctes : préparer le plan, le valider explicitement, puis lancer son exécution. La préparation et l’approbation ne lancent ni recherche Internet ni lecture/extraction documentaire ni comparaison. Chaque plan indique les agents assignés et une liste d’actions correspondant aux opérations réellement prises en charge.

L’administrateur modifie les paramètres exécutables dans les formulaires : requête Search, documents Document, sources fournies et critères Compare. Un bouton par agent ramène à ces paramètres. Toute modification invalide les boutons de validation/exécution et exige un nouveau plan. Les contrôles Quality et les limites de sécurité restent obligatoires. Le « script » est un plan d’actions borné ; il ne s’agit pas de code système ni d’instructions libres arbitrairement exécutées.

Les affectations et les tâches par agent ne sont jamais rendues dans la vue client. Les clients conservent leurs résultats. Les plans et approbations sont réservés à la console administrateur ; les événements internes de plan sont filtrés dans l’historique client de cette interface.

## Contrôle serveur
Les routes FastAPI de production V3 et V4 refusent toute demande sans approbation. L’empreinte canonique lie l’approbation au type de traitement, identifiant d’exécution, requête, sources, contraintes et contenu réel des documents (SHA-256). Les contrôles ne reposent pas sur les boutons de l’interface. Une mission modifiée ou une approbation correspondant à d’autres données provoque un conflit avant lancement des outils.

Les plans et approbations utilisent les événements append-only V2 existants, sous la session et les règles de propriété et d’administration existantes. Aucun nouveau schéma ni remplacement de RPC n’est nécessaire pour cet ajout. La réservation V3/V4 reste atomique sur la révision approuvée ; un rejeu de la même exécution ne relance pas les outils. Les originaux sont enregistrés par le mécanisme V4 lors de la réservation d’exécution, et non pendant la proposition du plan. Après rechargement, les plans historiques restent consultables ; pour exécuter, préparer de nouveau la demande avec ses documents si nécessaire et approuver le nouveau plan.

Cette évolution concerne la console FastAPI Manager V2/V3/V4. L’ancien rapport sur données structurées du centre gestionadmin Netlify utilise son propre circuit ; il ne lance pas de recherche Internet ni d’analyse documentaire V4.

## Vérifications
219 tests Python et 39 tests JavaScript réussis localement le 21/10/2026. Tests supplémentaires : refus sans approbation, modification de requête/budget/identifiant/contenu documentaire, mission périmée, impossibilité pour un client de proposer/approuver, idempotence des propositions/validations et absence d’exécution pendant ces phases. Parcours navigateur simulé : préparation, invalidation après modification, validation puis clic d’exécution séparé ; contrôle de l’absence de « Tâches par agent » pour les clients. Résultats définitifs dans la CI de la PR39.

Sources : code de la branche feat/admin-agent-routing-20261021, PR https://github.com/benchamply-cmyk/FlemmeV2.0/pull/39 ; suivi https://benchp.atlassian.net/browse/FLEMME-6 . Aucune fusion ni modification de la production pendant ce changement.
