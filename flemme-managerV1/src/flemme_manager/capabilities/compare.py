"""Deterministic compare tool owned by Flemme Manager."""
from decimal import Decimal, ROUND_HALF_UP

from flemme_manager.text_utils import normalized
from flemme_manager.delivery_schemas import (
    CandidateComparison, ComparisonResult, DeliveryInput, PriceGroup, SearchResult,
)


def run(search: SearchResult, evidence: DeliveryInput) -> ComparisonResult:
    by_id = {source.id: source for source in evidence.sources}
    constraints = evidence.constraints
    candidates = []
    groups = {}
    warnings = ["Sources fournies par l'opérateur ; prix, disponibilités et affirmations non vérifiés sur le web.",
                "L'évaluation porte uniquement sur les critères structurés fournis, pas sur toutes les préférences du brief."]
    for source_id in search.source_ids:
        source = by_id[source_id]
        unknowns = []
        comparable = (source.price is not None and source.currency is not None
                      and source.price_basis is not None and source.tax_basis is not None)
        within_budget = None
        tests = []
        if constraints.max_price is not None:
            if comparable and (source.currency, source.price_basis, source.tax_basis) == (
                constraints.currency, constraints.price_basis, constraints.tax_basis
            ):
                within_budget = source.price <= constraints.max_price
            else:
                unknowns.append("Prix absent ou base/devise/taxes incompatibles avec le budget.")
            tests.append(within_budget)
        location_match = None
        if constraints.location is not None:
            location_match = (normalized(source.location) == normalized(constraints.location)
                              if source.location else None)
            tests.append(location_match)
            if location_match is None:
                unknowns.append("Localisation non renseignée.")
        availability_match = None
        if constraints.available_on is not None:
            availability_match = (source.available_on == constraints.available_on
                                  if source.available_on else None)
            tests.append(availability_match)
            if availability_match is None:
                unknowns.append("Disponibilité non renseignée.")
        duration_match = None
        if constraints.duration_months is not None:
            duration_match = (source.duration_months == constraints.duration_months
                              if source.duration_months is not None else None)
            tests.append(duration_match)
            if duration_match is None:
                unknowns.append("Durée du contrat non renseignée.")
        upfront_within_budget = None
        if constraints.max_upfront_payment is not None:
            if (source.upfront_payment is not None and source.currency == constraints.currency
                and source.tax_basis == constraints.tax_basis):
                upfront_within_budget = source.upfront_payment <= constraints.max_upfront_payment
            else:
                unknowns.append("Apport absent ou devise/taxes incompatibles.")
            tests.append(upfront_within_budget)
        features = {normalized(key): value for key, value in source.features.items()}
        feature_matches = {}
        for feature in constraints.required_features:
            value = features.get(normalized(feature))
            feature_matches[feature] = value
            tests.append(value)
            if value is None:
                unknowns.append(f"Critère non confirmé : {feature}.")
        matches = False if False in tests else None if None in tests or not tests else True
        candidates.append(CandidateComparison(
            source_id=source_id, within_budget=within_budget, location_match=location_match,
            availability_match=availability_match, feature_matches=feature_matches,
            duration_match=duration_match, upfront_within_budget=upfront_within_budget,
            meets_supplied_constraints=matches, unknowns=unknowns))
        if comparable:
            key = (source.currency, source.price_basis, source.tax_basis)
            groups.setdefault(key, []).append(source)
        else:
            warnings.append(f"{source.id} : prix ou base de comparaison incomplets.")
        if not source.inclusions:
            warnings.append(f"{source.id} : prestations incluses non documentées.")
        if not source.exclusions:
            warnings.append(f"{source.id} : exclusions non documentées ; leur absence n'est pas prouvée.")
    price_groups = []
    for (currency, price_basis, tax_basis), sources in groups.items():
        low = min(source.price for source in sources)
        high = max(source.price for source in sources)
        spread = high - low
        percent = ((spread / low * 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                   if low != 0 else None)
        price_groups.append(PriceGroup(currency=currency, price_basis=price_basis, tax_basis=tax_basis,
            source_ids=[source.id for source in sources], lowest_price=low, highest_price=high,
            spread=spread, spread_percent_of_lowest=percent,
            lowest_price_ids=[source.id for source in sources if source.price == low]))
    if len(price_groups) > 1:
        warnings.append("Groupes de prix distincts : aucun classement global ni conversion de devises.")
    return ComparisonResult(candidates=candidates, price_groups=price_groups, warnings=warnings)
