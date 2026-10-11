# Manager sur Netlify — 11 octobre 2026

Actualisation : la clé dédiée enregistrée sur Netlify s'appelle `GESTION_ADMIN_KEY_OPENAI`. Le Manager la lit en priorité ; `OPENAI_API_KEY` reste compatible en son absence. Aucun secret n'est copié ni affiché. Les deux variables doivent être disponibles dans le contexte concerné si elles sont utilisées.

Décision : héberger la qualification sur le site Netlify existant. Aucun serveur Python supplémentaire. Les fichiers Python et leur mémoire SQLite restent conservés ; cette version n'importe pas leurs anciennes missions et ne remplace pas leurs règles de production.

## Activation

1. Exécuter `supabase/manager-netlify.sql` dans le SQL Editor du projet existant, après `gestionadmin.sql`. Le script ajoute une table privée et trois fonctions réservées à l'administrateur. Il est rejouable et ne supprime aucune donnée.
2. Netlify : `OPENAI_API_KEY` secret, portée Functions, contextes de prévisualisation et de production concernés. Facultatif : `OPENAI_MODEL`, défaut `gpt-4.1-mini`. `SUPABASE_URL` et `SUPABASE_ANON_KEY` restent nécessaires. `SITE_ID` est réservé et fourni automatiquement par Netlify.
3. Laisser `FLEMME_MANAGER_URL` et `FLEMME_MANAGER_TOKEN` absents pour utiliser le Manager Netlify. S'ils sont présents, le raccordement HTTPS externe existant est conservé.
4. Reconstruire la prévisualisation PR 14. Dans une demande : « Qualifier cette demande avec le Manager ». Voir ensuite « Agents et missions ». Chaque clic explicite peut consommer du crédit OpenAI ; aucune qualification automatique.

## Comportement et limites

L'identité propriétaire est vérifiée avant tout accès ou appel IA. L'API utilise le JWT propriétaire, les droits Supabase et des transactions en base ; aucun jeton service-role. Les demandes ne sont jamais modifiées et aucun message n'est envoyé au client par la qualification. Le brief transmis à OpenAI contient le besoin, les précisions, la catégorie, l'échéance et l'aide attendue ; les champs email, fichiers et voix ne sont pas transmis. Le texte du besoin peut lui-même contenir des informations personnelles.

Réservation atomique par demande : les clics simultanés ne lancent qu'un appel. Une réservation interrompue expire après 15 minutes. Le résultat est enregistré seulement pour la réservation courante. Les états et leurs motifs ont un contrôle de révision ; bloquer pendant la qualification conserve le résultat sans lever le blocage. Une erreur conserve une tentative échouée et exige une relance explicite. Aucun diagnostic ne contient de clé ou de réponse brute du fournisseur.

Le Manager produit un brief interne, un workflow proposé et les questions manquantes. « Qualifiée » signifie brief préparé, pas autorisation de traitement automatique. L'achat, le contact, la réservation, l'envoi ou le danger immédiat nécessitent un humain. Search, Compare, Writer et Quality ne sont pas déployés dans cet adaptateur ; zéro livrable est affiché. Les règles structurées avancées du Manager Python, les sources, fichiers et vocal restent à raccorder avant la production de livrables.

## Validation

Tests hors ligne : identité, identifiants, clé manquante, réservation concurrente, sortie IA invalide, action externe, échec fournisseur, stockage du résultat, pagination, conflit de révision et migration manquante. Un appel IA réel et l'exécution SQL doivent être confirmés séparément ; les tests simulés ne prouvent pas le crédit API ni les permissions de la base déployée.

## Sources consultées le 11 octobre 2026

- [Netlify Functions](https://docs.netlify.com/build/functions/overview/) : fonctions JavaScript déployées avec le site.
- [OpenAI Responses](https://platform.openai.com/docs/api-reference/responses) : sortie structurée, `store:false` et réponse vérifiée avant stockage.
- [Supabase fonctions](https://supabase.com/docs/guides/database/functions) : transactions et contrôle d'identité dans la base.
- Code conservé : `flemme-managerV1/src/flemme_manager/schemas.py`, `services/qualification_rules.py`, `services/mission_service.py`.

## Vérification réelle du 11 octobre 2026

L'administrateur confirme `manager-netlify.sql` exécuté sans erreur. La prévisualisation Netlify au commit `8526234` est déployée avec succès. Le centre lit le stockage privé et a créé une mission liée à la demande `FL-RG8FJ`, dont le besoin est « fff ». Deux tentatives de qualification sont conservées, sans modification de la demande ni message client. Le diagnostic de la seconde tentative indique un refus OpenAI de la clé (HTTP 401). Une clé acceptée dans `OPENAI_API_KEY`, suivie d'une reconstruction, reste nécessaire pour valider la qualification réelle. Les 16 tests hors ligne passent. Aucune publication en production n'a été réalisée.
