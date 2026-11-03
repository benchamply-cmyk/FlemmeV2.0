# FLEMME web — site aligné sur l’app mobile

Nouveau site, indépendant de `flemme-web-beta`, qui reprend le modèle de `apps/mobile` : deux actions (« Mes flemmes », « Résoudre une flemme »), des Brigadiers qui proposent un forfait et une commission FLEMME de 10 % ajoutée au forfait accepté.

- `index.html` : vitrine (les deux actions, les quatre étapes, un calculateur du prix et ce que la version de test ne fait pas).
- `app.html` : le parcours de l’app dans le navigateur, avec les mêmes écrans et les mêmes textes que `apps/mobile/App.tsx`.

## Une seule source pour les règles

Le site n’a pas sa propre copie des règles métier. Il importe directement `../mobile/src/domain.ts` (montants, commission, droits, historique) et `../mobile/src/gateway.ts` (démo locale et connecteur Supabase). Toute correction faite pour le mobile s’applique donc au site, et inversement. Seul le stockage diffère (`src/storage.ts`) :

| | Mobile | Web |
|---|---|---|
| Démo locale | fichiers JSON additifs (expo-file-system) | clés `flemme-web-demo:*` additives (localStorage) |
| Jeton de renouvellement | SecureStore | sessionStorage : il faut se reconnecter après avoir fermé l’onglet |
| Retour | BackHandler Android | historique du navigateur |

## Lancer

Depuis ce dossier, avec Node 22.13 ou supérieur :

    npm ci
    npm run dev

Puis ouvrir http://localhost:5173 (vitrine) ou http://localhost:5173/app.html (app). Les liens `app.html#mine` et `app.html#find` ouvrent directement l’une des deux listes.

Sans variables d’environnement : démonstration locale, avec les trois mêmes personnages et tâches fictives que le mobile (bouton de profil en haut à droite). Les données restent dans le navigateur.

## Mode connecté

Même backend que le mobile (`apps/mobile/backend/install.sql`, RPC `flemme_mobile_api`). Copier `.env.example` vers `.env` et renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` : ce sont les valeurs publiques déjà utilisées pour le mobile. Ajouter l’adresse du site aux URL autorisées de l’authentification Supabase. Aucune clé `service_role` ou `sb_secret`.

## Vérifications

    npm run typecheck
    npm test
    npm run build

`npm run build` produit `dist/` (site statique). La configuration Netlify du dépôt n’est pas modifiée : elle publie toujours `flemme-web-beta`. Pour publier ce site, créer un site Netlify séparé avec base `apps/web`, commande `npm run build`, dossier `dist`.

Limites : identiques à celles du mobile (pas d’encaissement, paiement direct et déclaratif, pas de pagination, pas de synchronisation continue).
