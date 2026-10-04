# FLEMME — site web V2.2 (prêt pour Netlify)

Site statique. Les demandes sont envoyées via **Netlify Forms** (formulaire `mission`).

## Publier
1. Glisser ce dossier sur https://app.netlify.com/drop
2. Domain management → ajouter `flemme.org`, définir `www.flemme.org` comme domaine principal, configurer le DNS.
3. Forms → pour **chacun** des deux formulaires (`mission` et `facilitateur`) : Settings & notifications → Form notifications → Add notification → Email notification → ben.champly@gmail.com.
4. Compléter les passages `[…]` de `mentions.html` et `confidentialite.html`, puis retirer `<meta name="robots" content="noindex">` de ces deux pages si vous le souhaitez.

## Test local
`python3 -m http.server 8080` : l'envoi du formulaire échoue en local (normal), il ne fonctionne que sur Netlify.

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

Non modifiable depuis /admin : le titre principal, les pages légales et les écrans du parcours (à changer dans index.html).
L'application mobile ne se met à jour qu'après regénération et republication de l'app.
