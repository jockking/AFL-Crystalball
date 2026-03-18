"""
Betting value calculator.

Compares our model's win probability against bookmaker implied probability
to identify value bets using the Kelly Criterion for stake sizing.
"""

from __future__ import annotations
from dataclasses import dataclass

from src.models.schemas import Game, GamePrediction, ValueBet


def confidence_to_probability(confidence: float) -> float:
    """
    Convert model consensus confidence (0–100) to a win probability (0–1).

    We apply a mild regression toward 50% to avoid over-confidence
    from aggregated models — models tend to over-agree on clear favourites.
    """
    p = confidence / 100.0
    # Shrink by 10% toward 0.5 (conservative adjustment)
    return 0.5 + (p - 0.5) * 0.90


def implied_probability(decimal_odds: float) -> float:
    """Convert decimal odds to implied win probability (0–1)."""
    if decimal_odds <= 0:
        raise ValueError("Odds must be positive")
    return 1.0 / decimal_odds


def kelly_fraction(probability: float, decimal_odds: float, kelly_multiplier: float = 0.25) -> float:
    """
    Compute the Kelly Criterion stake fraction.

    Full Kelly: f = (bp - q) / b
      where b = decimal_odds - 1, p = win probability, q = 1 - p

    We use fractional Kelly (default 25%) to reduce variance.
    Returns a fraction of bankroll to bet (0 if no edge).
    """
    b = decimal_odds - 1.0
    p = probability
    q = 1.0 - p
    full_kelly = (b * p - q) / b
    fractional = full_kelly * kelly_multiplier
    return max(0.0, round(fractional, 4))


@dataclass
class OddsEntry:
    """Bookmaker odds for a single game."""
    game_id: int
    home_team: str
    away_team: str
    home_odds: float    # Decimal odds for home team
    away_odds: float    # Decimal odds for away team


def evaluate_value(
    prediction: GamePrediction,
    home_odds: float,
    away_odds: float,
    kelly_multiplier: float = 0.25,
) -> ValueBet:
    """
    Given a GamePrediction and bookmaker odds, compute the value bet.

    Args:
        prediction: Consensus model prediction for the game
        home_odds: Decimal odds for home team (e.g. 1.80)
        away_odds: Decimal odds for away team (e.g. 2.10)
        kelly_multiplier: Fraction of full Kelly to use (default 0.25)

    Returns:
        ValueBet with edge and Kelly stake recommendation
    """
    game = prediction.game
    home_team = game.hteam
    away_team = game.ateam

    # Our probability that the home team wins
    home_prob = confidence_to_probability(prediction.home_vote_pct)
    away_prob = 1.0 - home_prob

    # Implied probabilities from bookmaker odds
    home_implied = implied_probability(home_odds)
    away_implied = implied_probability(away_odds)

    # Determine which side has the edge
    home_edge = home_prob - home_implied
    away_edge = away_prob - away_implied

    if home_edge >= away_edge:
        bet_team = home_team
        our_prob = home_prob
        book_odds = home_odds
        book_implied = home_implied
        edge = home_edge
    else:
        bet_team = away_team
        our_prob = away_prob
        book_odds = away_odds
        book_implied = away_implied
        edge = away_edge

    kelly = kelly_fraction(our_prob, book_odds, kelly_multiplier) if edge > 0 else 0.0

    return ValueBet(
        game=game,
        prediction=prediction,
        bet_team=bet_team,
        our_probability=round(our_prob, 4),
        bookmaker_odds=book_odds,
        implied_probability=round(book_implied, 4),
        edge=round(edge, 4),
        kelly_fraction=kelly,
    )


def rank_value_bets(value_bets: list[ValueBet]) -> list[ValueBet]:
    """Sort value bets by edge descending, filtering to only positive-edge bets."""
    return sorted(
        [b for b in value_bets if b.is_value],
        key=lambda b: b.edge,
        reverse=True,
    )


def stake_recommendation(kelly: float, bankroll: float) -> float:
    """Convert Kelly fraction to a dollar stake amount."""
    return round(kelly * bankroll, 2)
