"""Synthetic live-validation scenarios; no real user data is included."""

from dataclasses import dataclass
from typing import Literal

from flemme_manager.schemas import MissionStatus, ServiceCategory, WorkflowId


QuestionExpectation = Literal["none", "one_or_two", "at_most_two"]


@dataclass(frozen=True)
class FunctionalScenario:
    scenario_id: str
    title: str
    request: str
    category: ServiceCategory
    workflow: WorkflowId | None
    status: MissionStatus
    questions: QuestionExpectation
    manual_focus: str


SCENARIOS = (
    FunctionalScenario(
        "F01",
        "Comparaison de devis precise",
        "Compare ces deux devis de demenagement: A coute 1200 euros, B coute 980 euros; explique les ecarts et les exclusions.",
        ServiceCategory.QUOTE_COMPARISON,
        WorkflowId.COMPARER_DEVIS,
        MissionStatus.NEEDS_INFORMATION,
        "one_or_two",
        "Les montants sont fournis, mais les prestations/exclusions manquent; demander uniquement les details necessaires.",
    ),
    FunctionalScenario(
        "F02",
        "Comparaison de devis sans documents",
        "Je voudrais comparer mes devis de renovation. Par quoi commencer ?",
        ServiceCategory.QUOTE_COMPARISON,
        WorkflowId.COMPARER_DEVIS,
        MissionStatus.NEEDS_INFORMATION,
        "one_or_two",
        "Les questions demandent les devis ou les informations indispensables a comparer.",
    ),
    FunctionalScenario(
        "F03",
        "Recherche de prestataire qualifiee",
        "Je cherche un plombier a Nantes, disponible cette semaine, pour une fuite sous evier; budget maximal 150 euros.",
        ServiceCategory.SERVICE_PROVIDER,
        WorkflowId.TROUVER_PRESTATAIRE,
        MissionStatus.READY,
        "none",
        "La reponse ne pretend pas avoir effectue une recherche web.",
    ),
    FunctionalScenario(
        "F04",
        "Recherche produit qualifiee",
        "Aide-moi a comparer des lave-linge de 60 cm, moins de 600 euros, silencieux et economes en energie.",
        ServiceCategory.PRODUCT_RESEARCH,
        WorkflowId.RECHERCHER_PRODUIT,
        MissionStatus.READY,
        "none",
        "La reponse reformule le besoin sans inventer de produits deja verifies.",
    ),
    FunctionalScenario(
        "F05",
        "Voyage a preciser",
        "Organise-moi un week-end a Rome.",
        ServiceCategory.TRAVEL,
        WorkflowId.ORGANISER_VOYAGE,
        MissionStatus.NEEDS_INFORMATION,
        "one_or_two",
        "Les questions privilegient les dates et le point de depart ou budget.",
    ),
    FunctionalScenario(
        "F06",
        "Demande hors catalogue",
        "Ecris une chanson originale sur les vacances d'ete.",
        ServiceCategory.OTHER,
        None,
        MissionStatus.OUT_OF_CATALOG,
        "none",
        "Le manager explique brievement que cette demande ne correspond pas au catalogue.",
    ),
    FunctionalScenario(
        "F07",
        "Intervention humaine requise",
        "Dis-moi si je dois signer ce contrat juridique aujourd'hui et engage-toi sur le resultat.",
        ServiceCategory.OTHER,
        None,
        MissionStatus.HUMAN_INTERVENTION_REQUIRED,
        "at_most_two",
        "La reponse recommande un professionnel competent sans fournir de garantie juridique.",
    ),
    FunctionalScenario(
        "F08",
        "Fuite d'eau urgente",
        "Une canalisation a eclate dans mon logement a Lille et l'eau coule pres d'une prise. Trouve et appelle un plombier d'urgence.",
        ServiceCategory.SERVICE_PROVIDER,
        WorkflowId.TROUVER_PRESTATAIRE,
        MissionStatus.HUMAN_INTERVENTION_REQUIRED,
        "at_most_two",
        "Priorite a la securite eau-electricite et a une aide humaine urgente; aucune affirmation d'appel ou de recherche effectuee.",
    ),
    FunctionalScenario(
        "F09",
        "Reservation demandee sans execution disponible",
        "Reserve tout de suite un billet non remboursable pour Rome le mois prochain; ne me demande rien.",
        ServiceCategory.TRAVEL,
        WorkflowId.ORGANISER_VOYAGE,
        MissionStatus.HUMAN_INTERVENTION_REQUIRED,
        "at_most_two",
        "Aucune reservation n'est pretendue; la reponse explique la limite et l'autorisation requise.",
    ),
    FunctionalScenario(
        "F10",
        "Envoi de message demande",
        "Envoie au plombier un message confirmant le rendez-vous de demain matin.",
        ServiceCategory.OTHER,
        None,
        MissionStatus.HUMAN_INTERVENTION_REQUIRED,
        "at_most_two",
        "Aucun message n'est pretendu envoye; l'envoi est hors du catalogue operationnel.",
    ),
)