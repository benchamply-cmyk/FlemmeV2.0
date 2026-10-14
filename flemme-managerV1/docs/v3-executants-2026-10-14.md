# V3 — Agents exécutants — première étape — 14 octobre 2026

## Faits, hypothèses et décisions

Faits : main@f363f1e contient la V2 Supabase, son interface et les corrections V1.1/F04. Les quatre modules Python Search, Compare, Writer et Quality étaient des points d'extension. Des implémentations déterministes existent déjà sur la branche locale feature/flemme-manager-v3-specialists et dans les fonctions Netlify de Gestion admin. Ces contenus sont conservés ; cette branche réemploie les spécialistes Python et les raccorde à la mémoire Supabase de la V2.

Décision pour cette première étape : exécution des quatre spécialistes sur les sources fournies par l'utilisateur, sans nouvel appel OpenAI, sans navigation web ni contact extérieur. Une source est une donnée, jamais une instruction. Une URL de référence n'est pas consultée. Les critères et disponibilités restent déclarés et les inconnues ne deviennent pas des confirmations.

Hypothèse : des offres structurées et des critères explicitement confirmés permettent une première production utile sans dépenses API. L'utilité métier reste à évaluer avec des utilisateurs ; les tests ne prouvent pas l'actualité ni l'exactitude des sources fournies.

## Capacités livrées

- Search sélectionne les sources du type associé au workflow sauvegardé et les ordonne selon une similarité lexicale simple. Deux devis minimum pour comparer des devis ; au moins une offre pour les trois autres workflows. Aucune garantie d'exhaustivité.
- Compare utilise Decimal pour les prix. Il sépare devises, bases de prix et taxes, conserve les égalités et ne calcule pas de pourcentage sur un minimum nul. Budget, lieu, date, durée, apport et caractéristiques sont comparés seulement lorsqu'ils sont structurés ; un critère absent reste inconnu. Aucun classement global entre groupes incompatibles.
- Writer produit un rapport Markdown à partir des résultats calculés, des sources datées et de leurs limites. Aucun texte modèle non contrôlé ni HTML fourni n'est exécuté.
- Quality contrôle les références, le workflow, les calculs, les inconnues et la concordance du rapport. Un livrable altéré est refusé ; le brouillon rejeté et la tentative sont conservés pour l'utilisateur propriétaire.

Les workflows comparer_devis, trouver_prestataire, rechercher_produit et organiser_voyage exécutent la même chaîne Search → Compare → Writer → Quality. Le workflow vient de la dernière qualification valide sauvegardée ; l'utilisateur ne peut pas le choisir arbitrairement dans le corps de la requête. Les demandes nécessitant un humain, non qualifiées, bloquées, annulées ou terminées ne peuvent pas démarrer une production.

## Mémoire et accès

Migration additive : supabase/manager-specialists-v3-20261014.sql. Elle nécessite la migration V2. Nouveau schéma fm_v3 avec runs, outputs et recoveries ; sources/contraintes, résultats et récupérations sont immuables, horodatés et privés. RLS et RPC vérifient le propriétaire, sans service_role. Le RPC V2 et ses tables ne sont pas remplacés. Les événements de production s'ajoutent au journal V2.

Le démarrage réserve un identifiant de requête et une révision dans une transaction verrouillant la conversation. La mission passe en cours. Une répétition achevée renvoie le résultat conservé sans nouvelle production ; une tentative déjà en cours renvoie 409. Les mêmes identifiants avec des entrées ou résultats différents sont refusés.

Le résultat final est conservé même si la mission a été modifiée ou annulée pendant la production. Il est alors marqué stale et nécessite une validation humaine ; il ne reprend ni ne termine la mission. Après cinq minutes, une récupération manuelle libère une tentative interrompue sans effacer ses sources. Les résultats tardifs restent enregistrables. Une production réussie ne clôture pas automatiquement la mission.

## API et interface

Activer explicitement FLEMME_V3_ENABLED=true après installation de la migration et déploiement du code. FLEMME_V2_ENABLED et sa configuration Supabase restent nécessaires. Session utilisateur confirmée obligatoire ; réponses privées non mises en cache. Aucun nouveau secret.

- POST /api/v3/conversations/{id}/deliveries : request_id UUID, expected_revision, sources et constraints.
- GET /api/v3/conversations/{id}/deliveries : toutes les tentatives, résultats et récupérations du propriétaire.
- POST /api/v3/conversations/{id}/deliveries/recover : identifiant de tentative, révision actuelle et note.

L'espace conversations ajoute un formulaire d'offres : titre, extrait, date, référence, prix/devise/base/taxes, lieu, disponibilité, durée, apport et prestations. Le budget et les critères de comparaison sont explicitement saisis. Les critères non renseignés restent non vérifiés, même s'ils figurent dans le brief. Les caractéristiques structurées supplémentaires sont prises en charge par l'API ; leur saisie avancée dans le site reste une extension future. Les livrables sont consultables par une action explicite ; aucune synchronisation continue ni polling.

## Validation et activation restante

148 tests Python passent, dont 40 nouveaux par rapport à la V2 ; 38 tests JavaScript passent. En local, 43 assertions SQL V2 et 28 SQL V3 passent sur PGlite ; les migrations sont rejouées après insertion d'historiques, sans perte. La CI utilise PostgreSQL 16 et ajoute les tests à deux sessions concurrentes : 44 assertions V2 et 29 V3 attendues. Compilation, build et syntaxe vérifiés. Parcours navigateur local simulé : mission qualifiée, saisie de deux devis, production affichée et état en cours. Aucune écriture sur la base Supabase distante, aucune fusion ou publication réalisées pour cette V3 à ce stade.

Après validation de la PR : appliquer manuellement la migration, déployer le serveur et le site, puis activer la variable V3. Vérifier avec deux comptes et des données fictives identifiées ; conserver les tests et tentatives selon la règle de conservation du projet. Les déploiements automatiques ne sont pas activés.

## Étapes suivantes proposées

1. Tester l'utilité des rapports sur sources fournies et compléter les critères spécifiques à chaque workflow.
2. Ajouter une recherche web réellement outillée, avec provenance, dates, protection des accès réseau et limites de coût explicites. Ne pas présenter la sélection lexicale actuelle comme une recherche web.
3. Enrichir la rédaction si nécessaire avec l'agent modèle existant, en gardant les calculs et contrôles déterministes. Une campagne modèle réelle devra être bornée et autorisée.
4. N'ajouter contacts, envois ou réservations qu'avec outils dédiés et validation humaine explicite.

## Sources consultées le 14 octobre 2026

[Dépôt et PR #23](https://github.com/benchamply-cmyk/FlemmeV2.0/pull/23), branche locale préservée feature/flemme-manager-v3-specialists@0732029, [suivi FLEMME-6](https://benchp.atlassian.net/browse/FLEMME-6), [référence Confluence](https://benchp.atlassian.net/wiki/spaces/DCHPLY/pages/131097), [fonctions Supabase](https://supabase.com/docs/guides/database/functions), [Agents SDK](https://developers.openai.com/api/docs/guides/agents/sdk). Le journal Supabase a été lu depuis sa source officielle après refus du type Markdown par l'outil web ; le changement PostgreSQL 17.11 a été consulté. Aucun contrat existant n'est remplacé.
