"""Acquisition reserves once before cost, preserves originals, and finishes V3 history."""
import base64
import hashlib
from datetime import datetime, timezone
from decimal import Decimal
from pydantic import Field
from flemme_manager.acquisition_schemas import AcquisitionRequest, AcquisitionError
from flemme_manager.delivery_schemas import StrictModel
from flemme_manager.agents import search
from flemme_manager.agents.writer import escape
from flemme_manager.memory.supabase import StorageError
from flemme_manager.services.delivery_v3 import require_qualification
from flemme_manager.tools.pdf_reader import validate_upload, read_document
from flemme_manager.tools.evidence_extraction import extract, check_source

FACT_LABELS = {'monthly_price': 'Loyer mensuel (EUR)', 'total_price': 'Prix total (EUR)',
    'duration_months': 'Durée (mois)', 'mileage_km': 'Kilométrage cité (km)',
    'upfront_payment': 'Apport ou premier loyer (EUR)', 'taxes': 'Taxes',
    'availability': 'Disponibilité et validité', 'restrictions': 'Restrictions et limites',
    'inclusions': 'Prestations incluses', 'exclusions': 'Exclusions', 'hybrid': 'Mention hybride'}
STATUS_LABELS = {'verified': 'vérifié dans le texte', 'estimated': 'estimé', 'unknown': 'inconnu'}


class DocumentUpload(StrictModel):
    name: str = Field(min_length=1, max_length=105)
    content_base64: str = Field(min_length=1, max_length=1_333_336)


class Acquire(AcquisitionRequest):
    mode: str = Field(pattern='^(web|documents)$')
    documents: list[DocumentUpload] = Field(default_factory=list, max_length=3)


def uploads(request):
    if (request.mode == 'web' and request.documents) or (
            request.mode == 'documents' and not 2 <= len(request.documents) <= 3):
        raise AcquisitionError('Fournis deux ou trois devis, ou choisis la recherche web sans document.')
    result = []
    for document in request.documents:
        try:
            data = base64.b64decode(document.content_base64, validate=True)
        except ValueError:
            raise AcquisitionError('Document encodé invalide.') from None
        validate_upload(document.name, data)
        result.append((document, data, hashlib.sha256(data).hexdigest()))
    return result


def report(sources, request, workflow, trace):
    lines = ['# Recherche et comparaison de sources réelles', '',
             'Généré le ' + datetime.now(timezone.utc).isoformat(), '',
             'Vérifié = extrait littéral dans la source lue. Offre estimée = conditions commerciales '
             'non confirmées par le vendeur. Inconnu = absent, ambigu ou illisible.', '',
             'Aucun achat, contact ou réservation. Aucun avis définitif d’éligibilité ou de disponibilité.', '',
             '| Source | Prix cité | Sous le plafond saisi | État de l’offre |',
             '| --- | --- | --- | --- |']
    comparisons, price_groups = [], {}
    for source in sources:
        check_source(source)
        price = source.facts['monthly_price' if request.mode == 'web' else 'total_price']
        # Currency and tax must be explicit on the same price citation before comparing.
        tax = None
        if price.citations:
            quote = price.citations[0].quote.upper()
            if 'TTC' in quote and 'HT' not in quote:
                tax = 'included'
            elif 'HT' in quote and 'TTC' not in quote:
                tax = 'excluded'
        c = request.constraints
        basis = 'per_month' if request.mode == 'web' else 'total'
        within = (Decimal(price.value) <= c.max_price) if (
            price.value is not None and c.max_price is not None and c.currency == 'EUR'
            and c.price_basis == basis and c.tax_basis == tax) else None
        comparisons.append({'source_id': source.id, 'within_budget': within,
                            'offer_eligible': None, 'availability_confirmed': None,
                            'duration_match': int(source.facts['duration_months'].value) == c.duration_months
                                if source.facts['duration_months'].value is not None and c.duration_months is not None else None,
                            'location_match': None, 'upfront_within_budget': None,
                            'feature_matches': {feature: None for feature in c.required_features}})
        if price.value is not None and tax is not None:
            price_groups.setdefault(tax, []).append((source.id, Decimal(price.value)))
        lines.append(f'| {escape(source.title)} | {price.value or "Inconnu"} '
                     f'{"EUR" if price.value else ""} | '
                     f'{"Oui, montant affiché seulement" if within is True else "Non" if within is False else "Inconnu"} '
                     f'| {STATUS_LABELS[source.offer_status]} |')
    lines += ['', '## Écarts calculés sur les montants comparables']
    for tax, values in price_groups.items():
        if len(values) >= 2:
            amounts = [amount for _, amount in values]
            lines.append(f'- EUR {"TTC" if tax == "included" else "HT"}, '
                         f'{"par mois" if request.mode == "web" else "total"} : '
                         f'écart {max(amounts) - min(amounts):.2f} EUR entre '
                         + ', '.join(source_id for source_id, _ in values) + '.')
    lines.append('Un écart de prix ne prouve pas des prestations équivalentes. '
                 'Lieu, apport maximal et caractéristiques demandées restent à valider humainement.')
    for source in sources:
        lines += ['', '## ' + escape(source.title),
                  'Source : ' + (source.url or 'document ' + source.id) +
                  ' ; consultée le ' + source.observed_at.isoformat(),
                  'Empreinte : ' + (source.sha256 or 'texte web conservé dans le résultat')]
        for name, fact in source.facts.items():
            lines.append(f'- {FACT_LABELS[name]} : {escape(fact.value or "Inconnu")} ({STATUS_LABELS[fact.status]})')
            for citation in fact.citations:
                label = f'page {citation.page}' if source.origin == 'document' and source.title.lower().endswith('.pdf') else f'bloc {citation.page}'
                lines.append(f'  [{label}] « {escape(citation.quote)} »')
        lines += [escape(warning) for warning in source.warnings]
    if not sources:
        lines += ['', 'Aucune source n’a pu être lue. Aucune offre n’est inventée.']
    lines += ['', '## Limites', 'Pas de classement global entre prestations non équivalentes. '
              'Les extraits ne prouvent pas que toutes les exclusions ont été détectées. '
              'Durée, kilométrage annuel ou total, premier loyer, taxes, disponibilité et restrictions '
              'doivent être confirmés avant toute décision.',
              'La recherche peut fournir moins de trois offres ; pages dynamiques, redirections, '
              'scans et montants ambigus restent non vérifiés.']
    return {'workflow_id': workflow, 'generated_at': datetime.now(timezone.utc).isoformat(),
            'agents': ['Search', 'Compare', 'Writer', 'Quality'],
            'agent_activity': [
                {'agent': 'Search', 'status': 'completed' if request.mode == 'web' else 'skipped', 'task': 'Recherche web outillée' if request.mode == 'web' else 'Aucune recherche web'},
                {'agent': 'Document', 'status': 'completed' if request.mode == 'documents' else 'skipped', 'task': 'Extraction de ' + str(len(sources)) + ' document(s)' if request.mode == 'documents' else 'Aucun document analysé'},
                {'agent': 'Compare', 'status': 'completed', 'task': 'Comparaison des données disponibles ; inconnues conservées'},
                {'agent': 'Quality', 'status': 'completed', 'task': 'Contrôle des citations et montants comparables ; validation humaine requise'}],
            'search': {'mode': request.mode, 'source_ids': [s.id for s in sources], 'trace': trace},
            'sources': [s.model_dump(mode='json') for s in sources], 'comparison': comparisons,
            'markdown': '\n'.join(lines), 'quality': {'passed': True, 'checks': [
                'literal_citations', 'numeric_citation_values', 'unknown_conditions', 'no_model_prose',
                'separate_currency_basis_taxes', 'no_purchase_or_contact']}}


