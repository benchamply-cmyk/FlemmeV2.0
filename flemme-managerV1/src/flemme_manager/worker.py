"""Run one authorized preparation step; never poll or start automatically on deploy."""
import argparse
import asyncio
import os
import httpx
from flemme_manager.agents.executors import prepare

async def run_once(base, name):
    key = os.environ.get("FLEMME_EXECUTOR_KEY")
    if not key or not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("Worker configuration missing")
    if not (base.startswith("https://") or base.startswith("http://127.0.0.1:")):
        raise ValueError("HTTPS API required")
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
