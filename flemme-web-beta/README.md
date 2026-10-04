# FLEMME — V2.3 bêta publique

Version de test pour comprendre les besoins du quotidien et recruter les premiers utilisateurs-ambassadeurs.

## Parcours
Grand champ libre → contact, échéance et précisions facultatives → choix facultatif ambassadeur → confirmation après envoi réussi. Les exemples remplissent le champ sans imposer de catégorie.

Le service est gratuit pendant la bêta. Chaque demande est étudiée avant acceptation ; aucun résultat ni délai n’est garanti. Les candidatures Facilitateur restent accessibles pour préparer les futurs essais.

## Mise en ligne sur Netlify
Déployer ce dossier sur le site existant. Activer la détection Netlify Forms et les notifications pour `beta-besoins` et `facilitateur`. Faire un envoi de contrôle après déploiement et vérifier la réception dans Netlify Forms. Les contributions bêta sont séparées des anciennes demandes `mission`.

Avant publication, compléter les champs surlignés des mentions légales et de la politique de confidentialité, notamment l’identité du responsable et la durée de conservation.

## Local
`python3 -m http.server 8080` dans ce dossier. Les formulaires ne peuvent être reçus qu’après déploiement sur Netlify ; une erreur est affichée en local et hors connexion. Ne pas utiliser un hébergement statique qui renvoie HTTP 200 aux POST sans les traiter.


Pour étudier les retours, exporter `beta-besoins` depuis Netlify Forms : regrouper par catégorie et fréquence, puis comparer les aides attendues. Filtrer `ambassadeur=oui` pour préparer les invitations aux tests.

## Modifier le contenu depuis le navigateur (Decap CMS)
Les textes modifiables sont dans `content/` (accueil.json, categories.json, contact.json) ; l'interface se trouve sur `/admin`.
À chaque publication, Netlify exécute `node build.js` (voir netlify.toml), qui régénère `content.js` à partir de ces fichiers.

Mise en place (une seule fois) :
1. Créer un dépôt GitHub (ex. `flemme`) et y envoyer tout le contenu de ce dossier.
2. Netlify : Add new site > Import an existing project > GitHub > choisir le dépôt (build : `node build.js`, publish : `.`, déjà dans netlify.toml). Reconnecter le domaine www.flemme.org à ce nouveau site.
3. GitHub : Settings > Developer settings > OAuth Apps > New OAuth App.
   Homepage URL : https://www.flemme.org — Authorization callback URL : https://api.netlify.com/auth/done
   Noter le Client ID et générer un Client secret.
4. Netlify : Site configuration > Access & security > OAuth (l'intitulé peut varier) > Install provider > GitHub, coller le Client ID et le secret.
5. Dans `admin/config.yml`, remplacer `VOTRE-COMPTE-GITHUB/flemme` par votre dépôt réel, puis envoyer la modification.
6. Ouvrir https://www.flemme.org/admin et se connecter avec GitHub. Chaque enregistrement republie le site en 1 à 2 minutes.

Modifiables depuis /admin : le badge et les textes grisés (qui défilent) du champ de l'accueil, les catégories (utilisées pour classer les demandes reçues) et les coordonnées. Le reste de l'accueil, les pages légales et les écrans du parcours se changent dans index.html.
L'application mobile ne se met à jour qu'après regénération et republication de l'app.

## Espace personnel (suivi des demandes)
Les utilisateurs s'inscrivent sur `/espace.html` (lien « Mon espace » en haut de l'accueil), sans mot de passe : avec leur compte Google ou Apple, ou avec leur e-mail (Supabase envoie un lien de connexion et un code à 6 chiffres). Ils y voient leurs demandes, leur avancement et le mot de l'équipe.
Chaque demande envoyée depuis l'accueil part toujours dans Netlify Forms (notifications inchangées) et, en plus, est copiée dans la table Supabase `demandes`. Une demande faite avec un e-mail apparaît dans l'espace de cette adresse, même si le compte est créé après.
Tant que Supabase n'est pas configuré, le lien « Mon espace » reste masqué et le site fonctionne comme avant.

Mise en place (une seule fois) :
1. Créer un projet gratuit sur https://supabase.com (région Europe, ex. Paris ou Francfort).
2. Supabase > SQL Editor > New query : coller le contenu de `supabase/espace.sql` (à la racine du dépôt), puis Run.
3. Supabase > Authentication > URL Configuration : Site URL `https://www.flemme.org`, et dans Redirect URLs ajouter `https://www.flemme.org/espace.html` et `https://*--flemmeorg.netlify.app/espace.html` (aperçus Netlify).
4. (Conseillé) Supabase > Authentication > Emails > Magic Link : ajouter le code dans le modèle, par ex. `<p>Ou saisis ce code : {{ .Token }}</p>`. Utile quand le lien s'ouvre dans un autre navigateur que celui de la demande (application mobile, webmail).
5. Supabase > Project Settings > API : copier la Project URL et la clé publique (`anon` ou `publishable`, jamais la clé `service_role` / `secret`).
6. Netlify > Site configuration > Environment variables : ajouter `SUPABASE_URL` et `SUPABASE_ANON_KEY` avec ces deux valeurs, puis redéployer.
7. (Facultatif) Connexion Google et Apple : voir ci-dessous. Les boutons apparaissent d'eux-mêmes dès qu'un fournisseur est activé dans Supabase.
8. Pour un vrai volume d'e-mails, brancher un SMTP (Authentication > Emails > SMTP Settings, ex. Brevo ou Resend) : l'envoi intégré de Supabase est limité à quelques e-mails par heure.