async def produce(memory, conversation_id, request):
    documents = uploads(request)
    metadata = request.model_dump(mode='json', exclude={'documents', 'request_id', 'expected_revision'})
    metadata['documents'] = [{'name': doc.name, 'sha256': digest} for doc, _, digest in documents]
    # Placeholder is explicitly labelled acquisition metadata, never an offer.
    payload = {'sources': [{'id': 'acquisition-request', 'kind': 'acquisition_metadata'}],
               'acquisition': metadata}
    originals = [{'name': doc.name, 'sha256': digest, 'content_base64': doc.content_base64}
                 for doc, _, digest in documents]
    reservation = await memory.request('POST', '/rest/v1/rpc/fm_v4_prepare', {
        'p_conversation_id': conversation_id, 'p_request_id': str(request.request_id),
        'p_expected_revision': request.expected_revision, 'p_payload': payload, 'p_documents': originals})
    if reservation.get('replayed'):
        if reservation.get('output'):
            return reservation
        raise StorageError(409)
    sources, trace = [], {}
    try:
        qualification = require_qualification(reservation['snapshot'])
        workflow = qualification.selected_workflow.workflow_id.value
        if request.mode == 'documents' and workflow != 'comparer_devis':
            raise AcquisitionError('Les devis nécessitent une mission qualifiée de comparaison.')
        if request.mode == 'web' and workflow == 'comparer_devis':
            raise AcquisitionError('Cette mission attend des devis fournis.')
        if request.mode == 'web':
            sources, trace = await search.acquire(request.query)
        else:
            for index, (document, data, digest) in enumerate(documents, 1):
                pages = await read_document(document.name, data)
                source = extract(f'doc-{index}', document.name, 'document', pages, sha256=digest)
                source.warnings.append('Extraction textuelle seulement : images et mise en page des tableaux '
                                       'nécessitent une vérification visuelle humaine.')
                if not document.name.lower().endswith('.pdf'):
                    source.warnings.append('TXT/DOCX : blocs logiques ; pagination physique non disponible.')
                sources.append(source)
        result = report(sources, request, workflow, trace)
        return await memory.delivery_command('finish', conversation_id, str(request.request_id), payload={
            'result': result, 'note': 'Acquisition outillée ; sources et extraits datés conservés.'})
    except Exception as error:
        await memory.delivery_command('finish', conversation_id, str(request.request_id), payload={
            'failure': 'execution_error', 'note': 'Acquisition non aboutie ; tentative et documents conservés.',
            'draft': {'sources': [s.model_dump(mode='json') for s in sources], 'trace': trace}})
        if isinstance(error, (AcquisitionError, StorageError)):
            raise
        raise AcquisitionError('Acquisition non aboutie ; données conservées.') from None
