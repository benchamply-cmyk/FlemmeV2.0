# Gestion admin — 11 octobre 2026

## Décisions confirmées

Centre de contrôle à `https://www.flemme.org/gestionadmin`, sur le domaine existant. Propriétaire : compte confirmé `ben.champly@gmail.com` (instruction de Benjamin, 11 octobre 2026). L'URL sans www conserve le comportement de domaine existant ; aucune modification DNS.

## Implémentation

- Connexion sur la page admin avec les identifiants Supabase existants ; connexion par lien et récupération dans l'espace personnel.
- Reprise des demandes, filtres, statut, mot client, pièces jointes et discussion de l'espace équipe.
- Brigade : lecture serveur de toutes les candidatures Netlify `facilitateur`, regroupement par référence `BR-…`, conservation des étapes originales.
- Ambassadeurs : demandes Supabase dont `ambassadeur=true`, regroupement par contact. Ce consentement n'est pas une candidature validée.
- Décisions internes : journal privé en ajout uniquement ; historique du statut et du mot client avant/après, réponses, notes et associations demande/mission.
- Agents : passerelle HTTPS vers l'API Manager V2, briefs, résultats des spécialistes, qualité, historique et commandes d'état avec contrôle de révision. Les transitions disponibles suivent le Manager existant. Bloquer interdit les prochaines productions du pipeline ; cela n'interrompt pas une exécution déjà lancée.
- Une demande se relie à une mission existante par son identifiant. Aucune mission n'est créée ni exécutée automatiquement. Une mission terminée n'envoie pas automatiquement son résultat au client.
- L'ancien lien équipe conduit au centre admin ; les anciens fichiers et une copie de l'entrée équipe restent conservés. Les membres de la table équipe sont préservés, mais leurs droits globaux sont remplacés par le contrôle du propriétaire.

## Sécurité

`supabase/gestionadmin.sql` épingle l'UUID du propriétaire dans une table inaccessible aux visiteurs et aux comptes connectés. Aucun utilisateur ne peut s'auto-attribuer le rôle. La fonction `est_equipe()` délègue à `est_admin()` : les politiques existantes protègent aussi les anciens points d'accès aux demandes, discussions et fichiers. Les opérations admin vérifient de nouveau l'identité en base.

La passerelle Netlify vérifie le JWT auprès de Supabase et la propriété avant toute lecture Netlify/Manager. Les jetons Netlify et Manager restent dans les variables serveur. Routes et commandes sont limitées ; pas de proxy arbitraire. Réponses privées sans cache. Le service worker exclut l'admin et les API et change de version.

## Mise en service, ordre requis

1. Confirmer que le compte propriétaire existe et a confirmé son e-mail dans Supabase.
2. Exécuter `supabase/gestionadmin.sql` après la migration existante `supabase/espace.sql`. La transaction échoue sans changement si le compte manque. Le script est rejouable. Ne pas rejouer l'ancien `espace.sql` ensuite : il rétablit l'ancienne fonction `est_equipe()`.
3. Configurer les variables de la fonction sur Netlify :
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY` : même projet que le site. Le build connaît aussi le JSON de configuration, mais la fonction serveur exige ces variables.
   - `NETLIFY_ADMIN_TOKEN` : jeton Netlify autorisé à lire les formulaires du site ; `SITE_ID` fourni par Netlify ou configuré explicitement.
   - `FLEMME_MANAGER_URL` : origine HTTPS de l'API Manager hébergée ; `FLEMME_MANAGER_TOKEN` : jeton opérateur existant, correspondant à `FLEMME_V2_TOKEN` côté Manager, avec V2 activée. Ne jamais saisir ces jetons dans les fichiers ou le navigateur.
4. Déployer le site bêta existant via Netlify. Aucune création d'un second site ni migration d'hébergement.
5. Vérifier en production : visite anonyme refusée, propriétaire accepté, autre compte et ancien membre équipe refusés, lecture des fichiers limitée, une candidature en deux étapes regroupée, commande de blocage historisée puis reprise, conflit de révision refusé.

Sans ces réglages, les services concernés sont affichés indisponibles. La proposition GitHub ne constitue pas un déploiement en production.

## Validation et limites

- 7 tests automatisés de la passerelle : anonyme, autre compte, JWT refusé, commandes invalides, jeton serveur/conflit de révision, pagination Brigade, intégration indisponible.
- Vérification de la syntaxe JavaScript et du build du site.
- Vérification visuelle de la connexion et des demandes/Brigade/agents sur une démo explicitement fictive (`tests/gestionadmin-preview.html`). Cette démo n'appelle aucun service et ne constitue pas un contournement du contrôle de production.
- La migration n'a pas été exécutée sur une base réelle ; les permissions réelles, Netlify Forms et le Manager hébergé restent à vérifier après configuration.
- Faits : les données historiques seulement dans Netlify ne sont pas importées en Supabase. Le tableau Demandes et les ambassadeurs utilisent les demandes déjà conservées en Supabase. L'historique Netlify antérieur peut donc exiger un import explicite ultérieur, sans écrasement.

## Sources consultées le 11 octobre 2026

- Code existant : `flemme-web-beta/equipe.js`, `rejoindre.js`, `sb.js`, `supabase/espace.sql` ; dépôt [FlemmeV2.0](https://github.com/benchamply-cmyk/FlemmeV2.0), main `6ea2585e3c7c135bd91f8697fe5c25d0dcce8362`.
- Code Manager local : `routes/conversations.py`, `persistence/store.py`, `workflows/qualification.py`, `services/mission_service.py`. Ces fonctions sont présentes dans le checkout de travail ; leur déploiement n'est pas établi.
- [Netlify API : formulaires et pagination](https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/).
- [Supabase : fonctions de base de données](https://supabase.com/docs/guides/database/functions), [gestion des comptes](https://supabase.com/docs/guides/auth/managing-user-data).
- Référence de suivi fournie : [FLEMME-6](https://benchp.atlassian.net/browse/FLEMME-6). Documentation de référence : [Confluence Flemme](https://benchp.atlassian.net/wiki/spaces/DCHPLY/pages/131097). Aucune synchronisation continue.
