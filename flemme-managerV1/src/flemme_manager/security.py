"""Separate proxy, operator and executor secrets, checked server-side."""
import secrets
from fastapi import Header, HTTPException
from flemme_manager.settings import settings

def check(given, expected):
    if not expected:
        raise HTTPException(503, "Service non configuré.")
    if not given or not secrets.compare_digest(given, expected):
        raise HTTPException(401, "Accès refusé.")

def service_auth(x_flemme_service_key: str | None = Header(default=None)):
    check(x_flemme_service_key, settings.service_key)

def operator_auth(x_flemme_operator_key: str | None = Header(default=None)):
    check(x_flemme_operator_key, settings.operator_key)

def executor_auth(x_flemme_executor_key: str | None = Header(default=None)):
    check(x_flemme_executor_key, settings.executor_key)
