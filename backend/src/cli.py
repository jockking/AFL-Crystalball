"""
AFL Squiggle Predictor — CLI entry point.

Usage:
    python -m src.cli tips [--round N] [--year N]
    python -m src.cli value [--round N] [--year N] [--bankroll N]
    python -m src.cli form [--year N] [--last N]
    python -m src.cli models
    python -m src.cli standings [--year N] [--round N]
    python -m src.cli cache clear
"""

from __future__ import annotations
import sys
from datetime import datetime
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.prompt import FloatPrompt
from rich import box
from rich.text import Text

from src.api.client import SquiggleClient, SquiggleAPIError
from src.analysis.aggregator import aggregate_tips_for_round, predictions_to_dataframe
from src.analysis.form import parse_games, get_team_form, get_h2h
from src.analysis.value import evaluate_value, rank_value_bets, stake_recommendation
from src.models.schemas import Standing, Source

app = typer.Typer(
    name="afl",
    help="AFL Weekly Predictor powered by the Squiggle API",
    no_args_is_help=True,
)
console = Console()
CURRENT_YEAR = datetime.now().year


def get_client(no_cache: bool = False) -> SquiggleClient:
    return SquiggleClient(use_cache=not no_cache)


# ---------------------------------------------------------------------------
# tips command
# ---------------------------------------------------------------------------

@app.command()
def tips(
    year: int = typer.Option(CURRENT_YEAR, "--year", "-y", help="Season year"),
    round: Optional[int] = typer.Option(None, "--round", "-r", help="Round number (default: current round)"),
    no_cache: bool = typer.Option(False, "--no-cache", help="Bypass cache and fetch fresh data"),
):
    """Show consensus predictions for a round."""
    client = get_client(no_cache)

    with console.status("[bold green]Fetching data from Squiggle API..."):
        try:
            if round is None:
                round = client.get_current_round(year)
            raw_games = client.get_games(year=year, round=round)
            raw_tips = client.get_tips(year=year, round=round)
            raw_sources = client.get_sources()
        except SquiggleAPIError as e:
            console.print(f"[bold red]API Error:[/bold red] {e}")
            raise typer.Exit(1)

    if not raw_games:
        console.print(f"[yellow]No games found for {year} Round {round}.[/yellow]")
        raise typer.Exit(0)

    predictions = aggregate_tips_for_round(raw_games, raw_tips, raw_sources)

    if not predictions:
        console.print(f"[yellow]No model tips available for {year} Round {round} yet.[/yellow]")
        raise typer.Exit(0)

    console.print()
    console.print(Panel(
        f"[bold cyan]Round {round} — {year} Predictions[/bold cyan]\n"
        f"[dim]Aggregated from {predictions[0].model_count if predictions else 0}+ models, weighted by accuracy[/dim]",
        expand=False,
    ))

    table = Table(box=box.ROUNDED, show_header=True, header_style="bold magenta")
    table.add_column("Game", style="white", no_wrap=True)
    table.add_column("Date", style="dim", no_wrap=True)
    table.add_column("Venue", style="dim")
    table.add_column("Predicted Winner", style="bold")
    table.add_column("Conf %", justify="right")
    table.add_column("Avg Margin", justify="right")
    table.add_column("Models", justify="right", style="dim")

    for p in predictions:
        game = p.game
        date_str = game.date[:10] if game.date else "TBA"
        venue_str = (game.venue or "TBA")[:25]

        # Colour confidence
        conf = p.consensus_confidence
        if conf >= 75:
            conf_style = "bold green"
        elif conf >= 60:
            conf_style = "yellow"
        else:
            conf_style = "red"

        conf_text = Text(f"{conf:.0f}%", style=conf_style)

        margin = p.avg_predicted_margin
        margin_str = f"+{abs(margin):.1f} ({game.hteam if margin > 0 else game.ateam})"

        winner_text = Text(p.predicted_winner)
        if p.predicted_winner == game.hteam:
            winner_text.stylize("bold cyan")
        else:
            winner_text.stylize("bold yellow")

        table.add_row(
            f"{game.hteam} v {game.ateam}",
            date_str,
            venue_str,
            winner_text,
            conf_text,
            margin_str,
            str(p.model_count),
        )

    console.print(table)
    console.print(f"\n[dim]Tip: Run [bold]afl value --round {round}[/bold] to find value bets.[/dim]")


