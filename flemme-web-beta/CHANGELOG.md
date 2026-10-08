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

## V2.3 bêta — flemme-web-beta (4 oct. 2026)
- Accueil avec grand champ libre et exemples cliquables.
- Texte de la bêta gratuite et demandes examinées avant acceptation.
- Parcours court : problème, contact, détails et option ambassadeur facultatifs.
- Formulaire Netlify beta-besoins, confirmation après envoi réussi et partage.
- Retrait des prix et délais automatiques ; actualisation de la confidentialité et du cache.
- Nettoyage : champs en double retirés du formulaire (when, pref), écran « précisions », catégories cliquables, phrases défilantes et blocs TOI / NOUS / GO supprimés du code et de /admin.
- Titre : espace insécable avant « ? » rétablie ; barre de progression sur 2 étapes.

## Résultats concrets à la place des catégories (8 oct. 2026)
- Accueil en trois parties : « T’as la flemme de quoi ? » avec le champ libre, 8 cartes « Les flemmes du moment » qui préremplissent la demande, puis « Et toi, t’as la flemme de quoi d’autre ? » (proposer une flemme, devenir ambassadeur).
- « Voir tout ce qu’on peut faire pour toi » dévoile les 7 groupes de résultats (45 au total), chacun avec son accroche et son « Résultat livré ». Un clic préremplit la demande.
- Sections retirées de l’accueil : « Le principe est simple », « On commence petit », « Et demain ? », « Pourquoi on fait ça ? », dernier appel.
- content/categories.json et content/accueil.json restructurés (modifiables dans /admin) ; mots-clés et ordre de détection mis à jour.

## Les flemmes du moment en 7 cartes (8 oct. 2026)
- Annulation des changements du formulaire (accès direct, description détaillée, pièces jointes).
- « Les flemmes du moment » et « Voilà toutes les corvées dont on peut te débarrasser » regroupés en une seule section : les 7 résultats concrets en cartes.
- Le détail des services s’ouvre en menu déroulant au survol de la souris ou au clic (au toucher sur mobile), avec le « Résultat livré ». Un service cliqué préremplit la demande.

## Accès direct au formulaire et service « Autre » (8 oct. 2026)
- Un clic sur une section ou un service mène directement au formulaire de demande (#offer), avec ce choix comme besoin et comme catégorie.
- La flèche de chaque carte ouvre le détail (indispensable sur mobile) ; sur ordinateur, le survol l’ouvre aussi.
- Service « Autre » ajouté automatiquement à la fin de chaque section (« Autre demande », rangée dans la section).

## Icônes et formulaire enrichi (8 oct. 2026)
- Icônes au trait monochromes (Lucide, licence ISC) à la place des emojis, dans le fichier icons.svg ; l’icône de chaque section et service se choisit dans /admin.
- « Pour quand ? » : Aucune urgence, Cette année, Ce mois-ci, Cette semaine, Aujourd’hui, Urgent, délai dépassé.
- Champ « Précisions » visible ; la fréquence et « Quel résultat te serait utile ? » sont retirés du formulaire.
- Pièces jointes (3 fichiers) et message vocal (3 min), 8 Mo au total, reçus dans Netlify Forms.
- Dictée vocale sur le grand champ et sur « Précisions » (navigateurs compatibles) ; micro autorisé dans _headers.
- Plus de limite de caractères. Script Supabase à exécuter : supabase/formulaire-enrichi.sql.

## Corrections (8 oct. 2026)
- Dictée : une seule à la fois, sessions courtes relancées automatiquement (plus fiable sur mobile), message affiché en cas de refus du micro ou d’erreur.
- « Suivre ma demande » : si la base Supabase n’a pas encore les nouvelles colonnes, la demande est enregistrée avec les anciens champs (précisions dans « aide attendue ») et le bouton réapparaît.

## Pièces jointes visibles dans les espaces (8 oct. 2026)
- Fichiers et message vocal copiés dans le stockage Supabase privé « pieces-jointes » après l’enregistrement de la demande.
- Espace perso et espace équipe : précisions, liens vers les fichiers et lecteur du message vocal (liens temporaires d’une heure).
- Script Supabase à exécuter : supabase/formulaire-enrichi.sql (colonne fichiers, compartiment et règles d’accès). Les demandes envoyées avant ne sont pas rattrapées.
- Limite : la suppression du compte n’efface pas encore les fichiers stockés.
- Dictée retirée (trop peu fiable, notamment dans Safari) et remplacée sur l’accueil par un bouton « Message vocal » : l’enregistrement est joint à la demande et réécoutable dans le formulaire. On peut envoyer une demande avec seulement un message vocal.

## La Brigade anti-flemme recrute (8 oct. 2026)
- Les Facilitateurs deviennent la **Brigade anti-flemme** ; ses membres sont des Brigadiers et Brigadières.
- Nouvelle page `rejoindre.html` (+ rejoindre.css, rejoindre.js) : accroche « On cherche des gens qui n’ont pas la flemme », lettre d’ouverture, 3 arguments (Libre, Payé clairement, Épaulé), « Comment ça marche » en 4 étapes, rémunération indicative, grades (Recrue, Brigadier-chef, Brigadier de la première heure), FAQ.
- Candidature en deux temps dans le formulaire Netlify « facilitateur » : candidature express (etape=1) envoyée tout de suite, puis profil facultatif (etape=2) ; les deux envois portent le même identifiant `candidat` (BR-XXXXX). Brouillon conservé au rechargement.
- Nouveaux champs du formulaire « facilitateur » : etape, candidat, pourquoi ; compétences et disponibilités en cases à cocher.
- Accueil : bandeau « Toi, t’as jamais la flemme ? », lien « La Brigade recrute » dans l’en-tête (masqué sur mobile), encart sur l’écran de confirmation, lien « Rejoindre la Brigade » en pied de page.
- L’ancien écran Facilitateur de l’accueil est retiré ; les liens flemme.org/#facilitateur redirigent vers rejoindre.html.
- CSP ajoutée pour /rejoindre.html, page ajoutée au sitemap, confidentialité mise à jour, cache passé en flemme-v3.8-beta-brigade.
- Rémunération : un seul pourcentage quelle que soit l’intervention, 65 % pour le Brigadier et 35 % pour Flemme ; 80 % / 20 % pour les ambassadeurs et les Brigadiers de la première heure. Forfaits par type d’intervention retirés.

## Reste à faire
- Application : compiler et tester sur de vrais téléphones (Xcode, Android Studio).
- Compléter les passages [...] des mentions légales et de la confidentialité, retirer le noindex.
- Configurer GitHub OAuth + Netlify pour /admin (voir README).
- Activer les notifications e-mail Netlify pour les formulaires « beta-besoins » et « facilitateur ».
- CGV et médiateur de la consommation avant la première facturation ; statut des Brigadiers (ex-Facilitateurs) à faire valider.
- Fixer la rémunération des interventions test pendant la bêta gratuite (annoncée « avant que tu l’acceptes ») et valider le délai de réponse de 72 h.
