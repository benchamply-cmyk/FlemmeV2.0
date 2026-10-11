from flemme_manager.workflows import (
    comparer_devis,
    organiser_voyage,
    qualification,
    rechercher_produit,
    trouver_prestataire,
)


def test_workflow_modules_are_importable():
    assert all(
        module is not None
        for module in (
            comparer_devis,
            organiser_voyage,
            qualification,
            rechercher_produit,
            trouver_prestataire,
        )
    )