# FLEMME mobile — bêta native

Implémentation iOS et Android de la maquette mobile validée dans la conversation du 28 octobre 2026 : deux onglets, vert sauge pastel #d8e7ce, budget facultatif et commission FLEMME de 10 % ajoutée au forfait du Brigadier.

## Correction Expo Go du 28/10/2026

La version 0.1.1 cible Expo SDK 58 et Expo Go SDK 58 sur iPhone : React 19.3, React Native 0.88 et modules natifs alignés. Le paragraphe SDK 54 ci-dessous décrit le choix historique initial, remplacé par cette correction. Les options de configuration devenues inutiles newArchEnabled et android.edgeToEdgeEnabled sont retirées. Le stockage expo-file-system/legacy reste compatible et conserve les snapshots existants.

Après récupération de cette version, arrêter Metro avec Ctrl+C, exécuter npm ci, puis npm start -- --clear --port 8082 et scanner le nouveau QR code. Le code métier, les comptes et la commission de 10 % ne changent pas.

Sources vérifiées le 28/10/2026 : https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/ ; https://expo.dev/changelog/sdk-58 ; https://github.com/expo/expo/blob/sdk-58/packages/expo/bundledNativeModules.json

## Décision d’architecture

Même dépôt que le site, application indépendante dans apps/mobile, branche feature/flemme-mobile issue de beta. Aucune dépendance à l’interface web, aucun déplacement ni remplacement de fichiers existants. L’app n’est pas une WebView. Un nouveau dépôt serait utile si une équipe, des droits d’accès ou un cycle de livraison séparés le justifient ; ce n’est pas nécessaire pour ce premier test.

React Native / Expo et TypeScript. SDK 54.0.37, React Native 0.81.5 et React 19.1.0, versions épinglées et verrouillées, effectivement vérifiées dans cet environnement. Le SDK n’est pas le dernier publié : il a été retenu pour une chaîne disponible et reproductible. Pour tester sur un téléphone dont Expo Go ne prend plus en charge SDK 54, utiliser une compilation native de cette version. L’évolution du SDK et la validation des exigences des stores précèdent une distribution publique.

## Lancer

Depuis ce dossier, avec Node 22.13 ou supérieur :

    npm ci
    npm start

Pour compiler et lancer en développement :

    npm run ios
    npm run android

iOS requiert macOS et Xcode ; Android requiert son SDK. Sur un téléphone physique, prévoir les outils et la signature de développement appropriés. Les identifiants org.flemme.mobile sont proposés et devront être confirmés avant la distribution.

Sans variables d’environnement : démonstration locale. Le bouton de profil permet de passer entre Benjamin, Lou et Camille et de vérifier les deux rôles. Trois tâches fictives sont disponibles. Les mutations sont sauvegardées dans de nouveaux snapshots locaux, sans effacer les précédents. La dernière version lisible est restaurée ; des données illisibles ne sont jamais remplacées par une remise à zéro. La démo ne partage aucune donnée entre téléphones.

## Mode connecté et comptes réels

Le connecteur Supabase REST est implémenté ; il n’est activé que si l’URL et la clé publique sont renseignées. Une configuration partielle produit une erreur plutôt qu’une bascule silencieuse vers la démo.

1. Utiliser un projet Supabase de test. Exécuter une fois backend/install.sql depuis son éditeur SQL. Le script transactionnel crée un schéma privé distinct, flemme_mobile_v1, et le seul point d’entrée public flemme_mobile_api. Il ne touche pas aux tables, fonctions ni données du site ou du Manager. Il échoue si ses objets existent déjà plutôt que de les remplacer.
2. Garder flemme_mobile_v1 hors de la liste des schémas exposés dans Data API. Le schéma public doit être exposé pour la RPC. Les tables privées n’ont aucun droit d’accès direct pour anon/authenticated ; RLS est activée. La RPC vérifie un compte confirmé, les propriétaires et les participants à chaque action.
3. Copier .env.example vers .env et renseigner EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY avec les valeurs publiques du projet. Aucune clé service_role ou sb_secret ne doit être embarquée. Redémarrer Metro après modification.
4. Activer l’authentification e-mail/mot de passe et la confirmation d’e-mail dans Supabase. Configurer l’adresse de retour du mail de confirmation ; l’utilisateur revient ensuite se connecter dans l’app. La création de compte et la connexion sont disponibles dans l’application.
5. Tester avec deux comptes sur deux appareils. Tirer la liste vers le bas pour actualiser les offres, messages et états ; pas de synchronisation continue ni de notifications push.

Les jetons d’accès restent en mémoire. Seul le jeton de renouvellement est conservé dans le coffre natif SecureStore ; aucun mot de passe n’est sauvegardé. Les renouvellements concurrents sont regroupés. Les annonces privées, conversations et paiements ne sont pas copiés dans la démo locale.

