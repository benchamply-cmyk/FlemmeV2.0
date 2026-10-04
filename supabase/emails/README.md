# E-mails de l'espace personnel

Modèles en français à coller dans Supabase > Authentication > Emails > Templates.
Pour chacun : remplacer l'objet, passer l'éditeur en mode source (onglet « Source » ou `<>`), tout effacer, coller le fichier entier, puis Save.

| Modèle Supabase | Objet | Fichier |
|---|---|---|
| Confirm signup | Confirme ton adresse pour ouvrir ton espace Flemme | `confirmation-inscription.html` |
| Reset Password | Choisis ton mot de passe Flemme | `mot-de-passe-oublie.html` |

`{{ .ConfirmationURL }}` (le bouton) et `{{ .Token }}` (le code à 6 chiffres) sont remplacés par Supabase à l'envoi : ne pas les modifier.
Les e-mails partent de l'adresse réglée dans Authentication > Emails > SMTP Settings (Resend, `bonjour@flemme.org`).
