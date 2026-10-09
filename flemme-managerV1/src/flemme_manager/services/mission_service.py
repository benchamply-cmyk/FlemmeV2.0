"""Human approval creates one durable, allowlisted preparation job per mission."""
import json
import secrets
import time
from uuid import uuid4
from fastapi import HTTPException
from flemme_manager.qualification_models import QualificationAssessment
from flemme_manager.services.conversation_store import Store, digest
from flemme_manager.workflows.qualification import qualification_summary

def pending():
    s = Store(); s.prune()
    with s.db() as db:
        return [{"id": r["id"], "state": r["state"], "mission": json.loads(r["data"])}
                for r in db.execute("SELECT id,state,data FROM conversations WHERE state='pending_human' ORDER BY expires LIMIT 100")]

def decide(cid, decision):
    s = Store()
    with s.db() as db:
        row = db.execute("SELECT * FROM conversations WHERE id=? AND expires>?", (cid,time.time())).fetchone()
        if not row:
            raise HTTPException(404, "Mission introuvable.")
        target = "queued" if decision.approve else "rejected"
        if row["state"] == target:
            return {"state": target}
        if row["state"] != "pending_human":
            raise HTTPException(409, "Mission déjà traitée ou non confirmée.")
        data = json.loads(row["data"])
        assessment = QualificationAssessment.model_validate(data["assessment"])
        summary = qualification_summary(assessment)
        if decision.approve:
            if not summary["ready"] or summary["human_required"] or not summary["workflow"]:
                raise HTTPException(409, "Cette demande nécessite un traitement humain, sans routage automatique.")
            mission = {"schema_version": 1, "reference": data["reference"],
                       "request": data["history"][0]["content"], "qualification": summary,
                       "workflow": summary["workflow"], "agents": summary["agents"],
                       "permissions": {"external_actions": False}, "human_approval": True,
                       "steps": [{"agent": name, "status": "pending", "result": None} for name in summary["agents"]]}
            db.execute("INSERT INTO jobs VALUES (?,?,?,'queued',?,0,NULL,?)",
                       (str(uuid4()), cid, summary["workflow"], row["expires"], json.dumps(mission)))
        db.execute("UPDATE conversations SET state=?,version=version+1 WHERE id=?", (target,cid))
        db.execute("INSERT INTO audit(conversation_id,actor,action,reason,created) VALUES (?,'operator',?,?,?)",
                   (cid,target,decision.reason,time.time()))
    return {"state": target}

def claim(agent_name):
    if agent_name not in {"search", "compare", "quality", "writer"}:
        raise HTTPException(422, "Agent inconnu.")
    s = Store(); s.prune()
    with s.db() as db:
        rows = db.execute("SELECT * FROM jobs WHERE state='queued' OR (state='running' AND lease<?) ORDER BY expires LIMIT 100", (time.time(),)).fetchall()
        for row in rows:
            data = json.loads(row["data"])
            step = next((x for x in data["steps"] if x["status"] != "completed"), None)
            if step and step["agent"] == agent_name:
                lease_token = secrets.token_urlsafe(32)
                db.execute("UPDATE jobs SET state='running',lease=?,token_hash=? WHERE id=?",
                           (time.time()+120, digest(lease_token), row["id"]))
                return {"id": row["id"], "lease_token": lease_token, "lease_seconds": 120, "mission": data}
    return None

def complete(job_id, body):
    s = Store()
    with s.db() as db:
        row = db.execute("SELECT * FROM jobs WHERE id=? AND expires>?", (job_id,time.time())).fetchone()
        if not row or row["state"] != "running" or row["lease"] < time.time() or not secrets.compare_digest(row["token_hash"] or "", digest(body.lease_token)):
            raise HTTPException(409, "Prise en charge expirée ou invalide.")
        data = json.loads(row["data"])
        step = next(x for x in data["steps"] if x["status"] != "completed")
        step.update(status="completed", result=body.result)
        done = all(x["status"] == "completed" for x in data["steps"])
        db.execute("UPDATE jobs SET state=?,lease=0,token_hash=NULL,data=? WHERE id=?",
                   ("completed" if done else "queued", json.dumps(data),job_id))
        if done:
            db.execute("UPDATE conversations SET state='completed',version=version+1 WHERE id=?", (row["conversation_id"],))
        db.execute("INSERT INTO audit(conversation_id,actor,action,reason,created) VALUES (?,?, 'preparation_completed','Résultat préparatoire enregistré',?)",
                   (row["conversation_id"],step["agent"],time.time()))
    return {"state": "completed" if done else "queued", "external_actions_authorized": False}

def inspect_mission(cid):
    s = Store(); s.prune()
    with s.db() as db:
        row = db.execute("SELECT id,state,data FROM conversations WHERE id=? AND expires>?", (cid,time.time())).fetchone()
        if not row:
            raise HTTPException(404, "Mission introuvable.")
        jobs = [{"id":j["id"], "state":j["state"], "mission":json.loads(j["data"])}
                for j in db.execute("SELECT id,state,data FROM jobs WHERE conversation_id=?", (cid,))]
        audit = [dict(a) for a in db.execute("SELECT actor,action,reason,created FROM audit WHERE conversation_id=? ORDER BY id", (cid,))]
        return {"id":cid,"state":row["state"],"conversation":json.loads(row["data"]),"jobs":jobs,"audit":audit}
