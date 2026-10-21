# Manager : agents réservés aux administrateurs — 21 octobre 2026

## Décisions
Les lancements, messages au Manager, changements de mission et récupérations sont réservés à l’administrateur défini par `public.est_admin()`. Un membre de l’équipe ne devient pas administrateur automatiquement. Aucun rôle n’est déduit des métadonnées modifiables par l’utilisateur.

Les clients conservent la lecture de leurs propres conversations, résultats et originaux. Les règles de propriété existantes restent appliquées, y compris pour les administrateurs : cette évolution ne crée pas de consultation transverse des données clients.

## Répartition visible
Search recherche sur le Web, Document extrait les documents, Compare compare les valeurs disponibles et Quality contrôle les citations/calculs pris en charge. Le suivi enregistré distingue les étapes effectuées de celles non sollicitées. Les anciens résultats et les tentatives interrompues sans détail ne reçoivent pas d’étapes inventées. Le pipeline historique fourni sélectionne uniquement les sources saisies, sans prétendre naviguer sur Internet. Writer reste le formatteur interne compatible avec le stockage V3.

## Installation après validation
1. Vérifier que `gestionadmin.sql` et V2/V3/V4 sont installés et que le propriétaire administrateur est correctement épinglé.
2. Appliquer une seule fois, dans une transaction, le script ADDITIF `supabase/manager-admin-agents.sql` via une migration de déploiement. Il ajoute des gardes INSERT ; aucune donnée ni fonction métier existante n’est remplacée. Ce fichier est un script d’installation, pas une migration enregistrée : le CLI Supabase était absent et son téléchargement inaccessible dans cet environnement.
3. Déployer le backend, puis l’interface. Si la vérification du rôle échoue, les commandes restent fermées ; les lectures demeurent soumises à la session et à la propriété.
4. Vérifier avec un administrateur et un client : création autorisée/refusée, lecture d’anciens résultats et originaux, lancement web/documents, refus des RPC directes client. Attendre la fin des tentatives en cours avant l’installation : une révocation administrateur pendant une tentative peut empêcher son enregistrement final et nécessite une récupération administrateur explicite.

## Vérification
204 tests Python hors réseau et 39 tests JavaScript réussis localement le 21/10/2026. Tests supplémentaires PostgreSQL et navigateur simulé exécutés par la CI de la PR ; leurs résultats sont à consulter avant validation. Captures administrateur, client et service de rôle indisponible publiées dans l’artefact CI `acquisition-browser-simulated`.

Aucun achat, réservation, envoi ni modification de la production pendant ce changement. Aucun secret ajouté. Historique conservé. La qualité commerciale et les limites de l’extraction V4 restent celles documentées lors de l’activation précédente.

## Sources
- Base GitHub vérifiée le 21/10/2026 : `main` 46187bcee7a2aab3dd48df1b3b47fc241e78cb7e ; publication de la PR sur cet arbre pour conserver les pages V5.
- Autorité existante : `supabase/gestionadmin.sql`, fonction `public.est_admin()`.
- Documentation Supabase des déclencheurs consultée le 21/10/2026 : https://supabase.com/docs/guides/database/postgres/triggers . L’index changelog Markdown n’était pas accessible par le lecteur Web.
- Suivi : https://benchp.atlassian.net/browse/FLEMME-6 .
