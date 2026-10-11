# Spécialistes dans Gestion admin — 11 octobre 2026

## Comportement

Le Manager conserve sa qualification existante. Depuis une mission qualifiée, le propriétaire confirme les contraintes métier et fournit des sources datées dans un formulaire. Search sélectionne les sources du type attendu ; Compare calcule les prix avec des centimes entiers et sépare devises, bases et taxes ; Writer produit un rapport privé avec provenance, inconnues et limites ; Quality recalcule les résultats et refuse une incohérence.

Ce port reprend le fonctionnement déterministe des spécialistes Python sur sources fournies. Il n'effectue aucune recherche web ni vérification de prix ou disponibilité. Aucune clé supplémentaire n'est nécessaire pour les quatre spécialistes. Les appels OpenAI restent limités à la qualification existante.

Chaque workflow impose ses informations indispensables : deux devis comparables ; intervention, service, zone et échéance pour un prestataire ; usage, acquisition et budget pour un produit ; période, voyageurs et destination pour un voyage. Le leasing exige aussi durée, apport, budget mensuel avec taxes et kilométrage pour un véhicule. Une information inconnue ne signifie jamais un critère satisfait.

Le rapport n'est pas envoyé au client. La mission passe en cours et attend la validation humaine. L'administrateur peut ensuite la bloquer ou la terminer. Une mission bloquée, non qualifiée, en cours de qualification ou nécessitant un humain ne peut produire un rapport. Une commande avec une révision périmée échoue ; un nouvel essai de la même commande enregistrée renvoie le résultat existant sans ajouter un doublon.

## Installation

1. Exécuter `supabase/manager-specialistes.sql` après les migrations admin et Manager déjà appliquées. Il ajoute une colonne de rapports et une fonction protégée par le contrôle propriétaire, sans supprimer de données.
2. Tester le build Netlify en prévisualisation avec le compte propriétaire.
3. Fusionner la PR puis publier le build validé en conservant le verrou de publication Netlify.

Les rapports, sources et contraintes sont conservés dans Supabase, uniquement lisibles par le propriétaire avec les politiques existantes. Aucun secret n'est transmis au navigateur. Aucune variable Netlify supplémentaire n'est requise pour le fonctionnement sur sources fournies.

## Validation

31 tests Node couvrent la qualification et les contrôles existants, les quatre workflows, les centimes, les devises et taxes, les montants invalides, les inconnues, la provenance, les URL dangereuses, les dates, la qualité, les missions bloquées et les relances idempotentes. Le contrôle concurrent final utilise le verrou de ligne et la révision dans la fonction Supabase ; son exécution réelle doit être vérifiée après application de la migration.

Les sources déclarées demeurent non vérifiées. Le port ne raccorde pas la mémoire conversationnelle V2 Python ni la recherche web autonome. Ces évolutions restent distinctes de ce raccordement.
