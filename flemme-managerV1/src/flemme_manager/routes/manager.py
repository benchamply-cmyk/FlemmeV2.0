"""Manager analysis API route."""

from fastapi import APIRouter, Depends, HTTPException, status

from flemme_manager.agents.manager import (
    ManagerConfigurationError,
    ManagerExecutionError,
    analyze_request,
)
from flemme_manager.schemas import MissionResponse, UserRequest

from flemme_manager.security import service_auth

router = APIRouter(prefix="/api/manager", tags=["manager"], dependencies=[Depends(service_auth)])


@router.post("/analyze", response_model=MissionResponse)
async def process_mission(request: UserRequest) -> MissionResponse:
    try:
        assessment = await analyze_request(request)
    except ManagerConfigurationError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Le service d'analyse est momentanément indisponible.",
        ) from None
    except ManagerExecutionError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="La demande n'a pas pu être analysée. Réessaie plus tard.",
        ) from None

    return MissionResponse(request=request, **assessment.model_dump())