# ---------------------------------------------------------------------------
# value command
# ---------------------------------------------------------------------------

@app.command()
def value(
    year: int = typer.Option(CURRENT_YEAR, "--year", "-y", help="Season year"),
    round: Optional[int] = typer.Option(None, "--round", "-r", help="Round number (default: current round)"),
    bankroll: float = typer.Option(1000.0, "--bankroll", "-b", help="Your total betting bankroll ($)"),
    no_cache: bool = typer.Option(False, "--no-cache", help="Bypass cache"),
):
    """Find value bets by comparing model predictions to bookmaker odds."""
    client = get_client(no_cache)

    with console.status("[bold green]Fetching predictions..."):
        try:
            if round is None:
                round = client.get_current_round(year)
            raw_games = client.get_games(year=year, round=round)
            raw_tips = client.get_tips(year=year, round=round)
            raw_sources = client.get_sources()
        except SquiggleAPIError as e:
            console.print(f"[bold red]API Error:[/bold red] {e}")
            raise typer.Exit(1)

    predictions = aggregate_tips_for_round(raw_games, raw_tips, raw_sources)

    if not predictions:
        console.print(f"[yellow]No predictions available for {year} Round {round}.[/yellow]")
        raise typer.Exit(0)

    console.print()
    console.print(Panel(
        f"[bold cyan]Round {round} — {year} Value Bet Finder[/bold cyan]\n"
        f"[dim]Bankroll: ${bankroll:,.2f} | Enter bookmaker odds for each game[/dim]",
        expand=False,
    ))

    value_bets = []
    for p in predictions:
        game = p.game
        console.print(f"\n[bold]{game.hteam}[/bold] vs [bold]{game.ateam}[/bold]  "
                      f"[dim](Model tips {p.predicted_winner} @ {p.consensus_confidence:.0f}% conf)[/dim]")

        try:
            home_odds = FloatPrompt.ask(f"  Odds for {game.hteam} (decimal, e.g. 1.85) [skip=0]",
                                        default=0.0)
            away_odds = FloatPrompt.ask(f"  Odds for {game.ateam} (decimal, e.g. 2.10) [skip=0]",
                                        default=0.0)
        except (KeyboardInterrupt, EOFError):
            console.print("\n[yellow]Skipped remaining games.[/yellow]")
            break

        if home_odds > 1.0 and away_odds > 1.0:
            vb = evaluate_value(p, home_odds, away_odds)
            value_bets.append(vb)

    ranked = rank_value_bets(value_bets)

    console.print()
    if not ranked:
        console.print(Panel("[yellow]No value bets found this round. The market looks efficient![/yellow]",
                            title="Result", expand=False))
        return

    console.print(Panel(
        f"[bold green]Found {len(ranked)} value bet(s)[/bold green]",
        expand=False,
    ))

    table = Table(box=box.ROUNDED, header_style="bold magenta")
    table.add_column("Bet On", style="bold")
    table.add_column("Game")
    table.add_column("Our Prob %", justify="right")
    table.add_column("Odds", justify="right")
    table.add_column("Edge %", justify="right")
    table.add_column("Strength")
    table.add_column(f"Stake (${bankroll:,.0f})", justify="right", style="bold green")

    for vb in ranked:
        edge_pct = vb.edge * 100
        stake = stake_recommendation(vb.kelly_fraction, bankroll)
        strength = vb.recommendation_strength

        strength_colour = {"STRONG": "bold green", "MODERATE": "green",
                           "MARGINAL": "yellow"}.get(strength, "white")

        table.add_row(
            vb.bet_team,
            f"{vb.game.hteam} v {vb.game.ateam}",
            f"{vb.our_probability * 100:.1f}%",
            f"${vb.bookmaker_odds:.2f}",
            f"+{edge_pct:.1f}%",
            Text(strength, style=strength_colour),
            f"${stake:.2f}",
        )

    console.print(table)
    console.print("\n[dim italic]Stake sizes use 25% fractional Kelly Criterion. Gamble responsibly.[/dim italic]")


