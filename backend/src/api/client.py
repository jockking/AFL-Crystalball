"""
Squiggle API client with caching and rate-limit awareness.

API docs: https://api.squiggle.com.au/
The API requires a descriptive User-Agent header to avoid bans.
"""

import json
import time
import hashlib
from pathlib import Path
from datetime import datetime, timedelta
from typing import Any

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE_URL = "https://api.squiggle.com.au/"
CACHE_DIR = Path(__file__).parent.parent.parent / "data" / "cache"
CACHE_TTL_HOURS = 6  # Cache API responses for 6 hours
USER_AGENT = "AFL-Squiggle-Predictor/1.0 (personal betting tool)"


class SquiggleAPIError(Exception):
    pass


class SquiggleClient:
    """
    Thin wrapper around the Squiggle API.

    Usage:
        client = SquiggleClient()
        games = client.get_games(year=2025, round=5)
        tips  = client.get_tips(year=2025, round=5)
    """

    def __init__(self, cache_ttl_hours: int = CACHE_TTL_HOURS, use_cache: bool = True):
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})
        self.cache_ttl = timedelta(hours=cache_ttl_hours)
        self.use_cache = use_cache
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

        # Retry up to 3 times on connection/timeout errors with exponential backoff
        retry = Retry(
            total=3,
            backoff_factor=2,          # waits 2s, 4s, 8s between retries
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET"],
        )
        adapter = HTTPAdapter(max_retries=retry)
        self.session.mount("https://", adapter)

    # ------------------------------------------------------------------
    # Public query methods
    # ------------------------------------------------------------------

    def get_games(self, year: int | None = None, round: int | None = None,
                  game_id: int | None = None, complete: int | None = None) -> list[dict]:
        """Return game fixtures/results. Omit year/round for all games."""
        params: dict[str, Any] = {"q": "games"}
        if year is not None:
            params["year"] = year
        if round is not None:
            params["round"] = round
        if game_id is not None:
            params["game"] = game_id
        if complete is not None:
            params["complete"] = complete
        return self._query(params).get("games", [])

    def get_tips(self, year: int | None = None, round: int | None = None,
                 game_id: int | None = None, source_id: int | None = None) -> list[dict]:
        """Return model tips/predictions for games."""
        params: dict[str, Any] = {"q": "tips"}
        if year is not None:
            params["year"] = year
        if round is not None:
            params["round"] = round
        if game_id is not None:
            params["game"] = game_id
        if source_id is not None:
            params["source"] = source_id
        return self._query(params).get("tips", [])

    def get_sources(self) -> list[dict]:
        """Return all prediction models and their metadata."""
        return self._query({"q": "sources"}).get("sources", [])

    def get_standings(self, year: int | None = None, round: int | None = None) -> list[dict]:
        """Return AFL ladder standings."""
        params: dict[str, Any] = {"q": "standings"}
        if year is not None:
            params["year"] = year
        if round is not None:
            params["round"] = round
        return self._query(params).get("standings", [])

    def get_teams(self) -> list[dict]:
        """Return all AFL team info."""
        return self._query({"q": "teams"}).get("teams", [])

    def get_ladder(self, year: int | None = None, round: int | None = None,
                   source_id: int | None = None) -> list[dict]:
        """Return predicted end-of-season ladders from models."""
        params: dict[str, Any] = {"q": "ladder"}
        if year is not None:
            params["year"] = year
        if round is not None:
            params["round"] = round
        if source_id is not None:
            params["source"] = source_id
        return self._query(params).get("ladder", [])

    def get_current_round(self, year: int) -> int:
        """
        Infer the current/upcoming round from game data.
        Returns the round of the next incomplete game, or the latest round.
        """
        games = self.get_games(year=year)
        if not games:
            return 1

        # Find the first incomplete game (complete < 100)
        incomplete = [g for g in games if g.get("complete", 0) < 100]
        if incomplete:
            return int(incomplete[0]["round"])

        # All done — return the last round
        return max(int(g["round"]) for g in games)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _query(self, params: dict[str, Any]) -> dict:
        cache_key = self._cache_key(params)
        cached = self._load_cache(cache_key)
        if cached is not None:
            return cached

        # Small polite delay between requests
        time.sleep(0.5)

        try:
            resp = self.session.get(BASE_URL, params=params, timeout=45)
            resp.raise_for_status()
        except requests.RequestException as e:
            raise SquiggleAPIError(f"API request failed: {e}") from e

        data = resp.json()

        if "error" in data:
            raise SquiggleAPIError(f"API error: {data['error']} — {data.get('warning', '')}")

        self._save_cache(cache_key, data)
        return data

    def _cache_key(self, params: dict) -> str:
        raw = json.dumps(params, sort_keys=True)
        return hashlib.md5(raw.encode()).hexdigest()

    def _cache_path(self, key: str) -> Path:
        return CACHE_DIR / f"{key}.json"

    def _load_cache(self, key: str) -> dict | None:
        if not self.use_cache:
            return None
        path = self._cache_path(key)
        if not path.exists():
            return None
        try:
            payload = json.loads(path.read_text())
            saved_at = datetime.fromisoformat(payload["_cached_at"])
            if datetime.now() - saved_at < self.cache_ttl:
                return payload["data"]
        except (KeyError, ValueError, json.JSONDecodeError):
            pass
        return None

    def _save_cache(self, key: str, data: dict) -> None:
        if not self.use_cache:
            return
        path = self._cache_path(key)
        payload = {"_cached_at": datetime.now().isoformat(), "data": data}
        path.write_text(json.dumps(payload, indent=2))

    def clear_cache(self) -> int:
        """Delete all cached files. Returns count deleted."""
        deleted = 0
        for f in CACHE_DIR.glob("*.json"):
            f.unlink()
            deleted += 1
        return deleted
