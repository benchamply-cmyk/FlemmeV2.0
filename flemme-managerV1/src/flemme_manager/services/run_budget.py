"""Fail-closed admission for paid web work on the unified API.

Operator-supplied upper estimates are not supplier billing guarantees. Existing
database quotas remain the authority for concurrent and cross-process runs.
"""
import os
from contextvars import ContextVar
from decimal import Decimal, InvalidOperation
from fastapi import HTTPException

paid_budget_required = ContextVar("paid_budget_required", default=False)


def check_web_budget():
    try:
        ceiling = Decimal(os.environ['FLEMME_RUN_BUDGET_USD'])
        estimate = Decimal(os.environ['FLEMME_WEB_RUN_UPPER_USD'])
        if not ceiling.is_finite() or not estimate.is_finite() or not 0 < estimate <= ceiling <= 10:
            raise ValueError
    except (KeyError, InvalidOperation, ValueError):
        raise HTTPException(503, 'Budget de recherche non configuré ou insuffisant.') from None
