"""
Consensus aggregator: combines predictions from multiple models,
weighting each model by its historical accuracy.

Weighting strategy: squared excess over 50%.
  weight = max(0, accuracy - 0.50) ** 2

This aggressively rewards top models:
  70% model → (0.20)² = 0.0400
  65% model → (0.15)² = 0.0225  (1.8× less than 70%)
  60% model → (0.10)² = 0.0100  (4× less than 70%)
  50% model → (0.00)² = 0.0000  (gets tiny floor only)

Compared to linear weighting where 70%/65% ≈ 1.08× difference,
squared weighting gives 1.78× — much better signal separation.

Elite consensus uses only the top ELITE_TOP_N models (≥ ELITE_MIN_ACCURACY).
"""

from __future__ import annotations
from collections import defaultdict

import pandas as pd

from src.models.schemas import Game, Tip, Source, GamePrediction, ModelVote

# ── Elite tier thresholds ────────────────────────────────────────────────────
ELITE_MIN_ACCURACY = 0.65   # Must beat 65% historically to be "elite"
ELITE_TOP_N = 8             # Cap at top 8 even if more qualify
WEIGHT_FLOOR = 0.0001       # Tiny floor so no model is completely silenced


def build_source_weights(sources: list[dict]) -> dict[int, float]:
    """
    Build a weight map {source_id: weight} using squared excess accuracy.

    Models without accuracy data get a 50% baseline (zero excess → floor weight).
    Weights are normalised to sum to 1.0.
    """
    weights: dict[int, float] = {}
    BASELINE = 0.50

    for s in sources:
        src = Source(**s)
        if src.id is None:
            continue
        acc = src.accuracy if src.accuracy is not None else BASELINE
        excess = max(0.0, acc - 0.50)
        weights[src.id] = max(excess ** 2, WEIGHT_FLOOR)

    total = sum(weights.values())
    if total > 0:
        weights = {k: v / total for k, v in weights.items()}
    return weights


def build_elite_weights(sources: list[dict]) -> dict[int, float]:
    """
    Build weights using only the top ELITE_TOP_N most accurate models.
    Models below ELITE_MIN_ACCURACY are excluded entirely.
    Returns an empty dict if no models qualify.
    """
    eligible: list[tuple[int, float]] = []
    for s in sources:
        src = Source(**s)
        if src.id is not None and src.accuracy is not None and src.accuracy >= ELITE_MIN_ACCURACY:
            eligible.append((src.id, src.accuracy))

    eligible.sort(key=lambda x: x[1], reverse=True)
    top = eligible[:ELITE_TOP_N]

    if not top:
        return {}

    weights: dict[int, float] = {}
    for source_id, acc in top:
        excess = max(0.0, acc - 0.50)
        weights[source_id] = max(excess ** 2, WEIGHT_FLOOR)

    total = sum(weights.values())
    if total > 0:
        weights = {k: v / total for k, v in weights.items()}
    return weights


def build_source_name_map(sources: list[dict]) -> dict[int, str]:
    """Build a {source_id: source_name} lookup."""
    result: dict[int, str] = {}
    for s in sources:
        src = Source(**s)
        if src.id is not None:
            result[src.id] = src.name
    return result


def aggregate_tips_for_round(
    games: list[dict],
    tips: list[dict],
    sources: list[dict],
) -> list[GamePrediction]:
    """
    For each game in `games`, aggregate all model tips into a single
    GamePrediction using squared-excess accuracy-weighted voting.

    Also computes an elite consensus from the top ELITE_TOP_N models and
    attaches a per-model vote breakdown sorted by weight descending.

    Returns a list of GamePrediction objects (one per game).
    """
    weights = build_source_weights(sources)
    elite_weights = build_elite_weights(sources)
    name_map = build_source_name_map(sources)
    elite_ids = set(elite_weights.keys())

    # Group tips by game id
    tips_by_game: dict[int, list[Tip]] = defaultdict(list)
    for t in tips:
        tip = Tip(**t)
        if tip.tip:
            tips_by_game[tip.gameid].append(tip)

    predictions: list[GamePrediction] = []

    for g in games:
        game = Game(**g)
        if not game.hteam or not game.ateam:
            continue

        game_tips = tips_by_game.get(game.id, [])
        if not game_tips:
            continue

        prediction = _aggregate_game(game, game_tips, weights, elite_weights, name_map, elite_ids)
        if prediction:
            predictions.append(prediction)

    predictions.sort(key=lambda p: p.consensus_confidence, reverse=True)
    return predictions


