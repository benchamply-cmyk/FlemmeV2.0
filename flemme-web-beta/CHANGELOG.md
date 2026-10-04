# Historique des versions de Flemme

## V1 — flemme-mvp.zip (fichier d'origine, 29 sept. 2026)
Site statique de 6 fichiers : accueil, précisions, proposition « On s'en occupe », suivi, avec un faux back-office.
Missions enregistrées uniquement dans le navigateur du visiteur, aucune réception pour Flemme, pas d'icônes, pas de pages légales.

## V2.0 — flemme-v2.zip et flemme-app.zip (ZIP déjà fournis, domaine flemme.fr)
Corrections de l'audit :
- Réception des demandes via Netlify Forms (formulaire « mission »), avec champ e-mail ou téléphone, consentement et champ anti-spam.
- Suppression du bouton « Suivi » et du faux back-office.
- Correction de la faille XSS (plus d'innerHTML avec du texte saisi) et service worker « réseau d'abord » avec cache versionné.
- Icônes (favicon, iPhone, Android), image de partage, manifeste complet, balises Open Graph, canonical, robots.txt, sitemap.xml, page 404.
- Pages mentions légales et confidentialité (modèles à compléter), fichier _headers (sécurité + CSP).
- Parcours : bouton Retour du navigateur, brouillon conservé, identifiant de mission aléatoire, classification par mots entiers (« rappel » ≠ « appel »).
- Accessibilité : labels liés aux champs, aria-pressed, focus sur le titre à chaque écran.
Ajout : 20 catégories avec leurs tâches (grille à plat, ordre selon le potentiel), détection de la catégorie dans le texte libre.
Application : projet Capacitor (vibrations, bouton Partager, écran de lancement, barre d'état, encoche).
Attention : ces ZIP contiennent encore flemme.fr, le jaune, la grille à plat et l'ancien contenu.

## V2.1 — flemme-web-V2.1.zip et flemme-app-V2.1.zip (domaine flemme.org)
1. Domaine : flemme.fr remplacé par flemme.org partout (canonical, sitemap, robots, partage, app).
2. Contact : e-mail ben.champly@gmail.com et téléphone 06 58 63 45 90 dans les mentions légales, la confidentialité, le message d'erreur d'envoi et un lien « Contact » en pied de page.
3. Prix sur devis : « Prix : Sur devis », frise « Analyse et devis », « Exécution après ton accord », textes et mentions adaptés.
4. Formulaire « Devenir Facilitateur » (nom, e-mail, téléphone, ville, à distance / sur place, expérience, disponibilité, statut, consentement), bandeau sur l'accueil et lien en pied de page. Formulaire Netlify « facilitateur ».
5. Six phrases d'accroche qui défilent toutes les 5 s (pause et suivant, désactivé si animations réduites).
6. Trois blocs TOI / NOUS / GO à la place des anciennes promesses chiffrées.
7. Puce « Agent IA » masquée sur l'écran de proposition quand l'IA traite seule.
8. Badge : « L'assistant des trucs que tu repousses. »
9. Couleur d'accent : vert « espoir » #57d68d à la place du jaune (surlignage, encadrés, barre d'état, manifeste).
10. Champ de saisie : texte grisé « Raconte-nous tout ».
11. Titre : « T'as la Flemme ? Pas nous ! », seul « Flemme » en gras épais, interligne aéré.
12. Catégories regroupées en 6 grandes catégories avec sous-catégories en liste défilante, puis tâches proposées.
13. Contenu modifiable sans code : fichiers content/*.json, build.js, netlify.toml, interface /admin (Decap CMS). CSP appliquée page par page pour laisser /admin fonctionner.
14. Application : mêmes changements que le site, synchronisés.

## V2.2 — flemme-web-V2.2.zip et flemme-app-V2.2.zip (version actuelle, 1er oct. 2026)
1. Icônes, favicon et image de partage (og.png) passés du jaune au vert #57d68d.
2. app.js réécrit en version lisible et commentée, même comportement.
3. Mots-clés : un mot-clé mal saisi dans /admin n'empêche plus l'envoi des demandes (il est ignoré).
4. Contact de la mission : vérification « e-mail ou téléphone » avant l'envoi.
5. Typographie française : espace insécable avant « ? » et « ! » (le « ? » du titre ne passe plus seul à la ligne sur mobile).
6. « + Une autre flemme » remet aussi à zéro « Pour quand ? » et « Tu préfères… ».
7. Le lien direct flemme.org/#facilitateur ouvre le formulaire Facilitateur.
8. Hors connexion : content.js mis en cache (catégories visibles), cache passé en flemme-v5.
9. Les phrases d'accroche s'arrêtent quand l'onglet est caché.
10. styles.css nettoyé : règles en double fusionnées, styles inutilisés supprimés, sections commentées.
11. Badge et pied de page mieux disposés sur mobile ; message si JavaScript est désactivé ; lien Contact sur la page 404.

## App V2.2 — flemme-app-V2.2.zip (4 oct. 2026)
1. Dossier www/ mis à jour avec les fichiers du site V2.2 (index.html, styles.css, app.js, icônes, favicon).
2. Icône (assets/icon-only.png, icon-background.png) et écran de lancement (assets/splash.png) passés du jaune au vert #57d68d.
3. Relancer `npx capacitor-assets generate` puis `npx cap sync` pour appliquer les nouvelles icônes.

## Bêta — flemme-web-beta (4 oct. 2026)
Copie de travail de la V2.2 pour tester des changements sans toucher au site en ligne.
- Page d'accueil marquée noindex et titre « Flemme (bêta) » pour éviter l'indexation.

## Reste à faire
- Application : compiler et tester sur de vrais téléphones (Xcode, Android Studio).
- Compléter les passages [...] des mentions légales et de la confidentialité, retirer le noindex.
- Remplacer VOTRE-COMPTE-GITHUB/flemme dans admin/config.yml et configurer GitHub OAuth + Netlify (voir README).
- Activer les notifications e-mail Netlify pour les formulaires « mission » et « facilitateur ».
- CGV et médiateur de la consommation avant la première facturation ; statut des Facilitateurs à faire valider.
