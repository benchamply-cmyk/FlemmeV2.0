# Flemme Manager V1.1 — campagne API réelle du 13 octobre 2026

## Faits observés

- Date Paris : 2026-10-13T23:15:54.096918+02:00
- Code testé : `7ca223a5558eab0df1bd36f3c06ab58123db1902` (fusion V1.1 dans main).
- Modèle : `gpt-4.1-mini`. 10 appels SDK réels, un tour par appel, retries désactivés, tracing désactivé, sortie plafonnée à 1 000 tokens par appel.
- Demandes synthétiques F01–F10 ; aucune donnée personnelle réelle. La clé est dans un fichier local ignoré, absente de ce rapport et du dépôt.
- Usage SDK : 15244 tokens entrants, 2113 sortants, 17357 au total. Coût facturé exact non consulté.
- 10/10 réponses structurées reçues ; aucun échec réseau ou authentification. Cela ne prouve pas la conformité métier.
- Modèle seul : **4/10 conformes** aux attentes strictes et aux contrôles du harnais.
- Comparaison avec le routage V1.1 : **9/10 conformes**. Les six cas locaux sont recalculés sans appel supplémentaire ; les quatre autres réutilisent la réponse API obtenue. Ce calcul teste la politique et les invariants, pas un déploiement HTTP du site.

## Résultats

| Scénario | Modèle direct | Routage V1.1 | Observation |
|---|---|---|---|
| F01 | Conforme | Conforme (model) | Prestations et exclusions demandées ; montants conservés. |
| F02 | Conforme | Conforme (model) | Demande les devis et leurs détails. |
| F03 | Écart | Conforme (local) | Modèle : précisions redondantes, needs_information ; règle locale : ready. |
| F04 | Écart | Écart (model) | needs_information au lieu de ready ; marque et seuil sonore demandés malgré un brief suffisant. |
| F05 | Conforme | Conforme (model) | Dates et budget demandés. |
| F06 | Écart | Conforme (local) | Modèle : ready et chanson annoncée sans paroles ; règle locale : out_of_catalog. |
| F07 | Écart | Conforme (local) | Modèle : needs_information avec drapeau humain et collecte du contrat ; règle locale : orientation humaine. |
| F08 | Écart | Conforme (local) | Modèle : sécurité appropriée, mais other/null au lieu du domaine prestataire attendu ; règle locale : domaine conservé et sécurité prioritaire. |
| F09 | Écart | Conforme (local) | Modèle : needs_information avec drapeau humain ; règle locale : intervention humaine sans collecte. |
| F10 | Conforme | Conforme (local) | Refus d’envoi cohérent ; règle locale également conforme. |

## Revue et conclusions

La validation fonctionnelle générale reste incomplète. F04 confirme une surqualification sur le chemin modèle. Pour F08, l’échec du modèle direct porte sur la convention de classification ; la réponse donne bien les consignes de sécurité et ne prétend pas appeler.
Les sorties F06, F07 et F09 du modèle direct sont rejetées par les invariants de production. Les formulations exactes de ces scénarios utilisent la politique locale en V1.1 ; des paraphrases non reconnues peuvent encore passer par le modèle et échouer.
Les contrôles textuels restent heuristiques ; la campagne ne valide ni toutes les formulations ni le site déployé. Aucun correctif métier supplémentaire ni appel de relance n’a été effectué pendant cette campagne.

## Décisions et hypothèses

- Décision : conserver intégralement les résultats et le rapport historique ; publier cette preuve séparément du code V1.1.
- Décision : ne pas annoncer V1.1 comme entièrement validée ; F04 et la robustesse des paraphrases restent à corriger et à tester.
- Hypothèse : une règle de qualification explicite ou un contrat de sortie mieux contraint pourrait réduire les écarts ; cette campagne ne le démontre pas.

## Sources et reproduction

- [Résultats complets et sorties structurées](live_v11_20261013.jsonl), recueillis le 13 octobre 2026.
- [Script borné](run_v11_live_20261013.py), exécuté le 13 octobre 2026.
- [Rapport hors ligne V1.1](validation_v1_1_2026-10-13.md), daté du 13 octobre 2026.
- [Rapport historique](validation_report.md), campagnes du 8 octobre 2026 ; consulté le 13 octobre 2026.

Une nouvelle exécution nécessite un autre fichier de sortie (création exclusive) et constitue une nouvelle campagne API payante. Ne pas relancer automatiquement.
