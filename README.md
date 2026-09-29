# FLEMME — V2 (prête pour Netlify)

Site statique. Les demandes sont envoyées via **Netlify Forms** (formulaire `mission`).

## Publier
1. Glisser ce dossier sur https://app.netlify.com/drop
2. Domain management → ajouter `flemme.fr`, définir `www.flemme.fr` comme domaine principal, configurer le DNS.
3. Forms → `mission` → Settings & notifications → Form notifications → Add → Email : pour recevoir chaque demande par e-mail.
4. Compléter les passages `[…]` de `mentions.html` et `confidentialite.html`, puis retirer `<meta name="robots" content="noindex">` de ces deux pages si vous le souhaitez.

## Test local
`python3 -m http.server 8080` : l'envoi du formulaire échoue en local (normal), il ne fonctionne que sur Netlify.
