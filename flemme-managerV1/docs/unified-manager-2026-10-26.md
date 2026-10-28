# Flemme Manager unique — architecture et migration — 26 octobre 2026

## Faits vérifiés et limites de l'audit

Base GitHub : [main@5d36cea](https://github.com/benchamply-cmyk/FlemmeV2.0/commit/5d36ceac7242e4cb69735ce2a2d9146af03dd1f4). Branches distantes lues : main, beta, archive/pr34-illustrations, archive/sauvegarde-v3-2026-10-20, archive/v4.1100. Aucun archivage réalisé dans cette opération. Les descriptions des anciennes PR ne sont pas une preuve de déploiement.

Render, lecture du 26/10 : service `srv-db7c17q5b2lc73fbs6ng`, branche main, déploiement manuel `dep-dbc3o8rrjlhs73anm6kg`, déclaré live sur 5d36cea depuis le 21/10 06:15:38 Europe/Paris. Auto-déploiement désactivé, offre free, chemin de health-check vide. La tentative de lecture HTTP de /health par l'outil web a échoué : disponibilité actuelle non certifiée. Aucun environnement secret consulté ou modifié. [Service](https://dashboard.render.com/web/srv-db7c17q5b2lc73fbs6ng).

Supabase, lecture du 26/10 : projet `yktpabnqkhwcshvjuncs` actif ; migrations 20261013233347 (V2), 20261014004025 (V3), 20261021015512 (V4). RLS activée sur conversations/messages/missions/events, runs/outputs/recoveries et originals. Ces métadonnées ne prouvent pas à elles seules toutes les permissions RPC. Aucun contenu client consulté ni migration exécutée.

Netlify : configuration du dépôt conservée. L'audit local antérieur du 26/10 indique main@5d36cea publié, déploiement `6ad83be04295db3446973596` ; ce constat est une référence documentaire, pas une nouvelle inspection du Dashboard dans cette intervention. Le statut GitHub combiné de main ne contient aucun statut Netlify permettant de le recertifier. [Déploiement référencé](https://app.netlify.com/projects/flemmeorg/deploys/6ad83be04295db3446973596).

[FLEMME-6](https://benchp.atlassian.net/browse/FLEMME-6), lu le 26/10, est toujours À faire, dernière mise à jour 09/10. [Confluence 131097](https://benchp.atlassian.net/wiki/spaces/DCHPLY/pages/131097), lu le 26/10, décrit encore V1 sans mémoire. Il s'agit de documents historiques, pas de l'état technique actuel. Synchronisation par références seulement.

Le rapport local `operations-2026-10-21/activation-v4-2026-10-21.md` documente : recherche web réellement appelée sur un lave-linge, extraction de deux PDF fictifs avec écart 220 EUR, mais qualification leasing bloquée par des préférences facultatives puis deux HTTP 502. La cause fournisseur des 502 n'est pas établie. Les nouveaux tests reconstruisent le besoin de façon anonymisée ; ils ne prétendent pas reproduire une erreur fournisseur réelle ni être une copie exacte de messages clients.

## Avant / après — décisions d'architecture

Avant : un seul objet SDK `Agent` existe déjà, mais il ne qualifie que les besoins. Les services déterministes sont rangés sous `agents/`, les résultats comptent Search/Compare/Writer/Quality comme agents et les interfaces parlent d'affectations à plusieurs agents. Le navigateur appelle V2, V3 et V4 séparément. La qualification Netlify possède son propre appel OpenAI.

Après : un seul agent conversationnel, **Flemme Manager**, reste défini dans `agents/manager.py`, avec modèle existant configurable. Aucun handoff, aucun nouveau modèle et aucun agent autonome spécialisé. Le runtime applicatif `services/manager_runtime.py` orchestre les commandes explicites et approuvées. Il n'utilise pas un second appel au modèle pour choisir une fonction que le plan approuvé détermine déjà. Le SDK reste dédié à la qualification conversationnelle ; les outils d'exécution sont invoqués par le runtime applicatif après approbation, pas librement par le modèle.

Les implémentations de sélection, calcul, rapport et qualité sont extraites dans `capabilities/search.py`, `compare.py`, `reports.py`, `quality.py`. Les anciens fichiers restent des façades d'import compatibles. Web, lecture HTTPS sûre, extraction PDF/DOCX/TXT et preuves littérales restent dans `tools/`, acquisition persistante dans `services/acquisition.py`. Leur logique existante est préservée et testable. Aucun gros module fusionnant tous les traitements.

La projection `public_view` expose `agent: Flemme Manager`, `tools` et `tool_activity` sur la nouvelle API. Elle projette aussi les anciens plans en étapes d'outils. Elle ne réécrit aucun historique : les anciens champs et libellés restent stockés et accessibles via V2/V3/V4.

## Contrat public canonique

Tous les nouveaux appels navigateur passent par `/api/manager` sur le serveur FastAPI existant. Le contrat OpenAPI contient une union discriminée `kind` pour les missions.

| Opération | Route relative |
| --- | --- |
| Droits / capacités | GET /access ; GET /capabilities (admin) |
| Conversations | GET/POST /conversations ; GET /conversations/{id} |
| Analyse persistante | POST /conversations/{id}/analysis |
| Reprise d'analyse | POST /conversations/{id}/analysis/recover (admin) |
| Mission et événements | GET /conversations/{id}/mission ; POST …/mission/events (admin) |
| Plan puis consentement distinct | POST …/plans ; POST …/plans/{plan_id}/approve (admin) |
| Exécution | POST …/missions (admin) |
| Résultats / reprise | GET …/results ; POST …/missions/recover (admin) |
| Originaux privés | GET …/missions/{run_id}/documents/{index} |

Une commande de mission contient `{kind: acquisition, request: Acquire}` ou `{kind: delivery, request: DeliveryRequest}`. UUID, révision, champs et taille sont bornés ; champs supplémentaires refusés. L'acquisition canonique exige une base explicite `total` ou `per_month`. Les prix V3 conservent leurs autres bases, devises et taxes. Les corps sont plafonnés avant validation, même sans Content-Length. Les erreurs de validation ne renvoient pas le document ou les valeurs d'entrée ; réponses sans cache partagé et nosniff.

Les sessions Supabase sont vérifiées auprès d'Auth ; les jetons utilisateur sont transmis aux RPC sous RLS, jamais une clé service-role. Clients : leur propre analyse/historique. Exécution : rôle admin vérifié côté serveur, plan validé lié au workflow, identifiant, révision, paramètres et SHA-256 des documents. Modification ou concurrence : 409. Rejeu : même identifiant et réservation atomique existante, pas de relance automatique. Les anciens endpoints gardent leur contrat et leurs dépendances de sécurité.

`manager-v2-api.js` utilise les routes canoniques par défaut, tout en gardant les méthodes consommées par le frontend. L'option explicite `{legacy: true}` en quatrième paramètre garde les anciens contrats, sans fallback automatique après une erreur réseau. Les formulaires présentent les fonctions comme outils d'un seul Manager et permettent de choisir prix total ou loyer mensuel.

L'adaptateur historique Netlify qualifie désormais via `/api/manager/analyze`, avec la session appelante, redirections interdites et origine HTTPS serveur validée. L'ancienne qualification directe reste disponible uniquement avec `FLEMME_LEGACY_NETLIFY_QUALIFIER=true` pour retour arrière. Les missions historiques Netlify et leur comparateur déterministe restent conservés dans leur stockage existant : pas de conversion silencieuse ni fusion d'identifiants avec fm_v2. Les nouveaux parcours utilisent la console conversationnelle du Manager.

## Qualité, sécurité et coûts

Recherche : un appel Responses web_search borné, sources techniques fournisseur, dates de consultation, lecture HTTPS publique avec DNS public/IP épinglée, refus des redirections/proxies/SSRF. Prose du modèle exclue des preuves. Documents : signatures, tailles, parseur isolé, références de pages ou blocs et empreintes conservées. Pas d'OCR ni de validation universelle de tableaux complexes. Les protections contre injections bornent les actions possibles ; elles ne garantissent pas qu'un texte hostile n'affectera jamais une qualification.

Comparaison : Decimal ; regroupements par devise/base/taxes ; conditions inconnues conservées. Une recherche web au comptant avec base total compare maintenant le prix total plutôt que le loyer mensuel. L'extraction V4 reste conservatrice français/EUR : une autre devise n'est pas convertie ou inventée. La qualité recalcule et vérifie les preuves ; elle ne certifie pas disponibilité ou éligibilité commerciale et partage certaines fonctions avec le calcul initial.

Qualification : 2 000 tokens de sortie, 30 secondes, un tour SDK, traces fournisseur désactivées. Le service mémoire conserve message et événement générique en cas d'échec. Le SDK fournisseur peut avoir ses propres reprises réseau ; aucune garantie de facture exacte n'en est déduite.

Recherche canonique : variables serveur `FLEMME_RUN_BUDGET_USD` et `FLEMME_WEB_RUN_UPPER_USD` obligatoires à la frontière payante. Deux Decimal positifs finis, estimation supérieure déclarée <= plafond <= 10 USD. Absence/configuration invalide : refus avant fournisseur, tentative enregistrée après réservation. Les rejeux déjà terminés ne passent pas par cette frontière payante. Ce sont des règles d'admission fondées sur une estimation opérateur, **pas un plafond bancaire/fournisseur garanti**, ni un cumul mensuel transactionnel. Les quotas V4 utilisateur/globaux et concurrence restent ceux de la migration existante. Les plafonds fournisseur et le suivi monétaire réel restent à vérifier avant activation.

Aucun outil n'achète, ne réserve, ne signe ou n'envoie à un tiers. Le consentement approuve la recherche/extraction prévue ; il n'autorise pas d'action commerciale engageante.

## Plan de migration et déploiement — validation requise

1. Examiner la PR et ses limites, attendre les tests CI Python, site, PostgreSQL 16 et navigateur simulé. Aucune fusion automatique.
2. En préproduction autorisée, vérifier session client/admin, RLS/RPC et reprise sur coupure. Relire les trois migrations réellement installées ; ne pas réappliquer aveuglément manager-admin-agents.sql. **Aucune nouvelle migration n'est nécessaire pour ce refactoring.**
3. Vérifier la présence des variables existantes sans lire leurs valeurs : OPENAI_API_KEY, OPENAI_MODEL, paramètres Supabase V2, origines CORS exactes et flags V2/V3/V4. Configurer les deux estimations/plafonds de recherche après revue des tarifs fournisseur ; ne pas activer un budget fictif.
4. Après validation explicite seulement, fusionner puis déployer le backend Render avant le frontend. Vérifier /health, les 401 sans session, l'OpenAPI canonique et les parcours authentifiés. Recommander un HTTP health-check /health, sans changer le service pendant cette PR.
5. Déployer ensuite le frontend et l'adaptateur Netlify. `FLEMME_MANAGER_API_URL`, si configuré, contient uniquement l'origine HTTPS du backend, aucun secret, chemin ou redirection. Aucun besoin de recopier une clé OpenAI vers Netlify pour la nouvelle qualification.
6. Rejouer un leasing réel anonymisé et borné, un achat au comptant et deux devis autorisés ; inspecter contenu des sources, taxes, devises, dates, inconnues, coût et événements, pas seulement les codes HTTP. Vérifier la distinction statut live/disponibilité et l'endormissement Render free.
7. Retour arrière : frontend précédent ou option legacy, backend précédent compatible avec les mêmes tables, option Netlify explicite si nécessaire. Aucun rollback SQL destructif, suppression ou archivage. Conserver originaux, erreurs et toutes les tentatives. Les tables historiques Netlify restent lisibles.

La PR et son commit portent `[skip netlify]` pour empêcher les aperçus/branch deploys automatiques pendant la revue ; Render main reste inchangé. Aucun déploiement, nouvelle synchronisation continue ou tâche planifiée activée.

## Validation locale

Base avant modification : 218 tests Python. Après refactoring : résultats détaillés dans le rapport de validation voisin. Tests Python d'intégration HTTP sans réseau, contrats frontend, calculs Decimal et cas leasing reconstruits. Pas d'appel OpenAI payant, pas de test client réel sur la nouvelle version, car celle-ci n'est pas déployée. E2E navigateur local bloqué par le runtime disponible ; ne pas assimiler cette tentative à une réussite. Les vérifications CI sont nécessaires avant fusion.

## Références techniques consultées le 26/10/2026

- [OpenAI Agents SDK](https://developers.openai.com/api/docs/guides/agents/sdk) et [Web Search Responses](https://developers.openai.com/api/docs/guides/tools-web-search).
- [Supabase — sécuriser l'API](https://supabase.com/docs/guides/api/securing-your-api). Changelog Markdown non récupérable par l'outil web dans cette session ; aucune nouvelle API Supabase ni modification de schéma introduite.
- [Render — déploiements](https://render.com/docs/deploys) et [health checks](https://render.com/docs/health-checks).
- [Netlify — skip deploy](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/#skip-a-deploy).
