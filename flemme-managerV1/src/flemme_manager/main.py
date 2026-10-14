"""FastAPI application entry point."""

from fastapi import FastAPI

from flemme_manager.routes.health import router as health_router
from flemme_manager.routes.manager import router as manager_router

app = FastAPI(title="Flemme Manager API", version="0.1.0")
app.include_router(health_router)
app.include_router(manager_router)

# Supabase memory is opt-in and has its own authentication boundary.
from flemme_manager.routes.memory_v2 import router as memory_v2_router
app.include_router(memory_v2_router)

# Direct browser calls avoid the Netlify proxy timeout; exact origins only.
import os
from flemme_manager.memory.browser_access import configure_browser_access
configure_browser_access(app, os.getenv("FLEMME_V2_ALLOWED_ORIGINS", ""))

from flemme_manager.routes.deliveries_v3 import router as deliveries_v3_router
app.include_router(deliveries_v3_router)