def _aggregate_game(
    game: Game,
    tips: list[Tip],
    weights: dict[int, float],
    elite_weights: dict[int, float],
    name_map: dict[int, str],
    elite_ids: set[int],
) -> GamePrediction | None:
    """Aggregate all model tips for a single game."""
    if not tips:
        return None

    home_team = game.hteam
    away_team = game.ateam

    # ── Full consensus ───────────────────────────────────────────────────────
    home_weight = 0.0
    away_weight = 0.0
    total_weight = 0.0
    margins: list[float] = []
    margin_weights: list[float] = []

    baseline_weight = (sum(weights.values()) / len(weights)) if weights else 1.0

    for tip in tips:
        w = weights.get(tip.source, baseline_weight) if tip.source is not None else baseline_weight
        total_weight += w

        if tip.tip == home_team:
            home_weight += w
        else:
            away_weight += w

        if tip.margin is not None:
            signed = tip.margin if tip.tip == home_team else -tip.margin
            margins.append(signed)
            margin_weights.append(w)

    if total_weight == 0:
        return None

    home_vote_pct = (home_weight / total_weight) * 100.0

    if home_weight >= away_weight:
        winner, loser = home_team, away_team
        confidence = home_vote_pct
    else:
        winner, loser = away_team, home_team
        confidence = 100.0 - home_vote_pct

    avg_margin = (
        sum(m * w for m, w in zip(margins, margin_weights)) / sum(margin_weights)
        if margins and sum(margin_weights) > 0
        else 0.0
    )

    # ── Elite consensus ──────────────────────────────────────────────────────
    elite_confidence: float | None = None
    elite_winner: str | None = None

    if elite_weights:
        e_home = 0.0
        e_away = 0.0
        e_total = 0.0
        for tip in tips:
            if tip.source not in elite_weights:
                continue
            ew = elite_weights[tip.source]
            e_total += ew
            if tip.tip == home_team:
                e_home += ew
            else:
                e_away += ew

        if e_total > 0:
            e_home_pct = (e_home / e_total) * 100.0
            if e_home >= e_away:
                elite_winner = home_team
                elite_confidence = round(e_home_pct, 1)
            else:
                elite_winner = away_team
                elite_confidence = round(100.0 - e_home_pct, 1)

    # ── Per-model vote breakdown ─────────────────────────────────────────────
    model_votes: list[ModelVote] = []
    for tip in tips:
        w = weights.get(tip.source, baseline_weight) if tip.source is not None else baseline_weight
        name = (
            name_map.get(tip.source) if tip.source is not None else None
        ) or tip.sourcename or f"Model {tip.source}"
        model_votes.append(ModelVote(
            source_id=tip.source,
            source_name=name,
            tip=tip.tip,
            margin=tip.margin,
            confidence=tip.confidence,
            weight=round(w * 100, 2),   # store as percentage for readability
            is_elite=tip.source in elite_ids if tip.source is not None else False,
        ))

    # Sort by weight descending so frontend gets top contributors first
    model_votes.sort(key=lambda v: v.weight, reverse=True)

    return GamePrediction(
        game=game,
        predicted_winner=winner,
        predicted_loser=loser,
        consensus_confidence=round(confidence, 1),
        avg_predicted_margin=round(avg_margin, 1),
        model_count=len(tips),
        home_vote_pct=round(home_vote_pct, 1),
        elite_confidence=elite_confidence,
        elite_winner=elite_winner,
        model_votes=model_votes,
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
            "elite_confidence": p.elite_confidence,
            "elite_winner": p.elite_winner,
            "avg_margin": p.avg_predicted_margin,
            "model_count": p.model_count,
            "home_vote_pct": p.home_vote_pct,
            "is_close": p.is_close_game,
            "elite_agrees": p.elite_agrees,
        })
    return pd.DataFrame(rows)
