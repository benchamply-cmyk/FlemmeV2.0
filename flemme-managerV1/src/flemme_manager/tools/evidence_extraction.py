"""Conservative literal extraction. Multiple distinct values remain unknown."""
import re
from datetime import datetime, timezone
from decimal import Decimal
from flemme_manager.acquisition_schemas import AcquiredSource, Citation, Fact

NUMBER = r'(\d+(?:[ \u00a0]\d{3})*(?:[,.]\d{1,2})?)'
PATTERNS = {
    'monthly_price': NUMBER + r'\s*(?:€|euros?|EUR)\s*(?:TTC\s*)?(?:/\s*mois|par mois|mensuels?)',
    'duration_months': r'(\d{1,3})\s*mois\b',
    'mileage_km': NUMBER + r'\s*km\b',
    'upfront_payment': r'(?:apport|premier loyer(?: majoré)?)\s*(?:de|:|=)?\s*' + NUMBER + r'\s*(?:€|euros?|EUR)',
    'total_price': r'(?:total(?: général)?|montant total)\s*(?:TTC\s*)?(?::|=)?\s*' + NUMBER + r'\s*(?:€|euros?|EUR)',
}
TEXT_PATTERNS = {
    'taxes': r'\b(?:TTC|HT|TVA|taxes? incluses?|taxes? exclues?)\b',
    'availability': r'\b(?:disponib\w*|en stock|offre valable|jusqu.au)\b',
    'restrictions': r'\b(?:sous réserve|conditions?|réservé\w*|éligib\w*|hors |limites?|plafond|franchise)\b',
    'inclusions': r'\b(?:inclus\w*|comprend|prestations?|garantie|entretien)\b',
    'exclusions': r'\b(?:exclus\w*|non inclus\w*|hors |ne comprend pas)\b',
    'hybrid': r'\bhybride\b',
}


def numeric(value):
    return str(Decimal(value.replace(' ', '').replace('\u00a0', '').replace(',', '.')))


def extract(source_id, title, origin, pages, url=None, sha256=None):
    facts = {}
    for name, pattern in PATTERNS.items():
        matches = []
        for page, text in pages.items():
            for line in text.splitlines():
                # Long mixed paragraphs are not unambiguous quote lines.
                if len(line) > 500:
                    continue
                for match in re.finditer(pattern, line, re.I):
                    matches.append((numeric(match.group(1)), Citation(page=page, quote=line)))
        values = {value for value, _ in matches}
        facts[name] = Fact(value=next(iter(values)), status='verified',
                           citations=[citation for _, citation in matches][:2]) if len(values) == 1 else Fact()
    for name, pattern in TEXT_PATTERNS.items():
        citations = [Citation(page=page, quote=line) for page, text in pages.items()
                     for line in text.splitlines() if len(line) <= 500 and re.search(pattern, line, re.I)]
        facts[name] = Fact(value='\n'.join(c.quote for c in citations[:2]), status='verified',
                           citations=citations[:2]) if citations else Fact()
    warnings = ['Vérifié signifie cité dans le texte lu ; exactitude commerciale et disponibilité non garanties.',
                'Les montants multiples ou ambigus restent inconnus. Aucune donnée manquante n’est complétée.',
                'Le kilométrage cité peut être annuel ou contractuel : consulter son extrait.',
                'Les prestations, exclusions et restrictions sont des extraits, sans garantie d’exhaustivité.']
    source = AcquiredSource(id=source_id, title=title, origin=origin, url=url, sha256=sha256,
                           observed_at=datetime.now(timezone.utc), pages=pages, facts=facts, warnings=warnings,
                           offer_status='estimated' if any(f.value for f in facts.values()) else 'unknown')
    check_source(source)
    return source


def check_source(source):
    for fact in source.facts.values():
        if fact.status == 'unknown' and (fact.value is not None or fact.citations):
            raise ValueError('Unknown fact carries evidence')
        if fact.status != 'unknown' and (fact.value is None or not fact.citations):
            raise ValueError('Uncited fact')
        for citation in fact.citations:
            if citation.quote not in source.pages.get(citation.page, ''):
                raise ValueError('Fabricated citation')
    # Recompute instead of trusting values with authentic but unrelated citations.
    for name, pattern in PATTERNS.items():
        fact = source.facts[name]
        all_values = {numeric(m.group(1)) for text in source.pages.values() for line in text.splitlines()
                      if len(line) <= 500 for m in re.finditer(pattern, line, re.I)}
        if fact.value is not None:
            values = {numeric(m.group(1)) for c in fact.citations
                      for m in re.finditer(pattern, c.quote, re.I)}
            if values != {fact.value} or all_values != {fact.value}:
                raise ValueError('Value/citation mismatch')
    for name in TEXT_PATTERNS:
        fact = source.facts[name]
        if fact.value is not None and fact.value != '\n'.join(c.quote for c in fact.citations):
            raise ValueError('Text/citation mismatch')