# ---------------------------------------------------------------------------
# form command
# ---------------------------------------------------------------------------

@app.command()
def form(
    year: int = typer.Option(CURRENT_YEAR, "--year", "-y", help="Season year"),
    last: int = typer.Option(5, "--last", "-n", help="Number of recent games to analyse"),
    team: Optional[str] = typer.Option(None, "--team", "-t", help="Filter to specific team"),
    no_cache: bool = typer.Option(False, "--no-cache"),
):
    """Show recent form for all (or a specific) team."""
    client = get_client(no_cache)

    with console.status("[bold green]Fetching game history..."):
        try:
            raw_games = client.get_games(year=year)
        except SquiggleAPIError as e:
            console.print(f"[bold red]API Error:[/bold red] {e}")
            raise typer.Exit(1)

    all_games = parse_games(raw_games)

    # Get unique teams
    teams = sorted({g.hteam for g in all_games} | {g.ateam for g in all_games})
    if team:
        teams = [t for t in teams if team.lower() in t.lower()]
        if not teams:
            console.print(f"[red]No team found matching '{team}'[/red]")
            raise typer.Exit(1)

    console.print()
    console.print(Panel(
        f"[bold cyan]Team Form — {year} (Last {last} games)[/bold cyan]",
        expand=False,
    ))

    table = Table(box=box.ROUNDED, header_style="bold magenta")
    table.add_column("Team", style="bold")
    table.add_column("W-L", justify="center")
    table.add_column("Win %", justify="right")
    table.add_column("Avg Margin", justify="right")
    table.add_column("Avg Score", justify="right")
    table.add_column("Streak")

    for t in teams:
        tf = get_team_form(t, all_games, last_n=last)
        if tf.games_analysed == 0:
            continue

        win_pct = tf.win_rate * 100
        margin = tf.avg_margin
        streak = tf.win_streak

        margin_colour = "green" if margin > 0 else "red"
        streak_str = (f"[green]{streak}W[/green]" if streak > 0
                      else f"[red]{abs(streak)}L[/red]")

        table.add_row(
            t,
            f"{tf.wins}-{tf.losses}",
            f"{win_pct:.0f}%",
            Text(f"{margin:+.1f}", style=margin_colour),
            f"{tf.avg_score_for:.0f}–{tf.avg_score_against:.0f}",
            streak_str,
        )

    console.print(table)


# ---------------------------------------------------------------------------
# h2h command
# ---------------------------------------------------------------------------

@app.command()
def h2h(
    team_a: str = typer.Argument(..., help="First team name"),
    team_b: str = typer.Argument(..., help="Second team name"),
    year: int = typer.Option(CURRENT_YEAR, "--year", "-y"),
    last: int = typer.Option(10, "--last", "-n", help="Last N meetings"),
    no_cache: bool = typer.Option(False, "--no-cache"),
):
    """Show head-to-head record between two teams."""
    client = get_client(no_cache)

    with console.status("[bold green]Fetching game history..."):
        try:
            raw_games = client.get_games(year=year)
            # Also get prior years for H2H history
            prior_games = client.get_games(year=year - 1) + client.get_games(year=year - 2)
        except SquiggleAPIError as e:
            console.print(f"[bold red]API Error:[/bold red] {e}")
            raise typer.Exit(1)

    all_games = parse_games(raw_games + prior_games)
    record = get_h2h(team_a, team_b, all_games, last_n=last)

    console.print()
    console.print(Panel(
        f"[bold cyan]Head-to-Head: {team_a} vs {team_b}[/bold cyan]\n"
        f"[dim]Last {record.games_played} meetings[/dim]",
        expand=False,
    ))

    table = Table(box=box.SIMPLE, show_header=False)
    table.add_column(style="bold", justify="right")
    table.add_column(justify="left")

    a_wins_style = "bold green" if record.team_a_wins > record.team_b_wins else "white"
    b_wins_style = "bold green" if record.team_b_wins > record.team_a_wins else "white"

    table.add_row(f"{team_a} wins", Text(str(record.team_a_wins), style=a_wins_style))
    table.add_row(f"{team_b} wins", Text(str(record.team_b_wins), style=b_wins_style))
    table.add_row("Draws", str(record.draws))
    margin = record.avg_margin
    leader = team_a if margin > 0 else team_b
    table.add_row("Avg margin", f"{abs(margin):.1f} pts to {leader}")

    console.print(table)


