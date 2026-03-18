from fastapi import APIRouter, Query
from typing import Optional
from datetime import datetime

from src.api.client import SquiggleClient

router = APIRouter()
CURRENT_YEAR = datetime.now().year


@router.get("/")
def get_standings(
    year: int = Query(CURRENT_YEAR),
    round: Optional[int] = Query(None),
):
    client = SquiggleClient()
    if round is None:
        round = client.get_current_round(year)
    standings = client.get_standings(year=year, round=round)
    return {"year": year, "round": round, "standings": standings}
