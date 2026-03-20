from fastapi import APIRouter
from src.api.client import SquiggleClient
from src.models.schemas import Source
from src.analysis.aggregator import (
    build_source_weights,
    ELITE_MIN_ACCURACY,
    ELITE_TOP_N,
)

router = APIRouter()


def _tier(accuracy: float | None) -> str:
    """Classify a model into a performance tier."""
    if accuracy is None:
        return "Unknown"
    if accuracy >= 0.68:
        return "Elite"
    if accuracy >= 0.64:
        return "Strong"
    if accuracy >= 0.60:
        return "Average"
    return "Poor"


@router.get("/")
def get_sources():
    """All prediction models ranked by accuracy with tier, bits, and consensus weight."""
    client = SquiggleClient()
    raw = client.get_sources()

    sources = [Source(**s) for s in raw]
    sources.sort(key=lambda s: s.accuracy or 0, reverse=True)

    # Compute consensus weights using the same logic as the aggregator
    weights = build_source_weights(raw)

    # Mark top-N elite models
    elite_ids: set[int] = set()
    eligible = sorted(
        [(s.id, s.accuracy) for s in sources if s.id is not None and s.accuracy is not None and s.accuracy >= ELITE_MIN_ACCURACY],
        key=lambda x: x[1],
        reverse=True,
    )
    for src_id, _ in eligible[:ELITE_TOP_N]:
        elite_ids.add(src_id)

    return {
        "sources": [
            {
                "id":          s.id,
                "name":        s.name,
                "url":         s.url,
                "correct":     s.correct,
                "incorrect":   s.incorrect,
                "total":       (s.correct or 0) + (s.incorrect or 0),
                "accuracy":    round(s.accuracy * 100, 1) if s.accuracy is not None else None,
                "bits":        round(s.bits, 3) if s.bits is not None else None,
                "tier":        _tier(s.accuracy),
                "is_elite":    s.id in elite_ids,
                # Percentage of total consensus weight this model holds
                "weight_pct":  round(weights.get(s.id, 0) * 100, 2) if s.id is not None else 0.0,
            }
            for s in sources
        ]
    }
