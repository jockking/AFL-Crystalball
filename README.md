# AFL Crystalball

> AFL weekly betting predictor — aggregates 28+ model predictions from the [Squiggle API](https://api.squiggle.com.au/) into a weighted consensus, calculates betting value using Kelly Criterion, and surfaces round-by-round recommendations with full historical navigation.

![AFL Crystalball Dashboard](https://img.shields.io/badge/AFL-Crystalball-amber?style=flat-square)
![Python](https://img.shields.io/badge/Python-3.11+-blue?style=flat-square&logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green?style=flat-square&logo=fastapi)
![React](https://img.shields.io/badge/React-18+-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5+-blue?style=flat-square&logo=typescript)

---

## Features

- **Consensus predictions** — accuracy-weighted aggregation across 28+ AFL prediction models
- **Time travel** — navigate back through any past round to review results vs predictions, or forward to see model forecasts for upcoming games
- **Historical accuracy** — per-round correct/incorrect breakdown with accuracy percentage
- **Form context** — hot/cold streak badges and recent win/loss/margin stats on upcoming matchups
- **Value bet calculator** — Kelly Criterion stake sizing with bookmaker odds input
- **Team form guide** — win rate, average margin, streaks across the full season
- **AFL ladder** — live standings with percentage chart
- **Model leaderboard** — compare prediction accuracy across all 28+ Squiggle models
- **6-hour cache** — avoids hammering the Squiggle API; force-refresh with `--no-cache`

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/jockking/AFL-Crystalball.git
cd AFL-Crystalball

# 2. Create Python venv and install dependencies
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt

# 3. Install frontend dependencies
cd frontend && npm install && cd ..

# 4. Start everything
./start.sh
```

The start script launches both servers, waits for the backend to be healthy, then opens:
- **Frontend** → http://localhost:5173
- **Backend API** → http://localhost:8000

Press `Ctrl+C` to stop both.

---

## CLI Usage

```bash
cd backend && source ../venv/bin/activate

python -m src tips                           # Current round predictions
python -m src tips --round 5 --year 2025    # Specific round
python -m src value --round 5 --bankroll 500
python -m src form
python -m src h2h "Richmond" "Collingwood"
python -m src models
python -m src standings
python -m src cache clear
```

---

## Project Structure

```
AFL-Crystalball/
├── start.sh                    # Single command to start everything
│
├── backend/
│   ├── requirements.txt
│   ├── src/                    # Python core (CLI + library)
│   │   ├── api/client.py       # Squiggle API wrapper (caching, retries)
│   │   ├── models/schemas.py   # Pydantic models: Game, Tip, Source, Standing, ValueBet
│   │   ├── analysis/
│   │   │   ├── aggregator.py   # Weighted consensus from 28+ model tips
│   │   │   ├── form.py         # Recent form & H2H from game history
│   │   │   └── value.py        # Kelly Criterion value bet calculator
│   │   └── cli.py              # Typer CLI with Rich terminal output
│   └── api/                    # FastAPI — proxies Squiggle for the React frontend
│       ├── main.py             # App + CORS setup
│       └── routers/
│           ├── games.py        # GET /api/games, /api/games/current-round
│           ├── tips.py         # GET /api/tips/predictions, /api/tips/value
│           ├── standings.py    # GET /api/standings
│           ├── form.py         # GET /api/form, /api/form/h2h
│           └── sources.py      # GET /api/sources
│
└── frontend/                   # React + TypeScript + Tailwind + Recharts
    └── src/
        ├── api.ts              # All API calls + TypeScript types
        ├── pages/
        │   ├── Dashboard.tsx   # Overview with round navigation
        │   ├── Predictions.tsx # Weekly tips + past round results
        │   ├── ValueBets.tsx   # Odds input, edge calc, Kelly stake sizing
        │   ├── FormGuide.tsx   # Team form table + charts
        │   ├── Standings.tsx   # AFL ladder with percentage chart
        │   └── Models.tsx      # Model accuracy leaderboard
        └── components/         # Layout, Card, ConfidenceBar, RoundSelector, Spinner
```

---

## How It Works

### Data Flow

```
Browser → FastAPI (backend/api/) → SquiggleClient (6h cache) → Squiggle API
                                ↓
                    Pydantic schemas → aggregation → JSON → React + Recharts
```

> **Why a FastAPI proxy?** Browsers can't set a custom `User-Agent` header, which the Squiggle API requires to identify callers. The backend also handles caching and aggregation.

### Model Weighting

Each of the 28+ Squiggle prediction models is weighted by its historical accuracy (`Source.accuracy`). Models with no accuracy data get a 0.50 baseline weight. Weights are normalised to sum to 1 — so a model with 65% historical accuracy has more influence over the consensus than one sitting at 52%.

### Kelly Criterion

Uses **25% fractional Kelly** by default to reduce variance. The `confidence_to_probability` function applies a 10% regression toward 50% to prevent over-confidence from model consensus — so a 90% model consensus translates to a more conservative bet size.

### Round Navigation

The Dashboard lets you navigate to any round:
- **Past rounds** — shows actual results, score lines, and ✓/✗ accuracy per game
- **Current round** — live model consensus as games are played
- **Future rounds** — forward predictions using model consensus enriched with recent team form (win/loss streaks, average margin)

---

## Tech Stack

| Layer | Tech |
|---|---|
| Data source | [Squiggle API](https://api.squiggle.com.au/) |
| Backend | Python 3.11, FastAPI, Pydantic v2 |
| CLI | Typer + Rich |
| Data analysis | pandas |
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS |
| Charts | Recharts |
| State / fetching | TanStack Query |

---

## API Reference

The FastAPI backend exposes these endpoints:

| Endpoint | Description |
|---|---|
| `GET /api/games` | Fixtures and results for a round |
| `GET /api/games/current-round` | Detect the current AFL round |
| `GET /api/tips/predictions` | Aggregated consensus predictions |
| `GET /api/tips/value` | Predictions + form + H2H context |
| `GET /api/standings` | AFL ladder |
| `GET /api/form` | Team form (last N games) |
| `GET /api/form/h2h` | Head-to-head record between two teams |
| `GET /api/sources` | All Squiggle models + accuracy stats |

All endpoints accept `year` and `round` query params.

---

## Squiggle API

This project uses the [Squiggle API](https://api.squiggle.com.au/) — a free, community-maintained aggregator of AFL prediction models. Please be a good citizen: don't hammer it, and keep the `User-Agent` header set to something descriptive (see `backend/src/api/client.py`).

---

## License

MIT
