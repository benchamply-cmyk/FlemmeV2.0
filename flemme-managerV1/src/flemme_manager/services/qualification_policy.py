"""Narrow, deterministic qualification rules; never execute a workflow.

Unrecognised requests continue to the existing model. These rules do not claim
to be a general language understanding or emergency detection system.
"""

import re
import unicodedata

from flemme_manager.schemas import (
    ManagerAssessment, MissionStatus, ServiceCategory, UserRequest,
    WORKFLOW_BY_CATEGORY, validate_manager_assessment,
)


def normalized(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text.lower())
                   if not unicodedata.combining(c)).replace("’", "'")


def decision(request, category, status, reason, message):
    return validate_manager_assessment(ManagerAssessment(
        service_category=category,
        expected_result={"description": request.request[:500]},
        selected_workflow={"workflow_id": WORKFLOW_BY_CATEGORY.get(category),
                           "reason": reason},
        missing_information=[], qualification_questions=[],
        mission_status=status,
        human_intervention_required=status == MissionStatus.HUMAN_INTERVENTION_REQUIRED,
        user_response={"message": message},
    ))


def qualify_locally(request: UserRequest) -> ManagerAssessment | None:
    text = normalized(request.request)
    # Safety precedes catalog routing, credentials and the model.
    water = re.search(r"\b(eau|inondation|canalisation|fuite)\b", text)
    electricity = re.search(r"\b(prise|prises|electrique|electricite|sous tension)\b", text)
    hazard = re.search(r"\b(pres|proche|contact|coule|eclate|inondation)\b", text)
    negated = re.search(r"\b(pas|aucune?|sans)\b.{0,30}\b(eau|fuite|inondation|canalisation)\b", text)
    if water and electricity and hazard and not negated:
        return decision(
            request, ServiceCategory.SERVICE_PROVIDER,
            MissionStatus.HUMAN_INTERVENTION_REQUIRED,
            "Danger eau-électricité : sécurité et intervention humaine prioritaires.",
            "Éloigne-toi de l'eau et des équipements électriques. Ne touche rien de mouillé "
            "ou sous tension. Contacte toi-même les secours ou le service d'urgence local. "
            "Ne coupe le courant que depuis un endroit sec et sûr. Je ne peux pas appeler à ta place.",
        )
    # External execution takes precedence over collecting booking/contact data.
    # Restrict these rules to explicit imperatives, not mentions of reservations
    # or requests to draft a message.
    if re.search(r"\b(?:reserve|reservez)\b", text) and re.search(
        r"\b(?:vol|billet|hotel|voyage|rome|train)\b", text
    ) and not re.search(r"\b(?:ne|pas|sans)\b.{0,20}\breserve\b", text):
        return decision(
            request, ServiceCategory.TRAVEL, MissionStatus.HUMAN_INTERVENTION_REQUIRED,
            "La réservation exige une action externe indisponible dans ce manager.",
            "Je peux qualifier ton projet de voyage, mais je ne peux pas réserver ni payer. "
            "Aucune réservation n'a été effectuée. Une personne doit vérifier les conditions "
            "et autoriser puis effectuer la réservation auprès du prestataire.",
        )
    if re.search(r"\b(?:envoie|envoyez)\b.{0,80}\b(?:message|mail|sms|courriel)\b", text) \
            and not re.search(r"\b(?:ne|n'|pas|sans).{0,20}\benvoie\b", text):
        return decision(
            request, ServiceCategory.OTHER, MissionStatus.HUMAN_INTERVENTION_REQUIRED,
            "L'envoi de messages n'appartient pas au catalogue opérationnel.",
            "Je ne peux pas envoyer de message. Aucun message n'a été envoyé. "
            "Tu dois vérifier le destinataire et le contenu puis effectuer toi-même l'envoi.",
        )
    if re.search(r"\b(?:appelle|appelez|telephone)\b.{0,60}\bplombier\b", text):
        return decision(
            request, ServiceCategory.SERVICE_PROVIDER, MissionStatus.HUMAN_INTERVENTION_REQUIRED,
            "Un appel à un prestataire exige une intervention humaine.",
            "Je ne peux pas appeler un prestataire. Aucun appel n'a été effectué. "
            "Contacte toi-même un professionnel ; en cas de danger immédiat, contacte les secours.",
        )
    if re.search(r"\b(contrat|juridique)\b", text) and re.search(
        r"\b(signer|signature|engage|garantis)\b", text
    ):
        return decision(
            request, ServiceCategory.OTHER, MissionStatus.HUMAN_INTERVENTION_REQUIRED,
            "Une décision juridique engageante requiert un professionnel.",
            "Consulte un professionnel du droit avant de décider de signer. "
            "Je ne peux pas prendre cette décision pour toi ni garantir son résultat.",
        )
    if re.search(r"\b(ecris|compose|redige)\b.{0,40}\b(chanson|poeme)\b", text):
        return decision(
            request, ServiceCategory.OTHER, MissionStatus.OUT_OF_CATALOG,
            "La création de chansons ou de poèmes est hors du catalogue actuel.",
            "Cette création ne correspond pas au catalogue actuel de Flemme. "
            "Je peux qualifier une comparaison de devis, un besoin de prestataire, "
            "une recherche de produit ou un projet de voyage.",
        )
    leasing = qualify_leasing(request)
    if leasing is not None:
        return leasing
    # Narrow product qualification: optional brands/noise thresholds never block
    # a washing-machine brief. Safety/external-action rules above take priority.
    if (re.search(r"\b(?:compare|comparer|cherche|recherche)\b", text)
        and re.search(r"\blave[- ]linge\b", text)
        and re.search(r"\b\d+(?:[.,]\d+)?\s*cm\b", text)
        and not re.search(r"\b(?:achete|commande|reserve)\b", text)):
        budget = re.search(r"\b\d+(?:[.,]\d+)?\s*(?:euros?\b|€)", text)
        if budget and not re.search(r"\b(?:sans budget|budget inconnu)\b", text):
            return decision(
                request, ServiceCategory.PRODUCT_RESEARCH, MissionStatus.READY,
                "Produit, dimensions et budget suffisent pour qualifier le brief.",
                "Ton besoin est suffisamment précisé pour préparer un brief de lave-linge. "
                "La marque et le seuil sonore exact sont facultatifs. "
                "Aucun modèle ni prix n'a été vérifié ; aucune recherche web n'a été effectuée.",
            )
        return validate_manager_assessment(ManagerAssessment(
            service_category=ServiceCategory.PRODUCT_RESEARCH,
            expected_result={"description": request.request[:500]},
            selected_workflow={"workflow_id": WORKFLOW_BY_CATEGORY[ServiceCategory.PRODUCT_RESEARCH],
                               "reason": "Le produit et les dimensions sont connus ; le budget manque."},
            missing_information=[{"name": "budget", "reason": "Délimiter le budget du brief."}],
            qualification_questions=[{"question": "Quel budget maximal souhaites-tu respecter ?",
                "why_needed": "Le budget est indispensable pour qualifier ce brief.", "priority": 1}],
            mission_status=MissionStatus.NEEDS_INFORMATION,
            human_intervention_required=False,
            user_response={"message": "Quel budget maximal souhaites-tu respecter pour ce lave-linge ? "
                "Aucun modèle ni prix n'a été vérifié."},
        ))
    # Only a fully specified, non-urgent plumbing brief is handled here.
    # Exact dates and street addresses are unnecessary for qualification.
    if (re.search(r"\b(cherche|recherche|trouve)\b.{0,40}\bplombier\b", text)
        and re.search(r"\ba [a-z][a-z -]{1,60}[,;]", text)
        and re.search(r"\b(cette semaine|demain|aujourd'hui|le \d{1,2})\b", text)
        and re.search(r"\b\d+(?:[.,]\d+)?\s*(?:euros?|€)", text)
        and re.search(r"\b(fuite|evier|robinet)\b", text)
        and not electricity
        and not re.search(r"\b(urgence|urgent|appelle|telephone|inondation)\b", text)):
        return decision(
            request, ServiceCategory.SERVICE_PROVIDER, MissionStatus.READY,
            "Lieu, période, budget et besoin sont fournis pour qualifier la mission.",
            "Ton besoin de plomberie est suffisamment précisé pour préparer un brief. "
            "Je ne dispose pas de recherche web ni d'appel ; aucun prestataire n'a été recherché ou contacté.",
        )
    return None


