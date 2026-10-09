"""Opt-in smoke check using synthetic data only (two bounded provider calls)."""
import asyncio
from flemme_manager.agents.qualification import analyze_conversation
from flemme_manager.workflows.qualification import qualification_summary

async def main():
    history = [{"role":"user","content":"Je veux préparer une demande pour faire nettoyer ma terrasse."}]
    first = await analyze_conversation(history,{})
    summary = qualification_summary(first)
    assert not summary["ready"] and len(summary["questions"]) <= 2
    history += [{"role":"assistant","content":first.user_response.message},
                {"role":"user","content":"La terrasse fait 20 m², à Lyon, budget maximum 200 euros, pour samedi prochain. Je demande seulement de préparer la mission."}]
    final = await analyze_conversation(history,first.facts.model_dump())
    summary = qualification_summary(final)
    assert summary["workflow"] == "trouver_prestataire"
    assert summary["ready"], "Synthetic mission did not qualify"
    assert summary["external_actions_authorized"] is False
    print("Live qualification smoke: two turns passed; no external action performed.")

if __name__ == "__main__":
    asyncio.run(main())
