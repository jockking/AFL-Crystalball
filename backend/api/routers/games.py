from fastapi import APIRouter, Query
from typing import Optional
from datetime import datetime

from src.api.client import SquiggleClient

router = APIRouter()
CURRENT_YEAR = datetime.now().year


def _client():
    return SquiggleClient()


@router.get("/")
def get_games(
    year: int = Query(CURRENT_YEAR),
    round: Optional[int] = Query(None),
):
    client = _client()
    if round is None:
        round = client.get_current_round(year)
    games = client.get_games(year=year, round=round)
    return {"year": year, "round": round, "games": games}


@router.get("/current-round")
def get_current_round(year: int = Query(CURRENT_YEAR)):
    client = _client()
    round = client.get_current_round(year)
    return {"year": year, "round": round}


@router.get("/history")
def get_history(
    year: int = Query(CURRENT_YEAR),
    complete: int = Query(100, description="Only return games at this completion %"),
):
    """Return all completed games for a season."""
    client = _client()
    games = client.get_games(year=year, complete=complete)
    return {"year": year, "games": games}