# ---------------------------------------------------------------------------
# models command
# ---------------------------------------------------------------------------

@app.command()
def models(
    no_cache: bool = typer.Option(False, "--no-cache"),
):
    """Show all prediction models and their accuracy rankings."""
    client = get_client(no_cache)

    with console.status("[bold green]Fetching model data..."):
        try:
            raw_sources = client.get_sources()
        except SquiggleAPIError as e:
            console.print(f"[bold red]API Error:[/bold red] {e}")
            raise typer.Exit(1)

    sources = [Source(**s) for s in raw_sources]
    # Sort by accuracy desc, then name
    sources.sort(key=lambda s: (s.accuracy or 0), reverse=True)

    console.print()
    console.print(Panel("[bold cyan]Prediction Models — Accuracy Leaderboard[/bold cyan]", expand=False))

    table = Table(box=box.ROUNDED, header_style="bold magenta")
    table.add_column("Rank", justify="right", style="dim")
    table.add_column("Model", style="bold")
    table.add_column("Correct", justify="right")
    table.add_column("Incorrect", justify="right")
    table.add_column("Accuracy %", justify="right")

    for i, src in enumerate(sources, 1):
        acc = src.accuracy
        acc_str = f"{acc * 100:.1f}%" if acc is not None else "N/A"
        acc_style = "green" if acc and acc >= 0.65 else ("yellow" if acc and acc >= 0.60 else "white")

        table.add_row(
            str(i),
            src.name,
            str(src.correct or "—"),
            str(src.incorrect or "—"),
            Text(acc_str, style=acc_style),
        )

    console.print(table)


# ---------------------------------------------------------------------------
# standings command
# ---------------------------------------------------------------------------

@app.command()
def standings(
    year: int = typer.Option(CURRENT_YEAR, "--year", "-y"),
    round: Optional[int] = typer.Option(None, "--round", "-r"),
    no_cache: bool = typer.Option(False, "--no-cache"),
):
    """Show the current AFL ladder."""
    client = get_client(no_cache)

    with console.status("[bold green]Fetching standings..."):
        try:
            if round is None:
                round = client.get_current_round(year)
            raw = client.get_standings(year=year, round=round)
        except SquiggleAPIError as e:
            console.print(f"[bold red]API Error:[/bold red] {e}")
            raise typer.Exit(1)

    if not raw:
        console.print("[yellow]No standings data available.[/yellow]")
        raise typer.Exit(0)

    items = sorted([Standing(**s) for s in raw], key=lambda s: (s.rank or 999))

    console.print()
    console.print(Panel(
        f"[bold cyan]AFL Ladder — {year} After Round {round}[/bold cyan]",
        expand=False,
    ))

    table = Table(box=box.ROUNDED, header_style="bold magenta")
    table.add_column("Pos", justify="right", style="dim")
    table.add_column("Team", style="bold")
    table.add_column("W", justify="right")
    table.add_column("L", justify="right")
    table.add_column("D", justify="right")
    table.add_column("Pts", justify="right")
    table.add_column("%", justify="right")

    for i, s in enumerate(items, 1):
        style = "bold cyan" if i <= 8 else "white"  # Top 8 = finals
        pct = f"{s.percentage:.1f}" if s.percentage else "—"
        table.add_row(
            str(i),
            Text(s.name, style=style),
            str(s.wins),
            str(s.losses),
            str(s.draws),
            str(s.pts or "—"),
            pct,
        )

    console.print(table)
    console.print("[dim]Top 8 (cyan) qualify for finals.[/dim]")


# ---------------------------------------------------------------------------
# cache command
# ---------------------------------------------------------------------------

cache_app = typer.Typer(help="Manage cached API data")
app.add_typer(cache_app, name="cache")


@cache_app.command("clear")
def cache_clear():
    """Delete all cached API responses."""
    client = SquiggleClient()
    deleted = client.clear_cache()
    console.print(f"[green]Cleared {deleted} cached file(s).[/green]")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    app()


if __name__ == "__main__":
    main()
