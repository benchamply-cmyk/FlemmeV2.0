# Archivage de FlemmeV2.0 (novembre 2026)

Depuis le 03/11/2026, flemme.org est publié depuis [flemme.org-web-app](https://github.com/benchamply-cmyk/flemme.org-web-app). Ce dépôt-ci garde l'historique du site (V1 à V5), l'ancien espace client et, jusqu'à son transfert, le Flemme Manager.

## Ce qui a été retiré

| Retiré | Pourquoi | Où le trouver |
|---|---|---|
| `apps/web`, `apps/mobile` | Copies des applications qui vivent désormais dans flemme.org-web-app. Les garder ici créait deux versions qui divergeaient déjà (`index.html`, `README.md`, `netlify.toml`). | `flemme.org-web-app/apps/` |
| `.github/workflows/flemme-mobile-ci.yml`, `mobile-sdk58-validation.yml` | Ils ne testaient que `apps/mobile`. | `flemme.org-web-app/.github/workflows/mobile.yml` |

Le contenu retiré reste lisible dans l'historique Git et sous le tag d'archive ci-dessous.

## Ce qui reste, et jusqu'à quand

| Dossier | Statut |
|---|---|
| `flemme-web-beta/`, `supabase/espace.sql`, etc. | Site historique et ancien `/espace`. Gardés comme référence. Les comptes de l'ancien espace sont repris dans la V2 (voir `docs/migration-comptes-espace.md` dans flemme.org-web-app). |
| `flemme-managerV1/`, `supabase/manager-*.sql`, `supabase/migrations/` | Le service Render `flemme-manager-v2-api` se construit encore depuis la branche `main` de ce dépôt. **Ne pas les supprimer** avant que Render soit rebranché sur flemme.org-web-app (procédure : `docs/manager-render.md` dans flemme.org-web-app). Une PR de suppression pourra suivre une fois Render rebranché. |
| `apercu/`, `flemme-web-V2.2/`, fichiers V2.0 à la racine | Versions anciennes, gardées pour l'historique. |

## Tag d'archive (à faire par Ben)

Le tag se pose **avant** de fusionner cette PR, sur l'état actuel de `beta`, pour garder une photo complète du dépôt avec `apps/`. Il suit la convention `vX.YYYY` de flemme.org-web-app.

Sur GitHub : *Releases* → *Draft a new release* → *Choose a tag* : `v5.9000-archive` → *Target* : `beta` → titre « Archive FlemmeV2.0 avant nettoyage (03/11/2026) » → *Publish release*.

Ou en ligne de commande :

    git fetch origin beta
    git tag -a v5.9000-archive origin/beta -m "Archive FlemmeV2.0 avant nettoyage (03/11/2026)"
    git push origin v5.9000-archive

Ensuite, une fois Render rebranché et le Manager vérifié sur la V2 :

1. Fusionner la PR de suppression du Manager (à ouvrir plus tard).
2. Fermer la PR #59 (`feature/apps-web-netlify`), devenue inutile.
3. Dans *Settings* → *General*, cliquer *Archive this repository* : le dépôt passe en lecture seule, tout reste consultable.
