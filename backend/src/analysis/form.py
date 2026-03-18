"""
Form and Head-to-Head analysis from historical game data.

Computes:
  - Recent form (last N games: wins, losses, avg margin)
  - Head-to-head record between two teams
  - Home/away win rates
"""

from __future__ import annotations
from dataclasses import dataclass

from src.models.schemas import Game


@dataclass
class TeamForm:
    team: str
    games_analysed: int
    wins: int
    losses: int
    draws: int
    avg_margin: float          # Positive = winning by this avg margin
    win_streak: int            # Positive = wins, negative = losses
    avg_score_for: float
    avg_score_against: float

    @property
    def win_rate(self) -> float:
        if self.games_analysed == 0:
            return 0.0
        return self.wins / self.games_analysed

    @property
    def form_string(self) -> str:
        """E.g. 'WWLWW' — most recent last."""
        return f"{self.wins}W-{self.losses}L"


@dataclass
class H2HRecord:
    team_a: str
    team_b: str
    games_played: int
    team_a_wins: int
    team_b_wins: int
    draws: int
    avg_margin: float          # Positive = team_a leads

    @property
    def team_a_win_rate(self) -> float:
        if self.games_played == 0:
            return 0.5
        return self.team_a_wins / self.games_played


def parse_games(raw_games: list[dict]) -> list[Game]:
    """Parse raw API game dicts into Game objects, filtering to completed games."""
    games = [Game(**g) for g in raw_games]
    return [g for g in games if g.is_complete]


def get_team_form(team: str, all_games: list[Game], last_n: int = 5) -> TeamForm:
    """
    Compute recent form for a team from the last N completed games.
    """
    # Get all completed games involving this team, sorted most recent first
    team_games = [
        g for g in all_games
        if g.hteam and g.ateam and (g.hteam == team or g.ateam == team) and g.is_complete
    ]
    team_games.sort(key=lambda g: (g.year, g.round), reverse=True)
    recent = team_games[:last_n]

    if not recent:
        return TeamForm(
            team=team, games_analysed=0, wins=0, losses=0, draws=0,
            avg_margin=0.0, win_streak=0, avg_score_for=0.0, avg_score_against=0.0
        )

    wins = losses = draws = 0
    margins: list[float] = []
    scores_for: list[int] = []
    scores_against: list[int] = []

    for g in recent:
        is_home = g.hteam == team
        team_score = g.hscore if is_home else g.ascore
        opp_score = g.ascore if is_home else g.hscore

        if team_score is None or opp_score is None:
            continue

        margin = team_score - opp_score
        margins.append(margin)
        scores_for.append(team_score)
        scores_against.append(opp_score)

        if margin > 0:
            wins += 1
        elif margin < 0:
            losses += 1
        else:
            draws += 1

    # Current streak (positive = consecutive wins, negative = losses)
    streak = 0
    for g in recent:
        is_home = g.hteam == team
        team_score = g.hscore if is_home else g.ascore
        opp_score = g.ascore if is_home else g.hscore
        if team_score is None or opp_score is None:
            break
        diff = team_score - opp_score
        if streak == 0:
            streak = 1 if diff > 0 else -1
        elif streak > 0 and diff > 0:
            streak += 1
        elif streak < 0 and diff < 0:
            streak -= 1
        else:
            break

    return TeamForm(
        team=team,
        games_analysed=len(recent),
        wins=wins,
        losses=losses,
        draws=draws,
        avg_margin=sum(margins) / len(margins) if margins else 0.0,
        win_streak=streak,
        avg_score_for=sum(scores_for) / len(scores_for) if scores_for else 0.0,
        avg_score_against=sum(scores_against) / len(scores_against) if scores_against else 0.0,
    )


def get_h2h(team_a: str, team_b: str, all_games: list[Game], last_n: int = 10) -> H2HRecord:
    """
    Compute head-to-head record between two teams from the last N meetings.
    """
    h2h_games = [
        g for g in all_games
        if g.hteam and g.ateam and {g.hteam, g.ateam} == {team_a, team_b} and g.is_complete
    ]
    h2h_games.sort(key=lambda g: (g.year, g.round), reverse=True)
    recent = h2h_games[:last_n]

    if not recent:
        return H2HRecord(
            team_a=team_a, team_b=team_b, games_played=0,
            team_a_wins=0, team_b_wins=0, draws=0, avg_margin=0.0
        )

    a_wins = b_wins = draws = 0
    margins: list[float] = []

    for g in recent:
        is_a_home = g.hteam == team_a
        a_score = g.hscore if is_a_home else g.ascore
        b_score = g.ascore if is_a_home else g.hscore

        if a_score is None or b_score is None:
            continue

        margin = a_score - b_score
        margins.append(margin)

        if margin > 0:
            a_wins += 1
        elif margin < 0:
            b_wins += 1
        else:
            draws += 1

    return H2HRecord(
        team_a=team_a,
        team_b=team_b,
        games_played=len(recent),
        team_a_wins=a_wins,
        team_b_wins=b_wins,
        draws=draws,
        avg_margin=sum(margins) / len(margins) if margins else 0.0,
    )


def get_home_away_stats(team: str, all_games: list[Game]) -> dict:
    """
    Compute home and away win rates for a team across all historical data.
    """
    home_games = [g for g in all_games if g.hteam == team and g.is_complete]
    away_games = [g for g in all_games if g.ateam == team and g.is_complete]

    def win_rate(games: list[Game], is_home: bool) -> float:
        if not games:
            return 0.0
        wins = sum(
            1 for g in games
            if ((g.hscore or 0) > (g.ascore or 0) if is_home
                else (g.ascore or 0) > (g.hscore or 0))
        )
        return wins / len(games)

    return {
        "home_games": len(home_games),
        "home_win_rate": win_rate(home_games, is_home=True),
        "away_games": len(away_games),
        "away_win_rate": win_rate(away_games, is_home=False),
    }
