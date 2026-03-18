"""
Pydantic models for Squiggle API responses.
Fields marked Optional may be absent for unplayed or incomplete games.
"""

from __future__ import annotations
from typing import Optional, Union
from pydantic import BaseModel, field_validator, model_validator


class Team(BaseModel):
    id: int
    name: str
    abbrev: Optional[str] = None
    logo: Optional[str] = None


class Game(BaseModel):
    id: int
    round: int
    year: int
    roundname: Optional[str] = None
    date: Optional[str] = None
    venue: Optional[str] = None

    # Teams
    hteam: Optional[str] = None      # Home team name
    ateam: Optional[str] = None      # Away team name
    hteamid: Optional[int] = None
    ateamid: Optional[int] = None

    # Scores (None if not yet played)
    hscore: Optional[int] = None
    ascore: Optional[int] = None
    hgoals: Optional[int] = None
    agoals: Optional[int] = None
    hbehinds: Optional[int] = None
    abehinds: Optional[int] = None

    # Game state (0–100)
    complete: int = 0

    # Timezone
    tz: Optional[str] = None

    @property
    def is_complete(self) -> bool:
        return self.complete == 100

    @property
    def winner(self) -> Optional[str]:
        if not self.is_complete or self.hscore is None or self.ascore is None:
            return None
        if self.hscore > self.ascore:
            return self.hteam
        if self.ascore > self.hscore:
            return self.ateam
        return "Draw"

    @property
    def margin(self) -> Optional[int]:
        """Positive = home team won by this margin."""
        if self.hscore is None or self.ascore is None:
            return None
        return self.hscore - self.ascore


class Source(BaseModel):
    """A prediction model registered with Squiggle."""
    id: Optional[int] = None
    name: str

    @field_validator("id", mode="before")
    @classmethod
    def coerce_id(cls, v):
        if v is None:
            return None
        try:
            return int(v)
        except (ValueError, TypeError):
            return None
    url: Optional[str] = None
    description: Optional[str] = None

    # Accuracy stats (may not always be present)
    correct: Optional[int] = None      # Total correct tips
    incorrect: Optional[int] = None    # Total incorrect tips
    bits: Optional[float] = None       # Information score (higher = better)

    @property
    def accuracy(self) -> Optional[float]:
        """Win/loss accuracy as a fraction 0–1."""
        if self.correct is None or self.incorrect is None:
            return None
        total = self.correct + self.incorrect
        return self.correct / total if total > 0 else None


class Tip(BaseModel):
    """A single model's prediction for a single game."""
    gameid: int
    round: int
    year: int
    source: Optional[int] = None     # Source (model) ID — may be None if API returns name string
    sourcename: Optional[str] = None

    @field_validator("source", mode="before")
    @classmethod
    def coerce_source(cls, v):
        """API sometimes returns source as a name string instead of an integer ID."""
        if v is None:
            return None
        try:
            return int(v)
        except (ValueError, TypeError):
            return None  # sourcename will still be populated for display

    # The predicted winner
    tip: Optional[str] = None          # Team name predicted to win
    tipteamid: Optional[int] = None

    # Game teams (for context)
    hteam: Optional[str] = None
    ateam: Optional[str] = None
    hteamid: Optional[int] = None
    ateamid: Optional[int] = None

    # Prediction details
    margin: Optional[float] = None     # Predicted winning margin (positive = home team)
    confidence: Optional[float] = None # 0–100 confidence in the tip
    correct: Optional[int] = None      # 1 if correct, 0 if not (after game)

    @field_validator("confidence", mode="before")
    @classmethod
    def clamp_confidence(cls, v):
        if v is None:
            return v
        return max(0.0, min(100.0, float(v)))

    @property
    def confidence_fraction(self) -> Optional[float]:
        """Confidence as 0–1 fraction."""
        if self.confidence is None:
            return None
        return self.confidence / 100.0


class Standing(BaseModel):
    """A team's ladder position at a given point in the season."""
    rank: Optional[int] = None
    name: str                          # API uses 'name' not 'team'
    id: Optional[int] = None
    year: Optional[int] = None
    round: Optional[int] = None

    wins: int = 0
    losses: int = 0
    draws: int = 0
    played: int = 0

    percentage: Optional[float] = None
    pts: Optional[int] = None

    # Points for/against (API uses 'for' and 'against')
    goals_for: Optional[int] = None
    goals_against: Optional[int] = None
    behinds_for: Optional[int] = None
    behinds_against: Optional[int] = None

    model_config = {"populate_by_name": True, "extra": "allow"}


class GamePrediction(BaseModel):
    """
    Aggregated prediction for a single game.
    Combines consensus from multiple models.
    """
    game: Game
    predicted_winner: str
    predicted_loser: str
    consensus_confidence: float        # 0–100
    avg_predicted_margin: float        # Positive = home team favoured
    model_count: int                   # How many models voted
    home_vote_pct: float               # % of models that picked home team

    @property
    def is_close_game(self) -> bool:
        """Flag games where models strongly disagree (confidence < 60%)."""
        return self.consensus_confidence < 60.0


class ValueBet(BaseModel):
    """A game where our model probability exceeds the bookmaker's implied probability."""
    game: Game
    prediction: GamePrediction
    bet_team: str                      # The team we recommend betting on
    our_probability: float             # Our estimated win probability (0–1)
    bookmaker_odds: float              # Decimal odds offered
    implied_probability: float         # 1 / bookmaker_odds
    edge: float                        # our_probability - implied_probability
    kelly_fraction: float              # Recommended bet size (Kelly Criterion)

    @property
    def is_value(self) -> bool:
        return self.edge > 0

    @property
    def recommendation_strength(self) -> str:
        if self.edge >= 0.10:
            return "STRONG"
        elif self.edge >= 0.05:
            return "MODERATE"
        elif self.edge > 0:
            return "MARGINAL"
        return "NO VALUE"