## Parcours et rémunération

- Déposer une flemme : titre, description, lieu, budget facultatif. Aucun champ ni traitement d’expiration.
- Proposer son aide : forfait, créneau, périmètre inclus/non inclus. Une proposition active par Brigadier et par tâche.
- Discussion privée entre déposant et auteur de l’offre. Pour renégocier le forfait, décliner l’ancienne offre et en proposer une nouvelle ; les versions restent dans l’historique.
- Accepter : écran récapitulatif distinct, prix Brigadier + frais FLEMME + total, puis attribution à un seul Brigadier. Le serveur verrouille la tâche et fige l’accord. Les autres offres restent enregistrées.
- Terminer : le déposant confirme la réalisation. Il peut déclarer avoir payé ; le Brigadier peut confirmer la réception. Ces indications restent déclaratives.
- Désaccord : l’un des deux participants à l’accord peut enregistrer un signalement. Aucune suppression d’offre, de message ou d’historique n’est disponible.

Calcul exclusivement en centimes : commission = arrondi au centime de forfait / 10. Exemple : 40 € au Brigadier, 4 € à FLEMME, total 44 €. Pour 40,05 €, frais de 4,01 €, total 44,06 €. Aucun frais minimal : les forfaits très faibles peuvent donner une commission arrondie à zéro.

La commission est calculée côté serveur et enregistrée dans l’accord, jamais acceptée depuis un total envoyé par le client. Paiement direct au Brigadier et commission séparée correspondent au test accompagné choisi. **Cette version n’encaisse ni la prestation ni les frais FLEMME.** Aucun écran ne prétend qu’une commission est payée. Le branchement d’un prestataire de paiement et ses remboursements constituent une étape distincte avant de percevoir automatiquement les frais.

## Support et mesure du test

Les signalements du mode connecté sont enregistrés en base, sans notification automatique ni interface d’administration mobile. Pour le test accompagné, une personne habilitée doit consulter les documents dans flemme_mobile_v1.tasks depuis l’outil d’administration de la base, puis contacter les participants dans les discussions. L’app ne promet pas de réponse ni de remboursement automatique.

Les tâches, accords, dates de création, événements et déclarations de paiement permettent d’extraire les taux d’attribution, de réalisation et de paiement confirmé. Le retour d’un utilisateur se mesure sur ses créations et propositions successives. Aucune mesure de paiement bancaire réel n’est disponible tant que l’encaissement n’est pas connecté.

## Vérifications

    npm run typecheck
    npm test
    npm run export:android
    npm run export:ios
    cd backend
    npm ci
    npm test

Les tests SQL utilisent PostgreSQL embarqué (PGlite), un schéma auth simulé et les rôles anon/authenticated. Ils exécutent le vrai script d’installation et vérifient les refus d’accès, la confidentialité des discussions, la commission calculée côté serveur, l’attribution unique, le rejeu idempotent et les déclarations de paiement. Ce n’est pas une validation du service Supabase déployé.

Les exports Metro vérifient les bundles natifs ; ils ne remplacent pas les tests sur appareil ni les compilations signées. Aucun projet Supabase n’est modifié automatiquement, aucun build n’est envoyé aux stores et aucune configuration Netlify n’est changée.

Limites du premier test : pas de pagination de la place de marché, pas d’achats avancés, pas de tarification horaire, pas d’annulation automatique, pas de changement de prix après accord. Les identifiants de reprise réseau sont conservés pendant la session d’édition ; après fermeture brutale de l’app, actualiser avant de recréer une tâche. Les snapshots de démonstration restent sur le téléphone jusqu’à désinstallation et ne constituent pas une sauvegarde distante.

## Sources et références — 28/10/2026

- Brief utilisateur et maquette sauge de cette conversation, avec confirmation des 10 % ajoutés au forfait.
- Base de code : https://github.com/benchamply-cmyk/FlemmeV2.0/commit/fe2e736ca2f5641db2d3b0b6026167e3525fea15
- Suivi projet : https://benchp.atlassian.net/browse/FLEMME-6
- Documentation projet : https://benchp.atlassian.net/wiki/spaces/DCHPLY/pages/131097
- Expo, développement natif : https://docs.expo.dev/develop/development-builds/introduction/
- Versions SDK : https://expo.dev/sdk ; correspondances vérifiées dans expo/bundledNativeModules.json du paquet 54.0.37 installé.
- Supabase Auth REST : https://supabase.github.io/auth/
- Fonctions et privilèges : https://supabase.com/docs/guides/database/functions
- RLS : https://supabase.com/docs/guides/database/postgres/row-level-security

Références uniquement : aucune synchronisation continue Confluence/Jira/GitHub.
