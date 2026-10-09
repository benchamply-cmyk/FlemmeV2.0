# FlemmeV2.0

Le site publié par Netlify est **flemme-web-beta/**; les dossiers racine et V2.2 sont historiques.
Le backend **flemme-managerV1/** reprend le manager de la branche dédiée et ajoute le chatbot
facultatif de qualification, sa persistance et le routage des missions approuvées.

Voir [configuration, tests et déploiement du chatbot](docs/qualification.md).
Le chatbot est désactivé par défaut; aucun déploiement en production sans validation explicite.

# FLEMME — V2 (prête pour Netlify)

Site statique. Les demandes sont envoyées via **Netlify Forms** (formulaire `mission`).

## Publication historique du site V2
1. Glisser ce dossier sur https://app.netlify.com/drop
2. Domain management → ajouter `flemme.fr`, définir `www.flemme.fr` comme domaine principal, configurer le DNS.
3. Forms → `mission` → Settings & notifications → Form notifications → Add → Email : pour recevoir chaque demande par e-mail.
4. Compléter les passages `[…]` de `mentions.html` et `confidentialite.html`, puis retirer `<meta name="robots" content="noindex">` de ces deux pages si vous le souhaitez.

## Test local
`python3 -m http.server 8080` : l'envoi du formulaire échoue en local (normal), il ne fonctionne que sur Netlify.
