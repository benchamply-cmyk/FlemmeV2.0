"""Transactional SQLite store for a single API instance (multiple workers supported)."""
import hashlib
import json
import os
import secrets
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4
from fastapi import HTTPException
from flemme_manager.settings import settings

class Store:
    def __init__(self):
        path = Path(settings.database_path)
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        if path.is_symlink():
            raise RuntimeError("Database symlink refused")
        self.path = path
        with self.db() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS conversations (
              id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, expires REAL NOT NULL,
              version INTEGER NOT NULL, state TEXT NOT NULL, lease REAL NOT NULL DEFAULT 0,
              data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS quotas (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS jobs (
              id TEXT PRIMARY KEY, conversation_id TEXT UNIQUE NOT NULL,
              workflow TEXT NOT NULL, state TEXT NOT NULL, expires REAL NOT NULL,
              lease REAL NOT NULL DEFAULT 0, token_hash TEXT, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS audit (
              id INTEGER PRIMARY KEY, conversation_id TEXT NOT NULL, actor TEXT NOT NULL,
              action TEXT NOT NULL, reason TEXT NOT NULL, created REAL NOT NULL);
            """)
        os.chmod(path, 0o600)

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            db.execute("PRAGMA foreign_keys=ON")
            db.execute("PRAGMA secure_delete=ON")
            db.execute("BEGIN IMMEDIATE")
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def prune(self):
        now = time.time()
        with self.db() as db:
            db.execute("DELETE FROM jobs WHERE expires < ?", (now,))
            db.execute("DELETE FROM audit WHERE conversation_id IN (SELECT id FROM conversations WHERE expires < ?)", (now,))
            db.execute("DELETE FROM conversations WHERE expires < ?", (now,))
            db.execute("DELETE FROM quotas WHERE expires < ?", (now,))

    def quota(self, identity):
        day = int(time.time() // 86400)
        # Global cap and per trusted proxy-IP cap; hashed identities, no plaintext IP storage.
        keys = [(f"global:{day}", settings.daily_model_limit),
                (f"ip:{day}:" + hashlib.sha256(identity.encode()).hexdigest(), 40)]
        with self.db() as db:
            for key, limit in keys:
                row = db.execute("SELECT count FROM quotas WHERE key=?", (key,)).fetchone()
                if row and row[0] >= limit:
                    raise HTTPException(429, "Limite atteinte. Réessaie demain ou utilise le formulaire.")
            for key, _ in keys:
                db.execute("INSERT INTO quotas VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1", (key, (day+1)*86400))

    def create(self, task):
        cid, token = str(uuid4()), secrets.token_urlsafe(32)
        data = {"history": [{"role": "user", "content": task}], "assessment": None,
                "last_request": None, "last_message": None, "contact": None, "reference": None}
        with self.db() as db:
            db.execute("INSERT INTO conversations VALUES (?,?,?,0,'qualifying',0,?)",
                       (cid, digest(token), time.time()+settings.retention_days*86400, json.dumps(data)))
        return cid, token

    def get(self, cid, token):
        with self.db() as db:
            return self.authorize(db, cid, token)

    def authorize(self, db, cid, token):
        row = db.execute("SELECT * FROM conversations WHERE id=? AND expires>?", (cid, time.time())).fetchone()
        if not row or not secrets.compare_digest(row["token_hash"], digest(token or "")):
            raise HTTPException(404, "Conversation introuvable ou expirée.")
        return {**dict(row), "data": json.loads(row["data"])}

    def reserve(self, cid, token, version, request_id, message):
        with self.db() as db:
            row = self.authorize(db, cid, token)
            data = row["data"]
            if request_id == data["last_request"]:
                if message != data["last_message"]:
                    raise HTTPException(409, "Cette référence correspond à un autre message.")
                return row, False
            if row["version"] != version or row["state"] != "qualifying" or row["lease"] > time.time():
                raise HTTPException(409, "Conversation modifiée ou en cours. Actualise-la.")
            if len(data["history"]) >= 40:
                raise HTTPException(409, "Échange trop long : confie la demande à l’équipe.")
            db.execute("UPDATE conversations SET lease=?,version=version+1 WHERE id=?", (time.time()+60, cid))
            row["version"] += 1
            return row, True

    def save_turn(self, cid, token, version, data):
        with self.db() as db:
            self.authorize(db, cid, token)
            cursor = db.execute("UPDATE conversations SET version=version+1,lease=0,data=? WHERE id=? AND version=? AND state='qualifying'", (json.dumps(data), cid, version))
            if cursor.rowcount != 1:
                raise HTTPException(409, "Conversation modifiée.")
        return self.get(cid, token)

    def release(self, cid, version):
        with self.db() as db:
            db.execute("UPDATE conversations SET lease=0 WHERE id=? AND version=?", (cid, version))

    def confirm(self, cid, token, body, summary):
        with self.db() as db:
            row = self.authorize(db, cid, token)
            data = row["data"]
            if row["state"] in ("pending_human", "queued", "completed"):
                if data["contact"] == body.contact and data["reference"] == body.reference:
                    return row
                raise HTTPException(409, "Mission déjà confirmée.")
            if row["state"] != "qualifying":
                raise HTTPException(409, "Mission déjà traitée.")
            if row["version"] != body.version or row["lease"] > time.time():
                raise HTTPException(409, "Relis le récapitulatif actualisé.")
            if not (summary["ready"] or summary["human_required"]):
                raise HTTPException(409, "Des précisions sont encore nécessaires.")
            data.update(contact=body.contact, reference=body.reference)
            db.execute("UPDATE conversations SET state='pending_human',version=version+1,data=? WHERE id=?", (json.dumps(data), cid))
            db.execute("INSERT INTO audit(conversation_id,actor,action,reason,created) VALUES (?,'customer','confirm','Résumé confirmé',?)", (cid,time.time()))
        return self.get(cid, token)

    def delete(self, cid, token):
        with self.db() as db:
            row = self.authorize(db, cid, token)
            if row["state"] in ("queued", "completed"):
                raise HTTPException(409, "Mission prise en charge : contacte l’équipe pour son retrait.")
            db.execute("DELETE FROM jobs WHERE conversation_id=?", (cid,))
            db.execute("DELETE FROM audit WHERE conversation_id=?", (cid,))
            db.execute("DELETE FROM conversations WHERE id=?", (cid,))

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()
