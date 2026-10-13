# Flemme Manager V1.1 — rapport du 13 octobre 2026

## Faits vérifiés

Base GitHub : `main`, commit `d52d3c013085c95983bee0add3970afe34503d2a`.
Branche : `fix/manager-v1-1-stabilisation-20261013`.
Source de l'analyse : [rapport historique](validation_report.md), campagnes du 8 octobre 2026, consulté le 13 octobre 2026. Le rapport original reste intact.

Le code main utilisait exclusivement le modèle, puis rejetait les combinaisons invalides. Le rapport contient des erreurs ModelBehaviorError et des sorties incohérentes (catégorie/workflow, statut/drapeau, questions sans informations manquantes). Les détails exacts des premiers ModelBehaviorError ne sont pas disponibles : leur cause précise reste une hypothèse.

## Décisions appliquées

- Qualification locale étroite avant vérification de clé : F03, F06, F07, F08, F09 et F10 produisent une sortie structurée valide sans appel modèle.
- F03 conserve service_provider/trouver_prestataire/ready : ready signifie brief qualifié, sans recherche ni contact. Cette règle couvre uniquement un besoin de plomberie avec lieu, période, budget et panne explicites.
- F06 : other/null/out_of_catalog, sans annoncer une chanson livrée.
- F07 : other/null/human_intervention_required, orientation juridique sans demander les clauses.
- F08 : service_provider/trouver_prestataire/human_intervention_required ; sécurité en premier et aucun appel prétendu. On conserve le domaine du besoin ; le workflow est un identifiant de qualification, pas un outil d'urgence.
- F09 : travel/organiser_voyage/human_intervention_required ; aucune collecte de paiement ou précision destinée à rendre possible une réservation indisponible.
- F10 : other/null/human_intervention_required ; aucun message envoyé.
- F01 reste needs_information si seules les sommes sont fournies ; le prompt demande les prestations/exclusions. F02/F04/F05 restent sur le chemin modèle, couvert par les tests de schéma/API simulés et du harnais, sans preuve de conformité live.
- Les invariants rejettent les sorties incohérentes sans correction silencieuse : intervention humaine sans questions, absence de doublons, priorités uniques 1 puis 2.
- Un contrôle textuel conservateur rejette certaines promesses/actions externes explicites. Il ne démontre pas la véracité de toute formulation.
- Le runner est limité à un tour ; aucune régénération supplémentaire n'est ajoutée. Ce plafond ne désactive pas les retries de transport propres au client SDK.

## Vérifications exécutées

Depuis la racine du dépôt :

```sh
.venv/bin/python -m pytest flemme-managerV1/tests -q
.venv/bin/python -m compileall -q flemme-managerV1/src
git diff --check
```

Résultat : **64 tests réussis en 1,60 s**, compilation réussie, diff sans erreur d'espacement.
Python 3.12.14 ; pytest 9.1.1 ; Pydantic 2.14.1 ; FastAPI 0.143.0 ; openai-agents 0.23.1.

Les tests désactivent la découverte dotenv, la clé et le tracing SDK, et bloquent les connexions socket. Ils couvrent les réponses HTTP réelles de l'application avec règles locales, les contrats structurés, les erreurs 502 sans fuite de diagnostics, les variantes accentuées, négations, demandes de brouillons, sécurité prioritaire et absence de relance métier.
Appels API OpenAI réels : **0**. Aucun coût d'inférence engagé par ces tests. L'installation des dépendances utilise le réseau ; elle n'appelle pas le modèle.

## Limites et tests nécessitant une autorisation

Les règles locales sont limitées à des formulations françaises reconnues par expressions régulières : elles ne constituent ni une compréhension générale ni un détecteur exhaustif d'urgence. Les autres demandes continuent vers le modèle ; une sortie invalide est refusée en 502, pas réparée silencieusement.

Une campagne réelle nécessite une autorisation explicite préalable pour utiliser une clé existante ou en créer une, choisir le modèle, fixer un plafond d'appels/coût et exécuter les scénarios synthétiques. À vérifier : F01/F02/F04/F05, paraphrases non couvertes de F03/F06/F07/F08/F09/F10, absence de promesses ou de résultats annoncés sans livraison, robustesse des sorties structurées et revue humaine des consignes urgentes. Aucun test live, déploiement ou validation du site flemme.org n'est affirmé ici.

## Préservation

Dossier et branche dédiés depuis main. Aucun fichier supprimé, aucun force-push, aucun historique réécrit, aucun contenu sources/ touché. Les évolutions de code sont des commits Git réversibles ; le rapport historique n'est pas modifié. Les checkouts préexistants et leurs changements en cours restent intacts. Aucune fusion demandée ou effectuée.
