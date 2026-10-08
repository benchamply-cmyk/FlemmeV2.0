"""FastAPI application entry point."""

from fastapi import FastAPI

from flemme_manager.routes.health import router as health_router
from flemme_manager.routes.manager import router as manager_router

app = FastAPI(title="Flemme Manager API", version="0.1.0")
app.include_router(health_router)
app.include_router(manager_router)