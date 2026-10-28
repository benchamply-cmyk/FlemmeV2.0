"""Deterministic reports tool owned by Flemme Manager."""
import html
import re
from datetime import datetime

from flemme_manager.delivery_schemas import ComparisonResult, DeliveryInput, SearchResult
from flemme_manager.schemas import WorkflowId

TITLES = {
    WorkflowId.COMPARER_DEVIS: "Comparaison des devis fournis",
    WorkflowId.TROUVER_PRESTATAIRE: "Sélection de prestataires fournis",
    WorkflowId.RECHERCHER_PRODUIT: "Comparaison des produits fournis",
    WorkflowId.ORGANISER_VOYAGE: "Comparaison des offres de voyage fournies",
}
BASES = {"total": "total", "per_hour": "par heure", "per_night": "par nuit", "per_person": "par personne", "per_month": "par mois"}
TAXES = {"included": "taxes incluses", "excluded": "taxes exclues"}


def escape(value: str) -> str:
    value = " ".join(value.split())
    return re.sub(r"([\\`*_{}\[\]()#+.!|])", r"\\\1", html.escape(value))


def verdict(value):
    return "Oui (déclaré)" if value is True else "Non (déclaré)" if value is False else "Non confirmé"


def run(workflow_id: WorkflowId, search: SearchResult, comparison: ComparisonResult,
        evidence: DeliveryInput, generated_at: datetime) -> str:
    by_id = {source.id: source for source in evidence.sources}
    lines = [f"# {TITLES[workflow_id]}", "", f"Généré le {generated_at.isoformat()}.", "",
             "## Périmètre", "",
             "Analyse des sources fournies uniquement. Aucune recherche web, vérification de disponibilité, "
             "prise de contact, réservation ou achat n'a été exécuté.", "",
             "Les critères structurés de l'opérateur servent à la comparaison. "
             "Un prix plus bas ne prouve pas une meilleure offre ni des prestations équivalentes.", "",
             "## Tableau comparatif", "",
             "| Source | Prix déclaré | Budget | Lieu | Date disponible | Critères fournis |",
             "| --- | --- | --- | --- | --- | --- |"]
    for candidate in comparison.candidates:
        source = by_id[candidate.source_id]
        price = "Non renseigné" if source.price is None else f"{source.price:.2f} {source.currency or 'devise inconnue'}"
        if source.price is not None:
            price += f" ({BASES.get(source.price_basis, 'base inconnue')}, {TAXES.get(source.tax_basis, 'taxes inconnues')})"
        lines.append(f"| {escape(source.id)} — {escape(source.title)} | {price} | "
                     f"{verdict(candidate.within_budget)} | {escape(source.location or 'Non renseigné')} | "
                     f"{source.available_on or 'Non renseignée'} | {verdict(candidate.meets_supplied_constraints)} |")
    lines += ["", "## Écarts de prix calculés", ""]
    if not comparison.price_groups:
        lines.append("Aucun groupe de prix comparable avec devise, base et taxes explicites.")
    for group in comparison.price_groups:
        lines.append(f"- {group.currency}, {BASES[group.price_basis]}, {TAXES[group.tax_basis]} : "
                     f"minimum {group.lowest_price:.2f}, maximum {group.highest_price:.2f}, "
                     f"écart {group.spread:.2f}. Sources au minimum : "
                     f"{', '.join(escape(value) for value in group.lowest_price_ids)}.")
        if len(group.source_ids) < 2:
            lines.append("  Une seule offre dans ce groupe : aucune comparaison interoffres.")
        elif group.spread_percent_of_lowest is not None:
            lines.append(f"  Écart relatif au prix minimum : {group.spread_percent_of_lowest:.2f} %.")
        else:
            lines.append("  Prix minimum nul : pourcentage non calculable.")
    lines += ["", "## Prestations et points à confirmer", ""]
    for candidate in comparison.candidates:
        source = by_id[candidate.source_id]
        lines += [f"### {escape(source.id)} — {escape(source.title)}", "",
                  "Inclus (déclaré) : " + (" ; ".join(escape(value) for value in source.inclusions) or "non documenté") + ".",
                  "Exclus (déclaré) : " + (" ; ".join(escape(value) for value in source.exclusions) or "non documenté") + "."]
        if evidence.constraints.duration_months is not None or source.duration_months is not None:
            lines.append(f"Durée déclarée : {source.duration_months if source.duration_months is not None else 'inconnue'} mois. "
                         f"Critère de durée : {verdict(candidate.duration_match)}.")
        if evidence.constraints.max_upfront_payment is not None or source.upfront_payment is not None:
            upfront = "inconnu" if source.upfront_payment is None else f"{source.upfront_payment:.2f} {source.currency or 'devise inconnue'}"
            lines.append(f"Apport déclaré : {upfront}. Critère d'apport : {verdict(candidate.upfront_within_budget)}.")
        for feature, matched in candidate.feature_matches.items():
            lines.append(f"- {escape(feature)} : {verdict(matched)}.")
        for unknown in candidate.unknowns:
            lines.append(f"- À confirmer : {escape(unknown)}")
        lines.append("")
    lines += ["## Limites", ""] + [f"- {escape(warning)}" for warning in comparison.warnings]
    lines += ["", "## Sources et dates déclarées", ""]
    for source_id in search.source_ids:
        source = by_id[source_id]
        lines.append(f"- {escape(source.id)} : {escape(source.title)}, date déclarée {source.observed_on}. "
                     + (f"Référence : {escape(str(source.source_url))}. URL non consultée."
                        if source.source_url else "Document fourni, sans URL."))
    lines += ["", "## Prochaines actions", "",
              "- Confirmer les informations non documentées auprès des sources.",
              "- Vérifier les critères du brief qui ne figurent pas dans les contraintes structurées.",
              "- Décider après confirmation des prestations, prix et disponibilités.", ""]
    return "\n".join(lines)
