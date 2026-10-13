"""Use the caller's verified Supabase session; never use a service-role key."""
import os
from urllib.parse import urlparse

import httpx2 as httpx
from fastapi import Header, HTTPException


class StorageError(Exception):
    def __init__(self, status=503):
        self.status = status


class SupabaseMemory:
    def __init__(self, url, key, token):
        self.url = url.rstrip("/")
        self.headers = {"apikey": key, "Authorization": f"Bearer {token}"}

    async def request(self, method, path, payload=None):
        try:
            async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
                response = await client.request(method, self.url + path, headers=self.headers,
                                                json=payload)
            if response.status_code >= 400:
                # Map only known database codes. Never expose provider bodies or credentials.
                try:
                    code = response.json().get("code")
                except (ValueError, AttributeError):
                    code = None
                status = {"PT404": 404, "PT409": 409, "PT422": 422}.get(code)
                if status is None:
                    status = 401 if response.status_code == 401 else 503
                raise StorageError(status)
            return response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise StorageError() from error

    async def command(self, operation, conversation_id=None, request_id=None,
                      expected_revision=None, payload=None):
        return await self.request("POST", "/rest/v1/rpc/fm_v2_command", {
            "p_operation": operation, "p_conversation_id": conversation_id,
            "p_request_id": request_id, "p_expected_revision": expected_revision,
            "p_payload": payload or {},
        })


async def get_memory(authorization: str | None = Header(default=None)):
    if os.getenv("FLEMME_V2_ENABLED", "").lower() != "true":
        raise HTTPException(503, "La mémoire V2 est désactivée.")
    url = os.getenv("FLEMME_V2_SUPABASE_URL", "")
    key = os.getenv("FLEMME_V2_SUPABASE_PUBLISHABLE_KEY", "")
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.query or parsed.fragment:
        raise HTTPException(503, "La mémoire V2 n'est pas configurée.")
    if not key:
        raise HTTPException(503, "La mémoire V2 n'est pas configurée.")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Authentification requise.", headers={"WWW-Authenticate": "Bearer"})
    token = authorization[7:]
    if not token or len(token) > 8192 or any(c.isspace() for c in token):
        raise HTTPException(401, "Session invalide.")
    memory = SupabaseMemory(url, key, token)
    try:
        user = await memory.request("GET", "/auth/v1/user")
        if not isinstance(user, dict) or not user.get("id") or not user.get("email_confirmed_at"):
            raise HTTPException(401, "Une session confirmée est requise.")
    except StorageError as error:
        raise HTTPException(error.status, "La session n'a pas pu être vérifiée.") from None
    return memory


async def protect_legacy_analysis(authorization: str | None = Header(default=None)):
    """When V2 is enabled, the legacy analysis route shares its authentication."""
    if os.getenv("FLEMME_V2_ENABLED", "").lower() == "true":
        await get_memory(authorization)
