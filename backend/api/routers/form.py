from fastapi import APIRouter, Query
from typing import Optional
from datetime import datetime

from src.api.client import SquiggleClient
from src.analysis.form import parse_games, get_team_form, get_h2h

router = APIRouter()
CURRENT_YEAR = datetime.now().year


@router.get("/")
def get_all_form(
    year: int = Query(CURRENT_YEAR),
    last_n: int = Query(5, description="Number of recent games to analyse"),
):
    """Return recent form for every team."""
    client = SquiggleClient()
    raw_games = client.get_games(year=year)
    completed = parse_games(raw_games)

    teams = sorted({g.hteam for g in completed if g.hteam} | {g.ateam for g in completed if g.ateam})

    result = []
    for team in teams:
        tf = get_team_form(team, completed, last_n=last_n)
        result.append({
            "team":            team,
            "games_analysed":  tf.games_analysed,
            "wins":            tf.wins,
            "losses":          tf.losses,
            "draws":           tf.draws,
            "win_rate":        round(tf.win_rate * 100, 1),
            "avg_margin":      round(tf.avg_margin, 1),
            "avg_score_for":   round(tf.avg_score_for, 1),
            "avg_score_against": round(tf.avg_score_against, 1),
            "streak":          tf.win_streak,
        })

    result.sort(key=lambda x: x["win_rate"], reverse=True)
    return {"year": year, "last_n": last_n, "form": result}


@router.get("/h2h")
def get_h2h_record(
    team_a: str = Query(...),
    team_b: str = Query(...),
    year: int = Query(CURRENT_YEAR),
    last_n: int = Query(10),
):
    """Head-to-head record between two teams."""
    client = SquiggleClient()
    # Pull two seasons of data for a meaningful H2H record
    games_this = client.get_games(year=year)
    games_prev = client.get_games(year=year - 1)
    completed  = parse_games(games_this + games_prev)

    record = get_h2h(team_a, team_b, completed, last_n=last_n)
    return {
        "team_a":       record.team_a,
        "team_b":       record.team_b,
        "games_played": record.games_played,
        "team_a_wins":  record.team_a_wins,
        "team_b_wins":  record.team_b_wins,
        "draws":        record.draws,
        "avg_margin":   round(record.avg_margin, 1),
        "team_a_win_rate": round(record.team_a_win_rate * 100, 1),
    }
