from fastapi import APIRouter
from src.api.client import SquiggleClient
from src.models.schemas import Source

router = APIRouter()


@router.get("/")
def get_sources():
    """All prediction models ranked by accuracy."""
    client = SquiggleClient()
    raw = client.get_sources()
    sources = [Source(**s) for s in raw]
    sources.sort(key=lambda s: s.accuracy or 0, reverse=True)
    return {
        "sources": [
            {
                "id":        s.id,
                "name":      s.name,
                "url":       s.url,
                "correct":   s.correct,
                "incorrect": s.incorrect,
                "accuracy":  round(s.accuracy * 100, 1) if s.accuracy else None,
            }
            for s in sources
        ]
    }
