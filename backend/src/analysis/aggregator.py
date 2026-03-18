"""
Consensus aggregator: combines predictions from multiple models,
weighting each model by its historical accuracy.
"""

from __future__ import annotations
from collections import defaultdict
from typing import Sequence

import pandas as pd

from src.models.schemas import Game, Tip, Source, GamePrediction


def build_source_weights(sources: list[dict]) -> dict[int, float]:
    """
    Build a weight map {source_id: weight} based on historical accuracy.

    Models with no accuracy data get a small baseline weight.
    Weights are normalised so they sum to 1.0 across all sources.
    """
    weights: dict[int, float] = {}
    BASELINE = 0.50  # 50% accuracy assumed if no data

    for s in sources:
        src = Source(**s)
        acc = src.accuracy
        if acc is None:
            acc = BASELINE
        # Small floor so no model gets zero weight
        weights[src.id] = max(acc, 0.01)

    # Normalise
    total = sum(weights.values())
    if total > 0:
        weights = {k: v / total for k, v in weights.items()}

    return weights


def aggregate_tips_for_round(
    games: list[dict],
    tips: list[dict],
    sources: list[dict],
) -> list[GamePrediction]:
    """
    For each game in `games`, aggregate all model tips into a single
    GamePrediction using accuracy-weighted voting.

    Returns a list of GamePrediction objects (one per game).
    """
    weights = build_source_weights(sources)

    # Group tips by game id
    tips_by_game: dict[int, list[Tip]] = defaultdict(list)
    for t in tips:
        tip = Tip(**t)
        if tip.tip:  # Skip models that didn't submit a tip
            tips_by_game[tip.gameid].append(tip)

    predictions: list[GamePrediction] = []

    for g in games:
        game = Game(**g)

        # Skip games with missing team data
        if not game.hteam or not game.ateam:
            continue

        game_tips = tips_by_game.get(game.id, [])

        if not game_tips:
            continue

        prediction = _aggregate_game(game, game_tips, weights)
        if prediction:
            predictions.append(prediction)

    # Sort by confidence descending (best bets first)
    predictions.sort(key=lambda p: p.consensus_confidence, reverse=True)
    return predictions


def _aggregate_game(
    game: Game,
    tips: list[Tip],
    weights: dict[int, float],
) -> GamePrediction | None:
    """Aggregate all model tips for a single game."""
    if not tips:
        return None

    home_team = game.hteam
    away_team = game.ateam

    home_weight = 0.0
    away_weight = 0.0
    total_weight = 0.0
    margins: list[float] = []
    margin_weights: list[float] = []

    # Baseline weight for tips whose source ID couldn't be parsed
    baseline_weight = (sum(weights.values()) / len(weights)) if weights else 1.0

    for tip in tips:
        w = weights.get(tip.source, baseline_weight) if tip.source is not None else baseline_weight
        total_weight += w

        if tip.tip == home_team:
            home_weight += w
        else:
            away_weight += w

        # Margin: positive = tip favours home team
        if tip.margin is not None:
            # Squiggle margin is always positive; sign from which team was tipped
            signed_margin = tip.margin if tip.tip == home_team else -tip.margin
            margins.append(signed_margin)
            margin_weights.append(w)

    if total_weight == 0:
        return None

    home_vote_pct = (home_weight / total_weight) * 100.0
    away_vote_pct = 100.0 - home_vote_pct

    if home_weight >= away_weight:
        winner, loser = home_team, away_team
        confidence = home_vote_pct
    else:
        winner, loser = away_team, home_team
        confidence = away_vote_pct

    # Weighted average margin (positive = home team favoured)
    if margins and sum(margin_weights) > 0:
        avg_margin = sum(m * w for m, w in zip(margins, margin_weights)) / sum(margin_weights)
    else:
        avg_margin = 0.0

    return GamePrediction(
        game=game,
        predicted_winner=winner,
        predicted_loser=loser,
        consensus_confidence=round(confidence, 1),
        avg_predicted_margin=round(avg_margin, 1),
        model_count=len(tips),
        home_vote_pct=round(home_vote_pct, 1),
    )


def predictions_to_dataframe(predictions: list[GamePrediction]) -> pd.DataFrame:
    """Convert predictions list to a pandas DataFrame for analysis."""
    rows = []
    for p in predictions:
        rows.append({
            "game_id": p.game.id,
            "round": p.game.round,
            "year": p.game.year,
            "date": p.game.date,
            "venue": p.game.venue,
            "home_team": p.game.hteam,
            "away_team": p.game.ateam,
            "predicted_winner": p.predicted_winner,
            "confidence": p.consensus_confidence,
            "avg_margin": p.avg_predicted_margin,
            "model_count": p.model_count,
            "home_vote_pct": p.home_vote_pct,
            "is_close": p.is_close_game,
        })
    return pd.DataFrame(rows)
