"""Customer conversations; the proxy is the only public entry point."""
import re
from fastapi import APIRouter, Depends, Header, HTTPException, Response
from flemme_manager.agents import qualification as agent
from flemme_manager.agents.manager import ManagerConfigurationError, ManagerExecutionError
from flemme_manager.qualification_models import StartConversation, SendMessage, ConfirmMission, QualificationAssessment
from flemme_manager.security import service_auth
from flemme_manager.services.conversation_store import Store
from flemme_manager.workflows.qualification import qualification_summary

router = APIRouter(prefix="/api/qualification", tags=["qualification"], dependencies=[Depends(service_auth)])

def store():
    s = Store()
    s.prune()
    return s

def token(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(404, "Conversation introuvable ou expirée.")
    return authorization[7:]

def public(row):
    data = row["data"]
    assessment = QualificationAssessment.model_validate(data["assessment"]) if data["assessment"] else None
    summary = qualification_summary(assessment) if assessment else {"ready": False, "human_required": False, "questions": [], "facts": {}, "expected_result": data["history"][0]["content"]}
    return {"id": row["id"], "version": row["version"], "state": row["state"],
            "history": data["history"], "summary": summary, "reference": data["reference"]}

@router.post("/conversations", status_code=201)
def start(body: StartConversation, response: Response, x_flemme_client_id: str = Header(default="unknown")):
    s = store()
    s.quota("create:" + x_flemme_client_id)
    cid, secret = s.create(body.task)
    response.headers["Cache-Control"] = "no-store"
    return {**public(s.get(cid, secret)), "token": secret}

@router.get("/conversations/{cid}")
def read(cid: str, secret: str = Depends(token)):
    return public(store().get(cid, secret))

@router.post("/conversations/{cid}/messages")
async def message(cid: str, body: SendMessage, secret: str = Depends(token), x_flemme_client_id: str = Header(default="unknown")):
    s = store()
    row, acquired = s.reserve(cid, secret, body.version, body.request_id, body.message)
    if not acquired:
        return public(row)
    data = row["data"]
    try:
        s.quota(x_flemme_client_id)
        history = data["history"] + [{"role": "user", "content": body.message}]
        if sum(len(m["content"]) for m in history) > 24000:
            raise HTTPException(409, "Échange trop long : utilise le formulaire pour contacter l’équipe.")
        previous = (data["assessment"] or {}).get("facts", {})
        assessment = await agent.analyze_conversation(history, previous)
        summary = qualification_summary(assessment)
        text = assessment.user_response.message
        if summary["questions"]:
            text = "Pour préparer ta mission, j’ai besoin de ces précisions :\n" + "\n".join(summary["questions"])
        elif summary["ready"]:
            text = "Voici le récapitulatif. Relis-le pour transmettre ta demande à l’équipe."
        data.update(history=history + [{"role": "assistant", "content": text}],
                    assessment=assessment.model_dump(mode="json"), last_request=body.request_id, last_message=body.message)
        return public(s.save_turn(cid, secret, row["version"], data))
    except ManagerConfigurationError:
        raise HTTPException(503, "L’assistant est indisponible. Tu peux utiliser le formulaire.") from None
    except ManagerExecutionError:
        raise HTTPException(502, "L’analyse a échoué. Réessaie ou utilise le formulaire.") from None
    finally:
        s.release(cid, row["version"])

@router.post("/conversations/{cid}/confirm")
def confirm(cid: str, body: ConfirmMission, secret: str = Depends(token)):
    email = re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", body.contact)
    phone = re.fullmatch(r"[+()\d .-]+", body.contact) and 8 <= len(re.sub(r"\D", "", body.contact)) <= 15
    if not (email or phone):
        raise HTTPException(422, "Contact invalide.")
    s = store()
    row = s.get(cid, secret)
    summary = public(row)["summary"]
    return public(s.confirm(cid, secret, body, summary))

@router.delete("/conversations/{cid}", status_code=204)
def delete(cid: str, secret: str = Depends(token)):
    store().delete(cid, secret)
    return Response(status_code=204)
