"""Run one authorized preparation step; never poll or start automatically on deploy."""
import argparse
import asyncio
from urllib.parse import urlparse
import httpx
from flemme_manager.agents.executors import prepare
from flemme_manager.settings import settings

async def run_once(base, name):
    key = settings.executor_key
    if not key or not settings.openai_api_key:
        raise RuntimeError("Worker configuration missing")
    url = urlparse(base)
    if (url.username or url.password or url.query or url.fragment or url.path not in ("", "/")
            or not url.hostname or (url.scheme != "https" and not (url.scheme == "http" and url.hostname == "127.0.0.1"))):
        raise ValueError("HTTPS API origin required")
    if url.port is not None and not 1 <= url.port <= 65535:
        raise ValueError("Invalid API port")
    async with httpx.AsyncClient(base_url=base, headers={"X-Flemme-Executor-Key": key}, timeout=80) as client:
        response = await client.post("/api/executor/claim/" + name)
        response.raise_for_status()
        job = response.json()
        if job is None:
            print("Aucune étape disponible.")
            return
        # Failure leaves the lease to expire; only preparation may be retried.
        result = await prepare(name, job["mission"])
        response = await client.post("/api/executor/jobs/" + job["id"] + "/complete",
                                     json={"lease_token": job["lease_token"], "result": result})
        response.raise_for_status()
        print("Étape préparatoire enregistrée; aucune action externe autorisée.")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("agent", choices=["search","compare","quality","writer"])
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    args = parser.parse_args()
    asyncio.run(run_once(args.api, args.agent))

if __name__ == "__main__":
    main()
