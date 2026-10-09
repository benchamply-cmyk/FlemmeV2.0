"""Host scheduler entry point: remove expired data even when the API is idle."""
from flemme_manager.services.conversation_store import Store

def main():
    Store().prune()
    print("Purge de rétention effectuée.")

if __name__ == "__main__":
    main()