Faire avancer une demande : Supabase > Table Editor > `demandes`, changer `statut` (`recue`, `en_etude`, `acceptee`, `en_cours`, `terminee` ou `refusee`) et écrire si besoin un `message` pour l'utilisateur. L'espace l'affiche au prochain chargement.
Les demandes avec un téléphone comme seul contact ne sont rattachées à aucun espace (sauf si la personne était connectée en l'envoyant).

### Connexion avec Google
1. https://console.cloud.google.com > créer un projet « Flemme ».
2. APIs & Services > OAuth consent screen (Google Auth Platform) : type External, nom « Flemme », e-mail d'assistance, logo facultatif, domaine autorisé `flemme.org`, liens vers les mentions légales et la confidentialité. Portées : `email`, `profile`, `openid` uniquement (pas de validation Google nécessaire). Publier l'application (« In production »).
3. Credentials > Create credentials > OAuth client ID > Web application. Authorized JavaScript origins : `https://www.flemme.org`. Authorized redirect URIs : `https://<ref-du-projet>.supabase.co/auth/v1/callback` (l'adresse exacte est affichée dans Supabase > Authentication > Providers > Google).
4. Supabase > Authentication > Providers > Google : activer, coller le Client ID et le Client secret, enregistrer.

### Connexion avec Apple
Nécessite un compte Apple Developer (99 €/an).
1. https://developer.apple.com > Certificates, Identifiers & Profiles > Identifiers : créer un App ID avec « Sign in with Apple » coché (ou réutiliser celui de l'application mobile).
2. Identifiers > Services IDs : créer un Services ID (ex. `org.flemme.web`), cocher « Sign in with Apple » > Configure : domaine `<ref-du-projet>.supabase.co`, Return URL `https://<ref-du-projet>.supabase.co/auth/v1/callback`.
3. Keys : créer une clé avec « Sign in with Apple », télécharger le fichier `.p8` (une seule fois) et noter le Key ID et le Team ID.
4. Supabase > Authentication > Providers > Apple : activer, Client IDs = le Services ID, puis générer le « Secret Key » avec le Team ID, le Key ID et le contenu du `.p8` (outil fourni sur la page Supabase).
5. Ce secret expire au bout de 6 mois : mettre un rappel pour le régénérer, sinon la connexion Apple s'arrête.
Avec « Masquer mon adresse e-mail », Apple transmet une adresse relais (`…@privaterelay.appleid.com`) : les demandes faites avant avec la vraie adresse n'apparaissent alors pas dans cet espace.

### Sécurité
- Règles d'accès dans la base (Row Level Security, `supabase/espace.sql`) : un visiteur peut seulement déposer une demande, sans pouvoir rien relire ; une personne connectée ne voit que ses demandes ; le statut et le message ne se changent que depuis le tableau de bord Supabase. La clé publique du site ne permet rien d'autre.
- Aucun mot de passe stocké ni à faire fuiter : lien ou code à usage unique, ou compte Google / Apple.
- Flux PKCE pour les liens e-mail et Google / Apple : l'adresse de retour ne contient qu'un code à usage unique, inutilisable sans le secret gardé dans le navigateur d'origine. Aucun jeton de session ne passe dans l'URL.
- Politique de sécurité du contenu stricte (`_headers`) : seuls les scripts du site s'exécutent, et le navigateur ne parle qu'au site et à Supabase. Cela protège la session gardée dans le navigateur contre l'injection de scripts.
- Sessions courtes (1 h, renouvelées automatiquement), bouton « Me déconnecter de tous mes appareils », et suppression du compte et des demandes par l'utilisateur (droit à l'effacement).
- Ne jamais mettre la clé `service_role` / `secret` dans le site ni dans Netlify.
- Réglages Supabase conseillés : Authentication > Attack Protection (CAPTCHA Turnstile ou hCaptcha si des inscriptions abusives apparaissent ; demande alors d'ajouter le widget au site), Authentication > Rate Limits (laisser les valeurs par défaut), activer la double authentification sur le compte Supabase de l'équipe, et choisir une région Europe pour l'hébergement.
- Limite connue : n'importe qui peut déposer une demande en indiquant l'e-mail d'un tiers, qui la verrait alors dans son espace. Personne ne peut en revanche lire les demandes d'autrui.