def qualify_leasing(request: UserRequest) -> ManagerAssessment | None:
    """Read-only vehicle search: optional brand/city never blocks the next step."""
    text = normalized(request.request)
    if not re.search(r'\b(leasing|loa|lld)\b', text) or not re.search(
            r'\b(voiture|vehicule|hybride|auto)\b', text):
        return None
    if re.search(r'\b(achete|commande|reserve|signe|paie|paye|souscris)\b', text) and not re.search(
            r"\b(pas|sans|ne|n')\b.{0,20}\b(achete|commande|reserve|signe|paie|paye|souscris)\b", text):
        return decision(request, ServiceCategory.PRODUCT_RESEARCH,
                        MissionStatus.HUMAN_INTERVENTION_REQUIRED,
                        'Une souscription ou un paiement engageant nécessite une personne.',
                        'Je peux préparer une comparaison, mais pas signer, réserver ou payer. '
                        'Aucune action engageante n’a été effectuée.')
    monthly = re.search(r'\b\d+(?:[.,]\d+)?\s*(?:€|euros?|eur)\s*(?:/\s*mois|par mois|mensuels?)\b', text)
    unknown_budget = re.search(r'\b(sans budget|budget inconnu|budget non defini)\b', text)
    if monthly and not unknown_budget:
        return decision(request, ServiceCategory.PRODUCT_RESEARCH, MissionStatus.READY,
                        'Véhicule, financement et plafond mensuel suffisent pour lancer la préparation.',
                        'Le besoin est qualifié. Marque et ville restent facultatives pour une première recherche. '
                        'Le plan devra être validé avant exécution. Aucun prix ni aucune offre ne sont encore vérifiés ; '
                        'apport, durée, kilométrage, taxes et éligibilité seront signalés ou laissés inconnus.')
    return validate_manager_assessment(ManagerAssessment(
        service_category=ServiceCategory.PRODUCT_RESEARCH,
        expected_result={'description': request.request[:500]},
        selected_workflow={'workflow_id': WORKFLOW_BY_CATEGORY[ServiceCategory.PRODUCT_RESEARCH],
                           'reason': 'Le plafond mensuel de la recherche manque.'},
        missing_information=[{'name': 'monthly_budget', 'reason': 'Délimiter le loyer mensuel souhaité.'}],
        qualification_questions=[{'question': 'Quel loyer mensuel maximal souhaites-tu ?',
                                  'why_needed': 'Fixer le plafond de recherche.', 'priority': 1}],
        mission_status=MissionStatus.NEEDS_INFORMATION, human_intervention_required=False,
        user_response={'message': 'Quel loyer mensuel maximal souhaites-tu ? La marque est facultative.'},
    ))
