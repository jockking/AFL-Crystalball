# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

AFL weekly betting predictor that pulls data from the [Squiggle API](https://api.squiggle.com.au/) — aggregates predictions from 28+ AFL models into a weighted consensus, calculates betting value against bookmaker odds, and surfaces weekly betting recommendations.

## Setup

```bash
# First time only — create venv and install Python deps
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt

# Frontend deps
cd frontend && npm install && cd ..
```

## Running

```bash
# Start everything with one command
./start.sh
```

The script starts both servers, waits for the backend to be healthy, then opens:
- Frontend → http://localhost:5173
- Backend API → http://localhost:8000

Press `Ctrl+C` to stop both.

## Manual startup (if needed)

```bash
# Backend — must be run from inside backend/
source venv/bin/activate
cd backend && uvicorn api.main:app --reload --port 8000

# Frontend
cd frontend && npm run dev
```

## CLI commands (run from backend/)

```bash
cd backend && source ../venv/bin/activate

python -m src tips                          # Current round predictions
python -m src tips --round 5 --year 2025   # Specific round
python -m src value --round 5 --bankroll 500
python -m src form
python -m src h2h "Richmond" "Collingwood"
python -m src models
python -m src standings
python -m src cache clear
```

## Structure

```
start.sh                    # Single command to start everything
venv/                       # Python virtualenv (gitignored)

backend/
├── requirements.txt
├── src/                    # Python core (CLI + library)
│   ├── api/client.py       # Squiggle API wrapper (caching, User-Agent, retries)
│   ├── models/schemas.py   # Pydantic models: Game, Tip, Source, Standing, ValueBet
│   ├── analysis/
│   │   ├── aggregator.py   # Weighted consensus from multiple model tips
│   │   ├── form.py         # Recent form & H2H from game history
│   │   └── value.py        # Kelly Criterion value bet calculator
│   └── cli.py              # Typer CLI with Rich terminal output
├── api/                    # FastAPI (proxies Squiggle for the React frontend)
│   ├── main.py             # App + CORS setup
│   └── routers/
│       ├── games.py        # GET /api/games, /api/games/current-round
│       ├── tips.py         # GET /api/tips/predictions, /api/tips/value
│       ├── standings.py    # GET /api/standings
│       ├── form.py         # GET /api/form, /api/form/h2h
│       └── sources.py      # GET /api/sources
└── data/cache/             # 6-hour JSON response cache

frontend/                   # React + TypeScript + Tailwind + Recharts
└── src/
    ├── api.ts              # All API calls + TypeScript types
    ├── pages/
    │   ├── Dashboard.tsx   # Overview: predictions, top 8, form radar
    │   ├── Predictions.tsx # Weekly tips + past round results (round selector)
    │   ├── ValueBets.tsx   # Odds input, edge calc, Kelly stake sizing
    │   ├── FormGuide.tsx   # Team form table + charts
    │   ├── Standings.tsx   # AFL ladder with percentage chart
    │   └── Models.tsx      # Model accuracy leaderboard
    └── components/         # Layout, Card, ConfidenceBar, RoundSelector, Spinner
```

**Data flow:** Browser → FastAPI (`backend/api/`) → `SquiggleClient` (with cache) → Pydantic schemas → aggregation → JSON → React + Recharts.

**Why FastAPI proxy?** Browsers cannot set a custom `User-Agent` header, which Squiggle requires. The backend also handles caching and aggregation.

## Key Design Decisions

**Squiggle API user-agent:** The API bans requests with default HTTP client user-agents. The `USER_AGENT` constant in `client.py` must remain a descriptive string — do not remove it.

**Model weighting:** Each prediction model is weighted by its historical accuracy (`Source.accuracy`). Models with no accuracy data get a 0.50 baseline. Weights are normalised to sum to 1. This logic lives in `aggregator.py:build_source_weights`.

**Kelly Criterion:** Uses 25% fractional Kelly by default (`kelly_multiplier=0.25`) to reduce variance. The `confidence_to_probability` function in `value.py` applies a 10% regression toward 50% to prevent over-confidence from model consensus.

**Cache TTL:** API responses are cached for 6 hours in `data/cache/` (MD5-keyed JSON files). Use `--no-cache` flag to force fresh data. Live game data changes rapidly — clear cache if checking scores mid-round.

## Squiggle API Reference

Base URL: `https://api.squiggle.com.au/?q=<type>&<params>`

| Query | Key params | Returns |
|---|---|---|
| `games` | `year`, `round`, `game`, `complete` | Fixtures and results |
| `tips` | `year`, `round`, `game`, `source` | Model predictions |
| `sources` | — | All models + accuracy stats |
| `standings` | `year`, `round` | AFL ladder |
| `teams` | — | Team metadata |
| `ladder` | `year`, `round`, `source` | Predicted final ladders |
