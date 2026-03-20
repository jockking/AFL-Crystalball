from fastapi import APIRouter, Query
from typing import Optional
from datetime import datetime

from src.api.client import SquiggleClient
from src.analysis.aggregator import aggregate_tips_for_round
from src.analysis.form import parse_games, get_team_form, get_h2h
from src.models.schemas import Game

router = APIRouter()
CURRENT_YEAR = datetime.now().year


def _client():
    return SquiggleClient()


def _r(value: float, places: int = 1) -> float:
    """Round helper that doesn't shadow the `round` query param."""
    return builtins_round(value, places)


import builtins
builtins_round = builtins.round


@router.get("/")
def get_tips(
    year: int = Query(CURRENT_YEAR),
    round_num: Optional[int] = Query(None, alias="round"),
):
    """Raw tips from all models for a round."""
    client = _client()
    if round_num is None:
        round_num = client.get_current_round(year)
    tips = client.get_tips(year=year, round=round_num)
    return {"year": year, "round": round_num, "tips": tips}


@router.get("/predictions")
def get_predictions(
    year: int = Query(CURRENT_YEAR),
    round_num: Optional[int] = Query(None, alias="round"),
):
    """
    Aggregated consensus predictions for a round, with actual results
    included for completed games so the frontend can show past accuracy.
    """
    client = _client()
    if round_num is None:
        round_num = client.get_current_round(year)

    raw_games   = client.get_games(year=year, round=round_num)
    raw_tips    = client.get_tips(year=year, round=round_num)
    raw_sources = client.get_sources()

    predictions = aggregate_tips_for_round(raw_games, raw_tips, raw_sources)

    # Build a lookup of actual results from raw_games
    results_by_id: dict[int, dict] = {
        g["id"]: g for g in raw_games if g.get("complete") == 100
    }

    rows = []
    for p in predictions:
        gid = p.game.id
        actual = results_by_id.get(gid)
        actual_winner = None
        if actual:
            hs = actual.get("hscore") or 0
            as_ = actual.get("ascore") or 0
            if hs > as_:
                actual_winner = actual.get("hteam")
            elif as_ > hs:
                actual_winner = actual.get("ateam")
            else:
                actual_winner = "Draw"

        rows.append({
            "game_id":          gid,
            "date":             p.game.date,
            "venue":            p.game.venue,
            "home_team":        p.game.hteam,
            "away_team":        p.game.ateam,
            "predicted_winner": p.predicted_winner,
            "predicted_loser":  p.predicted_loser,
            "confidence":       p.consensus_confidence,
            "avg_margin":       p.avg_predicted_margin,
            "model_count":      p.model_count,
            "home_vote_pct":    p.home_vote_pct,
            "away_vote_pct":    _r(100 - p.home_vote_pct, 1),
            "is_close":         p.is_close_game,
            "is_complete":      p.game.is_complete,
            # Elite consensus
            "elite_confidence": p.elite_confidence,
            "elite_winner":     p.elite_winner,
            "elite_agrees":     p.elite_agrees,
            # Per-model votes (sorted by weight desc, all models)
            "model_votes": [
                {
                    "source_id":   v.source_id,
                    "source_name": v.source_name,
                    "tip":         v.tip,
                    "margin":      v.margin,
                    "confidence":  v.confidence,
                    "weight":      v.weight,
                    "is_elite":    v.is_elite,
                }
                for v in p.model_votes
            ],
            # Actual result fields (None if game not played yet)
            "actual_winner":    actual_winner,
            "home_score":       actual.get("hscore") if actual else None,
            "away_score":       actual.get("ascore") if actual else None,
            "tip_correct":      (actual_winner == p.predicted_winner) if actual_winner else None,
        })

    return {"year": year, "round": round_num, "predictions": rows}


@router.get("/value")
def get_value_bets(
    year: int = Query(CURRENT_YEAR),
    round_num: Optional[int] = Query(None, alias="round"),
):
    """
    Predictions enriched with recent form and H2H context for value bet analysis.
    """
    client = _client()
    if round_num is None:
        round_num = client.get_current_round(year)

    raw_games   = client.get_games(year=year, round=round_num)
    raw_tips    = client.get_tips(year=year, round=round_num)
    raw_sources = client.get_sources()
    all_games   = client.get_games(year=year)

    completed = parse_games(all_games)
    predictions = aggregate_tips_for_round(raw_games, raw_tips, raw_sources)

    result = []
    for p in predictions:
        home = p.game.hteam
        away = p.game.ateam
        if not home or not away:
            continue

        home_form = get_team_form(home, completed, last_n=5)
        away_form = get_team_form(away, completed, last_n=5)
        h2h_rec   = get_h2h(home, away, completed, last_n=10)

        result.append({
            "game_id":          p.game.id,
            "date":             p.game.date,
            "venue":            p.game.venue,
            "home_team":        home,
            "away_team":        away,
            "predicted_winner": p.predicted_winner,
            "confidence":       p.consensus_confidence,
            "avg_margin":       p.avg_predicted_margin,
            "home_vote_pct":    p.home_vote_pct,
            "away_vote_pct":    _r(100 - p.home_vote_pct, 1),
            "home_form": {
                "win_rate":    _r(home_form.win_rate * 100),
                "avg_margin":  home_form.avg_margin,
                "wins":        home_form.wins,
                "losses":      home_form.losses,
                "streak":      home_form.win_streak,
            },
            "away_form": {
                "win_rate":    _r(away_form.win_rate * 100),
                "avg_margin":  away_form.avg_margin,
                "wins":        away_form.wins,
                "losses":      away_form.losses,
                "streak":      away_form.win_streak,
            },
            "h2h": {
                "games_played":  h2h_rec.games_played,
                "home_wins":     h2h_rec.team_a_wins,
                "away_wins":     h2h_rec.team_b_wins,
                "avg_margin":    _r(h2h_rec.avg_margin),
                "home_win_rate": _r(h2h_rec.team_a_win_rate * 100),
            },
        })

    return {"year": year, "round": round_num, "value_data": result}
